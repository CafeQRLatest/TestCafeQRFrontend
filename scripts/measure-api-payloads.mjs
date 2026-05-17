const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ORG_ID = process.env.ORG_ID;
const TERMINAL_ID = process.env.TERMINAL_ID;

if (!API_URL) {
  console.error('Set API_URL or NEXT_PUBLIC_API_URL before running this script.');
  process.exit(1);
}

const now = new Date();
const from = new Date(now);
from.setHours(0, 0, 0, 0);
const to = new Date(now);
to.setHours(23, 59, 59, 999);

const endpoints = [
  ['/api/v1/orders/sales/live', {}],
  ['/api/v1/orders/history', { type: 'SALE', fromDate: from.toISOString(), toDate: to.toISOString(), page: '0', size: '20' }],
  ['/api/v1/sync/changes', { since: new Date(Date.now() - 15 * 60 * 1000).toISOString() }],
];

function buildUrl(path, params) {
  const url = new URL(path, API_URL);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url;
}

for (const [path, params] of endpoints) {
  const url = buildUrl(path, params);
  const response = await fetch(url, {
    headers: {
      ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
      ...(CLIENT_ID ? { 'X-Client-ID': CLIENT_ID } : {}),
      ...(ORG_ID ? { 'X-Org-ID': ORG_ID } : {}),
      ...(TERMINAL_ID ? { 'X-Terminal-ID': TERMINAL_ID } : {}),
    },
  });
  const body = await response.text();
  const bytes = Buffer.byteLength(body);
  console.log(`${response.status} ${path} ${bytes} bytes`);
}
