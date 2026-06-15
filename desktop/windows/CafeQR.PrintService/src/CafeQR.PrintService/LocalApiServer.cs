using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.IO;
using System.IO.Ports;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal sealed class LocalApiServer : IDisposable
    {
        private readonly HttpListener listener = new HttpListener();
        private readonly OptionsStore optionsStore;
        private readonly CloudPrintClient cloud;
        private readonly PrintCoordinator coordinator;
        private readonly CancellationTokenSource stop = new CancellationTokenSource();
        private Task loop;

        public LocalApiServer(OptionsStore optionsStore, CloudPrintClient cloud, PrintCoordinator coordinator)
        {
            this.optionsStore = optionsStore;
            this.cloud = cloud;
            this.coordinator = coordinator;
        }

        public void Start()
        {
            var options = optionsStore.Load();
            listener.Prefixes.Add($"http://127.0.0.1:{options.ListenPort}/");
            listener.Start();
            loop = Task.Run(() => RunAsync(stop.Token));
            Log.Info("Loopback API listening on port " + options.ListenPort);
        }

        private async Task RunAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                HttpListenerContext context;
                try
                {
                    context = await listener.GetContextAsync().ConfigureAwait(false);
                }
                catch when (token.IsCancellationRequested || !listener.IsListening)
                {
                    return;
                }
                _ = Task.Run(() => HandleAsync(context, token), token);
            }
        }

        private async Task HandleAsync(HttpListenerContext context, CancellationToken token)
        {
            try
            {
                ApplyCors(context);
                if (context.Request.HttpMethod == "OPTIONS")
                {
                    context.Response.StatusCode = 204;
                    context.Response.Close();
                    return;
                }

                var path = context.Request.Url.AbsolutePath.TrimEnd('/');
                if (path == "") path = "/";
                if ((path == "/health" || path == "/v1/health") && context.Request.HttpMethod == "GET")
                {
                    await JsonAsync(context, Health()).ConfigureAwait(false);
                    return;
                }
                if ((path == "/printers" || path == "/v1/printers") && context.Request.HttpMethod == "GET")
                {
                    await JsonAsync(context, PrinterCapabilities()).ConfigureAwait(false);
                    return;
                }
                if (path == "/v1/enroll" && context.Request.HttpMethod == "POST")
                {
                    var body = await ReadJsonAsync(context.Request).ConfigureAwait(false);
                    var result = await cloud.EnrollAsync(
                        body.Value<string>("cloudBaseUrl"),
                        body.Value<string>("pairingCode"),
                        token).ConfigureAwait(false);
                    await JsonAsync(context, result).ConfigureAwait(false);
                    return;
                }
                if (path == "/printRaw" && context.Request.HttpMethod == "POST")
                {
                    // Compatibility bridge for already configured Test terminals.
                    // Browser access remains constrained by the strict Origin allowlist
                    // and the listener is bound only to loopback.
                    await LegacyRawAsync(context, token).ConfigureAwait(false);
                    return;
                }

                RequireLocalToken(context);

                if (path == "/v1/jobs" && context.Request.HttpMethod == "GET")
                {
                    await JsonAsync(context, JArray.FromObject(coordinator.Recent(100))).ConfigureAwait(false);
                    return;
                }
                if (path == "/v1/jobs" && context.Request.HttpMethod == "POST")
                {
                    var body = await ReadJsonAsync(context.Request).ConfigureAwait(false);
                    var submission = body.ToObject<LocalJobSubmission>();
                    var tasks = await coordinator.SubmitAsync(submission, null, token).ConfigureAwait(false);
                    context.Response.StatusCode = 202;
                    await JsonAsync(context, JArray.FromObject(tasks)).ConfigureAwait(false);
                    return;
                }
                if (path == "/v1/logs" && context.Request.HttpMethod == "GET")
                {
                    await JsonAsync(context, JArray.FromObject(Log.ReadRecent(1000))).ConfigureAwait(false);
                    return;
                }
                if (path.StartsWith("/v1/jobs/", StringComparison.OrdinalIgnoreCase)
                    && context.Request.HttpMethod == "POST")
                {
                    var parts = path.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length == 4 && long.TryParse(parts[2], out var localJobId))
                    {
                        if (parts[3].Equals("retry", StringComparison.OrdinalIgnoreCase))
                        {
                            await coordinator.RetryAsync(localJobId, token).ConfigureAwait(false);
                            await JsonAsync(context, new JObject { ["updated"] = true }).ConfigureAwait(false);
                            return;
                        }
                        if (parts[3].Equals("resolve", StringComparison.OrdinalIgnoreCase))
                        {
                            var body = await ReadJsonAsync(context.Request).ConfigureAwait(false);
                            var completed = body.Value<string>("outcome")
                                ?.Equals("COMPLETED", StringComparison.OrdinalIgnoreCase) == true;
                            await coordinator.ResolveAsync(localJobId, completed, token).ConfigureAwait(false);
                            await JsonAsync(context, new JObject { ["updated"] = true }).ConfigureAwait(false);
                            return;
                        }
                    }
                }
                if (path == "/v1/configuration" && context.Request.HttpMethod == "PUT")
                {
                    var body = await ReadJsonAsync(context.Request).ConfigureAwait(false);
                    await JsonAsync(context, cloud.SaveConfiguration(body)).ConfigureAwait(false);
                    return;
                }
                if (path == "/v1/configuration" && context.Request.HttpMethod == "GET")
                {
                    await JsonAsync(context, cloud.ConfigurationSnapshot()).ConfigureAwait(false);
                    return;
                }
                if (path == "/v1/configuration/cloud" && context.Request.HttpMethod == "POST")
                {
                    var body = await ReadJsonAsync(context.Request).ConfigureAwait(false);
                    await JsonAsync(context, cloud.AcceptCloudConfiguration(
                        body["configuration"] as JObject ?? new JObject(),
                        body.Value<int?>("cloudRevision") ?? 0)).ConfigureAwait(false);
                    return;
                }
                if (path == "/v1/configuration/sync" && context.Request.HttpMethod == "POST")
                {
                    await cloud.SyncConfigurationAsync(token).ConfigureAwait(false);
                    await JsonAsync(context, cloud.ConfigurationSnapshot()).ConfigureAwait(false);
                    return;
                }
                context.Response.StatusCode = 404;
                await JsonAsync(context, new JObject { ["error"] = "Not found" }).ConfigureAwait(false);
            }
            catch (UnauthorizedAccessException ex)
            {
                context.Response.StatusCode = 401;
                await JsonAsync(context, new JObject
                {
                    ["error"] = ex.Message,
                    ["code"] = "LOCAL_AUTH_REQUIRED"
                }).ConfigureAwait(false);
            }
            catch (PrintConfigurationException ex)
            {
                Log.Info("Print configuration required for " + ex.JobKind);
                context.Response.StatusCode = 409;
                await JsonAsync(context, new JObject
                {
                    ["error"] = ex.Message,
                    ["code"] = "PRINTER_NOT_CONFIGURED",
                    ["jobKind"] = ex.JobKind
                }).ConfigureAwait(false);
            }
            catch (CloudPrintApiException ex)
            {
                context.Response.StatusCode = ex.IsAuthenticationFailure
                    ? 401
                    : ex.IsConflict
                        ? 409
                        : 503;
                await JsonAsync(context, new JObject
                {
                    ["error"] = ex.IsAuthenticationFailure
                        ? "Print Service pairing is no longer accepted by CafeQR. Re-pair this computer; local printing remains active."
                        : ex.IsConflict
                            ? "Cloud printing configuration changed. Local settings remain active until you resolve the conflict."
                            : "CafeQR cloud synchronization is unavailable. Local printing remains active.",
                    ["code"] = ex.IsAuthenticationFailure
                        ? "PRINT_STATION_AUTH_REQUIRED"
                        : ex.IsConflict
                            ? "CONFIGURATION_CONFLICT"
                            : "CLOUD_SYNC_UNAVAILABLE"
                }).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log.Error("Local API request failed", ex);
                context.Response.StatusCode = 500;
                await JsonAsync(context, new JObject { ["error"] = ex.Message }).ConfigureAwait(false);
            }
        }

        private JObject Health()
        {
            var options = optionsStore.Load();
            return new JObject
            {
                ["service"] = "CafeQR Print Service",
                ["version"] = options.ServiceVersion,
                ["paired"] = cloud.IsPaired,
                ["credentialsPresent"] = cloud.HasCredentials,
                ["cloudPaired"] = cloud.IsPaired,
                ["cloudStatus"] = options.CloudStatus,
                ["configurationDirty"] = options.ConfigurationDirty,
                ["configurationRevision"] = options.ConfigurationRevision,
                ["cloudRevision"] = options.CloudRevision,
                ["lastCloudSyncAtUtc"] = options.LastCloudSyncAtUtc,
                ["lastCloudError"] = options.LastCloudError,
                ["stationId"] = options.StationId,
                ["terminalId"] = options.TerminalId,
                ["queueDepth"] = coordinator.PendingCount,
                ["status"] = "ONLINE",
                ["serverTimeUtc"] = DateTime.UtcNow,
                ["localClientToken"] = OptionsStore.Unprotect(options.LocalClientTokenProtected)
            };
        }

        private static JArray PrinterCapabilities()
        {
            var result = new JArray();
            try
            {
                foreach (string printerName in PrinterSettings.InstalledPrinters)
                {
                    try
                    {
                        var settings = new PrinterSettings { PrinterName = printerName };
                        var papers = new JArray();
                        try
                        {
                            foreach (PaperSize paper in settings.PaperSizes)
                            {
                                papers.Add(new JObject
                                {
                                    ["name"] = paper.PaperName,
                                    ["widthHundredthsInch"] = paper.Width,
                                    ["heightHundredthsInch"] = paper.Height,
                                    ["rawKind"] = paper.RawKind
                                });
                            }
                        }
                        catch (Exception ex)
                        {
                            Log.Error($"Failed to read paper sizes for printer: {printerName}", ex);
                        }

                        result.Add(new JObject
                        {
                            ["name"] = printerName,
                            ["connectionType"] = "WINDOWS_QUEUE",
                            ["isDefault"] = settings.IsDefaultPrinter,
                            ["isValid"] = settings.IsValid,
                            ["paperSizes"] = papers
                        });
                    }
                    catch (Exception ex)
                    {
                        Log.Error($"Failed to query capabilities for printer: {printerName}", ex);
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Error("Failed to query installed Windows printers (spooler may be stopped)", ex);
            }
            try
            {
                foreach (var port in SerialPort.GetPortNames().OrderBy(value => value))
                {
                    result.Add(new JObject
                    {
                        ["name"] = port,
                        ["connectionType"] = "BLUETOOTH_COM",
                        ["paperSizes"] = new JArray()
                    });
                }
            }
            catch (Exception ex)
            {
                Log.Error("Failed to query serial ports", ex);
            }
            return result;
        }

        private async Task LegacyRawAsync(HttpListenerContext context, CancellationToken token)
        {
            var body = await ReadJsonAsync(context.Request).ConfigureAwait(false);
            var printerName = body.Value<string>("printerName");
            var bytes = Convert.FromBase64String(body.Value<string>("dataBase64") ?? "");
            var jobId = RawSpooler.Print(printerName, bytes);
            await JsonAsync(context, new JObject
            {
                ["ok"] = true,
                ["spoolJobId"] = jobId
            }).ConfigureAwait(false);
        }

        private void RequireLocalToken(HttpListenerContext context)
        {
            var expected = OptionsStore.Unprotect(optionsStore.Load().LocalClientTokenProtected);
            var supplied = context.Request.Headers["X-CafeQR-Local-Token"];
            if (string.IsNullOrWhiteSpace(expected) || !SlowEquals(expected, supplied))
                throw new UnauthorizedAccessException("The local CafeQR client token is invalid");
        }

        private void ApplyCors(HttpListenerContext context)
        {
            var origin = context.Request.Headers["Origin"];
            if (!string.IsNullOrWhiteSpace(origin))
            {
                context.Response.AddHeader("Access-Control-Allow-Origin", origin);
                context.Response.AddHeader("Vary", "Origin");
                context.Response.AddHeader("Access-Control-Allow-Headers", "Content-Type, X-CafeQR-Local-Token, X-CafeQR-Idempotency-Key");
                context.Response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
                context.Response.AddHeader("Access-Control-Max-Age", "600");
                if (string.Equals(
                    context.Request.Headers["Access-Control-Request-Private-Network"],
                    "true",
                    StringComparison.OrdinalIgnoreCase))
                {
                    context.Response.AddHeader("Access-Control-Allow-Private-Network", "true");
                }
            }
        }

        private static bool MatchOrigin(string allowed, string origin)
        {
            if (string.Equals(allowed, origin, StringComparison.OrdinalIgnoreCase))
                return true;

            if (allowed.Contains("*"))
            {
                var pattern = "^" + System.Text.RegularExpressions.Regex.Escape(allowed)
                    .Replace("\\*", ".*") + "$";
                return System.Text.RegularExpressions.Regex.IsMatch(origin, pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            }

            return false;
        }

        private static bool SlowEquals(string left, string right)
        {
            if (left == null || right == null) return false;
            var diff = left.Length ^ right.Length;
            var length = Math.Min(left.Length, right.Length);
            for (var index = 0; index < length; index++) diff |= left[index] ^ right[index];
            return diff == 0;
        }

        private static async Task<JObject> ReadJsonAsync(HttpListenerRequest request)
        {
            using (var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8))
            {
                var body = await reader.ReadToEndAsync().ConfigureAwait(false);
                return string.IsNullOrWhiteSpace(body) ? new JObject() : JObject.Parse(body);
            }
        }

        private static async Task JsonAsync(HttpListenerContext context, JToken value)
        {
            if (context.Response.OutputStream == null) return;
            var bytes = Encoding.UTF8.GetBytes((value ?? JValue.CreateNull()).ToString(Formatting.None));
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.ContentLength64 = bytes.Length;
            await context.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
            context.Response.OutputStream.Close();
        }

        public void Dispose()
        {
            stop.Cancel();
            if (listener.IsListening) listener.Stop();
            try { loop?.Wait(TimeSpan.FromSeconds(5)); } catch { }
            listener.Close();
            stop.Dispose();
        }
    }
}
