// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, buildKotText, downloadTextAndShare, toDisplayItems } from '../utils/printUtils';
import { bitmapToPngBase64, logoUrlToBitmapGrid } from '../utils/logoBitmap';
import api from '../utils/api';
import { printUniversal } from '../utils/printGateway';
import { Capacitor } from '@capacitor/core';
import Cookies from 'js-cookie';
import { isNativePrintServicePaired } from '../utils/printServiceClient';
import { printKotByStation } from '../utils/kotRouter';
import { ensurePrintTemplatesSynced } from '../utils/printTemplateSync';

const PRINT_DEDUP_KEY = 'KOTPRINT_PRINTED_V1';
const PRINT_DEDUP_TTL_MS = 120_000; // 2 minutes

const uniq = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean)));

function readJson(key, fallback) {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getRouteNetworkTargets(route) {
  const relayUrl =
    typeof window === 'undefined' ? '' : (localStorage.getItem('PRINT_RELAY_URL') || '').trim();

  const list = readJson('PRINT_NET_PRINTERS_V1', []);
  const map = new Map((Array.isArray(list) ? list : []).map((p) => [p?.id, p]));
  const ids = uniq(route?.netPrinterIds || []);
  const targets = ids
    .map((id) => map.get(id))
    .filter((p) => p && p.ip)
    .map((p) => ({ ip: String(p.ip).trim(), port: Number(p.port || 9100) || 9100 }));

  return { relayUrl, targets };
}

function kotRoutesEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('PRINT_KOT_CATEGORY_ROUTING') === '1';
  } catch {
    return false;
  }
}

function getItemCategoryName(oi) {
  const category = oi?.categoryName || oi?.category_name || oi?.category || oi?.menu_items?.category || oi?.product?.category;
  if (!category) return '';
  if (typeof category === 'string') return category.trim();
  return String(category.name || category.categoryName || '').trim();
}

function toLegacyItemsFromOrderItems(orderItems) {
  return (Array.isArray(orderItems) ? orderItems : []).map((oi) => ({
    name: oi?.productName || oi?.product_name || oi?.name || oi?.item_name || oi?.itemName || 'Item',
    quantity: Number(oi?.quantity ?? oi?.qty ?? 1),
    price: Number(oi?.unitPrice ?? oi?.price ?? oi?.rate ?? 0),
    category: String(oi?.categoryName || oi?.category || '').trim(),
    variantname: oi?.variantName || oi?.variant_name || null,
  }));
}

const ORDER_ITEM_KEYS = ['lines', 'orderLines', 'lineItems', 'order_items', 'orderItems', 'items'];

function rawItemsFromOrder(value) {
  const source = ORDER_ITEM_KEYS
    .map(key => value?.[key])
    .find(items => Array.isArray(items) && items.length > 0);
  return source || [];
}

function mergeOrderForPrint(primary, fallback) {
  const merged = { ...(fallback || {}), ...(primary || {}) };

  // Preserve removed_items / isEdited from whichever source carries them.
  // The cloud print job payload has them; a fresh API fetch does NOT.
  const removedItems =
    (Array.isArray(primary?.removed_items) && primary.removed_items.length ? primary.removed_items : null) ||
    (Array.isArray(fallback?.removed_items) && fallback.removed_items.length ? fallback.removed_items : null) ||
    (Array.isArray(primary?.removedItems) && primary.removedItems.length ? primary.removedItems : null) ||
    (Array.isArray(fallback?.removedItems) && fallback.removedItems.length ? fallback.removedItems : null) ||
    [];
  const isEdited =
    primary?.is_edited ?? primary?.isEdited ?? fallback?.is_edited ?? fallback?.isEdited ?? false;

  const mergedItems = toDisplayItems(merged);
  const fallbackItems = toDisplayItems(fallback);

  if (mergedItems.length || !fallbackItems.length) {
    if (isEdited && fallbackItems.length) {
      const fallbackRawItems = rawItemsFromOrder(fallback);
      return {
        ...merged,
        lines: fallbackRawItems.length ? fallbackRawItems : fallbackItems,
        items: Array.isArray(fallback?.items) && fallback.items.length ? fallback.items : fallbackItems,
        order_items: Array.isArray(fallback?.order_items) && fallback.order_items.length ? fallback.order_items : fallbackRawItems,
        removed_items: removedItems,
        removedItems: removedItems,
        is_edited: isEdited,
        isEdited,
      };
    }
    return { ...merged, removed_items: removedItems, removedItems: removedItems, is_edited: isEdited, isEdited };
  }

  const fallbackRawItems = rawItemsFromOrder(fallback);
  return {
    ...merged,
    lines: fallbackRawItems.length ? fallbackRawItems : fallbackItems,
    items: Array.isArray(fallback?.items) && fallback.items.length ? fallback.items : fallbackItems,
    order_items: Array.isArray(fallback?.order_items) && fallback.order_items.length
      ? fallback.order_items
      : merged.order_items,
    removed_items: removedItems,
    removedItems: removedItems,
    is_edited: isEdited,
    isEdited,
  };
}

function hasPrintedRecently(orderId, kind = 'bill') {
  if (!orderId) return false;
  try {
    if (typeof window === 'undefined') return false;
    const raw = localStorage.getItem(PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const now = Date.now();
    const key = `${orderId}:${kind}`;

    let dirty = false;
    for (const [k, ts] of Object.entries(map)) {
      if (now - ts > PRINT_DEDUP_TTL_MS) {
        delete map[k];
        dirty = true;
      }
    }
    if (dirty) localStorage.setItem(PRINT_DEDUP_KEY, JSON.stringify(map));

    return Boolean(map[key]);
  } catch {
    return false;
  }
}

function markPrinted(orderId, kind = 'bill') {
  if (!orderId) return;
  try {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const key = `${orderId}:${kind}`;
    map[key] = Date.now();
    localStorage.setItem(PRINT_DEDUP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function getOrderTypeLabelLocal(order) {
  if (!order) return '';
  if (order.tableNumber && order.tableNumber !== null) {
    return `Dine in (Table ${order.tableNumber})`;
  }
  const type = String(order.fulfillmentType || '').toUpperCase();
  if (type === 'PARCEL' || type === 'TAKEAWAY') return 'Takeaway';
  if (type === 'DELIVERY') return 'Delivery';
  if (type === 'DINE_IN') return 'Dine in';
  return '';
}

function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function isAndroidPWA() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isNativeAndroid()) return false;

  const uaAndroid = /Android/i.test(navigator.userAgent || '');
  const inStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

  return uaAndroid && inStandalone;
}

function isDesktopPWA() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return standalone && !/Android/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

// Check if we need offline flags
function isOfflinePrintOrder(order) {
  return Boolean(order?.offline || order?.offlineOperationId || order?.syncStatus === 'QUEUED');
}

function getPrintJobMeta(order, kind = 'bill', target = 'default') {
  const offline = isOfflinePrintOrder(order);
  const orderId = !offline && order?.id ? String(order.id) : undefined;
  const offlineOperationId = order?.offlineOperationId || (offline && order?.id ? String(order.id) : undefined);
  const orderNo = order?.orderNo || order?.order_no;
  const ref = String(offlineOperationId || orderId || orderNo || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(-48);
  const baseTargetKey = String(target || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const manualSuffix = order?._manualPrint ? `manual-${Date.now()}` : '';
  const targetKey = String(manualSuffix ? `${baseTargetKey}-${manualSuffix}` : baseTargetKey).slice(0, 48);

  return {
    jobId: `print:${kind}:${targetKey}:${ref}`,
    orderId,
    offlineOperationId,
    orderNo,
    printTarget: targetKey,
  };
}

function fallbackRestaurantProfile() {
  return {
    restaurant_name: Cookies.get('orgName') || Cookies.get('clientName') || 'CafeQR',
    bill_footer_enabled: true,
    timezone: Cookies.get('timezone'),
  };
}

async function ensurePrinterConfigured() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const n = navigator;

    const hasUsb = n?.usb && (await n.usb.getDevices()).length > 0;
    const hasSerial = n?.serial && (await n.serial.getPorts()).length > 0;

    const hasRelay =
      !!localStorage.getItem('PRINT_RELAY_URL') && !!localStorage.getItem('PRINTER_IP');

    if (hasUsb || hasSerial || hasRelay) return true;

    await printUniversal({ text: 'TEST', allowPrompt: true, allowSystemDialog: false, codepage: 0 });
    localStorage.setItem('PRINTER_READY', '1');
    return true;
  } catch {
    return false;
  }
}

export default function KotPrint({ order, onClose, onPrint, autoPrint = true, kind = 'bill' }) {
  const [status, setStatus] = useState('');
  const [outputOverride, setOutputOverride] = useState('DEFAULT');
  const [fullOrder, setFullOrder] = useState(() => mergeOrderForPrint(order, null));
  const [bill] = useState(order?.bill || null);
  const [restaurantProfile, setRestaurantProfile] = useState(() => fallbackRestaurantProfile());
  const [loadingData, setLoadingData] = useState(true);

  const ranRef = useRef(false);
  const lockRef = useRef(false);
  const nonRetryableRef = useRef(false);

  const isClient = typeof window !== 'undefined';
  const androidPwa = isClient && isAndroidPWA();
  const desktopPwa = isClient && isDesktopPWA();
  const printerReady = isClient ? localStorage.getItem('PRINTER_READY') : null;

  const closeAfterPrint = useCallback(() => {
    if (!autoPrint) onClose?.();
  }, [autoPrint, onClose]);

  useEffect(() => {
    ranRef.current = false;
    lockRef.current = false;
    nonRetryableRef.current = false;
    setStatus('');
  }, [order?.id, kind]);

  // Signal the cloud print station to pause/resume while a local print is active
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('cafeqr-local-print-active'));
    return () => {
      window.dispatchEvent(new CustomEvent('cafeqr-local-print-done'));
    };
  }, []);

  useEffect(() => {
    setFullOrder(prev => {
      if (prev?.id && order?.id && prev.id === order.id) {
        return mergeOrderForPrint(order, prev);
      }
      return mergeOrderForPrint(order, null);
    });
  }, [order]);

  useEffect(() => {
    if (!androidPwa) return;
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [androidPwa, onClose]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const offlineOrder = isOfflinePrintOrder(order);

      if (order?.id && !offlineOrder) {
        try {
          const { data: res } = await api.get(`/api/v1/orders/${order.id}`);
          const freshOrder = res.data;

          if (alive && freshOrder) {
            // Merge fresh API data (lines/totals) but KEEP removed_items/isEdited
            // from the original order prop — these come from the cloud print job
            // payload and are NOT stored on the order entity itself.
            setFullOrder(mergeOrderForPrint(freshOrder, order));
          }
        } catch (err) {
          if (err?.code !== 'OFFLINE_CACHE_MISS') {
            console.warn('Unable to hydrate print order:', err?.message || err);
          }
        }
      }

      // ── Sync customized print templates from backend BEFORE building text ──
      // This ensures buildKotText() / buildReceiptText() use the template settings
      // (paper width, columns, font sizes, header/footer, visibility toggles)
      // saved in Templates & Paper, rather than hardcoded defaults.
      await ensurePrintTemplatesSynced();

      try {
        const { data: cfgRes } = await api.get('/api/v1/configurations');
        if (alive && cfgRes.data) {
          const cfg = cfgRes.data;
          let logoBitmap = cfg.printLogoBitmap;
          let logoCols = cfg.printLogoCols;
          let logoRows = cfg.printLogoRows;
          let logoBase64 = null;

          if (cfg.logoUrl) {
            try {
              const grid = await logoUrlToBitmapGrid(cfg.logoUrl);
              if (grid) {
                logoBitmap = grid.bitmap;
                logoCols = grid.cols;
                logoRows = grid.rows;
                logoBase64 = cfg.logoUrl;
              }
            } catch (err) {
              console.warn('Failed to convert logoUrl to bitmap grid:', err);
            }
          }

          setRestaurantProfile({
            restaurant_name: cfg.restaurantName || Cookies.get('orgName') || Cookies.get('clientName'),
            shipping_address_line1: cfg.shippingAddressLine1,
            shipping_address_line2: cfg.shippingAddressLine2,
            shipping_city: cfg.shippingCity,
            shipping_address_state: cfg.shippingState || cfg.shippingAddressState,
            shipping_pincode: cfg.shippingPincode,
            phone: cfg.phone,
            gstin: cfg.gstin,
            gst_enabled: cfg.taxEnabled,
            fssai_license: cfg.fssaiLicense,
            bill_footer_text: cfg.billFooter || cfg.billFooterText,
            bill_footer_enabled: cfg.billFooterEnabled !== false,
            receipt_cols: cfg.printCols,
            print_logo_bitmap: logoBitmap,
            print_logo_cols: logoCols,
            print_logo_rows: logoRows,
            logo_base64: logoBase64 || (logoBitmap ? bitmapToPngBase64(logoBitmap, logoCols, logoRows) : null),
            timezone: cfg.timezone || Cookies.get('timezone')
          });
        }
      } catch (err) {
        if (err?.code !== 'OFFLINE_CACHE_MISS') {
          console.warn('Unable to hydrate print configuration:', err?.message || err);
        }
        if (alive) {
          setRestaurantProfile((current) => current || fallbackRestaurantProfile());
        }
      } finally {
        if (alive) setLoadingData(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [order]);

  const doPrint = useCallback(async () => {
    if (lockRef.current) return false;
    lockRef.current = true;

    try {
      const normalizedOrder = mergeOrderForPrint(fullOrder, order);
      const baseDocument = {
        order: normalizedOrder,
        restaurant: restaurantProfile,
        bill,
      };
      const nativeOutput = outputOverride === 'DEFAULT' ? undefined : outputOverride;

      const onAndroidPWA = isAndroidPWA();
      // Never show browser print dialog — the gateway's auto-discovery
      // and winspool fallback handle silent printing automatically.
      const allowSystemDialog = false;
      const scale = 'normal';

      if (kind !== 'kot' || !kotRoutesEnabled()) {
        const text =
          kind === 'kot'
            ? buildKotText(normalizedOrder, restaurantProfile)
            : buildReceiptText(normalizedOrder, bill, restaurantProfile);

        if (onAndroidPWA) {
          try {
            await printUniversal({
              text,
              allowPrompt: true,
              allowSystemDialog: true,
              scale,
              jobKind: kind,
              outputFormat: nativeOutput,
              document: baseDocument,
              ...getPrintJobMeta(normalizedOrder, kind, 'main'),
            });
            onPrint?.();
            return true;
          } catch (e) {
            setStatus('✗ ' + (e.message || 'Printing failed'));
            return false;
          }
        }

        await printUniversal({
          text,
          relayUrl: (typeof window !== 'undefined' && localStorage.getItem('PRINT_RELAY_URL')) || undefined,
          ip: (typeof window !== 'undefined' && localStorage.getItem('PRINTER_IP')) || undefined,
          port: Number((typeof window !== 'undefined' && localStorage.getItem('PRINTER_PORT')) || 9100),
          codepage: 0,
          allowPrompt: false,
          allowSystemDialog,
          scale,
          jobKind: kind,
          outputFormat: nativeOutput,
          document: baseDocument,
          ...getPrintJobMeta(normalizedOrder, kind, 'main'),
        });

        onPrint?.();
        closeAfterPrint();
        return true;
      }

      const routes = readJson('PRINT_KOT_ROUTES_V1', []).filter((r) => r && r.enabled);
      const allOrderItems = rawItemsFromOrder(normalizedOrder);

      if (!routes.length) {
        const text = buildKotText(normalizedOrder, restaurantProfile);

        if (onAndroidPWA) {
          try {
            await printUniversal({
              text,
              allowPrompt: true,
              allowSystemDialog: true,
              scale,
              jobKind: 'kot',
              outputFormat: nativeOutput,
              document: baseDocument,
              ...getPrintJobMeta(normalizedOrder, 'kot', 'main'),
            });
            onPrint?.();
            return true;
          } catch (e) {
            setStatus('✗ ' + (e.message || 'Printing failed'));
            return false;
          }
        }

        await printUniversal({
          text,
          allowPrompt: false,
          allowSystemDialog,
          scale,
          codepage: 0,
          jobKind: 'kot',
          outputFormat: nativeOutput,
          document: baseDocument,
          ...getPrintJobMeta(normalizedOrder, 'kot', 'main'),
        });

        onPrint?.();
        closeAfterPrint();
        return true;
      }

      for (const r of routes) {
        const cats = Array.isArray(r.categories) ? r.categories : [];
        const norm = (s) => String(s || '').trim().toUpperCase();
        const catSet = new Set(cats.map(norm));
        const subset = allOrderItems.filter((oi) => catSet.has(norm(getItemCategoryName(oi))));
        if (!subset.length) continue;

        const routedOrder = {
          ...normalizedOrder,
          lines: subset,
          items: toLegacyItemsFromOrderItems(subset),
        };
        const text = buildKotText(routedOrder, restaurantProfile);

        if (onAndroidPWA) {
          try {
            await printUniversal({
              text,
              allowPrompt: true,
              allowSystemDialog: true,
              scale,
              jobKind: 'kot',
              outputFormat: nativeOutput,
              document: { ...baseDocument, order: routedOrder },
              ...getPrintJobMeta(routedOrder, 'kot', `route-${r.id || r.name || r.label || 'android'}`),
            });
          } catch (e) {
            console.error(e);
          }
          continue;
        }

        const routeNet = getRouteNetworkTargets(r);
        const routeWinPrinterNames = Array.isArray(r.printerNames) ? r.printerNames : [];
        let printedRoute = false;

        if (routeNet.relayUrl && routeNet.targets.length) {
          for (const t of routeNet.targets) {
            await printUniversal({
              text,
              relayUrl: routeNet.relayUrl,
              ip: t.ip,
              port: t.port,
              codepage: 0,
              allowPrompt: false,
              allowSystemDialog: false,
              scale,
              jobKind: 'kot',
              outputFormat: nativeOutput,
              document: { ...baseDocument, order: routedOrder },
              ...getPrintJobMeta(routedOrder, 'kot', `route-net-${r.id || r.name || t.ip}`),
            });
            printedRoute = true;
          }
        }

        if (routeWinPrinterNames.length) {
          await printUniversal({
            text,
            codepage: 0,
            allowPrompt: false,
            allowSystemDialog,
            scale,
            jobKind: 'kot',
            outputFormat: nativeOutput,
            document: { ...baseDocument, order: routedOrder },
            winPrinterNames: routeWinPrinterNames,
            ...getPrintJobMeta(routedOrder, 'kot', `route-win-${r.id || r.name || routeWinPrinterNames.join('-')}`),
          });
          printedRoute = true;
        }

        if (!printedRoute) {
          await printUniversal({
            text,
            relayUrl: (typeof window !== 'undefined' && localStorage.getItem('PRINT_RELAY_URL')) || undefined,
            ip: (typeof window !== 'undefined' && localStorage.getItem('PRINTER_IP')) || undefined,
            port: Number((typeof window !== 'undefined' && localStorage.getItem('PRINTER_PORT')) || 9100),
            codepage: 0,
            allowPrompt: true,
            allowSystemDialog,
            scale,
            jobKind: 'kot',
            outputFormat: nativeOutput,
            document: { ...baseDocument, order: routedOrder },
            ...getPrintJobMeta(routedOrder, 'kot', `route-default-${r.id || r.name || 'fallback'}`),
          });
        }
      }

      onPrint?.();
      closeAfterPrint();
      return true;
    } catch (e) {
      if (!autoPrint) {
        try {
          await downloadTextAndShare(fullOrder, bill, restaurantProfile);
          onPrint?.();
          return true;
        } catch {
        }
      }
      const message = e?.message || '';
      if (e?.code === 'PRINTER_NOT_CONFIGURED' || message.includes('printer configured. Open Settings')) {
        nonRetryableRef.current = true;
        const documentName = kind === 'kot' ? 'KOT' : kind === 'invoice' ? 'Invoice' : 'Bill';
        setStatus(`✗ No ${documentName} printer configured. Open Settings > Hardware.`);
        return false;
      }
      if (message.includes('NO_PRINTER_CONFIGURED') || message.includes('NO_WIN_PRINTER')) {
        console.warn('[print] printer not configured:', message);
        setStatus('Order saved. Printer not configured.');
        return false;
      }
      if (message.includes('PRINT_HUB_UNREACHABLE')) {
        console.warn('[print] PrintHub unreachable:', message);
        setStatus('Order saved. PrintHub is not running.');
        return false;
      }
      if (message.includes('PRINT_HUB_FAILED')) {
        console.warn('[print] PrintHub failed:', message);
        setStatus('Order saved. Printer rejected the job.');
        return false;
      }
      console.error('[print] failed:', e);
      setStatus('Printing failed. Order remains saved.');
      return false;
    } finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 600);
    }
  }, [fullOrder, order, bill, restaurantProfile, onPrint, kind, closeAfterPrint, autoPrint, outputOverride]);

  useEffect(() => {
    if (!autoPrint || !order?.id || loadingData) return;

    const id = order.id;
    const shouldDedupe = !order?._manualPrint;
    if (shouldDedupe && hasPrintedRecently(id, kind)) return;
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const printed = await doPrint();
        if (printed) {
          if (shouldDedupe) markPrinted(id, kind);
          // Notify cloud print station that local print is done
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cafeqr-local-print-done'));
          }
        } else if (!nonRetryableRef.current) {
          ranRef.current = false;
        }
      } catch {
        ranRef.current = false;
      }
    })();
  }, [autoPrint, loadingData, order?.id, order?._manualPrint, kind, doPrint]);

  if (androidPwa) {
    const amount = Number(
      bill?.total_amount ?? fullOrder?.total_amount ?? 0
    );

    return (
      <div className="pwa-print-backdrop">
        <div className="pwa-print-card" role="dialog" aria-modal="true">
          <div className="pwa-print-head">
            <h3>Print Bill / KOT</h3>
            <button className="x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="pwa-preview">
            <pre>{`Order: #${(fullOrder?.orderNo || '').slice(-6).toUpperCase()}
Type: ${getOrderTypeLabelLocal(fullOrder)}
Amount: ₹${amount.toFixed(2)}`}</pre>
          </div>
          {status ? (
            <div className={`note ${status.includes('✗') ? 'err' : 'ok'}`}>{status}</div>
          ) : null}
          <button className="primary" type="button" onClick={doPrint} disabled={loadingData}>
            {loadingData ? 'Loading...' : '🖨️ Print via Thermer'}
          </button>
        </div>
        <style jsx>{`
          .pwa-print-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
          .pwa-print-card { background: white; border-radius: 16px; width: 100%; max-width: 400px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
          .pwa-print-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .pwa-print-head h3 { margin: 0; font-size: 18px; font-weight: 800; }
          .pwa-print-head .x { background: none; border: none; font-size: 20px; cursor: pointer; color: #94a3b8; }
          .pwa-preview { background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
          .pwa-preview pre { margin: 0; font-family: monospace; font-size: 14px; color: #334155; line-height: 1.5; }
          .note { padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; font-weight: 600; text-align: center; }
          .note.ok { background: #f0fdf4; color: #16a34a; }
          .note.err { background: #fef2f2; color: #ef4444; }
          .primary { width: 100%; background: #f97316; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; }
          .primary:disabled { opacity: 0.7; cursor: not-allowed; }
        `}</style>
      </div>
    );
  }

  if (desktopPwa && !printerReady) {
    return (
      <div className="kot-overlay">
        <div className="kot-modal">
          <div className="kot-header">
            <h2>Printer setup</h2>
          </div>
          <p>Select your USB/Serial/Network printer once to enable silent printing.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              onClick={async () => {
                const ok = await ensurePrinterConfigured();
                setStatus(ok ? '✓ Printer saved' : '✗ Setup cancelled');
                if (ok) {
                  await doPrint();
                }
              }}
            >
              Select printer
            </button>
            <button onClick={onClose}>Skip</button>
          </div>
          {status && <div style={{ marginTop: 12 }}>{status}</div>}
        </div>
        <style jsx>{`
          .kot-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 9999; }
          .kot-modal { background: white; padding: 24px; border-radius: 16px; width: 90%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
          .kot-header { margin-bottom: 16px; }
          .kot-header h2 { margin: 0; font-size: 20px; font-weight: 800; }
          .primary { background: #f97316; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  if (autoPrint && !status) return null;

  return (
    <div className="kot-overlay">
      <div className="kot-modal">
        <div className="kot-header">
          <h2>{loadingData ? 'Loading Data...' : (status ? 'Print Status' : 'Printing...')}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {status && (
          <div className={`status ${status.includes('✗') ? 'error' : 'success'}`}>{status}</div>
        )}
        {!autoPrint && !loadingData && !status && (
          <div className="manual-print">
            {isNativePrintServicePaired() && (
              <div className="output-choice">
                {[
                  ['DEFAULT', 'Saved default'],
                  ['THERMAL', 'Thermal'],
                  ['REGULAR', 'Regular'],
                  ['BOTH', 'Both'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={outputOverride === value ? 'active' : ''}
                    onClick={() => setOutputOverride(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button className="print-now" onClick={doPrint}>
              Print {kind === 'kot' ? 'KOT' : 'Bill'}
            </button>
          </div>
        )}
      </div>
      <style jsx>{`
        .kot-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .kot-modal { background: white; padding: 24px; border-radius: 16px; width: 90%; max-width: 400px; }
        .kot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .kot-header h2 { margin: 0; font-size: 18px; font-weight: 800; }
        .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #94a3b8; }
        .status { padding: 12px; border-radius: 8px; font-weight: 600; text-align: center; }
        .status.success { background: #f0fdf4; color: #16a34a; }
        .status.error { background: #fef2f2; color: #ef4444; }
        .manual-print { display: flex; flex-direction: column; gap: 14px; }
        .output-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .output-choice button { min-height: 38px; border: 1px solid #dbe2ea; background: white; color: #475569; font-weight: 700; border-radius: 7px; cursor: pointer; }
        .output-choice button.active { border-color: #f97316; background: #fff7ed; color: #c2410c; }
        .print-now { min-height: 44px; border: 0; border-radius: 7px; background: #f97316; color: white; font-weight: 800; cursor: pointer; }
      `}</style>
    </div>
  );
}
