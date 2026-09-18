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
  printMasterKot?: boolean;            // whether to print a consolidated KOT
  masterKotPrinters?: PrinterTarget[]; // printers for the consolidated master KOT
};

const LS_KEY = 'PRINT_ROUTING_V1';

// ---------- local storage ----------

function readJsonArray(key: string): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function getPrintRouting(): PrintRoutingConfig {
  try {
    if (typeof window === 'undefined') return empty();
    
    // 1. Try reading PRINT_ROUTING_V1 first
    const rawRouting = localStorage.getItem(LS_KEY);
    if (rawRouting) {
      const parsed = JSON.parse(rawRouting);
      if (parsed && (parsed.stations?.length > 0 || parsed.billPrinters?.length > 0)) {
        return { ...empty(), ...parsed };
      }
    }

    // 2. Fall back to converting PRINT_KOT_ROUTES_V1 & legacy localStorage settings
    const rawLegacyRoutes = localStorage.getItem('PRINT_KOT_ROUTES_V1');
    const legacyRoutes = rawLegacyRoutes ? JSON.parse(rawLegacyRoutes) : [];
    const routingEnabled = localStorage.getItem('PRINT_KOT_CATEGORY_ROUTING') === '1' ||
      ((Array.isArray(legacyRoutes) ? legacyRoutes : []).some((r: any) => r && (r.enabled !== false || r.categories?.length > 0) && Array.isArray(r.categories) && r.categories.length > 0));

    const rawProfiles = localStorage.getItem('PRINT_PROFILES');
    const profiles: any[] = rawProfiles ? JSON.parse(rawProfiles) : [];
    const profileMap = new Map<string, any>(profiles.map(p => [p.id, p]));

    const rawDefaults = localStorage.getItem('PRINT_DEFAULTS');
    const defaults: any = rawDefaults ? JSON.parse(rawDefaults) : {};

    const defaultKotPrinters: PrinterTarget[] = [];
    readJsonArray('PRINT_WIN_PRINTER_NAMES_KOT').forEach(name => {
      defaultKotPrinters.push({ type: 'winspool' as const, printerName: name });
    });
    readJsonArray('BT_PRINTER_ADDRS_KOT').forEach(addr => {
      defaultKotPrinters.push({ type: 'android-bt' as const, address: addr });
    });
    const singleBtKot = (localStorage.getItem('BT_PRINTER_ADDR_KOT') || '').trim();
    if (singleBtKot && !defaultKotPrinters.some(p => p.type === 'android-bt' && p.address === singleBtKot)) {
      defaultKotPrinters.push({ type: 'android-bt' as const, address: singleBtKot });
    }
    (Array.isArray(defaults.kotProfileIds) ? defaults.kotProfileIds : []).forEach((id: string) => {
      const prof = profileMap.get(id);
      if (prof && (prof.connectionType === 'BLUETOOTH' || prof.connectionType === 'BLUETOOTH_COM') && (prof.btAddress || prof.macAddress)) {
        const addr = prof.btAddress || prof.macAddress;
        if (!defaultKotPrinters.some(p => p.type === 'android-bt' && p.address === addr)) {
          defaultKotPrinters.push({ type: 'android-bt' as const, address: addr, nameHint: prof.name });
        }
      }
    });

    const billPrinters: PrinterTarget[] = [];
    readJsonArray('PRINT_WIN_PRINTER_NAMES_BILL').forEach(name => {
      billPrinters.push({ type: 'winspool' as const, printerName: name });
    });
    readJsonArray('BT_PRINTER_ADDRS_BILL').forEach(addr => {
      billPrinters.push({ type: 'android-bt' as const, address: addr });
    });
    const singleBtBill = (localStorage.getItem('BT_PRINTER_ADDR') || '').trim();
    if (singleBtBill && !billPrinters.some(p => p.type === 'android-bt' && p.address === singleBtBill)) {
      billPrinters.push({ type: 'android-bt' as const, address: singleBtBill });
    }
    (Array.isArray(defaults.billProfileIds) ? defaults.billProfileIds : []).forEach((id: string) => {
      const prof = profileMap.get(id);
      if (prof && (prof.connectionType === 'BLUETOOTH' || prof.connectionType === 'BLUETOOTH_COM') && (prof.btAddress || prof.macAddress)) {
        const addr = prof.btAddress || prof.macAddress;
        if (!billPrinters.some(p => p.type === 'android-bt' && p.address === addr)) {
          billPrinters.push({ type: 'android-bt' as const, address: addr, nameHint: prof.name });
        }
      }
    });

    const masterKotEnabled = localStorage.getItem('PRINT_MASTER_KOT_ENABLED') === '1' || defaults.printMasterKot === true;
    const masterKotPrinters: PrinterTarget[] = [];
    readJsonArray('PRINT_MASTER_KOT_PRINTERS').forEach(name => {
      masterKotPrinters.push({ type: 'winspool' as const, printerName: name });
    });
    readJsonArray('PRINT_MASTER_KOT_BT_ADDRESSES').forEach(addr => {
      masterKotPrinters.push({ type: 'android-bt' as const, address: addr });
    });
    const masterProfileIds: string[] = Array.isArray(defaults.masterKotProfileIds) ? defaults.masterKotProfileIds : readJsonArray('PRINT_MASTER_KOT_PROFILE_IDS');
    masterProfileIds.forEach((id: string) => {
      const prof = profileMap.get(id);
      if (prof) {
        if ((prof.connectionType === 'BLUETOOTH' || prof.connectionType === 'BLUETOOTH_COM') && (prof.btAddress || prof.macAddress)) {
          const addr = prof.btAddress || prof.macAddress;
          if (!masterKotPrinters.some(p => p.type === 'android-bt' && p.address === addr)) {
            masterKotPrinters.push({ type: 'android-bt' as const, address: addr, nameHint: prof.name });
          }
        } else if (prof.connectionType === 'WINDOWS_QUEUE' && prof.windowsPrinterName) {
          if (!masterKotPrinters.some(p => p.type === 'winspool' && p.printerName === prof.windowsPrinterName)) {
            masterKotPrinters.push({ type: 'winspool' as const, printerName: prof.windowsPrinterName });
          }
        }
      }
    });

    const stations: KitchenStation[] = (Array.isArray(legacyRoutes) ? legacyRoutes : [])
      .filter((r: any) => r && (r.enabled !== false || (r.printerNames?.length > 0 || r.profileIds?.length > 0)) && Array.isArray(r.categories) && r.categories.length > 0)
      .map((r: any) => {
        const printerTargets: PrinterTarget[] = [];

        (Array.isArray(r.printerNames) ? r.printerNames : [])
          .filter(Boolean)
          .forEach((name: string) => {
            printerTargets.push({ type: 'winspool' as const, printerName: name });
          });

        (Array.isArray(r.btAddresses) ? r.btAddresses : [])
          .filter(Boolean)
          .forEach((addr: string) => {
            if (!printerTargets.some(p => p.type === 'android-bt' && p.address === addr)) {
              printerTargets.push({ type: 'android-bt' as const, address: addr });
            }
          });

        (Array.isArray(r.profileIds) ? r.profileIds : [])
          .filter(Boolean)
          .forEach((id: string) => {
            const prof = profileMap.get(id);
            if (prof) {
              if ((prof.connectionType === 'BLUETOOTH' || prof.connectionType === 'BLUETOOTH_COM') && (prof.btAddress || prof.macAddress)) {
                const addr = prof.btAddress || prof.macAddress;
                if (!printerTargets.some(p => p.type === 'android-bt' && p.address === addr)) {
                  printerTargets.push({ type: 'android-bt' as const, address: addr, nameHint: prof.name });
                }
              } else if (prof.connectionType === 'WINDOWS_QUEUE' && prof.windowsPrinterName) {
                if (!printerTargets.some(p => p.type === 'winspool' && p.printerName === prof.windowsPrinterName)) {
                  printerTargets.push({ type: 'winspool' as const, printerName: prof.windowsPrinterName });
                }
              }
            }
          });

        return {
          id: r.id || String(Math.random()),
          name: r.label || r.name || 'Kitchen Station',
          categoryIds: r.categories || [],
          printers: printerTargets,
        };
      });

    return {
      billPrinters,
      kotDefaultPrinters: defaultKotPrinters,
      stations: routingEnabled ? stations : [],
      printMasterKot: masterKotEnabled,
      masterKotPrinters: masterKotEnabled ? masterKotPrinters : [],
    };
  } catch {
    return empty();
  }
}

export function savePrintRouting(cfg: PrintRoutingConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

function empty(): PrintRoutingConfig {
  return { billPrinters: [], kotDefaultPrinters: [], stations: [], printMasterKot: false, masterKotPrinters: [] };
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
