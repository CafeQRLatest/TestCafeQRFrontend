import { Capacitor } from '@capacitor/core';
import api from './api';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './customFonts';

function fmt(n, dp = 2) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return String(dateStr);
  }
}

const ORANGE     = [234, 88, 12];   // #ea580c
const DARK       = [15, 23, 42];    // #0f172a
const MID        = [71, 85, 105];   // #475569
const LIGHT_BG   = [248, 250, 252]; // #f8fafc
const GREEN      = [21, 128, 61];   // #15803d
const BORDER     = [226, 232, 240]; // #e2e8f0
const TEXT_MUTED = [148, 163, 184]; // #94a3b8

/**
 * Generates and downloads a clean, professional Purchase Order / Purchase Invoice PDF document
 * styled to match the Sales Invoice PDF template using jsPDF + jspdf-autotable.
 */
export async function downloadPurchaseInvoicePdf(order, vendor = {}, warehouse = {}, docType = 'invoice', linkedInvoice = null) {
  const inv = linkedInvoice || order;
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Load Roboto custom fonts
  try {
    doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
  } catch (err) {
    console.warn('Font loading fallback:', err);
  }

  const W = 210;
  const margin = 14;
  let y = 14;

  const isInvoice = docType === 'invoice';
  const isPayment = docType === 'payment';
  const docTitle = isPayment ? 'PURCHASE PAYMENT RECEIPT' : isInvoice ? 'VENDOR PURCHASE BILL' : 'PURCHASE ORDER';
  const docNum = isPayment
    ? (order.paymentNo || order.referenceNo || 'PAY-REF')
    : isInvoice 
    ? (inv.invoiceNo || inv.billNo || order.invoiceNo || ('BILL-' + (order.orderNo ? order.orderNo.replace(/^PO-/, '') : 'REF')))
    : (order.orderNo || 'PO-REF');

  // Header Banner Top Bar
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, W, 4, 'F');

  // Title & Header info
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text(docTitle, margin, y + 6);

  doc.setFontSize(10);
  doc.setFont('Roboto', 'bold');
  doc.setTextColor(...ORANGE);
  doc.text(`# ${docNum}`, W - margin, y + 6, { align: 'right' });

  y += 12;

  // Metadata line (Date & Status)
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MID);
  const dateStr = formatDate(order.createdAt || order.created_at || order.orderDate);
  doc.text(`Date: ${dateStr}`, margin, y);

  const statusStr = isPayment ? 'PAID' : (order.orderStatus || 'COMPLETED');
  doc.setFont('Roboto', 'bold');
  doc.setTextColor(statusStr === 'PAID' || statusStr === 'COMPLETED' ? GREEN[0] : ORANGE[0], statusStr === 'PAID' || statusStr === 'COMPLETED' ? GREEN[1] : ORANGE[1], statusStr === 'PAID' || statusStr === 'COMPLETED' ? GREEN[2] : ORANGE[2]);
  doc.text(`Status: ${statusStr}`, W - margin, y, { align: 'right' });

  y += 6;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 6;

  // Two-column Info Box (Supplier & Warehouse)
  const colW = (W - margin * 2 - 8) / 2;

  // Left Box: Supplier Details
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin, y, colW, 28, 2, 2, 'F');
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text('SUPPLIER / VENDOR', margin + 4, y + 5);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(vendor?.name || order.vendorName || 'Supplier', margin + 4, y + 11);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text(`Phone: ${vendor?.phone || '—'}`, margin + 4, y + 17);
  doc.text(`Email: ${vendor?.email || '—'}`, margin + 4, y + 22);

  // Right Box: Warehouse & References
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin + colW + 8, y, colW, 28, 2, 2, 'F');
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text('WAREHOUSE / RECEIVING LOCATION', margin + colW + 12, y + 5);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(warehouse?.name || order.warehouseName || 'Main Warehouse', margin + colW + 12, y + 11);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text(`Supplier Invoice: ${order.reference || order.referenceNo || '—'}`, margin + colW + 12, y + 17);
  doc.text(`Payment Method: ${order.paymentMethod || 'Cash'}`, margin + colW + 12, y + 22);

  y += 34;

  // Line items Table
  const lines = order.lines || [];
  const tableHead = [['#', 'Product Item', 'Qty', 'Unit Price (Rs.)', 'GST %', 'Total (Rs.)']];
  const tableData = lines.map((l, idx) => {
    const qty = parseFloat(l.quantity || 0);
    const uPrice = parseFloat(l.unitPrice || l.price || 0);
    const taxRate = parseFloat(l.taxRate || 0);
    const taxAmt = parseFloat(l.taxAmount || 0);
    const disc = parseFloat(l.discountAmount || 0);
    const lineTotal = parseFloat(l.lineTotal || (uPrice * qty - disc + taxAmt));
    const pName = l.productName || l.name || `Item ${idx + 1}`;

    return [
      idx + 1,
      pName,
      `${qty}${l.unitOfMeasure ? ' ' + l.unitOfMeasure : ''}`,
      fmt(uPrice),
      `${taxRate}%`,
      fmt(lineTotal)
    ];
  });

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      font: 'Roboto',
      fontSize: 8.5,
      cellPadding: 3,
      textColor: DARK,
    },
    headStyles: {
      fillColor: ORANGE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left' },
      2: { halign: 'right', cellWidth: 22 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: LIGHT_BG,
    },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Totals Box (Right Aligned)
  const totalsW = 85;
  const totalsX = W - margin - totalsW;

  const grandTotal = parseFloat(order.grandTotal || order.totalAmount || 0);
  const subTotal = parseFloat(order.subtotal || order.totalAmount || order.grossAmount || 0);
  const taxTotal = parseFloat(order.totalTaxAmount || order.taxAmount || 0);

  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(totalsX, y, totalsW, 26, 2, 2, 'F');

  let ty = y + 6;
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MID);
  doc.text('Subtotal:', totalsX + 4, ty);
  doc.text(`Rs. ${fmt(subTotal)}`, totalsX + totalsW - 4, ty, { align: 'right' });

  ty += 5;
  doc.text('Tax Amount (GST):', totalsX + 4, ty);
  doc.text(`Rs. ${fmt(taxTotal)}`, totalsX + totalsW - 4, ty, { align: 'right' });

  ty += 6;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.5);
  doc.line(totalsX + 4, ty - 2, totalsX + totalsW - 4, ty - 2);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Grand Total:', totalsX + 4, ty + 2);
  doc.text(`Rs. ${fmt(grandTotal)}`, totalsX + totalsW - 4, ty + 2, { align: 'right' });

  // Footer
  const footerY = 282;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 4, W - margin, footerY - 4);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Purchase Document • Generated by CafeQR POS · ${new Date().toLocaleDateString('en-IN')}`, W / 2, footerY, { align: 'center' });

  const filename = `Purchase_${docNum.replace(/[^\w\-]/g, '_')}.pdf`;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Cache
      });
      await Share.share({ title: `Purchase Document ${docNum}`, url: savedFile.uri });
    } catch (err) {
      alert('Error sharing PDF: ' + err.message);
    }
  } else {
    doc.save(filename);
  }
}
