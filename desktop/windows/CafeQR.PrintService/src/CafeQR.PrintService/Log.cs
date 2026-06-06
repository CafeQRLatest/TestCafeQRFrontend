using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace CafeQR.PrintService
{
    internal static class Log
    {
        private static readonly object Sync = new object();

        public static void Info(string message) => Write("INFO", message, null);
        public static void Warn(string message) => Write("WARN", message, null);
        public static void Error(string message, Exception error) => Write("ERROR", message, error);

        public static IReadOnlyList<string> ReadRecent(int maxLines)
        {
            try
            {
                ServicePaths.Ensure();
                var lines = Directory.GetFiles(ServicePaths.Logs, "*.log")
                    .OrderByDescending(path => path)
                    .Take(3)
                    .SelectMany(File.ReadAllLines)
                    .ToList();
                var count = Math.Max(1, Math.Min(maxLines, 2000));
                return lines.Skip(Math.Max(0, lines.Count - count)).ToList();
            }
            catch
            {
                return Array.Empty<string>();
            }
        }

        private static void Write(string level, string message, Exception error)
        {
            lock (Sync)
            {
                try
                {
                    ServicePaths.Ensure();
                    var path = Path.Combine(ServicePaths.Logs, DateTime.UtcNow.ToString("yyyy-MM-dd") + ".log");
                    var line = $"{DateTime.UtcNow:O} [{level}] {message}";
                    if (error != null) line += Environment.NewLine + error;
                    File.AppendAllText(path, line + Environment.NewLine, Encoding.UTF8);
                }
                catch
                {
                    // Logging must never terminate the print service.
                }
            }
        }
    }
}
