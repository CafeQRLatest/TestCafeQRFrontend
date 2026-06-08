// utils/printRouting.ts
// KOT Routing Config — stored in localStorage AND synced to print_configurations table
// Schema: print_configurations { scope_type='terminal'|'org', scope_id, settings_json }

export type PrinterTarget =
  | { type: 'winspool'; printerName: string }
  | { type: 'android-bt'; address: string; nameHint?: string }
  | { type: 'webusb'; vendorId: number; productId: number; serialNumber?: string | null }
  | { type: 'webserial'; portIndex: number };

/** A kitchen station maps one or more menu category IDs → one or more printers */
export type KitchenStation = {
  id: string;            // stable string id e.g. 'kitchen' | 'juice' | 'grill'
  name: string;          // display name e.g. 'Main Kitchen'
  categoryIds: string[]; // UUIDs from public.categories table
  printers: PrinterTarget[];
};

export type PrintRoutingConfig = {
  billPrinters: PrinterTarget[];        // 1+ printers for final bill
  kotDefaultPrinters: PrinterTarget[]; // fallback KOT printer (unmatched categories)
  stations: KitchenStation[];          // category-routed stations
};

const LS_KEY = 'PRINT_ROUTING_V1';

// ---------- local storage ----------

export function getPrintRouting(): PrintRoutingConfig {
  try {
    if (typeof window === 'undefined') return empty();
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {}
  return empty();
}

export function savePrintRouting(cfg: PrintRoutingConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

function empty(): PrintRoutingConfig {
  return { billPrinters: [], kotDefaultPrinters: [], stations: [] };
}

// ---------- DB sync helpers ----------

/**
 * Save routing config to the print_configurations table.
 * scope_type='terminal' + scope_id=terminalId is the preferred scope.
 * Falls back to scope_type='org' when no terminalId is available.
 */
export async function saveRoutingToDb(
  cfg: PrintRoutingConfig,
  opts: { apiBase: string; authToken: string; clientId: string; orgId: string; terminalId?: string }
): Promise<void> {
  const { apiBase, authToken, clientId, orgId, terminalId } = opts;
  const scopeType = terminalId ? 'terminal' : 'org';
  const scopeId = terminalId || orgId;

  const body = {
    client_id: clientId,
    org_id: orgId,
    scope_type: scopeType,
    scope_id: scopeId,
    settings_json: JSON.stringify(cfg),
  };

  const resp = await fetch(`${apiBase}/print-configurations/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`saveRoutingToDb failed: ${resp.status} ${msg}`);
  }
}

/**
 * Load routing config from print_configurations, preferring terminal scope.
 * Falls back to org scope if no terminal-scoped row exists.
 */
export async function loadRoutingFromDb(
  opts: { apiBase: string; authToken: string; orgId: string; terminalId?: string }
): Promise<PrintRoutingConfig | null> {
  const { apiBase, authToken, orgId, terminalId } = opts;
  const params = new URLSearchParams({ org_id: orgId });
  if (terminalId) params.set('terminal_id', terminalId);

  const resp = await fetch(`${apiBase}/print-configurations/routing?${params}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const raw = data?.settings_json;
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...empty(), ...parsed };
  } catch {
    return null;
  }
}
