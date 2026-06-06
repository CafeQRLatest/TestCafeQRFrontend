using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

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
                var options = JsonConvert.DeserializeObject<ServiceOptions>(
                    File.ReadAllText(ServicePaths.Configuration, Encoding.UTF8)) ?? new ServiceOptions();
                options.ServiceVersion = BuildInfo.Version;
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
                    File.Replace(temporary, ServicePaths.Configuration, null);
                }
                else
                {
                    File.Move(temporary, ServicePaths.Configuration);
                }
            }
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
