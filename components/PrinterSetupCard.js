import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { printUniversal } from '../utils/printGateway';
import api from '../utils/api';
import { 
  FaPrint, FaBluetooth,
  FaWindows, FaAndroid, FaRoute, FaCheckCircle, 
  FaExclamationCircle, FaTrash, FaPlus,
  FaSignal, FaNetworkWired, FaCog
} from 'react-icons/fa';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readLocal(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) || '' : '';
  } catch {
    return '';
  }
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map(s => String(s || '').trim()).filter(Boolean)));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export default function PrinterSetupCard({ restaurantId, config, onConfigChange, androidOnly = false }) {
  // ---------- Paper settings ----------
  // Use props if available, otherwise fallback to localStorage
  const paperMm = config?.paper_mm ?? '58';
  const cols = config?.print_cols ?? '32';
  const leftDots = config?.left_dots ?? '0';
  const rightDots = config?.right_dots ?? '0';
  const autoCut = config?.auto_cut ?? false;
  const guardCols = config?.guard_cols ?? '1'; // Added support for guard/safe cols if needed
  const safeCols = config?.safe_cols ?? '0';

  const setPaperMm = (v) => onConfigChange?.('paper_mm', v);
  const setCols = (v) => onConfigChange?.('print_cols', v);
  const setLeftDots = (v) => onConfigChange?.('left_dots', v);
  const setRightDots = (v) => onConfigChange?.('right_dots', v);
  const setAutoCut = (v) => onConfigChange?.('auto_cut', v);
  const setGuardCols = (v) => onConfigChange?.('guard_cols', v);
  const setSafeCols = (v) => onConfigChange?.('safe_cols', v);

  const persistPaperSettings = () => {
    // We still write to localStorage for the print execution logic (printUniversal)
    // which might not have access to the full react state.
    localStorage.setItem('PRINT_PAPER_MM', String(paperMm));
    localStorage.setItem('PRINT_WIDTH_COLS', String(cols));
    localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', String(leftDots));
    localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', String(rightDots));
    localStorage.setItem('PRINT_GUARD_COLS', String(guardCols));
    localStorage.setItem('PRINT_SAFE_COLS', String(safeCols));
    setMsg('✓ Paper settings applied locally & staged for cloud save.');
  };

  // ---------- Windows helper ----------
  const [listUrl, setListUrl] = [config?.print_win_list_url || 'http://127.0.0.1:3333/printers', (v) => onConfigChange?.('print_win_list_url', v)];
  const [postUrl, setPostUrl] = [config?.print_win_post_url || 'http://127.0.0.1:3333/printRaw', (v) => onConfigChange?.('print_win_post_url', v)];
  const [printers, setPrinters] = useState([]);

  // NEW: multi printer arrays
  const [billPrinters, setBillPrinters] = useState(() => uniq(readJson('PRINT_WIN_PRINTER_NAMES_BILL', [])));
  const [kotPrinters, setKotPrinters] = useState(() => uniq(readJson('PRINT_WIN_PRINTER_NAMES_KOT', [])));

  const [activeSubTab, setActiveSubTab] = useState(androidOnly ? 'android' : 'windows'); // windows, network, android, routing, paper


  // Keep old single values for display fallback (optional)
  const billSingleFallback = localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '';
  const kotSingleFallback = localStorage.getItem('PRINT_WIN_PRINTER_NAME_KOT') || '';

  // ---------- KOT routing ----------
  const [routingEnabled, setRoutingEnabled] = useState(
    () => localStorage.getItem('PRINT_KOT_CATEGORY_ROUTING') === '1'
  );

  const [routes, setRoutes] = useState(() => {
    const raw = readJson('PRINT_KOT_ROUTES_V1', []);
    if (!Array.isArray(raw)) return [];
    return raw.map(r => ({
      id: r?.id || uid(),
      label: r?.label || 'Route',
      enabled: r?.enabled !== false,
      printerNames: uniq(r?.printerNames || []),
      categories: uniq(r?.categories || []),
      netPrinterIds: uniq(r?.netPrinterIds || []), // NEW

    }));
  });

  const [categories, setCategories] = useState([]);
  const [msg, setMsg] = useState('');
  const [androidBillPrinter, setAndroidBillPrinter] = useState(() => ({
    address: readLocal('BT_PRINTER_ADDR'),
    name: readLocal('BT_PRINTER_NAME_HINT'),
  }));
  const [androidKotPrinter, setAndroidKotPrinter] = useState(() => ({
    address: readLocal('BT_PRINTER_ADDR_KOT'),
    name: readLocal('BT_PRINTER_NAME_HINT_KOT'),
  }));
  const WIN_HELPER_URL = '/desktop/Windows/CafeQR-PrintHub-Win.zip';

  const [billPrinterMode, setBillPrinterMode] = useState(() => localStorage.getItem('ANDROID_BILL_MODE') || 'bluetooth');
  const [kotPrinterMode, setKotPrinterMode] = useState(() => localStorage.getItem('ANDROID_KOT_MODE') || 'bluetooth');

  const [billPrinterIp, setBillPrinterIp] = useState(() => localStorage.getItem('PRINTER_IP') || '');
  const [billPrinterPort, setBillPrinterPort] = useState(() => localStorage.getItem('PRINTER_PORT') || '9100');

  const [kotPrinterIp, setKotPrinterIp] = useState(() => localStorage.getItem('PRINTER_IP_KOT') || '');
  const [kotPrinterPort, setKotPrinterPort] = useState(() => localStorage.getItem('PRINTER_PORT_KOT') || '9100');

  const saveAndroidLanSettings = (kind) => {
    if (kind === 'bill') {
      localStorage.setItem('ANDROID_BILL_MODE', 'lan');
      localStorage.setItem('PRINTER_IP', billPrinterIp.trim());
      localStorage.setItem('PRINTER_PORT', billPrinterPort.trim());
    } else {
      localStorage.setItem('ANDROID_KOT_MODE', 'lan');
      localStorage.setItem('PRINTER_IP_KOT', kotPrinterIp.trim());
      localStorage.setItem('PRINTER_PORT_KOT', kotPrinterPort.trim());
    }
    localStorage.setItem('PRINTER_MODE', 'bt-android');
    localStorage.setItem('PRINTER_READY', '1');
    localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
    publishPrintStationChange();
    setMsg(`✓ Android LAN settings saved for ${kind === 'kot' ? 'KOT' : 'Bill'}`);
  };

  const switchAndroidPrinterMode = (kind, mode) => {
    if (kind === 'bill') {
      setBillPrinterMode(mode);
      localStorage.setItem('ANDROID_BILL_MODE', mode);
    } else {
      setKotPrinterMode(mode);
      localStorage.setItem('ANDROID_KOT_MODE', mode);
    }
    localStorage.setItem('PRINTER_MODE', 'bt-android');
    localStorage.setItem('PRINTER_READY', '1');
    localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
    publishPrintStationChange();
  };

  const canEditRouting = routingEnabled; // simple switch; you can relax this later

  // ---------- helpers ----------
  function toggleMultiSelect(val, current, setter) {
    if (current.includes(val)) {
      setter(current.filter(x => x !== val));
    } else {
      setter(uniq([...current, val]));
    }
  }

  const allPrintersForRouting = useMemo(() => {
    // You can allow any installed printer; not just kotPrinters.
    return printers;
  }, [printers]);

  const publishPrintStationChange = () => {
    try {
      window.dispatchEvent(new Event('cafeqr-print-station-config-changed'));
    } catch {
      // ignore
    }
  };

  const refreshAndroidPrinterState = () => {
    setAndroidBillPrinter({
      address: localStorage.getItem('BT_PRINTER_ADDR') || '',
      name: localStorage.getItem('BT_PRINTER_NAME_HINT') || '',
    });
    setAndroidKotPrinter({
      address: localStorage.getItem('BT_PRINTER_ADDR_KOT') || '',
      name: localStorage.getItem('BT_PRINTER_NAME_HINT_KOT') || '',
    });
  };

  const enableAndroidPrintStation = () => {
    localStorage.setItem('PRINTER_MODE', 'bt-android');
    localStorage.setItem('PRINTER_READY', '1');
    localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
    publishPrintStationChange();
  };

  const hasNonAndroidPrintConfig = () => Boolean(
    localStorage.getItem('PRINT_WIN_URL') ||
    localStorage.getItem('PRINT_WIN_LIST_URL') ||
    localStorage.getItem('PRINT_WIN_PRINTER_NAME') ||
    localStorage.getItem('PRINT_WIN_PRINTER_NAME_KOT') ||
    localStorage.getItem('PRINT_WIN_PRINTER_NAMES_BILL') ||
    localStorage.getItem('PRINT_WIN_PRINTER_NAMES_KOT') ||
    localStorage.getItem('PRINT_RELAY_URL') ||
    localStorage.getItem('PRINTER_IP') ||
    uniq(readJson('PRINT_NET_TARGET_IDS_BILL', [])).length ||
    uniq(readJson('PRINT_NET_TARGET_IDS_KOT', [])).length
  );

  const getDevicePrinter = async () => {
    if (!isNativeAndroid()) {
      throw new Error('Open this page inside the CafeQR Android app to pair Bluetooth printers.');
    }
    const plugin = window.Capacitor?.Plugins?.DevicePrinter;
    if (!plugin) {
      throw new Error('Android printer plugin is unavailable in this APK.');
    }
    await plugin.ensurePermissions();
    return plugin;
  };

  const pairAndroidPrinter = async (kind) => {
    const label = kind === 'kot' ? 'KOT' : 'Final/Bill';
    try {
      const DevicePrinter = await getDevicePrinter();
      const pick = await DevicePrinter.pickPrinter();
      const address = pick?.address || '';
      if (!address) throw new Error('No printer selected');

      const pair = await DevicePrinter.pairDevice({ address });
      if (pair?.paired === false) {
        throw new Error('Bluetooth pairing did not complete');
      }

      const name = pick?.name || '';
      if (kind === 'kot') {
        localStorage.setItem('BT_PRINTER_ADDR_KOT', address);
        if (name) localStorage.setItem('BT_PRINTER_NAME_HINT_KOT', name);
        writeJson('BT_PRINTER_ADDRS_KOT', [address]);
      } else {
        localStorage.setItem('BT_PRINTER_ADDR', address);
        if (name) localStorage.setItem('BT_PRINTER_NAME_HINT', name);
        writeJson('BT_PRINTER_ADDRS_BILL', [address]);
      }

      enableAndroidPrintStation();
      refreshAndroidPrinterState();
      setMsg(`✓ ${label} printer paired${name ? `: ${name}` : ''}`);
    } catch (e) {
      setMsg(`✗ ${label} pairing failed: ${e?.message || String(e)}`);
    }
  };

  // ---------- load printers ----------
  const detectPrinters = async () => {
    try {
      const r = await fetch(listUrl);
      const names = await r.json();
      const arr = Array.isArray(names) ? names : [];
      setPrinters(arr);

      // If nothing picked yet, seed something sensible
      if (!billPrinters.length) {
        const seed = billSingleFallback ? [billSingleFallback] : (arr[0] ? [arr[0]] : []);
        if (seed.length) setBillPrinters(seed);
      }
      if (!kotPrinters.length) {
        const seed = kotSingleFallback ? [kotSingleFallback] : [];
        if (seed.length) setKotPrinters(seed);
      }

      setMsg(`Found ${arr.length} printers`);
    } catch {
      setMsg('Cannot reach the local Print Hub. Start the helper on this Windows machine and try again.');
    }
  };

  // ---------- load product categories for KOT routing ----------
  const loadCategories = async () => {
    try {
      const res = await api.get('/api/v1/products/categories');
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const cats = uniq(rows.map(r => r?.name));
      setCategories(cats);
    } catch {
      setCategories([]);
    }
  };

  // ---------- mode switching helpers ----------
  async function selectBluetoothSerial() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (!nav || !('serial' in nav)) {
        setMsg('✗ Web Serial not supported in this browser');
        return;
      }
      // @ts-ignore
      await nav.serial.requestPort({});

      localStorage.setItem('PRINTER_MODE', 'bt-serial');
      localStorage.setItem('PRINTER_READY', '1');
      persistPaperSettings();

      // clear winspool config when switching
      localStorage.removeItem('PRINT_WIN_URL');
      localStorage.removeItem('PRINT_WIN_LIST_URL');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME_KOT');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_BILL');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_KOT');
      localStorage.removeItem('CAFEQR_PRINT_STATION_ENABLED');
      localStorage.removeItem('CAFEQR_MAIN_OFFLINE_DEVICE');

      setMsg('✓ Bluetooth/Serial saved for silent printing');
    } catch {
      setMsg('✗ Selection cancelled');
    }
  }

  async function selectUsbWebUSB() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && 'usb' in nav) {
        // @ts-ignore
        await nav.usb.requestDevice({ filters: [] });

        localStorage.setItem('PRINTER_MODE', 'webusb');
        localStorage.setItem('PRINTER_READY', '1');
        persistPaperSettings();

        // clear winspool config when switching
        localStorage.removeItem('PRINT_WIN_URL');
        localStorage.removeItem('PRINT_WIN_LIST_URL');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME_KOT');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_BILL');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_KOT');
        localStorage.removeItem('CAFEQR_PRINT_STATION_ENABLED');
        localStorage.removeItem('CAFEQR_MAIN_OFFLINE_DEVICE');

        setMsg('✓ USB printer saved for silent printing');
        return;
      }
      setMsg('✗ WebUSB not supported in this browser');
    } catch {
      setMsg('✗ Selection cancelled');
    }
  }

  const forgetBtPrinter = () => {
    localStorage.removeItem('BT_PRINTER_ADDR');
    localStorage.removeItem('BT_PRINTER_NAME_HINT');
    localStorage.removeItem('BT_PRINTER_ADDR_KOT');
    localStorage.removeItem('BT_PRINTER_NAME_HINT_KOT');

    // Optional (if you implement multi BT arrays):
    localStorage.removeItem('BT_PRINTER_ADDRS_BILL');
    localStorage.removeItem('BT_PRINTER_ADDRS_KOT');

    if (!hasNonAndroidPrintConfig()) {
      if (localStorage.getItem('PRINTER_MODE') === 'bt-android') {
        localStorage.removeItem('PRINTER_MODE');
      }
      localStorage.removeItem('PRINTER_READY');
      localStorage.removeItem('CAFEQR_PRINT_STATION_ENABLED');
    }

    refreshAndroidPrinterState();
    publishPrintStationChange();
    setMsg('Saved Bluetooth printers cleared. Next Android bill/KOT print will ask you to select again.');
  };

// ---------- Network (Ethernet/Wi‑Fi) printers ----------
const [relayUrl, setRelayUrl] = useState(() => localStorage.getItem('PRINT_RELAY_URL') || '');

const [netPrinters, setNetPrinters] = useState(() =>
  readJson('PRINT_NET_PRINTERS_V1', [])
);

const [billNetIds, setBillNetIds] = useState(() =>
  uniq(readJson('PRINT_NET_TARGET_IDS_BILL', []))
);

const [kotNetIds, setKotNetIds] = useState(() =>
  uniq(readJson('PRINT_NET_TARGET_IDS_KOT', []))
);

function addNetPrinter() {
  setNetPrinters(prev => [
    ...(Array.isArray(prev) ? prev : []),
    { id: uid(), label: 'Network printer', ip: '', port: 9100 },
  ]);
}


function updateNetPrinter(id, patch) {
  setNetPrinters(prev =>
    (Array.isArray(prev) ? prev : []).map(p => (p?.id === id ? { ...p, ...patch } : p))
  );
}

function deleteNetPrinter(id) {
  setNetPrinters(prev => (Array.isArray(prev) ? prev : []).filter(p => p?.id !== id));
}

function saveNetworkPrinters() {
  localStorage.setItem('PRINT_RELAY_URL', relayUrl.trim());
  writeJson('PRINT_NET_PRINTERS_V1', Array.isArray(netPrinters) ? netPrinters : []);
  writeJson('PRINT_NET_TARGET_IDS_BILL', uniq(billNetIds));
  writeJson('PRINT_NET_TARGET_IDS_KOT', uniq(kotNetIds));

  // routes now may include netPrinterIds; persist it alongside your existing routing save logic
  writeJson('PRINT_KOT_ROUTES_V1', routes);

  localStorage.setItem('PRINTER_READY', '1');
  setMsg('✓ Network printers saved');
}


  // ---------- SAVE ----------
  const saveWired = () => {
    const bill = uniq(billPrinters);
    const kot = uniq(kotPrinters);

    localStorage.setItem('PRINT_WIN_LIST_URL', String(listUrl).trim());
    localStorage.setItem('PRINT_WIN_URL', String(postUrl).trim());
    localStorage.setItem('PRINTER_MODE', 'winspool');
    localStorage.setItem('PRINTER_READY', '1');
    localStorage.setItem('PRINT_WIN_AUTOCUT', autoCut ? '1' : '0');
    localStorage.setItem('CAFEQR_PRINT_STATION_ENABLED', '1');
    localStorage.setItem('CAFEQR_MAIN_OFFLINE_DEVICE', '1');

    persistPaperSettings();

    // NEW multi keys
    writeJson('PRINT_WIN_PRINTER_NAMES_BILL', bill);
    writeJson('PRINT_WIN_PRINTER_NAMES_KOT', kot);

    // Backward compatible single keys (first item)
    localStorage.setItem('PRINT_WIN_PRINTER_NAME', bill[0] || '');
    localStorage.setItem('PRINT_WIN_PRINTER_NAME_KOT', kot[0] || '');

    // routing
    localStorage.setItem('PRINT_KOT_CATEGORY_ROUTING', routingEnabled ? '1' : '0');
    writeJson('PRINT_KOT_ROUTES_V1', routes);

    setMsg(bill.length ? `Saved ${bill.length} bill printer(s) and ${kot.length} KOT printer(s).` : 'Pick at least one bill printer first.');
  };

  // ---------- tests ----------
  const testBillPrinter = async () => {
    try {
      const ruler48 = '|' + '-'.repeat(46) + '|';
      const txt =
        '*** TEST BILL PRINTER (MULTI) ***\n' +
        ruler48 + '\n' +
        '123456789012345678901234567890123456789012345678\n';

      const res = await printUniversal({
        text: txt,
        allowPrompt: true,
        allowSystemDialog: false,
        jobKind: 'bill',
        winPrinterNames: billPrinters, // NEW: print to all selected bill printers
      });

      if (res?.via === 'android-pos') {
        enableAndroidPrintStation();
        refreshAndroidPrinterState();
      }
      setMsg(`✓ Bill test via ${res?.via || 'unknown'}`);
    } catch (e) {
      setMsg(`✗ Bill test failed: ${e?.message || String(e)}`);
    }
  };

  const testKotPrinter = async () => {
    try {
      const res = await printUniversal({
        text: '*** TEST KOT PRINTER (MULTI) ***\nKitchen Ticket\n',
        allowPrompt: true,
        allowSystemDialog: false,
        jobKind: 'kot',
        winPrinterNames: kotPrinters, // NEW: print to all selected KOT printers
      });
      if (res?.via === 'android-pos') {
        enableAndroidPrintStation();
        refreshAndroidPrinterState();
      }
      setMsg(`✓ KOT test via ${res?.via || 'unknown'}`);
    } catch (e) {
      setMsg(`✗ KOT test failed: ${e?.message || String(e)}`);
    }
  };

  // ---------- routing editor actions ----------
  const addRoute = () => {
    setRoutes(prev => [
      ...prev,
    { id: uid(), label: 'New Route', enabled: true, printerNames: [], categories: [], netPrinterIds: [] },
    ]);
  };

  const updateRoute = (id, patch) => {
    setRoutes(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const deleteRoute = (id) => {
    setRoutes(prev => prev.filter(r => r.id !== id));
  };

  // ---------- effects ----------
  useEffect(() => {
    detectPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // ---------- UI ----------
  return (
    <div className="hardware-container">
      
      <div className="hardware-nav">
        {[
          { id: 'windows', label: 'Windows / USB', icon: <FaWindows /> },
          { id: 'network', label: 'Network (Relay)', icon: <FaNetworkWired /> },
          { id: 'android', label: 'Android Native', icon: <FaAndroid /> },
          { id: 'routing', label: 'KOT Routing', icon: <FaRoute /> },
          { id: 'paper',   label: 'Paper & Margins', icon: <FaCog /> },
        ].filter(tab => !androidOnly || tab.id === 'android').map(tab => (
          <button 
            key={tab.id}
            className={`nav-btn ${activeSubTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
          >
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="hardware-content fade-in">
        
        {!androidOnly && activeSubTab === 'windows' && (
          <div className="form-card">
            <div className="section-title">
              <FaWindows className="title-icon" />
              <div>
                <h4>Windows Desktop Service</h4>
                <p>Connect to local printers via the CafeQR Print Hub helper.</p>
              </div>
            </div>

            <div className="input-group">
              <label className="group-lbl">Print Hub URL</label>
              <div className="url-input-wrap">
                <input value={listUrl} onChange={e => setListUrl(e.target.value)} className="form-input" placeholder="http://127.0.0.1:3333/printers" />
                <button onClick={detectPrinters} className="btn-secondary">
                  <FaSignal /> Load Printers
                </button>
              </div>
            </div>

            <div className="printer-selector-grid">
              <div className="column">
                <label className="group-lbl">Bill Printers</label>
                <div className="printer-tags-list">
                  {printers.length === 0 && <span className="empty-text">No printers found. Load hub above.</span>}
                  {printers.map(p => (
                    <div 
                      key={p} 
                      className={`printer-tag ${billPrinters.includes(p) ? 'selected' : ''}`}
                      onClick={() => toggleMultiSelect(p, billPrinters, setBillPrinters)}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </div>

              <div className="column">
                <label className="group-lbl">KOT Printers</label>
                <div className="printer-tags-list">
                   {printers.length === 0 && <span className="empty-text">No printers found.</span>}
                   {printers.map(p => (
                    <div 
                      key={p} 
                      className={`printer-tag ${kotPrinters.includes(p) ? 'selected' : ''}`}
                      onClick={() => toggleMultiSelect(p, kotPrinters, setKotPrinters)}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="form-row">
               <label className="checkbox-wrap">
                  <input type="checkbox" checked={autoCut} onChange={e => setAutoCut(e.target.checked)} />
                  <span className="check-label" style={{fontSize:'13.5px', fontWeight:600}}>Enable Auto-Cut (ESC/POS)</span>
               </label>
               <button onClick={saveWired} className="btn-primary mini">Save Windows Config</button>
            </div>

            <div className="download-hub-banner">
               <p>Running on a Windows PC? You need our background helper for silent printing.</p>
               <a href={WIN_HELPER_URL} download className="btn-download">
                  <FaPlus /> Download Print Hub Helper (.zip)
               </a>
            </div>

            <div className="test-actions">
               <button onClick={testBillPrinter} className="btn-outline"><FaPrint /> Test Bill</button>
               <button onClick={testKotPrinter} className="btn-outline"><FaPlus style={{fontSize:'14px'}} /> Test KOT</button>
            </div>
          </div>
        )}

        {!androidOnly && activeSubTab === 'network' && (
          <div className="form-card">
            <div className="section-title">
              <FaNetworkWired className="title-icon" />
              <div>
                <h4>Ethernet / Wi-Fi Printers</h4>
                <p>Print directly to IP addresses on your local network via a relay server.</p>
              </div>
            </div>

            <div className="input-group">
              <label className="group-lbl">Relay Server URL</label>
              <input value={relayUrl} onChange={e => setRelayUrl(e.target.value)} className="form-input" placeholder="http://192.168.1.5:3333/relayPrint" />
              <span className="group-desc">The address of the PC/Device acting as the TCP relay.</span>
            </div>

            <div className="divider" />

            <div className="net-printers-list">
              <div className="list-header" style={{marginBottom:'8px'}}>
                <span className="group-lbl">Network Target Devices</span>
                <button onClick={addNetPrinter} className="btn-secondary sm"><FaPlus /> Add Printer</button>
              </div>

              {(Array.isArray(netPrinters) ? netPrinters : []).map(p => (
                <div key={p.id} className="net-printer-row" style={{marginBottom:'12px'}}>
                  <input value={p.label || ''} onChange={e => updateNetPrinter(p.id, { label: e.target.value })} placeholder="Label (e.g. Kitchen)" className="form-input" />
                  <input value={p.ip || ''} onChange={e => updateNetPrinter(p.id, { ip: e.target.value.trim() })} placeholder="IP (192.168.1.50)" className="form-input" />
                  <input type="number" value={p.port ?? 9100} onChange={e => updateNetPrinter(p.id, { port: Number(e.target.value) })} className="form-input port" />
                  <button onClick={() => deleteNetPrinter(p.id)} className="btn-icon-del"><FaTrash /></button>
                </div>
              ))}
            </div>

            <div className="printer-selector-grid">
               <div className="column">
                  <label className="group-lbl">Bill Targets (Net)</label>
                  <div className="printer-tags-list">
                    {(netPrinters || []).map(p => (
                      <div key={p.id} className={`printer-tag ${billNetIds.includes(p.id) ? 'selected' : ''}`} onClick={() => toggleMultiSelect(p.id, billNetIds, setBillNetIds)}>
                        {p.label || p.ip}
                      </div>
                    ))}
                  </div>
               </div>
               <div className="column">
                  <label className="group-lbl">KOT Targets (Net)</label>
                  <div className="printer-tags-list">
                    {(netPrinters || []).map(p => (
                      <div key={p.id} className={`printer-tag ${kotNetIds.includes(p.id) ? 'selected' : ''}`} onClick={() => toggleMultiSelect(p.id, kotNetIds, setKotNetIds)}>
                        {p.label || p.ip}
                      </div>
                    ))}
                  </div>
               </div>
            </div>

            <div className="action-row-end">
              <button onClick={saveNetworkPrinters} className="btn-primary">Save Network Config</button>
            </div>
          </div>
        )}

        {activeSubTab === 'android' && (
          <div className="form-card">
            <div className="section-title">
              <FaAndroid className="title-icon" />
              <div>
                <h4>Native Android Integration</h4>
                <p>Pair local Bluetooth printers for automatic KOT and final bill printing.</p>
              </div>
            </div>

            <div className="android-printer-grid">
              <div className="android-printer-panel">
                <div className="android-printer-head">
                  <FaPrint className="android-printer-icon" />
                  <div>
                    <h5>Final/Bill Printer</h5>
                    <div className="mode-toggle-group">
                      <button 
                        className={`mode-btn ${billPrinterMode === 'bluetooth' ? 'active' : ''}`}
                        onClick={() => switchAndroidPrinterMode('bill', 'bluetooth')}
                      >
                        Bluetooth
                      </button>
                      <button 
                        className={`mode-btn ${billPrinterMode === 'lan' ? 'active' : ''}`}
                        onClick={() => switchAndroidPrinterMode('bill', 'lan')}
                      >
                        LAN / Network
                      </button>
                    </div>
                  </div>
                </div>

                {billPrinterMode === 'bluetooth' ? (
                  <>
                    <p className="status-text">
                      {androidBillPrinter.address ? (androidBillPrinter.name || androidBillPrinter.address) : 'No Bluetooth printer paired'}
                    </p>
                    <div className="android-action-row">
                      <button onClick={() => pairAndroidPrinter('bill')} className="btn-secondary">
                        <FaBluetooth /> Pair Printer
                      </button>
                      <button onClick={testBillPrinter} className="btn-outline">
                        <FaPrint /> Test Print
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="lan-input-section">
                    <div className="lan-input-row">
                      <input 
                        type="text" 
                        value={billPrinterIp} 
                        onChange={(e) => setBillPrinterIp(e.target.value)} 
                        placeholder="Printer IP (e.g. 192.168.1.100)"
                        className="form-input"
                      />
                      <input 
                        type="number" 
                        value={billPrinterPort} 
                        onChange={(e) => setBillPrinterPort(e.target.value)} 
                        placeholder="Port (9100)"
                        className="form-input port"
                      />
                    </div>
                    <div className="android-action-row">
                      <button onClick={() => saveAndroidLanSettings('bill')} className="btn-secondary">
                        Save LAN Config
                      </button>
                      <button onClick={testBillPrinter} className="btn-outline">
                        <FaPrint /> Test Print
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="android-printer-panel">
                <div className="android-printer-head">
                  <FaBluetooth className="android-printer-icon" />
                  <div>
                    <h5>KOT Printer</h5>
                    <div className="mode-toggle-group">
                      <button 
                        className={`mode-btn ${kotPrinterMode === 'bluetooth' ? 'active' : ''}`}
                        onClick={() => switchAndroidPrinterMode('kot', 'bluetooth')}
                      >
                        Bluetooth
                      </button>
                      <button 
                        className={`mode-btn ${kotPrinterMode === 'lan' ? 'active' : ''}`}
                        onClick={() => switchAndroidPrinterMode('kot', 'lan')}
                      >
                        LAN / Network
                      </button>
                    </div>
                  </div>
                </div>

                {kotPrinterMode === 'bluetooth' ? (
                  <>
                    <p className="status-text">
                      {androidKotPrinter.address ? (androidKotPrinter.name || androidKotPrinter.address) : 'No Bluetooth printer paired'}
                    </p>
                    <div className="android-action-row">
                      <button onClick={() => pairAndroidPrinter('kot')} className="btn-secondary">
                        <FaBluetooth /> Pair Printer
                      </button>
                      <button onClick={testKotPrinter} className="btn-outline">
                        <FaPlus /> Test Print
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="lan-input-section">
                    <div className="lan-input-row">
                      <input 
                        type="text" 
                        value={kotPrinterIp} 
                        onChange={(e) => setKotPrinterIp(e.target.value)} 
                        placeholder="Printer IP (e.g. 192.168.1.101)"
                        className="form-input"
                      />
                      <input 
                        type="number" 
                        value={kotPrinterPort} 
                        onChange={(e) => setKotPrinterPort(e.target.value)} 
                        placeholder="Port (9100)"
                        className="form-input port"
                      />
                    </div>
                    <div className="android-action-row">
                      <button onClick={() => saveAndroidLanSettings('kot')} className="btn-secondary">
                        Save LAN Config
                      </button>
                      <button onClick={testKotPrinter} className="btn-outline">
                        <FaPlus /> Test Print
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="action-row-end">
              <button onClick={forgetBtPrinter} className="btn-outline danger">
                <FaTrash /> Clear Stored Bluetooth Printers
              </button>
            </div>
          </div>
        )}

        {!androidOnly && activeSubTab === 'routing' && (
          <div className="form-card full">
             <div className="section-title">
                <FaRoute className="title-icon" />
                <div>
                  <h4>KOT Category Routing</h4>
                  <p>Divide kitchen tickets automatically based on food type.</p>
                </div>
             </div>

             <div className="routing-toggle-banner">
                <label className="checkbox-wrap large">
                  <input type="checkbox" checked={routingEnabled} onChange={(e) => setRoutingEnabled(e.target.checked)} />
                  <div className="check-info">
                    <strong>Enable Split Kitchen Routing</strong>
                    <span>Orders will be routed to specific printers by category</span>
                  </div>
                </label>
             </div>

             {routingEnabled && (
               <div className="routes-editor">
                  <div className="list-header" style={{marginBottom:'16px'}}>
                     <span className="group-lbl">Execution Routes</span>
                     <button onClick={addRoute} className="btn-secondary sm"><FaPlus /> Add Route</button>
                  </div>

                  {routes.map(r => (
                    <div key={r.id} className="route-card" style={{marginBottom:'16px'}}>
                       <div className="route-head">
                          <input value={r.label} onChange={e => updateRoute(r.id, { label: e.target.value })} className="route-name-input" placeholder="Route Name" />
                          <button onClick={() => deleteRoute(r.id)} className="btn-icon-del sm"><FaTrash /></button>
                       </div>
                       
                       <div className="route-config-grid">
                          <div className="selector-box">
                             <label className="sub-lbl">Categories</label>
                             <div className="tag-cloud">
                                {(categories.length ? categories : ['main']).map(c => (
                                  <div key={c} className={`route-tag ${r.categories.includes(c) ? 'active' : ''}`} onClick={() => toggleMultiSelect(c, r.categories, (next) => updateRoute(r.id, { categories: next }))}>
                                    {c}
                                  </div>
                                ))}
                             </div>
                          </div>

                          <div className="selector-box">
                             <label className="sub-lbl">Target Printers</label>
                             <div className="tag-cloud">
                                {allPrintersForRouting.map(p => (
                                  <div key={p} className={`route-tag blue ${r.printerNames.includes(p) ? 'active' : ''}`} onClick={() => toggleMultiSelect(p, r.printerNames, (next) => updateRoute(r.id, { printerNames: next }))}>
                                    {p}
                                  </div>
                                ))}
                                {(netPrinters || []).map(p => (
                                  <div key={p.id} className={`route-tag green ${r.netPrinterIds?.includes(p.id) ? 'active' : ''}`} onClick={() => toggleMultiSelect(p.id, r.netPrinterIds || [], (next) => updateRoute(r.id, { netPrinterIds: next }))}>
                                    {p.label || p.ip}
                                  </div>
                                ))}
                             </div>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>
             )}

             <div className="action-row-end" style={{marginTop:'12px'}}>
                <button onClick={() => { writeJson('PRINT_KOT_ROUTES_V1', routes); localStorage.setItem('PRINT_KOT_CATEGORY_ROUTING', routingEnabled ? '1' : '0'); setMsg('✓ Routing Map Saved'); }} className="btn-primary">Save Routing Map</button>
             </div>
          </div>
        )}

        {!androidOnly && activeSubTab === 'paper' && (
          <div className="form-card">
            <div className="section-title">
              <FaCog className="title-icon" />
              <div>
                <h4>Paper & Formatting</h4>
                <p>Adjust width, columns, and safety alignment.</p>
              </div>
            </div>

            <div className="paper-size-selector">
               <div className={`size-box ${paperMm === '58' ? 'active' : ''}`} onClick={() => { setPaperMm('58'); setCols('32'); }}>
                  <div className="size-label">58mm</div>
                  <div className="size-desc">32 Columns</div>
               </div>
               <div className={`size-box ${paperMm === '80' && cols === '48' ? 'active' : ''}`} onClick={() => { setPaperMm('80'); setCols('48'); }}>
                  <div className="size-label">80mm</div>
                  <div className="size-desc">48 Columns</div>
               </div>
               <div className={`size-box ${paperMm === '80' && cols === '42' ? 'active' : ''}`} onClick={() => { setPaperMm('80'); setCols('42'); }}>
                  <div className="size-label">80mm</div>
                  <div className="size-desc">42 Columns</div>
               </div>
            </div>

            <div className="divider" />

            <div className="margins-grid">
               <div className="input-group">
                  <label className="group-lbl">Guard Cols</label>
                  <input value={guardCols} onChange={e => setGuardCols(e.target.value.replace(/\D/g,''))} className="form-input" />
               </div>
               <div className="input-group">
                  <label className="group-lbl">Safe Cols</label>
                  <input value={safeCols} onChange={e => setSafeCols(e.target.value.replace(/\D/g,''))} className="form-input" />
               </div>
               <div className="input-group">
                  <label className="group-lbl">Left Margin</label>
                  <input value={leftDots} onChange={e => setLeftDots(e.target.value.replace(/\D/g,''))} className="form-input" />
               </div>
               <div className="input-group">
                  <label className="group-lbl">Right Margin</label>
                  <input value={rightDots} onChange={e => setRightDots(e.target.value.replace(/\D/g,''))} className="form-input" />
               </div>
            </div>

            <div className="action-row-end">
               <button onClick={persistPaperSettings} className="btn-primary">Save Formatting</button>
            </div>
          </div>
        )}

      </div>

      {msg && (
        <div className={`hw-toast ${msg.startsWith('✗') ? 'error' : 'success'}`}>
          {msg.startsWith('✗') ? <FaExclamationCircle /> : <FaCheckCircle />}
          <span>{msg}</span>
        </div>
      )}

      <style jsx>{`
        .hardware-container { width: 100%; display: flex; flex-direction: column; gap: 20px; font-family: 'Plus Jakarta Sans', sans-serif; }
        .hardware-nav { display: flex; gap: 8px; padding: 6px; background: #f1f5f9; border-radius: 12px; overflow-x: auto; scrollbar-width: none; }
        .hardware-nav::-webkit-scrollbar { display: none; }
        .nav-btn { flex: 1; min-width: max-content; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border: none; background: transparent; border-radius: 8px; font-size: 13.5px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; }
        .nav-btn.active { background: white; color: #f97316; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
        .form-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 24px; display: flex; flex-direction: column; gap: 24px; animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .section-title { display: flex; gap: 14px; align-items: flex-start; }
        .title-icon { font-size: 20px; color: #f97316; background: #fff7ed; padding: 10px; border-radius: 10px; flex-shrink: 0; }
        .section-title h4 { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; }
        .section-title p { margin: 3px 0 0; font-size: 13.5px; color: #64748b; font-weight: 500; }
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .group-lbl { font-size: 12.5px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; }
        .group-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .form-input { width: 100%; padding: 11px 14px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 14px; color: #0f172a; background: #fafbfc; transition: 0.2s; }
        .form-input:focus { outline: none; border-color: #f97316; background: white; }
        .form-input.port { width: 90px; }
        .url-input-wrap { display: flex; gap: 10px; }
        .printer-selector-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #f1f5f9; }
        @media (max-width: 640px) { .printer-selector-grid { grid-template-columns: 1fr; } }
        .printer-tags-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .printer-tag { padding: 6px 12px; background: white; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: #334155; cursor: pointer; transition: 0.2s; }
        .printer-tag.selected { background: #f97316; border-color: #f97316; color: white; box-shadow: 0 4px 8px rgba(249,115,22,0.2); }
        .btn-primary { background: #f97316; color: white; border: none; padding: 11px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13.5px; }
        .btn-primary.mini { padding: 8px 14px; font-size: 12.5px; }
        .btn-secondary { background: white; color: #334155; border: 1.5px solid #e2e8f0; padding: 10px 14px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; font-size: 12.5px; display: flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: #64748b; border: 1.5px solid #e2e8f0; padding: 10px 14px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 12.5px; flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-outline.danger { color: #ef4444; border-color: #fecaca; flex: initial; }
        .btn-icon-del { background: #fef2f2; border: none; color: #ef4444; width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; flex-shrink: 0;}
        .btn-icon-del:hover { background: #ef4444; color: white; }
        .android-printer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 720px) { .android-printer-grid { grid-template-columns: 1fr; } }
        .android-printer-panel { border: 1.5px solid #e2e8f0; background: #f8fafc; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
        .android-printer-head { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
        .android-printer-icon { color: #f97316; font-size: 18px; flex-shrink: 0; margin-top: 2px; }
        .android-printer-head h5 { margin: 0; color: #0f172a; font-size: 14px; font-weight: 800; }
        .android-printer-head p { margin: 4px 0 0; color: #64748b; font-size: 12.5px; font-weight: 600; word-break: break-word; }
        .android-action-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .routing-toggle-banner { background: #fffcf5; border: 1.5px solid #fde68a; padding: 14px; border-radius: 12px; }
        .checkbox-wrap { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .check-info { display: flex; flex-direction: column; }
        .check-info strong { font-size: 13.5px; color: #854d0e; }
        .check-info span { font-size: 11.5px; color: #a16207; }
        .route-card { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px; }
        .route-head { display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px; align-items: center;}
        .route-name-input { background: transparent; border: none; font-size: 14.5px; font-weight: 800; color: #0f172a; outline: none; flex: 1; }
        .route-config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 640px) { .route-config-grid { grid-template-columns: 1fr; } }
        .sub-lbl { display: block; font-size: 10.5px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
        .tag-cloud { display: flex; flex-wrap: wrap; gap: 5px; }
        .route-tag { padding: 5px 9px; background: white; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: #64748b; cursor: pointer; }
        .route-tag.active { background: #f97316; border-color: #f97316; color: white; }
        .route-tag.active.blue { background: #3b82f6; border-color: #3b82f6; }
        .route-tag.active.green { background: #10b981; border-color: #10b981; }
        .paper-size-selector { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .size-box { padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; text-align: center; cursor: pointer; transition: 0.2s; }
        .size-box.active { border-color: #f97316; background: #fff7ed; }
        .size-label { font-size: 14.5px; font-weight: 800; color: #0f172a; }
        .size-desc { font-size: 11px; color: #64748b; }
        .margins-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .download-hub-banner { background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px; border-radius: 10px; margin-top: 10px; }
        .download-hub-banner p { margin: 0 0 8px; font-size: 12px; color: #0369a1; font-weight: 500; }
        .btn-download { display: inline-flex; align-items: center; gap: 6px; background: #0369a1; color: white; padding: 7px 14px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 12px; }
        .hw-toast { position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%); background: #1e293b; color: white; padding: 10px 20px; border-radius: 99px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; z-index: 9999; box-shadow: 0 5px 15px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out; }
        .hw-toast.error { background: #dc2626; }
        @keyframes slideUp { from { bottom: 65px; opacity: 0; } to { bottom: 85px; opacity: 1; } }
        .mode-toggle-group { display: flex; gap: 4px; margin-top: 6px; background: #e2e8f0; padding: 3px; border-radius: 8px; }
        .mode-btn { border: none; background: transparent; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; color: #475569; cursor: pointer; transition: 0.15s; }
        .mode-btn.active { background: white; color: #f97316; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .status-text { font-size: 12.5px; color: #64748b; font-weight: 600; margin: 8px 0; word-break: break-word; }
        .lan-input-section { display: flex; flex-direction: column; gap: 10px; margin: 8px 0; }
        .lan-input-row { display: flex; gap: 8px; }
      `}</style>
    </div>
  );
}
