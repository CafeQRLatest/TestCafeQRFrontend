import Cookies from 'js-cookie';
import { Capacitor } from '@capacitor/core';
import api from './api';
import { isKnownOffline } from './networkState';
import { printUniversal } from './printGateway';
import { buildKotText, buildReceiptText } from './printUtils';
import { bitmapToPngBase64, logoUrlToBitmapGrid } from './logoBitmap';
import { isNativePrintServicePaired } from './printServiceClient';
import { ensurePrintTemplatesSynced } from './printTemplateSync';

const isBrowser = () => typeof window !== 'undefined';
let cloudPrintFailureCount = 0;
let cloudPrintPausedUntil = 0;

function hasExplicitPrintStationFlag() {
  if (!isBrowser()) return false;
  return window.localStorage.getItem('CAFEQR_PRINT_STATION_ENABLED') === '1'
    || window.localStorage.getItem('CAFEQR_MAIN_OFFLINE_DEVICE') === '1';
}

function readJsonArray(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isNativeAndroid() {
  if (!isBrowser()) return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function hasAndroidBluetoothConfig() {
  if (!isNativeAndroid()) return false;
  return Boolean(
    window.localStorage.getItem('BT_PRINTER_ADDR') ||
    window.localStorage.getItem('BT_PRINTER_ADDR_KOT') ||
    readJsonArray('BT_PRINTER_ADDRS_BILL').length ||
    readJsonArray('BT_PRINTER_ADDRS_KOT').length
  );
}

export function isAndroidPrintStationEnabled() {
  return isNativeAndroid() && (hasExplicitPrintStationFlag() || hasAndroidBluetoothConfig());
}

export function isPrintStationEnabled() {
  if (!isBrowser()) return false;
  if (isNativePrintServicePaired()) return false;
  return isAndroidPrintStationEnabled();
}

export function isCloudPrintCoolingDown() {
  return Date.now() < cloudPrintPausedUntil;
}

function noteCloudPrintSuccess() {
  cloudPrintFailureCount = 0;
  cloudPrintPausedUntil = 0;
}

function noteCloudPrintFailure(error) {
  const status = error?.response?.status;
  if (!status || status >= 500) {
    cloudPrintFailureCount += 1;
    const delay = Math.min(60000, 5000 * (2 ** Math.min(cloudPrintFailureCount - 1, 4)));
    cloudPrintPausedUntil = Date.now() + delay;
  }
}

function fallbackRestaurantProfile() {
  return {
    restaurant_name: Cookies.get('orgName') || Cookies.get('clientName') || 'Restaurant',
    bill_footer_enabled: true,
  };
}

let cachedProfile = null;
let cachedProfileAt = 0;

async function getRestaurantProfile() {
  const now = Date.now();
  if (cachedProfile && now - cachedProfileAt < 300000) {
    return cachedProfile;
  }

  try {
    const { data } = await api.get('/api/v1/configurations', {
      backgroundSync: true,
      skipAuthRedirect: true,
    });
    const cfg = data?.data;
    if (cfg) {
      let logoBitmap = cfg.printLogoBitmap;
      let logoCols = cfg.printLogoCols;
      let logoRows = cfg.printLogoRows;
      let logoBase64 = null;

      if (cfg.logoUrl) {
        try {
          const grid = await logoUrlToBitmapGrid(cfg.logoUrl);
          if (grid) {
            logoBitmap = grid.bitmap;
            logoCols = grid.cols;
            logoRows = grid.rows;
            logoBase64 = cfg.logoUrl;
          }
        } catch (err) {
          console.warn('Failed to convert logoUrl to bitmap grid:', err);
        }
      }

      cachedProfile = {
        restaurant_name: cfg.restaurantName || Cookies.get('orgName') || Cookies.get('clientName'),
        shipping_address_line1: cfg.shippingAddressLine1,
        shipping_address_line2: cfg.shippingAddressLine2,
        shipping_city: cfg.shippingCity,
        shipping_address_state: cfg.shippingState || cfg.shippingAddressState,
        shipping_pincode: cfg.shippingPincode,
        phone: cfg.phone,
        gstin: cfg.gstin,
        gst_enabled: cfg.taxEnabled,
        fssai_license: cfg.fssaiLicense,
        bill_footer_text: cfg.billFooter || cfg.billFooterText,
        bill_footer_enabled: cfg.billFooterEnabled !== false,
        receipt_cols: cfg.printCols,
        print_logo_bitmap: logoBitmap,
        print_logo_cols: logoCols,
        print_logo_rows: logoRows,
        logo_base64: logoBase64 || (logoBitmap ? bitmapToPngBase64(logoBitmap, logoCols, logoRows) : null)
      };
    } else {
      cachedProfile = fallbackRestaurantProfile();
    }
  } catch {
    cachedProfile = fallbackRestaurantProfile();
  }
  cachedProfileAt = now;
  return cachedProfile;
}

function normalizeJob(raw) {
  const payload = raw?.payload || {};
  const order = payload.order || raw.order || {};
  const jobKind = String(raw?.jobKind || payload.jobKind || 'bill').toLowerCase();
  return {
    ...raw,
    kind: jobKind === 'kot' ? 'kot' : jobKind === 'invoice' ? 'invoice' : 'bill',
    order,
  };
}

export async function fetchCloudPrintJobs() {
  if (isKnownOffline() || isCloudPrintCoolingDown()) return [];
  try {
    const { data } = await api.get('/api/v1/print-jobs/recent', {
      backgroundSync: true,
      skipAuthRedirect: true,
      skipOfflineCache: true,
    });
    noteCloudPrintSuccess();
    return (data?.data || []).map(normalizeJob);
  } catch (error) {
    noteCloudPrintFailure(error);
    throw error;
  }
}

export async function enqueueCloudPrintJob(order, kind = 'bill') {
  if (!order?.id) return null;
  const { data } = await api.post('/api/v1/print-jobs', {
    orderId: order.id,
    jobKind: kind,
  }, {
    skipOfflineQueue: true,
  });
  return normalizeJob(data?.data);
}

export async function markCloudPrintJobPrinted(order, kind = 'bill') {
  if (!order?.id || order?.offline || isKnownOffline()) return [];
  const { data } = await api.post(`/api/v1/print-jobs/orders/${order.id}/${kind}/printed`, null, {
    backgroundSync: true,
    skipAuthRedirect: true,
    skipOfflineQueue: true,
  });
  noteCloudPrintSuccess();
  const jobs = (data?.data || []).map(normalizeJob);
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent('cafeqr-cloud-print-jobs-changed', { detail: { jobs } }));
  }
  return jobs;
}

async function printClaimedJob(job) {
  const normalized = normalizeJob(job);
  const profile = await getRestaurantProfile();

  // Sync customized templates from backend before building text
  await ensurePrintTemplatesSynced();

  const text = normalized.kind === 'kot'
    ? buildKotText(normalized.order, profile)
    : buildReceiptText(normalized.order, null, profile);

  await printUniversal({
    text,
    allowPrompt: false,
    allowSystemDialog: false,
    codepage: 0,
    jobId: normalized.id,
    jobKind: normalized.kind,
    document: {
      order: normalized.order,
      restaurant: profile,
    },
  });

  await api.post(`/api/v1/print-jobs/${normalized.id}/printed`, null, {
    backgroundSync: true,
    skipAuthRedirect: true,
    skipOfflineQueue: true,
  });
  return normalized;
}

export async function claimAndPrintCloudJobs(limit = 3) {
  if ((!isPrintStationEnabled() && !isNativePrintServicePaired()) || isKnownOffline() || isCloudPrintCoolingDown()) {
    return [];
  }

  let data;
  try {
    const response = await api.post('/api/v1/print-jobs/claim', null, {
      params: { limit },
      backgroundSync: true,
      skipAuthRedirect: true,
      skipOfflineQueue: true,
    });
    data = response.data;
    noteCloudPrintSuccess();
  } catch (error) {
    noteCloudPrintFailure(error);
    throw error;
  }

  const jobs = (data?.data || []).map(normalizeJob);
  const completed = [];

  for (const job of jobs) {
    try {
      await printClaimedJob(job);
      completed.push({ ...job, status: 'PRINTED' });
    } catch (error) {
      await api.post(`/api/v1/print-jobs/${job.id}/failed`, {
        message: error?.message || 'Print station failed to print this job',
      }, {
        backgroundSync: true,
        skipAuthRedirect: true,
        skipOfflineQueue: true,
      }).catch(() => null);
      completed.push({ ...job, status: 'FAILED', errorMessage: error?.message });
    }
  }

  if (completed.length && isBrowser()) {
    window.dispatchEvent(new CustomEvent('cafeqr-cloud-print-jobs-changed', { detail: { jobs: completed } }));
  }

  return completed;
}
