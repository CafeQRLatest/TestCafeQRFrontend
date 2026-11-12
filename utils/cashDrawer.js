// utils/cashDrawer.js
//
// Cash drawer support for printer-driven drawers (RJ11/RJ12 "DK" port on the receipt printer).
// The POS never talks to the drawer directly: it sends the ESC/POS pulse command `ESC p m t1 t2`
// to the receipt printer, which fires the drawer solenoid.
//
// Layers (same split as commercial POS/ERP suites):
//   • Branch configuration (backend system_configurations): enabled, auto-open on sale / on order
//     settle, which tenders open the drawer, reason required for manual open.
//   • Role permissions (backend roles): canOpenCashDrawer (manual "No Sale"),
//     canAutoOpenCashDrawer (kick on settle), canViewCashDrawerHistory (audit report).
//   • Terminal hardware profile (this device, localStorage): kick pin, pulse timing, target printer.
//   • Audit trail: every attempt (sent or failed) is posted to /api/v1/cash-drawer/events,
//     with a local retry queue so offline kicks are still recorded once the device reconnects.

import api from './api';
import { getCachedConfig } from './moduleVisibility';
import { printUniversal } from './printGateway';

export const CASH_DRAWER_TRIGGERS = Object.freeze({
  SALE_SETTLE: 'SALE_SETTLE',
  ORDER_SETTLE: 'ORDER_SETTLE',
  MANUAL: 'MANUAL',
  TEST: 'TEST',
});

export const CASH_DRAWER_TENDERS = ['CASH', 'CARD', 'UPI', 'ONLINE'];

export const MANUAL_OPEN_REASONS = [
  'Give change',
  'Cash pickup / drop',
  'Float check',
  'Correct previous transaction',
  'Shift handover count',
];

// ── Terminal hardware profile (per device) ─────────────────────────────────

const HW_KEYS = {
  enabled: 'CASH_DRAWER_DEVICE_ENABLED', // '0' disables kicks on this terminal (no drawer attached)
  pin: 'CASH_DRAWER_PIN', // '2' | '5' | 'both'
  onTime: 'CASH_DRAWER_PULSE_ON', // t1, units of 2 ms (25 = 50 ms)
  offTime: 'CASH_DRAWER_PULSE_OFF', // t2, units of 2 ms (250 = 500 ms)
  printerName: 'CASH_DRAWER_PRINTER_NAME', // optional Windows printer override; default = bill printer
};

export const DEFAULT_HARDWARE = Object.freeze({ enabled: true, pin: '2', onTime: 25, offTime: 250, printerName: '' });

const QUEUE_KEY = 'CASH_DRAWER_EVENT_QUEUE';
const QUEUE_MAX = 200;

function ls() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function clampByte(value, fallback) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(255, n));
}

export function getDrawerHardware() {
  const store = ls();
  if (!store) return { ...DEFAULT_HARDWARE };
  const pinRaw = String(store.getItem(HW_KEYS.pin) || DEFAULT_HARDWARE.pin);
  return {
    enabled: store.getItem(HW_KEYS.enabled) !== '0',
    pin: ['2', '5', 'both'].includes(pinRaw) ? pinRaw : DEFAULT_HARDWARE.pin,
    onTime: clampByte(store.getItem(HW_KEYS.onTime), DEFAULT_HARDWARE.onTime),
    offTime: clampByte(store.getItem(HW_KEYS.offTime), DEFAULT_HARDWARE.offTime),
    printerName: String(store.getItem(HW_KEYS.printerName) || '').trim(),
  };
}

export function saveDrawerHardware(hw) {
  const store = ls();
  if (!store) return;
  const next = { ...getDrawerHardware(), ...(hw || {}) };
  store.setItem(HW_KEYS.enabled, next.enabled ? '1' : '0');
  store.setItem(HW_KEYS.pin, ['2', '5', 'both'].includes(String(next.pin)) ? String(next.pin) : '2');
  store.setItem(HW_KEYS.onTime, String(clampByte(next.onTime, DEFAULT_HARDWARE.onTime)));
  store.setItem(HW_KEYS.offTime, String(clampByte(next.offTime, DEFAULT_HARDWARE.offTime)));
  if (next.printerName) store.setItem(HW_KEYS.printerName, String(next.printerName).trim());
  else store.removeItem(HW_KEYS.printerName);
}

/**
 * ESC p m t1 t2 — generate pulse. m=0 → connector pin 2, m=1 → pin 5.
 * t1/t2 are on/off times in 2 ms units.
 */
export function buildDrawerKickBytes(hw = DEFAULT_HARDWARE) {
  const on = clampByte(hw.onTime, DEFAULT_HARDWARE.onTime);
  const off = clampByte(hw.offTime, DEFAULT_HARDWARE.offTime);
  const pins = hw.pin === 'both' ? [0, 1] : hw.pin === '5' ? [1] : [0];
  const bytes = [];
  pins.forEach((m) => bytes.push(0x1b, 0x70, m, on, off));
  return new Uint8Array(bytes);
}

// ── Branch configuration + role rules ──────────────────────────────────────

export function readDrawerConfig(config) {
  // Screen-level configs (e.g. /pos/sale/configurations) may predate the drawer fields; fall back to the cached branch config.
  const cfg = (config && Object.prototype.hasOwnProperty.call(config, 'cashDrawerEnabled'))
    ? config
    : (getCachedConfig() || config || {});
  return {
    enabled: cfg.cashDrawerEnabled === true,
    autoOpenOnSale: cfg.cashDrawerAutoOpenOnSale !== false,
    autoOpenOnOrderSettle: cfg.cashDrawerAutoOpenOnOrderSettle !== false,
    // Fixed rule: only physical cash goes into the drawer. Cash payments and split payments with a
    // cash part open it; card / UPI / online / credit never do.
    openTenders: ['CASH'],
    reasonRequired: cfg.cashDrawerManualReasonRequired !== false,
  };
}

export function isAdminRole(role) {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

/** Can this user open the drawer by hand ("No Sale")? */
export function canManuallyOpenDrawer(auth, config) {
  const cfg = readDrawerConfig(config);
  if (!cfg.enabled || !getDrawerHardware().enabled) return false;
  return isAdminRole(auth?.userRole) || auth?.canOpenCashDrawer === true;
}

/**
 * Which tenders were used in a settlement. Handles single-tender and MIXED (split) payloads
 * coming from PaymentDialog: { paymentMethod, payments: [{ paymentMethod, amount }], cashAmount }.
 */
export function tendersOf(payment) {
  if (!payment) return [];
  const method = String(payment.paymentMethod || payment.payment_method || '').toUpperCase();
  const splits = Array.isArray(payment.payments) ? payment.payments
    : Array.isArray(payment.paymentSplits) ? payment.paymentSplits
      : Array.isArray(payment.splits) ? payment.splits : [];
  if (method === 'MIXED' || splits.length) {
    const fromSplits = splits
      .filter((s) => Number(s?.amount || 0) > 0)
      .map((s) => String(s.paymentMethod || s.method || '').toUpperCase())
      .filter(Boolean);
    if (Number(payment.cashAmount || 0) > 0 && !fromSplits.includes('CASH')) fromSplits.push('CASH');
    return Array.from(new Set(fromSplits));
  }
  return method ? [method] : [];
}

/** Pure decision used by the settle hooks (exported for tests). */
export function shouldAutoOpenDrawer({ trigger, payment, auth, config, hardware }) {
  const cfg = readDrawerConfig(config);
  const hw = hardware || getDrawerHardware();
  if (!cfg.enabled || !hw.enabled) return false;
  if (trigger === CASH_DRAWER_TRIGGERS.SALE_SETTLE && !cfg.autoOpenOnSale) return false;
  if (trigger === CASH_DRAWER_TRIGGERS.ORDER_SETTLE && !cfg.autoOpenOnOrderSettle) return false;
  if (!isAdminRole(auth?.userRole) && auth?.canAutoOpenCashDrawer === false) return false;
  const used = tendersOf(payment);
  if (used.includes('CREDIT') && used.length === 1) return false; // nothing physically received
  return used.some((t) => cfg.openTenders.includes(t));
}

// ── Event log with offline retry queue ─────────────────────────────────────

function readQueue() {
  try {
    const raw = ls()?.getItem(QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    ls()?.setItem(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_MAX)));
  } catch {
    /* storage full / blocked: best effort */
  }
}

function newEventId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `cd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRetryable(error) {
  const status = error?.response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
}

async function postEvent(event) {
  await api.post('/api/v1/cash-drawer/events', event);
}

let flushing = null;

/** Re-send queued events (offline kicks). Safe to call often. */
export function flushCashDrawerEventQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    const pending = readQueue();
    if (!pending.length) return;
    const settled = new Set();
    for (const evt of pending) {
      try {
        await postEvent(evt);
        settled.add(evt);
      } catch (error) {
        // Validation rejects are final; keep only transient failures.
        if (!isRetryable(error)) {
          settled.add(evt);
          console.warn('[cash-drawer] dropping rejected queued event', evt?.clientEventId, error?.response?.status);
        }
      }
    }
    // Re-read before writing: kicks made while this flush was running have appended to the queue,
    // and writing back the snapshot taken above would erase them.
    const settledIds = new Set([...settled].map((evt) => evt?.clientEventId));
    writeQueue(readQueue().filter((evt) => !settledIds.has(evt?.clientEventId)));
  })().finally(() => { flushing = null; });
  return flushing;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushCashDrawerEventQueue().catch(() => {}); });
}

async function recordEvent(event) {
  try {
    await postEvent(event);
  } catch (error) {
    if (isRetryable(error)) {
      writeQueue([...readQueue(), event]);
    } else {
      console.warn('[cash-drawer] event rejected by server', error?.response?.status, error?.response?.data?.message);
    }
  }
  flushCashDrawerEventQueue().catch(() => {});
}

// ── Kick ──────────────────────────────────────────────────────────────────

/**
 * Plain-language explanation of a failed kick. The drawer is driven by the receipt printer,
 * so almost every failure is really a printer-connection problem on this device.
 */
export function describeDrawerError(error) {
  const code = String(error || '');
  if (/NO_PRINTER_CONFIGURED|NO_WIN_PRINTER|NO_SILENT_PATH/.test(code)) {
    return 'No receipt printer is set up on this device. The cash drawer opens through the receipt printer, so set up the bill printer under Configuration → Hardware.';
  }
  if (/PRINT_HUB_UNREACHABLE|PRINT_SERVICE_OFFLINE|Failed to fetch|NetworkError/i.test(code)) {
    return 'The CafeQR print service on this computer is not running. Start it, then try again.';
  }
  if (/PRINT_HUB_FAILED/.test(code)) {
    return 'The receipt printer rejected the command. Check it is switched on, has paper and is online.';
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|socket|PRINTER_TCP_FAILED/i.test(code)) {
    return 'The receipt printer did not respond. Check its cable or network connection.';
  }
  return code ? `The receipt printer could not be reached (${code}).` : 'The receipt printer could not be reached.';
}

function orderRef(order) {
  if (!order) return {};
  const id = order.id || order.orderId || null;
  const isUuid = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
  return {
    orderId: isUuid ? id : null,
    orderNo: order.orderNo || order.order_no || order.documentNo || order.billNo || (id ? String(id) : null),
  };
}

/**
 * Send the kick to the receipt printer and record the attempt.
 * Resolves to { ok, via, error } and never throws.
 */
export async function openCashDrawer({ trigger, reason, order, payment, amount } = {}) {
  const hw = getDrawerHardware();
  const clientEventId = newEventId();
  const startedAt = new Date();
  let ok = false;
  let via = null;
  let errorMessage = null;

  try {
    const res = await printUniversal({
      text: '',
      rawPayload: buildDrawerKickBytes(hw),
      jobKind: 'bill',
      jobId: `cash-drawer:${clientEventId}`,
      winPrinterNames: hw.printerName ? [hw.printerName] : undefined,
      allowPrompt: false,
      allowSystemDialog: false,
      metadata: { purpose: 'CASH_DRAWER_KICK', trigger },
    });
    via = res?.via || null;
    ok = true;
  } catch (error) {
    errorMessage = String(error?.message || error || 'UNKNOWN').slice(0, 500);
    console.warn('[cash-drawer] kick failed:', errorMessage);
  }

  const tenders = tendersOf(payment);
  const event = {
    triggerType: trigger,
    status: ok ? 'SENT' : 'FAILED',
    reason: reason ? String(reason).slice(0, 255) : null,
    ...orderRef(order),
    paymentMethod: payment?.paymentMethod ? String(payment.paymentMethod).toUpperCase() : (tenders[0] || null),
    amount: amount ?? payment?.amountPaid ?? order?.grandTotal ?? null,
    printerName: hw.printerName || null,
    transport: via,
    errorMessage,
    deviceEventAt: startedAt.toISOString().replace('Z', ''),
    clientEventId,
    deviceLabel: (ls()?.getItem('terminalName') || '').slice(0, 255) || null,
  };
  recordEvent(event); // fire-and-forget: the drawer must never wait on the network

  return { ok, via, error: errorMessage };
}

/**
 * Hook for settle success points. Applies configuration + role rules, then kicks.
 * Never throws, so a drawer/printer problem can never break a completed payment.
 */
export async function autoOpenCashDrawerAfterSettle({ trigger, order, payment, auth, config }) {
  try {
    if (!shouldAutoOpenDrawer({ trigger, payment, auth, config })) return { ok: false, skipped: true };
    return await openCashDrawer({ trigger, order, payment });
  } catch (error) {
    console.warn('[cash-drawer] auto-open skipped due to error:', error?.message || error);
    return { ok: false, error: String(error?.message || error) };
  }
}
