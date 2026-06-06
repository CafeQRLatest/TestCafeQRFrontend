// utils/printGateway.ts
import { Capacitor } from '@capacitor/core';
import { textToEscPos } from './escpos';
import { markPrintJobFailed, markPrintJobSent, queuePrintJob } from './offlineStore';
import { isNativePrintServicePaired, submitNativePrintJob } from './printServiceClient';

type Options = {
  text: string;
  vendorId?: number;
  productId?: number;
  relayUrl?: string;
  ip?: string;
  port?: number;
  codepage?: number;
  allowPrompt?: boolean;
  allowSystemDialog?: boolean;
  scale?: 'normal' | 'large';
  jobKind?: 'bill' | 'kot';
  winPrinterNames?: string[];
  btAddresses?: string[];
  jobId?: string;
  orderId?: string | number;
  offlineOperationId?: string;
  orderNo?: string;
  printTarget?: string;
  outputFormat?: 'THERMAL' | 'REGULAR' | 'BOTH';
  printerProfileId?: string;
  routeId?: string;
  document?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function readJsonArray(key: string): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function uniq(arr: string[]) {
  return Array.from(new Set((arr || []).map((s) => String(s).trim()).filter(Boolean)));
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function hashText(value: string) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function createPrintJobRecord(opts: Options) {
  const orderRef = opts.offlineOperationId || opts.orderId || opts.orderNo;
  if (!opts.jobId && !orderRef) return null;

  const kind = opts.jobKind === 'kot' ? 'kot' : 'bill';
  const targetKey = opts.printTarget || uniq(opts.winPrinterNames || []).join(',') || opts.ip || 'default';
  const id = opts.jobId || `print:${kind}:${String(orderRef)}:${targetKey}:${hashText(opts.text)}`;

  return {
    id,
    kind,
    orderId: opts.orderId ? String(opts.orderId) : null,
    offlineOperationId: opts.offlineOperationId || null,
    orderNo: opts.orderNo || null,
    target: targetKey,
    winPrinterNames: uniq(opts.winPrinterNames || []),
    relayUrl: opts.relayUrl || null,
    ip: opts.ip || null,
    port: opts.port || null,
    textHash: hashText(opts.text),
    text: opts.text,
  };
}

/**
 * Global print queue:
 * - guarantees Route-1 KOT finishes before Route-2 begins
 * - prevents WebUSB/WebSerial races
 */
let printChain: Promise<void> = Promise.resolve();

/** Public API: queued printing (never drops a job). */
export function printUniversal(opts: Options) {
  const job = printChain.then(async () => {
    const printJob = createPrintJobRecord(opts);

    if (printJob) {
      await queuePrintJob(printJob).catch((error: any) => {
        console.warn('[print] Unable to queue print job:', error?.message || error);
      });
    }

    try {
      const res = await printUniversalNow(opts);

      if (printJob) {
        await markPrintJobSent(printJob.id, res).catch((error: any) => {
          console.warn('[print] Unable to mark print job sent:', error?.message || error);
        });
      }

      // small gap helps some printers/helpers flush before next job
      await sleep(80);

      return res;
    } catch (error: any) {
      if (printJob) {
        await markPrintJobFailed(printJob.id, error?.message || 'Printing failed').catch((storeError: any) => {
          console.warn('[print] Unable to mark print job failed:', storeError?.message || storeError);
        });
      }

      throw error;
    }

  });

  // keep the chain alive even if a job fails
  printChain = job.then(
    () => undefined,
    () => undefined
  );

  return job;
}


async function printUniversalNow(opts: Options) {
  const jobKind: 'bill' | 'kot' = opts.jobKind === 'kot' ? 'kot' : 'bill';

  // NOTE: This module can be imported in Next.js server build,
  // but printUniversal should only be called in the browser.
  if (typeof window === 'undefined') {
    throw new Error('PRINT_CALLED_ON_SERVER');
  }

  const paperMm = Number(window.localStorage.getItem('PRINT_PAPER_MM') || 0);
  const autoScale = paperMm >= 76 ? 'large' : 'normal';

  const payload = textToEscPos(opts.text, {
    codepage: opts.codepage,
    feed: 1,
    cut: 'full',
    scale: opts.scale || autoScale,
  });

  const base64 = btoa(String.fromCharCode(...payload));

  // --- Windows helper config (PRINT_WIN_*) ---
  const winCfg = (kind: 'bill' | 'kot') => {
    const url = window.localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw';

    // V2 arrays
    const billNames = readJsonArray('PRINT_WIN_PRINTER_NAMES_BILL');
    const kotNames = readJsonArray('PRINT_WIN_PRINTER_NAMES_KOT');

    // V1 single fallback
    const bill1 = window.localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '';
    const kot1 = window.localStorage.getItem('PRINT_WIN_PRINTER_NAME_KOT') || '';

    const fallback =
      kind === 'kot'
        ? (kot1 ? [kot1] : bill1 ? [bill1] : [])
        : (bill1 ? [bill1] : kot1 ? [kot1] : []);

    const names = uniq(
      (kind === 'kot' ? kotNames : billNames).length
        ? (kind === 'kot' ? kotNames : billNames)
        : fallback
    );

    return { url, names };
  };

  const forcedWinPrinterNames = uniq(opts.winPrinterNames || []);
  const hasWinHelperConfig =
    !!window.localStorage.getItem('PRINT_WIN_URL') ||
    readJsonArray('PRINT_WIN_PRINTER_NAMES_BILL').length > 0 ||
    readJsonArray('PRINT_WIN_PRINTER_NAMES_KOT').length > 0 ||
    !!window.localStorage.getItem('PRINT_WIN_PRINTER_NAME') ||
    !!window.localStorage.getItem('PRINT_WIN_PRINTER_NAME_KOT') ||
    forcedWinPrinterNames.length > 0;

  const mode = window.localStorage.getItem('PRINTER_MODE') || '';

  // ── Auto-discovery: probe the local Print Hub when no mode is configured ──
  // This allows silent printing to work out of the box on Windows without
  // manual setup, matching the production Cafe-QR behavior.
  async function autoDiscoverWinHub(): Promise<string | null> {
    const hubListUrl = window.localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const resp = await fetch(hubListUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (!resp.ok) return null;
      const printers: string[] = await resp.json();
      if (!Array.isArray(printers) || printers.length === 0) return null;

      // Find a POS/thermal printer (common names)
      const thermalHints = ['pos', 'thermal', 'receipt', 'xp-', 'rongta', 'epson', 'star', 'bixolon', 'citizen', 'custom'];
      const thermalPrinter = printers.find((p) => thermalHints.some((h) => p.toLowerCase().includes(h)));
      const chosen = thermalPrinter || printers[0];

      // Auto-configure so subsequent prints don't need re-discovery
      window.localStorage.setItem('PRINT_WIN_URL', 'http://127.0.0.1:3333/printRaw');
      window.localStorage.setItem('PRINT_WIN_PRINTER_NAME', chosen);
      window.localStorage.setItem('PRINTER_MODE', 'winspool');
      window.localStorage.setItem('PRINTER_READY', '1');
      console.log('[print] Auto-discovered Windows printer:', chosen);
      return chosen;
    } catch {
      return null;
    }
  }

  async function printWinspool(localOpts: Options) {
    const kind: 'bill' | 'kot' = localOpts.jobKind === 'kot' ? 'kot' : 'bill';
    const { url, names } = winCfg(kind);

    const forced = uniq(localOpts.winPrinterNames || []);
    const targets = forced.length ? forced : names;
    if (!targets.length) throw new Error('NO_WIN_PRINTER');

    const autoCut =
      typeof window !== 'undefined' &&
      window.localStorage.getItem('PRINT_WIN_AUTOCUT') === '1';

    let txt = '';
    txt += '\x1b@'; // reset
    txt += localOpts.scale === 'large' ? '\x1d!\x01' : '\x1d!\x00';

    txt += (localOpts.text || '').replace(/\r?\n/g, '\r\n') + '\r\n\r\n\r\n';
    if (autoCut) txt += '\x1dV\x00';

    let bin = '';
    for (let i = 0; i < txt.length; i++) bin += String.fromCharCode(txt.charCodeAt(i) & 0xff);
    const base64Plain = btoa(bin);

    for (const printerName of targets) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      let resp: Response;

      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printerName, dataBase64: base64Plain }),
          signal: ctrl.signal,
        });
      } catch (error: any) {
        throw new Error(`PRINT_HUB_UNREACHABLE ${printerName} ${error?.message || ''}`.trim());
      } finally {
        clearTimeout(t);
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`PRINT_HUB_FAILED ${printerName} ${text}`.trim());
      }
    }

    return { via: 'winspool' as const };
  }

  try {
    // 1) Native Android → DevicePrinter (USB / BT)
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      // @ts-ignore
      const { DevicePrinter } = (window as any).Capacitor.Plugins;
      await DevicePrinter.ensurePermissions();

      const job: 'bill' | 'kot' = jobKind;

      // V2 arrays
      const addrArrKey = job === 'kot' ? 'BT_PRINTER_ADDRS_KOT' : 'BT_PRINTER_ADDRS_BILL';
      const savedAddrs = uniq(readJsonArray(addrArrKey));

      // V1 single fallback
      const addrKey = job === 'kot' ? 'BT_PRINTER_ADDR_KOT' : 'BT_PRINTER_ADDR';
      const addr1 = (window.localStorage.getItem(addrKey) || '').trim();

      const nameHintKey = job === 'kot' ? 'BT_PRINTER_NAME_HINT_KOT' : 'BT_PRINTER_NAME_HINT';
      let nameHint: string | undefined = (window.localStorage.getItem(nameHintKey) || '').trim() || 'pos';

      const forced = uniq(opts.btAddresses || []);
      let targets = forced.length ? forced : (savedAddrs.length ? savedAddrs : (addr1 ? [addr1] : []));

      if (!targets.length) {
        try {
          const pick = await DevicePrinter.pickPrinter();
          const addr = pick?.address || '';
          if (addr) {
            try { await DevicePrinter.pairDevice({ address: addr }); } catch { }
            window.localStorage.setItem(addrKey, addr);
            targets = [addr];
            if (pick?.name) window.localStorage.setItem(nameHintKey, pick.name);
          }
        } catch {
          nameHint = undefined;
          targets = [undefined as any]; // one attempt: plugin may fallback to USB/internal
        }
      }

      for (const address of targets) {
        await DevicePrinter.printRaw({ base64, address, nameContains: nameHint });
      }

      return { via: 'android-pos' as const };
    }

    // 1b) Paired CafeQR Windows Service. It persists the job before returning,
    // so browser closure or a Windows restart cannot lose an acknowledged job.
    if (isNativePrintServicePaired()) {
      const result = await submitNativePrintJob({
        idempotencyKey: opts.jobId || (
          opts.offlineOperationId || opts.orderId || opts.orderNo
            ? `local:${jobKind}:${opts.offlineOperationId || opts.orderId || opts.orderNo}:${hashText(opts.text)}`
            : `local:${jobKind}:${Date.now()}:${hashText(opts.text)}`
        ),
        jobKind,
        outputFormat: opts.outputFormat,
        printerProfileId: opts.printerProfileId,
        routeId: opts.routeId,
        text: opts.text,
        document: opts.document,
        metadata: {
          ...(opts.metadata || {}),
          orderId: opts.orderId,
          orderNo: opts.orderNo,
          offlineOperationId: opts.offlineOperationId,
        },
      });
      return { via: 'cafeqr-print-service' as const, jobs: result };
    }

    const n: any = navigator as any;

    // 1c) Legacy Windows helper mode
    const wantsWinspool = mode === 'winspool' || (!mode && hasWinHelperConfig) || forcedWinPrinterNames.length > 0;
    if (wantsWinspool) {
      return await printWinspool(opts);
    }

    // 2) WebUSB
    if (n.usb) {
      try {
        const list: USBDevice[] = await n.usb.getDevices();
        if (list && list.length) {
          const device = list[0];
          await device.open();
          if (device.configuration == null) await device.selectConfiguration(1);

          const iface = device.configuration!.interfaces.find((i: any) =>
            i.alternates.some((a: any) => a.endpoints.some((e: any) => e.direction === 'out'))
          );
          if (!iface) throw new Error('No USB OUT endpoint');

          await device.claimInterface(iface.interfaceNumber);
          const outEp = iface.alternates[0].endpoints.find((e: any) => e.direction === 'out')!;
          await device.transferOut(outEp.endpointNumber, payload);
          await device.close();

          return { via: 'webusb' as const };
        }
      } catch {
        // fall through
      }

      if (opts.allowPrompt) {
        try {
          const filters =
            opts.vendorId && opts.productId
              ? [{ vendorId: opts.vendorId, productId: opts.productId }]
              : [{}];

          // @ts-ignore
          const device: USBDevice = await n.usb.requestDevice({ filters });
          await device.open();
          if (device.configuration == null) await device.selectConfiguration(1);

          const iface = device.configuration!.interfaces.find((i: any) =>
            i.alternates.some((a: any) => a.endpoints.some((e: any) => e.direction === 'out'))
          );
          if (!iface) throw new Error('No USB OUT endpoint');

          await device.claimInterface(iface.interfaceNumber);
          const alt = iface.alternates[0];
          const outEp = alt.endpoints.find((e: any) => e.direction === 'out')!;
          await device.transferOut(outEp.endpointNumber, payload);
          await device.close();

          return { via: 'webusb' as const };
        } catch {
          // continue
        }
      }
    }

    // 3) Web Serial
    if (n.serial) {
      try {
        const ports: SerialPort[] = await n.serial.getPorts();
        if (ports && ports.length) {
          const port = ports[0];
          await port.open({ baudRate: 9600 });
          const w = port.writable!.getWriter();
          await w.write(payload);
          w.releaseLock();
          await port.close();

          return { via: 'webserial' as const };
        }
      } catch {
        // fall through
      }

      if (opts.allowPrompt) {
        try {
          // @ts-ignore
          const port: SerialPort = await n.serial.requestPort({});
          await port.open({ baudRate: 9600 });
          const writer = port.writable!.getWriter();
          await writer.write(payload);
          writer.releaseLock();
          await port.close();

          return { via: 'webserial' as const };
        } catch {
          // continue
        }
      }
    }

    // 4) Relay TCP 9100
    if (opts.relayUrl && opts.ip) {
      await fetch(opts.relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: opts.ip,
          port: opts.port ?? 9100,
          dataBase64: base64,
        }),
      });
      return { via: 'relay' as const };
    }

    // 4b) Auto-discover Windows Print Hub (if no explicit mode was set)
    //     This probes localhost:3333 to see if print-hub.ps1 is running.
    //     If found, it auto-configures winspool and prints silently.
    if (!mode && !hasWinHelperConfig) {
      const discovered = await autoDiscoverWinHub();
      if (discovered) {
        return await printWinspool({
          ...opts,
          winPrinterNames: [discovered],
        });
      }
    }

    if (!opts.allowSystemDialog) {
      throw new Error('NO_PRINTER_CONFIGURED');
    }

    // 5) Browser fallbacks (Hidden Iframe for reliability)
    // NOTE: This is the LAST resort and shows a browser print dialog.
    // For silent printing, ensure the Windows Print Hub is running
    // (print-hub-win/print-hub.ps1) or pair a USB printer via WebUSB.
    console.warn('[print] No silent print path available. Falling back to browser print dialog. Start the Print Hub (print-hub-win/print-hub.ps1) for silent printing.');
    const frameId = 'print-iframe-' + Date.now();
    let iframe = document.getElementById(frameId);
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = frameId;
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
    }

    const doc = iframe && (iframe.contentWindow ? iframe.contentWindow.document : iframe.contentDocument);
    if (doc) {
      doc.open();
      doc.write(`
        <html>
          <body style="margin:0; padding:10px; font-family:monospace; white-space:pre-wrap; font-size:14px;">
            ${opts.text.replace(/</g, '&lt;')}
          </body>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.parent.document.body.removeChild(window.frameElement); }, 1000);
            };
          </script>
        </html>
      `);
      doc.close();
      return { via: 'system' as const };
    }

    if (navigator.canShare && navigator.canShare({ text: opts.text })) {
      await navigator.share({ title: 'Receipt', text: opts.text });
      return { via: 'share' as const };
    }

    throw new Error('NO_SILENT_PATH');
  } catch (e) {
    throw e;
  }
}


