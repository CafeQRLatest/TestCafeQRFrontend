using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal sealed class PrintCoordinator : IDisposable
    {
        private readonly DurableStore store;
        private readonly CloudPrintClient cloud;
        private readonly OptionsStore optionsStore;
        private readonly RoutingEngine routing = new RoutingEngine();
        private readonly DocumentRenderer renderer = new DocumentRenderer();
        private readonly ConcurrentDictionary<string, SemaphoreSlim> printerLocks =
            new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.OrdinalIgnoreCase);
        private readonly CancellationTokenSource stop = new CancellationTokenSource();
        private Task loop;
        private DateTime lastHeartbeatUtc = DateTime.MinValue;
        private DateTime nextCloudAttemptUtc = DateTime.MinValue;
        private int cloudFailures;

        public PrintCoordinator(DurableStore store, CloudPrintClient cloud, OptionsStore optionsStore)
        {
            this.store = store;
            this.cloud = cloud;
            this.optionsStore = optionsStore;
        }

        public void Start()
        {
            loop = Task.Run(() => RunAsync(stop.Token));
        }

        public async Task<IReadOnlyList<LocalPrintTask>> SubmitAsync(
            LocalJobSubmission submission,
            CloudPrintJob cloudJob,
            CancellationToken token)
        {
            if (string.IsNullOrWhiteSpace(submission.IdempotencyKey))
                submission.IdempotencyKey = cloudJob?.Id ?? Guid.NewGuid().ToString("N");
            var options = optionsStore.Load();
            if (cloudJob != null && submission.Document == null)
                submission.Document = cloudJob.Payload ?? new JObject();
            var targets = routing.Resolve(submission, options.EffectiveConfiguration);
            var groupId = cloudJob?.Id ?? Guid.NewGuid().ToString("N");
            var tasks = store.Enqueue(groupId, cloudJob, submission, targets);
            if (cloudJob != null && tasks.Count > 0)
            {
                await cloud.ReportAsync(tasks[0], "LOCAL_QUEUED", "Persisted in the local print queue", null, false, token)
                    .ConfigureAwait(false);
            }
            return tasks;
        }

        public IReadOnlyList<LocalPrintTask> Recent(int limit) => store.Recent(limit);
        public int PendingCount => store.CountPending();

        public async Task RetryAsync(long id, CancellationToken token)
        {
            var task = store.Recent(500).FirstOrDefault(value => value.Id == id)
                ?? throw new InvalidOperationException("Local print job was not found");
            store.Mark(id, "RETRY_WAIT", "Operator requested retry", null, DateTime.UtcNow);
            await ReportGroupAsync(task.GroupId, token).ConfigureAwait(false);
        }

        public async Task ResolveAsync(long id, bool completed, CancellationToken token)
        {
            var task = store.Recent(500).FirstOrDefault(value => value.Id == id)
                ?? throw new InvalidOperationException("Local print job was not found");
            store.Mark(id, completed ? "COMPLETED" : "CANCELLED",
                completed ? "Operator confirmed physical output" : "Operator cancelled ambiguous output");
            await ReportGroupAsync(task.GroupId, token).ConfigureAwait(false);
        }

        private async Task RunAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                await RunCloudCycleAsync(token).ConfigureAwait(false);

                try
                {
                    var ready = store.GetReady(20);
                    var running = ready.Select(task => ProcessAsync(task, token)).ToArray();
                    if (running.Length > 0) await Task.WhenAll(running).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    Log.Error("Print coordinator cycle failed", ex);
                }

                try
                {
                    await Task.Delay(1500, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }

        private async Task RunCloudCycleAsync(CancellationToken token)
        {
            if (!cloud.IsPaired || DateTime.UtcNow < nextCloudAttemptUtc) return;
            try
            {
                await cloud.SyncConfigurationAsync(token).ConfigureAwait(false);
                var claimed = await cloud.ClaimAsync(10, token).ConfigureAwait(false);
                foreach (var job in claimed)
                {
                    try
                    {
                        await SubmitAsync(new LocalJobSubmission
                        {
                            IdempotencyKey = "cloud:" + job.Id,
                            JobKind = job.JobKind,
                            Document = job.Payload,
                            Metadata = job.Payload
                        }, job, token).ConfigureAwait(false);
                    }
                    catch (Exception jobEx)
                    {
                        Log.Error($"Failed to process claimed cloud job {job.Id}", jobEx);
                        try
                        {
                            var mockTask = new LocalPrintTask
                            {
                                CloudJobId = job.Id,
                                LeaseToken = job.LeaseToken,
                                ProfileId = "N/A"
                            };
                            await cloud.ReportAsync(mockTask, "FAILED", jobEx.Message, "SUBMISSION_FAILED", false, token).ConfigureAwait(false);
                        }
                        catch (Exception reportEx)
                        {
                            Log.Error($"Failed to report failure status for job {job.Id}", reportEx);
                        }
                    }
                }
                if ((DateTime.UtcNow - lastHeartbeatUtc) > TimeSpan.FromSeconds(20))
                {
                    await cloud.HeartbeatAsync(PendingCount, token).ConfigureAwait(false);
                    lastHeartbeatUtc = DateTime.UtcNow;
                }
                cloudFailures = 0;
                nextCloudAttemptUtc = DateTime.MinValue;
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                cloudFailures++;
                var seconds = Math.Min(60, 5 * Math.Pow(2, Math.Min(cloudFailures - 1, 4)));
                nextCloudAttemptUtc = DateTime.UtcNow.AddSeconds(seconds);
                Log.Error("CafeQR cloud cycle failed; local printing remains active", ex);
            }
        }

        private async Task ProcessAsync(LocalPrintTask task, CancellationToken token)
        {
            var options = optionsStore.Load();
            var profiles = routing.Profiles(options.EffectiveConfiguration);
            var profile = profiles.FirstOrDefault(value =>
                value.Id.Equals(task.ProfileId, StringComparison.OrdinalIgnoreCase));
            if (profile == null)
            {
                store.Mark(task.Id, "FAILED", "Printer profile no longer exists");
                await ReportGroupAsync(task.GroupId, token).ConfigureAwait(false);
                return;
            }

            if (task.Mode.Equals(PrintConstants.Failover, StringComparison.OrdinalIgnoreCase))
            {
                var group = store.GetGroup(task.GroupId);
                if (group.Any(value => value.TargetIndex < task.TargetIndex && IsSuccessful(value.Status)))
                {
                    store.Mark(task.Id, "CANCELLED", "An earlier failover target printed successfully");
                    return;
                }
                if (group.Any(value => value.TargetIndex < task.TargetIndex
                    && value.Status != "FAILED"
                    && value.Status != "CANCELLED"
                    && value.Status != "HELD_AMBIGUOUS"))
                {
                    return;
                }
            }

            var gate = printerLocks.GetOrAdd(profile.Id, _ => new SemaphoreSlim(1, 1));
            if (!await gate.WaitAsync(0, token).ConfigureAwait(false)) return;
            try
            {
                store.Mark(task.Id, "PRINTING");
                task.Attempts++;
                await cloud.ReportAsync(task, "SPOOLING", "Dispatching to " + profile.Name, null, false, token)
                    .ConfigureAwait(false);

                byte[] thermal = null;
                PrintDocument regular = null;
                if (profile.Format.Equals(PrintConstants.Regular, StringComparison.OrdinalIgnoreCase))
                {
                    regular = renderer.Regular(task.Submission, profile, task.Attempts);
                }
                else if (IsKotWindowsQueue(task, profile))
                {
                    Log.Info($"[PrintCoordinator] rendererPath=WINDOWS_QUEUE_GDI_KOT jobKind={task.JobKind} profileId={profile.Id} connectionType={profile.ConnectionType}");
                    regular = renderer.WindowsQueueKot(task.Submission, profile, task.Attempts, options.EffectiveConfiguration);
                }
                else
                {
                    if (task.JobKind.Equals("kot", StringComparison.OrdinalIgnoreCase))
                    {
                        Log.Info($"[PrintCoordinator] rendererPath=RAW_ESCPOS_KOT jobKind={task.JobKind} profileId={profile.Id} connectionType={profile.ConnectionType}");
                    }
                    thermal = renderer.Thermal(task.Submission, profile, task.Attempts, options.EffectiveConfiguration);
                }

                PrintResult result;
                using (regular)
                {
                    result = await PrinterAdapterFactory.Create(profile)
                        .PrintAsync(task, profile, thermal, regular, token)
                        .ConfigureAwait(false);
                }
                if (!result.Accepted) throw new InvalidOperationException(result.Message ?? "Printer rejected the job");
                task.SpoolJobId = result.SpoolJobId;
                store.Mark(task.Id, result.CompletionStatus ?? "COMPLETED", result.Message, result.SpoolJobId);
                await ReportGroupAsync(task.GroupId, token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var kot = task.JobKind.Equals("kot", StringComparison.OrdinalIgnoreCase);
                var retry = task.Attempts < 8;
                if (retry)
                {
                    var delay = TimeSpan.FromSeconds(Math.Min(300, 5 * Math.Pow(2, Math.Min(task.Attempts, 5))));
                    store.Mark(task.Id, "RETRY_WAIT", ex.Message, null, DateTime.UtcNow.Add(delay));
                }
                else if (kot)
                {
                    store.Mark(task.Id, "FAILED", ex.Message);
                }
                else
                {
                    store.Mark(task.Id, "FAILED", ex.Message);
                }
                Log.Error("Print failed for local job " + task.Id, ex);
                await ReportGroupAsync(task.GroupId, token).ConfigureAwait(false);
            }
            finally
            {
                gate.Release();
            }
        }

        private static bool IsKotWindowsQueue(LocalPrintTask task, PrinterProfile profile)
        {
            return string.Equals(task.JobKind, "kot", StringComparison.OrdinalIgnoreCase)
                && (profile.ConnectionType ?? "WINDOWS_QUEUE").Equals("WINDOWS_QUEUE", StringComparison.OrdinalIgnoreCase)
                && profile.Format.Equals(PrintConstants.Regular, StringComparison.OrdinalIgnoreCase);
        }

        private async Task ReportGroupAsync(string groupId, CancellationToken token)
        {
            var group = store.GetGroup(groupId);
            if (group.Count == 0 || string.IsNullOrWhiteSpace(group[0].CloudJobId)) return;
            var mirror = group[0].Mode.Equals(PrintConstants.Mirror, StringComparison.OrdinalIgnoreCase);
            var successful = group.Where(value => IsSuccessful(value.Status)).ToList();
            var held = group.FirstOrDefault(value => value.Status == "HELD_AMBIGUOUS");
            var active = group.Any(value => value.Status == "QUEUED"
                || value.Status == "RETRY_WAIT"
                || value.Status == "PRINTING");

            if (held != null)
            {
                await cloud.ReportAsync(held, "HELD_AMBIGUOUS", held.ErrorMessage, "AMBIGUOUS_OUTCOME", true, token)
                    .ConfigureAwait(false);
            }
            else if ((!mirror && successful.Count > 0) || (mirror && successful.Count == group.Count))
            {
                var representative = successful[0];
                var finalStatus = successful.Any(value => value.Status == "SPOOLED") ? "SPOOLED" : "COMPLETED";
                await cloud.ReportAsync(representative, finalStatus, representative.ErrorMessage, null, false, token)
                    .ConfigureAwait(false);
            }
            else if (!active && successful.Count == 0)
            {
                var failed = group.FirstOrDefault(value => value.Status == "FAILED") ?? group[0];
                await cloud.ReportAsync(failed, "FAILED", failed.ErrorMessage, "ALL_TARGETS_FAILED", false, token)
                    .ConfigureAwait(false);
            }
            else if (group.Any(value => value.Status == "RETRY_WAIT"))
            {
                await cloud.ReportAsync(group[0], "RETRY_WAIT", "Waiting to retry a printer target", "PRINTER_UNAVAILABLE", false, token)
                    .ConfigureAwait(false);
            }
        }

        private static bool IsSuccessful(string status) =>
            string.Equals(status, "SPOOLED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "COMPLETED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "PRINTED", StringComparison.OrdinalIgnoreCase);

        public void Dispose()
        {
            stop.Cancel();
            try { loop?.Wait(TimeSpan.FromSeconds(10)); } catch { }
            foreach (var gate in printerLocks.Values) gate.Dispose();
            stop.Dispose();
        }
    }
}
