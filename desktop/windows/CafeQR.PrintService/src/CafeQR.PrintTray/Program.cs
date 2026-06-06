using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.ServiceProcess;
using System.Threading.Tasks;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintTray
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayContext());
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private readonly NotifyIcon icon;
        private readonly ToolStripMenuItem status;
        private readonly Timer timer;
        private readonly HttpClient http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };

        public TrayContext()
        {
            status = new ToolStripMenuItem("Checking CafeQR Print Service...") { Enabled = false };
            var menu = new ContextMenuStrip();
            menu.Items.Add(status);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Open diagnostics", null, (sender, args) => OpenUrl("http://127.0.0.1:3333/v1/health"));
            menu.Items.Add("Open logs", null, (sender, args) => OpenLogs());
            menu.Items.Add("Restart service", null, async (sender, args) => await RestartServiceAsync());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit tray", null, (sender, args) => ExitThread());

            icon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "CafeQR Print Service",
                ContextMenuStrip = menu,
                Visible = true
            };
            icon.DoubleClick += (sender, args) => OpenUrl("http://127.0.0.1:3333/v1/health");

            timer = new Timer { Interval = 10000 };
            timer.Tick += async (sender, args) => await RefreshAsync();
            timer.Start();
            _ = RefreshAsync();
        }

        private async Task RefreshAsync()
        {
            try
            {
                var json = JObject.Parse(await http.GetStringAsync("http://127.0.0.1:3333/v1/health"));
                var queue = json.Value<int?>("queueDepth") ?? 0;
                var paired = json.Value<bool?>("paired") == true ? "paired" : "not paired";
                status.Text = $"Online - {paired} - {queue} queued";
                icon.Text = queue > 0 ? $"CafeQR Print Service - {queue} queued" : "CafeQR Print Service - Online";
            }
            catch
            {
                status.Text = "Service unavailable";
                icon.Text = "CafeQR Print Service - Offline";
            }
        }

        private static async Task RestartServiceAsync()
        {
            try
            {
                using (var service = new ServiceController("CafeQRPrintService"))
                {
                    if (service.Status != ServiceControllerStatus.Stopped
                        && service.Status != ServiceControllerStatus.StopPending)
                    {
                        service.Stop();
                        service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                    }
                    service.Start();
                    service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "CafeQR Print Service", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            await Task.CompletedTask;
        }

        private static void OpenLogs()
        {
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "CafeQR",
                "PrintService",
                "logs");
            Directory.CreateDirectory(path);
            Process.Start("explorer.exe", path);
        }

        private static void OpenUrl(string url) => Process.Start(url);

        protected override void ExitThreadCore()
        {
            timer.Stop();
            timer.Dispose();
            http.Dispose();
            icon.Visible = false;
            icon.Dispose();
            base.ExitThreadCore();
        }
    }
}
