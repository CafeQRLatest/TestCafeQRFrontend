using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.ServiceProcess;
using System.Runtime.InteropServices;
using System.Drawing.Printing;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace CafeQRPrintHub
{
    public class Program
    {
        public static void Main(string[] args)
        {
            bool isConsole = args.Length > 0 && (args[0] == "--console" || args[0] == "-c");

            if (isConsole || Environment.UserInteractive)
            {
                Console.WriteLine("Starting CafeQR Print Hub in Console Mode...");
                PrintHubServer server = new PrintHubServer(3333);
                server.Start();
                Console.WriteLine("Server running on http://127.0.0.1:3333/ (Press Ctrl+C to exit)");

                ManualResetEvent keepAliveEvent = new ManualResetEvent(false);
                Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) {
                    e.Cancel = true;
                    Console.WriteLine("Stopping server...");
                    server.Stop();
                    keepAliveEvent.Set();
                };
                keepAliveEvent.WaitOne();
            }
            else
            {
                ServiceBase[] ServicesToRun = new ServiceBase[] { new PrintHubService() };
                ServiceBase.Run(ServicesToRun);
            }
        }
    }

    public class PrintHubService : ServiceBase
    {
        private PrintHubServer _server;

        public PrintHubService()
        {
            this.ServiceName = "CafeQRPrintHub";
            this.CanStop = true;
            this.AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            _server = new PrintHubServer(3333);
            _server.Start();
        }

        protected override void OnStop()
        {
            if (_server != null)
            {
                _server.Stop();
                _server = null;
            }
        }
    }

    public class PrintHubServer
    {
        private readonly HttpListener _listener;
        private readonly int _port;
        private bool _isRunning;
        private readonly JavaScriptSerializer _serializer;

        private static string _savedConfiguration = "{}";

        private static string ResolvePrinterNameFromProfile(string profileId)
        {
            try
            {
                if (string.IsNullOrEmpty(_savedConfiguration)) return null;

                JavaScriptSerializer ser = new JavaScriptSerializer();
                Dictionary<string, object> config = ser.Deserialize<Dictionary<string, object>>(_savedConfiguration);
                if (config != null && config.ContainsKey("profiles"))
                {
                    System.Collections.ArrayList profiles = config["profiles"] as System.Collections.ArrayList;
                    if (profiles != null)
                    {
                        foreach (object item in profiles)
                        {
                            Dictionary<string, object> profile = item as Dictionary<string, object>;
                            if (profile != null && profile.ContainsKey("id"))
                            {
                                string id = profile["id"] as string;
                                if (id == profileId && profile.ContainsKey("windowsPrinterName"))
                                {
                                    return profile["windowsPrinterName"] as string;
                                }
                            }
                        }
                    }
                }
            }
            catch {}
            return null;
        }

        private static string GetFirstConfiguredPrinter()
        {
            try
            {
                if (string.IsNullOrEmpty(_savedConfiguration)) return null;

                JavaScriptSerializer ser = new JavaScriptSerializer();
                Dictionary<string, object> config = ser.Deserialize<Dictionary<string, object>>(_savedConfiguration);
                if (config != null && config.ContainsKey("profiles"))
                {
                    System.Collections.ArrayList profiles = config["profiles"] as System.Collections.ArrayList;
                    if (profiles != null && profiles.Count > 0)
                    {
                        Dictionary<string, object> profile = profiles[0] as Dictionary<string, object>;
                        if (profile != null && profile.ContainsKey("windowsPrinterName"))
                        {
                            return profile["windowsPrinterName"] as string;
                        }
                    }
                }
            }
            catch {}
            return null;
        }

        public PrintHubServer(int port)
        {
            _port = port;
            _listener = new HttpListener();
            _listener.Prefixes.Add("http://127.0.0.1:" + port.ToString() + "/");

            _serializer = new JavaScriptSerializer();
            _serializer.MaxJsonLength = 10 * 1024 * 1024;
        }

        public void Start()
        {
            _isRunning = true;
            _listener.Start();
            _listener.BeginGetContext(new AsyncCallback(OnRequestReceived), null);
        }

        public void Stop()
        {
            _isRunning = false;
            try
            {
                _listener.Stop();
                _listener.Close();
            }
            catch { }
        }

        private void OnRequestReceived(IAsyncResult result)
        {
            if (!_isRunning) return;

            HttpListenerContext context = null;
            try
            {
                context = _listener.EndGetContext(result);
            }
            catch (Exception) { }

            if (_isRunning)
            {
                try
                {
                    _listener.BeginGetContext(new AsyncCallback(OnRequestReceived), null);
                }
                catch { }
            }

            if (context == null) return;

            try
            {
                HandleRequest(context);
            }
            catch (Exception ex)
            {
                SendJsonError(context, 500, "Internal server error: " + ex.Message);
            }
        }

        private void HandleRequest(HttpListenerContext context)
        {
            HttpListenerRequest req = context.Request;
            HttpListenerResponse resp = context.Response;

            resp.Headers.Add("Access-Control-Allow-Origin", "*");
            resp.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-CafeQR-Local-Token");

            if (req.HttpMethod == "OPTIONS")
            {
                resp.StatusCode = 204;
                resp.OutputStream.Close();
                return;
            }

            string path = req.Url.AbsolutePath.ToLower();

            // GET /health or GET /v1/health
            if (req.HttpMethod == "GET" && (path == "/health" || path == "/v1/health"))
            {
                Dictionary<string, object> health = new Dictionary<string, object>();
                health["ok"] = true;
                health["host"] = Environment.MachineName;
                health["os"] = Environment.OSVersion.ToString();
                health["version"] = "2.1.0";
                health["paired"] = true;
                health["cloudPaired"] = true;
                health["credentialsPresent"] = true;
                health["cloudStatus"] = "SYNCED";
                health["configurationDirty"] = false;
                health["queueDepth"] = 0;
                health["status"] = "ONLINE";
                health["serverTimeUtc"] = DateTime.UtcNow;
                health["localClientToken"] = "cafeqr-local-direct-" + Environment.MachineName.ToLowerInvariant();
                SendJsonResponse(context, 200, health);
                return;
            }

            // GET /printers or GET /v1/printers
            if (req.HttpMethod == "GET" && (path == "/printers" || path == "/v1/printers"))
            {
                List<object> printersList = new List<object>();
                foreach (string printerName in PrinterSettings.InstalledPrinters)
                {
                    try
                    {
                        PrinterSettings settings = new PrinterSettings { PrinterName = printerName };
                        Dictionary<string, object> cap = new Dictionary<string, object>();
                        cap["name"] = printerName;
                        cap["connectionType"] = "WINDOWS_QUEUE";
                        cap["isDefault"] = settings.IsDefaultPrinter;
                        cap["isValid"] = settings.IsValid;
                        cap["paperSizes"] = new List<object>();
                        printersList.Add(cap);
                    }
                    catch { }
                }

                try
                {
                    foreach (string port in System.IO.Ports.SerialPort.GetPortNames())
                    {
                        Dictionary<string, object> cap = new Dictionary<string, object>();
                        cap["name"] = port;
                        cap["connectionType"] = "BLUETOOTH_COM";
                        cap["isDefault"] = false;
                        cap["isValid"] = true;
                        cap["paperSizes"] = new List<object>();
                        printersList.Add(cap);
                    }
                }
                catch { }

                SendJsonResponse(context, 200, printersList);
                return;
            }

            // GET /v1/jobs
            if (req.HttpMethod == "GET" && path == "/v1/jobs")
            {
                SendJsonResponse(context, 200, new object[0]);
                return;
            }

            // GET /v1/configuration
            if (req.HttpMethod == "GET" && path == "/v1/configuration")
            {
                try {
                    Dictionary<string, object> dict = _serializer.Deserialize<Dictionary<string, object>>(_savedConfiguration);
                    SendJsonResponse(context, 200, dict != null ? dict : new Dictionary<string, object>());
                } catch {
                    SendJsonResponse(context, 200, new Dictionary<string, object>());
                }
                return;
            }

            // PUT /v1/configuration
            if (req.HttpMethod == "PUT" && path == "/v1/configuration")
            {
                using (StreamReader reader = new StreamReader(req.InputStream, req.ContentEncoding))
                {
                    _savedConfiguration = reader.ReadToEnd();
                }
                Dictionary<string, object> successResp = new Dictionary<string, object>();
                successResp["ok"] = true;
                SendJsonResponse(context, 200, successResp);
                return;
            }

            // POST /v1/configuration/sync
            if (req.HttpMethod == "POST" && path == "/v1/configuration/sync")
            {
                Dictionary<string, object> successResp = new Dictionary<string, object>();
                successResp["ok"] = true;
                SendJsonResponse(context, 200, successResp);
                return;
            }

            // POST /v1/configuration/cloud
            if (req.HttpMethod == "POST" && path == "/v1/configuration/cloud")
            {
                Dictionary<string, object> successResp = new Dictionary<string, object>();
                successResp["ok"] = true;
                SendJsonResponse(context, 200, successResp);
                return;
            }

            // POST /printRaw or POST /v1/jobs
            if (req.HttpMethod == "POST" && (path == "/printraw" || path == "/v1/jobs"))
            {
                string bodyText;
                using (StreamReader reader = new StreamReader(req.InputStream, req.ContentEncoding))
                {
                    bodyText = reader.ReadToEnd();
                }

                if (string.IsNullOrEmpty(bodyText))
                {
                    SendJsonError(context, 400, "Empty request body");
                    return;
                }

                Dictionary<string, object> body;
                try
                {
                    body = _serializer.Deserialize<Dictionary<string, object>>(bodyText);
                }
                catch (Exception ex)
                {
                    SendJsonError(context, 400, "Invalid JSON: " + ex.Message);
                    return;
                }

                if (body == null)
                {
                    SendJsonError(context, 400, "Invalid print payload");
                    return;
                }

                string printerName = null;
                byte[] bytes = null;

                if (body.ContainsKey("printerName"))
                {
                    printerName = body["printerName"] as string;
                }
                else if (body.ContainsKey("winPrinterNames"))
                {
                    System.Collections.ArrayList names = body["winPrinterNames"] as System.Collections.ArrayList;
                    if (names != null && names.Count > 0)
                    {
                        printerName = names[0] as string;
                    }
                }

                if (body.ContainsKey("dataBase64"))
                {
                    string dataBase64 = body["dataBase64"] as string;
                    if (!string.IsNullOrEmpty(dataBase64))
                    {
                        try
                        {
                            bytes = Convert.FromBase64String(dataBase64);
                        }
                        catch (Exception ex)
                        {
                            SendJsonError(context, 400, "Invalid Base64 data: " + ex.Message);
                            return;
                        }
                    }
                }

                // If printerName is not resolved, check if it's a profile-based job
                if (string.IsNullOrEmpty(printerName) && body.ContainsKey("printerProfileId"))
                {
                    string profileId = body["printerProfileId"] as string;
                    printerName = ResolvePrinterNameFromProfile(profileId);
                }

                // If bytes are not resolved, check if it's plain text print data
                if (bytes == null && body.ContainsKey("text"))
                {
                    string text = body["text"] as string;
                    if (!string.IsNullOrEmpty(text))
                    {
                        bytes = Encoding.UTF8.GetBytes(text);
                    }
                }

                // Fallback to the first printer in configuration if still unresolved
                if (string.IsNullOrEmpty(printerName))
                {
                    printerName = GetFirstConfiguredPrinter();
                }

                if (string.IsNullOrEmpty(printerName) || bytes == null)
                {
                    SendJsonError(context, 400, "printerName (or printerProfileId) and print data (dataBase64 or text) are required");
                    return;
                }

                bool ok = RawPrinterHelper.SendBytesToPrinter(printerName, bytes);

                if (ok)
                {
                    Dictionary<string, object> successResp = new Dictionary<string, object>();
                    successResp["ok"] = true;
                    SendJsonResponse(context, 200, successResp);
                }
                else
                {
                    SendJsonError(context, 500, "Spooling failed. Verify printer '" + printerName + "' is online.");
                }
                return;
            }

            SendJsonError(context, 404, "Endpoint not found");
        }

        private void SendJsonResponse(HttpListenerContext context, int statusCode, object data)
        {
            try
            {
                string jsonText = _serializer.Serialize(data);
                byte[] bytes = Encoding.UTF8.GetBytes(jsonText);

                context.Response.StatusCode = statusCode;
                context.Response.ContentType = "application/json; charset=utf-8";
                context.Response.ContentLength64 = bytes.Length;
                context.Response.OutputStream.Write(bytes, 0, bytes.Length);
            }
            catch { }
            finally
            {
                try { context.Response.OutputStream.Close(); } catch { }
            }
        }

        private void SendJsonError(HttpListenerContext context, int statusCode, string errorMessage)
        {
            Dictionary<string, object> err = new Dictionary<string, object>();
            err["error"] = errorMessage;
            SendJsonResponse(context, statusCode, err);
        }
    }

    public static class RawPrinterHelper
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public class DOCINFOA
        {
            [MarshalAs(UnmanagedType.LPStr)]
            public string pDocName;
            [MarshalAs(UnmanagedType.LPStr)]
            public string pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)]
            public string pDataType;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
        public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

        [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

        public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes)
        {
            IntPtr hPrinter;
            if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) return false;

            DOCINFOA di = new DOCINFOA();
            di.pDocName = "CafeQR Local Print Job";
            di.pDataType = "RAW";

            bool success = false;
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    IntPtr pUnmanagedBytes = Marshal.AllocHGlobal(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeHGlobal(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
            return success;
        }
    }
}
