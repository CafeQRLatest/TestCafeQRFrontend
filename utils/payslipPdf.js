import { Capacitor } from '@capacitor/core';
import api from './api';
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from './customFonts';

function fmt(n, dp = 2) {
  return Number(n || 0).toFixed(dp);
}

function money(val, sym) {
  return `${sym || '$'}${fmt(val)}`;
}

const ORANGE     = [234, 99,  16];
const DARK       = [15,  23,  42];
const MID        = [71,  85, 105];
const WHITE      = [255, 255, 255];
const GREEN      = [22, 163,  74];
const RED        = [220, 38,  38];
const TEXT_MUTED = [100, 116, 139];

export async function downloadPayslipPdf(slip, runData, configOverride = null) {
  const { jsPDF } = await import('jspdf');

  // Load config & client details
  let cfg = configOverride || {};
  let clientData = null;
  
  try {
    const [configRes, clientRes] = await Promise.allSettled([
      !configOverride ? api.get('/api/v1/configurations').catch(()=>null) : Promise.resolve(null),
      api.get('/api/v1/clients/me').catch(()=>null)
    ]);
    if (configRes?.value?.data?.data) cfg = configRes.value.data.data;
    if (clientRes?.value?.data?.data) clientData = clientRes.value.data.data;
  } catch (err) {
    console.warn("Failed to load configs:", err);
  }

  const sym = (cfg.currencySymbol || '$') + ' ';
  const clientName = clientData?.name || cfg.restaurantName || 'CAFE QR RESTAURANT';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'italic');
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  
  const W = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Header Title
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...ORANGE);
  doc.text(clientName.toUpperCase(), margin, y + 8);
  
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...MID);
  doc.text('Official Payroll Statement & Employee Payslip', margin, y + 14);

  // Pay Period Box
  const periodW = 60;
  const periodX = W - margin - periodW;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(periodX, y, periodW, 14, 2, 2, 'FD');
  
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('PAY PERIOD', periodX + periodW - 4, y + 5, { align: 'right' });
  
  const pStart = runData?.startDate ? new Date(runData.startDate).toLocaleDateString() : 'N/A';
  const pEnd = runData?.endDate ? new Date(runData.endDate).toLocaleDateString() : 'N/A';
  
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(`${pStart} - ${pEnd}`, periodX + periodW - 4, y + 10, { align: 'right' });

  y += 20;

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, W - margin, y);
  y += 6;

  // Employee Meta Grid
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, W - (margin * 2), 16, 2, 2, 'F');
  
  const colW = (W - (margin * 2)) / 4;
  const metaY = y + 6;
  const metaY2 = y + 11;
  
  const drawMeta = (idx, label, val) => {
    const cx = margin + 4 + (idx * colW);
    doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...TEXT_MUTED);
    doc.text(label, cx, metaY);
    doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(val, cx, metaY2);
  };

  drawMeta(0, 'EMPLOYEE NAME', slip.employeeName || 'N/A');
  drawMeta(1, 'EMPLOYEE ID', slip.employeeId ? slip.employeeId.substring(0,8).toUpperCase() : 'N/A');
  drawMeta(2, 'WORKED HOURS', slip.totalWorkedHours != null ? `${slip.totalWorkedHours} hrs` : '—');
  drawMeta(3, 'UNPAID LEAVES', slip.totalUnpaidLeaveDays != null ? `${slip.totalUnpaidLeaveDays} days` : '0 days');

  y += 24;

  // Earnings & Deductions Tables (Side by side)
  const boxW = (W - (margin * 2) - 8) / 2;
  const earnX = margin;
  const dedX = margin + boxW + 8;
  const boxH = 26;

  // Earnings Box
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(earnX, y, boxW, boxH, 2, 2, 'S');
  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
  doc.text('EARNINGS', earnX + 4, y + 6);
  doc.setDrawColor(241, 245, 249);
  doc.line(earnX + 4, y + 16, earnX + boxW - 4, y + 16);
  
  doc.setFont('Roboto', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Gross Pay (Base & Overtime)', earnX + 4, y + 13);
  doc.setFont('Roboto', 'bold');
  doc.text(money(slip.grossPay, sym), earnX + boxW - 4, y + 13, { align: 'right' });

  // Deductions Box
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(dedX, y, boxW, boxH, 2, 2, 'S');
  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
  doc.text('DEDUCTIONS', dedX + 4, y + 6);
  doc.setDrawColor(241, 245, 249);
  doc.line(dedX + 4, y + 22, dedX + boxW - 4, y + 22); // adjusted line y
  
  doc.setFont('Roboto', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Total Deductions & Advances', dedX + 4, y + 13);
  doc.setFont('Roboto', 'bold'); doc.setTextColor(...RED);
  doc.text(`-${money(slip.totalDeductions, sym)}`, dedX + boxW - 4, y + 13, { align: 'right' });
  
  if (slip.totalUnpaidLeaveDays && slip.totalUnpaidLeaveDays > 0) {
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...TEXT_MUTED);
    doc.text(`(Includes deductions for ${slip.totalUnpaidLeaveDays} Unpaid Leave days)`, dedX + 4, y + 18);
  }

  y += boxH + 8;

  // Net Pay Banner
  doc.setFillColor(16, 185, 129); // Emerald 500
  doc.roundedRect(margin, y, W - (margin * 2), 24, 3, 3, 'F');
  
  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text('NET TAKE-HOME PAY', margin + 6, y + 8);
  
  doc.setFont('Roboto', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255);
  doc.text(money(slip.netPay, sym), margin + 6, y + 18);
  
  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text(`STATUS: ${slip.status || 'PAID'}`, W - margin - 6, y + 13, { align: 'right' });

  y += 40;

  // Signature Block
  const sigW = 60;
  const empSigX = margin;
  const mgrSigX = W - margin - sigW;

  doc.setDrawColor(148, 163, 184);
  doc.line(empSigX, y, empSigX + sigW, y);
  doc.line(mgrSigX, y, mgrSigX + sigW, y);

  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEXT_MUTED);
  doc.text('Employer / Manager Signature', empSigX + (sigW/2), y + 5, { align: 'center' });
  doc.text('Employee Signature', mgrSigX + (sigW/2), y + 5, { align: 'center' });

  // Save / Download Logic
  const filename = `Payslip-${slip.employeeName.replace(/[^\w\-]/g, '_')}-${pStart.replace(/[^\w]/g,'')}.pdf`;
  
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
        title: `Payslip ${slip.employeeName}`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Payslip'
      });
    } catch (err) {
      console.error('[pdf:native] Error saving/sharing Payslip PDF:', err);
      alert('Error saving/sharing payslip: ' + err.message);
    }
  } else {
    doc.save(filename);
  }
}
