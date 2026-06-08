// utils/kotRouter.ts
// Splits an order's items into per-station groups and triggers one print job per station.
//
// Flow:
//   order.order_lines[].category_name  ─┐
//   order.order_lines[].product        ─┼─► groupItemsByStation() ─► one KOT text per station
//   PrintRoutingConfig.stations         ┘

import { getPrintRouting, PrintRoutingConfig, KitchenStation, PrinterTarget } from './printRouting';
import { printUniversal } from './printGateway';
import { buildKotText } from './printUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderLine = {
  id?: string;
  product_id?: string;
  product_name?: string;
  productName?: string;
  name?: string;
  category_id?: string;    // from order_lines join products
  category_name?: string;  // denormalised snapshot in order_lines
  quantity?: number | string;
  unit_price?: number | string;
  line_total?: number | string;
  variant_name?: string;
  [key: string]: unknown;
};

export type KotOrder = {
  id?: string;
  order_no?: string;
  table_number?: string;
  table_id?: string;
  created_at?: string;
  order_date?: string;
  special_instructions?: string;
  taken_by_name?: string;
  number_of_customers?: number;
  restaurant_name?: string;
  order_lines?: OrderLine[];
  lines?: OrderLine[];
  items?: OrderLine[];
  orderLines?: OrderLine[];
  order_items?: OrderLine[];
  removed_items?: OrderLine[];
  daily_bill_no?: number;
  [key: string]: unknown;
};

type StationBucket = {
  station: KitchenStation | null;
  printers: PrinterTarget[];
  items: OrderLine[];
};

// ---------------------------------------------------------------------------
// Core routing logic
// ---------------------------------------------------------------------------

function getLines(order: KotOrder): OrderLine[] {
  const keys = ['order_lines', 'lines', 'orderLines', 'order_items', 'items'] as const;
  for (const k of keys) {
    const v = order[k];
    if (Array.isArray(v) && v.length > 0) return v as OrderLine[];
  }
  return [];
}

function getCategoryIdForLine(line: OrderLine): string {
  return String(line.category_id || '').trim();
}

function getCategoryNameForLine(line: OrderLine): string {
  return String(
    line.category_name ||
    (line as any)?.product?.category_name ||
    (line as any)?.menu_items?.category_name ||
    ''
  ).trim().toLowerCase();
}

/**
 * Group order lines into per-station buckets.
 * Priority: 1. category_id UUID  2. category_name  3. fallback default
 */
export function groupItemsByStation(
  lines: OrderLine[],
  cfg: PrintRoutingConfig,
  categoryNameMap?: Record<string, string>
): StationBucket[] {
  const bucketMap = new Map<string, StationBucket>();
  const fallbackKey = '__default__';

  const nameToStation = new Map<string, KitchenStation>();
  if (categoryNameMap) {
    for (const station of cfg.stations) {
      for (const catId of station.categoryIds) {
        const label = categoryNameMap[catId];
        if (label) nameToStation.set(label.toLowerCase(), station);
      }
    }
  }

  for (const line of lines) {
    const catId = getCategoryIdForLine(line);
    const catName = getCategoryNameForLine(line);

    let matched: KitchenStation | null = null;
    if (catId) {
      matched = cfg.stations.find(s => s.categoryIds.includes(catId)) ?? null;
    }
    if (!matched && catName) {
      matched = nameToStation.get(catName) ?? null;
    }

    const key = matched ? matched.id : fallbackKey;
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        station: matched,
        printers: matched ? matched.printers : cfg.kotDefaultPrinters,
        items: [],
      });
    }
    bucketMap.get(key)!.items.push(line);
  }

  return Array.from(bucketMap.values()).filter(b => b.items.length > 0);
}

// ---------------------------------------------------------------------------
// Print one KOT per station
// ---------------------------------------------------------------------------

export type KotPrintResult = {
  stationId: string | null;
  stationName: string;
  itemCount: number;
  status: 'sent' | 'failed' | 'no-printer';
  error?: string;
};

export async function printKotByStation(
  order: KotOrder,
  restaurantProfile: Record<string, unknown>,
  opts?: {
    cfg?: PrintRoutingConfig;
    categoryNameMap?: Record<string, string>;
    jobId?: string;
    offlineOperationId?: string;
  }
): Promise<KotPrintResult[]> {
  const cfg = opts?.cfg ?? getPrintRouting();
  const lines = getLines(order);
  const results: KotPrintResult[] = [];

  // No routing configured → single KOT (original behaviour preserved)
  if (cfg.stations.length === 0 && cfg.kotDefaultPrinters.length === 0) {
    const text = buildKotText(order, restaurantProfile);
    try {
      await printUniversal({
        text,
        jobKind: 'kot',
        orderId: order.id ? String(order.id) : undefined,
        orderNo: order.order_no,
        offlineOperationId: opts?.offlineOperationId,
        jobId: opts?.jobId,
      });
      results.push({ stationId: null, stationName: 'Default', itemCount: lines.length, status: 'sent' });
    } catch (err: any) {
      results.push({ stationId: null, stationName: 'Default', itemCount: lines.length, status: 'failed', error: err?.message || String(err) });
    }
    return results;
  }

  const buckets = groupItemsByStation(lines, cfg, opts?.categoryNameMap);

  for (const bucket of buckets) {
    const stationId = bucket.station?.id ?? null;
    const stationName = bucket.station?.name ?? 'Default Kitchen';

    if (bucket.printers.length === 0) {
      results.push({ stationId, stationName, itemCount: bucket.items.length, status: 'no-printer' });
      continue;
    }

    const partialOrder: KotOrder = {
      ...order,
      order_lines: bucket.items,
      lines: bucket.items,
      restaurant_name: buckets.length > 1
        ? `${order.restaurant_name || ''} [${stationName}]`.trim()
        : order.restaurant_name,
    };

    const text = buildKotText(partialOrder, restaurantProfile);

    const winPrinterNames: string[] = [];
    const btAddresses: string[] = [];
    for (const p of bucket.printers) {
      if (p.type === 'winspool') winPrinterNames.push(p.printerName);
      if (p.type === 'android-bt') btAddresses.push(p.address);
    }

    try {
      await printUniversal({
        text,
        jobKind: 'kot',
        orderId: order.id ? String(order.id) : undefined,
        orderNo: order.order_no,
        offlineOperationId: opts?.offlineOperationId,
        jobId: opts?.jobId ? `${opts.jobId}-${stationId ?? 'default'}` : undefined,
        winPrinterNames: winPrinterNames.length ? winPrinterNames : undefined,
        btAddresses: btAddresses.length ? btAddresses : undefined,
        printTarget: stationId ?? 'default',
      });
      results.push({ stationId, stationName, itemCount: bucket.items.length, status: 'sent' });
    } catch (err: any) {
      results.push({ stationId, stationName, itemCount: bucket.items.length, status: 'failed', error: err?.message || String(err) });
    }
  }

  return results;
}
