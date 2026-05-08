import { Capacitor } from '@capacitor/core';
import { textToEscPos } from './escpos';

let printChain = Promise.resolve();

export function printUniversal(opts) {
  const job = printChain.then(async () => {
    const res = await printUniversalNow(opts);
    await new Promise(r => setTimeout(r, 80));
    return res;
  });

  printChain = job.then(() => undefined, () => undefined);
  return job;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map((s) => String(s).trim()).filter(Boolean)));
}

function readJsonArray(key) {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function printUniversalNow(opts) {
  const jobKind = opts.jobKind === 'kot' ? 'kot' : 'bill';

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

  // 1) Native Android BT
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const { DevicePrinter } = window.Capacitor?.Plugins || {};
    
    if (DevicePrinter) {
      await DevicePrinter.ensurePermissions();

      const addrArrKey = jobKind === 'kot' ? 'BT_PRINTER_ADDRS_KOT' : 'BT_PRINTER_ADDRS_BILL';
      const savedAddrs = uniq(readJsonArray(addrArrKey));
      const addrKey = jobKind === 'kot' ? 'BT_PRINTER_ADDR_KOT' : 'BT_PRINTER_ADDR';
      const addr1 = (window.localStorage.getItem(addrKey) || '').trim();
      
      const nameHintKey = jobKind === 'kot' ? 'BT_PRINTER_NAME_HINT_KOT' : 'BT_PRINTER_NAME_HINT';
      let nameHint = (window.localStorage.getItem(nameHintKey) || '').trim() || 'pos';

      const forced = uniq(opts.btAddresses || []);
      let targets = forced.length ? forced : (savedAddrs.length ? savedAddrs : (addr1 ? [addr1] : []));

      if (!targets.length) {
        try {
          const pick = await DevicePrinter.pickPrinter();
          const addr = pick?.address || '';
          if (addr) {
            const pair = await DevicePrinter.pairDevice({ address: addr });
            if (pair?.paired === false) {
              throw new Error('Bluetooth pairing did not complete');
            }
            window.localStorage.setItem(addrKey, addr);
            targets = [addr];
            if (pick?.name) window.localStorage.setItem(nameHintKey, pick.name);
          }
        } catch (e) {
          if (opts.allowPrompt) {
            throw new Error(e?.message || 'Printer selection cancelled');
          }
          nameHint = undefined;
          targets = [undefined];
        }
      }

      for (const address of targets) {
        await DevicePrinter.printRaw({ base64, address, nameContains: nameHint });
      }

      return { via: 'android-pos' };
    }
  }

  // 2) Windows PrintHub
  const hasWinHelper = !!window.localStorage.getItem('PRINT_WIN_URL');
  if (hasWinHelper || window.location.hostname === 'localhost') {
    try {
      const url = window.localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3500/print';
      const printerName = window.localStorage.getItem(jobKind === 'kot' ? 'PRINT_WIN_PRINTER_NAME_KOT' : 'PRINT_WIN_PRINTER_NAME') || '';
      
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);

      // Adapt to either raw or html endpoint based on the old app's usage pattern
      // Our backend PrintHub accepts raw text or HTML
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          printerName, 
          text: opts.text, // Our Windows Spooler supports direct text
          html: opts.htmlContent || undefined
        }),
        signal: ctrl.signal,
      });

      clearTimeout(t);

      if (resp.ok) {
        return { via: 'winspool' };
      }
    } catch (e) {
      console.warn('[print] winspool failed, falling back', e);
    }
  }

  // 3) Browser fallback
  if (!opts.allowSystemDialog) {
    throw new Error('NO_PRINTER_CONFIGURED');
  }

  const w = window.open('', '_blank', 'width=480,height=640');
  if (w) {
    w.document.write(
      opts.htmlContent || `<pre style="font:14px/1.4 monospace; white-space:pre-wrap">${opts.text.replace(/</g, '&lt;')}</pre>`
    );
    w.document.close();
    w.focus();

    await new Promise((resolve) => {
      setTimeout(() => {
        try {
          if (w && !w.closed) {
            w.print();
            w.close();
          }
        } catch (err) {
          console.warn('[print] Failed to print window:', err);
        }
        resolve();
      }, 250);
    });

    return { via: 'system' };
  }

  throw new Error('NO_SILENT_PATH');
}
