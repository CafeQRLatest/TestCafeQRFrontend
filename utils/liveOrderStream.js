import { getApiUrl } from './api';

// Signal-only stream from the backend: it sends a "changed" event whenever a live order is
// written for this client and branch. It carries no order data, so callers re-fetch through the
// normal REST endpoint on each signal. EventSource reconnects on its own after a drop.
export function subscribeLiveOrderChanges({ clientId, orgId, onChange, onStateChange }) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {};
  if (!clientId || !orgId) return () => {};

  const url = `${getApiUrl()}/api/v1/public/menu/${encodeURIComponent(clientId)}/${encodeURIComponent(orgId)}/stream`;
  let source = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    source = new EventSource(url);
    source.onopen = () => onStateChange?.(true);
    source.addEventListener('changed', () => onChange?.());
    source.onerror = () => onStateChange?.(false);
  };

  open();

  return () => {
    closed = true;
    onStateChange?.(false);
    if (source) source.close();
  };
}
