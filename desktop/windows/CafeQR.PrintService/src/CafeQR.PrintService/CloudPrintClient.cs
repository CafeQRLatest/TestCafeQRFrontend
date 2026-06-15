using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal sealed class CloudPrintClient : IDisposable
    {
        private readonly HttpClient http;
        private readonly OptionsStore optionsStore;
        private ServiceOptions options;

        public CloudPrintClient(OptionsStore optionsStore)
        {
            this.optionsStore = optionsStore;
            options = optionsStore.Load();
            http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        }

        public bool HasCredentials =>
            !string.IsNullOrWhiteSpace(OptionsStore.Unprotect(optionsStore.Load().StationTokenProtected));

        public bool IsPaired
        {
            get
            {
                var snapshot = optionsStore.Load();
                return !string.IsNullOrWhiteSpace(OptionsStore.Unprotect(snapshot.StationTokenProtected));
            }
        }

        public bool ConfigurationDirty => optionsStore.Load().ConfigurationDirty;

        public async Task<JObject> EnrollAsync(string cloudBaseUrl, string pairingCode, CancellationToken token)
        {
            var enrollmentBaseUrl = NormalizeBaseUrl(cloudBaseUrl);
            var enrollmentOptions = optionsStore.Load();
            var payload = new JObject
            {
                ["pairingCode"] = pairingCode,
                ["machineName"] = Environment.MachineName,
                ["serviceVersion"] = enrollmentOptions.ServiceVersion,
                ["capabilities"] = Capabilities()
            };
            var response = (JObject)await SendAsync(
                    HttpMethod.Post,
                    "/api/v1/public/print-stations/enroll",
                    payload,
                    false,
                    token,
                    enrollmentBaseUrl)
                .ConfigureAwait(false);
            var stationToken = response.Value<string>("stationToken");
            if (string.IsNullOrWhiteSpace(stationToken))
                throw new InvalidOperationException("Enrollment response did not include a station token");

            options = optionsStore.Load();
            var existingConfiguration = options.EffectiveConfiguration?.DeepClone() as JObject ?? new JObject();
            var preserveLocalConfiguration = HasProfiles(existingConfiguration);
            var cloudConfiguration = response["configuration"] as JObject ?? new JObject();
            options.CloudBaseUrl = enrollmentBaseUrl;
            options.StationTokenProtected = OptionsStore.Protect(stationToken);
            options.LocalClientTokenProtected = OptionsStore.Protect(RandomToken());
            options.StationId = response.Value<string>("id");
            options.TerminalId = response.Value<string>("terminalId");
            options.CloudRevision = ReadCloudRevision(cloudConfiguration);
            if (preserveLocalConfiguration)
            {
                options.EffectiveConfiguration = existingConfiguration;
                options.ConfigurationDirty = true;
                options.CloudStatus = "SYNC_PENDING";
            }
            else
            {
                options.EffectiveConfiguration = StripMetadata(cloudConfiguration);
                options.ConfigurationRevision = Math.Max(1L, options.ConfigurationRevision);
                options.ConfigurationDirty = false;
                options.CloudStatus = "SYNCED";
                options.LastCloudSyncAtUtc = DateTime.UtcNow;
            }
            options.LastCloudError = null;
            optionsStore.Save(options);

            response["localClientToken"] = OptionsStore.Unprotect(options.LocalClientTokenProtected);
            return response;
        }

        public async Task<IReadOnlyList<CloudPrintJob>> ClaimAsync(int limit, CancellationToken token)
        {
            if (!IsPaired) return Array.Empty<CloudPrintJob>();
            var response = await SendAsync(
                HttpMethod.Post,
                "/api/v1/public/print-stations/jobs/claim?limit=" + Math.Max(1, Math.Min(limit, 20)),
                null,
                true,
                token).ConfigureAwait(false);
            return (response as JArray ?? new JArray()).ToObject<List<CloudPrintJob>>();
        }

        public async Task HeartbeatAsync(int queueDepth, CancellationToken token)
        {
            if (!IsPaired) return;
            var payload = new JObject
            {
                ["serviceVersion"] = options.ServiceVersion,
                ["serviceStatus"] = "ONLINE",
                ["queueDepth"] = queueDepth,
                ["capabilities"] = Capabilities()
            };
            var response = await SendAsync(
                HttpMethod.Post,
                "/api/v1/public/print-stations/heartbeat",
                payload,
                true,
                token).ConfigureAwait(false);
            if (response["configuration"] is JObject configuration)
            {
                options = optionsStore.Load();
                options.CloudRevision = ReadCloudRevision(configuration);
                if (!options.ConfigurationDirty)
                {
                    options.EffectiveConfiguration = StripMetadata(configuration);
                    options.ConfigurationRevision = Math.Max(1L, options.ConfigurationRevision);
                    options.LastCloudSyncAtUtc = DateTime.UtcNow;
                    options.CloudStatus = "SYNCED";
                }
                else
                {
                    options.CloudStatus = "SYNC_PENDING";
                }
                options.LastCloudError = null;
                optionsStore.Save(options);
            }
        }

        public async Task SyncConfigurationAsync(CancellationToken token)
        {
            options = optionsStore.Load();
            if (!options.ConfigurationDirty || !IsPaired) return;
            var payload = new JObject
            {
                ["localRevision"] = options.ConfigurationRevision,
                ["cloudRevision"] = options.CloudRevision,
                ["settings"] = StripMetadata(options.EffectiveConfiguration)
            };
            var response = (JObject)await SendAsync(
                HttpMethod.Put,
                "/api/v1/public/print-stations/configuration",
                payload,
                true,
                token).ConfigureAwait(false);

            options = optionsStore.Load();
            options.EffectiveConfiguration = StripMetadata(response);
            options.CloudRevision = ReadCloudRevision(response);
            options.ConfigurationDirty = false;
            options.CloudStatus = "SYNCED";
            options.LastCloudSyncAtUtc = DateTime.UtcNow;
            options.LastCloudError = null;
            optionsStore.Save(options);
        }

        public async Task ReportAsync(LocalPrintTask task, string status, string message, string failureCode,
            bool ambiguous, CancellationToken token)
        {
            if (!IsPaired || string.IsNullOrWhiteSpace(task.CloudJobId)) return;
            var payload = new JObject
            {
                ["status"] = status,
                ["leaseToken"] = task.LeaseToken,
                ["spoolJobId"] = task.SpoolJobId,
                ["printerProfileId"] = task.ProfileId,
                ["routeId"] = task.RouteId,
                ["message"] = message,
                ["failureCode"] = failureCode,
                ["ambiguous"] = ambiguous
            };
            try
            {
                await SendAsync(
                    HttpMethod.Post,
                    "/api/v1/public/print-stations/jobs/" + task.CloudJobId + "/status",
                    payload,
                    true,
                    token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log.Error("Unable to report local print status to CafeQR cloud", ex);
            }
        }

        public ServiceOptions Snapshot() => optionsStore.Load();

        public JObject ConfigurationSnapshot()
        {
            options = optionsStore.Load();
            return new JObject
            {
                ["configuration"] = options.EffectiveConfiguration?.DeepClone() ?? new JObject(),
                ["localRevision"] = options.ConfigurationRevision,
                ["cloudRevision"] = options.CloudRevision,
                ["dirty"] = options.ConfigurationDirty,
                ["updatedAtUtc"] = options.ConfigurationUpdatedAtUtc,
                ["lastCloudSyncAtUtc"] = options.LastCloudSyncAtUtc,
                ["lastCloudError"] = options.LastCloudError,
                ["cloudStatus"] = options.CloudStatus
            };
        }

        public JObject SaveConfiguration(JObject configuration)
        {
            options = optionsStore.Load();
            options.EffectiveConfiguration = StripMetadata(configuration);
            options.ConfigurationRevision = Math.Max(1L, options.ConfigurationRevision + 1L);
            options.ConfigurationDirty = true;
            options.ConfigurationUpdatedAtUtc = DateTime.UtcNow;
            options.CloudStatus = HasCredentials ? "SYNC_PENDING" : "UNPAIRED";
            options.LastCloudError = null;
            optionsStore.Save(options);
            return ConfigurationSnapshot();
        }

        public JObject AcceptCloudConfiguration(JObject configuration, int cloudRevision)
        {
            options = optionsStore.Load();
            options.EffectiveConfiguration = StripMetadata(configuration);
            options.ConfigurationRevision = Math.Max(1L, options.ConfigurationRevision + 1L);
            options.CloudRevision = Math.Max(0, cloudRevision);
            options.ConfigurationDirty = false;
            options.ConfigurationUpdatedAtUtc = DateTime.UtcNow;
            options.LastCloudSyncAtUtc = DateTime.UtcNow;
            options.CloudStatus = HasCredentials ? "SYNCED" : "UNPAIRED";
            options.LastCloudError = null;
            optionsStore.Save(options);
            return ConfigurationSnapshot();
        }

        private async Task<JToken> SendAsync(HttpMethod method, string path, JToken payload, bool authenticated,
            CancellationToken token, string baseUrlOverride = null)
        {
            options = optionsStore.Load();
            var baseUrl = string.IsNullOrWhiteSpace(baseUrlOverride)
                ? options.CloudBaseUrl
                : baseUrlOverride;
            try
            {
                using (var request = new HttpRequestMessage(method, baseUrl.TrimEnd('/') + path))
                {
                    request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                    if (authenticated)
                    {
                        var stationToken = OptionsStore.Unprotect(options.StationTokenProtected);
                        if (string.IsNullOrWhiteSpace(stationToken))
                            throw new InvalidOperationException("Print station is not paired");
                        request.Headers.Add("X-CafeQR-Station-Token", stationToken);
                    }
                    if (payload != null)
                    {
                        request.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json");
                    }
                    using (var response = await http.SendAsync(request, token).ConfigureAwait(false))
                    {
                        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                        if (!response.IsSuccessStatusCode)
                        {
                            var failure = new CloudPrintApiException((int)response.StatusCode, body);
                            RecordCloudFailure(failure);
                            throw failure;
                        }
                        RecordCloudSuccess();
                        var root = string.IsNullOrWhiteSpace(body) ? new JObject() : JToken.Parse(body);
                        return root["data"] ?? root;
                    }
                }
            }
            catch (CloudPrintApiException)
            {
                throw;
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                RecordTransportFailure(ex);
                throw;
            }
        }

        private void RecordCloudSuccess()
        {
            options = optionsStore.Load();
            if (!options.ConfigurationDirty)
                options.CloudStatus = "SYNCED";
            else if (!string.Equals(options.CloudStatus, "SYNC_CONFLICT", StringComparison.OrdinalIgnoreCase))
                options.CloudStatus = "SYNC_PENDING";
            options.LastCloudError = null;
            optionsStore.Save(options);
        }

        private void RecordCloudFailure(CloudPrintApiException failure)
        {
            options = optionsStore.Load();
            options.LastCloudError = failure.Message;
            if (failure.IsAuthenticationFailure)
                options.CloudStatus = "AUTH_REQUIRED";
            else if (failure.IsConflict)
                options.CloudStatus = "SYNC_CONFLICT";
            else if (options.ConfigurationDirty)
                options.CloudStatus = "SYNC_PENDING";
            else
                options.CloudStatus = "OFFLINE";
            optionsStore.Save(options);
        }

        private void RecordTransportFailure(Exception failure)
        {
            options = optionsStore.Load();
            options.LastCloudError = failure.Message;
            options.CloudStatus = options.ConfigurationDirty ? "SYNC_PENDING" : "OFFLINE";
            optionsStore.Save(options);
        }

        private static bool HasProfiles(JObject configuration) =>
            configuration?["profiles"] is JArray profiles && profiles.Count > 0;

        private static JObject StripMetadata(JObject configuration)
        {
            var clean = configuration?.DeepClone() as JObject ?? new JObject();
            clean.Remove("_meta");
            return clean;
        }

        private static int ReadCloudRevision(JObject configuration) =>
            configuration?["_meta"]?["terminalRevision"]?.Value<int>() ?? 0;

        private static JObject Capabilities()
        {
            return new JObject
            {
                ["osVersion"] = Environment.OSVersion.VersionString,
                ["machineName"] = Environment.MachineName,
                ["framework"] = Environment.Version.ToString(),
                ["transports"] = new JArray("WINDOWS_QUEUE", "NETWORK", "BLUETOOTH_COM"),
                ["formats"] = new JArray("THERMAL", "REGULAR")
            };
        }

        private static string NormalizeBaseUrl(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException("CafeQR API URL is required");
            return value.Trim().TrimEnd('/');
        }

        private static string RandomToken()
        {
            var bytes = new byte[32];
            using (var random = System.Security.Cryptography.RandomNumberGenerator.Create())
            {
                random.GetBytes(bytes);
            }
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        public void Dispose() => http.Dispose();
    }
}
