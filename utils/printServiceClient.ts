const SERVICE_URL = 'http://127.0.0.1:3333';
const TOKEN_KEY = 'CAFEQR_PRINT_SERVICE_LOCAL_TOKEN';
const PAIRED_KEY = 'CAFEQR_NATIVE_PRINT_SERVICE_PAIRED';
const LOCAL_ACCESS_KEY = 'CAFEQR_PRINT_SERVICE_LOCAL_ACCESS';
const MAIN_OFFLINE_KEY = 'CAFEQR_MAIN_OFFLINE_DEVICE';
export type NativePrintSubmission = {
  idempotencyKey?: string;
  jobKind?: 'bill' | 'kot' | 'invoice' | 'test';
  outputFormat?: 'THERMAL' | 'REGULAR' | 'BOTH';
  printerProfileId?: string;
  winPrinterNames?: string[];
  routeId?: string;
  text?: string;
  dataBase64?: string;
  document?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function localToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers || {});
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = localToken();
    if (token) headers.set('X-CafeQR-Local-Token', token);
    const requestInit: RequestInit & { targetAddressSpace?: 'loopback' } = {
      ...init,
      headers,
      signal: controller.signal,
      targetAddressSpace: 'loopback',
    };
    const response = await fetch(`${SERVICE_URL}${path}`, requestInit);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error || `PRINT_SERVICE_${response.status}`) as Error & {
        code?: string;
        status?: number;
        jobKind?: string;
      };
      error.code = data?.code;
      error.status = response.status;
      error.jobKind = data?.jobKind;
      throw error;
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export function isPrintServiceSecureContext() {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return window.isSecureContext
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1';
}

export function hasPrintServiceLocalAccess() {
  return typeof window !== 'undefined'
    && window.localStorage.getItem(LOCAL_ACCESS_KEY) === '1';
}

export function rememberPrintServiceLocalAccess(allowed: boolean) {
  if (typeof window === 'undefined') return;
  if (allowed) window.localStorage.setItem(LOCAL_ACCESS_KEY, '1');
  else window.localStorage.removeItem(LOCAL_ACCESS_KEY);
}

export function isNativePrintServicePaired() {
  return typeof window !== 'undefined'
    && window.localStorage.getItem(PAIRED_KEY) === '1'
    && Boolean(localToken());
}

function markMainOfflineDevice() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MAIN_OFFLINE_KEY, '1');
}

export async function getPrintServiceHealth() {
  return request('/v1/health', { method: 'GET' }, 2500);
}

export async function connectNativePrintService() {
  const health = await getPrintServiceHealth();
  rememberPrintServiceLocalAccess(true);

  // Auto-pair: When the local C# print service is reachable and returns
  // a localClientToken in its health response, automatically set the
  // pairing localStorage flags. This ensures isNativePrintServicePaired()
  // returns true, which gates automatic KOT and bill printing.
  if (health?.localClientToken && typeof window !== 'undefined') {
    const existingToken = window.localStorage.getItem(TOKEN_KEY);
    if (!existingToken) {
      window.localStorage.setItem(TOKEN_KEY, health.localClientToken);
    }
    if (window.localStorage.getItem(PAIRED_KEY) !== '1') {
      window.localStorage.setItem(PAIRED_KEY, '1');
      window.localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
      markMainOfflineDevice();
      window.dispatchEvent(new Event('cafeqr-print-station-config-changed'));
    }
  }

  return health;
}

export async function getPrintServicePrinters() {
  return request('/v1/printers', { method: 'GET' }, 5000);
}

export async function getLocalPrintJobs() {
  return request('/v1/jobs', { method: 'GET' }, 5000);
}

export async function getPrintServiceLogs() {
  return request('/v1/logs', { method: 'GET' }, 5000);
}

export async function retryLocalPrintJob(id: string | number) {
  return request(`/v1/jobs/${id}/retry`, { method: 'POST' }, 5000);
}

export async function resolveLocalPrintJob(id: string | number, outcome: 'COMPLETED' | 'CANCELLED') {
  return request(`/v1/jobs/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
  }, 5000);
}

export async function submitNativePrintJob(job: NativePrintSubmission) {
  return request('/v1/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  }, 10000);
}

export async function enrollNativePrintService(cloudBaseUrl: string, pairingCode: string) {
  const response = await request('/v1/enroll', {
    method: 'POST',
    body: JSON.stringify({ cloudBaseUrl, pairingCode }),
  }, 20000);
  if (!response?.localClientToken) throw new Error('PRINT_SERVICE_LOCAL_TOKEN_MISSING');
  window.localStorage.setItem(TOKEN_KEY, response.localClientToken);
  window.localStorage.setItem(PAIRED_KEY, '1');
  window.localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
  markMainOfflineDevice();
  rememberPrintServiceLocalAccess(true);
  window.dispatchEvent(new Event('cafeqr-print-station-config-changed'));
  return response;
}

export async function updateNativePrintConfiguration(configuration: Record<string, unknown>) {
  return request('/v1/configuration', {
    method: 'PUT',
    body: JSON.stringify(configuration),
  }, 10000);
}

export async function getNativePrintConfiguration() {
  return request('/v1/configuration', { method: 'GET' }, 5000);
}

export async function syncNativePrintConfiguration() {
  return request('/v1/configuration/sync', { method: 'POST' }, 20000);
}

export async function acceptNativeCloudConfiguration(
  configuration: Record<string, unknown>,
  cloudRevision = 0
) {
  return request('/v1/configuration/cloud', {
    method: 'POST',
    body: JSON.stringify({ configuration, cloudRevision }),
  }, 10000);
}

export function forgetNativePrintService() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PAIRED_KEY);
  window.localStorage.removeItem(MAIN_OFFLINE_KEY);
  window.dispatchEvent(new Event('cafeqr-print-station-config-changed'));
}

// Auto-recovery mechanism for paired print stations (caches, localStorage wipes, etc.)
if (typeof window !== 'undefined') {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token && window.localStorage.getItem(PAIRED_KEY) === '1') {
    markMainOfflineDevice();
  }
  if (!token) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2000);
    
    fetch(`${SERVICE_URL}/v1/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    })
      .then(resp => resp.json())
      .then(data => {
        if (data?.localClientToken && data?.paired) {
          window.localStorage.setItem(TOKEN_KEY, data.localClientToken);
          window.localStorage.setItem(PAIRED_KEY, '1');
          window.localStorage.setItem(LOCAL_ACCESS_KEY, '1');
          window.localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
          markMainOfflineDevice();
          window.dispatchEvent(new Event('cafeqr-print-station-config-changed'));
          console.log('[print-recovery] Auto-restored pairing token from local Windows Service');
        }
      })
      .catch(() => {
        // Silently catch connection errors if the service is not installed/running
      })
      .finally(() => {
        window.clearTimeout(timer);
      });
  }
}
