import Cookies from 'js-cookie';
import api from './api';
import { isPrintStationEnabled } from './cloudPrintStation';

const STORAGE_KEY = 'CAFEQR_OFFLINE_SEQUENCE_LEASES_V1';

const isBrowser = () => typeof window !== 'undefined';

function readLeases() {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLeases(leases) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leases || []));
}

export function isMainOfflineBillingDevice() {
  if (!isBrowser()) return false;
  return window.localStorage.getItem('CAFEQR_MAIN_OFFLINE_DEVICE') === '1' || isPrintStationEnabled();
}

export async function ensureOfflineSequenceLeases(blockSize = 50) {
  if (!isMainOfflineBillingDevice()) return [];
  const terminalId = Cookies.get('terminalId');
  if (!terminalId) return readLeases();

  const current = readLeases();
  const needsTopUp = ['SALE_ORDER', 'CUSTOMER_INVOICE', 'INBOUND_PAYMENT'].some((type) => {
    const lease = current.find((item) => item.documentType === type && item.status === 'ACTIVE');
    if (!lease) return true;
    return Number(lease.endNumber || 0) - Number(lease.nextNumber || 0) < 10;
  });

  if (!needsTopUp) return current;

  const { data } = await api.post('/api/v1/offline-sequence-leases/reserve-defaults', {
    terminalId,
    blockSize,
  }, {
    backgroundSync: true,
    skipAuthRedirect: true,
    skipOfflineQueue: true,
  });

  const next = [...current, ...(data?.data || [])];
  writeLeases(next);
  return next;
}

function formatLeaseNumber(lease, number) {
  const padding = Number(lease.paddingLength || 7);
  const formatted = String(number).padStart(padding, '0');
  return `${lease.prefix || ''}${formatted}${lease.suffix || ''}`;
}

export function allocateOfflineSequence(documentType) {
  const leases = readLeases();
  const index = leases.findIndex((lease) => {
    return lease.documentType === documentType
      && lease.status === 'ACTIVE'
      && Number(lease.nextNumber || 0) <= Number(lease.endNumber || 0);
  });

  if (index < 0) {
    throw new Error(`No offline ${documentType} numbers reserved. Reconnect the main billing device to refresh offline billing ranges.`);
  }

  const lease = leases[index];
  const number = Number(lease.nextNumber);
  leases[index] = {
    ...lease,
    nextNumber: number + 1,
    status: number + 1 > Number(lease.endNumber) ? 'CONSUMED' : lease.status,
  };
  writeLeases(leases);
  return formatLeaseNumber(lease, number);
}
