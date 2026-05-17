let connectionLost = false;
let lastReason = null;

const isBrowser = () => typeof window !== 'undefined';

const browserReportsOffline = () => {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

const emitNetworkState = () => {
  if (!isBrowser()) return;

  window.dispatchEvent(
    new CustomEvent('cafeqr-network-state', {
      detail: getNetworkStatus(),
    })
  );
};

export const getOfflineReasonFromError = (error) => {
  if (!error || error.response) return null;

  const code = String(error.code || '').toUpperCase();
  const message = String(error.message || '').toLowerCase();
  const requestStatus = String(error.request?.statusText || '').toLowerCase();

  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return code;
  }

  if (
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('err_connection_closed') ||
    message.includes('connection_closed') ||
    message.includes('err_insufficient_resources') ||
    message.includes('insufficient_resources') ||
    message.includes('insufficient resources') ||
    message.includes('err_name_not_resolved') ||
    message.includes('name_not_resolved') ||
    requestStatus.includes('connection_closed') ||
    requestStatus.includes('insufficient_resources') ||
    requestStatus.includes('insufficient resources') ||
    requestStatus.includes('name_not_resolved')
  ) {
    return error.code || error.message || 'network-error';
  }

  return null;
};

export const markConnectionLost = (reason = 'network-error') => {
  if (!isBrowser()) return;

  connectionLost = true;
  lastReason = reason;
  emitNetworkState();
};

export const markConnectionOnline = () => {
  if (!isBrowser()) return;
  if (browserReportsOffline()) return;

  connectionLost = false;
  lastReason = null;
  emitNetworkState();
};

export const isKnownOffline = () => {
  if (browserReportsOffline()) return true;
  if (!isBrowser()) return false;

  return connectionLost;
};

export const canAttemptNetworkProbe = () => {
  return !browserReportsOffline();
};

export const getNetworkStatus = () => {
  const browserOffline = browserReportsOffline();

  return {
    offline: browserOffline || isKnownOffline(),
    browserOffline,
    reason: browserOffline ? 'browser-offline' : lastReason,
    retryAfter: 0,
  };
};

if (isBrowser()) {
  window.addEventListener('offline', () => markConnectionLost('browser-offline'));
  window.addEventListener('online', emitNetworkState);
}
