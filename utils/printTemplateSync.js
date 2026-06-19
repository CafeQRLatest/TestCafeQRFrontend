// utils/printTemplateSync.js
// Fetches print template configuration from the backend and syncs
// KOT + Receipt template settings into localStorage so that
// buildKotText() / buildReceiptText() in printUtils.js honour
// the customised templates set in Templates & Paper.

import Cookies from 'js-cookie';
import api from './api';

const CACHE_KEY = '__CAFEQR_PRINT_TEMPLATE_CACHED_AT__';
const CACHE_TTL_MS = 60_000; // 1 minute

const DEFAULT_KOT_TEMPLATE = {
  preset: '58MM', widthMm: 58, columns: 32, printableDots: 384,
  leftMarginDots: 0, rightMarginDots: 0, guardCols: 0, safeCols: 0,
  feedLines: 3, autoCut: true,
  showRestaurantName: true, showDailyBillNo: true, showCustomerDetails: true,
  showTableLabel: true, showFssai: true, showGstBreakdown: false,
  titleFontSize: 'DOUBLE', fontSize: 'NORMAL', totalFontSize: 'DOUBLE',
  header: '*** KOT ***', footer: '*** SEND TO KITCHEN ***',
};

const DEFAULT_RECEIPT_TEMPLATE = {
  preset: '58MM', widthMm: 58, columns: 32, printableDots: 384,
  leftMarginDots: 0, rightMarginDots: 0, guardCols: 0, safeCols: 0,
  feedLines: 3, autoCut: true,
  showRestaurantName: true, showDailyBillNo: true, showCustomerDetails: true,
  showTableLabel: true, showFssai: true, showGstBreakdown: true,
  titleFontSize: 'DOUBLE', fontSize: 'NORMAL', totalFontSize: 'DOUBLE',
  header: '*** TAX INVOICE ***', footer: '* THANK YOU! VISIT AGAIN !! *',
};

function mergeKotTemplate(template) {
  const src = template || {};
  return {
    ...DEFAULT_KOT_TEMPLATE, ...src,
    titleFontSize: src.titleFontSize ?? src.kotTitleFontSize ?? DEFAULT_KOT_TEMPLATE.titleFontSize,
    fontSize: src.fontSize ?? src.kotFontSize ?? DEFAULT_KOT_TEMPLATE.fontSize,
    totalFontSize: src.totalFontSize ?? src.kotTotalFontSize ?? DEFAULT_KOT_TEMPLATE.totalFontSize,
    header: src.header ?? src.kotHeader ?? DEFAULT_KOT_TEMPLATE.header,
    footer: src.footer ?? src.kotFooter ?? DEFAULT_KOT_TEMPLATE.footer,
  };
}

function mergeReceiptTemplate(template) {
  const src = template || {};
  return {
    ...DEFAULT_RECEIPT_TEMPLATE, ...src,
    titleFontSize: src.titleFontSize ?? DEFAULT_RECEIPT_TEMPLATE.titleFontSize,
    fontSize: src.fontSize ?? DEFAULT_RECEIPT_TEMPLATE.fontSize,
    totalFontSize: src.totalFontSize ?? DEFAULT_RECEIPT_TEMPLATE.totalFontSize,
    header: src.header ?? src.receiptHeader ?? DEFAULT_RECEIPT_TEMPLATE.header,
    footer: src.footer ?? src.receiptFooter ?? DEFAULT_RECEIPT_TEMPLATE.footer,
  };
}

function syncTemplateToLS(documentKey, template) {
  const prefix = documentKey === 'KOT' ? 'PRINT_KOT_' : 'PRINT_RECEIPT_';
  localStorage.setItem(`${prefix}PAPER_MM`, String(template.widthMm || '58'));
  localStorage.setItem(`${prefix}WIDTH_COLS`, String(template.columns || 32));
  localStorage.setItem(`${prefix}PRINTABLE_DOTS`, String(template.printableDots || 384));
  localStorage.setItem(`${prefix}LEFT_MARGIN_DOTS`, String(template.leftMarginDots ?? 0));
  localStorage.setItem(`${prefix}RIGHT_MARGIN_DOTS`, String(template.rightMarginDots ?? 0));
  localStorage.setItem(`${prefix}GUARD_COLS`, String(template.guardCols ?? 0));
  localStorage.setItem(`${prefix}SAFE_COLS`, String(template.safeCols ?? 0));
  localStorage.setItem(`${prefix}FEED_LINES`, String(template.feedLines ?? 3));
  localStorage.setItem(`${prefix}AUTO_CUT`, template.autoCut !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_RESTAURANT_NAME`, template.showRestaurantName !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_DAILY_BILL_NO`, template.showDailyBillNo !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_CUSTOMER_DETAILS`, template.showCustomerDetails !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_TABLE_LABEL`, template.showTableLabel !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_FSSAI`, template.showFssai !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_GST_BREAKDOWN`, template.showGstBreakdown !== false ? '1' : '0');
  localStorage.setItem(`${prefix}TITLE_FONT_SIZE`, template.titleFontSize || 'DOUBLE');
  localStorage.setItem(`${prefix}FONT_SIZE`, template.fontSize || 'NORMAL');
  localStorage.setItem(`${prefix}TOTAL_FONT_SIZE`, template.totalFontSize || 'DOUBLE');
}

/**
 * Fetch the effective print configuration from the backend and sync
 * KOT + Receipt template settings into localStorage so that
 * buildKotText() / buildReceiptText() honour the customised templates.
 *
 * Uses a short TTL cache to avoid hitting the API on every consecutive print.
 * Pass `force = true` to bypass the cache.
 */
export async function ensurePrintTemplatesSynced(force = false) {
  if (typeof window === 'undefined') return;
  try {
    if (!force) {
      const cachedAt = Number(localStorage.getItem(CACHE_KEY) || 0);
      if (Date.now() - cachedAt < CACHE_TTL_MS) return; // still fresh
    }

    const orgId = Cookies.get('orgId') || '';
    const params = orgId && orgId !== '0' ? { orgId } : {};
    const { data } = await api.get('/api/v1/print-configurations/effective', {
      params,
      backgroundSync: true,
      skipAuthRedirect: true,
    });
    const pc = data?.data || {};

    // Resolve the legacy thermalTemplate for backward-compatibility
    const legacyThermal = pc.thermalTemplate || {};
    const kot = mergeKotTemplate(pc.kotTemplate || legacyThermal);
    const receipt = mergeReceiptTemplate(pc.receiptTemplate || legacyThermal);

    // Sync per-document keys
    syncTemplateToLS('KOT', kot);
    syncTemplateToLS('RECEIPT', receipt);

    // Sync legacy "generic" keys that printUtils.js also reads
    localStorage.setItem('PRINT_PAPER_MM', String(receipt.widthMm || '58'));
    localStorage.setItem('PRINT_WIDTH_COLS', String(receipt.columns || 32));
    localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', String(receipt.leftMarginDots ?? 0));
    localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', String(receipt.rightMarginDots ?? 0));
    localStorage.setItem('PRINT_GUARD_COLS', String(receipt.guardCols ?? 0));
    localStorage.setItem('PRINT_SAFE_COLS', String(receipt.safeCols ?? 0));

    localStorage.setItem('PRINT_SHOW_RESTAURANT_NAME', receipt.showRestaurantName !== false ? '1' : '0');
    localStorage.setItem('PRINT_SHOW_DAILY_BILL_NO', receipt.showDailyBillNo !== false ? '1' : '0');
    localStorage.setItem('PRINT_SHOW_CUSTOMER_DETAILS', receipt.showCustomerDetails !== false ? '1' : '0');
    localStorage.setItem('PRINT_SHOW_TABLE_LABEL', receipt.showTableLabel !== false ? '1' : '0');
    localStorage.setItem('PRINT_SHOW_FSSAI', receipt.showFssai !== false ? '1' : '0');
    localStorage.setItem('PRINT_SHOW_GST_BREAKDOWN', receipt.showGstBreakdown !== false ? '1' : '0');

    localStorage.setItem('PRINT_TITLE_FONT_SIZE', receipt.titleFontSize || 'DOUBLE');
    localStorage.setItem('PRINT_FONT_SIZE', receipt.fontSize || 'NORMAL');
    localStorage.setItem('PRINT_TOTAL_FONT_SIZE', receipt.totalFontSize || 'DOUBLE');
    localStorage.setItem('PRINT_KOT_TITLE_FONT_SIZE', kot.titleFontSize || 'DOUBLE');
    localStorage.setItem('PRINT_KOT_FONT_SIZE', kot.fontSize || 'NORMAL');
    localStorage.setItem('PRINT_KOT_TOTAL_FONT_SIZE', kot.totalFontSize || 'DOUBLE');

    localStorage.setItem('PRINT_KOT_HEADER', kot.header ?? '*** KOT ***');
    localStorage.setItem('PRINT_KOT_FOOTER', kot.footer ?? '*** SEND TO KITCHEN ***');
    localStorage.setItem('PRINT_RECEIPT_HEADER', receipt.header ?? '*** TAX INVOICE ***');
    localStorage.setItem('PRINT_RECEIPT_FOOTER', receipt.footer ?? '* THANK YOU! VISIT AGAIN !! *');

    // Mark cache timestamp
    localStorage.setItem(CACHE_KEY, String(Date.now()));
    console.log('[printTemplateSync] Print template settings synced from backend');
  } catch (err) {
    // Non-fatal: printUtils.js falls back to whatever is in localStorage (or its hardcoded defaults)
    console.warn('[printTemplateSync] Unable to sync print templates from backend:', err?.message || err);
  }
}

/**
 * Invalidate the template cache so the next print will re-fetch.
 * Call this when the user saves template settings.
 */
export function invalidatePrintTemplateCache() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }
}
