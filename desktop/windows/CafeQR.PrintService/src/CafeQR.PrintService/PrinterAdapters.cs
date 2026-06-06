using System;
using System.Drawing.Printing;
using System.IO.Ports;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace CafeQR.PrintService
{
    internal interface IPrinterAdapter
    {
        Task<PrintResult> PrintAsync(LocalPrintTask task, PrinterProfile profile, byte[] thermalData,
            PrintDocument regularDocument, CancellationToken cancellationToken);
    }

    internal sealed class WindowsQueueAdapter : IPrinterAdapter
    {
        public Task<PrintResult> PrintAsync(LocalPrintTask task, PrinterProfile profile, byte[] thermalData,
            PrintDocument regularDocument, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (profile.Format.Equals(PrintConstants.Regular, StringComparison.OrdinalIgnoreCase))
                {
                    if (regularDocument == null) throw new InvalidOperationException("Regular print document is missing");
                    regularDocument.Print();
                    return new PrintResult
                    {
                        Accepted = true,
                        CompletionStatus = "SPOOLED",
                        Message = "Accepted by Windows print driver"
                    };
                }
                var spoolId = RawSpooler.Print(profile.WindowsPrinterName, thermalData);
                return new PrintResult
                {
                    Accepted = true,
                    CompletionStatus = "SPOOLED",
                    SpoolJobId = spoolId.ToString(),
                    Message = "Accepted by Windows spooler"
                };
            }, cancellationToken);
        }
    }

    internal sealed class TcpPrinterAdapter : IPrinterAdapter
    {
        public async Task<PrintResult> PrintAsync(LocalPrintTask task, PrinterProfile profile, byte[] thermalData,
            PrintDocument regularDocument, CancellationToken cancellationToken)
        {
            if (profile.Format.Equals(PrintConstants.Regular, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Direct TCP printing requires a thermal/raw printer profile");
            }
            using (var client = new TcpClient())
            {
                var connect = client.ConnectAsync(profile.Host, profile.Port <= 0 ? 9100 : profile.Port);
                var timeout = Task.Delay(TimeSpan.FromSeconds(8), cancellationToken);
                if (await Task.WhenAny(connect, timeout).ConfigureAwait(false) != connect)
                    throw new TimeoutException("Network printer connection timed out");
                await connect.ConfigureAwait(false);
                using (var stream = client.GetStream())
                {
                    stream.WriteTimeout = 10000;
                    await stream.WriteAsync(thermalData, 0, thermalData.Length, cancellationToken).ConfigureAwait(false);
                    await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
                }
            }
            return new PrintResult
            {
                Accepted = true,
                CompletionStatus = "COMPLETED",
                Message = "Network transport completed; physical output is not driver-confirmed"
            };
        }
    }

    internal sealed class SerialPrinterAdapter : IPrinterAdapter
    {
        public Task<PrintResult> PrintAsync(LocalPrintTask task, PrinterProfile profile, byte[] thermalData,
            PrintDocument regularDocument, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (profile.Format.Equals(PrintConstants.Regular, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Bluetooth COM printing supports thermal/raw profiles only");
                using (var serial = new SerialPort(profile.ComPort, profile.BaudRate <= 0 ? 9600 : profile.BaudRate))
                {
                    serial.WriteTimeout = 10000;
                    serial.Open();
                    serial.Write(thermalData, 0, thermalData.Length);
                    serial.BaseStream.Flush();
                }
                return new PrintResult
                {
                    Accepted = true,
                    CompletionStatus = "COMPLETED",
                    Message = "Bluetooth COM transport completed; physical output is not driver-confirmed"
                };
            }, cancellationToken);
        }
    }

    internal static class PrinterAdapterFactory
    {
        public static IPrinterAdapter Create(PrinterProfile profile)
        {
            switch ((profile.ConnectionType ?? "WINDOWS_QUEUE").ToUpperInvariant())
            {
                case "NETWORK":
                case "LAN":
                case "WIFI":
                case "TCP":
                    return new TcpPrinterAdapter();
                case "BLUETOOTH_COM":
                case "COM":
                    return new SerialPrinterAdapter();
                default:
                    return new WindowsQueueAdapter();
            }
        }
    }

    internal static class RawSpooler
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private sealed class DocInfo
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string DocumentName;
            [MarshalAs(UnmanagedType.LPWStr)] public string OutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string DataType;
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);

        [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
        private static extern bool ClosePrinter(IntPtr printer);

        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int StartDocPrinter(IntPtr printer, int level, [In] DocInfo info);

        [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
        private static extern bool EndDocPrinter(IntPtr printer);

        [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
        private static extern bool StartPagePrinter(IntPtr printer);

        [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
        private static extern bool EndPagePrinter(IntPtr printer);

        [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
        private static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);

        public static int Print(string printerName, byte[] data)
        {
            if (string.IsNullOrWhiteSpace(printerName)) throw new InvalidOperationException("Windows printer name is missing");
            if (!OpenPrinter(printerName, out var printer, IntPtr.Zero))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OpenPrinter failed");
            try
            {
                var jobId = StartDocPrinter(printer, 1, new DocInfo
                {
                    DocumentName = "CafeQR Print Job",
                    DataType = "RAW"
                });
                if (jobId == 0) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter failed");
                try
                {
                    if (!StartPagePrinter(printer))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter failed");
                    var pointer = Marshal.AllocCoTaskMem(data.Length);
                    try
                    {
                        Marshal.Copy(data, 0, pointer, data.Length);
                        var offset = 0;
                        while (offset < data.Length)
                        {
                            if (!WritePrinter(printer, IntPtr.Add(pointer, offset), data.Length - offset, out var written))
                                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter failed");
                            if (written <= 0) throw new InvalidOperationException("Printer accepted zero bytes");
                            offset += written;
                        }
                    }
                    finally
                    {
                        Marshal.FreeCoTaskMem(pointer);
                        EndPagePrinter(printer);
                    }
                    return jobId;
                }
                finally
                {
                    EndDocPrinter(printer);
                }
            }
            finally
            {
                ClosePrinter(printer);
            }
        }
    }
}
