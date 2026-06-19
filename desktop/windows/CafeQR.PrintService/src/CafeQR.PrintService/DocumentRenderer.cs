using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal sealed class DocumentRenderer
    {
        public byte[] Thermal(LocalJobSubmission submission, PrinterProfile profile, int attempt, JObject config)
        {
            Log.Info($"[Thermal Print] JobKind={submission.JobKind}, Attempt={attempt}, Printer={profile.WindowsPrinterName}");
            Log.Info($"[Thermal Print] Has DataBase64: {!string.IsNullOrWhiteSpace(submission.DataBase64)}, Length={(submission.DataBase64?.Length ?? 0)}");
            Log.Info($"[Thermal Print] Has Text: {!string.IsNullOrWhiteSpace(submission.Text)}, Length={(submission.Text?.Length ?? 0)}");
            Log.Info($"[Thermal Print] Document keys: {string.Join(", ", (submission.Document ?? new JObject()).Properties().Select(p => p.Name))}");

            var isKot = IsKotKind(submission.JobKind);
            var document = submission.Document ?? new JObject();
            var canRebuildKot = isKot && HasStructuredOrder(document) && string.IsNullOrWhiteSpace(submission.DataBase64);
            Log.Info($"[Thermal Print] KOT custom renderer guard: isKot={isKot}, canRebuild={canRebuildKot}, hasKotTemplate={config?["kotTemplate"] != null}");

            if (!string.IsNullOrWhiteSpace(submission.DataBase64))
            {
                try
                {
                    var data = Convert.FromBase64String(submission.DataBase64);
                    var decodedText = Encoding.GetEncoding(437).GetString(data);
                    var textForDetection = !string.IsNullOrWhiteSpace(submission.Text)
                        ? submission.Text
                        : decodedText;
                    if (canRebuildKot)
                    {
                        Log.Info("[Thermal Print] Structured KOT DataBase64 ignored; rebuilding from order payload and effective KOT template.");
                    }
                    else
                    {
                        Log.Info($"[Thermal Print] Printing direct DataBase64. Bytes count: {data.Length}");
                        return data;
                    }
                }
                catch (Exception ex)
                {
                    Log.Warn($"[Thermal Print] Failed to decode DataBase64, falling back to text. Error: {ex.Message}");
                }
            }

            var text = canRebuildKot
                ? BuildText(document, submission.JobKind, profile, config)
                : !string.IsNullOrWhiteSpace(submission.Text)
                ? submission.Text
                : BuildText(document, submission.JobKind, profile, config);
            if (canRebuildKot)
            {
                Log.Info("[Thermal Print] Structured KOT rebuilt with customized KOT renderer.");
            }
            else if (isKot)
            {
                Log.Info("[Thermal Print] KOT text uses customized renderer or does not match legacy shape.");
            }
            text = RemoveUnexpectedFinalTotalRow(text);

            Log.Info($"[Thermal Print] Rendered Text: {Environment.NewLine}{text}");

            var documentKind = isKot ? "kot" : "receipt";
            var effectiveTemplate = EffectiveThermalTemplate(config, profile, documentKind);

            if (isKot && attempt > 1)
            {
                var layout = GetLayout(config, profile, documentKind);
                text = Center("*** REPRINT ***", layout.InnerCols) + Environment.NewLine + text;
            }

            var body = Encoding.GetEncoding(437).GetBytes(text.Replace("\r\n", "\n").Replace("\n", "\r\n"));
            using (var stream = new System.IO.MemoryStream())
            {
                stream.Write(new byte[] { 0x1B, 0x40 }, 0, 2);
                stream.Write(body, 0, body.Length);
                var feedLines = ValueInt(effectiveTemplate, "feedLines", profile.FeedLines);
                for (var i = 0; i < Math.Max(1, feedLines); i++)
                {
                    stream.WriteByte(0x0A);
                }
                if (ValueBool(effectiveTemplate, "autoCut", profile.AutoCut))
                {
                    stream.Write(new byte[] { 0x1D, 0x56, 0x00 }, 0, 3);
                }
                var bytes = stream.ToArray();
                Log.Info($"[Thermal Print] Final ESC/POS stream size: {bytes.Length} bytes");
                return bytes;
            }
        }

        public PrintDocument WindowsQueueKot(LocalJobSubmission submission, PrinterProfile profile, int attempt, JObject config)
        {
            var source = submission.Document ?? new JObject();
            var order = OrderWithPayloadRestaurant(source);
            var hasStructuredOrder = HasStructuredOrder(source);
            var hasKotTemplate = config?["kotTemplate"] != null;
            Log.Info($"[KOT Renderer] rendererPath=WINDOWS_QUEUE_GDI_KOT jobKind={submission.JobKind} profileId={profile.Id} connectionType={profile.ConnectionType} hasStructuredOrder={hasStructuredOrder} hasKotTemplate={hasKotTemplate}");

            var state = BuildKotGdiState(order, config, profile, attempt);
            var document = new PrintDocument();
            document.PrinterSettings.PrinterName = profile.WindowsPrinterName;
            document.PrinterSettings.Copies = 1;
            document.OriginAtMargins = false;
            document.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            document.DefaultPageSettings.Landscape = false;
            document.DefaultPageSettings.PaperSize = new PaperSize(
                "CafeQR KOT",
                MmToHundredths(state.Layout.PaperMm),
                state.PageHeightHundredths);

            document.PrintPage += (sender, args) => DrawKotGdi(args, state);
            return document;
        }

        private static string RemoveUnexpectedFinalTotalRow(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;

            var lines = text.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n');
            var output = new List<string>();
            var afterGrandTotal = false;

            foreach (var line in lines)
            {
                var clean = StripEscPosForMatch(line);

                if (afterGrandTotal)
                {
                    if (string.IsNullOrEmpty(clean))
                    {
                        output.Add(line);
                        continue;
                    }
                    if (Regex.IsMatch(clean, @"^TOTAL\s*:\s*(?:\u20b9|\$|Rs\.?|INR)?\s*[-+]?\d[\d,.]*$", RegexOptions.IgnoreCase))
                    {
                        afterGrandTotal = false;
                        continue;
                    }
                    afterGrandTotal = false;
                }

                output.Add(line);
                if (Regex.IsMatch(clean, @"\bGRAND\s+TOTAL\s*:", RegexOptions.IgnoreCase))
                {
                    afterGrandTotal = true;
                }
            }

            return string.Join("\n", output);
        }

        private static bool LooksLikeLegacyKotText(string text)
        {
            var clean = StripEscPosForMatch(text);
            if (string.IsNullOrEmpty(clean)) return false;
            if (Regex.IsMatch(clean, @"\bKOT\s+Ref\s*:", RegexOptions.IgnoreCase)) return false;

            return Regex.IsMatch(clean, @"\*+\s*KOT\s*\*+", RegexOptions.IgnoreCase)
                && Regex.IsMatch(clean, @"\bOrder\s*:", RegexOptions.IgnoreCase)
                && Regex.IsMatch(clean, @"\bType\s*:", RegexOptions.IgnoreCase)
                && Regex.IsMatch(clean, @"\b\d+(?:\.\d+)?\s*x\s+\S", RegexOptions.IgnoreCase);
        }

        private static bool HasStructuredOrder(JObject source)
        {
            if (source == null) return false;
            var order = source["order"] as JObject ?? source;
            if (order == null) return false;

            if (order["id"] != null ||
                order["orderNo"] != null ||
                order["order_no"] != null ||
                order["saleOrderNo"] != null ||
                order["sale_order_no"] != null)
            {
                return true;
            }

            return order["lines"] is JArray ||
                order["orderLines"] is JArray ||
                order["order_items"] is JArray ||
                order["items"] is JArray;
        }

        private static string StripEscPosForMatch(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";

            var sb = new StringBuilder();
            var i = 0;
            while (i < value.Length)
            {
                var code = value[i];
                if (code == 0x1b)
                {
                    if (i + 1 >= value.Length) break;
                    var cmd = value[i + 1];
                    if (cmd == '@')
                    {
                        i += 2;
                        continue;
                    }
                    if (" !EMat".IndexOf(cmd) >= 0)
                    {
                        i += 3;
                        continue;
                    }
                    i += 2;
                    continue;
                }
                if (code == 0x1d)
                {
                    if (i + 1 >= value.Length) break;
                    var cmd = value[i + 1];
                    if (cmd == '!' || cmd == 'V')
                    {
                        i += 3;
                        continue;
                    }
                    if (cmd == 'L' || cmd == 'W')
                    {
                        i += 4;
                        continue;
                    }
                    i += 2;
                    continue;
                }
                if (code >= 32 && code != 127)
                {
                    sb.Append(code);
                }
                i += 1;
            }

            return Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
        }

        public PrintDocument Regular(LocalJobSubmission submission, PrinterProfile profile, int attempt)
        {
            var document = new PrintDocument();
            document.PrinterSettings.PrinterName = profile.WindowsPrinterName;
            // Copies are expanded into durable queue tasks so each copy has its own outcome.
            document.PrinterSettings.Copies = 1;
            document.DefaultPageSettings.Landscape =
                profile.Orientation.Equals("LANDSCAPE", StringComparison.OrdinalIgnoreCase);
            document.DefaultPageSettings.Color =
                profile.ColorMode.Equals("COLOR", StringComparison.OrdinalIgnoreCase);
            var margin = profile.MarginMm > 0 ? profile.MarginMm : 10m;
            document.DefaultPageSettings.Margins = new Margins(
                MmToHundredths(profile.LeftMargin > 0 ? profile.LeftMargin : margin),
                MmToHundredths(profile.RightMargin > 0 ? profile.RightMargin : margin),
                MmToHundredths(margin),
                MmToHundredths(margin));

            var paper = FindPaper(document.PrinterSettings, profile);
            if (paper != null) document.DefaultPageSettings.PaperSize = paper;
            var paperSource = FindPaperSource(document.PrinterSettings, profile.PaperSource);
            if (paperSource != null) document.DefaultPageSettings.PaperSource = paperSource;

            var state = new InvoicePageState(submission.Document ?? new JObject(), submission.JobKind, attempt, profile);
            document.PrintPage += (sender, args) => DrawInvoice(args, state);
            return document;
        }

        private static void DrawInvoice(PrintPageEventArgs args, InvoicePageState state)
        {
            var graphics = args.Graphics;
            var bounds = args.MarginBounds;
            using (var title = new Font("Arial", 15 * state.Scale, FontStyle.Bold))
            using (var heading = new Font("Arial", 9 * state.Scale, FontStyle.Bold))
            using (var normal = new Font("Arial", 8 * state.Scale))
            using (var small = new Font("Arial", 7 * state.Scale))
            using (var linePen = new Pen(Color.Black, 0.6f))
            {
                float y = bounds.Top;
                if (state.ShowLogo) DrawLogo(graphics, state.LogoBase64, bounds, ref y);
                DrawCentered(graphics, state.RestaurantName, title, bounds, ref y, 22);
                DrawCentered(graphics, state.DocumentTitle, heading, bounds, ref y, 16);
                DrawCentered(graphics, state.RestaurantAddress, small, bounds, ref y, 13);
                DrawCentered(graphics, state.TaxIdentity, small, bounds, ref y, 13);
                y += 5;
                graphics.DrawLine(linePen, bounds.Left, y, bounds.Right, y);
                y += 8;

                DrawPair(graphics, heading, normal, bounds, ref y, "Invoice", state.InvoiceNo, "Date", state.Date);
                DrawPair(graphics, heading, normal, bounds, ref y, "Order", state.OrderNo, "Type", state.OrderType);
                if (state.ShowCustomer && !state.IsKot)
                    DrawPair(graphics, heading, normal, bounds, ref y, "Customer", state.CustomerName, "Phone", state.CustomerPhone);
                y += 5;

                var widths = state.ShowTax && !state.IsKot
                    ? new[] { 0.46f, 0.10f, 0.16f, 0.12f, 0.16f }
                    : new[] { 0.56f, 0.12f, 0.16f, 0.16f };
                var headings = state.ShowTax && !state.IsKot
                    ? new[] { "Item", "Qty", "Rate", "Tax", "Amount" }
                    : new[] { "Item", "Qty", "Rate", "Amount" };
                DrawTableRow(graphics, heading, bounds, ref y, widths, headings, 18);
                graphics.DrawLine(linePen, bounds.Left, y, bounds.Right, y);

                while (state.LineIndex < state.Lines.Count)
                {
                    if (y + 70 > bounds.Bottom)
                    {
                        DrawPageFooter(graphics, small, bounds, state.PageNumber);
                        state.PageNumber++;
                        args.HasMorePages = true;
                        return;
                    }
                    var line = state.Lines[state.LineIndex++];
                    var lineName = line.Name;
                    if (state.ShowHsnSac && !string.IsNullOrWhiteSpace(line.HsnSac)) lineName += "  HSN/SAC: " + line.HsnSac;
                    if (state.ShowUnits && !string.IsNullOrWhiteSpace(line.Unit)) lineName += "  Unit: " + line.Unit;
                    var values = state.ShowTax && !state.IsKot
                        ? new[] { lineName, line.Quantity, line.Rate, line.Tax, line.Amount }
                        : new[] { lineName, line.Quantity, line.Rate, line.Amount };
                    DrawTableRow(graphics, normal, bounds, ref y, widths, values,
                        Math.Max(18, 11 * WrapLines(graphics, lineName, normal, bounds.Width * widths[0])));
                }

                if (!state.IsKot)
                {
                    y += 5;
                    graphics.DrawLine(linePen, bounds.Left, y, bounds.Right, y);
                    y += 8;
                    DrawAmount(graphics, heading, bounds, ref y, "Subtotal", state.Subtotal);
                    if (state.ShowDiscounts) DrawAmount(graphics, normal, bounds, ref y, "Discount", state.Discount);
                    if (state.ShowTax) DrawAmount(graphics, normal, bounds, ref y, "Tax", state.Tax);
                    DrawAmount(graphics, title, bounds, ref y, "Total", state.Total);
                    if (state.ShowPayment)
                    {
                        DrawAmount(graphics, normal, bounds, ref y, "Received", state.Received);
                        DrawAmount(graphics, normal, bounds, ref y, "Balance", state.Balance);
                        DrawCentered(graphics, state.PaymentMethod, small, bounds, ref y, 14);
                    }
                    y += 8;
                    if (state.ShowAmountInWords) DrawCentered(graphics, state.AmountInWords, small, bounds, ref y, 14);
                    if (state.ShowTerms) DrawCentered(graphics, state.Terms, small, bounds, ref y, 14);
                    if (state.ShowFooter) DrawCentered(graphics, state.Footer, small, bounds, ref y, 14);
                    if (state.ShowSignature)
                    {
                        y += 18;
                        graphics.DrawLine(linePen, bounds.Right - 140, y, bounds.Right, y);
                        graphics.DrawString("Authorized signature", small, Brushes.Black, bounds.Right - 130, y + 3);
                    }
                }
                DrawPageFooter(graphics, small, bounds, state.PageNumber);
                args.HasMorePages = false;
            }
        }

        private const string ESC = "\u001b";
        private const string GS = "\u001d";
        private const string MODE_BOLD = "\u001bE\u0001";
        private const string MODE_NO_BOLD = "\u001bE\u0000";
        private const string SIZE_1X = "\u001d!\u0000";
        private const string SIZE_2X = "\u001d!\u0011";
        private const string SIZE_2H = "\u001d!\u0001";

        private sealed class ThermalLayout
        {
            public int Cols;
            public int InnerCols;
            public int MarginCols;
            public int PaperMm;
            public int DotWidth;
            public int LeftDots;
            public int RightDots;
            public int AreaDots;
            public int GuardCols;
        }

        private enum ThermalLineAlignment
        {
            Left,
            Center
        }

        private sealed class ThermalVisualLine
        {
            public string Text;
            public ThermalLineAlignment Alignment;
            public string FontSize;
            public bool Bold;
        }

        private sealed class KotGdiState
        {
            public ThermalLayout Layout;
            public JObject Template;
            public readonly List<ThermalVisualLine> Lines = new List<ThermalVisualLine>();
            public int PageHeightHundredths;
        }

        private static bool IsKotKind(string kind) =>
            (kind ?? "").Equals("kot", StringComparison.OrdinalIgnoreCase);

        private static JObject ProfileThermalTemplate(PrinterProfile profile)
        {
            var result = new JObject();
            if (!string.IsNullOrWhiteSpace(profile.PaperPreset)) result["preset"] = profile.PaperPreset;
            if (profile.WidthMm > 0) result["widthMm"] = profile.WidthMm;
            if (profile.Columns > 0) result["columns"] = profile.Columns;
            if (profile.PrintableDots > 0) result["printableDots"] = profile.PrintableDots;
            if (profile.LeftMargin > 0) result["leftMargin"] = profile.LeftMargin;
            if (profile.RightMargin > 0) result["rightMargin"] = profile.RightMargin;
            if (profile.LineSpacing > 0) result["lineSpacing"] = profile.LineSpacing;
            result["autoCut"] = profile.AutoCut;
            result["feedLines"] = profile.FeedLines;
            return result;
        }

        private static JObject LegacyThermalTemplateFor(JObject legacy, string documentKind)
        {
            var result = legacy != null ? (JObject)legacy.DeepClone() : new JObject();
            if (string.Equals(documentKind, "kot", StringComparison.OrdinalIgnoreCase))
            {
                if (legacy?["kotTitleFontSize"] != null) result["titleFontSize"] = legacy["kotTitleFontSize"];
                if (legacy?["kotFontSize"] != null) result["fontSize"] = legacy["kotFontSize"];
                if (legacy?["kotHeader"] != null) result["header"] = legacy["kotHeader"];
                if (legacy?["kotFooter"] != null) result["footer"] = legacy["kotFooter"];
            }
            else
            {
                if (legacy?["receiptHeader"] != null) result["header"] = legacy["receiptHeader"];
                if (legacy?["receiptFooter"] != null) result["footer"] = legacy["receiptFooter"];
            }
            return result;
        }

        private static JObject EffectiveThermalTemplate(JObject config, PrinterProfile profile, string documentKind)
        {
            var key = string.Equals(documentKind, "kot", StringComparison.OrdinalIgnoreCase)
                ? "kotTemplate"
                : "receiptTemplate";
            var overrideKey = string.Equals(documentKind, "kot", StringComparison.OrdinalIgnoreCase)
                ? "kot"
                : "receipt";
            var merged = new JObject();
            var legacy = config?["thermalTemplate"] as JObject;
            var global = config?[key] as JObject;
            if (legacy != null) merged.Merge(LegacyThermalTemplateFor(legacy, documentKind), new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace });
            if (global != null) merged.Merge(global, new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace });
            merged.Merge(ProfileThermalTemplate(profile), new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace });

            var overrides = profile.TemplateOverrides?[overrideKey] as JObject;
            if (overrides != null && ValueBool(overrides, "enabled", false))
            {
                var cleanOverrides = (JObject)overrides.DeepClone();
                cleanOverrides.Remove("enabled");
                merged.Merge(cleanOverrides, new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace });
            }
            return merged;
        }

        private static string PickTemplateValue(JObject obj, string[] keys, string fallback = "")
        {
            foreach (var key in keys)
            {
                var token = obj?[key];
                if (token != null && token.Type != JTokenType.Null && !string.IsNullOrEmpty(token.ToString()))
                    return token.ToString();
            }
            return fallback;
        }

        private static ThermalLayout GetLayout(JObject config, PrinterProfile profile, string documentKind)
        {
            var tpl = EffectiveThermalTemplate(config, profile, documentKind);
            int cols = profile.Columns > 0 ? profile.Columns : 32;
            decimal widthMm = profile.WidthMm > 0 ? profile.WidthMm : 58m;
            int printableDots = profile.PrintableDots > 0 ? profile.PrintableDots : 384;
            int leftMargin = profile.LeftMargin;
            int rightMargin = profile.RightMargin;

            cols = ValueInt(tpl, "columns", cols);
            widthMm = ValueDecimal(tpl, "widthMm", widthMm);
            printableDots = ValueInt(tpl, "printableDots", printableDots);
            leftMargin = ValueInt(tpl, "leftMargin", leftMargin);
            rightMargin = ValueInt(tpl, "rightMargin", rightMargin);

            int paperMm = (int)Math.Round(widthMm);
            int dotWidth = printableDots;
            int defaultMargin = paperMm >= 76 ? 12 : 8;
            int leftDots = leftMargin > 0 ? leftMargin : defaultMargin;
            int rightDots = rightMargin > 0 ? rightMargin : defaultMargin;

            leftDots = ValueInt(tpl, "leftMarginDots", leftDots);
            rightDots = ValueInt(tpl, "rightMarginDots", rightDots);

            int areaDots = Math.Max(200, dotWidth - leftDots - rightDots);
            int guardColsDefault = paperMm >= 76 ? 0 : 1;
            int guardCols = ValueInt(tpl, "guardCols", guardColsDefault);
            int safeCols = ValueInt(tpl, "safeCols", 0);
            int charDots = 12;
            int maxColsFromDots = areaDots / charDots;

            int innerCols = Math.Max(16, Math.Min(cols - guardCols - safeCols, maxColsFromDots));

            return new ThermalLayout
            {
                Cols = cols,
                InnerCols = innerCols,
                MarginCols = 0,
                PaperMm = paperMm,
                DotWidth = dotWidth,
                LeftDots = leftDots,
                RightDots = rightDots,
                AreaDots = areaDots,
                GuardCols = guardCols
            };
        }

        private static string EscposPageSetup(ThermalLayout layout)
        {
            return ESC + "@" + // reset
                   ESC + " " + (char)0 +   // right character spacing
                   ESC + "a" + (char)0 + // left align
                   GS + "L" + (char)(layout.LeftDots & 0xff) + (char)((layout.LeftDots >> 8) & 0xff) + // left margin
                   GS + "W" + (char)(layout.AreaDots & 0xff) + (char)((layout.AreaDots >> 8) & 0xff) + // printable area width
                   ESC + "M" + (char)0 + // Font A
                   ESC + "E" + (char)0; // bold off
        }

        private static string WithMargins(string line, ThermalLayout layout)
        {
            return new string(' ', layout.MarginCols) + Clip(line, layout.InnerCols);
        }

        private static string BuildLogoEscPos(JObject restaurantProfile)
        {
            var bits = Value(restaurantProfile, "print_logo_bitmap", "printLogoBitmap");
            int cols = ValueInt(restaurantProfile, "print_logo_cols", ValueInt(restaurantProfile, "printLogoCols", 0));
            int rows = ValueInt(restaurantProfile, "print_logo_rows", ValueInt(restaurantProfile, "printLogoRows", 0));
            if (string.IsNullOrEmpty(bits) || cols <= 0 || rows <= 0 || bits.Length < cols * rows) return "";
            int bytesPerRow = (cols + 7) / 8;
            var builder = new StringBuilder();
            builder.Append(ESC + "a" + "\x01"); // ALIGN_CENTER
            builder.Append(GS + "v0" + "\x00" + (char)(bytesPerRow & 0xff) + (char)((bytesPerRow >> 8) & 0xff) + (char)(rows & 0xff) + (char)((rows >> 8) & 0xff));
            for (int y = 0; y < rows; y++)
            {
                for (int bx = 0; bx < bytesPerRow; bx++)
                {
                    int bVal = 0;
                    for (int bit = 0; bit < 8; bit++)
                    {
                        int x = bx * 8 + bit;
                        if (x < cols && bits[y * cols + x] == '1') bVal |= 0x80 >> bit;
                    }
                    builder.Append((char)bVal);
                }
            }
            builder.Append("\r\n");
            builder.Append(ESC + "a" + "\x00"); // ALIGN_LEFT
            return builder.ToString();
        }

        private static string GetFontSizeCmd(string sizeStr)
        {
            if (string.IsNullOrEmpty(sizeStr)) return GS + "!" + "\u0000";
            switch (sizeStr.ToUpperInvariant())
            {
                case "DOUBLE":
                case "DOUBLE_WIDTH_HEIGHT":
                case "SIZE_2X":
                    return GS + "!" + "\u0011";
                case "DOUBLE_HEIGHT":
                case "SIZE_2H":
                    return GS + "!" + "\u0001";
                case "DOUBLE_WIDTH":
                case "SIZE_2W":
                    return GS + "!" + "\u0010";
                default:
                    return GS + "!" + "\u0000";
            }
        }

        private static bool ValueBool(JObject obj, string key, bool fallback)
        {
            var token = obj?[key];
            if (token != null && token.Type != JTokenType.Null)
            {
                if (token.Type == JTokenType.Boolean) return (bool)token;
                if (token.ToString().Equals("true", StringComparison.OrdinalIgnoreCase)) return true;
                if (token.ToString().Equals("false", StringComparison.OrdinalIgnoreCase)) return false;
            }
            return fallback;
        }

        private static int ValueInt(JObject obj, string key, int fallback)
        {
            var token = obj?[key];
            if (token != null && token.Type != JTokenType.Null)
            {
                if (int.TryParse(token.ToString(), out int val)) return val;
            }
            return fallback;
        }

        private static decimal ValueDecimal(JObject obj, string key, decimal fallback)
        {
            var token = obj?[key];
            if (token != null && token.Type != JTokenType.Null)
            {
                if (decimal.TryParse(token.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out decimal val)) return val;
            }
            return fallback;
        }

        private static string PickValue(JObject obj, string[] keys, string fallback = "")
        {
            foreach (var key in keys)
            {
                var token = obj?[key];
                if (token != null && token.Type != JTokenType.Null && !string.IsNullOrEmpty(token.ToString()))
                    return token.ToString();
            }
            return fallback;
        }

        private static decimal PickDecimal(JObject obj, string[] keys, decimal fallback = 0)
        {
            var valStr = PickValue(obj, keys);
            if (decimal.TryParse(valStr, NumberStyles.Any, CultureInfo.InvariantCulture, out decimal val))
                return val;
            return fallback;
        }

        private static decimal? PickNullableDecimal(JObject obj, string[] keys)
        {
            var valStr = PickValue(obj, keys);
            if (decimal.TryParse(valStr, NumberStyles.Any, CultureInfo.InvariantCulture, out decimal val))
                return val;
            return null;
        }

        private static List<string> WrapText(string text, int width)
        {
            if (string.IsNullOrEmpty(text)) return new List<string>();
            var words = text.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var lines = new List<string>();
            var line = "";
            foreach (var w in words)
            {
                var t = string.IsNullOrEmpty(line) ? w : line + " " + w;
                if (t.Length <= width)
                {
                    line = t;
                }
                else
                {
                    if (!string.IsNullOrEmpty(line)) lines.Add(line);
                    line = w.Length > width ? w.Substring(0, width) : w;
                }
            }
            if (!string.IsNullOrEmpty(line)) lines.Add(line);
            return lines;
        }

        private static string Clip(string s, int w)
        {
            var x = s ?? "";
            return x.Length > w ? x.Substring(0, w) : x;
        }

        private static string RightAlign(string s, int w)
        {
            var x = Clip(s, w);
            return new string(' ', Math.Max(0, w - x.Length)) + x;
        }

        private static string RightAlignEnd(string s, int w)
        {
            var x = s ?? "";
            var y = x.Length > w ? x.Substring(x.Length - w) : x;
            return new string(' ', Math.Max(0, w - y.Length)) + y;
        }

        private static string LeftAlign(string s, int w)
        {
            var x = Clip(s, w);
            return x + new string(' ', Math.Max(0, w - x.Length));
        }

        private static string Center(string s, int w)
        {
            var x = Clip(s, w);
            var padL = Math.Max(0, (w - x.Length) / 2);
            return new string(' ', padL) + x;
        }

        private static string KvLine(string label, string value, int W)
        {
            var l = label ?? "";
            var v = value ?? "";
            if (l.Length + v.Length + 1 > W) return l + " " + v;
            return l + new string(' ', W - l.Length - v.Length) + v;
        }

        private static string KvLineScaled(string label, string value, int W, int scaleW = 1)
        {
            int effW = Math.Max(10, W / scaleW);
            return KvLine(label, value, effW);
        }

        private sealed class DisplayItem
        {
            public string Name;
            public string VariantName;
            public decimal Quantity;
            public decimal Price;
            public decimal DiscountAmount;
            public decimal TaxAmount;
            public decimal LineTotal;
            public string ProductId;
            public bool IsPackagedGood;
            public string Category;
            public int? UomPrecision;
        }

        private static List<DisplayItem> ToDisplayItems(JObject order)
        {
            var keys = new[] { "lines", "orderLines", "lineItems", "order_items", "orderItems", "items" };
            JArray source = null;
            foreach (var key in keys)
            {
                var arr = order[key] as JArray;
                if (arr != null && arr.Count > 0)
                {
                    source = arr;
                    break;
                }
            }
            if (source == null) return new List<DisplayItem>();

            var list = new List<DisplayItem>();
            foreach (var token in source.OfType<JObject>())
            {
                var item = NormalizeDisplayItem(token);
                if (!string.IsNullOrEmpty(item.Name) || item.Quantity > 0 || item.Price > 0)
                {
                    list.Add(item);
                }
            }
            return list;
        }

        private static DisplayItem NormalizeDisplayItem(JObject raw)
        {
            var menu = raw["menu_items"] as JObject ?? raw["menuItem"] as JObject ?? raw["product"] as JObject ?? raw["productDto"] as JObject ?? raw["item"] as JObject ?? new JObject();
            
            var name = PickValue(raw, new[] {
                "productName", "product_name", "product_name_snapshot", "menuItemName", "menu_item_name", "item_name", "itemName", "displayName", "display_name", "name", "description"
            });
            if (string.IsNullOrEmpty(name))
            {
                name = PickValue(menu, new[] { "name", "productName", "product_name", "menuItemName", "item_name", "itemName", "displayName" }, "Item");
            }

            var variantName = PickValue(raw, new[] { "variantName", "variant_name", "variantname" });
            if (string.IsNullOrEmpty(variantName))
            {
                variantName = PickValue(menu, new[] { "variantName", "variant_name" });
            }

            var quantity = PickDecimal(raw, new[] { "quantity", "qty" }, 1);
            var price = PickDecimal(raw, new[] { "unitPrice", "unit_price", "price", "rate", "unitPriceIncTax", "unit_price_inc_tax" }, 0);
            
            var lineDisc = PickDecimal(raw, new[] { "line_discount_amount", "lineDiscountAmount" }, 0);
            var orderShare = PickDecimal(raw, new[] { "order_discount_share", "orderDiscountShare" }, 0);
            var discount = PickDecimal(raw, new[] { "discountAmount", "discount_amount" }, lineDisc + orderShare);
            var taxAmount = PickDecimal(raw, new[] { "taxAmount", "tax_amount" }, 0);
            
            var lineTotal = PickDecimal(raw, new[] { "lineTotal", "line_total", "total", "amount", "totalPrice" }, price * quantity);

            var productId = PickValue(raw, new[] { "productId", "product_id", "pid", "id" });
            if (string.IsNullOrEmpty(productId))
            {
                productId = PickValue(menu, new[] { "id", "productId" });
            }

            var isPackagedToken = raw["isPackagedGood"] ?? raw["is_packaged_good"] ?? raw["is_packaged"] ?? menu["isPackagedGood"] ?? menu["is_packaged_good"];
            bool isPackaged = isPackagedToken != null && isPackagedToken.Type == JTokenType.Boolean && (bool)isPackagedToken;

            // category
            string category = "";
            var catToken = raw["category"] ?? raw["categoryName"] ?? raw["category_name"] ?? menu["category"] ?? menu["categoryName"];
            if (catToken != null && catToken.Type != JTokenType.Null)
            {
                if (catToken is JObject catObj)
                {
                    category = PickValue(catObj, new[] { "name", "categoryName", "label" });
                }
                else
                {
                    category = catToken.ToString();
                }
            }

            int? uomPrecision = null;
            var uomPrecisionToken = raw["uom_precision"] ?? raw["uomPrecision"] ?? menu["uom"]?["precision"];
            if (uomPrecisionToken != null && uomPrecisionToken.Type != JTokenType.Null)
            {
                if (int.TryParse(uomPrecisionToken.ToString(), out int prec)) uomPrecision = prec;
            }

            return new DisplayItem
            {
                Name = name,
                VariantName = string.IsNullOrEmpty(variantName) ? null : variantName,
                Quantity = quantity,
                Price = price,
                DiscountAmount = discount,
                TaxAmount = taxAmount,
                LineTotal = lineTotal,
                ProductId = productId,
                IsPackagedGood = isPackaged,
                Category = category,
                UomPrecision = uomPrecision
            };
        }

        private static DateTime ParseDate(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return DateTime.Now;
            var s = raw;
            if (s.Contains("T") && !s.Contains("Z") && !s.Contains("+") && !s.Contains("-"))
            {
                s += "Z";
            }
            if (DateTime.TryParse(s, null, DateTimeStyles.RoundtripKind, out DateTime dt))
            {
                return dt.ToLocalTime();
            }
            if (DateTime.TryParse(raw, out dt))
            {
                return dt;
            }
            return DateTime.Now;
        }

        private static string GetOrderTypeLabel(JObject order)
        {
            if (order == null) return "";
            var tableNumber = PickValue(order, new[] { "table_number", "tableNumber" });
            if (!string.IsNullOrEmpty(tableNumber))
                return "Dine in (Table " + tableNumber + ")";
            var type = PickValue(order, new[] { "order_type", "orderType", "fulfillment_type", "fulfillmentType" }).ToLowerInvariant();
            if (type == "parcel" || type == "takeaway") return "Takeaway";
            if (type == "delivery") return "Delivery";
            if (type == "dine_in" || type == "dine-in") return "Dine in";
            return "";
        }

        private static string GetKotReference(JObject order)
        {
            var saleOrderNo = PickValue(order, new[] { "order_no", "orderNo", "saleOrderNo", "sale_order_no" }).Trim();
            if (!string.IsNullOrEmpty(saleOrderNo)) return saleOrderNo;
            var id = PickValue(order, new[] { "id" });
            if (!string.IsNullOrEmpty(id) && id.Length >= 8) return id.Substring(0, 8).ToUpperInvariant();
            return "N/A";
        }

        private static string GetTableHighlightLabel(JObject order)
        {
            var tableNumber = PickValue(order, new[] { "table_number", "tableNumber" }).Trim();
            if (!string.IsNullOrEmpty(tableNumber)) return "TABLE: " + tableNumber;
            return GetOrderTypeLabel(order).ToUpperInvariant();
        }

        private static string CustomerDisplay(JObject order)
        {
            var customers = order?["customers"] as JArray;
            if (customers != null && customers.Count > 0)
            {
                var list = new List<string>();
                foreach (var customer in customers.OfType<JObject>())
                {
                    var name = PickValue(customer, new[] { "name" }, "Guest").Trim();
                    if (string.IsNullOrEmpty(name)) name = "Guest";
                    var phone = PickValue(customer, new[] { "phone" }).Trim();
                    list.Add(string.IsNullOrEmpty(phone) ? name : name + " (" + phone + ")");
                }
                return string.Join(", ", list);
            }
            var custName = PickValue(order, new[] { "customer_name", "customerName" }).Trim();
            var custPhone = PickValue(order, new[] { "customer_phone", "customerPhone" }).Trim();
            if (string.IsNullOrEmpty(custName) && string.IsNullOrEmpty(custPhone)) return "";
            return (custName + " " + (string.IsNullOrEmpty(custPhone) ? "" : "(" + custPhone + ")")).Trim();
        }

        private static string FmtRate(decimal n)
        {
            if (n % 1 == 0) return ((int)n).ToString();
            return n.ToString("0.00", CultureInfo.InvariantCulture);
        }

        private struct BillCols
        {
            public int Name;
            public int Qty;
            public int Rate;
            public int Disc;
            public int Total;
            public bool ShowDiscCol;
        }

        private static BillCols GetBillCols(int innerW, bool hasDiscount)
        {
            bool showDiscCol = false;
            int gaps = showDiscCol ? 4 : 3;
            int qty = innerW >= 44 ? 6 : (innerW >= 38 ? 6 : 4);
            int rate = innerW >= 44 ? 7 : (innerW >= 38 ? 7 : 6);
            int disc = 0;
            int total = innerW >= 44 ? 8 : (innerW >= 38 ? 7 : 6);
            int fixedCols = qty + rate + total + disc + gaps;
            int name = innerW - fixedCols;
            if (name < 8)
            {
                qty = 3;
                rate = 5;
                disc = 0;
                total = 6;
                int fixedCols2 = qty + rate + total + disc + gaps;
                name = Math.Max(6, innerW - fixedCols2);
            }
            return new BillCols
            {
                Name = name,
                Qty = qty,
                Rate = rate,
                Disc = disc,
                Total = total,
                ShowDiscCol = showDiscCol
            };
        }

        private static KotGdiState BuildKotGdiState(JObject order, JObject config, PrinterProfile profile, int attempt)
        {
            var state = new KotGdiState
            {
                Layout = GetLayout(config, profile, "kot"),
                Template = EffectiveThermalTemplate(config, profile, "kot")
            };

            var tpl = state.Template;
            var layout = state.Layout;
            int W = layout.InnerCols;
            string dashes = new string('-', W);
            string normalSize = "NORMAL";
            string titleSize = layout.PaperMm >= 76
                ? PickTemplateValue(tpl, new[] { "titleFontSize", "kotTitleFontSize" }, "DOUBLE")
                : "NORMAL";
            string tableSize = "DOUBLE";
            string bodySize = layout.PaperMm >= 76
                ? PickTemplateValue(tpl, new[] { "fontSize", "kotFontSize" }, "NORMAL")
                : "NORMAL";

            void Add(string text, ThermalLineAlignment alignment = ThermalLineAlignment.Left, string fontSize = null, bool bold = false)
            {
                state.Lines.Add(new ThermalVisualLine
                {
                    Text = text ?? "",
                    Alignment = alignment,
                    FontSize = fontSize ?? normalSize,
                    Bold = bold
                });
            }

            var items = ToDisplayItems(order);
            JArray removedArray = null;
            if (order["removed_items"] is JArray r1 && r1.Count > 0) removedArray = r1;
            else if (order["removedItems"] is JArray r2 && r2.Count > 0) removedArray = r2;

            var removedItems = new List<JObject>();
            if (removedArray != null)
            {
                foreach (var ri in removedArray.OfType<JObject>())
                {
                    var qty = PickDecimal(ri, new[] { "quantity", "qty" }, 0);
                    if (qty > 0) removedItems.Add(ri);
                }
            }

            var restaurantProfile = config?["restaurant"] as JObject ?? order["restaurant"] as JObject ?? new JObject();
            bool showRestaurantName = ValueBool(tpl, "showRestaurantName", true);
            bool showDailyBillNo = ValueBool(tpl, "showDailyBillNo", true);
            bool showCustomerDetails = ValueBool(tpl, "showCustomerDetails", true);
            bool showTableLabel = ValueBool(tpl, "showTableLabel", true);

            string kotHeader = PickTemplateValue(tpl, new[] { "header", "kotHeader" }, "*** KOT ***");
            string kotFooter = PickTemplateValue(tpl, new[] { "footer", "kotFooter" }, "*** SEND TO KITCHEN ***");

            string restaurantName = PickValue(restaurantProfile, new[] { "restaurantName", "restaurant_name", "name" });
            if (string.IsNullOrEmpty(restaurantName))
            {
                restaurantName = PickValue(order, new[] { "restaurantName", "restaurant_name" }, "RESTAURANT");
            }
            restaurantName = restaurantName.ToUpperInvariant();

            if (attempt > 1)
            {
                Add("*** REPRINT ***", ThermalLineAlignment.Center, normalSize, true);
            }

            if (showRestaurantName)
            {
                int titleScale = IsWideThermalSize(titleSize) ? 2 : 1;
                foreach (var line in WrapText(restaurantName, Math.Max(8, W / titleScale)))
                {
                    Add(line, ThermalLineAlignment.Center, titleSize, true);
                }
            }

            Add(dashes);
            Add(kotHeader, ThermalLineAlignment.Center, normalSize, true);

            bool isEditedOrder = ValueBool(order, "is_edited", false) || ValueBool(order, "isEdited", false);
            if (isEditedOrder)
            {
                Add("** EDITED ORDER **", ThermalLineAlignment.Center, normalSize, true);
            }

            var orderDate = ParseDate(PickValue(order, new[] { "created_at", "createdAt", "order_date", "orderDate" }));
            var dateStr = orderDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            var timeStr = orderDate.ToString("hh:mm tt", CultureInfo.InvariantCulture).ToLowerInvariant();
            Add(dateStr + " " + timeStr);
            Add("KOT Ref: " + GetKotReference(order));

            var dailyBillNo = PickValue(order, new[] { "dailyBillNo", "daily_bill_no" });
            if (showDailyBillNo && !string.IsNullOrEmpty(dailyBillNo))
            {
                Add("Daily Bill No: " + dailyBillNo);
            }

            var staffName = PickValue(order, new[] { "taken_by_name", "takenByName" }).Trim();
            if (!string.IsNullOrEmpty(staffName))
            {
                Add("Attended by: " + staffName);
            }

            var customerCount = PickValue(order, new[] { "number_of_customers", "numberOfCustomers", "numberofcustomers" });
            if (!string.IsNullOrEmpty(customerCount))
            {
                Add("No. of Customers: " + customerCount);
            }

            var customerText = CustomerDisplay(order);
            if (showCustomerDetails && !string.IsNullOrEmpty(customerText))
            {
                Add("Customer: " + customerText);
            }

            var inst = PickValue(order, new[] { "special_instructions", "specialInstructions", "instructions" }).Trim();
            if (!string.IsNullOrEmpty(inst))
            {
                Add(dashes);
                foreach (var rawLine in inst.Split('\n'))
                {
                    var trimmed = rawLine.Trim();
                    if (string.IsNullOrEmpty(trimmed)) continue;
                    foreach (var wrapped in WrapText(trimmed, W))
                    {
                        Add(wrapped);
                    }
                }
            }

            Add(dashes);

            var tableLabel = GetTableHighlightLabel(order);
            if (showTableLabel && !string.IsNullOrEmpty(tableLabel))
            {
                int tableScale = IsWideThermalSize(tableSize) ? 2 : 1;
                foreach (var line in WrapText(tableLabel, Math.Max(8, W / tableScale)))
                {
                    Add(line, ThermalLineAlignment.Center, tableSize, true);
                }
                Add(dashes);
            }

            if (items.Count > 0)
            {
                int itemScale = IsWideThermalSize(bodySize) ? 2 : 1;
                int itemCols = Math.Max(16, W / itemScale);
                int itemQtyW = layout.PaperMm >= 76 ? 4 : 6;
                int itemNameW = Math.Max(8, itemCols - itemQtyW - 1);

                Add(LeftAlign("ITEM", itemNameW) + " " + RightAlign("QTY", itemQtyW), ThermalLineAlignment.Left, normalSize, true);
                Add(dashes);
                foreach (var it in items)
                {
                    string displayName = !string.IsNullOrEmpty(it.VariantName) ? it.Name + " (" + it.VariantName + ")" : it.Name;
                    var nameLines = WrapText(displayName, itemNameW);
                    if (nameLines.Count == 0) continue;

                    int precision = it.UomPrecision.HasValue ? it.UomPrecision.Value : (it.Quantity % 1 == 0 ? 0 : 2);
                    string qtyStr = RightAlign(it.Quantity.ToString("F" + precision, CultureInfo.InvariantCulture), itemQtyW);

                    Add(LeftAlign(nameLines[0], itemNameW) + " " + qtyStr, ThermalLineAlignment.Left, bodySize, true);
                    for (int i = 1; i < nameLines.Count; i++)
                    {
                        Add(nameLines[i], ThermalLineAlignment.Left, bodySize, true);
                    }
                }
            }

            if (removedItems.Count > 0)
            {
                int qtyW = 6;
                int nameW = Math.Max(10, W - (qtyW + 1));
                Add(dashes);
                Add("*** REMOVED ITEMS ***", ThermalLineAlignment.Center, normalSize, true);
                Add(LeftAlign("ITEM", nameW) + " " + RightAlign("QTY", qtyW), ThermalLineAlignment.Left, normalSize, true);
                foreach (var ri in removedItems)
                {
                    var riName = PickValue(ri, new[] { "name", "productName", "product_name", "item_name" }, "Item");
                    var riVariant = PickValue(ri, new[] { "variant_name", "variantName", "variant_label" });
                    string displayName = !string.IsNullOrEmpty(riVariant) ? riName + " (" + riVariant + ")" : riName;
                    var nameLines = WrapText(displayName, nameW);
                    if (nameLines.Count == 0) continue;

                    decimal qtyNum = PickDecimal(ri, new[] { "quantity", "qty" }, 1);
                    int precision = qtyNum % 1 == 0 ? 0 : 2;
                    string qtyStr = RightAlign(qtyNum.ToString("F" + precision, CultureInfo.InvariantCulture), qtyW);

                    Add(LeftAlign("- " + nameLines[0], nameW) + " " + qtyStr, ThermalLineAlignment.Left, normalSize, true);
                    for (int i = 1; i < nameLines.Count; i++)
                    {
                        Add("  " + nameLines[i], ThermalLineAlignment.Left, normalSize, true);
                    }
                }
            }

            Add(dashes);
            Add(kotFooter, ThermalLineAlignment.Center, normalSize, true);
            Add("");

            state.PageHeightHundredths = EstimateKotPageHeightHundredths(state);
            return state;
        }

        private static int EstimateKotPageHeightHundredths(KotGdiState state)
        {
            var total = 18;
            foreach (var line in state.Lines)
            {
                total += EstimateLineHeightHundredths(line.FontSize, state.Layout.PaperMm);
            }

            var feedLines = ValueInt(state.Template, "feedLines", 3);
            total += Math.Max(1, feedLines) * EstimateLineHeightHundredths("NORMAL", state.Layout.PaperMm);
            return Math.Max(MmToHundredths(70m), total);
        }

        private static int EstimateLineHeightHundredths(string size, int paperMm)
        {
            var pointSize = ThermalFontPoints(size, paperMm);
            return (int)Math.Ceiling((pointSize / 72f * 100f) + 5f);
        }

        private static void DrawKotGdi(PrintPageEventArgs args, KotGdiState state)
        {
            var graphics = args.Graphics;
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;

            var pageBounds = args.PageBounds;
            var pageWidth = pageBounds.Width > 0 ? pageBounds.Width : MmToHundredths(state.Layout.PaperMm);
            var leftMargin = DotsToHundredths(state.Layout.LeftDots, state.Layout);
            var rightMargin = DotsToHundredths(state.Layout.RightDots, state.Layout);
            var minMargin = MmToHundredthsFloat(1.5m);
            leftMargin = Math.Max(minMargin, leftMargin);
            rightMargin = Math.Max(minMargin, rightMargin);
            if (leftMargin + rightMargin > pageWidth * 0.35f)
            {
                leftMargin = minMargin;
                rightMargin = minMargin;
            }

            var content = new RectangleF(
                pageBounds.Left + leftMargin,
                pageBounds.Top + MmToHundredthsFloat(2m),
                Math.Max(40f, pageWidth - leftMargin - rightMargin),
                pageBounds.Height);
            float y = content.Top;
            var fontCache = new Dictionary<string, Font>();

            try
            {
                foreach (var line in state.Lines)
                {
                    var font = GetThermalFont(fontCache, line.FontSize, line.Bold, state.Layout.PaperMm);
                    var height = Math.Max(EstimateLineHeightHundredths(line.FontSize, state.Layout.PaperMm), font.GetHeight(graphics) + 3f);
                    using (var format = new StringFormat
                    {
                        Alignment = line.Alignment == ThermalLineAlignment.Center ? StringAlignment.Center : StringAlignment.Near,
                        LineAlignment = StringAlignment.Near,
                        FormatFlags = StringFormatFlags.NoWrap,
                        Trimming = StringTrimming.Character
                    })
                    {
                        graphics.DrawString(line.Text ?? "", font, Brushes.Black, new RectangleF(content.Left, y, content.Width, height), format);
                    }
                    y += height;
                }
            }
            finally
            {
                foreach (var font in fontCache.Values)
                {
                    font.Dispose();
                }
            }

            args.HasMorePages = false;
        }

        private static Font GetThermalFont(Dictionary<string, Font> cache, string size, bool bold, int paperMm)
        {
            var key = (size ?? "NORMAL") + "|" + bold + "|" + paperMm;
            if (!cache.TryGetValue(key, out var font))
            {
                font = new Font("Courier New", ThermalFontPoints(size, paperMm), bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
                cache[key] = font;
            }
            return font;
        }

        private static float ThermalFontPoints(string size, int paperMm)
        {
            var normal = paperMm >= 76 ? 9.5f : 8.5f;
            switch ((size ?? "").ToUpperInvariant())
            {
                case "DOUBLE":
                case "DOUBLE_WIDTH_HEIGHT":
                case "SIZE_2X":
                    return normal * 1.65f;
                case "DOUBLE_HEIGHT":
                case "SIZE_2H":
                    return normal * 1.55f;
                case "DOUBLE_WIDTH":
                case "SIZE_2W":
                    return normal * 1.25f;
                default:
                    return normal;
            }
        }

        private static bool IsWideThermalSize(string size)
        {
            switch ((size ?? "").ToUpperInvariant())
            {
                case "DOUBLE":
                case "DOUBLE_WIDTH_HEIGHT":
                case "SIZE_2X":
                case "DOUBLE_WIDTH":
                case "SIZE_2W":
                    return true;
                default:
                    return false;
            }
        }

        private static float DotsToHundredths(int dots, ThermalLayout layout)
        {
            if (dots <= 0 || layout.DotWidth <= 0) return 0f;
            return (float)dots / layout.DotWidth * MmToHundredths(layout.PaperMm);
        }

        private static float MmToHundredthsFloat(decimal mm) => (float)(mm / 25.4m * 100m);

        private static string BuildKotText(JObject order, JObject config, PrinterProfile profile)
        {
            var items = ToDisplayItems(order);
            JArray removedArray = null;
            if (order["removed_items"] is JArray r1 && r1.Count > 0) removedArray = r1;
            else if (order["removedItems"] is JArray r2 && r2.Count > 0) removedArray = r2;

            var removedItems = new List<JObject>();
            if (removedArray != null)
            {
                foreach (var ri in removedArray.OfType<JObject>())
                {
                    var qty = PickDecimal(ri, new[] { "quantity", "qty" }, 0);
                    if (qty > 0) removedItems.Add(ri);
                }
            }

            var tpl = EffectiveThermalTemplate(config, profile, "kot");
            var layout = GetLayout(config, profile, "kot");
            int W = layout.InnerCols;
            string dashes = new string('-', W);

            var restaurantProfile = config?["restaurant"] as JObject ?? order["restaurant"] as JObject ?? new JObject();

            bool showRestaurantName = tpl != null ? ValueBool(tpl, "showRestaurantName", true) : true;
            bool showDailyBillNo = tpl != null ? ValueBool(tpl, "showDailyBillNo", true) : true;
            bool showCustomerDetails = tpl != null ? ValueBool(tpl, "showCustomerDetails", true) : true;
            bool showTableLabel = tpl != null ? ValueBool(tpl, "showTableLabel", true) : true;
            bool showFssai = tpl != null ? ValueBool(tpl, "showFssai", true) : true;

            string kotHeader = PickTemplateValue(tpl, new[] { "header", "kotHeader" }, "*** KOT ***");
            string kotFooter = PickTemplateValue(tpl, new[] { "footer", "kotFooter" }, "*** SEND TO KITCHEN ***");

            string restaurantName = PickValue(restaurantProfile, new[] { "restaurantName", "restaurant_name", "name" });
            if (string.IsNullOrEmpty(restaurantName))
            {
                restaurantName = PickValue(order, new[] { "restaurantName", "restaurant_name" }, "RESTAURANT");
            }
            restaurantName = restaurantName.ToUpperInvariant();

            var kotReference = GetKotReference(order);
            var tableLabel = GetTableHighlightLabel(order);

            var orderDate = ParseDate(PickValue(order, new[] { "created_at", "createdAt", "order_date", "orderDate" }));
            var dateStr = orderDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            var timeStr = orderDate.ToString("hh:mm tt", CultureInfo.InvariantCulture).ToLowerInvariant();

int qtyW = 6;
            int nameW = Math.Max(10, W - (qtyW + 1));
            var lines = new List<string>();

            bool is80 = layout.PaperMm >= 76;
            lines.Add(ESC + "a" + "\u0001"); // ALIGN_CENTER
            
            if (showRestaurantName)
            {
                lines.Add(MODE_BOLD + (is80 ? SIZE_2X : SIZE_1X) + restaurantName + SIZE_1X + MODE_NO_BOLD);
            }
            lines.Add(ESC + "a" + "\u0000"); // ALIGN_LEFT
            lines.Add(WithMargins(dashes, layout));
            lines.Add(WithMargins(Center(kotHeader, W), layout));

            bool isEditedOrder = ValueBool(order, "is_edited", false) || ValueBool(order, "isEdited", false);
            if (isEditedOrder)
            {
                lines.Add(ESC + "a" + "\x01"); // ALIGN_CENTER
                lines.Add(MODE_BOLD + Center("** EDITED ORDER **", W) + MODE_NO_BOLD);
                lines.Add(ESC + "a" + "\x00"); // ALIGN_LEFT
            }

            lines.Add(WithMargins(dateStr + " " + timeStr, layout));
            lines.Add(WithMargins("KOT Ref: " + kotReference, layout));

            var dailyBillNo = PickValue(order, new[] { "dailyBillNo", "daily_bill_no" });
            if (showDailyBillNo && !string.IsNullOrEmpty(dailyBillNo))
            {
                lines.Add(WithMargins("Daily Bill No: " + dailyBillNo, layout));
            }

            var staffName = PickValue(order, new[] { "taken_by_name", "takenByName" }).Trim();
            if (!string.IsNullOrEmpty(staffName))
            {
                lines.Add(WithMargins("Attended by: " + staffName, layout));
            }

            var customerCount = PickValue(order, new[] { "number_of_customers", "numberOfCustomers", "numberofcustomers" });
            if (!string.IsNullOrEmpty(customerCount))
            {
                lines.Add(WithMargins("No. of Customers: " + customerCount, layout));
            }

            var customerText = CustomerDisplay(order);
            var inst = PickValue(order, new[] { "special_instructions", "specialInstructions", "instructions" }).Trim();

            if (showCustomerDetails && !string.IsNullOrEmpty(customerText))
            {
                lines.Add(WithMargins("Customer: " + customerText, layout));
            }

            if (!string.IsNullOrEmpty(inst))
            {
                lines.Add(WithMargins(dashes, layout));
                var instLines = inst.Split('\n');
                foreach (var rawLine in instLines)
                {
                    var trimmed = rawLine.Trim();
                    if (string.IsNullOrEmpty(trimmed)) continue;
                    foreach (var wl in WrapText(trimmed, W))
                    {
                        lines.Add(WithMargins(wl, layout));
                    }
                }
            }

            lines.Add(WithMargins(dashes, layout));

            if (showTableLabel && !string.IsNullOrEmpty(tableLabel))
            {
                lines.Add(ESC + "a" + "\u0001"); // ALIGN_CENTER
                lines.Add(MODE_BOLD + SIZE_2X + tableLabel + SIZE_1X + MODE_NO_BOLD);
                lines.Add(ESC + "a" + "\u0000"); // ALIGN_LEFT
                lines.Add(WithMargins(dashes, layout));
            }

            if (items.Count > 0)
            {
                int itemScale = is80 ? 2 : 1;
                int itemCols = Math.Max(16, W / itemScale);
                int itemQtyW = is80 ? 4 : qtyW;
                int itemNameW = Math.Max(8, itemCols - itemQtyW - 1);

                lines.Add(WithMargins(LeftAlign("ITEM", itemNameW) + " " + RightAlign("QTY", itemQtyW), layout));
                lines.Add(WithMargins(dashes, layout));

                string bodySizeCmd = is80 ? GetFontSizeCmd(PickTemplateValue(tpl, new[] { "fontSize", "kotFontSize" }, "NORMAL")) : SIZE_1X;
                lines.Add(MODE_BOLD + bodySizeCmd);
                foreach (var it in items)
                {
                    string displayName = !string.IsNullOrEmpty(it.VariantName) ? it.Name + " (" + it.VariantName + ")" : it.Name;
                    var nameLines = WrapText(displayName, itemNameW);
                    if (nameLines.Count == 0) continue;
                    
                    int p = it.UomPrecision.HasValue ? it.UomPrecision.Value : (it.Quantity % 1 == 0 ? 0 : 2);
                    string qtyStr = RightAlign(it.Quantity.ToString("F" + p, CultureInfo.InvariantCulture), itemQtyW);
                    
                    lines.Add(WithMargins(LeftAlign(nameLines[0], itemNameW) + " " + qtyStr, layout));
                    for (int i = 1; i < nameLines.Count; i++)
                    {
                        lines.Add(WithMargins(nameLines[i], layout));
                    }
                }
                lines.Add(SIZE_1X + MODE_NO_BOLD);
            }

            if (removedItems.Count > 0)
            {
                lines.Add(WithMargins(dashes, layout));
                lines.Add(WithMargins(Center("*** REMOVED ITEMS ***", W), layout));
                lines.Add(WithMargins(LeftAlign("ITEM", nameW) + " " + RightAlign("QTY", qtyW), layout));
                lines.Add(MODE_BOLD);
                foreach (var ri in removedItems)
                {
                    var riName = PickValue(ri, new[] { "name", "productName", "product_name", "item_name" }, "Item");
                    var riVariant = PickValue(ri, new[] { "variant_name", "variantName", "variant_label" });
                    string displayName = !string.IsNullOrEmpty(riVariant) ? riName + " (" + riVariant + ")" : riName;
                    var nameLines = WrapText(displayName, nameW);
                    if (nameLines.Count == 0) continue;

                    decimal qtyNum = PickDecimal(ri, new[] { "quantity", "qty" }, 1);
                    int p = qtyNum % 1 == 0 ? 0 : 2;
                    string qtyStr = RightAlign(qtyNum.ToString("F" + p, CultureInfo.InvariantCulture), qtyW);

                    lines.Add(WithMargins(LeftAlign("- " + nameLines[0], nameW) + " " + qtyStr, layout));
                    for (int i = 1; i < nameLines.Count; i++)
                    {
                        lines.Add(WithMargins("  " + nameLines[i], layout));
                    }
                }
                lines.Add(MODE_NO_BOLD);
            }

            lines.Add(WithMargins(dashes, layout));
            lines.Add(WithMargins(Center(kotFooter, W), layout));
            lines.Add("");

            return EscposPageSetup(layout) + string.Join("\n", lines);
        }

        private static string BuildReceiptText(JObject order, JObject bill, JObject config, PrinterProfile profile)
        {
            var items = ToDisplayItems(order);
            var tpl = EffectiveThermalTemplate(config, profile, "receipt");
            var layout = GetLayout(config, profile, "receipt");
            int W = layout.InnerCols;
            string dashes = new string('-', W);

            var restaurantProfile = config?["restaurant"] as JObject ?? order["restaurant"] as JObject ?? new JObject();

            string restaurantName = PickValue(restaurantProfile, new[] { "restaurantName", "restaurant_name", "name" });
            if (string.IsNullOrEmpty(restaurantName))
            {
                restaurantName = PickValue(order, new[] { "restaurantName", "restaurant_name" }, "RESTAURANT");
            }
            restaurantName = restaurantName.ToUpperInvariant();

            var addressParts = new List<string> {
                PickValue(restaurantProfile, new[] { "shipping_address_line1" }),
                PickValue(restaurantProfile, new[] { "shipping_address_line2" }),
                PickValue(restaurantProfile, new[] { "shipping_city" }),
                PickValue(restaurantProfile, new[] { "shipping_address_state", "shippingState" }),
                PickValue(restaurantProfile, new[] { "shipping_pincode" })
            };
            addressParts.RemoveAll(string.IsNullOrEmpty);
            string address = addressParts.Count > 0 ? string.Join(", ", addressParts) : PickValue(order, new[] { "restaurant_address", "restaurantAddress" });

            string phone = PickValue(restaurantProfile, new[] { "shipping_phone", "phone" });
            if (string.IsNullOrEmpty(phone)) phone = PickValue(order, new[] { "restaurant_phone", "restaurantPhone" });

            string fssai = PickValue(restaurantProfile, new[] { "fssai_license", "fssai", "fssaiNumber" });
            string gstin = PickValue(restaurantProfile, new[] { "gstin", "gstNumber", "taxIdentity" });

            string orderType = GetOrderTypeLabel(order);
            string invoiceNo = PickValue(bill, new[] { "invoice_no", "invoiceNo" });
            if (string.IsNullOrEmpty(invoiceNo)) invoiceNo = PickValue(order, new[] { "invoice_no", "invoiceNo" });
            
            string billNo = PickValue(bill, new[] { "bill_no", "billNo" });
            if (string.IsNullOrEmpty(billNo)) billNo = PickValue(order, new[] { "bill_no", "billNo" });

            var orderDate = ParseDate(PickValue(order, new[] { "created_at", "createdAt", "order_date", "orderDate" }));
            var dateStr = orderDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            var timeStr = orderDate.ToString("hh:mm tt", CultureInfo.InvariantCulture).ToLowerInvariant();

            decimal roundOff = PickDecimal(order, new[] { "round_off_amount", "roundOffAmount" }, PickDecimal(bill, new[] { "round_off_amount", "roundOffAmount" }, 0));
            decimal oTotalTax = PickDecimal(order, new[] { "total_tax", "totalTax", "totalTaxAmount" }, PickDecimal(bill, new[] { "total_tax", "totalTax", "tax_total", "taxTotal" }, 0));
            decimal? explicitGrandTotal = PickNullableDecimal(order, new[] { "grandTotal", "grand_total" })
                ?? PickNullableDecimal(bill, new[] { "grandTotal", "grand_total" });
            decimal? explicitInvoiceTotal = PickNullableDecimal(order, new[] { "totalAmount", "total_amount" })
                ?? PickNullableDecimal(bill, new[] { "totalAmount", "total_amount" });
            decimal oGrandTotal = explicitGrandTotal ?? explicitInvoiceTotal ?? 0m;
            bool hasRoundOff = Math.Abs(roundOff) > 0.001m;
            decimal invoiceTotal = hasRoundOff ? oGrandTotal - roundOff : (explicitInvoiceTotal ?? oGrandTotal);
            if (invoiceTotal < 0m) invoiceTotal = 0m;
            decimal subtotalTaxable = invoiceTotal - oTotalTax;
            if (subtotalTaxable < 0m) subtotalTaxable = 0m;
            subtotalTaxable = Math.Round(subtotalTaxable, 2, MidpointRounding.AwayFromZero);

            bool pricesIncludeTax = ValueBool(order, "prices_include_tax", false) || ValueBool(order, "pricesIncludeTax", false) || ValueBool(bill, "prices_include_tax", false) || ValueBool(bill, "pricesIncludeTax", false);
            bool isAllPackaged = items.Count > 0 && items.All(it => it.IsPackagedGood);
            bool isInclusiveMode = isAllPackaged || pricesIncludeTax;

            bool hasLineDiscount = items.Any(it => it.DiscountAmount > 0.001m);
            
            bool showRestaurantName = tpl != null ? ValueBool(tpl, "showRestaurantName", true) : true;
            bool showDailyBillNo = tpl != null ? ValueBool(tpl, "showDailyBillNo", true) : true;
            bool showCustomerDetails = tpl != null ? ValueBool(tpl, "showCustomerDetails", true) : true;
            bool showTableLabel = tpl != null ? ValueBool(tpl, "showTableLabel", true) : true;
            bool showFssai = tpl != null ? ValueBool(tpl, "showFssai", true) : true;
            bool showGstBreakdown = tpl != null ? ValueBool(tpl, "showGstBreakdown", true) : true;

            string receiptHeader = PickTemplateValue(tpl, new[] { "header", "receiptHeader" }, "*** TAX INVOICE ***");
            string receiptFooter = PickTemplateValue(tpl, new[] { "footer", "receiptFooter" }, "* THANK YOU! VISIT AGAIN !! *");
            bool billFooterEnabled = ValueBool(restaurantProfile, "bill_footer_enabled", ValueBool(restaurantProfile, "billFooterEnabled", true));
            string billFooterText = billFooterEnabled
                ? PickValue(restaurantProfile, new[] { "bill_footer_text", "billFooter", "bill_footer" }).Trim()
                : "";

            // Determine columns for bill printing
            var billCols = GetBillCols(W, hasLineDiscount);
            int nameW = billCols.Name;
            int qtyW = billCols.Qty;
            int rateW = billCols.Rate;
            int discW = billCols.Disc;
            int totalW = billCols.Total;
            bool showDiscCol = billCols.ShowDiscCol;

            var lines = new List<string>();
            bool is80 = layout.PaperMm >= 76;

            lines.Add(ESC + "a" + "\u0001"); // ALIGN_CENTER
            if (showRestaurantName)
            {
                lines.Add(MODE_BOLD + (is80 ? SIZE_2X : SIZE_1X) + restaurantName + SIZE_1X + MODE_NO_BOLD);
            }
            lines.Add(ESC + "a" + "\u0000"); // ALIGN_LEFT

            foreach (var l in WrapText(address, W))
            {
                lines.Add(WithMargins(Center(l, W), layout));
            }
            if (!string.IsNullOrEmpty(phone))
            {
                lines.Add(WithMargins(Center("Contact No.: " + phone, W), layout));
            }
            if (showFssai && !string.IsNullOrEmpty(fssai))
            {
                lines.Add(WithMargins(Center("FSSAI: " + fssai, W), layout));
            }
            if (showGstBreakdown && !string.IsNullOrEmpty(gstin))
            {
                lines.Add(WithMargins(Center("GSTIN: " + gstin, W), layout));
            }
            lines.Add(WithMargins(dashes, layout));
            lines.Add(WithMargins(dateStr + " " + timeStr, layout));
            if (!string.IsNullOrEmpty(invoiceNo)) lines.Add(WithMargins("Invoice: " + invoiceNo, layout));
            if (!string.IsNullOrEmpty(billNo)) lines.Add(WithMargins("Bill No: " + billNo, layout));
            
            var dailyBillNo = PickValue(bill, new[] { "dailyBillNo", "daily_bill_no" });
            if (string.IsNullOrEmpty(dailyBillNo)) dailyBillNo = PickValue(order, new[] { "dailyBillNo", "daily_bill_no" });
            if (showDailyBillNo && !string.IsNullOrEmpty(dailyBillNo))
            {
                lines.Add(WithMargins("Daily Bill No: " + dailyBillNo, layout));
            }
            if (showTableLabel && !string.IsNullOrEmpty(orderType)) lines.Add(WithMargins("Order Type: " + orderType, layout));

            var customerText = CustomerDisplay(order);
            if (showCustomerDetails && !string.IsNullOrEmpty(customerText))
            {
                lines.Add(WithMargins("Customer: " + customerText, layout));
            }

            if (!string.IsNullOrEmpty(receiptHeader))
            {
                lines.Add(WithMargins(dashes, layout));
                PushWrappedCenteredText(lines, receiptHeader, W, layout);
            }

            lines.Add(WithMargins(dashes, layout));
            
            string header = LeftAlign("ITEM", nameW) + " " + RightAlign("QTY", qtyW) + " " + RightAlign("RATE", rateW);
            if (showDiscCol) header += " " + RightAlign("DISC", discW);
            header += " " + RightAlign("TOTAL", totalW);
            lines.Add(WithMargins(header, layout));
            lines.Add(WithMargins(dashes, layout));

            string bodySizeCmd = GetFontSizeCmd(PickTemplateValue(tpl, new[] { "fontSize" }, "NORMAL"));
            lines.Add(bodySizeCmd);

            foreach (var it in items)
            {
                decimal rateNum = it.Price;
                decimal lineTotalNum = it.LineTotal;
                string displayName = !string.IsNullOrEmpty(it.VariantName) ? it.Name + " (" + it.VariantName + ")" : it.Name;
                var nameLines = WrapText(displayName, nameW);
                if (nameLines.Count == 0) continue;

                string qtyStr = it.Quantity % 1 == 0 ? ((int)it.Quantity).ToString() : it.Quantity.ToString("0.00", CultureInfo.InvariantCulture);
                string totalStr = lineTotalNum.ToString("0.00", CultureInfo.InvariantCulture);
                
                string row = LeftAlign(nameLines[0], nameW) + " " + RightAlignEnd(qtyStr, qtyW) + " " + RightAlignEnd(FmtRate(rateNum), rateW);
                if (showDiscCol) row += " " + RightAlignEnd("", discW);
                row += " " + RightAlignEnd(totalStr, totalW);
                
                lines.Add(WithMargins(row, layout));
                for (int i = 1; i < nameLines.Count; i++)
                {
                    lines.Add(WithMargins(nameLines[i], layout));
                }
            }
            lines.Add(SIZE_1X);

            lines.Add(WithMargins(dashes, layout));
            decimal itemsGrossTotal = items.Sum(it => it.Price * it.Quantity);
            decimal? explicitTotalDiscount = PickNullableDecimal(order, new[] { "totalDiscountAmount", "total_discount_amount" })
                ?? PickNullableDecimal(bill, new[] { "totalDiscountAmount", "total_discount_amount" });
            decimal lineDiscountTotal = items.Sum(it => it.DiscountAmount);
            decimal orderLevelDiscount = PickDecimal(order, new[] { "discount_amount", "discountAmount" }, PickDecimal(bill, new[] { "discount_amount", "discountAmount" }, 0));
            decimal totalReduction = Math.Max(explicitTotalDiscount ?? 0m, lineDiscountTotal + orderLevelDiscount);
            bool shouldShowGrossTotal = totalReduction > 0.01m || Math.Abs(itemsGrossTotal - subtotalTaxable) > 0.01m;
            bool shouldShowSubtotal = oTotalTax > 0.01m || totalReduction > 0.01m || shouldShowGrossTotal;

            if (shouldShowGrossTotal)
            {
                lines.Add(WithMargins(KvLine(isInclusiveMode ? "Items Total:" : "Gross Total:", FmtRate(itemsGrossTotal), W), layout));
            }
            if (totalReduction > 0.01m)
            {
                lines.Add(WithMargins(KvLine("Discount:", "-" + FmtRate(totalReduction), W), layout));
            }
            if (shouldShowSubtotal)
            {
                lines.Add(WithMargins(KvLine("Subtotal:", FmtRate(subtotalTaxable), W), layout));
            }
            if (showGstBreakdown && oTotalTax > 0.01m)
            {
                decimal c = Math.Round((oTotalTax / 2m) * 100m) / 100m;
                decimal s = Math.Round((oTotalTax / 2m) * 100m) / 100m;
                lines.Add(WithMargins(KvLine("CGST " + (pricesIncludeTax ? "(incl)" : "") + ":", FmtRate(c), W), layout));
                lines.Add(WithMargins(KvLine("SGST " + (pricesIncludeTax ? "(incl)" : "") + ":", FmtRate(s), W), layout));
            }
            if (hasRoundOff)
            {
                lines.Add(WithMargins(KvLine("Round Off:", (roundOff > 0m ? "+" : "") + FmtRate(roundOff), W), layout));
            }
            lines.Add(WithMargins(dashes, layout));
            
            lines.Add(MODE_BOLD + SIZE_2X + WithMargins(KvLineScaled("TOTAL:", FmtRate(oGrandTotal), W, 2), layout) + SIZE_1X + MODE_NO_BOLD);
            lines.Add(WithMargins(dashes, layout));

            if (!string.IsNullOrEmpty(receiptFooter))
            {
                PushWrappedCenteredText(lines, receiptFooter, W, layout);
            }
            if (!string.IsNullOrEmpty(billFooterText))
            {
                PushWrappedCenteredText(lines, billFooterText, W, layout);
            }
            PushWrappedCenteredText(lines, "Powered by Cafe QR", W, layout);
            lines.Add("");

            return EscposPageSetup(layout) + BuildLogoEscPos(restaurantProfile) + string.Join("\n", lines);
        }

        private static void PushWrappedCenteredText(List<string> lines, string text, int W, ThermalLayout layout)
        {
            var value = (text ?? "").Trim();
            if (string.IsNullOrEmpty(value)) return;
            var parts = value.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;
                foreach (var wrapped in WrapText(trimmed, W))
                {
                    lines.Add(WithMargins(Center(wrapped, W), layout));
                }
            }
        }

        private static string BuildText(JObject source, string kind, PrinterProfile profile, JObject config)
        {
            // Propagate top-level "restaurant" from the payload into the order object
            // so BuildKotText / BuildReceiptText can find it via order["restaurant"].
            var order = OrderWithPayloadRestaurant(source);

            if ((kind ?? "").Equals("kot", StringComparison.OrdinalIgnoreCase))
            {
                return BuildKotText(order, config, profile);
            }
            else
            {
                var bill = source["bill"] as JObject ?? new JObject();
                return BuildReceiptText(order, bill, config, profile);
            }
        }

        private static JObject OrderWithPayloadRestaurant(JObject source)
        {
            var safeSource = source ?? new JObject();
            var order = safeSource["order"] as JObject ?? safeSource;
            var restaurantFromPayload = safeSource["restaurant"] as JObject;
            if (restaurantFromPayload != null && order["restaurant"] == null)
            {
                order["restaurant"] = restaurantFromPayload.DeepClone();
            }
            return order;
        }

        private static PaperSize FindPaper(PrinterSettings settings, PrinterProfile profile)
        {
            var preset = (profile.PaperPreset ?? "").Replace("_", "").Replace("-", "");
            foreach (PaperSize paper in settings.PaperSizes)
            {
                var normalized = paper.PaperName.Replace(" ", "").Replace("-", "");
                if (normalized.Equals(preset, StringComparison.OrdinalIgnoreCase)) return paper;
            }
            if (profile.WidthMm > 0 && profile.HeightMm > 0)
            {
                return new PaperSize(
                    "CafeQR Custom",
                    MmToHundredths(profile.WidthMm),
                    MmToHundredths(profile.HeightMm));
            }
            return null;
        }

        private static PaperSource FindPaperSource(PrinterSettings settings, string requested)
        {
            if (string.IsNullOrWhiteSpace(requested)) return null;
            foreach (PaperSource source in settings.PaperSources)
            {
                if (source.SourceName.Equals(requested, StringComparison.OrdinalIgnoreCase)) return source;
            }
            return null;
        }

        private static int MmToHundredths(decimal mm) => (int)Math.Round(mm / 25.4m * 100m);
        private static string Value(JObject value, params string[] keys)
        {
            foreach (var key in keys)
            {
                var token = value[key];
                if (token != null && token.Type != JTokenType.Null) return token.ToString();
            }
            return "";
        }

        private static int WrapLines(Graphics graphics, string text, Font font, float width)
        {
            if (string.IsNullOrEmpty(text)) return 1;
            return Math.Max(1, (int)Math.Ceiling(graphics.MeasureString(text, font).Width / Math.Max(1, width)));
        }

        private static void DrawCentered(Graphics graphics, string text, Font font, Rectangle bounds, ref float y, float height)
        {
            if (string.IsNullOrWhiteSpace(text)) return;
            using (var format = new StringFormat { Alignment = StringAlignment.Center })
            {
                graphics.DrawString(text, font, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, height), format);
            }
            y += height;
        }

        private static void DrawLogo(Graphics graphics, string encoded, Rectangle bounds, ref float y)
        {
            if (string.IsNullOrWhiteSpace(encoded)) return;
            try
            {
                var payload = encoded.Contains(",") ? encoded.Substring(encoded.IndexOf(',') + 1) : encoded;
                using (var stream = new MemoryStream(Convert.FromBase64String(payload)))
                using (var image = Image.FromStream(stream))
                {
                    const float maxWidth = 120;
                    const float maxHeight = 55;
                    var ratio = Math.Min(maxWidth / image.Width, maxHeight / image.Height);
                    var width = image.Width * ratio;
                    var height = image.Height * ratio;
                    graphics.DrawImage(image, bounds.Left + (bounds.Width - width) / 2f, y, width, height);
                    y += height + 5;
                }
            }
            catch
            {
                // A missing or unsupported snapshot logo must not block invoice printing.
            }
        }

        private static void DrawPair(Graphics graphics, Font heading, Font normal, Rectangle bounds, ref float y,
            string leftLabel, string leftValue, string rightLabel, string rightValue)
        {
            var half = bounds.Width / 2f;
            graphics.DrawString(leftLabel + ":", heading, Brushes.Black, bounds.Left, y);
            graphics.DrawString(leftValue ?? "-", normal, Brushes.Black, bounds.Left + 62, y);
            graphics.DrawString(rightLabel + ":", heading, Brushes.Black, bounds.Left + half, y);
            graphics.DrawString(rightValue ?? "-", normal, Brushes.Black, bounds.Left + half + 45, y);
            y += 16;
        }

        private static void DrawTableRow(Graphics graphics, Font font, Rectangle bounds, ref float y,
            float[] widths, string[] values, float height)
        {
            var x = (float)bounds.Left;
            for (var index = 0; index < widths.Length; index++)
            {
                var cellWidth = bounds.Width * widths[index];
                graphics.DrawString(values[index] ?? "", font, Brushes.Black, new RectangleF(x, y, cellWidth - 3, height));
                x += cellWidth;
            }
            y += height;
        }

        private static void DrawAmount(Graphics graphics, Font font, Rectangle bounds, ref float y, string label, string value)
        {
            var left = bounds.Left + bounds.Width * 0.62f;
            graphics.DrawString(label, font, Brushes.Black, left, y);
            using (var format = new StringFormat { Alignment = StringAlignment.Far })
            {
                graphics.DrawString(value ?? "0.00", font, Brushes.Black,
                    new RectangleF(left, y, bounds.Right - left, 20), format);
            }
            y += 18;
        }

        private static void DrawPageFooter(Graphics graphics, Font font, Rectangle bounds, int page)
        {
            using (var format = new StringFormat { Alignment = StringAlignment.Center })
            {
                graphics.DrawString("Page " + page, font, Brushes.Gray,
                    new RectangleF(bounds.Left, bounds.Bottom - 12, bounds.Width, 12), format);
            }
        }

        private sealed class InvoicePageState
        {
            public readonly List<InvoiceLine> Lines = new List<InvoiceLine>();
            public int LineIndex;
            public int PageNumber = 1;
            public string RestaurantName;
            public string RestaurantAddress;
            public string TaxIdentity;
            public string DocumentTitle;
            public string InvoiceNo;
            public string OrderNo;
            public string Date;
            public string OrderType;
            public string CustomerName;
            public string CustomerPhone;
            public string PaymentMethod;
            public string Subtotal;
            public string Discount;
            public string Tax;
            public string Total;
            public string Received;
            public string Balance;
            public string AmountInWords;
            public string Terms;
            public string Footer;
            public string LogoBase64;
            public bool IsKot;
            public bool ShowLogo;
            public bool ShowCustomer;
            public bool ShowTax;
            public bool ShowHsnSac;
            public bool ShowUnits;
            public bool ShowDiscounts;
            public bool ShowPayment;
            public bool ShowAmountInWords;
            public bool ShowTerms;
            public bool ShowFooter;
            public bool ShowSignature;
            public float Scale;

            public InvoicePageState(JObject source, string kind, int attempt, PrinterProfile printProfile)
            {
                var order = source["order"] as JObject ?? source;
                var profile = source["restaurant"] as JObject ?? source["profile"] as JObject ?? new JObject();
                IsKot = (kind ?? "").Equals("kot", StringComparison.OrdinalIgnoreCase);
                ShowLogo = printProfile.ShowLogo && !IsKot;
                ShowCustomer = printProfile.ShowCustomer;
                ShowTax = printProfile.ShowTax;
                ShowHsnSac = printProfile.ShowHsnSac;
                ShowUnits = printProfile.ShowUnits;
                ShowDiscounts = printProfile.ShowDiscounts;
                ShowPayment = printProfile.ShowPayment;
                ShowAmountInWords = printProfile.ShowAmountInWords;
                ShowTerms = printProfile.ShowTerms;
                ShowFooter = printProfile.ShowFooter;
                ShowSignature = printProfile.ShowSignature;
                Scale = Math.Max(0.5f, Math.Min(2f, printProfile.Scaling / 100f));
                RestaurantName = Value(profile, "restaurantName", "restaurant_name", "name");
                if (string.IsNullOrWhiteSpace(RestaurantName)) RestaurantName = "CafeQR";
                RestaurantAddress = Value(profile, "address", "shipping_address_line1");
                TaxIdentity = Value(profile, "gstin", "gstNumber", "taxIdentity");
                DocumentTitle = (kind ?? "").Equals("kot", StringComparison.OrdinalIgnoreCase)
                    ? (attempt > 1 ? "KITCHEN ORDER TICKET - REPRINT" : "KITCHEN ORDER TICKET")
                    : "TAX INVOICE";
                InvoiceNo = Value(order, "invoiceNo", "invoice_no");
                OrderNo = Value(order, "orderNo", "order_no");
                Date = Value(order, "orderDate", "order_date", "createdAt");
                OrderType = Value(order, "orderType", "order_type", "fulfillmentType");
                CustomerName = Value(order, "customerName", "customer_name");
                CustomerPhone = Value(order, "customerPhone", "customer_phone");
                PaymentMethod = Value(order, "paymentMethod", "payment_method");
                Subtotal = Value(order, "subtotal", "totalAmount", "total_amount");
                Discount = Value(order, "totalDiscountAmount", "total_discount_amount");
                Tax = Value(order, "totalTaxAmount", "total_tax_amount");
                Total = Value(order, "grandTotal", "grand_total", "totalAmount");
                Received = Value(order, "paidAmount", "receivedAmount");
                Balance = Value(order, "balanceAmount", "dueAmount");
                AmountInWords = Value(source, "amountInWords");
                Terms = string.IsNullOrWhiteSpace(printProfile.Terms) ? Value(source, "terms") : printProfile.Terms;
                Footer = string.IsNullOrWhiteSpace(printProfile.Footer)
                    ? Value(source, "footer", "billFooter")
                    : printProfile.Footer;
                LogoBase64 = Value(profile, "logoBase64", "logo_base64");
                var lines = order["lines"] as JArray ?? order["orderLines"] as JArray ?? new JArray();
                foreach (var line in lines.OfType<JObject>())
                {
                    Lines.Add(new InvoiceLine
                    {
                        Name = Value(line, "productName", "product_name", "name"),
                        Quantity = Value(line, "quantity", "qty"),
                        Rate = Value(line, "unitPrice", "unit_price", "price"),
                        Tax = Value(line, "taxAmount", "tax_amount"),
                        Amount = Value(line, "lineTotal", "line_total", "amount"),
                        HsnSac = Value(line, "hsnSac", "hsn_sac", "hsnCode", "sacCode"),
                        Unit = Value(line, "unitName", "unit_name", "uom", "unit")
                    });
                }
            }
        }

        private sealed class InvoiceLine
        {
            public string Name;
            public string Quantity;
            public string Rate;
            public string Tax;
            public string Amount;
            public string HsnSac;
            public string Unit;
        }
    }
}
