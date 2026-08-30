/**
 * invoicePdf.js
 * Generates and downloads a professional customer-facing PDF invoice
 * for a given order using jsPDF + jspdf-autotable.
 */

import Cookies from 'js-cookie';
import { Capacitor } from '@capacitor/core';
import api from './api';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './customFonts';
import { isLoyaltyModuleEnabled } from './moduleVisibility';

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

function extractCustomerData(order, extraCust = null, extraLoyalty = null) {
  let cust = extraCust;
  if (!cust) {
    if (Array.isArray(order?.customers) && order.customers.length > 0) {
      cust = order.customers[0];
    } else if (order?.customer && typeof order.customer === 'object') {
      cust = order.customer;
    } else if (order?.creditCustomer && typeof order.creditCustomer === 'object') {
      cust = order.creditCustomer;
    }
  }

  let name = cust?.name || order?.customerName || order?.customer_name || '';
  let phone = cust?.phone || cust?.phoneNumber || order?.customerPhone || order?.customer_phone || '';
  let email = cust?.email || order?.customerEmail || order?.customer_email || '';
  let address = cust?.address || order?.customerAddress || order?.customer_address || '';
  let gstin = cust?.gstin || cust?.gstNumber || cust?.gst_number || order?.customerGstin || order?.customer_gstin || '';
  let loyaltyPoints = extraLoyalty?.currentPoints ?? extraLoyalty?.points ?? cust?.loyaltyPoints ?? cust?.points ?? cust?.loyalty_points ?? order?.customerLoyaltyPoints ?? order?.customer_loyalty_points ?? null;

  if (order?.description) {
    const desc = String(order.description);
    if (!name) {
      const m = desc.match(/(?:Cust|Customer|name):\s*([^|,\n]+)/i);
      if (m) name = m[1].trim();
    }
    if (!phone) {
      const m = desc.match(/(?:Phone|ph|mobile):\s*([^|,\n]+)/i);
      if (m) phone = m[1].trim();
    }
    if (!email) {
      const m = desc.match(/(?:Email):\s*([^|,\n]+)/i);
      if (m) email = m[1].trim();
    }
    if (!address) {
      const m = desc.match(/(?:Addr|Address):\s*([^|,\n]+)/i);
      if (m) address = m[1].trim();
    }
  }

  const isGuest = !name || ['walk-in guest', 'walk-in', 'guest', 'walk in'].includes(name.toLowerCase().trim());
  return {
    isGuest: isGuest && !phone && !email,
    name: isGuest ? '' : name,
    phone: phone || '',
    email: email || '',
    address: address || '',
    gstin: gstin || '',
    loyaltyPoints: loyaltyPoints
  };
}

function customerLabel(order) {
  const c = extractCustomerData(order);
  if (c.isGuest) return null;
  if (c.name && c.phone) return `${c.name} (${c.phone})`;
  return c.name || c.phone || c.email || null;
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
const RED        = [220, 38,  38];
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
  const custId = order.customerId || order.customer_id || (Array.isArray(order.customers) && order.customers[0]?.id) || order.creditCustomerId || order.credit_customer_id || invoiceData?.customerId;
  const loyaltyCustId = order.loyaltyCustomerId || order.loyalty_customer_id || custId;

  // 2. Fetch configuration, branch/client, customer, and loyalty details concurrently
  let cfg = configOverride;
  let branchData = null;
  let clientData = null;
  let fetchedCustomer = null;
  let fetchedLoyalty = null;

  try {
    const configPromise = cfg
      ? Promise.resolve({ data: { data: cfg } })
      : api.get(branchId ? `/api/v1/configurations/branch/${branchId}/effective` : '/api/v1/configurations').catch(() => null);

    const [configRes, branchRes, clientRes, custRes, loyRes] = await Promise.allSettled([
      configPromise,
      branchId ? api.get(`/api/v1/organizations/${branchId}`).catch(() => null) : Promise.resolve(null),
      api.get('/api/v1/clients/me').catch(() => null),
      custId ? api.get(`/api/v1/customers/${custId}`).catch(() => null) : Promise.resolve(null),
      loyaltyCustId ? api.get(`/api/v1/loyalty/customers/${loyaltyCustId}`).catch(() => null) : Promise.resolve(null)
    ]);

    if (!cfg && configRes.status === 'fulfilled') {
      cfg = configRes.value?.data?.data || {};
    }
    if (branchRes.status === 'fulfilled') branchData = branchRes.value?.data?.data || null;
    if (clientRes.status === 'fulfilled') clientData = clientRes.value?.data?.data || null;
    if (custRes.status === 'fulfilled') fetchedCustomer = custRes.value?.data?.data || null;
    if (loyRes.status === 'fulfilled') fetchedLoyalty = loyRes.value?.data?.data || null;
  } catch (err) {
    console.warn('Failed to load configuration/org/client/loyalty details:', err);
  }

  // 3. Initialize jsPDF dynamically based on templates configuration
  const regTpl = cfg.regularTemplate || {};
  const paperPreset = String(regTpl.paperPreset || 'A4').toUpperCase();
  const orientation = String(regTpl.orientation || 'PORTRAIT').toLowerCase();
  const format = paperPreset !== 'CUSTOM'
    ? paperPreset.toLowerCase()
    : [Number(regTpl.widthMm || 210), Number(regTpl.heightMm || 297)];

  const doc = new jsPDF({ orientation, unit: 'mm', format });
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'italic');
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  const W = doc.internal.pageSize.getWidth();
  const margin = Number(regTpl.marginMm ?? 10);

  // 4. Payment splits & history
  let splits = Array.isArray(order?.paymentSplits || order?.payment_splits) ? (order.paymentSplits || order.payment_splits) : [];
  let paymentsList = Array.isArray(order?.payments) ? order.payments : [];
  try {
    const orderIdToFetch = order?.id || order?.orderId;
    if (orderIdToFetch) {
      const { data } = await api.get(`/api/v1/orders/${orderIdToFetch}/payments`);
      const rawPayments = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      const fetched = rawPayments.filter(p => String(p.docStatus || p.doc_status || '').toUpperCase() !== 'VOID' && String(p.isactive || 'Y').toUpperCase() !== 'N');
      if (fetched.length > 0) {
        paymentsList = fetched;
      }
    }
  } catch { /* ignore */ }

  const isMixedFlag = order?.referenceNo === 'MIXED' || order?.reference === 'MIXED' || order?.paymentMethod === 'MIXED' || paymentsList.length > 1;
  if (isMixedFlag && order?.id && splits.length === 0) {
    try {
      const { data } = await api.get(`/api/v1/orders/${order.id}/payment-splits`);
      if (Array.isArray(data?.data) && data.data.length > 0) {
        splits = data.data;
      }
    } catch { /* ignore */ }
  }

  if ((!splits || splits.length === 0) && paymentsList.length > 0) {
    splits = paymentsList.map(p => ({
      paymentMethod: p.paymentMethod || p.payment_method || 'Payment',
      amount: Number(p.amount || p.amountPaid || p.amount_paid || 0)
    }));
  }

  const isMixed = isMixedFlag || splits.length > 1;

  // 5. Logo
  const logoBase64 = (regTpl.showLogo !== false) ? await imgToBase64(cfg.logoUrl || null) : null;

  // 6. Labels
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
  const taxLabel    = String(cfg?.taxLabelGlobal || 'GST').toUpperCase();
  const taxIdLabel  = taxLabel === 'GST' ? 'GSTIN' : taxLabel === 'VAT' ? 'VAT No.' : `${taxLabel} ID`;
  const fssai       = clientData?.fssaiNumber || cfg.fssaiLicense || '';
  const footerText  = regTpl.showFooter !== false ? (regTpl.footer || cfg.billFooter || cfg.billFooterText || '') : '';

  const orderNo    = order.orderNo || order.order_no || `#${String(order.id).slice(0, 8)}`;
  const invoiceNo  = invoiceData?.invoiceNo || invoiceData?.invoice_no || order?.invoiceNo || order?.invoice_no || '';
  const paymentRef = invoiceData?.referenceNo || invoiceData?.reference_no || order?.referenceNo || order?.reference || '';
  const orderDate  = order.createdAt || order.created_at || order.orderDate || order.order_date || '';
  const customer   = customerLabel(order);
  const fulfillment = fulfillmentLabel(order);
  const rawPayMethod = order?.paymentMethod || invoiceData?.paymentMethod || '';
  const payMethod  = (paymentsList.length > 0)
    ? Array.from(new Set(paymentsList.map(p => p.paymentMethod || p.payment_method).filter(Boolean))).join(', ')
    : rawPayMethod;

  const lines    = order.lines || invoiceData?.lines || [];
  const gross    = Number(invoiceData?.grossAmount    || invoiceData?.gross_amount    || order?.grossAmount    || order?.gross_amount    || 0);
  const subtotal = Number(invoiceData?.taxableAmount  || invoiceData?.taxable_amount  || order?.totalAmount   || order?.total_amount   || 0);
  const taxTotal = Number(invoiceData?.totalTaxAmount || invoiceData?.total_tax_amount|| order?.totalTaxAmount|| order?.total_tax_amount|| 0);
  const discount = Number(invoiceData?.totalDiscountAmount || invoiceData?.total_discount_amount || order?.totalDiscountAmount || order?.total_discount_amount || 0);
  const roundOff = Number(invoiceData?.roundOffAmount || invoiceData?.round_off_amount || order?.roundOffAmount || order?.round_off_amount || 0);
  const grandTotal = Number(invoiceData?.totalAmount || invoiceData?.total_amount || order?.grandTotal || order?.grand_total || 0);

  // 7. Build PDF ────────────────────────────────────────────────────────────────
  let y = margin;

  let textStartX = margin;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, margin - 2, 20, 20);
      textStartX = margin + 24;
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
  if (gstin) taxParts.push(`${taxIdLabel}: ${gstin}`);
  if (fssai) taxParts.push(`FSSAI: ${fssai}`);
  if (taxParts.length > 0) {
    doc.text(taxParts.join('   |   '), textStartX, headerY);
    headerY += 3.5;
  }

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text('INVOICE', W - margin, 18, { align: 'right' });

  const totalAmtVal = Number(invoiceData?.totalAmount || order?.grandTotal || order?.totalAmount || 0);
  const amtDueVal   = Number(invoiceData?.amountDue !== undefined ? invoiceData.amountDue : (order?.amountDue !== undefined ? order.amountDue : totalAmtVal));
  const paidAmtVal  = totalAmtVal - amtDueVal;
  const payMethodUpper = String(payMethod).toUpperCase();

  if (paidAmtVal > 0) {
    const isFullyPaid = amtDueVal <= 0.01;
    const label = isFullyPaid ? 'PAID' : 'PARTIALLY PAID';
    const badgeColor = isFullyPaid ? GREEN : ORANGE;
    const badgeBg = isFullyPaid ? [240, 253, 244] : [255, 251, 235];

    const rectWidth = isFullyPaid ? 18 : 28;
    const rectX = W - margin - rectWidth;

    doc.setDrawColor(...badgeColor);
    doc.setLineWidth(0.3);
    doc.setFillColor(...badgeBg);
    doc.roundedRect(rectX, 22, rectWidth, 5.5, 1, 1, 'FD');
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...badgeColor);
    doc.text(label, rectX + (rectWidth / 2), 26, { align: 'center' });
  }

  y = Math.max(48, headerY + 6);

  // Extract customer data & loyalty details
  const customerData = extractCustomerData(order, fetchedCustomer, fetchedLoyalty);
  const loyaltyAmount = Number(order?.loyaltyAmount || order?.loyalty_amount || invoiceData?.loyaltyAmount || invoiceData?.loyalty_amount || 0);
  const redeemPoints = Number(order?.redeemPoints || order?.redeem_points || order?.loyaltyPointsRedeemed || order?.loyalty_points_redeemed || 0);

  // ── Meta band card ────────────────────────────────────────────────────────────
  const hasCustDetails = !customerData.isGuest && (customerData.name || customerData.phone || customerData.email || customerData.address);
  const metaCardH = 28;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, W - (margin * 2), metaCardH, 2, 2, 'F');

  // Left orange accent bar
  doc.setFillColor(...ORANGE);
  doc.roundedRect(margin, y, 4, metaCardH, 2, 2, 'F');

  // Mask the right-side rounded corners of the orange bar
  doc.setFillColor(248, 250, 252);
  doc.rect(margin + 1, y, 3, metaCardH, 'F');

  // Draw the card border on top
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, W - (margin * 2), metaCardH, 2, 2, 'S');

  // Divider between Left (Invoice meta) and Right (Customer / Bill To)
  const dividerX = margin + 86;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(dividerX, y + 3, dividerX, y + metaCardH - 3);

  const col1x = margin + 6;
  const col2x = margin + 46;
  const metaY = y + 5;

  const metaField = (label, value, x, baseY) => {
    if (!value) return;
    doc.setFont('Roboto', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x, baseY);
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(String(value), x, baseY + 4);
  };
  const metaFieldLight = (label, value, x, baseY) => {
    if (!value) return;
    doc.setFont('Roboto', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x, baseY);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(...DARK);
    doc.text(String(value), x, baseY + 4);
  };

  // Left Section: Invoice / Order Meta (Balanced 2-row layout)
  metaField('INVOICE NO', invoiceNo || '—', col1x, metaY);
  metaField('ORDER NO', orderNo, col2x, metaY);

  const metaY2 = metaY + 11;
  metaFieldLight('DATE', formatDate(orderDate), col1x, metaY2);
  
  const shouldShowType = !clientData?.posType || String(clientData.posType).trim().toUpperCase() !== 'OTHERS';
  const isMeaningfulRef = paymentRef && !isMixed && paymentRef.trim().toUpperCase() !== String(payMethod).trim().toUpperCase() && paymentRef.trim().toUpperCase() !== 'CASH';
  const payLabel = isMeaningfulRef ? `${payMethod || '—'} (${paymentRef})` : (payMethod || '—');
  
  metaFieldLight(shouldShowType ? 'TYPE' : 'PAYMENT', shouldShowType ? fulfillment : payLabel, col2x, metaY2);

  // Right Section: Bill To / Customer Details
  const custX = dividerX + 6;
  let custY = y + 5;

  doc.setFont('Roboto', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...TEXT_MUTED);
  doc.text('BILL TO / CUSTOMER', custX, custY);
  
  if (shouldShowType && payMethod) {
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...TEXT_MUTED);
    doc.text(`Payment: ${payLabel}`, W - margin - 4, custY, { align: 'right' });
  }

  custY += 4.5;

  if (hasCustDetails) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(customerData.name || 'Customer', custX, custY);
    custY += 4.2;

    const contactParts = [];
    if (customerData.phone) contactParts.push(`Ph: ${customerData.phone}`);
    if (customerData.email) contactParts.push(`Email: ${customerData.email}`);
    if (contactParts.length > 0) {
      doc.setFont('Roboto', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MID);
      doc.text(contactParts.join('   •   '), custX, custY);
      custY += 3.8;
    }

    const extraBadges = [];
    if (customerData.address) {
      extraBadges.push(customerData.address.length > 28 ? customerData.address.slice(0, 28) + '…' : customerData.address);
    }
    const isLoyaltyOn = isLoyaltyModuleEnabled(cfg) || cfg?.loyaltyEnabled === true;
    if (isLoyaltyOn && customerData.loyaltyPoints !== null && customerData.loyaltyPoints !== undefined) {
      extraBadges.push(`Loyalty Points: ${customerData.loyaltyPoints} pts`);
    }
    if (customerData.gstin) {
      extraBadges.push(`GSTIN: ${customerData.gstin}`);
    }

    if (extraBadges.length > 0) {
      doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...ORANGE);
      doc.text(extraBadges.join('   •   '), custX, custY);
    }
  } else {
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MID);
    doc.text('Walk-in Guest', custX, custY + 2);
  }

  y += metaCardH + 7;

  // ── Items table ──────────────────────────────────────────────────────────────
  const tableColumns = [
    { header: '#',          dataKey: 'idx'       },
    { header: 'Item',       dataKey: 'name'      },
    { header: 'Qty',        dataKey: 'qty'       },
    { header: 'Unit Price', dataKey: 'unitPrice' },
    { header: `${taxLabel} %`, dataKey: 'gst'    },
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
    margin: { left: margin, right: margin },
  });

  const finalY = doc.lastAutoTable?.finalY;
  const tableBottomY = (typeof finalY === 'number' && !isNaN(finalY)) ? finalY : y;

  // ── Totals block ──────────────────────────────────────────────────────────────
  const bW = 86, bX = W - margin - bW;

  const displaySubtotal = gross > 0 ? (grandTotal - taxTotal - roundOff) : subtotal;

  const totalRows = [];
  if (gross > 0 && Math.abs(gross - displaySubtotal) > 0.01) totalRows.push(['Gross Total', money(gross, sym)]);
  
  // Total discount breakdown (manual discount + loyalty discount)
  const isLoyaltyActive = isLoyaltyModuleEnabled(cfg) || cfg?.loyaltyEnabled === true;
  const generalDiscount = isLoyaltyActive ? Math.max(0, discount - loyaltyAmount) : discount;

  if (generalDiscount > 0.01) {
    totalRows.push(['Discount', `-${money(generalDiscount, sym)}`]);
  }
  if (isLoyaltyActive && loyaltyAmount > 0.01) {
    const ptsLabel = redeemPoints > 0 ? ` (${redeemPoints} pts)` : '';
    totalRows.push([`Loyalty Discount${ptsLabel}`, `-${money(loyaltyAmount, sym)}`]);
  } else if (discount > 0.01 && generalDiscount <= 0.01) {
    totalRows.push(['Discount', `-${money(discount, sym)}`]);
  }

  totalRows.push(['Subtotal', money(displaySubtotal, sym)]);
  totalRows.push(['Tax Amount', money(taxTotal, sym)]);
  if (Math.abs(roundOff) > 0.001) {
    const sign = roundOff > 0 ? '+' : '';
    totalRows.push(['Round Off', `${sign}${money(roundOff, sym)}`]);
  }

  // Position Totals Block at the bottom right corner of the page (minimal style)
  const H = doc.internal.pageSize.getHeight();
  const cardH = (totalRows.length * 6) + 12 + (paidAmtVal > 0 ? 12 : 0);
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

  if (paidAmtVal > 0) {
    rowY += 6;
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
    doc.text('Paid Amount', bX + 2, rowY);
    doc.text(money(paidAmtVal, sym), bX + bW - 2, rowY, { align: 'right' });

    rowY += 6;
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
    doc.text('Balance Due', bX + 2, rowY);
    doc.text(money(amtDueVal, sym), bX + bW - 2, rowY, { align: 'right' });
  }

  // ── Payment info ──────────────────────────────────────────────────────────────
  if (isMixed && splits.length > 0) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
    doc.text('PAYMENT BREAKDOWN', margin, y);
    y += 5;
    for (const sp of splits) {
      doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(sp.paymentMethod || '—', margin, y);
      doc.text(money(sp.amount, sym), 75, y, { align: 'right' });
      y += 5;
    }
    y += 3;
  } else if (payMethod) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
    doc.text('PAYMENT METHOD', margin, y);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(payMethod, margin, y + 5);
    y += 12;
  }

  // ── Remarks / Instructions ──────────────────────────────────────────────────
  const remarksVal = order?.remarks || (order?.description && !order?.description.startsWith('Purchase Payment') && !order?.description.includes('name:') ? order.description : '');
  if (remarksVal && remarksVal.trim()) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
    doc.text('REMARKS / INSTRUCTIONS', margin, y);
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    const splitNotes = doc.splitTextToSize(remarksVal.trim(), Math.max(60, bX - margin - 10));
    doc.text(splitNotes, margin, y + 4);
    y += (splitNotes.length * 4) + 6;
  }

  // ── Bottom divider ────────────────────────────────────────────────────────────
  y = Math.max(rowY + 8, y + 4);
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.4);
  if (typeof y === 'number' && !isNaN(y)) {
    doc.line(margin, y, W - margin, y);
  }
  y += 7;

  // ── Footer ────────────────────────────────────────────────────────────────────
  const msg = footerText || 'Thank you for your business! We hope to see you again soon.';
  doc.setFont('Roboto', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MID);
  doc.text(msg, W / 2, y, { align: 'center', maxWidth: W - (margin * 2) });

  y += 8;
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated by CafeQR POS · ${new Date().toLocaleDateString('en-IN')}`, W / 2, y, { align: 'center' });

  // ── Save ──────────────────────────────────────────────────────────────────────
  const filename = `Invoice-${orderNo.replace(/[^\w\-]/g, '_')}.pdf`;
  
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
      
      await Share.share({
        title: `Invoice ${orderNo}`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Invoice'
      });
    } catch (err) {
      console.error('[pdf:native] Error saving/sharing PDF invoice:', err);
      alert('Error saving/sharing invoice: ' + err.message);
    }
  } else {
    doc.save(filename);
  }
}
