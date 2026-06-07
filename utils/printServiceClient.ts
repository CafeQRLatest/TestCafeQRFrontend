const SERVICE_URL = 'http://127.0.0.1:3333';
const TOKEN_KEY = 'CAFEQR_PRINT_SERVICE_LOCAL_TOKEN';
const PAIRED_KEY = 'CAFEQR_NATIVE_PRINT_SERVICE_PAIRED';

export type NativePrintSubmission = {
  idempotencyKey?: string;
  jobKind?: 'bill' | 'kot' | 'invoice' | 'test';
  outputFormat?: 'THERMAL' | 'REGULAR' | 'BOTH';
  printerProfileId?: string;
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
    const response = await fetch(`${SERVICE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
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

export function isNativePrintServicePaired() {
  return typeof window !== 'undefined'
    && window.localStorage.getItem(PAIRED_KEY) === '1'
    && Boolean(localToken());
}

export async function getPrintServiceHealth() {
  return request('/v1/health', { method: 'GET' }, 2500);
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
  window.dispatchEvent(new Event('cafeqr-print-station-config-changed'));
}
