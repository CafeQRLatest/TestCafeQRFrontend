using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal static class BuildInfo
    {
        public static readonly string Version =
            typeof(BuildInfo).Assembly.GetName().Version.ToString(3);
    }

    internal static class PrintConstants
    {
        public const string Thermal = "THERMAL";
        public const string Regular = "REGULAR";
        public const string Both = "BOTH";
        public const string Mirror = "MIRROR";
        public const string Failover = "FAILOVER";
    }

    internal sealed class ServiceOptions
    {
        public static readonly string[] RequiredAllowedOrigins =
        {
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "https://cafe-test-qr-frontend.vercel.app",
            "https://cafe-qr-frontend.vercel.app",
            "https://app.cafeqr.in",
            "https://cafeqr-frontend.pages.dev",
            "https://*.pages.dev",
            "https://*.vercel.app",
            "http://69.62.83.147",
            "https://69.62.83.147"
        };

        public string CloudBaseUrl { get; set; } = "https://api.cafeqr.in";
        public string StationTokenProtected { get; set; }
        public string LocalClientTokenProtected { get; set; }
        public string StationId { get; set; }
        public string TerminalId { get; set; }
        public string ServiceVersion { get; set; } = BuildInfo.Version;
        public int ListenPort { get; set; } = 3333;
        public List<string> AllowedOrigins { get; set; } =
            new List<string>(RequiredAllowedOrigins);
        public JObject EffectiveConfiguration { get; set; } = new JObject();
        public int ConfigurationStateVersion { get; set; }
        public long ConfigurationRevision { get; set; }
        public int CloudRevision { get; set; }
        public bool ConfigurationDirty { get; set; }
        public DateTime? ConfigurationUpdatedAtUtc { get; set; }
        public DateTime? LastCloudSyncAtUtc { get; set; }
        public string LastCloudError { get; set; }
        public string CloudStatus { get; set; } = "UNPAIRED";
    }

    internal sealed class PrinterProfile
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string ConnectionType { get; set; } = "WINDOWS_QUEUE";
        public string Format { get; set; } = PrintConstants.Thermal;
        public string WindowsPrinterName { get; set; }
        public string Host { get; set; }
        public int Port { get; set; } = 9100;
        public string ComPort { get; set; }
        public int BaudRate { get; set; } = 9600;
        public string PaperPreset { get; set; } = "58MM";
        public decimal WidthMm { get; set; } = 58m;
        public decimal HeightMm { get; set; }
        public int Columns { get; set; } = 32;
        public int PrintableDots { get; set; } = 384;
        public int LeftMargin { get; set; }
        public int RightMargin { get; set; }
        public int LineSpacing { get; set; }
        public string Orientation { get; set; } = "PORTRAIT";
        public decimal MarginMm { get; set; } = 10m;
        public string PaperSource { get; set; }
        public int Scaling { get; set; } = 100;
        public string ColorMode { get; set; } = "GRAYSCALE";
        public int Copies { get; set; } = 1;
        public bool AutoCut { get; set; } = true;
        public int FeedLines { get; set; } = 3;
        public bool Enabled { get; set; } = true;
        public bool ShowLogo { get; set; } = true;
        public bool ShowCustomer { get; set; } = true;
        public bool ShowTax { get; set; } = true;
        public bool ShowHsnSac { get; set; } = true;
        public bool ShowUnits { get; set; } = true;
        public bool ShowDiscounts { get; set; } = true;
        public bool ShowPayment { get; set; } = true;
        public bool ShowAmountInWords { get; set; } = true;
        public bool ShowTerms { get; set; } = true;
        public bool ShowFooter { get; set; } = true;
        public bool ShowSignature { get; set; } = true;
        public string Terms { get; set; }
        public string Footer { get; set; }
        public List<string> Documents { get; set; } = new List<string> { "KOT", "BILL", "INVOICE" };
    }

    internal sealed class PrintRoute
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public bool Enabled { get; set; } = true;
        public int Priority { get; set; } = 100;
        public string Mode { get; set; } = PrintConstants.Failover;
        public int Copies { get; set; } = 1;
        public List<string> DocumentTypes { get; set; } = new List<string>();
        public List<string> Categories { get; set; } = new List<string>();
        public List<string> OrderTypes { get; set; } = new List<string>();
        public List<string> ProfileIds { get; set; } = new List<string>();
    }

    internal sealed class CloudPrintJob
    {
        public string Id { get; set; }
        public string LeaseToken { get; set; }
        public string JobKind { get; set; }
        public int Attempts { get; set; }
        public JObject Payload { get; set; }
        public string Status { get; set; }
    }

    internal sealed class LocalJobSubmission
    {
        public string IdempotencyKey { get; set; }
        public string JobKind { get; set; } = "bill";
        public string OutputFormat { get; set; }
        public string PrinterProfileId { get; set; }
        public string RouteId { get; set; }
        public string Text { get; set; }
        public string DataBase64 { get; set; }
        public JObject Document { get; set; }
        public JObject Metadata { get; set; }
    }

    internal sealed class LocalPrintTask
    {
        public long Id { get; set; }
        public string GroupId { get; set; }
        public string CloudJobId { get; set; }
        public string LeaseToken { get; set; }
        public string IdempotencyKey { get; set; }
        public string JobKind { get; set; }
        public string ProfileId { get; set; }
        public string RouteId { get; set; }
        public string Mode { get; set; }
        public int TargetIndex { get; set; }
        public int Attempts { get; set; }
        public string Status { get; set; }
        public string PayloadJson { get; set; }
        public string ErrorMessage { get; set; }
        public string SpoolJobId { get; set; }
        public DateTime CreatedAtUtc { get; set; }
        public DateTime? NextAttemptAtUtc { get; set; }

        [JsonIgnore]
        public LocalJobSubmission Submission =>
            JsonConvert.DeserializeObject<LocalJobSubmission>(PayloadJson ?? "{}");
    }

    internal sealed class PrintResult
    {
        public bool Accepted { get; set; }
        public bool Ambiguous { get; set; }
        public string CompletionStatus { get; set; }
        public string SpoolJobId { get; set; }
        public string Message { get; set; }
    }

    internal sealed class RoutedTarget
    {
        public PrintRoute Route { get; set; }
        public PrinterProfile Profile { get; set; }
        public int Copies { get; set; }
        public int TargetIndex { get; set; }
    }
}
