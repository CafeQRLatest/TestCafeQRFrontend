// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, buildKotText, downloadTextAndShare, toDisplayItems } from '../utils/printUtils';
import api from '../utils/api';
import { printUniversal } from '../utils/printGateway';
import { Capacitor } from '@capacitor/core';
import Cookies from 'js-cookie';

const PRINT_DEDUP_KEY = 'KOTPRINT_PRINTED_V1';
const PRINT_DEDUP_TTL_MS = 15_000; // 15 seconds

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
  const mergedItems = toDisplayItems(merged);
  const fallbackItems = toDisplayItems(fallback);

  if (mergedItems.length || !fallbackItems.length) {
    return merged;
  }

  const fallbackRawItems = rawItemsFromOrder(fallback);
  return {
    ...merged,
    lines: fallbackRawItems.length ? fallbackRawItems : fallbackItems,
    items: Array.isArray(fallback?.items) && fallback.items.length ? fallback.items : fallbackItems,
    order_items: Array.isArray(fallback?.order_items) && fallback.order_items.length
      ? fallback.order_items
      : merged.order_items,
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
    return `Table ${order.tableNumber}`;
  }
  if (order.fulfillmentType === 'parcel' || order.fulfillmentType === 'TAKEAWAY') return 'Takeaway';
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

function isOfflinePrintOrder(order) {
  return Boolean(order?.offline || order?.offlineOperationId || order?.syncStatus === 'QUEUED');
}

function getPrintJobMeta(order, kind = 'bill', target = 'default') {
  const offline = isOfflinePrintOrder(order);
  const orderId = !offline && order?.id ? String(order.id) : undefined;
  const offlineOperationId = order?.offlineOperationId || (offline && order?.id ? String(order.id) : undefined);
  const orderNo = order?.orderNo || order?.order_no;
  const ref = String(offlineOperationId || orderId || orderNo || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(-48);
  const targetKey = String(target || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default';

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
  const [fullOrder, setFullOrder] = useState(() => mergeOrderForPrint(order, null));
  const [bill] = useState(order?.bill || null);
  const [restaurantProfile, setRestaurantProfile] = useState(() => fallbackRestaurantProfile());
  const [loadingData, setLoadingData] = useState(true);

  const ranRef = useRef(false);
  const lockRef = useRef(false);

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
    setStatus('');
  }, [order?.id, kind]);

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
            setFullOrder(mergeOrderForPrint(freshOrder, order));
          }
        } catch (err) {
          if (err?.code !== 'OFFLINE_CACHE_MISS') {
            console.warn('Unable to hydrate print order:', err?.message || err);
          }
        }
      }

      try {
        const { data: cfgRes } = await api.get('/api/v1/configurations');
        if (alive && cfgRes.data) {
          setRestaurantProfile({
            restaurant_name: cfgRes.data.restaurantName || Cookies.get('orgName') || Cookies.get('clientName'),
            shipping_address_line1: cfgRes.data.shippingAddressLine1,
            shipping_address_line2: cfgRes.data.shippingAddressLine2,
            shipping_city: cfgRes.data.shippingCity,
            shipping_address_state: cfgRes.data.shippingState || cfgRes.data.shippingAddressState,
            shipping_pincode: cfgRes.data.shippingPincode,
            phone: cfgRes.data.phone,
            gstin: cfgRes.data.gstin,
            gst_enabled: cfgRes.data.taxEnabled,
            fssai_license: cfgRes.data.fssaiLicense,
            bill_footer_text: cfgRes.data.billFooter || cfgRes.data.billFooterText,
            bill_footer_enabled: cfgRes.data.billFooterEnabled !== false,
            receipt_cols: cfgRes.data.printCols,
            print_logo_bitmap: cfgRes.data.printLogoBitmap,
            print_logo_cols: cfgRes.data.printLogoCols,
            print_logo_rows: cfgRes.data.printLogoRows
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
            allowPrompt: false,
            allowSystemDialog,
            scale,
            jobKind: 'kot',
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
  }, [fullOrder, order, bill, restaurantProfile, onPrint, kind, closeAfterPrint, autoPrint]);

  useEffect(() => {
    if (!autoPrint || !order?.id || loadingData) return;

    const id = order.id;
    if (hasPrintedRecently(id, kind)) return;
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const printed = await doPrint();
        if (printed) {
          markPrinted(id, kind);
        } else {
          ranRef.current = false;
        }
      } catch {
        ranRef.current = false;
      }
    })();
  }, [autoPrint, loadingData, order?.id, kind, doPrint]);

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
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <p>Sending to printer...</p>
            <PrintTrigger manualTrigger={doPrint} />
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
      `}</style>
    </div>
  );
}

function PrintTrigger({ manualTrigger }) {
  useEffect(() => {
    manualTrigger();
  }, [manualTrigger]);
  return null;
}
