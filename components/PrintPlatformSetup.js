import { useCallback, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import {
  FaAndroid,
  FaCheckCircle,
  FaCircle,
  FaDownload,
  FaExclamationTriangle,
  FaNetworkWired,
  FaPlus,
  FaPrint,
  FaRoute,
  FaServer,
  FaSync,
  FaTrash,
  FaTimes,
} from 'react-icons/fa';
import { invalidatePrintTemplateCache } from '../utils/printTemplateSync';
import api from '../utils/api';
import {
  connectNativePrintService,
  enrollNativePrintService,
  getNativePrintConfiguration,
  getLocalPrintJobs,
  getPrintServiceLogs,
  getPrintServiceHealth,
  getPrintServicePrinters,
  hasPrintServiceLocalAccess,
  isNativePrintServicePaired,
  isPrintServiceSecureContext,
  resolveLocalPrintJob,
  retryLocalPrintJob,
  submitNativePrintJob,
  syncNativePrintConfiguration,
  updateNativePrintConfiguration,
  acceptNativeCloudConfiguration,
  forgetNativePrintService,
} from '../utils/printServiceClient';
import PrinterSetupCard from './PrinterSetupCard';
import { printUniversal } from '../utils/printGateway';
import NiceSelect from './NiceSelect';
import CafeQRPopup from './CafeQRPopup';

const newId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const SELECTED_TERMINAL_KEY = 'CAFEQR_PRINT_SELECTED_TERMINAL';
const PRODUCTION_APP_URL = 'https://app.cafeqr.in';

const DEFAULT_THERMAL_LAYOUT = {
  preset: '58MM',
  widthMm: 58,
  columns: 32,
  printableDots: 384,
  leftMargin: 0,
  rightMargin: 0,
  lineSpacing: 0,
  autoCut: true,
  feedLines: 3,
  showRestaurantName: true,
  showDailyBillNo: true,
  showCustomerDetails: true,
  showTableLabel: true,
  showFssai: true,
  leftMarginDots: 0,
  rightMarginDots: 0,
  guardCols: 0,
  safeCols: 0,
};

const DEFAULT_KOT_TEMPLATE = {
  ...DEFAULT_THERMAL_LAYOUT,
  showGstBreakdown: false,
  titleFontSize: 'NORMAL',
  fontSize: 'NORMAL',
  header: '*** KOT ***',
  footer: '*** SEND TO KITCHEN ***',
};

const DEFAULT_RECEIPT_TEMPLATE = {
  ...DEFAULT_THERMAL_LAYOUT,
  showGstBreakdown: true,
  titleFontSize: 'NORMAL',
  fontSize: 'NORMAL',
  header: '*** TAX INVOICE ***',
  footer: '* THANK YOU! VISIT AGAIN !! *',
};

const DEFAULT_THERMAL_TEMPLATE = {
  ...DEFAULT_THERMAL_LAYOUT,
  fontSize: DEFAULT_RECEIPT_TEMPLATE.fontSize,
  kotFontSize: DEFAULT_KOT_TEMPLATE.fontSize,
  titleFontSize: DEFAULT_RECEIPT_TEMPLATE.titleFontSize,
  kotTitleFontSize: DEFAULT_KOT_TEMPLATE.titleFontSize,
  showGstBreakdown: true,
  kotHeader: DEFAULT_KOT_TEMPLATE.header,
  kotFooter: DEFAULT_KOT_TEMPLATE.footer,
  receiptHeader: DEFAULT_RECEIPT_TEMPLATE.header,
  receiptFooter: DEFAULT_RECEIPT_TEMPLATE.footer,
};

const FONT_SIZE_OPTIONS = [
  { value: 'NORMAL', label: 'Normal (1x)' },
  { value: 'DOUBLE_HEIGHT', label: 'Double Height (2H)' },
  { value: 'DOUBLE_WIDTH', label: 'Double Width (2W)' },
  { value: 'DOUBLE', label: 'Double (2x)' },
];

const THERMAL_PAPER_PRESETS = [
  { preset: '58MM', label: '2 inch / 58 mm', widthMm: 58, columns: 32, printableDots: 384 },
  { preset: '80MM', label: '3 inch / 80 mm', widthMm: 80, columns: 48, printableDots: 576 },
  { preset: '4IN', label: '4 inch', widthMm: 101.6, columns: 64, printableDots: 832 },
];

const DEFAULT_CONFIG = {
  profiles: [],
  routes: [],
  defaults: {
    billOutput: 'THERMAL',
    kotOutput: 'THERMAL',
    invoiceOutput: 'REGULAR',
    billProfileIds: [],
    kotProfileIds: [],
    invoiceProfileIds: [],
    billMode: 'MIRROR',
    kotMode: 'MIRROR',
    invoiceMode: 'MIRROR',
  },
  kotTemplate: DEFAULT_KOT_TEMPLATE,
  receiptTemplate: DEFAULT_RECEIPT_TEMPLATE,
  thermalTemplate: DEFAULT_THERMAL_TEMPLATE,
  regularTemplate: {
    paperPreset: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'PORTRAIT',
    marginMm: 10,
    paperSource: '',
    scaling: 100,
    colorMode: 'GRAYSCALE',
    showLogo: true,
    showCustomer: true,
    showTax: true,
    showHsnSac: true,
    showUnits: true,
    showDiscounts: true,
    showPayment: true,
    showAmountInWords: true,
    showTerms: true,
    showFooter: true,
    showSignature: true,
    terms: '',
    footer: 'Thank you for your business.',
  },
};

const deepMerge = (base, incoming) => {
  if (!incoming || typeof incoming !== 'object') return base;
  const out = { ...base };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(base?.[key] || {}, value);
    } else {
      out[key] = value;
    }
  });
  return out;
};

const mergeKotTemplate = (template) => {
  const source = template || {};
  return {
    ...DEFAULT_KOT_TEMPLATE,
    ...source,
    titleFontSize: source.titleFontSize ?? source.kotTitleFontSize ?? DEFAULT_KOT_TEMPLATE.titleFontSize,
    fontSize: source.fontSize ?? source.kotFontSize ?? DEFAULT_KOT_TEMPLATE.fontSize,
    header: source.header ?? source.kotHeader ?? DEFAULT_KOT_TEMPLATE.header,
    footer: source.footer ?? source.kotFooter ?? DEFAULT_KOT_TEMPLATE.footer,
  };
};

const mergeReceiptTemplate = (template) => {
  const source = template || {};
  return {
    ...DEFAULT_RECEIPT_TEMPLATE,
    ...source,
    titleFontSize: source.titleFontSize ?? DEFAULT_RECEIPT_TEMPLATE.titleFontSize,
    fontSize: source.fontSize ?? DEFAULT_RECEIPT_TEMPLATE.fontSize,
    header: source.header ?? source.receiptHeader ?? DEFAULT_RECEIPT_TEMPLATE.header,
    footer: source.footer ?? source.receiptFooter ?? DEFAULT_RECEIPT_TEMPLATE.footer,
  };
};

const syncThermalTemplateToLocalStorage = (documentKey, template) => {
  const prefix = documentKey === 'KOT' ? 'PRINT_KOT_' : 'PRINT_RECEIPT_';
  localStorage.setItem(`${prefix}PAPER_MM`, String(template.widthMm || '58'));
  localStorage.setItem(`${prefix}WIDTH_COLS`, String(template.columns || 32));
  localStorage.setItem(`${prefix}PRINTABLE_DOTS`, String(template.printableDots || 384));
  localStorage.setItem(`${prefix}LEFT_MARGIN_DOTS`, String(template.leftMarginDots ?? 0));
  localStorage.setItem(`${prefix}RIGHT_MARGIN_DOTS`, String(template.rightMarginDots ?? 0));
  localStorage.setItem(`${prefix}GUARD_COLS`, String(template.guardCols ?? 0));
  localStorage.setItem(`${prefix}SAFE_COLS`, String(template.safeCols ?? 0));
  localStorage.setItem(`${prefix}FEED_LINES`, String(template.feedLines ?? 3));
  localStorage.setItem(`${prefix}AUTO_CUT`, template.autoCut !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_RESTAURANT_NAME`, template.showRestaurantName !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_DAILY_BILL_NO`, template.showDailyBillNo !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_CUSTOMER_DETAILS`, template.showCustomerDetails !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_TABLE_LABEL`, template.showTableLabel !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_FSSAI`, template.showFssai !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_GST_BREAKDOWN`, template.showGstBreakdown !== false ? '1' : '0');
  localStorage.setItem(`${prefix}TITLE_FONT_SIZE`, template.titleFontSize || 'DOUBLE');
  localStorage.setItem(`${prefix}FONT_SIZE`, template.fontSize || 'NORMAL');
};

const profileDefaults = (format = 'THERMAL') => ({
  id: newId('printer'),
  name: format === 'REGULAR' ? 'Regular Invoice Printer' : 'Thermal Printer',
  connectionType: 'WINDOWS_QUEUE',
  format,
  windowsPrinterName: '',
  host: '',
  port: 9100,
  comPort: '',
  baudRate: 9600,
  paperPreset: format === 'REGULAR' ? 'A4' : '58MM',
  widthMm: format === 'REGULAR' ? 210 : 58,
  heightMm: format === 'REGULAR' ? 297 : 0,
  columns: format === 'REGULAR' ? 0 : 32,
  printableDots: format === 'REGULAR' ? 0 : 384,
  orientation: 'PORTRAIT',
  copies: 1,
  autoCut: format === 'THERMAL',
  feedLines: format === 'THERMAL' ? 3 : 0,
  enabled: true,
  documents: format === 'REGULAR' ? ['BILL', 'INVOICE', 'KOT'] : ['BILL', 'INVOICE', 'KOT'],
  templateOverrides: {},
});

const routeDefaults = () => ({
  id: newId('route'),
  name: 'Kitchen Route',
  enabled: true,
  priority: 100,
  mode: 'FAILOVER',
  copies: 1,
  documentTypes: ['KOT'],
  categories: [],
  orderTypes: [],
  profileIds: [],
});

const syncPrintConfigToLocalStorage = (config) => {
  if (typeof window === 'undefined' || !config) return;

  // 1. Basic flags
  localStorage.setItem('PRINTER_MODE', 'winspool');
  localStorage.setItem('PRINTER_READY', '1');
  localStorage.setItem('PRINT_WIN_URL', 'http://127.0.0.1:3333/printRaw');
  localStorage.setItem('PRINT_WIN_LIST_URL', 'http://127.0.0.1:3333/printers');

  const profiles = Array.isArray(config.profiles) ? config.profiles : [];
  const defaults = config.defaults || {};

  // Helper to find windowsPrinterName by profile ID
  const getPrinterName = (profileId) => {
    const profile = profiles.find((p) => p.id === profileId);
    return profile?.connectionType === 'WINDOWS_QUEUE' ? (profile.windowsPrinterName || '') : '';
  };

  // Helper to get active profiles of connectionType WINDOWS_QUEUE for a document type
  const getPrinterNamesForDoc = (profileIds) => {
    return (Array.isArray(profileIds) ? profileIds : [])
      .map(getPrinterName)
      .filter(Boolean);
  };

  // 2. Map default bill, KOT, and invoice printer names
  let billPrinters = getPrinterNamesForDoc(defaults.billProfileIds);
  let kotPrinters = getPrinterNamesForDoc(defaults.kotProfileIds);

  // ✅ FIX: If no explicit assignment, fall back to all thermal WINDOWS_QUEUE profiles
  const allWindowsThermal = profiles
    .filter((p) => p.connectionType === 'WINDOWS_QUEUE' && p.windowsPrinterName)
    .map((p) => p.windowsPrinterName);

  if (!billPrinters.length) billPrinters = allWindowsThermal;
  if (!kotPrinters.length) kotPrinters = allWindowsThermal;

  localStorage.setItem('PRINT_WIN_PRINTER_NAMES_BILL', JSON.stringify(billPrinters));
  localStorage.setItem('PRINT_WIN_PRINTER_NAMES_KOT', JSON.stringify(kotPrinters));
  localStorage.setItem('PRINT_WIN_PRINTER_NAME', billPrinters[0] || '');
  localStorage.setItem('PRINT_WIN_PRINTER_NAME_KOT', kotPrinters[0] || '');

  // 3. Map Routing
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const legacyRoutes = routes.map((r) => {
    const printerNames = (Array.isArray(r.profileIds) ? r.profileIds : [])
      .map(getPrinterName)
      .filter(Boolean);
    return {
      id: r.id || Math.random().toString(16).slice(2),
      label: r.name || 'Route',
      enabled: r.enabled !== false,
      categories: Array.isArray(r.categories) ? r.categories : [],
      printerNames: printerNames,
      netPrinterIds: [],
    };
  });

  const routingEnabled = legacyRoutes.some(r => r.enabled && r.categories.length > 0 && r.printerNames.length > 0);
  localStorage.setItem('PRINT_KOT_CATEGORY_ROUTING', routingEnabled ? '1' : '0');
  localStorage.setItem('PRINT_KOT_ROUTES_V1', JSON.stringify(legacyRoutes));

  // 4. Map paper settings
  const thermalProfile = profiles.find(p => p.format === 'THERMAL') || {};
  const paperMm = thermalProfile.paperPreset === '58MM' ? '58' : '80';
  const cols = thermalProfile.columns || (paperMm === '58' ? '32' : '48');

  localStorage.setItem('PRINT_PAPER_MM', String(paperMm));
  localStorage.setItem('PRINT_WIDTH_COLS', String(cols));

  const kotTemplate = mergeKotTemplate(config.kotTemplate || config.thermalTemplate);
  const receiptTemplate = mergeReceiptTemplate(config.receiptTemplate || config.thermalTemplate);

  syncThermalTemplateToLocalStorage('KOT', kotTemplate);
  syncThermalTemplateToLocalStorage('RECEIPT', receiptTemplate);

  localStorage.setItem('PRINT_FONT_SIZE', receiptTemplate.fontSize || 'NORMAL');
  localStorage.setItem('PRINT_KOT_FONT_SIZE', kotTemplate.fontSize || 'NORMAL');
  localStorage.setItem('PRINT_TITLE_FONT_SIZE', receiptTemplate.titleFontSize || 'DOUBLE');
  localStorage.setItem('PRINT_KOT_TITLE_FONT_SIZE', kotTemplate.titleFontSize || 'DOUBLE');

  localStorage.setItem('PRINT_SHOW_RESTAURANT_NAME', receiptTemplate.showRestaurantName !== false ? '1' : '0');
  localStorage.setItem('PRINT_SHOW_DAILY_BILL_NO', receiptTemplate.showDailyBillNo !== false ? '1' : '0');
  localStorage.setItem('PRINT_SHOW_CUSTOMER_DETAILS', receiptTemplate.showCustomerDetails !== false ? '1' : '0');
  localStorage.setItem('PRINT_SHOW_TABLE_LABEL', receiptTemplate.showTableLabel !== false ? '1' : '0');
  localStorage.setItem('PRINT_SHOW_FSSAI', receiptTemplate.showFssai !== false ? '1' : '0');
  localStorage.setItem('PRINT_SHOW_GST_BREAKDOWN', receiptTemplate.showGstBreakdown !== false ? '1' : '0');

  // Set margins and column formatting defaults
  localStorage.setItem('PRINT_KOT_HEADER', kotTemplate.header ?? '*** KOT ***');
  localStorage.setItem('PRINT_KOT_FOOTER', kotTemplate.footer ?? '*** SEND TO KITCHEN ***');
  localStorage.setItem('PRINT_RECEIPT_HEADER', receiptTemplate.header ?? '*** TAX INVOICE ***');
  localStorage.setItem('PRINT_RECEIPT_FOOTER', receiptTemplate.footer ?? '* THANK YOU! VISIT AGAIN !! *');

  localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', String(receiptTemplate.leftMarginDots ?? 0));
  localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', String(receiptTemplate.rightMarginDots ?? 0));
  localStorage.setItem('PRINT_GUARD_COLS', String(receiptTemplate.guardCols ?? 0));
  localStorage.setItem('PRINT_SAFE_COLS', String(receiptTemplate.safeCols ?? 0));

  console.log('[print-sync] Local storage synced for loopback mode:', {
    billPrinters,
    kotPrinters,
    routingEnabled,
    legacyRoutes
  });
};

const getMissingPrinterWarnings = (config) => {
  const profileMap = new Map((config.profiles || []).map((p) => [p.id, p]));
  const warnings = {};
  DOCUMENT_DEFAULTS.forEach(({ type, profileKey }) => {
    const ids = config.defaults?.[profileKey] || [];
    const missing = ids.filter((id) => {
      const profile = profileMap.get(id);
      if (!profile) return false;
      if (profile.connectionType === 'WINDOWS_QUEUE') return !profile.windowsPrinterName;
      if (profile.connectionType === 'NETWORK') return !profile.host;
      if (profile.connectionType === 'BLUETOOTH_COM') return !profile.comPort;
      return false;
    });
    if (missing.length) warnings[type] = missing.map((id) => profileMap.get(id)?.name || id);
  });
  return warnings;
};

const DOCUMENT_DEFAULTS = [
  {
    type: 'KOT',
    title: 'KOT printers',
    description: 'Kitchen tickets print to every selected profile.',
    profileKey: 'kotProfileIds',
    outputKey: 'kotOutput',
    modeKey: 'kotMode',
  },
  {
    type: 'BILL',
    title: 'Bill printers',
    description: 'Receipts and customer bills print to every selected profile.',
    profileKey: 'billProfileIds',
    outputKey: 'billOutput',
    modeKey: 'billMode',
  },
  {
    type: 'INVOICE',
    title: 'Invoice printers',
    description: 'Tax invoices print independently from customer bills.',
    profileKey: 'invoiceProfileIds',
    outputKey: 'invoiceOutput',
    modeKey: 'invoiceMode',
  },
];

const profileDestination = (profile) => {
  if (profile.connectionType === 'NETWORK') return `${profile.host || 'No host'}:${profile.port || 9100}`;
  if (profile.connectionType === 'BLUETOOTH_COM') return profile.comPort || 'No COM port';
  return profile.windowsPrinterName || 'No Windows queue selected';
};

const profileTransportLabel = (profile) => {
  if (profile.connectionType === 'NETWORK') return 'Direct network';
  if (profile.connectionType === 'BLUETOOTH_COM') return 'Bluetooth COM';
  return 'Windows queue';
};

const profileSupportsDocument = (profile, documentType) => {
  const documents = Array.isArray(profile?.documents) ? profile.documents : [];
  return documents.length === 0 || documents.includes(documentType);
};

const profileDisplayLabel = (profile) => (
  `${profile.name} - ${profileDestination(profile)} (${profileTransportLabel(profile)}, ${profile.paperPreset || profile.format})`
);

const sanitizeConfiguration = (configuration) => {
  const profileMap = new Map((configuration.profiles || []).map((profile) => [profile.id, profile]));
  const defaults = { ...DEFAULT_CONFIG.defaults, ...(configuration.defaults || {}) };

  DOCUMENT_DEFAULTS.forEach(({ type, profileKey, modeKey }) => {
    defaults[profileKey] = (defaults[profileKey] || []).filter((profileId) => {
      const profile = profileMap.get(profileId);
      return profile?.enabled !== false && profileSupportsDocument(profile, type);
    });
    defaults[modeKey] = 'MIRROR';
  });

  return {
    ...configuration,
    defaults,
    routes: (configuration.routes || []).map((route) => ({
      ...route,
      profileIds: (route.profileIds || []).filter((profileId) => profileMap.has(profileId)),
    })),
  };
};

const assignmentValidationError = (configuration) => {
  const profileMap = new Map((configuration.profiles || []).map((profile) => [profile.id, profile]));
  for (const { type, title, profileKey } of DOCUMENT_DEFAULTS) {
    for (const profileId of configuration.defaults?.[profileKey] || []) {
      const profile = profileMap.get(profileId);
      if (!profile) return `${title} reference a printer profile that no longer exists.`;
      if (profile.enabled === false) return `${profile.name} is disabled and cannot be assigned to ${title}.`;
      if (!profileSupportsDocument(profile, type)) {
        return `${profile.name} does not support ${type}. Enable ${type} on that profile first.`;
      }
    }
  }
  return '';
};

const hasPrinterProfiles = (configuration) => (
  Array.isArray(configuration?.profiles) && configuration.profiles.length > 0
);

const cloudRevisionOf = (configuration) => Number(
  configuration?._meta?.terminalRevision || 0
);

export default function PrintPlatformSetup({ restaurantId, config: legacyConfig, onConfigChange }) {
  const [tab, setTab] = useState('service');
  const [printConfig, setPrintConfig] = useState(DEFAULT_CONFIG);
  const [, setLocalConfiguration] = useState(null);
  const [cloudConfiguration, setCloudConfiguration] = useState(null);
  const [health, setHealth] = useState(null);
  const [localPrinters, setLocalPrinters] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [stations, setStations] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [scopeType, setScopeType] = useState('TERMINAL');
  const [scopeId, setScopeId] = useState(() => (
    typeof window !== 'undefined'
      ? window.localStorage.getItem(SELECTED_TERMINAL_KEY) || Cookies.get('terminalId') || ''
      : Cookies.get('terminalId') || ''
  ));
  const [stationName, setStationName] = useState(`${Cookies.get('terminalName') || 'POS'} Print Station`);
  const [fallback, setFallback] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [secureContext, setSecureContext] = useState(null);
  const [localAccessState, setLocalAccessState] = useState('IDLE');
  const [localAccessError, setLocalAccessError] = useState('');
  const [serviceTerminalSynced, setServiceTerminalSynced] = useState(false);
  const [localTokenInvalid, setLocalTokenInvalid] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  });

  const showConfirm = (title, message, onConfirm, options = {}) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
    });
  };

  const closeConfirm = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const currentOrgId = Cookies.get('orgId') || '';
  const currentClientId = Cookies.get('clientId') || '';
  const apiRoot = useMemo(
    () => String(api.defaults.baseURL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/api\/?$/i, ''),
    []
  );

  const showMessage = (value) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 4500);
  };

  const selectTerminal = useCallback((terminalId) => {
    setScopeId(terminalId || '');
    if (typeof window !== 'undefined') {
      if (terminalId) window.localStorage.setItem(SELECTED_TERMINAL_KEY, terminalId);
      else window.localStorage.removeItem(SELECTED_TERMINAL_KEY);
    }
  }, []);

  const refreshService = useCallback(async ({ interactive = false } = {}) => {
    if (!isPrintServiceSecureContext()) {
      setLocalAccessState('INSECURE');
      setLocalAccessError('HTTPS is required for Windows printing.');
      setHealth(null);
      return { health: null, configuration: null };
    }
    if (!interactive && !hasPrintServiceLocalAccess()) {
      setLocalAccessState('IDLE');
      return { health: null, configuration: null };
    }
    if (interactive) setLocalAccessState('CONNECTING');
    try {
      const result = interactive
        ? await connectNativePrintService()
        : await getPrintServiceHealth();
      setHealth(result);
      setLocalAccessState('CONNECTED');
      setLocalAccessError('');
      if (result?.terminalId && !serviceTerminalSynced) {
        const isValid = terminals.length === 0 || terminals.some(t => t.id === result.terminalId);
        if (isValid) {
          selectTerminal(result.terminalId);
          setServiceTerminalSynced(true);
        }
      }

      let isTokenInvalid = false;
      const handleLocalError = (err) => {
        if (err?.status === 401 || err?.code === 'LOCAL_AUTH_REQUIRED') {
          isTokenInvalid = true;
        }
        return null;
      };

      const [printers, configuration] = await Promise.all([
        getPrintServicePrinters().catch(() => []),
        isNativePrintServicePaired()
          ? getNativePrintConfiguration().catch(handleLocalError)
          : Promise.resolve(null),
      ]);
      setLocalPrinters(Array.isArray(printers) ? printers : []);
      if (configuration) setLocalConfiguration(configuration);
      if (isNativePrintServicePaired()) {
        const rows = await getLocalPrintJobs().catch(handleLocalError);
        setJobs(Array.isArray(rows) ? rows : []);
      }
      setLocalTokenInvalid(isTokenInvalid);
      return { health: result, configuration };
    } catch (error) {
      setHealth(null);
      setLocalPrinters([]);
      setLocalAccessState(interactive ? 'DENIED' : 'UNAVAILABLE');
      setLocalAccessError(
        interactive
          ? 'Chrome or Edge could not reach the local Print Service. Allow Local network access in this site\'s permissions, confirm the Windows service is running, then retry.'
          : 'The local Print Service is temporarily unavailable.'
      );
      return { health: null, configuration: null, error };
    }
  }, [selectTerminal, serviceTerminalSynced, terminals]);

  const loadCloud = useCallback(async (localState = null) => {
    const terminalId = localState?.health?.terminalId
      || scopeId
      || Cookies.get('terminalId')
      || '';
    const requests = [
      api.get('/api/v1/print-configurations/effective', {
        params: { terminalId: terminalId || undefined, orgId: currentOrgId || undefined },
      }).catch((error) => ({ error })),
      api.get('/api/v1/print-stations').catch(() => ({ data: { data: [] } })),
      api.get('/api/v1/terminals').catch(() => ({ data: { data: [] } })),
      api.get('/api/v1/products/categories').catch(() => ({ data: { data: [] } })),
    ];
    const [configuration, stationRows, terminalRows, categoryRows] = await Promise.all(requests);

    let cloudSettings = configuration.error ? null : (configuration.data?.data || {});
    let finalConfiguration = configuration;

    if (configuration.error && terminalId) {
      if (configuration.error.response?.status === 400 || String(configuration.error.message).includes('Terminal not found')) {
        selectTerminal('');
        try {
          const fallbackConfig = await api.get('/api/v1/print-configurations/effective', {
            params: { orgId: currentOrgId || undefined },
          });
          cloudSettings = fallbackConfig.data?.data || {};
          finalConfiguration = fallbackConfig;
        } catch (fallbackError) {
          finalConfiguration = { error: fallbackError };
        }
      }
    }

    const localSnapshot = localState?.configuration || null;
    const localSettings = localSnapshot?.configuration || null;
    const localWins = Boolean(
      localSettings
      && (localSnapshot?.dirty
        || (hasPrinterProfiles(localSettings) && !hasPrinterProfiles(cloudSettings)))
    );

    if (cloudSettings) setCloudConfiguration(cloudSettings);
    if (localWins) {
      const config = sanitizeConfiguration(deepMerge(DEFAULT_CONFIG, localSettings));
      setPrintConfig(config);
      if (!isNativePrintServicePaired()) {
        syncPrintConfigToLocalStorage(config);
      }
    } else if (cloudSettings) {
      const effective = sanitizeConfiguration(deepMerge(DEFAULT_CONFIG, cloudSettings));
      setPrintConfig(effective);
      if (localSnapshot && isNativePrintServicePaired()) {
        acceptNativeCloudConfiguration(effective, cloudRevisionOf(cloudSettings))
          .then(setLocalConfiguration)
          .catch(() => { });
      } else if (!isNativePrintServicePaired()) {
        syncPrintConfigToLocalStorage(effective);
      }
    } else if (localSettings) {
      const config = sanitizeConfiguration(deepMerge(DEFAULT_CONFIG, localSettings));
      setPrintConfig(config);
      if (!isNativePrintServicePaired()) {
        syncPrintConfigToLocalStorage(config);
      }
    } else if (finalConfiguration.error) {
      throw finalConfiguration.error;
    } else {
      // No cloud, no local, no error — fresh machine.
      // Set PRINTER_MODE and PRINT_WIN_URL so the gateway doesn't throw
      // PRINT_HUB_UNREACHABLE before any profile is saved.
      if (!isNativePrintServicePaired()) {
        syncPrintConfigToLocalStorage(DEFAULT_CONFIG);
      }
    }

    setStations((prev) => {
      const next = stationRows.data?.data || [];
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    setTerminals((prev) => {
      const next = terminalRows.data?.data || [];
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    setCategories((prev) => {
      const next = (categoryRows.data?.data || []).map((row) => row?.name).filter(Boolean);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });

    const availableTerminals = terminalRows.data?.data || [];
    if (scopeId && availableTerminals.length > 0) {
      const exists = availableTerminals.some((t) => t.id === scopeId);
      if (!exists) {
        selectTerminal('');
      }
    }
  }, [currentOrgId, scopeId, selectTerminal]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const secure = isPrintServiceSecureContext();
      setSecureContext(secure);
      const canAutoConnect = secure && hasPrintServiceLocalAccess();
      if (!secure) setLocalAccessState('INSECURE');
      const localState = canAutoConnect
        ? await refreshService()
        : { health: null, configuration: null };
      if (!mounted) return;
      await loadCloud(localState);
    })().catch((error) => showMessage(error?.response?.data?.message || error.message));
    return () => {
      mounted = false;
    };
  }, [loadCloud, refreshService]);

  useEffect(() => {
    if (localAccessState !== 'CONNECTED') {
      setServiceTerminalSynced(false);
    }
  }, [localAccessState]);

  useEffect(() => {
    if (localAccessState !== 'CONNECTED') return undefined;
    const timer = window.setInterval(() => refreshService(), 10000);
    return () => window.clearInterval(timer);
  }, [localAccessState, refreshService]);

  const connectPrintService = async () => {
    setBusy(true);
    try {
      const localState = await refreshService({ interactive: true });
      if (!localState.health) return;
      await loadCloud(localState);
      showMessage('Windows Print Service connected. You can now pair this browser or print locally.');
    } finally {
      setBusy(false);
    }
  };

  const sessionAwareMessage = (error, fallback) => {
    if ([401, 403].includes(error?.response?.status)) {
      return 'Your login session has expired or cannot edit this configuration. Sign in again, then retry.';
    }
    return error?.response?.data?.message || error.message || fallback;
  };

  const persistConfiguration = async (candidate = printConfig) => {
    const validationError = assignmentValidationError(candidate);
    if (validationError) throw new Error(validationError);

    let settings = sanitizeConfiguration(candidate);
    if (scopeType === 'TERMINAL') {
      const { kotTemplate, receiptTemplate, thermalTemplate, regularTemplate, ...rest } = settings;
      settings = rest;
    }
    const resolvedScopeId = scopeType === 'CLIENT'
      ? null
      : scopeType === 'ORGANIZATION'
        ? currentOrgId
        : (scopeId || Cookies.get('terminalId'));
    if (scopeType === 'TERMINAL' && !resolvedScopeId) {
      throw new Error('Select the terminal that owns this printing configuration.');
    }

    if (scopeType === 'TERMINAL' && isNativePrintServicePaired()) {
      const localSaved = await updateNativePrintConfiguration(settings);
      setLocalConfiguration(localSaved);
      setPrintConfig(settings);
      try {
        const synchronized = await syncNativePrintConfiguration();
        setLocalConfiguration(synchronized);
        return { effective: settings, cloudSynced: true };
      } catch (cloudError) {
        return { effective: settings, cloudSynced: false, cloudError };
      }
    }

    const { data } = await api.put('/api/v1/print-configurations', {
      scopeType,
      scopeId: resolvedScopeId || null,
      orgId: currentOrgId || null,
      settings,
    });
    // Merge: DEFAULT_CONFIG base → local settings (has profiles) → server response (has updated defaults)
    // This ensures profiles are never lost when the server doesn't echo them back
    const serverData = data?.data || {};
    const merged = deepMerge(DEFAULT_CONFIG, deepMerge(settings, serverData));
    const effective = sanitizeConfiguration(merged);
    setPrintConfig(effective);
    return { effective, cloudSynced: true };
  }

  const saveConfiguration = async () => {
    setBusy(true);
    try {
      const result = await persistConfiguration();
      showMessage(result.cloudSynced
        ? 'Printing configuration saved locally and synchronized.'
        : `${result.cloudError?.message || 'Cloud synchronization is pending.'} Printing continues locally.`);
      if (!isNativePrintServicePaired() && result.effective) {
        // Merge current printConfig (has profiles) with effective (has saved defaults)
        // to ensure localStorage always gets complete data with both profiles and profileIds
        const toSync = sanitizeConfiguration(deepMerge(printConfig, result.effective));
        syncPrintConfigToLocalStorage(toSync);
      }
      invalidatePrintTemplateCache();
      await refreshService();
    } catch (error) {
      showMessage(sessionAwareMessage(error, 'Unable to save printing configuration.'));
    } finally {
      setBusy(false);
    }
  };

  const createEnrollment = async () => {
    if (!scopeId) {
      showMessage('Select the terminal that owns this print station.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/api/v1/print-stations/enrollment', {
        terminalId: scopeId,
        name: stationName,
        fallbackForBranch: fallback,
      });
      setPairingCode(data?.data?.pairingCode || '');
      setStations((previous) => [data?.data, ...previous.filter((row) => row.id !== data?.data?.id)]);
      showMessage('Pairing code created. It expires in 10 minutes.');
    } catch (error) {
      showMessage(error?.response?.data?.message || error.message);
    } finally {
      setBusy(false);
    }
  };

  const pairThisComputer = async () => {
    if (!pairingCode) {
      showMessage('Create or enter a pairing code first.');
      return;
    }
    setBusy(true);
    try {
      await enrollNativePrintService(apiRoot, pairingCode);
      setLocalTokenInvalid(false);
      const localState = await refreshService();
      await loadCloud(localState);
      showMessage('This Windows computer is now paired to the selected terminal.');
    } catch (error) {
      showMessage(error.message || 'Unable to pair the Windows print service.');
    } finally {
      setBusy(false);
    }
  };

  const addProfile = (format) => {
    setPrintConfig((previous) => ({
      ...previous,
      profiles: [...previous.profiles, profileDefaults(format)],
    }));
  };

  const updateProfile = (id, changes) => {
    setPrintConfig((previous) => sanitizeConfiguration({
      ...previous,
      profiles: previous.profiles.map((profile) => profile.id === id ? { ...profile, ...changes } : profile),
    }));
  };

  const updateProfileTemplateOverride = (id, documentKey, changes) => {
    setPrintConfig((previous) => sanitizeConfiguration({
      ...previous,
      profiles: previous.profiles.map((profile) => {
        if (profile.id !== id) return profile;
        const currentOverrides = profile.templateOverrides || {};
        return {
          ...profile,
          templateOverrides: {
            ...currentOverrides,
            [documentKey]: {
              ...(currentOverrides[documentKey] || {}),
              ...changes,
            },
          },
        };
      }),
    }));
  };

  const deleteProfile = (id) => {
    setPrintConfig((previous) => sanitizeConfiguration({
      ...previous,
      profiles: previous.profiles.filter((profile) => profile.id !== id),
      routes: previous.routes.map((route) => ({
        ...route,
        profileIds: route.profileIds.filter((profileId) => profileId !== id),
      })),
    }));
  };

  const addRoute = () => setPrintConfig((previous) => ({
    ...previous,
    routes: [...previous.routes, routeDefaults()],
  }));

  const updateRoute = (id, changes) => setPrintConfig((previous) => ({
    ...previous,
    routes: previous.routes.map((route) => route.id === id ? { ...route, ...changes } : route),
  }));

  const routeConflicts = useMemo(() => {
    const seen = new Map();
    const conflicts = new Set();
    printConfig.routes.filter((route) => route.enabled).forEach((route) => {
      const key = JSON.stringify({
        priority: Number(route.priority || 0),
        documents: [...route.documentTypes].sort(),
        categories: [...route.categories].sort(),
        orderTypes: [...route.orderTypes].sort(),
      });
      if (seen.has(key)) {
        conflicts.add(route.id);
        conflicts.add(seen.get(key));
      } else {
        seen.set(key, route.id);
      }
    });
    return conflicts;
  }, [printConfig.routes]);

  const testProfile = async (profile) => {
    setBusy(true);
    try {
      const saveResult = await persistConfiguration();

      if (!isNativePrintServicePaired() && saveResult.effective) {
        const toSync = sanitizeConfiguration(deepMerge(printConfig, saveResult.effective));
        syncPrintConfigToLocalStorage(toSync);
      }

      if (isNativePrintServicePaired()) {
        await submitNativePrintJob({
          idempotencyKey: `test:${profile.id}:${Date.now()}`,
          jobKind: 'test',
          outputFormat: profile.format,
          printerProfileId: profile.id,
          text: `CafeQR ${profile.format === 'REGULAR' ? 'Regular' : 'Thermal'} Test Print\n${profile.name}\n${new Date().toLocaleString()}`,
          document: {
            restaurant: { restaurantName: Cookies.get('orgName') || Cookies.get('clientName') || 'CafeQR' },
            orderNo: 'TEST',
            invoiceNo: 'TEST',
            orderType: 'TEST',
            orderDate: new Date().toISOString(),
            lines: [{ productName: 'Printer alignment test', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 }],
            grandTotal: 0,
          },
        });
        showMessage(saveResult.cloudSynced
          ? `Saved and queued a test print for ${profileDisplayLabel(profile)}.`
          : `Test print queued locally. Cloud synchronization remains pending.`);
      } else {
        // Unpaired / Direct Loopback Mode
        await printUniversal({
          text: `CafeQR ${profile.format === 'REGULAR' ? 'Regular' : 'Thermal'} Test Print\n${profile.name}\n${new Date().toLocaleString()}\n\n\n\n\n`,
          jobKind: 'bill',
          winPrinterNames: [profile.windowsPrinterName],
          outputFormat: profile.format,
        });
        showMessage(`Saved and sent test print directly to ${profile.windowsPrinterName || 'local printer'}.`);
      }
      await refreshService();
    } catch (error) {
      showMessage(sessionAwareMessage(error, 'Unable to save and submit the test print.'));
    } finally {
      setBusy(false);
    }
  };

  const testDocType = async (profile, kind) => {
    setBusy(true);
    try {
      console.log(`[print-test] Starting test print of type "${kind}" for printer profile:`, profile);
      const saveResult = await persistConfiguration();

      if (!isNativePrintServicePaired() && saveResult.effective) {
        console.log('[print-test] Syncing configuration to local storage...');
        const toSync = sanitizeConfiguration(deepMerge(printConfig, saveResult.effective));
        syncPrintConfigToLocalStorage(toSync);
      }

      const text = kind === 'KOT'
        ? `--- TEST KOT ---\nTerminal: 1\nDate: ${new Date().toLocaleString()}\n----------------\nQty  Item\n1    Paneer Butter Masala\n2    Butter Naan\n----------------\n\n\n\n\n`
        : `--- TEST BILL ---\nCafeQR Restaurant\nDate: ${new Date().toLocaleString()}\n----------------\nQty  Item              Price\n1    Paneer Masala    180.00\n2    Butter Naan       80.00\n----------------\nTotal:                260.00\nGST 5%:                13.00\nGrand Total:          273.00\n----------------\nThank you for visiting!\n\n\n\n\n`;

      if (isNativePrintServicePaired()) {
        console.log('[print-test] Device is paired, submitting job to native print service...');
        await submitNativePrintJob({
          idempotencyKey: `test-${kind.toLowerCase()}:${profile.id}:${Date.now()}`,
          jobKind: kind.toLowerCase(),
          outputFormat: profile.format,
          printerProfileId: profile.id,
          text,
          document: {
            restaurant: { restaurantName: Cookies.get('orgName') || Cookies.get('clientName') || 'CafeQR' },
            orderNo: 'TEST',
            invoiceNo: 'TEST',
            orderType: 'TEST',
            orderDate: new Date().toISOString(),
            lines: [
              { productName: 'Paneer Butter Masala', quantity: 1, unitPrice: 180, taxAmount: 9, lineTotal: 180 },
              { productName: 'Butter Naan', quantity: 2, unitPrice: 40, taxAmount: 4, lineTotal: 80 }
            ],
            grandTotal: 260,
          },
        });
        showMessage(`Saved and queued a test ${kind} print for ${profileDisplayLabel(profile)}.`);
      } else {
        // Unpaired / Direct Loopback Mode
        console.log('[print-test] Device is unpaired (Loopback Mode), sending raw text to printer...');
        await printUniversal({
          text,
          jobKind: kind.toLowerCase(),
          winPrinterNames: [profile.windowsPrinterName],
          outputFormat: profile.format,
        });
        showMessage(`Saved and sent test ${kind} print directly to ${profile.windowsPrinterName || 'local printer'}.`);
      }
      await refreshService();
    } catch (error) {
      console.error('[print-test] Test print failed:', error);
      showMessage(sessionAwareMessage(error, `Unable to save and submit the test ${kind} print.`));
    } finally {
      setBusy(false);
    }
  };

  const retryCloudSynchronization = async () => {
    setBusy(true);
    try {
      const synchronized = await syncNativePrintConfiguration();
      setLocalConfiguration(synchronized);
      await refreshService();
      showMessage('Printing configuration synchronized with CafeQR.');
    } catch (error) {
      showMessage(`${error.message || 'Cloud synchronization failed.'} Printing continues locally.`);
    } finally {
      setBusy(false);
    }
  };

  const useCloudConfiguration = async () => {
    if (!cloudConfiguration) return;
    showConfirm(
      'Apply Cloud Configuration',
      'Replace the locally active printer configuration with the cloud version?',
      async () => {
        setBusy(true);
        try {
          const effective = sanitizeConfiguration(deepMerge(DEFAULT_CONFIG, cloudConfiguration));
          const accepted = await acceptNativeCloudConfiguration(
            effective,
            cloudRevisionOf(cloudConfiguration)
          );
          setPrintConfig(effective);
          setLocalConfiguration(accepted);
          await refreshService();
          showMessage('Cloud printing configuration applied locally.');
        } catch (error) {
          showMessage(error.message || 'Unable to apply the cloud configuration.');
        } finally {
          setBusy(false);
        }
      },
      { confirmLabel: 'Replace Configuration' }
    );
  };

  const refreshInstalledPrinters = async () => {
    await refreshService();
    showMessage('Installed Windows printers and COM ports refreshed.');
  };

  const downloadLogs = async () => {
    try {
      const lines = await getPrintServiceLogs();
      const blob = new Blob([(Array.isArray(lines) ? lines : []).join('\r\n')], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CafeQR-PrintService-${new Date().toISOString().slice(0, 10)}.log`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showMessage(error.message || 'Unable to download Print Service logs.');
    }
  };

  const updateLocalJob = async (job, action) => {
    const id = job.Id || job.id;
    try {
      if (action === 'retry') await retryLocalPrintJob(id);
      else await resolveLocalPrintJob(id, action === 'complete' ? 'COMPLETED' : 'CANCELLED');
      await refreshService();
    } catch (error) {
      showMessage(error.message || 'Unable to update the local print job.');
    }
  };

  const setDefault = (key, value) => setPrintConfig((previous) => ({
    ...previous,
    defaults: { ...previous.defaults, [key]: value },
  }));

  const renderTemplateOverride = (profile, documentKey, title, defaultTemplate) => {
    if (profile.format !== 'THERMAL') return null;
    const documentType = documentKey === 'kot' ? 'KOT' : 'BILL';
    if (!profileSupportsDocument(profile, documentType)) return null;
    const override = profile.templateOverrides?.[documentKey] || {};
    const enabled = override.enabled === true;
    const template = documentKey === 'kot'
      ? mergeKotTemplate({ ...defaultTemplate, ...override })
      : mergeReceiptTemplate({ ...defaultTemplate, ...override });
    const update = (changes) => updateProfileTemplateOverride(profile.id, documentKey, changes);
    const visibilityOptions = [
      ['showRestaurantName', 'Restaurant name'],
      ['showDailyBillNo', 'Daily bill no.'],
      ['showCustomerDetails', 'Customer'],
      ['showTableLabel', 'Table/type'],
      ['showFssai', 'FSSAI'],
      ...(documentKey === 'receipt' ? [['showGstBreakdown', 'GST']] : []),
    ];

    return (
      <div className="template-override">
        <button type="button" className="override-toggle" onClick={() => update({ enabled: !enabled })}>
          <span>{title} template override</span>
          <span className={`pill ${enabled ? 'on' : ''}`}>{enabled ? 'Override' : 'Global'}</span>
        </button>
        {enabled && (
          <div className="override-body">
            <div className="form-grid compact">
              <Field label="Paper">
                <NiceSelect
                  value={template.preset || '58MM'}
                  onChange={(value) => {
                    const preset = THERMAL_PAPER_PRESETS.find((row) => row.preset === value);
                    update({
                      preset: value,
                      ...(preset ? {
                        widthMm: preset.widthMm,
                        columns: preset.columns,
                        printableDots: preset.printableDots,
                      } : {}),
                    });
                  }}
                  options={[
                    ...THERMAL_PAPER_PRESETS.map((row) => ({ value: row.preset, label: row.label })),
                    { value: 'CUSTOM', label: 'Custom' },
                  ]}
                />
              </Field>
              <Field label="Width (mm)"><input type="number" value={template.widthMm || ''} onChange={(event) => update({ widthMm: Number(event.target.value) })} /></Field>
              <Field label="Columns"><input type="number" value={template.columns || 32} onChange={(event) => update({ columns: Number(event.target.value) })} /></Field>
              <Field label="Printable dots"><input type="number" value={template.printableDots || 384} onChange={(event) => update({ printableDots: Number(event.target.value) })} /></Field>
              <Field label="Left dots"><input type="number" min="0" value={template.leftMarginDots ?? 0} onChange={(event) => update({ leftMarginDots: Number(event.target.value) })} /></Field>
              <Field label="Right dots"><input type="number" min="0" value={template.rightMarginDots ?? 0} onChange={(event) => update({ rightMarginDots: Number(event.target.value) })} /></Field>
              <Field label="Feed lines"><input type="number" min="0" value={template.feedLines ?? 3} onChange={(event) => update({ feedLines: Number(event.target.value) })} /></Field>
              <Field label="Title font">
                <NiceSelect value={template.titleFontSize || 'DOUBLE'} onChange={(value) => update({ titleFontSize: value })} options={FONT_SIZE_OPTIONS} />
              </Field>
              <Field label="Body font">
                <NiceSelect value={template.fontSize || 'NORMAL'} onChange={(value) => update({ fontSize: value })} options={FONT_SIZE_OPTIONS} />
              </Field>
            </div>
            <div className="document-toggles compact-toggles">
              <label className="check">
                <input type="checkbox" checked={template.autoCut !== false} onChange={(event) => update({ autoCut: event.target.checked })} />
                <span>Auto-cut</span>
              </label>
              {visibilityOptions.map(([key, label]) => (
                <label className="check" key={key}>
                  <input type="checkbox" checked={template[key] !== false} onChange={(event) => update({ [key]: event.target.checked })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Header"><input value={template.header || ''} onChange={(event) => update({ header: event.target.value })} /></Field>
              <Field label="Footer"><input value={template.footer || ''} onChange={(event) => update({ footer: event.target.value })} /></Field>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabs = [
    ['service', 'Print Service', <FaServer key="service" />],
    ['profiles', 'Printer Profiles', <FaPrint key="profiles" />],
    ['assignments', 'Default Printers', <FaCheckCircle key="assignments" />],
    ['routing', 'Routing', <FaRoute key="routing" />],
    ['queue', 'Print Queue', <FaSync key="queue" />],
    ['android', 'Android', <FaAndroid key="android" />],
  ];

  return (
    <div className="print-platform">
      <div className="platform-toolbar">
        <div className="scope-control">
          <label>Configuration level</label>
          <div className="segmented">
            {['CLIENT', 'ORGANIZATION', 'TERMINAL'].map((value) => (
              <button
                key={value}
                className={scopeType === value ? 'active' : ''}
                onClick={() => {
                  setScopeType(value);
                  if (value === 'ORGANIZATION') setScopeId(currentOrgId);
                  if (value === 'TERMINAL') {
                    selectTerminal(health?.terminalId || Cookies.get('terminalId') || terminals[0]?.id || '');
                  }
                }}
              >
                {value === 'CLIENT' ? 'Organization' : value === 'ORGANIZATION' ? 'Branch' : 'Terminal'}
              </button>
            ))}
          </div>
        </div>
        {scopeType === 'TERMINAL' && (
          <div className="field terminal-field">
            <span>Terminal</span>
            <NiceSelect
              value={scopeId}
              onChange={(value) => selectTerminal(value)}
              options={[
                { value: '', label: 'Select terminal' },
                ...terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))
              ]}
            />
          </div>
        )}
        <button className="primary" onClick={saveConfiguration} disabled={
          busy || routeConflicts.size > 0 || (scopeType === 'TERMINAL' && !scopeId)
        }>
          <FaCheckCircle /> Save Printing
        </button>
      </div>

      <div className="platform-tabs">
        {tabs.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'service' && (
        <section className="surface">
          <header>
            <div>
              <h3>Windows Print Service</h3>
              <p>Persistent local queue, automatic recovery, and silent printing independent of the browser.</p>
            </div>
            <div className="actions">
              {health?.configurationDirty && (
                <button className="secondary" onClick={retryCloudSynchronization} disabled={busy}>
                  <FaSync /> Retry cloud sync
                </button>
              )}
              {health?.cloudStatus === 'SYNC_CONFLICT' && cloudConfiguration && (
                <button className="secondary" onClick={useCloudConfiguration} disabled={busy}>
                  Use cloud version
                </button>
              )}
              <button className="secondary" onClick={downloadLogs} disabled={!health}>Download logs</button>
              <button
                className="secondary"
                onClick={() => refreshService()}
                disabled={secureContext !== true}
              >
                <FaSync /> Refresh
              </button>
            </div>
          </header>

          {secureContext === false && (
            <div className="local-access-notice error">
              <FaExclamationTriangle />
              <div>
                <strong>HTTPS is required for Windows printing</strong>
                <span>Open CafeQR at <a href={PRODUCTION_APP_URL}>{PRODUCTION_APP_URL}</a>. Chrome and Edge block public HTTP pages from connecting to this computer.</span>
              </div>
            </div>
          )}

          {secureContext === true && localAccessState !== 'CONNECTED' && (
            <div className="local-access-notice">
              <FaNetworkWired />
              <div>
                <strong>Connect this browser to the Windows Print Service</strong>
                <span>
                  Chrome or Edge will ask for Local network access. Allow it to reach the service running only on this computer.
                </span>
                {localAccessError && <small>{localAccessError}</small>}
              </div>
              <button className="primary" onClick={connectPrintService} disabled={busy || localAccessState === 'CONNECTING'}>
                <FaNetworkWired /> {localAccessState === 'CONNECTING' ? 'Connecting...' : 'Connect Print Service'}
              </button>
            </div>
          )}

          <div className="status-grid">
            <Status
              label="Service"
              value={health
                ? 'Online'
                : localAccessState === 'INSECURE'
                  ? 'HTTPS required'
                  : localAccessState === 'IDLE'
                    ? 'Connect required'
                    : 'Not reachable'}
              ok={Boolean(health)}
            />
            <Status
              label="Pairing"
              value={localTokenInvalid
                ? 'Token invalid (Re-pair)'
                : health?.cloudStatus === 'AUTH_REQUIRED'
                  ? 'Re-pair required'
                  : health?.cloudPaired
                    ? 'Paired'
                    : health?.credentialsPresent
                      ? 'Checking'
                      : 'Not paired'}
              ok={Boolean(health?.cloudPaired) && !localTokenInvalid}
            />
            <Status
              label="Configuration"
              value={health?.configurationDirty
                ? 'Cloud sync pending'
                : health?.cloudStatus === 'SYNC_CONFLICT'
                  ? 'Conflict - local active'
                  : health?.cloudStatus === 'SYNCED'
                    ? 'Synced'
                    : 'Saved locally'}
              ok={Boolean(health) && health?.cloudStatus !== 'AUTH_REQUIRED'}
            />
            <Status label="Local queue" value={`${health?.queueDepth || 0} jobs`} ok={(health?.queueDepth || 0) === 0} />
            <Status label="Version" value={health?.version || 'Unknown'} ok={Boolean(health?.version)} />
          </div>

          {health?.lastCloudError && (
            <div className="sync-notice">
              <FaExclamationTriangle />
              <span>{health.lastCloudError} Local printer profiles and queued jobs remain available.</span>
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <span>Terminal</span>
              <NiceSelect
                value={scopeId}
                onChange={(value) => selectTerminal(value)}
                options={[
                  { value: '', label: 'Select terminal' },
                  ...terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))
                ]}
              />
            </div>
            <label className="field">
              <span>Station name</span>
              <input value={stationName} onChange={(event) => setStationName(event.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={fallback} onChange={(event) => setFallback(event.target.checked)} />
              <span>Use as branch fallback for jobs without a source terminal</span>
            </label>
          </div>

          <div className="pairing-row">
            <button className="secondary" onClick={createEnrollment} disabled={busy}>Create pairing code</button>
            <input
              className="pair-code"
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
              placeholder="000-000"
            />
            <button
              className="primary"
              onClick={pairThisComputer}
              disabled={busy || !health || localAccessState !== 'CONNECTED'}
            >
              Pair this computer
            </button>
            {isNativePrintServicePaired() && (
              <button
                className="secondary"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={() => {
                  showConfirm(
                    'Disconnect Print Service',
                    'Disconnect this print service and switch to Direct Local Loopback Mode?',
                    () => {
                      forgetNativePrintService();
                      setLocalTokenInvalid(false);
                      syncPrintConfigToLocalStorage(printConfig);
                      refreshService();
                      showMessage('Disconnected print service. Browser will now print directly to localhost.');
                    },
                    { confirmLabel: 'Disconnect', cancelLabel: 'Keep Connected' }
                  );
                }}
              >
                Disconnect / Switch to Loopback
              </button>
            )}
            <a className="download" href="/desktop/Windows/CafeQR-PrintService.msi" download>
              <FaDownload /> Windows 7 SP1, 8.1, 10, 11
            </a>
            <a className="download" href="/desktop/Windows/CafeQR-PrintService-Windows8.msi" download>
              <FaDownload /> Windows 8.0
            </a>
            <a className="download" href="/desktop/Windows/CafeQR-Test-CodeSigning.cer" download>
              <FaDownload /> Test signing certificate
            </a>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Station</th><th>Terminal</th><th>Status</th><th>Version</th><th>Last heartbeat</th><th>Fallback</th></tr></thead>
              <tbody>
                {stations.map((station) => (
                  <tr key={station.id}>
                    <td>{station.name}</td>
                    <td>{terminals.find((row) => row.id === station.terminalId)?.name || station.terminalId}</td>
                    <td><span className={`state ${station.status === 'ONLINE' ? 'ok' : ''}`}>{station.status}</span></td>
                    <td>{station.serviceVersion || '—'}</td>
                    <td>{station.lastHeartbeatAt ? new Date(station.lastHeartbeatAt).toLocaleString() : 'Never'}</td>
                    <td>{station.fallbackForBranch ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {!stations.length && <tr><td colSpan="6" className="empty">No print stations have been paired.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'profiles' && (
        <section className="surface">
          <header>
            <div><h3>Printer Profiles</h3><p>Every physical printer has its own transport, format, paper, and document capabilities.</p></div>
            <div className="actions">
              <button className="secondary" onClick={refreshInstalledPrinters}><FaSync /> Refresh installed printers</button>
              <button className="secondary" onClick={() => addProfile('THERMAL')}><FaPlus /> Thermal</button>
              <button className="secondary" onClick={() => addProfile('REGULAR')}><FaPlus /> Regular</button>
            </div>
          </header>
          <div className="profile-list">
            {printConfig.profiles.map((profile) => (
              <div className="profile" key={profile.id}>
                <div className="profile-head">
                  <div className={`format-icon ${profile.format.toLowerCase()}`}><FaPrint /></div>
                  <input value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} />
                  <span className="format-label">{profile.format}</span>
                  <button className="icon" title="Delete profile" onClick={() => deleteProfile(profile.id)}><FaTrash /></button>
                </div>
                <div className="form-grid compact">
                  <Field label="Connection">
                    <NiceSelect
                      value={profile.connectionType}
                      onChange={(value) => updateProfile(profile.id, { connectionType: value })}
                      options={[
                        { value: 'WINDOWS_QUEUE', label: 'Windows queue (USB/Bluetooth/LAN)' },
                        { value: 'NETWORK', label: 'Direct LAN/Wi-Fi TCP' },
                        { value: 'BLUETOOTH_COM', label: 'Bluetooth COM' }
                      ]}
                    />
                  </Field>
                  <Field label="Format">
                    <NiceSelect
                      value={profile.format}
                      onChange={(value) => updateProfile(profile.id, { format: value })}
                      options={[
                        { value: 'THERMAL', label: 'Thermal' },
                        { value: 'REGULAR', label: 'Regular page' }
                      ]}
                    />
                  </Field>
                  {profile.connectionType === 'WINDOWS_QUEUE' && (
                    <Field label="Windows printer">
                      <NiceSelect
                        value={profile.windowsPrinterName || ''}
                        onChange={(value) => updateProfile(profile.id, { windowsPrinterName: value })}
                        options={[
                          { value: '', label: 'Select installed printer' },
                          ...localPrinters.filter((row) => row.connectionType === 'WINDOWS_QUEUE').map((row) => ({
                            value: row.name,
                            label: row.name
                          }))
                        ]}
                      />
                    </Field>
                  )}
                  {profile.connectionType === 'NETWORK' && (
                    <>
                      <Field label="IP / Host"><input value={profile.host || ''} onChange={(event) => updateProfile(profile.id, { host: event.target.value })} /></Field>
                      <Field label="Port"><input type="number" value={profile.port || 9100} onChange={(event) => updateProfile(profile.id, { port: Number(event.target.value) })} /></Field>
                    </>
                  )}
                  {profile.connectionType === 'BLUETOOTH_COM' && (
                    <>
                      <Field label="COM port">
                        <NiceSelect
                          value={profile.comPort || ''}
                          onChange={(value) => updateProfile(profile.id, { comPort: value })}
                          options={[
                            { value: '', label: 'Select paired COM port' },
                            ...localPrinters.filter((row) => row.connectionType === 'BLUETOOTH_COM').map((row) => ({
                              value: row.name,
                              label: row.name
                            }))
                          ]}
                        />
                      </Field>
                      <Field label="Baud rate"><input type="number" value={profile.baudRate || 9600} onChange={(event) => updateProfile(profile.id, { baudRate: Number(event.target.value) })} /></Field>
                    </>
                  )}
                  <Field label="Paper">
                    <NiceSelect
                      value={profile.paperPreset}
                      onChange={(value) => {
                        const presets = {
                          '58MM': { widthMm: 58, columns: 32, printableDots: 384 },
                          '80MM': { widthMm: 80, columns: 48, printableDots: 576 },
                          '4IN': { widthMm: 101.6, columns: 64, printableDots: 832 },
                          A4: { widthMm: 210, heightMm: 297 },
                          A5: { widthMm: 148, heightMm: 210 },
                          LETTER: { widthMm: 215.9, heightMm: 279.4 },
                          LEGAL: { widthMm: 215.9, heightMm: 355.6 },
                          CUSTOM: {},
                        };
                        updateProfile(profile.id, { paperPreset: value, ...presets[value] });
                      }}
                      options={profile.format === 'THERMAL' ? [
                        { value: '58MM', label: '2 inch / 58 mm' },
                        { value: '80MM', label: '3 inch / 80 mm' },
                        { value: '4IN', label: '4 inch' },
                        { value: 'CUSTOM', label: 'Custom' }
                      ] : [
                        { value: 'A4', label: 'A4' },
                        { value: 'A5', label: 'A5' },
                        { value: 'LETTER', label: 'Letter' },
                        { value: 'LEGAL', label: 'Legal' },
                        { value: 'CUSTOM', label: 'Driver custom form' }
                      ]}
                    />
                  </Field>
                  <Field label="Width (mm)"><input type="number" value={profile.widthMm || ''} onChange={(event) => updateProfile(profile.id, { widthMm: Number(event.target.value) })} /></Field>
                  {profile.format === 'REGULAR' && <Field label="Height (mm)"><input type="number" value={profile.heightMm || ''} onChange={(event) => updateProfile(profile.id, { heightMm: Number(event.target.value) })} /></Field>}
                  {profile.format === 'THERMAL' && <Field label="Columns"><input type="number" value={profile.columns || 32} onChange={(event) => updateProfile(profile.id, { columns: Number(event.target.value) })} /></Field>}
                  <Field label="Copies"><input type="number" min="1" max="10" value={profile.copies || 1} onChange={(event) => updateProfile(profile.id, { copies: Number(event.target.value) })} /></Field>
                </div>
                <div className="document-toggles">
                  {['KOT', 'BILL', 'INVOICE'].map((documentType) => (
                    <label className="check" key={documentType}>
                      <input
                        type="checkbox"
                        checked={profileSupportsDocument(profile, documentType)}
                        onChange={(event) => {
                          const currentDocuments = Array.isArray(profile.documents) && profile.documents.length > 0
                            ? profile.documents
                            : ['KOT', 'BILL', 'INVOICE'];
                          updateProfile(profile.id, {
                            documents: event.target.checked
                              ? Array.from(new Set([...currentDocuments, documentType]))
                              : currentDocuments.filter((value) => value !== documentType),
                          });
                        }}
                      />
                      <span>{documentType}</span>
                    </label>
                  ))}
                  <span className="profile-destination">{profileDestination(profile)}</span>
                  <div className="test-buttons-group" style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                    <button className="secondary test" onClick={() => testProfile(profile)} disabled={!health || busy}>Save & Test</button>
                    <button className="secondary test" onClick={() => testDocType(profile, 'KOT')} disabled={!health || busy} style={{ backgroundColor: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' }}>Test KOT</button>
                    <button className="secondary test" onClick={() => testDocType(profile, 'BILL')} disabled={!health || busy} style={{ backgroundColor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}>Test Bill</button>
                  </div>
                </div>
                {profile.format === 'THERMAL' && (
                  <div className="profile-template-overrides">
                    {renderTemplateOverride(profile, 'kot', 'KOT', printConfig.kotTemplate || DEFAULT_KOT_TEMPLATE)}
                    {renderTemplateOverride(profile, 'receipt', 'Final bill', printConfig.receiptTemplate || DEFAULT_RECEIPT_TEMPLATE)}
                  </div>
                )}
              </div>
            ))}
            {!printConfig.profiles.length && <div className="empty-state"><FaPrint /><strong>No printer profiles</strong><span>Add the first thermal or regular printer.</span></div>}
          </div>
        </section>
      )}

      {tab === 'assignments' && (
        <section className="surface">
          <header>
            <div>
              <h3>Default Document Printers</h3>
              <p>Select the exact printer profiles used by KOT, Bill, and Invoice jobs. Every selected profile receives a mirrored copy.</p>
            </div>
            <button className="secondary" onClick={() => setTab('profiles')}><FaPlus /> Manage profiles</button>
          </header>
          {(() => {
            const warnings = getMissingPrinterWarnings(printConfig);
            const entries = Object.entries(warnings);
            if (!entries.length) return null;
            return (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                background: '#fffbeb', border: '1px solid #fcd34d',
                borderRadius: '6px', padding: '12px 16px', marginBottom: '16px',
                color: '#92400e', fontSize: '0.875rem',
              }}>
                <FaExclamationTriangle style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Printer queue not set — printing will fail</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    {entries.map(([type, names]) => (
                      <li key={type}>
                        <strong>{type}</strong>: {names.join(', ')} {names.length === 1 ? 'has' : 'have'} no
                        Windows printer queue selected. Go to{' '}
                        <button onClick={() => setTab('profiles')}
                          style={{
                            background: 'none', border: 'none', padding: 0, color: '#92400e',
                            textDecoration: 'underline', cursor: 'pointer', font: 'inherit'
                          }}>
                          Printer Profiles
                        </button>{' '}
                        and pick a printer from the &quot;Windows printer&quot; dropdown, then click <strong>Save Printing</strong>.
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })()}
          <div className="assignment-list">
            {DOCUMENT_DEFAULTS.map(({ type, title, description, profileKey, outputKey, modeKey }) => {
              const compatible = printConfig.profiles.filter((profile) => (
                profile.enabled !== false && profileSupportsDocument(profile, type)
              ));
              const labels = Object.fromEntries(compatible.map((profile) => [profile.id, profileDisplayLabel(profile)]));
              return (
                <div className="assignment" key={type}>
                  <div className="assignment-head">
                    <div>
                      <h4>{title}</h4>
                      <p>{description}</p>
                    </div>
                    <span className="mirror-badge">Mirror to all selected</span>
                  </div>
                  <div className="assignment-output">
                    <Field label="Output format">
                      <NiceSelect
                        value={printConfig.defaults[outputKey]}
                        onChange={(value) => setDefault(outputKey, value)}
                        options={[
                          { value: 'THERMAL', label: 'Thermal' },
                          { value: 'REGULAR', label: 'Regular' },
                          { value: 'BOTH', label: 'Both' }
                        ]}
                      />
                    </Field>
                  </div>
                  <TagSelector
                    label="Assigned printer profiles"
                    values={compatible.map((profile) => profile.id)}
                    selected={printConfig.defaults[profileKey] || []}
                    onChange={(values) => setPrintConfig((previous) => ({
                      ...previous,
                      defaults: {
                        ...previous.defaults,
                        [profileKey]: values,
                        [modeKey]: 'MIRROR',
                      },
                    }))}
                    labels={labels}
                  />
                  {!compatible.length && (
                    <div className="assignment-warning">
                      <FaExclamationTriangle /> No enabled profile supports {type}. Create a printer profile and enable {type}.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'routing' && (
        <section className="surface">
          <header><div><h3>Print Routing</h3><p>Route by document, category, order type, priority, and mirror or failover behavior.</p></div><button className="secondary" onClick={addRoute}><FaPlus /> Add route</button></header>
          <div className="route-list">
            {printConfig.routes.map((route) => (
              <div className={`route ${routeConflicts.has(route.id) ? 'conflict' : ''}`} key={route.id}>
                <div className="route-head">
                  <input value={route.name} onChange={(event) => updateRoute(route.id, { name: event.target.value })} />
                  {routeConflicts.has(route.id) && <span className="warning"><FaExclamationTriangle /> Conflicting rule</span>}
                  <button className="icon" onClick={() => setPrintConfig((previous) => ({ ...previous, routes: previous.routes.filter((row) => row.id !== route.id) }))}><FaTrash /></button>
                </div>
                <div className="form-grid compact">
                  <Field label="Priority"><input type="number" value={route.priority} onChange={(event) => updateRoute(route.id, { priority: Number(event.target.value) })} /></Field>
                  <Field label="Delivery mode">
                    <NiceSelect
                      value={route.mode}
                      onChange={(value) => updateRoute(route.id, { mode: value })}
                      options={[
                        { value: 'FAILOVER', label: 'Failover in order' },
                        { value: 'MIRROR', label: 'Print to all' }
                      ]}
                    />
                  </Field>
                  <Field label="Copies"><input type="number" min="1" max="10" value={route.copies} onChange={(event) => updateRoute(route.id, { copies: Number(event.target.value) })} /></Field>
                </div>
                <TagSelector label="Documents" values={['KOT', 'BILL', 'INVOICE']} selected={route.documentTypes} onChange={(values) => updateRoute(route.id, { documentTypes: values })} />
                <TagSelector label="Order types" values={['DINE_IN', 'TAKEAWAY', 'DELIVERY']} selected={route.orderTypes} onChange={(values) => updateRoute(route.id, { orderTypes: values })} />
                <TagSelector label="Categories" values={categories} selected={route.categories} onChange={(values) => updateRoute(route.id, { categories: values })} />
                <TagSelector label="Printer targets" values={printConfig.profiles.map((profile) => profile.id)} selected={route.profileIds} onChange={(values) => updateRoute(route.id, { profileIds: values })} labels={Object.fromEntries(printConfig.profiles.map((profile) => [profile.id, profile.name]))} />
              </div>
            ))}
            {!printConfig.routes.length && <div className="empty-state"><FaRoute /><strong>No custom routes</strong><span>Default KOT, Bill, and Invoice assignments will be used.</span></div>}
          </div>
        </section>
      )}

      {tab === 'queue' && (
        <section className="surface">
          <header><div><h3>Local Print Queue</h3><p>Recent durable jobs stored by the Windows service.</p></div><button className="secondary" onClick={refreshService}><FaSync /> Refresh</button></header>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Job</th><th>Kind</th><th>Printer</th><th>Status</th><th>Attempts</th><th>Spool job</th><th>Error</th><th>Actions</th></tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.Id || job.id}>
                    <td>{job.Id || job.id}</td><td>{job.JobKind || job.jobKind}</td>
                    <td>{(() => {
                      const profile = printConfig.profiles.find((row) => row.id === (job.ProfileId || job.profileId));
                      return profile ? profileDisplayLabel(profile) : (job.ProfileId || job.profileId);
                    })()}</td>
                    <td><span className={`state ${['SPOOLED', 'COMPLETED', 'PRINTED'].includes(job.Status || job.status) ? 'ok' : ''}`}>{job.Status || job.status}</span></td>
                    <td>{job.Attempts ?? job.attempts}</td><td>{job.SpoolJobId || job.spoolJobId || '—'}</td>
                    <td>{job.ErrorMessage || job.errorMessage || '—'}</td>
                    <td>
                      <div className="queue-actions">
                        {['FAILED', 'RETRY_WAIT'].includes(job.Status || job.status) && <button onClick={() => updateLocalJob(job, 'retry')}>Retry</button>}
                        {(job.Status || job.status) === 'HELD_AMBIGUOUS' && (
                          <>
                            <button onClick={() => updateLocalJob(job, 'complete')}>Printed</button>
                            <button onClick={() => updateLocalJob(job, 'cancel')}>Cancel</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!jobs.length && <tr><td colSpan="8" className="empty">No local print jobs are available.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'android' && (
        <PrinterSetupCard androidOnly restaurantId={restaurantId} config={legacyConfig} onConfigChange={onConfigChange} />
      )}

      {message && <div className="platform-toast">{message}</div>}

      {confirmModal.isOpen && (
        <CafeQRPopup
          title={confirmModal.title}
          onClose={closeConfirm}
          onSave={confirmModal.onConfirm}
          onCancel={closeConfirm}
          saveLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          maxWidth="480px"
        >
          <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
            {confirmModal.message}
          </div>
        </CafeQRPopup>
      )}

      <style jsx global>{`
        .print-platform { display: flex; flex-direction: column; gap: 16px; min-width: 0; color: #172033; }
        .print-platform .platform-toolbar { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; padding: 14px 16px; border: 1px solid #dfe5ee; background: #fff; border-radius: 8px; }
        .print-platform .scope-control { display: flex; flex-direction: column; gap: 6px; }
        .print-platform .scope-control label, .print-platform .field span { font-size: 11px; font-weight: 800; color: #60708a; text-transform: uppercase; }
        .print-platform .segmented { display: flex; padding: 3px; background: #edf1f6; border-radius: 7px; }
        .print-platform .segmented button { border: 0; background: transparent; padding: 8px 12px; font-weight: 700; color: #66758d; cursor: pointer; border-radius: 5px; }
        .print-platform .segmented button.active { background: white; color: #f97316; box-shadow: 0 1px 4px rgba(15,23,42,.1); }
        .print-platform .terminal-field { min-width: 220px; }
        .print-platform .platform-toolbar .primary { margin-left: auto; }
        .print-platform .platform-tabs { display: flex; overflow-x: auto; padding: 5px; background: #edf1f6; border-radius: 8px; }
        .print-platform .platform-tabs button { flex: 1; min-width: max-content; border: 0; background: transparent; padding: 11px 14px; color: #60708a; font-weight: 750; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 7px; border-radius: 6px; }
        .print-platform .platform-tabs button.active { background: white; color: #f97316; box-shadow: 0 2px 7px rgba(15,23,42,.08); }
        .print-platform .surface { border: 1px solid #dfe5ee; background: #fff; border-radius: 8px; padding: 20px; min-width: 0; }
        .print-platform header { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 20px; }
        .print-platform h3, .print-platform h4 { margin: 0; color: #172033; }
        .print-platform h3 { font-size: 18px; } .print-platform h4 { font-size: 15px; }
        .print-platform header p { margin: 5px 0 0; color: #687890; font-size: 13px; }
        .print-platform .primary, .print-platform .secondary, .print-platform .download { min-height: 40px; border-radius: 7px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-weight: 750; cursor: pointer; text-decoration: none; }
        .print-platform .primary { border: 1px solid #f97316; background: #f97316; color: white; }
        .print-platform .secondary, .print-platform .download { border: 1px solid #d6deea; background: white; color: #354258; }
        .print-platform button:disabled { opacity: .5; cursor: not-allowed; }
        .print-platform .actions, .print-platform .pairing-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .print-platform .status-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid #e1e7ef; margin-bottom: 20px; }
        .print-platform .sync-notice { display: flex; align-items: start; gap: 9px; padding: 10px 12px; margin: -8px 0 18px; background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; font-size: 12px; font-weight: 700; }
        .print-platform .local-access-notice { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 14px; margin-bottom: 18px; border: 1px solid #bae6fd; background: #f0f9ff; color: #0c4a6e; }
        .print-platform .local-access-notice.error { grid-template-columns: auto minmax(0, 1fr); border-color: #fecaca; background: #fef2f2; color: #991b1b; }
        .print-platform .local-access-notice > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .print-platform .local-access-notice strong { font-size: 13px; }
        .print-platform .local-access-notice span, .print-platform .local-access-notice small { font-size: 12px; line-height: 1.45; }
        .print-platform .local-access-notice a { color: inherit; font-weight: 800; }
        .print-platform .form-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
        .print-platform .form-grid.compact { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
        .print-platform .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .print-platform input, .print-platform select, .print-platform textarea { width: 100%; min-height: 40px; border: 1px solid #d6deea; border-radius: 7px; padding: 8px 10px; background: white; color: #172033; font: inherit; box-sizing: border-box; }
        .print-platform input:focus, .print-platform select:focus, .print-platform textarea:focus { outline: 2px solid #fed7aa; border-color: #f97316; }
        .print-platform .check { display: inline-flex; align-items: center; gap: 8px; color: #46556b; font-size: 13px; font-weight: 650; }
        .print-platform .check input { width: 16px; min-height: 16px; accent-color: #f97316; }
        .print-platform .pairing-row { border-top: 1px solid #e5eaf1; padding-top: 18px; margin-top: 18px; }
        .print-platform .pair-code { max-width: 150px; text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 1px; }
        .print-platform .table-wrap { overflow: auto; border: 1px solid #e1e7ef; margin-top: 18px; }
        .print-platform table { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 12px; }
        .print-platform th { background: #f5f7fa; color: #60708a; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; text-align: left; }
        .print-platform th, .print-platform td { padding: 11px 12px; border-bottom: 1px solid #e9edf3; }
        .print-platform .state { padding: 4px 7px; background: #f1f4f8; border-radius: 5px; font-weight: 800; }
        .print-platform .state.ok { color: #087443; background: #eaf8f1; }
        .print-platform .queue-actions { display: flex; gap: 5px; flex-wrap: wrap; }
        .print-platform .queue-actions button { border: 1px solid #d6deea; background: white; color: #40506a; padding: 5px 7px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 750; }
        .print-platform .empty { text-align: center; color: #8390a3; padding: 25px; }
        .print-platform .profile-list, .print-platform .route-list { display: flex; flex-direction: column; gap: 12px; }
        .print-platform .profile, .print-platform .route { border-top: 1px solid #e1e7ef; padding: 16px 0 4px; }
        .print-platform .profile:first-child, .print-platform .route:first-child { border-top: 0; padding-top: 0; }
        .print-platform .profile-head, .print-platform .route-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .print-platform .profile-head > input, .print-platform .route-head > input { border: 0; border-bottom: 1px solid transparent; border-radius: 0; min-height: 34px; padding: 3px; font-size: 15px; font-weight: 800; }
        .print-platform .profile-head > input:focus, .print-platform .route-head > input:focus { outline: 0; border-bottom-color: #f97316; }
        .print-platform .format-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 6px; background: #eaf8f1; color: #059669; flex: 0 0 auto; }
        .print-platform .format-icon.regular { background: #eef4ff; color: #2563eb; }
        .print-platform .format-label { font-size: 10px; font-weight: 850; color: #65758c; background: #f0f3f7; padding: 5px 7px; border-radius: 5px; }
        .print-platform .icon { width: 34px; height: 34px; border: 0; background: transparent; color: #dc2626; cursor: pointer; display: grid; place-items: center; flex: 0 0 auto; }
        .print-platform .document-toggles { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 14px; }
        .print-platform .document-toggles .test { margin-left: auto; min-height: 34px; }
        .print-platform .profile-template-overrides { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 12px; }
        .print-platform .template-override { border: 1px solid #e1e7ef; border-radius: 10px; background: #f8fafc; overflow: hidden; }
        .print-platform .override-toggle { width: 100%; border: 0; background: transparent; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #243044; font-weight: 800; cursor: pointer; }
        .print-platform .override-body { padding: 12px; border-top: 1px solid #e1e7ef; display: flex; flex-direction: column; gap: 12px; background: white; }
        .print-platform .pill { display: inline-flex; align-items: center; justify-content: center; min-width: 58px; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 850; color: #60708a; background: #e2e8f0; }
        .print-platform .pill.on { color: #9a3412; background: #ffedd5; }
        .print-platform .compact-toggles { margin-top: 0; }
        .print-platform .profile-destination { color: #60708a; font-size: 12px; font-weight: 700; }
        .print-platform .defaults-row { display: grid; grid-template-columns: repeat(2, minmax(0, 260px)); gap: 12px; margin-bottom: 18px; }
        .print-platform .assignment-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .print-platform .assignment { border: 1px solid #dfe5ee; padding: 16px; min-width: 0; }
        .print-platform .assignment-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
        .print-platform .assignment-head p { color: #687890; font-size: 12px; line-height: 1.45; margin: 5px 0 0; }
        .print-platform .assignment-output { max-width: 220px; margin-top: 14px; }
        .print-platform .mirror-badge { background: #eaf8f1; color: #087443; padding: 5px 7px; border-radius: 5px; font-size: 10px; font-weight: 850; white-space: nowrap; }
        .print-platform .assignment-warning { display: flex; align-items: center; gap: 7px; color: #b42318; background: #fff1f0; padding: 9px; margin-top: 12px; font-size: 11px; font-weight: 750; }
        .print-platform .route.conflict { border-left: 3px solid #dc2626; padding-left: 12px; }
        .print-platform .warning { color: #b42318; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; font-weight: 800; white-space: nowrap; }
        .print-platform .empty-state { min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8190a5; gap: 8px; border: 1px dashed #d6deea; }
        .print-platform .empty-state svg { font-size: 24px; } .print-platform .empty-state strong { color: #46556b; }
        .print-platform .platform-toast { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); background: #172033; color: white; padding: 11px 18px; border-radius: 7px; z-index: 1000; font-weight: 700; box-shadow: 0 10px 28px rgba(15,23,42,.24); max-width: calc(100vw - 30px); }
        @media (max-width: 1100px) {
          .print-platform .status-grid { grid-template-columns: 1fr 1fr; }
          .print-platform .form-grid.compact { grid-template-columns: 1fr 1fr; }
          .print-platform .assignment-list { grid-template-columns: 1fr; }
        }
        @media (max-width: 700px) {
          .print-platform .surface { padding: 14px; }
          .print-platform .platform-toolbar, .print-platform header { align-items: stretch; }
          .print-platform .platform-toolbar .primary { margin-left: 0; width: 100%; }
          .print-platform .status-grid, .print-platform .form-grid, .print-platform .form-grid.compact, .print-platform .defaults-row { grid-template-columns: 1fr; }
          .print-platform .local-access-notice { grid-template-columns: auto minmax(0, 1fr); }
          .print-platform .local-access-notice .primary { grid-column: 1 / -1; width: 100%; }
          .print-platform .platform-tabs button span { display: none; }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Status({ label, value, ok }) {
  return (
    <div className="status-item">
      <FaCircle className={ok ? 'ok' : 'bad'} />
      <div><span>{label}</span><strong>{value}</strong></div>
      <style jsx>{`
        .status-item { min-height: 74px; display: flex; align-items: center; gap: 10px; padding: 13px; border-right: 1px solid #e1e7ef; }
        .status-item:last-child { border-right: 0; }
        .status-item :global(svg) { font-size: 9px; color: #dc2626; }
        .status-item :global(svg.ok) { color: #10b981; }
        span { display: block; color: #748299; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        strong { display: block; margin-top: 4px; color: #172033; font-size: 13px; }
      `}</style>
    </div>
  );
}

function TagSelector({ label, values, selected, onChange, labels = {} }) {
  const toggle = (value) => onChange(selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]);
  return (
    <div className="tags">
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <button type="button" key={value} className={selected.includes(value) ? 'active' : ''} onClick={() => toggle(value)}>
            {labels[value] || value}
          </button>
        ))}
        {!values.length && <em>No options available</em>}
      </div>
      <style jsx>{`
        .tags { margin-top: 12px; }
        .tags > span { display: block; margin-bottom: 6px; color: #60708a; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .tags > div { display: flex; flex-wrap: wrap; gap: 6px; }
        button { border: 1px solid #d6deea; background: white; color: #526177; border-radius: 5px; padding: 6px 9px; font-size: 11px; font-weight: 750; cursor: pointer; }
        button.active { border-color: #f97316; background: #fff7ed; color: #c2410c; }
        em { color: #8996a8; font-size: 12px; }
      `}</style>
    </div>
  );
}
