jest.mock('../api', () => ({ __esModule: true, default: { post: jest.fn(() => Promise.resolve({ data: {} })) } }));
jest.mock('../printGateway', () => ({ printUniversal: jest.fn(() => Promise.resolve({ via: 'winspool' })) }));

import api from '../api';
import { printUniversal } from '../printGateway';
import {
  CASH_DRAWER_TRIGGERS,
  buildDrawerKickBytes,
  canManuallyOpenDrawer,
  flushCashDrawerEventQueue,
  openCashDrawer,
  readDrawerConfig,
  shouldAutoOpenDrawer,
  tendersOf,
} from '../cashDrawer';

const enabledConfig = {
  cashDrawerEnabled: true,
  cashDrawerAutoOpenOnSale: true,
  cashDrawerAutoOpenOnOrderSettle: true,
  cashDrawerOpenTenders: 'CASH',
  cashDrawerManualReasonRequired: true,
};
const cashier = { userRole: 'CASHIER', canAutoOpenCashDrawer: true, canOpenCashDrawer: false };
const hw = { enabled: true, pin: '2', onTime: 25, offTime: 250, printerName: '' };

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe('buildDrawerKickBytes', () => {
  it('emits ESC p 0 t1 t2 for pin 2', () => {
    expect(Array.from(buildDrawerKickBytes(hw))).toEqual([0x1b, 0x70, 0, 25, 250]);
  });
  it('emits both pins and clamps timings into a byte', () => {
    expect(Array.from(buildDrawerKickBytes({ pin: 'both', onTime: 999, offTime: -4 })))
      .toEqual([0x1b, 0x70, 0, 255, 1, 0x1b, 0x70, 1, 255, 1]);
  });
});

describe('tendersOf', () => {
  it('reads single tender', () => {
    expect(tendersOf({ paymentMethod: 'cash' })).toEqual(['CASH']);
  });
  it('reads non-zero split tenders for MIXED', () => {
    expect(tendersOf({
      paymentMethod: 'MIXED',
      paymentSplits: [{ paymentMethod: 'CASH', amount: 50 }, { paymentMethod: 'UPI', amount: 0 }, { paymentMethod: 'CARD', amount: 20 }],
    })).toEqual(['CASH', 'CARD']);
  });
});

describe('shouldAutoOpenDrawer', () => {
  const base = { trigger: CASH_DRAWER_TRIGGERS.SALE_SETTLE, auth: cashier, config: enabledConfig, hardware: hw };

  it('opens for cash when everything is enabled', () => {
    expect(shouldAutoOpenDrawer({ ...base, payment: { paymentMethod: 'CASH' } })).toBe(true);
  });
  it('stays shut for a non-drawer tender', () => {
    expect(shouldAutoOpenDrawer({ ...base, payment: { paymentMethod: 'UPI' } })).toBe(false);
  });
  it('opens for MIXED when a split is cash', () => {
    expect(shouldAutoOpenDrawer({ ...base, payment: { paymentMethod: 'MIXED', paymentSplits: [{ paymentMethod: 'CASH', amount: 10 }, { paymentMethod: 'UPI', amount: 5 }] } })).toBe(true);
  });
  it('never opens for credit', () => {
    expect(shouldAutoOpenDrawer({ ...base, config: { ...enabledConfig, cashDrawerOpenTenders: 'CASH,CARD,UPI,ONLINE' }, payment: { paymentMethod: 'CREDIT' } })).toBe(false);
  });
  it('respects the branch master switch and per-trigger switches', () => {
    expect(shouldAutoOpenDrawer({ ...base, config: { ...enabledConfig, cashDrawerEnabled: false }, payment: { paymentMethod: 'CASH' } })).toBe(false);
    expect(shouldAutoOpenDrawer({ ...base, trigger: CASH_DRAWER_TRIGGERS.ORDER_SETTLE, config: { ...enabledConfig, cashDrawerAutoOpenOnOrderSettle: false }, payment: { paymentMethod: 'CASH' } })).toBe(false);
  });
  it('respects the role permission, except for admins', () => {
    const denied = { ...cashier, canAutoOpenCashDrawer: false };
    expect(shouldAutoOpenDrawer({ ...base, auth: denied, payment: { paymentMethod: 'CASH' } })).toBe(false);
    expect(shouldAutoOpenDrawer({ ...base, auth: { ...denied, userRole: 'ADMIN' }, payment: { paymentMethod: 'CASH' } })).toBe(true);
  });
  it('stays shut when this terminal has no drawer', () => {
    expect(shouldAutoOpenDrawer({ ...base, hardware: { ...hw, enabled: false }, payment: { paymentMethod: 'CASH' } })).toBe(false);
  });
});

describe('canManuallyOpenDrawer', () => {
  it('requires the role permission', () => {
    expect(canManuallyOpenDrawer(cashier, enabledConfig)).toBe(false);
    expect(canManuallyOpenDrawer({ ...cashier, canOpenCashDrawer: true }, enabledConfig)).toBe(true);
  });
});

describe('readDrawerConfig', () => {
  it('drops unknown tenders and defaults to CASH', () => {
    expect(readDrawerConfig({ cashDrawerEnabled: true, cashDrawerOpenTenders: 'bitcoin' }).openTenders).toEqual(['CASH']);
  });
});

describe('openCashDrawer', () => {
  it('sends a raw kick to the bill printer and logs the event', async () => {
    const res = await openCashDrawer({ trigger: CASH_DRAWER_TRIGGERS.MANUAL, reason: 'Give change' });
    expect(res.ok).toBe(true);
    const call = printUniversal.mock.calls[0][0];
    expect(call.jobKind).toBe('bill');
    expect(call.allowSystemDialog).toBe(false);
    expect(Array.from(call.rawPayload)).toEqual([0x1b, 0x70, 0, 25, 250]);
    await Promise.resolve();
    expect(api.post).toHaveBeenCalledWith('/api/v1/cash-drawer/events', expect.objectContaining({
      triggerType: 'MANUAL', status: 'SENT', reason: 'Give change', transport: 'winspool',
    }));
  });

  it('records a FAILED event and queues it when the server is unreachable', async () => {
    printUniversal.mockRejectedValueOnce(new Error('NO_PRINTER_CONFIGURED'));
    api.post.mockRejectedValue(new Error('Network Error'));
    const res = await openCashDrawer({ trigger: CASH_DRAWER_TRIGGERS.SALE_SETTLE, payment: { paymentMethod: 'CASH', amountPaid: 120 } });
    expect(res.ok).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    const queued = JSON.parse(window.localStorage.getItem('CASH_DRAWER_EVENT_QUEUE') || '[]');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual(expect.objectContaining({ status: 'FAILED', errorMessage: 'NO_PRINTER_CONFIGURED', amount: 120 }));
    api.post.mockReset();
  });

  it('keeps an event queued while a flush is running', async () => {
    const queuedEarlier = { clientEventId: 'old-1', triggerType: 'SALE_SETTLE', status: 'SENT' };
    window.localStorage.setItem('CASH_DRAWER_EVENT_QUEUE', JSON.stringify([queuedEarlier]));

    let releaseFlushPost;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { releaseFlushPost = () => resolve({ data: {} }); }));
    const flush = flushCashDrawerEventQueue(); // blocked sending old-1

    // A kick made mid-flush cannot reach the server and is appended to the queue.
    const duringFlush = { clientEventId: 'new-1', triggerType: 'MANUAL', status: 'SENT' };
    window.localStorage.setItem('CASH_DRAWER_EVENT_QUEUE', JSON.stringify([queuedEarlier, duringFlush]));

    releaseFlushPost();
    await flush;

    const queued = JSON.parse(window.localStorage.getItem('CASH_DRAWER_EVENT_QUEUE') || '[]');
    expect(queued.map((e) => e.clientEventId)).toEqual(['new-1']);
    api.post.mockReset();
  });
});
