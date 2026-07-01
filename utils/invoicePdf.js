/**
 * invoicePdf.js
 * Generates and downloads a professional customer-facing PDF invoice
 * for a given order using jsPDF + jspdf-autotable.
 */

import Cookies from 'js-cookie';
import api from './api';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './customFonts';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n, dp = 2) {
  return Number(n || 0).toFixed(dp);
}

function money(val, sym) {
  return `${sym || ''}${fmt(val)}`;
}

function getSafePdfSymbol(sym) {
  if (!sym) return '';
  const s = String(sym).trim();
  if (s === '₹' || s === '\u20b9') return 'Rs.';
  if (s === '৳') return 'Tk.';
  if (s === '₽') return 'rub';
  if (s === '₪') return 'ILS';
  if (s === '₫') return 'VND';
  if (s === '₦') return 'NGN';
  if (s === '₱') return 'PHP';
  if (s === '₩') return 'KRW';
  if (s === '฿') return 'THB';
  if (s === '₺') return 'TRY';
  if (s === '元') return 'CNY';
  
  let clean = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      clean += s[i];
    } else if (code === 8364) {
      clean += '€';
    } else if (code === 163) {
      clean += '£';
    } else if (code === 165) {
      clean += '¥';
    }
  }
  const finalSym = clean.trim();
  return finalSym || 'Cur.';
}

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

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return String(dateStr);
  }
}

function customerLabel(order) {
  let name = '';
  let phone = '';
  if (Array.isArray(order?.customers) && order.customers.length > 0) {
    name = order.customers.map(c => c.name || 'Guest').join(', ');
    phone = order.customers.map(c => c.phone || '').filter(Boolean).join(', ');
  } else {
    name = order?.customerName || order?.customer_name || '';
    phone = order?.customerPhone || order?.customer_phone || '';
  }
  if (name && phone) return `${name} (${phone})`;
  return name || phone || null;
}

function fulfillmentLabel(order) {
  if (order?.tableNumber || order?.table_number) {
    return `Dine In (Table ${order.tableNumber || order.table_number})`;
  }
  const ft = String(order?.fulfillmentType || order?.fulfillment_type || '').toUpperCase();
  if (ft === 'DELIVERY') return 'Delivery';
  if (ft === 'TAKEAWAY') return 'Takeaway';
  if (ft === 'DINE_IN') return 'Dine In';
  return '';
}

// ── Brand colours (RGB) ────────────────────────────────────────────────────────
const ORANGE     = [234, 99,  16];
const DARK       = [15,  23,  42];
const MID        = [71,  85, 105];
const LIGHT      = [241, 245, 249];
const WHITE      = [255, 255, 255];
const GREEN      = [22, 163,  74];
const BORDER     = [226, 232, 240];
const TEXT_MUTED = [100, 116, 139];

// ── Main export ────────────────────────────────────────────────────────────────

export async function downloadInvoicePdf(order, configOverride = null) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const getCookie = (name) => {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  // 1. Fetch invoice data first to get any branch/org ID stored there
  let invoiceData = null;
  try {
    const { data } = await api.get(`/api/v1/invoices/order/${order.id}`);
    invoiceData = data?.data || null;
  } catch { /* use order only */ }

  const branchId = order.orgId || order.org_id || order.branchId || order.branch_id || order.organizationId || order.organization_id || invoiceData?.orgId || invoiceData?.org_id || getCookie('orgId');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'italic');
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  const W = doc.internal.pageSize.getWidth();

  // 2. Fetch configuration and branch/client details concurrently
  let cfg = configOverride;
  let branchData = null;
  let clientData = null;

  try {
    const configPromise = cfg
      ? Promise.resolve({ data: { data: cfg } })
      : api.get(branchId ? `/api/v1/configurations/branch/${branchId}/effective` : '/api/v1/configurations').catch(() => null);

    const [configRes, branchRes, clientRes] = await Promise.all([
      configPromise,
      branchId ? api.get(`/api/v1/organizations/${branchId}`).catch(() => null) : Promise.resolve(null),
      api.get('/api/v1/clients/me').catch(() => null)
    ]);

    if (!cfg) {
      cfg = configRes?.data?.data || {};
    }
    branchData = branchRes?.data?.data || null;
    clientData = clientRes?.data?.data || null;
  } catch (err) {
    console.warn('Failed to load configuration/org/client details:', err);
  }

  // 3. Payment splits (mixed)
  let splits = [];
  const isMixed = order?.referenceNo === 'MIXED' || order?.reference === 'MIXED' || order?.paymentMethod === 'MIXED';
  if (isMixed) {
    try {
      const { data } = await api.get(`/api/v1/orders/${order.id}/payment-splits`);
      splits = data?.data || [];
    } catch { /* ignore */ }
  }

  // 4. Logo
  const logoBase64 = await imgToBase64(cfg.logoUrl || null);

  // 5. Labels
  const rawSym      = cfg.currencySymbol || '\u20b9';
  const sym         = rawSym + ' ';
  const clientName  = clientData?.name || cfg.restaurantName || 'Business';
  const branchName  = branchData?.name || '';

  // Resolve address lines (either from Organization table or client/config fallback)
  let addrParts = [];
  if (branchData?.address) {
    addrParts = doc.splitTextToSize(branchData.address, 65);
  } else if (clientData?.address) {
    addrParts = doc.splitTextToSize(clientData.address, 65);
  } else {
    const address1    = cfg.shippingAddressLine1 || '';
    const address2    = cfg.shippingAddressLine2 || '';
    const city        = cfg.shippingCity || '';
    const state       = cfg.shippingState || cfg.shippingAddressState || '';
    const pincode     = cfg.shippingPincode || '';
    addrParts = [address1, address2, [city, state, pincode].filter(Boolean).join(', ')].filter(Boolean);
  }

  const phone       = branchData?.phone || clientData?.phone || cfg.phone || '';
  const email       = branchData?.email || clientData?.email || cfg.email || '';
  const gstin       = branchData?.gstin || clientData?.gstNumber || cfg.gstin || '';
  const fssai       = clientData?.fssaiNumber || cfg.fssaiLicense || '';
  const footerText  = cfg.billFooterEnabled !== false ? (cfg.billFooter || cfg.billFooterText || '') : '';

  const orderNo    = order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`;
  const invoiceNo  = invoiceData?.invoiceNo || invoiceData?.invoice_no || order?.invoiceNo || order?.invoice_no || '';
  const paymentRef = invoiceData?.referenceNo || invoiceData?.reference_no || order?.referenceNo || order?.reference || '';
  const orderDate  = order.createdAt || order.created_at || order.orderDate || order.order_date || '';
  const customer   = customerLabel(order);
  const fulfillment = fulfillmentLabel(order);
  const payMethod  = order?.paymentMethod || invoiceData?.paymentMethod || '';

  const lines    = order.lines || invoiceData?.lines || [];
  const gross    = Number(invoiceData?.grossAmount    || invoiceData?.gross_amount    || order?.grossAmount    || order?.gross_amount    || 0);
  const subtotal = Number(invoiceData?.taxableAmount  || invoiceData?.taxable_amount  || order?.totalAmount   || order?.total_amount   || 0);
  const taxTotal = Number(invoiceData?.totalTaxAmount || invoiceData?.total_tax_amount|| order?.totalTaxAmount|| order?.total_tax_amount|| 0);
  const discount = Number(invoiceData?.totalDiscountAmount || invoiceData?.total_discount_amount || order?.totalDiscountAmount || order?.total_discount_amount || 0);
  const roundOff = Number(invoiceData?.roundOffAmount || invoiceData?.round_off_amount || order?.roundOffAmount || order?.round_off_amount || 0);
  const grandTotal = Number(invoiceData?.totalAmount || invoiceData?.total_amount || order?.grandTotal || order?.grand_total || 0);

  // 6. Build PDF ────────────────────────────────────────────────────────────────
  let y = 14;

  let textStartX = 14;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, 12, 20, 20);
      textStartX = 38;
    } catch { /* skip */ }
  }

  doc.setTextColor(...DARK);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(13);
  doc.text(clientName, textStartX, 16);

  let headerY = 20.5;
  if (branchName && branchName.toLowerCase().trim() !== clientName.toLowerCase().trim()) {
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(9);
    doc.text(branchName, textStartX, headerY);
    headerY += 4.5;
  }

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);

  // 1. Branch Address lines
  for (const part of addrParts) {
    doc.text(part, textStartX, headerY);
    headerY += 3.5;
  }

  // 2. Phone and Email
  const contactParts = [];
  if (phone) contactParts.push(`Ph: ${phone}`);
  if (email) contactParts.push(`Email: ${email}`);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('   |   '), textStartX, headerY);
    headerY += 3.5;
  }

  // 3. GSTIN and FSSAI
  const taxParts = [];
  if (gstin) taxParts.push(`GSTIN: ${gstin}`);
  if (fssai) taxParts.push(`FSSAI: ${fssai}`);
  if (taxParts.length > 0) {
    doc.text(taxParts.join('   |   '), textStartX, headerY);
    headerY += 3.5;
  }

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text('INVOICE', W - 14, 18, { align: 'right' });

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.3);
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(W - 32, 22, 18, 5.5, 1, 1, 'FD');
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...GREEN);
  doc.text('PAID', W - 23, 26, { align: 'center' });

  y = Math.max(48, headerY + 6);

  // ── Meta band card ────────────────────────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, W - 28, 26, 2, 2, 'F');

  // Left orange accent bar (drawn with rounded corners on the left)
  doc.setFillColor(...ORANGE);
  doc.roundedRect(14, y, 6, 26, 2, 2, 'F');

  // Mask the right-side rounded corners of the orange bar
  doc.setFillColor(248, 250, 252);
  doc.rect(15.2, y, 4.8, 26, 'F');

  // Draw the card border on top
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, W - 28, 26, 2, 2, 'S');

  const col1x = 20;
  const col2x = 80;
  const col3x = 140;
  const metaY = y + 5.5;

  const metaField = (label, value, x, baseY) => {
    if (!value) return;
    doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x, baseY);
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(String(value), x, baseY + 4.5);
  };
  const metaFieldLight = (label, value, x, baseY) => {
    if (!value) return;
    doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x, baseY);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(...DARK);
    doc.text(String(value), x, baseY + 4.5);
  };

  metaField('INVOICE NO', invoiceNo || '—', col1x, metaY);
  metaField('ORDER NO', orderNo, col2x, metaY);
  metaFieldLight('DATE', formatDate(orderDate), col3x, metaY);

  const metaY2 = metaY + 11.5;
  const displayCustomer = (!customer || ['walk-in guest', 'walk-in', 'guest', 'walk in'].includes(customer.toLowerCase().trim())) ? '—' : customer;
  metaFieldLight('CUSTOMER', displayCustomer, col1x, metaY2);
  metaFieldLight('TYPE', fulfillment, col2x, metaY2);
  if (paymentRef && !isMixed) {
    metaFieldLight('REF NO', paymentRef, col3x, metaY2);
  } else {
    metaFieldLight('PAYMENT', payMethod || '—', col3x, metaY2);
  }

  y += 34;

  // ── Items table ──────────────────────────────────────────────────────────────
  const tableColumns = [
    { header: '#',          dataKey: 'idx'       },
    { header: 'Item',       dataKey: 'name'      },
    { header: 'Qty',        dataKey: 'qty'       },
    { header: 'Unit Price', dataKey: 'unitPrice' },
    { header: 'GST %',      dataKey: 'gst'       },
    { header: 'Discount',   dataKey: 'discount'  },
    { header: 'Total',      dataKey: 'total'     },
  ];

  const tableRows = lines.map((line, i) => {
    const qty       = Number(line.quantity || 1);
    const unitPrice = Number(line.unitPrice || line.price || 0);
    const taxRate   = Number(line.taxRate || line.tax_rate || 0);
    const discAmt   = Number(line.discountAmount || line.discount_amount || 0);
    const lineTotal = Number(line.lineTotal || line.line_total || (unitPrice * qty));
    const displayName = line.variant_name
      ? `${line.name || line.productName || 'Item'} (${line.variant_name})`
      : (line.name || line.productName || 'Item');
    return {
      idx:       String(i + 1),
      name:      displayName,
      qty:       String(qty),
      unitPrice: money(unitPrice, sym),
      gst:       taxRate > 0 ? `${taxRate}%` : '—',
      discount:  discAmt > 0 ? money(discAmt, sym) : '—',
      total:     money(lineTotal, sym),
    };
  });

  autoTable(doc, {
    startY: y,
    columns: tableColumns,
    body: tableRows.length > 0 ? tableRows : [{ idx: '—', name: 'No line items', qty: '', unitPrice: '', gst: '', discount: '', total: '' }],
    theme: 'plain',
    styles: {
      font: 'Roboto',
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
      idx:       { halign: 'center', cellWidth: 10 },
      qty:       { halign: 'center', cellWidth: 14 },
      unitPrice: { halign: 'right',  cellWidth: 28 },
      gst:       { halign: 'center', cellWidth: 20 },
      discount:  { halign: 'right',  cellWidth: 24 },
      total:     { halign: 'right',  cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: WHITE },
    didParseCell: (data) => {
      const key = data.column.dataKey;
      if (key === 'idx' || key === 'qty' || key === 'gst') {
        data.cell.styles.halign = 'center';
      } else if (key === 'unitPrice' || key === 'discount' || key === 'total') {
        data.cell.styles.halign = 'right';
      } else {
        data.cell.styles.halign = 'left';
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
    margin: { left: 14, right: 14 },
  });

  const finalY = doc.lastAutoTable?.finalY;
  const tableBottomY = (typeof finalY === 'number' && !isNaN(finalY)) ? finalY : y;

  // ── Totals block ──────────────────────────────────────────────────────────────
  const bW = 86, bX = W - 14 - bW;

  const displaySubtotal = gross > 0 ? (grandTotal - taxTotal - roundOff) : subtotal;

  const totalRows = [];
  if (gross > 0 && Math.abs(gross - displaySubtotal) > 0.01) totalRows.push(['Gross Total', money(gross, sym)]);
  if (discount > 0) totalRows.push([`Discount`, `-${money(discount, sym)}`]);
  totalRows.push(['Subtotal', money(displaySubtotal, sym)]);
  totalRows.push(['Tax Amount', money(taxTotal, sym)]);
  if (Math.abs(roundOff) > 0.001) {
    const sign = roundOff > 0 ? '+' : '';
    totalRows.push(['Round Off', `${sign}${money(roundOff, sym)}`]);
  }

  // Position Totals Block at the bottom right corner of the page (minimal style)
  const H = doc.internal.pageSize.getHeight();
  const cardH = (totalRows.length * 6) + 12;
  const targetCardY = H - 34 - cardH;

  // If table content overlaps with target totals block area, add a page break
  if (tableBottomY > targetCardY - 10) {
    doc.addPage();
  }

  y = targetCardY;

  // Draw minimal lines and values
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.4);
  doc.line(bX, y - 1, bX + bW, y - 1);

  let rowY = y + 3;
  for (const [label, val] of totalRows) {
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
    doc.text(label, bX + 2, rowY);
    doc.setTextColor(...DARK);
    doc.text(val, bX + bW - 2, rowY, { align: 'right' });
    rowY += 6;
  }

  // Draw orange line under intermediate totals (above Grand Total)
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.6);
  doc.line(bX, rowY - 1, bX + bW, rowY - 1);

  rowY += 4;
  doc.setFont('Roboto', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ORANGE);
  doc.text('GRAND TOTAL', bX + 2, rowY);
  doc.text(money(grandTotal, sym), bX + bW - 2, rowY, { align: 'right' });

  y = rowY + 10;

  // ── Payment info ──────────────────────────────────────────────────────────────
  if (isMixed && splits.length > 0) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
    doc.text('PAYMENT BREAKDOWN', 14, y);
    y += 5;
    for (const sp of splits) {
      doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(sp.paymentMethod || '—', 14, y);
      doc.text(money(sp.amount, sym), 75, y, { align: 'right' });
      y += 5;
    }
    y += 3;
  } else if (payMethod) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
    doc.text('PAYMENT METHOD', 14, y);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(payMethod, 14, y + 5);
    y += 12;
  }

  // ── Bottom divider ────────────────────────────────────────────────────────────
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.4);
  if (typeof y === 'number' && !isNaN(y)) {
    doc.line(14, y, W - 14, y);
  }
  y += 7;

  // ── Footer ────────────────────────────────────────────────────────────────────
  const msg = footerText || 'Thank you for your business! We hope to see you again soon.';
  doc.setFont('Roboto', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MID);
  doc.text(msg, W / 2, y, { align: 'center', maxWidth: W - 28 });

  y += 8;
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated by CafeQR POS · ${new Date().toLocaleDateString('en-IN')}`, W / 2, y, { align: 'center' });

  // ── Save ──────────────────────────────────────────────────────────────────────
  const filename = `Invoice-${orderNo.replace(/[^\w\-]/g, '_')}.pdf`;
  doc.save(filename);
}
