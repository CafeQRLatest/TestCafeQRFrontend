import { Capacitor } from '@capacitor/core';
import api from './api';
import { formatTzDate } from './timezoneUtils';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './customFonts';

async function imgToBase64(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Organisation header details, resolved the same way as utils/invoicePdf.js:
 * branch (organization) record first, then client record, then configuration.
 */
async function loadOrganisationDetails(config, branchId) {
  const [branchRes, clientRes] = await Promise.allSettled([
    branchId ? api.get(`/api/v1/organizations/${branchId}`) : Promise.resolve(null),
    api.get('/api/v1/clients/me'),
  ]);
  const branch = branchRes.status === 'fulfilled' ? branchRes.value?.data?.data || null : null;
  const client = clientRes.status === 'fulfilled' ? clientRes.value?.data?.data || null : null;
  const cfg = config || {};

  let addressLines = [];
  const rawAddress = branch?.address || client?.address;
  if (rawAddress) {
    addressLines = [rawAddress];
  } else {
    addressLines = [
      cfg.shippingAddressLine1,
      cfg.shippingAddressLine2,
      [cfg.shippingCity, cfg.shippingState || cfg.shippingAddressState, cfg.shippingPincode].filter(Boolean).join(', '),
    ].filter(Boolean);
  }

  // Tax ID label follows the configured tax (GST / VAT / ...), never a fixed country.
  const taxLabel = String(cfg.taxLabelGlobal || 'GST').toUpperCase();
  const taxIdLabel = taxLabel === 'GST' ? 'GSTIN' : taxLabel === 'VAT' ? 'VAT No.' : `${taxLabel} ID`;

  return {
    name: client?.name || cfg.restaurantName || 'Business',
    branchName: branch?.name || '',
    addressLines,
    phone: branch?.phone || client?.phone || cfg.phone || '',
    email: branch?.email || client?.email || cfg.email || '',
    taxId: branch?.gstin || client?.gstNumber || cfg.gstin || '',
    taxIdLabel,
    logo: await imgToBase64(cfg.logoUrl || null),
  };
}

/**
 * Exports the Credit Sales report (summary, every credit order and every
 * credit settlement payment) to a landscape A4 PDF.
 * Styling follows components/CreditCustomers/creditOrdersExport.js.
 */
export async function exportCreditSalesReportPdf({
  report,
  periodFrom,
  periodTo,
  customerLabel = 'All Credit Customers',
  branchId = null,
  config = null,
  showTax = true,
  timezone = 'Asia/Kolkata',
  currencySymbol = '',
  currencyDecimals = 2,
  notify,
}) {
  const orders = report?.orders || [];
  const payments = report?.payments || [];
  if (!orders.length && !payments.length) {
    if (notify) notify('warning', 'No credit sales data to export');
    return;
  }

  try {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const org = await loadOrganisationDetails(config, branchId);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Safe currency symbol representation in standard PDF fonts
    let safeSym = 'Rs. ';
    if (currencySymbol && currencySymbol !== '₹' && currencySymbol !== '₹') {
      safeSym = `${currencySymbol} `;
    }

    try {
      doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
      doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
      doc.setFont('Roboto', 'normal');
    } catch {
      doc.setFont('Helvetica', 'normal');
    }

    const fontName = doc.getFontList().Roboto ? 'Roboto' : 'Helvetica';
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 12;

    const ORANGE = [249, 115, 22];
    const DARK   = [15, 23, 42];
    const MID    = [100, 116, 139];
    const WHITE  = [255, 255, 255];
    const BORDER = [226, 232, 240];
    const GREEN  = [5, 150, 105];
    const RED    = [220, 38, 38];

    const money = (v) => `${safeSym}${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`;
    const dateStr = (v) => (v ? formatTzDate(v, timezone, { format: 'short' }) : '—');
    const periodStr = (v) => (v ? String(v).replace('T', ' ') : '—');

    let y = margin;

    // ── 1. HEADER: organisation block (left), report title (right) ─────────
    let textX = margin;
    if (org.logo) {
      try {
        doc.addImage(org.logo, 'PNG', margin, y - 1, 20, 20);
        textX = margin + 24;
      } catch { /* skip unreadable logo */ }
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...DARK);
    doc.text(org.name, textX, y + 4);
    let headerY = y + 8.5;

    if (org.branchName && org.branchName.toLowerCase().trim() !== org.name.toLowerCase().trim()) {
      doc.setFontSize(9);
      doc.text(org.branchName, textX, headerY);
      headerY += 4.5;
    }

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MID);
    const orgLines = [
      ...org.addressLines.flatMap((line) => doc.splitTextToSize(String(line), 110)),
      [org.phone && `Ph: ${org.phone}`, org.email && `Email: ${org.email}`].filter(Boolean).join('   |   '),
      org.taxId ? `${org.taxIdLabel}: ${org.taxId}` : '',
    ].filter(Boolean);
    orgLines.forEach((line) => {
      doc.text(line, textX, headerY);
      headerY += 3.5;
    });

    doc.setFont(fontName, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...DARK);
    doc.text('CREDIT SALES REPORT', W - margin, y + 5, { align: 'right' });

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MID);
    doc.text('Credit orders and credit settlement payments', W - margin, y + 10, { align: 'right' });
    doc.text(`Generated: ${formatTzDate(new Date(), timezone, { format: 'datetime' })}`, W - margin, y + 14, { align: 'right' });

    y = Math.max(headerY, y + (org.logo ? 20 : 16)) + 2;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.5);
    doc.line(margin, y, W - margin, y);
    y += 5;

    // ── 2. META BAND ─────────────────────────────────────────────────────────
    const metaH = 14;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, W - margin * 2, metaH, 2, 2, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(margin, y, 3, metaH, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, W - margin * 2, metaH, 2, 2, 'S');

    const meta = [
      ['PERIOD', `${periodStr(periodFrom)}  to  ${periodStr(periodTo)}`],
      ['BRANCH', branchId ? (org.branchName || '—') : 'All Branches'],
      ['CUSTOMER', customerLabel],
    ];
    const metaColW = (W - margin * 2 - 8) / meta.length;
    meta.forEach(([label, value], i) => {
      const x = margin + 8 + i * metaColW;
      doc.setFont(fontName, 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...MID);
      doc.text(label, x, y + 5);
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(String(value || '—'), x, y + 10.5);
    });
    y += metaH + 5;

    // ── 3. SUMMARY CARDS ─────────────────────────────────────────────────────
    const cards = [
      ['CREDIT EXTENDED', money(report.creditExtended), DARK],
      ['PAYMENTS RECEIVED', money(report.paymentsReceived), GREEN],
      ['OUTSTANDING', money(report.outstanding), RED],
      showTax && ['OUTPUT TAX', money(report.outputTax), DARK],
      ['ORDERS / CUSTOMERS', `${Number(report.orderCount || 0)} / ${Number(report.customerCount || 0)}`, ORANGE],
    ].filter(Boolean);
    const gap = 4;
    const cardW = (W - margin * 2 - gap * (cards.length - 1)) / cards.length;
    const cardH = 14;
    cards.forEach(([label, value, color], i) => {
      const x = margin + i * (cardW + gap);
      doc.setDrawColor(...BORDER);
      doc.setFillColor(...WHITE);
      doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFont(fontName, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...MID);
      doc.text(label, x + 3, y + 5);
      doc.setFontSize(10);
      doc.setTextColor(...color);
      doc.text(value, x + 3, y + 11);
    });
    y += cardH + 8;

    const sectionTitle = (title) => {
      if (y > H - 40) {
        doc.addPage();
        y = margin;
      }
      doc.setFont(fontName, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.text(title, margin, y);
      y += 3;
    };

    const tableStyles = {
      theme: 'plain',
      styles: { font: fontName, fontSize: 7.5, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 }, textColor: DARK, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: WHITE, textColor: MID, fontSize: 7.5, fontStyle: 'bold' },
      footStyles: { fillColor: [248, 250, 252], textColor: DARK, fontSize: 8, fontStyle: 'bold' },
      showFoot: 'lastPage',
      didDrawCell: (data) => {
        if (data.section === 'head') {
          doc.setDrawColor(...ORANGE);
          doc.setLineWidth(0.6);
        } else {
          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.15);
        }
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      },
      margin: { left: margin, right: margin, bottom: 18, top: margin },
    };

    // ── 4. CREDIT ORDERS ─────────────────────────────────────────────────────
    sectionTitle(`Credit Orders (${orders.length})`);
    const orderCols = [
      { header: 'Order #', dataKey: 'orderNo' },
      { header: 'Invoice', dataKey: 'invoiceNo' },
      { header: 'Customer', dataKey: 'customer' },
      { header: 'Phone', dataKey: 'phone' },
      { header: 'Amount', dataKey: 'amount' },
      showTax && { header: 'Tax', dataKey: 'tax' },
      { header: 'Total', dataKey: 'total' },
      { header: 'Paid', dataKey: 'paid' },
      { header: 'Due', dataKey: 'due' },
      { header: 'Date', dataKey: 'date' },
      { header: 'Status', dataKey: 'status' },
    ].filter(Boolean);
    const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
    const ordersTotal = sum(orders, 'total');
    const ordersDue = sum(orders, 'amountDue');

    autoTable(doc, {
      ...tableStyles,
      startY: y,
      columns: orderCols,
      body: orders.map((o) => ({
        orderNo: o.orderNo || '—',
        invoiceNo: o.invoiceNo || '—',
        customer: o.customerName || '—',
        phone: o.customerPhone || '—',
        amount: money(o.amount),
        tax: money(o.tax),
        total: money(o.total),
        paid: money(Math.max(0, Number(o.total || 0) - Number(o.amountDue || 0))),
        due: money(o.amountDue),
        date: dateStr(o.date || o.createdAt),
        status: String(o.status || '—').toUpperCase(),
      })),
      foot: [{
        orderNo: 'TOTAL',
        invoiceNo: '',
        customer: `${orders.length} order${orders.length === 1 ? '' : 's'}`,
        phone: '',
        amount: money(sum(orders, 'amount')),
        tax: money(sum(orders, 'tax')),
        total: money(ordersTotal),
        paid: money(Math.max(0, ordersTotal - ordersDue)),
        due: money(ordersDue),
        date: '',
        status: '',
      }],
      columnStyles: {
        orderNo: { fontStyle: 'bold' },
        amount: { halign: 'right' },
        tax: { halign: 'right' },
        total: { halign: 'right', fontStyle: 'bold' },
        paid: { halign: 'right' },
        due: { halign: 'right', fontStyle: 'bold' },
        status: { halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        const key = data.column.dataKey;
        if (['amount', 'tax', 'total', 'paid', 'due'].includes(key)) data.cell.styles.halign = 'right';
        if (data.section !== 'body') return;
        if (key === 'status') {
          const val = String(data.cell.raw || '');
          if (val === 'UNPAID') data.cell.styles.textColor = RED;
          else if (val === 'PARTIAL') data.cell.styles.textColor = ORANGE;
          else if (val === 'PAID') data.cell.styles.textColor = GREEN;
        }
        if (key === 'paid') data.cell.styles.textColor = GREEN;
        if (key === 'due') data.cell.styles.textColor = RED;
      },
    });
    y = (doc.lastAutoTable?.finalY || y) + 10;

    // ── 5. CREDIT SETTLEMENT PAYMENTS ────────────────────────────────────────
    sectionTitle(`Credit Settlement Payments (${payments.length})`);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      columns: [
        { header: 'Payment No', dataKey: 'ref' },
        { header: 'Date', dataKey: 'date' },
        { header: 'Customer', dataKey: 'customer' },
        { header: 'Phone', dataKey: 'phone' },
        { header: 'Against Order', dataKey: 'orderNo' },
        { header: 'Invoice', dataKey: 'invoiceNo' },
        { header: 'Method', dataKey: 'method' },
        { header: 'Amount', dataKey: 'amount' },
        { header: 'Description', dataKey: 'description' },
      ],
      body: payments.length ? payments.map((p) => ({
        ref: p.referenceNo || '—',
        date: dateStr(p.transactionDate || p.createdAt),
        customer: p.customerName || '—',
        phone: p.customerPhone || '—',
        orderNo: p.orderNo || 'On account',
        invoiceNo: p.invoiceNo || '—',
        method: p.paymentMethod || '—',
        amount: money(p.amount),
        description: p.description || '—',
      })) : [{ ref: 'No credit payments in this period' }],
      foot: [{
        ref: 'TOTAL',
        date: '',
        customer: `${payments.length} payment${payments.length === 1 ? '' : 's'}`,
        phone: '',
        orderNo: '',
        invoiceNo: '',
        method: '',
        amount: money(sum(payments, 'amount')),
        description: '',
      }],
      columnStyles: {
        ref: { fontStyle: 'bold' },
        amount: { halign: 'right', fontStyle: 'bold' },
        description: { cellWidth: 60 },
      },
      didParseCell: (data) => {
        if (data.column.dataKey === 'amount') {
          data.cell.styles.halign = 'right';
          if (data.section === 'body') data.cell.styles.textColor = GREEN;
        }
      },
    });

    // ── 6. PAGE FOOTER ───────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(margin, H - 12, W - margin, H - 12);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MID);
      doc.text('Computer-generated credit sales report', margin, H - 7);
      doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 7, { align: 'right' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `credit_sales_report_${today}.pdf`;

    // Android/iOS app: doc.save() does nothing inside the WebView, so write to cache and open the share sheet.
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Cache
      });
      await Share.share({
        title: 'Credit Sales Report',
        url: savedFile.uri,
        dialogTitle: 'Save or Share Credit Sales Report'
      });
    } else {
      doc.save(filename);
    }
    if (notify) notify('success', 'Credit sales report exported to PDF');
  } catch (error) {
    console.error('Failed to export credit sales report to PDF:', error);
    if (notify) notify('error', 'Failed to export PDF');
  }
}
