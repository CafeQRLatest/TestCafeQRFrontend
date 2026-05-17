// utils/printRouting.ts
export type PrinterTarget =
  | { type: 'winspool'; printerName: string }
  | { type: 'android-bt'; address: string; nameHint?: string }
  | { type: 'webusb'; vendorId: number; productId: number; serialNumber?: string | null }
  | { type: 'webserial'; portIndex: number }; // limited, see note below

export type KitchenStation = {
  id: string;                 // e.g. 'juice'
  name: string;               // e.g. 'Juice / Chai'
  categoryIds: string[];      // your menu category IDs
  printers: PrinterTarget[];  // 1 or many printers
};

export type PrintRoutingConfig = {
  billPrinters: PrinterTarget[];       // 1 or many
  kotDefaultPrinters: PrinterTarget[]; // 1 or many
  stations: KitchenStation[];
};

const KEY = 'PRINT_ROUTING_V1';

export function getPrintRouting(): PrintRoutingConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { billPrinters: [], kotDefaultPrinters: [], stations: [] };
}

export function savePrintRouting(cfg: PrintRoutingConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}
