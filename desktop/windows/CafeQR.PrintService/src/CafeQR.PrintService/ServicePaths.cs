using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal static class ServicePaths
    {
        public static readonly string Root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "CafeQR",
            "PrintService");

        public static readonly string Database = Path.Combine(Root, "queue.db");
        public static readonly string Configuration = Path.Combine(Root, "service.json");
        public static readonly string ConfigurationBackup = Path.Combine(Root, "service.json.bak");
        public static readonly string Logs = Path.Combine(Root, "logs");

        public static void Ensure()
        {
            Directory.CreateDirectory(Root);
            Directory.CreateDirectory(Logs);
        }
    }

    internal sealed class OptionsStore
    {
        private readonly object sync = new object();

        public ServiceOptions Load()
        {
            lock (sync)
            {
                ServicePaths.Ensure();
                if (!File.Exists(ServicePaths.Configuration))
                {
                    var created = new ServiceOptions();
                    Save(created);
                    return created;
                }
                ServiceOptions options;
                try
                {
                    options = Read(ServicePaths.Configuration);
                }
                catch
                {
                    if (!File.Exists(ServicePaths.ConfigurationBackup)) throw;
                    options = Read(ServicePaths.ConfigurationBackup);
                }
                var changed = Normalize(options);
                options.ServiceVersion = BuildInfo.Version;
                if (changed) Save(options);
                return options;
            }
        }

        public void Save(ServiceOptions options)
        {
            lock (sync)
            {
                ServicePaths.Ensure();
                var temporary = ServicePaths.Configuration + ".tmp";
                File.WriteAllText(temporary, JsonConvert.SerializeObject(options, Formatting.Indented), Encoding.UTF8);
                if (File.Exists(ServicePaths.Configuration))
                {
                    File.Replace(temporary, ServicePaths.Configuration, ServicePaths.ConfigurationBackup);
                }
                else
                {
                    File.Move(temporary, ServicePaths.Configuration);
                }
            }
        }

        private static ServiceOptions Read(string path) =>
            JsonConvert.DeserializeObject<ServiceOptions>(
                File.ReadAllText(path, Encoding.UTF8)) ?? new ServiceOptions();

        private static bool Normalize(ServiceOptions options)
        {
            var changed = false;
            if (options.EffectiveConfiguration == null)
            {
                options.EffectiveConfiguration = new JObject();
                changed = true;
            }
            if (options.AllowedOrigins == null)
            {
                options.AllowedOrigins = new System.Collections.Generic.List<string>();
                changed = true;
            }

            var uniqueOrigins = options.AllowedOrigins
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (uniqueOrigins.Count != options.AllowedOrigins.Count)
            {
                options.AllowedOrigins = uniqueOrigins;
                changed = true;
            }

            foreach (var requiredOrigin in ServiceOptions.RequiredAllowedOrigins)
            {
                if (options.AllowedOrigins.Any(origin =>
                    string.Equals(origin, requiredOrigin, StringComparison.OrdinalIgnoreCase)))
                    continue;
                options.AllowedOrigins.Add(requiredOrigin);
                changed = true;
            }
            if (options.ConfigurationStateVersion >= 1) return changed;

            var profiles = options.EffectiveConfiguration["profiles"] as JArray;
            var hasLocalConfiguration = profiles != null && profiles.Count > 0;
            options.ConfigurationStateVersion = 1;
            options.ConfigurationRevision = hasLocalConfiguration
                ? Math.Max(1L, options.ConfigurationRevision)
                : options.ConfigurationRevision;
            options.ConfigurationDirty = hasLocalConfiguration;
            options.ConfigurationUpdatedAtUtc = hasLocalConfiguration
                ? (options.ConfigurationUpdatedAtUtc ?? DateTime.UtcNow)
                : options.ConfigurationUpdatedAtUtc;
            options.CloudStatus = hasLocalConfiguration
                ? "SYNC_PENDING"
                : string.IsNullOrWhiteSpace(Unprotect(options.StationTokenProtected))
                    ? "UNPAIRED"
                    : "UNKNOWN";
            return true;
        }

        public static string Protect(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var clear = Encoding.UTF8.GetBytes(value);
            return Convert.ToBase64String(ProtectedData.Protect(
                clear,
                Encoding.UTF8.GetBytes("CafeQR.PrintService.v1"),
                DataProtectionScope.LocalMachine));
        }

        public static string Unprotect(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            try
            {
                var clear = ProtectedData.Unprotect(
                    Convert.FromBase64String(value),
                    Encoding.UTF8.GetBytes("CafeQR.PrintService.v1"),
                    DataProtectionScope.LocalMachine);
                return Encoding.UTF8.GetString(clear);
            }
            catch
            {
                return null;
            }
        }
    }
}
