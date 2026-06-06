using System;
using System.ServiceProcess;

namespace CafeQR.PrintService
{
    internal static class Program
    {
        private static void Main(string[] args)
        {
            var service = new CafeQrPrintWindowsService();
            if (Environment.UserInteractive || Array.Exists(args, value =>
                value.Equals("--console", StringComparison.OrdinalIgnoreCase)))
            {
                service.RunInteractive();
                return;
            }
            ServiceBase.Run(service);
        }
    }
}
