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

        public bool IsPaired => !string.IsNullOrWhiteSpace(OptionsStore.Unprotect(options.StationTokenProtected));

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
            options.CloudBaseUrl = enrollmentBaseUrl;
            options.StationTokenProtected = OptionsStore.Protect(stationToken);
            options.LocalClientTokenProtected = OptionsStore.Protect(RandomToken());
            options.StationId = response.Value<string>("id");
            options.TerminalId = response.Value<string>("terminalId");
            options.EffectiveConfiguration = response["configuration"] as JObject ?? new JObject();
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
                options.EffectiveConfiguration = configuration;
                optionsStore.Save(options);
            }
        }

        public Task ReportAsync(LocalPrintTask task, string status, string message, string failureCode,
            bool ambiguous, CancellationToken token)
        {
            if (!IsPaired || string.IsNullOrWhiteSpace(task.CloudJobId)) return Task.CompletedTask;
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
            return SendAsync(
                HttpMethod.Post,
                "/api/v1/public/print-stations/jobs/" + task.CloudJobId + "/status",
                payload,
                true,
                token);
        }

        public ServiceOptions Snapshot() => optionsStore.Load();

        public void SaveConfiguration(JObject configuration)
        {
            options = optionsStore.Load();
            options.EffectiveConfiguration = configuration ?? new JObject();
            optionsStore.Save(options);
        }

        private async Task<JToken> SendAsync(HttpMethod method, string path, JToken payload, bool authenticated,
            CancellationToken token, string baseUrlOverride = null)
        {
            options = optionsStore.Load();
            var baseUrl = string.IsNullOrWhiteSpace(baseUrlOverride)
                ? options.CloudBaseUrl
                : baseUrlOverride;
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
                        throw new InvalidOperationException("Cloud print API failed: " + (int)response.StatusCode + " " + body);
                    }
                    var root = string.IsNullOrWhiteSpace(body) ? new JObject() : JToken.Parse(body);
                    return root["data"] ?? root;
                }
            }
        }

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
