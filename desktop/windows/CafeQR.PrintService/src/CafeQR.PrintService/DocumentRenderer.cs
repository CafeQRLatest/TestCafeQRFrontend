using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal sealed class DocumentRenderer
    {
        public byte[] Thermal(LocalJobSubmission submission, PrinterProfile profile, int attempt)
        {
            Log.Info($"[Thermal Print] JobKind={submission.JobKind}, Attempt={attempt}, Printer={profile.WindowsPrinterName}");
            Log.Info($"[Thermal Print] Has DataBase64: {!string.IsNullOrWhiteSpace(submission.DataBase64)}, Length={(submission.DataBase64?.Length ?? 0)}");
            Log.Info($"[Thermal Print] Has Text: {!string.IsNullOrWhiteSpace(submission.Text)}, Length={(submission.Text?.Length ?? 0)}");
            Log.Info($"[Thermal Print] Document keys: {string.Join(", ", (submission.Document ?? new JObject()).Properties().Select(p => p.Name))}");

            if (!string.IsNullOrWhiteSpace(submission.DataBase64))
            {
                try
                {
                    var data = Convert.FromBase64String(submission.DataBase64);
                    Log.Info($"[Thermal Print] Printing direct DataBase64. Bytes count: {data.Length}");
                    return data;
                }
                catch (Exception ex)
                {
                    Log.Warn($"[Thermal Print] Failed to decode DataBase64, falling back to text. Error: {ex.Message}");
                }
            }

            var text = !string.IsNullOrWhiteSpace(submission.Text)
                ? submission.Text
                : BuildText(submission.Document ?? new JObject(), submission.JobKind, profile.Columns);

            Log.Info($"[Thermal Print] Rendered Text: {Environment.NewLine}{text}");

            if ((submission.JobKind ?? "").Equals("kot", StringComparison.OrdinalIgnoreCase) && attempt > 1)
            {
                text = Center("*** REPRINT ***", profile.Columns) + Environment.NewLine + text;
            }

            var body = Encoding.GetEncoding(437).GetBytes(text.Replace("\r\n", "\n").Replace("\n", "\r\n"));
            using (var stream = new System.IO.MemoryStream())
            {
                stream.Write(new byte[] { 0x1B, 0x40 }, 0, 2);
                stream.Write(body, 0, body.Length);
                for (var i = 0; i < Math.Max(1, profile.FeedLines); i++)
                {
                    stream.WriteByte(0x0A);
                }
                if (profile.AutoCut)
                {
                    stream.Write(new byte[] { 0x1D, 0x56, 0x00 }, 0, 3);
                }
                var bytes = stream.ToArray();
                Log.Info($"[Thermal Print] Final ESC/POS stream size: {bytes.Length} bytes");
                return bytes;
            }
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

        private static string BuildText(JObject source, string kind, int width)
        {
            var order = source["order"] as JObject ?? source;
            var lines = order["lines"] as JArray ?? order["orderLines"] as JArray ?? new JArray();
            var builder = new StringBuilder();
            builder.AppendLine(Center((kind ?? "bill").Equals("kot", StringComparison.OrdinalIgnoreCase)
                ? "*** KOT ***"
                : "*** TAX INVOICE ***", width));
            builder.AppendLine("Order: " + Value(order, "orderNo", "order_no"));
            builder.AppendLine("Type: " + Value(order, "orderType", "order_type"));
            builder.AppendLine(new string('-', Math.Max(8, width)));
            foreach (var line in lines.OfType<JObject>())
            {
                var name = Value(line, "productName", "product_name", "name");
                var quantity = Value(line, "quantity", "qty");
                builder.AppendLine(quantity + " x " + name);
            }
            var removedItems = order["removed_items"] as JArray ?? order["removedItems"] as JArray;
            if (removedItems != null && removedItems.Count > 0)
            {
                builder.AppendLine(new string('-', Math.Max(8, width)));
                builder.AppendLine(Center("*** REMOVED ITEMS ***", width));
                foreach (var line in removedItems.OfType<JObject>())
                {
                    var name = Value(line, "productName", "product_name", "name");
                    var quantity = Value(line, "quantity", "qty");
                    builder.AppendLine("-" + quantity + " x " + name);
                }
            }
            if (!(kind ?? "").Equals("kot", StringComparison.OrdinalIgnoreCase))
            {
                builder.AppendLine(new string('-', Math.Max(8, width)));
                builder.AppendLine("TOTAL: " + Value(order, "grandTotal", "grand_total", "totalAmount", "total_amount"));
            }
            return builder.ToString();
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
        private static string Center(string value, int width) =>
            value.Length >= width ? value : new string(' ', (width - value.Length) / 2) + value;
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
