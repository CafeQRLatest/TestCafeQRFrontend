using System;
using System.ServiceProcess;
using System.Threading;

namespace CafeQR.PrintService
{
    internal sealed class CafeQrPrintWindowsService : ServiceBase
    {
        private DurableStore store;
        private OptionsStore optionsStore;
        private CloudPrintClient cloud;
        private PrintCoordinator coordinator;
        private LocalApiServer api;

        public CafeQrPrintWindowsService()
        {
            ServiceName = "CafeQRPrintService";
            CanStop = true;
            CanShutdown = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            StartComponents();
        }

        protected override void OnStop()
        {
            StopComponents();
        }

        protected override void OnShutdown()
        {
            StopComponents();
            base.OnShutdown();
        }

        public void RunInteractive()
        {
            StartComponents();
            Console.WriteLine("CafeQR Print Service is running. Press Ctrl+C to stop.");
            using (var wait = new ManualResetEvent(false))
            {
                Console.CancelKeyPress += (sender, eventArgs) =>
                {
                    eventArgs.Cancel = true;
                    wait.Set();
                };
                wait.WaitOne();
            }
            StopComponents();
        }

        private void StartComponents()
        {
            ServicePaths.Ensure();
            optionsStore = new OptionsStore();
            store = new DurableStore();
            cloud = new CloudPrintClient(optionsStore);
            coordinator = new PrintCoordinator(store, cloud, optionsStore);
            api = new LocalApiServer(optionsStore, cloud, coordinator);
            coordinator.Start();
            api.Start();
            Log.Info("CafeQR Print Service started");
        }

        private void StopComponents()
        {
            api?.Dispose();
            coordinator?.Dispose();
            cloud?.Dispose();
            store?.Dispose();
            api = null;
            coordinator = null;
            cloud = null;
            store = null;
            Log.Info("CafeQR Print Service stopped");
        }
    }
}
