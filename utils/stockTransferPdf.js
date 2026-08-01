/**
 * stockTransferPdf.js
 * Generates and downloads a professional Stock Transfer / Adjustment PDF document
 * matching the exact clean invoice PDF structure (Image 2) using jsPDF + jspdf-autotable.
 */

import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './customFonts';
import api from './api';

const ORANGE     = [234, 88, 12];   // #ea580c
const DARK       = [15, 23, 42];    // #0f172a
const MID        = [71, 85, 105];   // #475569
const LIGHT_BG   = [248, 250, 252]; // #f8fafc
const GREEN      = [21, 128, 61];   // #15803d
const RED        = [220, 38, 38];   // #dc2626
const MUTED      = [148, 163, 184]; // #94a3b8

function fmt(n, dp = 2) {
  return Number(n || 0).toFixed(dp);
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

export async function generateStockTransferPdf(docData, warehouses = [], products = []) {
  if (!docData) return;

  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  let transfer = docData;
  const isTransfer = !!(transfer?.sourceWarehouseId || transfer?.source_warehouse_id || transfer?.destWarehouseId);

  // 1. Fetch complete document if details missing
  if (transfer?.id && (!transfer.lines || transfer.lines.length === 0 || !transfer.createdByName)) {
    try {
      const endpoint = isTransfer 
        ? `/api/v1/inventory/transfers/${transfer.id}` 
        : `/api/v1/inventory/adjustments/${transfer.id}`;
      const res = await api.get(endpoint);
      if (res.data?.data) {
        transfer = res.data.data;
      }
    } catch (e) {
      console.warn("Failed to fetch full transfer details for PDF generation:", e);
    }
  }

  // 2. Fetch user directory to resolve raw UUIDs (e.g. a53163b5-6345-423b-ab9b...) to full user names
  let usersList = [];
  try {
    const res = await api.get('/api/v1/users');
    usersList = res.data?.data || res.data || [];
  } catch (e) {}

  const resolveUserName = (rawName, rawId) => {
    if (rawName && !rawName.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/)) {
      return rawName;
    }
    if (rawId) {
      const rawIdStr = String(rawId);
      const found = usersList.find(u => String(u.id) === rawIdStr);
      if (found) {
        const nameStr = [found.firstName, found.lastName].filter(Boolean).join(" ");
        if (nameStr) return nameStr;
        if (found.email) return found.email;
        if (found.username) return found.username;
      }
    }
    return rawName && !rawName.includes('-') ? rawName : 'Staff User';
  };

  const createdBy = resolveUserName(transfer.createdByName, transfer.createdBy);
  const updatedBy = resolveUserName(transfer.updatedByName, transfer.updatedBy);

  // 3. Fetch Organization & Client metadata
  let whList = warehouses;
  if (!whList || whList.length === 0) {
    try {
      const res = await api.get('/api/v1/warehouses');
      if (res.data?.success) whList = res.data.data || [];
    } catch (e) {}
  }

  let orgList = [];
  try {
    const res = await api.get('/api/v1/organizations');
    orgList = res.data?.data || res.data || [];
  } catch (e) {}

  let prodList = products;
  if (!prodList || prodList.length === 0) {
    try {
      const res = await api.get('/api/v1/products');
      if (res.data?.success) prodList = res.data.data || [];
    } catch (e) {}
  }

  let clientData = null;
  let cfg = {};
  try {
    const [cRes, configRes] = await Promise.all([
      api.get('/api/v1/clients/me').catch(() => null),
      api.get('/api/v1/configurations').catch(() => null)
    ]);
    clientData = cRes?.data?.data || null;
    cfg = configRes?.data?.data || {};
  } catch (e) {}

  const getWhLabel = (id) => {
    if (!id) return '—';
    const idStr = String(id);
    const w = whList.find(x => String(x.id) === idStr);
    if (!w) return '—';
    const wName = w.name || 'Warehouse';
    const oId = w.orgId || w.organizationId || w.org_id || w.organization_id;
    const org = orgList.find(o => String(o.id) === String(oId));
    const oName = org?.name || w.orgName || w.organizationName;
    return oName ? `${wName} (${oName})` : wName;
  };

  const getProduct = (id) => prodList.find(p => String(p.id) === String(id));

  // Document labels
  const docNumber = transfer.transferNumber || transfer.adjustmentNumber || transfer.id || 'TRF-DOCUMENT';
  const docDate = formatDate(transfer.transferDate || transfer.adjustmentDate || transfer.createdAt);
  const status = (transfer.status || 'DRAFT').toUpperCase();

  const sourceWh = getWhLabel(transfer.sourceWarehouseId || transfer.source_warehouse_id);
  const destWh = getWhLabel(transfer.destWarehouseId || transfer.dest_warehouse_id);
  const mainWh = getWhLabel(transfer.warehouseId || transfer.warehouse_id);

  const clientName = clientData?.name || cfg.restaurantName || 'Restaurant POS';
  const email = clientData?.email || cfg.email || '';
  const gstin = clientData?.gstNumber || cfg.gstin || '';
  const phone = clientData?.phone || cfg.phone || '';
  const logoBase64 = await imgToBase64(cfg.logoUrl || null);

  // Initialize jsPDF A4 portrait
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');

  const W = doc.internal.pageSize.getWidth();
  const margin = 12;

  // ── HEADER SECTION (Matching Invoice PDF layout in Image 2) ────────────────
  let y = margin;
  let textStartX = margin;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, margin - 2, 20, 20);
      textStartX = margin + 24;
    } catch { /* skip */ }
  }

  // Restaurant / Business Info (Top-Left)
  doc.setTextColor(...DARK);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(14);
  doc.text(clientName.toLowerCase(), textStartX, 16);

  let headerY = 20.5;
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MID);

  if (phone || email) {
    const contacts = [phone ? `Ph: ${phone}` : null, email ? `Email: ${email}` : null].filter(Boolean);
    doc.text(contacts.join('  |  '), textStartX, headerY);
    headerY += 4.5;
  }

  if (gstin) {
    doc.text(`GSTIN: ${gstin}`, textStartX, headerY);
    headerY += 4.5;
  }

  // Document Title (Top-Right)
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.text(isTransfer ? 'STOCK TRANSFER' : 'STOCK ADJUSTMENT', W - margin, 18, { align: 'right' });

  y = Math.max(42, headerY + 4);

  // ── METADATA CARD (Matching 4px Orange Vertical Bar Card in Image 2) ────────
  const cardH = 34;

  // Card Background
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin, y, W - (margin * 2), cardH, 2, 2, 'F');

  // Left 4px Vertical Orange Accent Bar
  doc.setFillColor(...ORANGE);
  doc.roundedRect(margin, y, 4, cardH, 2, 2, 'F');

  // Mask right corners of vertical orange bar
  doc.setFillColor(...LIGHT_BG);
  doc.rect(margin + 2, y, 2, cardH, 'F');

  const cardW = W - (margin * 2);
  const col1X = margin + 8;
  const col2X = margin + (cardW * 0.38);
  const col3X = margin + (cardW * 0.70);

  // Row 1 Metadata
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('DOCUMENT NO', col1X, y + 6);
  doc.text('DATE', col2X, y + 6);
  doc.text('STATUS', col3X, y + 6);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(docNumber, col1X, y + 12);
  doc.text(docDate, col2X, y + 12);

  if (status === 'COMPLETED' || status === 'CONFIRMED') {
    doc.setTextColor(...GREEN);
  } else if (status === 'CANCELLED' || status === 'VOIDED') {
    doc.setTextColor(...RED);
  } else {
    doc.setTextColor(...ORANGE);
  }
  doc.text(status, col3X, y + 12);

  // Row 2 Metadata
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(isTransfer ? 'SOURCE WAREHOUSE' : 'WAREHOUSE', col1X, y + 21);
  doc.text(isTransfer ? 'DESTINATION WAREHOUSE' : 'REASON', col2X, y + 21);
  doc.text('CREATED BY', col3X, y + 21);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.text(isTransfer ? sourceWh : mainWh, col1X, y + 27);
  doc.text(isTransfer ? destWh : (transfer.reason || '—'), col2X, y + 27);
  doc.text(createdBy, col3X, y + 27);

  y += cardH + 8;

  // ── MANIFEST ITEMS TABLE (Matching clean autotable layout in Image 2) ──────
  const lines = transfer.lines || [];
  const tableData = lines.map((line, idx) => {
    const p = getProduct(line.productId || line.product_id);
    const prodName = line.productName || p?.name || line.product_name || `Item #${idx + 1}`;
    const sku = line.sku || p?.productCode || p?.sku || p?.code || '—';
    const category = line.categoryName || p?.categoryName || p?.category?.name || '—';
    const unitCost = Number(line.unitCost ?? line.unit_cost ?? 0);
    const qty = isTransfer 
      ? Number(line.transferQuantity ?? line.quantity ?? 0)
      : Number(line.quantityChange ?? line.quantity_change ?? line.quantity ?? 0);

    const lineTotal = Math.abs(qty * unitCost);

    return [
      idx + 1,
      prodName,
      `${sku}${category !== '—' ? ' · ' + category : ''}`,
      `${qty} units`,
      unitCost > 0 ? `Rs.${fmt(unitCost)}` : '—',
      lineTotal > 0 ? `Rs.${fmt(lineTotal)}` : '—'
    ];
  });

  let totalQty = 0;
  let totalVal = 0;
  lines.forEach(l => {
    const q = Math.abs(Number(l.transferQuantity ?? l.quantityChange ?? l.quantity ?? 0));
    const cost = Number(l.unitCost ?? l.unit_cost ?? 0);
    totalQty += q;
    totalVal += (q * cost);
  });

  // Draw bottom accent line under header via autoTable
  autoTable(doc, {
    startY: y,
    head: [['#', 'PRODUCT NAME', 'SKU / CATEGORY', 'QTY', 'UNIT COST', 'TOTAL']],
    body: tableData.length > 0 ? tableData : [['—', 'No items recorded', '—', '—', '—', '—']],
    margin: { left: margin, right: margin },
    styles: {
      font: 'Roboto',
      fontSize: 9,
      textColor: DARK,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: MID,
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: { bottom: 0.4 },
      lineColor: ORANGE,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 60, fontStyle: 'bold' },
      2: { cellWidth: 48 },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    theme: 'plain'
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  if (totalVal > 0) {
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(`Grand Total Value: Rs.${fmt(totalVal)}`, W - margin, finalY, { align: 'right' });
  }

  // Footer Signature Lines
  const sigY = doc.internal.pageSize.getHeight() - 25;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, sigY, margin + 55, sigY);
  doc.line(W - margin - 55, sigY, W - margin, sigY);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text('Dispatched / Issued By', margin + 12, sigY + 4);
  doc.text('Received & Verified By', W - margin - 42, sigY + 4);

  doc.setFontSize(7);
  doc.text(`Generated on ${formatDate(new Date().toISOString())} — POS Stock System`, W / 2, sigY + 12, { align: 'center' });

  // Open PDF blob url in browser for preview & printing
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
}
