import { loadCurrencyDecimals } from '../../utils/currencyDecimals';
import { formatTzDate } from '../../utils/timezoneUtils';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from '../../utils/customFonts';

/**
 * Exports all credit orders for a customer to Excel (.xlsx)
 * Contains only the details shown in the Credit Orders view.
 */
export async function exportCreditOrdersToExcel({
  customer,
  orders = [],
  timezone = 'Asia/Kolkata',
  notify,
}) {
  const currencyDecimals = await loadCurrencyDecimals();
  if (!orders || orders.length === 0) {
    if (notify) notify('warning', 'No credit orders to export');
    return;
  }

  try {
    const XLSX = await import('xlsx');

    const totalAmountSum = orders.reduce((sum, o) => sum + Number(o.total ?? o.amount ?? 0), 0);
    const totalDueSum = orders.reduce((sum, o) => sum + Number(o.amountDue ?? 0), 0);

    const generatedStr = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Sheet structure with top customer heading
    const aoa = [
      ['CUSTOMER CREDIT STATEMENT'],
      ['Customer Name:', String(customer?.name || 'Customer'), '', 'Generated:', generatedStr],
      ['Contact Phone:', String(customer?.phone || '—'), '', 'Account Status:', String(customer?.status || 'ACTIVE').toUpperCase()],
      ['Total Outstanding Due:', totalDueSum, '', '', ''],
      [], // blank line before table
      ['Document No', 'Date', 'Total Amount', 'Amount Due', 'Status'],
    ];

    orders.forEach((order) => {
      const docNo = order.orderNo || order.invoiceNo || 'Detail';
      const dateStr = formatTzDate(order.date || order.orderDate || order.createdAt, timezone || 'Asia/Kolkata');
      const totalAmount = Number(order.total ?? order.amount ?? 0);
      const amountDue = Number(order.amountDue ?? 0);
      const status = String(order.status || 'UNPAID').toUpperCase();

      aoa.push([docNo, dateStr, totalAmount, amountDue, status]);
    });

    // Summary Total Row
    aoa.push([
      'TOTAL',
      `${orders.length} Order${orders.length > 1 ? 's' : ''}`,
      totalAmountSum,
      totalDueSum,
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merge title across columns A to E
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    ];

    // Optimized column widths
    ws['!cols'] = [
      { wch: 28 }, // Document No / Customer Details
      { wch: 26 }, // Date
      { wch: 18 }, // Total Amount
      { wch: 18 }, // Amount Due
      { wch: 16 }, // Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Credit Orders');

    const safeName = (customer?.name || 'customer')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `credit_orders_${safeName}_${today}.xlsx`;

    XLSX.writeFile(wb, filename);
    if (notify) notify('success', 'Credit orders exported to Excel');
  } catch (error) {
    console.error('Failed to export credit orders to Excel:', error);
    if (notify) notify('error', 'Failed to export Excel spreadsheet');
  }
}

/**
 * Exports all credit orders for a customer to a clean PDF statement
 * Matches the details shown in the Credit Orders view.
 */
export async function exportCreditOrdersToPdf({
  customer,
  orders = [],
  timezone = 'Asia/Kolkata',
  currencySymbol = '',
  notify,
}) {
  const currencyDecimals = await loadCurrencyDecimals();
  if (!orders || orders.length === 0) {
    if (notify) notify('warning', 'No credit orders to export');
    return;
  }

  try {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Safe currency symbol representation in standard PDF fonts
    let safeSym = 'Rs. ';
    if (currencySymbol && currencySymbol !== '₹' && currencySymbol !== '\u20b9') {
      safeSym = `${currencySymbol} `;
    }

    // Embed custom fonts if available
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

    // Exact Palette from invoicePdf.js
    const ORANGE = [249, 115, 22];    // #f97316 (Brand Orange)
    const DARK   = [15, 23, 42];      // #0f172a (Dark Slate)
    const MID    = [100, 116, 139];   // #64748b (Slate Muted)
    const WHITE  = [255, 255, 255];
    const BORDER = [226, 232, 240];   // #e2e8f0
    const GREEN  = [5, 150, 105];     // #059669
    const RED    = [220, 38, 38];     // #dc2626

    const totalAmountSum = orders.reduce((sum, o) => sum + Number(o.total ?? o.amount ?? 0), 0);
    const totalDueSum = orders.reduce((sum, o) => sum + Number(o.amountDue ?? 0), 0);
    const totalPaidSum = Math.max(0, totalAmountSum - totalDueSum);

    let y = margin;

    // ── 1. TOP HEADER (matching invoicePdf.js layout) ────────────────────────
    doc.setTextColor(...DARK);
    doc.setFont(fontName, 'bold');
    doc.setFontSize(14);
    doc.text('CUSTOMER STATEMENT', margin, y + 4);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MID);
    doc.text('Credit Ledger & Outstanding Orders Statement', margin, y + 9);

    // Document Title on Top-Right
    doc.setFont(fontName, 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...DARK);
    doc.text('STATEMENT', W - margin, y + 4, { align: 'right' });

    // Status Pill Badge directly below top-right title
    const custStatus = String(customer?.status || 'ACTIVE').toUpperCase();
    const isCustActive = custStatus === 'ACTIVE';
    const badgeColor = isCustActive ? GREEN : RED;
    const badgeBg = isCustActive ? [240, 253, 244] : [254, 242, 242];
    const badgeW = 24;
    const badgeX = W - margin - badgeW;

    doc.setDrawColor(...badgeColor);
    doc.setLineWidth(0.3);
    doc.setFillColor(...badgeBg);
    doc.roundedRect(badgeX, y + 7.5, badgeW, 5.5, 1, 1, 'FD');
    doc.setFont(fontName, 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...badgeColor);
    doc.text(custStatus, badgeX + (badgeW / 2), y + 11.2, { align: 'center' });

    y += 18;

    // ── 2. META BAND CARD (matching invoicePdf.js 4px orange bar card) ───────
    const metaCardH = 22;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, W - (margin * 2), metaCardH, 2, 2, 'F');

    // Left orange accent bar
    doc.setFillColor(...ORANGE);
    doc.roundedRect(margin, y, 4, metaCardH, 2, 2, 'F');

    // Mask right-side rounded corners of the orange bar
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + 1, y, 3, metaCardH, 'F');

    // Card border
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, W - (margin * 2), metaCardH, 2, 2, 'S');

    // Vertical divider between Left (Statement Date) and Right (Customer)
    const dividerX = margin + 65;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(dividerX, y + 3, dividerX, y + metaCardH - 3);

    // Left Section: Statement Date
    const col1x = margin + 7;
    doc.setFont(fontName, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...MID);
    doc.text('STATEMENT DATE', col1x, y + 6);

    const generatedStr = (typeof formatTzDate === 'function' ? formatTzDate(new Date(), timezone, { format: 'datetime' }) : '') || new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    doc.text(generatedStr, col1x, y + 12);

    // Right Section: Bill To / Customer Details
    const custX = dividerX + 6;
    doc.setFont(fontName, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...MID);
    doc.text('BILL TO / CUSTOMER', custX, y + 6);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(String(customer?.name || 'Customer'), custX, y + 12);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MID);
    doc.text(`Ph: ${customer?.phone || '—'}`, custX, y + 17);

    // Highlighted Balance Due badge inside customer card on the right
    doc.setFont(fontName, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...ORANGE);
    doc.text(`Outstanding Due: ${safeSym}${totalDueSum.toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`, W - margin - 6, y + 12, { align: 'right' });

    y += metaCardH + 8;

    // ── 3. ITEMS TABLE (exact invoicePdf.js table styles) ────────────────────
    const tableColumns = [
      { header: 'Document No',  dataKey: 'docNo'  },
      { header: 'Date',         dataKey: 'date'   },
      { header: 'Total Amount', dataKey: 'total'  },
      { header: 'Amount Due',   dataKey: 'due'    },
      { header: 'Status',       dataKey: 'status' },
    ];

    const tableRows = orders.map((order) => {
      const docNo = order.orderNo || order.invoiceNo || 'Detail';
      const dateStr = formatTzDate(order.date || order.orderDate || order.createdAt, timezone || 'Asia/Kolkata');
      const totalVal = Number(order.total ?? order.amount ?? 0);
      const dueVal = Number(order.amountDue ?? 0);
      const status = String(order.status || 'UNPAID').toUpperCase();

      return {
        docNo,
        date: dateStr,
        total: `${safeSym}${totalVal.toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`,
        due: `${safeSym}${dueVal.toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`,
        status,
      };
    });

    autoTable(doc, {
      startY: y,
      columns: tableColumns,
      body: tableRows,
      theme: 'plain',
      styles: {
        font: fontName,
        fontSize: 8.5,
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
        textColor: DARK,
        valign: 'middle',
      },
      headStyles: {
        fillColor: WHITE,
        textColor: MID,
        fontSize: 8.5,
        fontStyle: 'bold',
      },
      columnStyles: {
        docNo:  { cellWidth: 50, fontStyle: 'bold' },
        date:   { cellWidth: 46, textColor: MID },
        total:  { cellWidth: 32, halign: 'right' },
        due:    { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        status: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: WHITE },
      didParseCell: (data) => {
        const key = data.column.dataKey;
        if (key === 'total' || key === 'due') {
          data.cell.styles.halign = 'right';
        } else if (key === 'status') {
          data.cell.styles.halign = 'center';
          if (data.section === 'body') {
            const val = String(data.cell.raw || '').toUpperCase();
            if (val === 'UNPAID') data.cell.styles.textColor = RED;
            else if (val === 'PARTIAL') data.cell.styles.textColor = ORANGE;
            else if (val === 'PAID') data.cell.styles.textColor = GREEN;
          }
        }
        if (data.section === 'body' && key === 'due') {
          data.cell.styles.textColor = RED;
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'head') {
          doc.setDrawColor(...ORANGE);
          doc.setLineWidth(0.6);
          doc.line(
            data.cell.x,
            data.cell.y + data.cell.height,
            data.cell.x + data.cell.width,
            data.cell.y + data.cell.height
          );
        } else if (data.section === 'body') {
          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.15);
          doc.line(
            data.cell.x,
            data.cell.y + data.cell.height,
            data.cell.x + data.cell.width,
            data.cell.y + data.cell.height
          );
        }
      },
      margin: { left: margin, right: margin, bottom: 22 },
    });

    const finalY = doc.lastAutoTable?.finalY;
    const tableBottomY = (typeof finalY === 'number' && !isNaN(finalY)) ? finalY : y;

    // ── 4. TOTALS BLOCK AT BOTTOM RIGHT (matching invoicePdf.js) ─────────────
    const bW = 86;
    const bX = W - margin - bW;
    let rowY = tableBottomY + 7;

    if (rowY + 28 > H - 16) {
      doc.addPage();
      rowY = margin + 10;
    }

    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.4);
    doc.line(bX, rowY - 1, bX + bW, rowY - 1);

    rowY += 4;
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MID);
    doc.text('Total Invoiced', bX + 2, rowY);
    doc.setTextColor(...DARK);
    doc.text(`${safeSym}${totalAmountSum.toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`, bX + bW - 2, rowY, { align: 'right' });

    if (totalPaidSum > 0) {
      rowY += 5.5;
      doc.setFont(fontName, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MID);
      doc.text('Paid Amount', bX + 2, rowY);
      doc.setTextColor(...GREEN);
      doc.text(`-${safeSym}${totalPaidSum.toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`, bX + bW - 2, rowY, { align: 'right' });
    }

    // Orange accent line above Balance Due
    rowY += 4.5;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.6);
    doc.line(bX, rowY - 1, bX + bW, rowY - 1);

    rowY += 4;
    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...ORANGE);
    doc.text('BALANCE DUE', bX + 2, rowY);
    doc.setTextColor(...RED);
    doc.text(`${safeSym}${totalDueSum.toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`, bX + bW - 2, rowY, { align: 'right' });

    // ── 5. PAGE FOOTER ───────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(margin, H - 12, W - margin, H - 12);

      doc.setFont(fontName, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MID);
      doc.text('Computer-generated credit statement · Valid without physical signature', margin, H - 7);
      doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 7, { align: 'right' });
    }

    const safeName = (customer?.name || 'customer')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `credit_orders_${safeName}_${today}.pdf`;

    doc.save(filename);
    if (notify) notify('success', 'Credit orders exported to PDF');
  } catch (error) {
    console.error('Failed to export credit orders to PDF:', error);
    if (notify) notify('error', 'Failed to export PDF statement');
  }
}
