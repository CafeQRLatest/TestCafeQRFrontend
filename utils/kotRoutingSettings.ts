// utils/kotRoutingSettings.ts
import {
  getPrintRouting,
  savePrintRouting,
  saveRoutingToDb,
  loadRoutingFromDb,
  PrintRoutingConfig,
  KitchenStation,
  PrinterTarget,
} from './printRouting';

export type CategoryRow = {
  id: string;
  name: string;
  is_active?: boolean;
};

export async function fetchCategories(
  apiBase: string,
  authToken: string,
  orgId: string
): Promise<CategoryRow[]> {
  const resp = await fetch(`${apiBase}/categories?org_id=${orgId}&is_active=true`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!resp.ok) throw new Error(`fetchCategories: ${resp.status}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : (data?.data ?? []);
}

export function addStation(
  cfg: PrintRoutingConfig,
  station: Omit<KitchenStation, 'id'> & { id?: string }
): PrintRoutingConfig {
  const id = station.id || `station_${Date.now()}`;
  return { ...cfg, stations: [...cfg.stations, { ...station, id }] };
}

export function updateStation(
  cfg: PrintRoutingConfig,
  stationId: string,
  patch: Partial<KitchenStation>
): PrintRoutingConfig {
  return {
    ...cfg,
    stations: cfg.stations.map(s => s.id === stationId ? { ...s, ...patch } : s),
  };
}

export function removeStation(
  cfg: PrintRoutingConfig,
  stationId: string
): PrintRoutingConfig {
  return { ...cfg, stations: cfg.stations.filter(s => s.id !== stationId) };
}

export function setBillPrinters(cfg: PrintRoutingConfig, printers: PrinterTarget[]): PrintRoutingConfig {
  return { ...cfg, billPrinters: printers };
}

export function setDefaultKotPrinters(cfg: PrintRoutingConfig, printers: PrinterTarget[]): PrintRoutingConfig {
  return { ...cfg, kotDefaultPrinters: printers };
}

export type DbSyncOpts = {
  apiBase: string;
  authToken: string;
  clientId: string;
  orgId: string;
  terminalId?: string;
};

export async function loadConfig(opts: DbSyncOpts): Promise<PrintRoutingConfig> {
  try {
    const dbCfg = await loadRoutingFromDb(opts);
    if (dbCfg) {
      savePrintRouting(dbCfg);
      return dbCfg;
    }
  } catch (err) {
    console.warn('[kotRoutingSettings] loadRoutingFromDb failed, using localStorage:', err);
  }
  return getPrintRouting();
}

export async function saveConfig(cfg: PrintRoutingConfig, opts: DbSyncOpts): Promise<void> {
  savePrintRouting(cfg);
  try {
    await saveRoutingToDb(cfg, opts);
  } catch (err) {
    console.warn('[kotRoutingSettings] saveRoutingToDb failed (local save succeeded):', err);
  }
}

export function buildCategoryNameMap(categories: CategoryRow[]): Record<string, string> {
  return Object.fromEntries(categories.map(c => [c.id, c.name]));
}
