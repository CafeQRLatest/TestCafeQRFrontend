import { useCallback, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import {
  FaAndroid,
  FaCheckCircle,
  FaCircle,
  FaCog,
  FaDownload,
  FaExclamationTriangle,
  FaNetworkWired,
  FaPlus,
  FaPrint,
  FaRoute,
  FaServer,
  FaSync,
  FaTrash,
} from 'react-icons/fa';
import api from '../utils/api';
import {
  enrollNativePrintService,
  getLocalPrintJobs,
  getPrintServiceLogs,
  getPrintServiceHealth,
  getPrintServicePrinters,
  isNativePrintServicePaired,
  resolveLocalPrintJob,
  retryLocalPrintJob,
  submitNativePrintJob,
  updateNativePrintConfiguration,
} from '../utils/printServiceClient';
import PrinterSetupCard from './PrinterSetupCard';

const newId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
  thermalTemplate: {
    preset: '58MM',
    widthMm: 58,
    columns: 32,
    printableDots: 384,
    leftMargin: 0,
    rightMargin: 0,
    lineSpacing: 0,
    autoCut: true,
    feedLines: 3,
  },
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

export default function PrintPlatformSetup({ restaurantId, config: legacyConfig, onConfigChange }) {
  const [tab, setTab] = useState('service');
  const [printConfig, setPrintConfig] = useState(DEFAULT_CONFIG);
  const [health, setHealth] = useState(null);
  const [localPrinters, setLocalPrinters] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [stations, setStations] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [scopeType, setScopeType] = useState('TERMINAL');
  const [scopeId, setScopeId] = useState(Cookies.get('terminalId') || '');
  const [stationName, setStationName] = useState(`${Cookies.get('terminalName') || 'POS'} Print Station`);
  const [fallback, setFallback] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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

  const refreshService = useCallback(async () => {
    try {
      const result = await getPrintServiceHealth();
      setHealth(result);
      const printers = await getPrintServicePrinters().catch(() => []);
      setLocalPrinters(Array.isArray(printers) ? printers : []);
      if (isNativePrintServicePaired()) {
        const rows = await getLocalPrintJobs().catch(() => []);
        setJobs(Array.isArray(rows) ? rows : []);
      }
    } catch {
      setHealth(null);
      setLocalPrinters([]);
    }
  }, []);

  const loadCloud = useCallback(async () => {
    const terminalId = Cookies.get('terminalId') || '';
    const requests = [
      api.get('/api/v1/print-configurations/effective', {
        params: { terminalId: terminalId || undefined, orgId: currentOrgId || undefined },
      }),
      api.get('/api/v1/print-stations').catch(() => ({ data: { data: [] } })),
      api.get('/api/v1/terminals').catch(() => ({ data: { data: [] } })),
      api.get('/api/v1/products/categories').catch(() => ({ data: { data: [] } })),
    ];
    const [configuration, stationRows, terminalRows, categoryRows] = await Promise.all(requests);
    setPrintConfig(deepMerge(DEFAULT_CONFIG, configuration.data?.data || {}));
    setStations(stationRows.data?.data || []);
    setTerminals(terminalRows.data?.data || []);
    setCategories((categoryRows.data?.data || []).map((row) => row?.name).filter(Boolean));
  }, [currentOrgId]);

  useEffect(() => {
    refreshService();
    loadCloud().catch((error) => showMessage(error?.response?.data?.message || error.message));
    const timer = window.setInterval(refreshService, 10000);
    return () => window.clearInterval(timer);
  }, [loadCloud, refreshService]);

  const sessionAwareMessage = (error, fallback) => {
    if ([401, 403].includes(error?.response?.status)) {
      return 'Your login session has expired or cannot edit this configuration. Sign in again, then retry.';
    }
    return error?.response?.data?.message || error.message || fallback;
  };

  const persistConfiguration = async (candidate = printConfig) => {
    const validationError = assignmentValidationError(candidate);
    if (validationError) throw new Error(validationError);

    const settings = sanitizeConfiguration(candidate);
    const resolvedScopeId = scopeType === 'CLIENT'
      ? null
      : scopeType === 'ORGANIZATION'
        ? currentOrgId
        : (scopeId || Cookies.get('terminalId'));
    const { data } = await api.put('/api/v1/print-configurations', {
      scopeType,
      scopeId: resolvedScopeId || null,
      orgId: currentOrgId || null,
      settings,
    });
    const effective = sanitizeConfiguration(deepMerge(DEFAULT_CONFIG, data?.data || settings));
    setPrintConfig(effective);
    if (isNativePrintServicePaired()) {
      await updateNativePrintConfiguration(effective);
    }
    return effective;
  };

  const saveConfiguration = async () => {
    setBusy(true);
    try {
      await persistConfiguration();
      showMessage('Printing configuration saved and applied to the Windows Print Service.');
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
      await refreshService();
      await loadCloud();
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
      await persistConfiguration();
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
      showMessage(`Saved and queued a test print for ${profileDisplayLabel(profile)}.`);
      await refreshService();
    } catch (error) {
      showMessage(sessionAwareMessage(error, 'Unable to save and submit the test print.'));
    } finally {
      setBusy(false);
    }
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

  const setTemplate = (kind, key, value) => setPrintConfig((previous) => ({
    ...previous,
    [kind]: { ...previous[kind], [key]: value },
  }));

  const tabs = [
    ['service', 'Print Service', <FaServer key="service" />],
    ['profiles', 'Printer Profiles', <FaPrint key="profiles" />],
    ['assignments', 'Default Printers', <FaCheckCircle key="assignments" />],
    ['routing', 'Routing', <FaRoute key="routing" />],
    ['templates', 'Templates & Paper', <FaCog key="templates" />],
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
                  if (value === 'TERMINAL') setScopeId(Cookies.get('terminalId') || terminals[0]?.id || '');
                }}
              >
                {value === 'CLIENT' ? 'Organization' : value === 'ORGANIZATION' ? 'Branch' : 'Terminal'}
              </button>
            ))}
          </div>
        </div>
        {scopeType === 'TERMINAL' && (
          <label className="field terminal-field">
            <span>Terminal</span>
            <select value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
              <option value="">Select terminal</option>
              {terminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>{terminal.name}</option>
              ))}
            </select>
          </label>
        )}
        <button className="primary" onClick={saveConfiguration} disabled={busy || routeConflicts.size > 0}>
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
              <button className="secondary" onClick={downloadLogs} disabled={!health}>Download logs</button>
              <button className="secondary" onClick={refreshService}><FaSync /> Refresh</button>
            </div>
          </header>

          <div className="status-grid">
            <Status label="Service" value={health ? 'Online' : 'Not reachable'} ok={Boolean(health)} />
            <Status label="Pairing" value={health?.paired ? 'Paired' : 'Not paired'} ok={Boolean(health?.paired)} />
            <Status label="Local queue" value={`${health?.queueDepth || 0} jobs`} ok={(health?.queueDepth || 0) === 0} />
            <Status label="Version" value={health?.version || 'Unknown'} ok={Boolean(health?.version)} />
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Terminal</span>
              <select value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
                <option value="">Select terminal</option>
                {terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}
              </select>
            </label>
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
            <button className="primary" onClick={pairThisComputer} disabled={busy || !health}>Pair this computer</button>
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
                    <select value={profile.connectionType} onChange={(event) => updateProfile(profile.id, { connectionType: event.target.value })}>
                      <option value="WINDOWS_QUEUE">Windows queue (USB/Bluetooth/LAN)</option>
                      <option value="NETWORK">Direct LAN/Wi-Fi TCP</option>
                      <option value="BLUETOOTH_COM">Bluetooth COM</option>
                    </select>
                  </Field>
                  <Field label="Format">
                    <select value={profile.format} onChange={(event) => updateProfile(profile.id, { format: event.target.value })}>
                      <option value="THERMAL">Thermal</option>
                      <option value="REGULAR">Regular page</option>
                    </select>
                  </Field>
                  {profile.connectionType === 'WINDOWS_QUEUE' && (
                    <Field label="Windows printer">
                      <select value={profile.windowsPrinterName || ''} onChange={(event) => updateProfile(profile.id, { windowsPrinterName: event.target.value })}>
                        <option value="">Select installed printer</option>
                        {localPrinters.filter((row) => row.connectionType === 'WINDOWS_QUEUE').map((row) => (
                          <option key={row.name} value={row.name}>{row.name}</option>
                        ))}
                      </select>
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
                        <select value={profile.comPort || ''} onChange={(event) => updateProfile(profile.id, { comPort: event.target.value })}>
                          <option value="">Select paired COM port</option>
                          {localPrinters.filter((row) => row.connectionType === 'BLUETOOTH_COM').map((row) => (
                            <option key={row.name} value={row.name}>{row.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Baud rate"><input type="number" value={profile.baudRate || 9600} onChange={(event) => updateProfile(profile.id, { baudRate: Number(event.target.value) })} /></Field>
                    </>
                  )}
                  <Field label="Paper">
                    <select value={profile.paperPreset} onChange={(event) => {
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
                      updateProfile(profile.id, { paperPreset: event.target.value, ...presets[event.target.value] });
                    }}>
                      {profile.format === 'THERMAL' ? (
                        <>
                          <option value="58MM">2 inch / 58 mm</option>
                          <option value="80MM">3 inch / 80 mm</option>
                          <option value="4IN">4 inch</option>
                          <option value="CUSTOM">Custom</option>
                        </>
                      ) : (
                        <>
                          <option value="A4">A4</option><option value="A5">A5</option>
                          <option value="LETTER">Letter</option><option value="LEGAL">Legal</option>
                          <option value="CUSTOM">Driver custom form</option>
                        </>
                      )}
                    </select>
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
                  <button className="secondary test" onClick={() => testProfile(profile)} disabled={!health?.paired || busy}>Save & Test</button>
                </div>
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
                      <select value={printConfig.defaults[outputKey]} onChange={(event) => setDefault(outputKey, event.target.value)}>
                        <option value="THERMAL">Thermal</option>
                        <option value="REGULAR">Regular</option>
                        <option value="BOTH">Both</option>
                      </select>
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
          <header>
            <div><h3>Print Routing</h3><p>Route by document, category, order type, priority, and mirror or failover behavior.</p></div>
            <button className="secondary" onClick={addRoute}><FaPlus /> Add route</button>
          </header>
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
                    <select value={route.mode} onChange={(event) => updateRoute(route.id, { mode: event.target.value })}>
                      <option value="FAILOVER">Failover in order</option><option value="MIRROR">Print to all</option>
                    </select>
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

      {tab === 'templates' && (
        <section className="surface">
          <header><div><h3>Templates & Paper</h3><p>Configure width-aware thermal output and the detailed regular tax invoice.</p></div></header>
          <div className="template-grid">
            <div className="template-editor">
              <h4>Thermal printer</h4>
              <div className="paper-presets">
                {[['58MM', '2 inch', 58, 32, 384], ['80MM', '3 inch', 80, 48, 576], ['4IN', '4 inch', 101.6, 64, 832], ['CUSTOM', 'Custom', printConfig.thermalTemplate.widthMm, printConfig.thermalTemplate.columns, printConfig.thermalTemplate.printableDots]].map(([preset, label, width, columns, dots]) => (
                  <button key={preset} className={printConfig.thermalTemplate.preset === preset ? 'active' : ''} onClick={() => setPrintConfig((previous) => ({
                    ...previous,
                    thermalTemplate: { ...previous.thermalTemplate, preset, widthMm: width, columns, printableDots: dots },
                  }))}>{label}</button>
                ))}
              </div>
              <div className="form-grid compact">
                <Field label="Width (mm)"><input type="number" value={printConfig.thermalTemplate.widthMm} onChange={(event) => setTemplate('thermalTemplate', 'widthMm', Number(event.target.value))} /></Field>
                <Field label="Columns"><input type="number" value={printConfig.thermalTemplate.columns} onChange={(event) => setTemplate('thermalTemplate', 'columns', Number(event.target.value))} /></Field>
                <Field label="Printable dots"><input type="number" value={printConfig.thermalTemplate.printableDots} onChange={(event) => setTemplate('thermalTemplate', 'printableDots', Number(event.target.value))} /></Field>
                <Field label="Feed lines"><input type="number" value={printConfig.thermalTemplate.feedLines} onChange={(event) => setTemplate('thermalTemplate', 'feedLines', Number(event.target.value))} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={printConfig.thermalTemplate.autoCut} onChange={(event) => setTemplate('thermalTemplate', 'autoCut', event.target.checked)} /><span>Auto-cut after print</span></label>
              <ThermalPreview settings={printConfig.thermalTemplate} />
            </div>
            <div className="template-editor">
              <h4>Regular printer</h4>
              <div className="form-grid compact">
                <Field label="Paper">
                  <select value={printConfig.regularTemplate.paperPreset} onChange={(event) => setTemplate('regularTemplate', 'paperPreset', event.target.value)}>
                    <option value="A4">A4</option><option value="A5">A5</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option><option value="CUSTOM">Custom driver form</option>
                  </select>
                </Field>
                <Field label="Orientation">
                  <select value={printConfig.regularTemplate.orientation} onChange={(event) => setTemplate('regularTemplate', 'orientation', event.target.value)}>
                    <option value="PORTRAIT">Portrait</option><option value="LANDSCAPE">Landscape</option>
                  </select>
                </Field>
                <Field label="Width (mm)"><input type="number" value={printConfig.regularTemplate.widthMm} onChange={(event) => setTemplate('regularTemplate', 'widthMm', Number(event.target.value))} /></Field>
                <Field label="Height (mm)"><input type="number" value={printConfig.regularTemplate.heightMm} onChange={(event) => setTemplate('regularTemplate', 'heightMm', Number(event.target.value))} /></Field>
                <Field label="Margins (mm)"><input type="number" value={printConfig.regularTemplate.marginMm} onChange={(event) => setTemplate('regularTemplate', 'marginMm', Number(event.target.value))} /></Field>
                <Field label="Paper source"><input value={printConfig.regularTemplate.paperSource || ''} onChange={(event) => setTemplate('regularTemplate', 'paperSource', event.target.value)} placeholder="Driver default" /></Field>
                <Field label="Scaling (%)"><input type="number" min="50" max="200" value={printConfig.regularTemplate.scaling || 100} onChange={(event) => setTemplate('regularTemplate', 'scaling', Number(event.target.value))} /></Field>
                <Field label="Colour mode">
                  <select value={printConfig.regularTemplate.colorMode} onChange={(event) => setTemplate('regularTemplate', 'colorMode', event.target.value)}>
                    <option value="GRAYSCALE">Grayscale</option><option value="COLOR">Colour</option>
                  </select>
                </Field>
              </div>
              <div className="option-grid">
                {[
                  ['showLogo', 'Logo'], ['showCustomer', 'Customer'], ['showTax', 'GST / Tax'],
                  ['showHsnSac', 'HSN / SAC'], ['showUnits', 'Units'], ['showDiscounts', 'Discounts'],
                  ['showPayment', 'Payment'], ['showAmountInWords', 'Amount in words'],
                  ['showTerms', 'Terms'], ['showFooter', 'Footer'], ['showSignature', 'Signature'],
                ].map(([key, label]) => (
                  <label className="check" key={key}>
                    <input type="checkbox" checked={printConfig.regularTemplate[key]} onChange={(event) => setTemplate('regularTemplate', key, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="form-grid template-copy">
                <Field label="Terms"><textarea rows="3" value={printConfig.regularTemplate.terms || ''} onChange={(event) => setTemplate('regularTemplate', 'terms', event.target.value)} /></Field>
                <Field label="Footer"><textarea rows="3" value={printConfig.regularTemplate.footer || ''} onChange={(event) => setTemplate('regularTemplate', 'footer', event.target.value)} /></Field>
              </div>
              <RegularPreview settings={printConfig.regularTemplate} />
            </div>
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
        .print-platform .status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #e1e7ef; margin-bottom: 20px; }
        .print-platform .form-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
        .print-platform .form-grid.compact { grid-template-columns: repeat(4, minmax(0,1fr)); }
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
        .print-platform .template-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .print-platform .template-editor { min-width: 0; }
        .print-platform .template-editor + .template-editor { border-left: 1px solid #e1e7ef; padding-left: 24px; }
        .print-platform .paper-presets { display: flex; gap: 7px; margin: 14px 0; flex-wrap: wrap; }
        .print-platform .paper-presets button { border: 1px solid #d6deea; background: white; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; color: #506077; }
        .print-platform .paper-presets button.active { border-color: #f97316; color: #f97316; background: #fff7ed; }
        .print-platform .option-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 14px; }
        .print-platform .template-copy { margin-top: 14px; grid-template-columns: 1fr 1fr; }
        .print-platform .platform-toast { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); background: #172033; color: white; padding: 11px 18px; border-radius: 7px; z-index: 1000; font-weight: 700; box-shadow: 0 10px 28px rgba(15,23,42,.24); max-width: calc(100vw - 30px); }
        @media (max-width: 1100px) {
          .print-platform .status-grid { grid-template-columns: 1fr 1fr; }
          .print-platform .form-grid.compact { grid-template-columns: 1fr 1fr; }
          .print-platform .assignment-list { grid-template-columns: 1fr; }
          .print-platform .template-grid { grid-template-columns: 1fr; }
          .print-platform .template-editor + .template-editor { border-left: 0; border-top: 1px solid #e1e7ef; padding: 20px 0 0; }
        }
        @media (max-width: 700px) {
          .print-platform .surface { padding: 14px; }
          .print-platform .platform-toolbar, .print-platform header { align-items: stretch; }
          .print-platform .platform-toolbar .primary { margin-left: 0; width: 100%; }
          .print-platform .status-grid, .print-platform .form-grid, .print-platform .form-grid.compact, .print-platform .defaults-row { grid-template-columns: 1fr; }
          .print-platform .platform-tabs button span { display: none; }
          .print-platform .option-grid { grid-template-columns: 1fr; }
          .print-platform .template-copy { grid-template-columns: 1fr; }
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
        button { border: 1px solid #d6deea; background: white; color: #526177; border-radius: 5px; padding: 6px 9px; font-size: 11px; font-weight: 700; cursor: pointer; }
        button.active { border-color: #f97316; background: #fff7ed; color: #c2410c; }
        em { color: #8996a8; font-size: 12px; }
      `}</style>
    </div>
  );
}

function ThermalPreview({ settings }) {
  const width = Math.max(180, Math.min(360, Number(settings.widthMm || 58) * 3.2));
  return (
    <div className="thermal-preview" style={{ width }}>
      <strong>{Cookies.get('orgName') || 'CAFEQR RESTAURANT'}</strong>
      <span>*** KOT / RECEIPT PREVIEW ***</span>
      <hr />
      <p>1 x Sample menu item</p>
      <p>2 x Kitchen preparation item</p>
      <hr />
      <b>TOTAL ₹ 350.00</b>
      <small>{settings.columns} columns · {settings.widthMm} mm</small>
      <style jsx>{`
        .thermal-preview { max-width: 100%; margin: 18px auto 0; padding: 20px 14px; background: white; border: 1px solid #cfd7e3; box-shadow: 0 5px 14px rgba(15,23,42,.08); font-family: monospace; text-align: center; box-sizing: border-box; }
        span, small { display: block; margin-top: 7px; font-size: 10px; } p { margin: 7px 0; text-align: left; font-size: 11px; } hr { border: 0; border-top: 1px dashed #64748b; }
      `}</style>
    </div>
  );
}

function RegularPreview({ settings }) {
  return (
    <div className={`regular-preview ${settings.orientation === 'LANDSCAPE' ? 'landscape' : ''}`}>
      {settings.showLogo && <div className="logo">C</div>}
      <strong>{Cookies.get('orgName') || 'CafeQR Restaurant'}</strong>
      <span>TAX INVOICE</span>
      <div className="meta"><b>Invoice:</b> INV-000001 <b>Date:</b> 06 Jun 2026</div>
      {settings.showCustomer && <div className="meta"><b>Customer:</b> Sample Customer</div>}
      <table><tbody>
        <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Tax</th><th>Amount</th></tr>
        <tr><td>Sample menu item</td><td>2</td><td>150.00</td><td>15.00</td><td>315.00</td></tr>
      </tbody></table>
      <div className="total">Total ₹315.00</div>
      {settings.showTerms && <small>Terms and conditions</small>}
      {settings.showFooter && <small>{settings.footer}</small>}
      <style jsx>{`
        .regular-preview { width: min(100%, 390px); aspect-ratio: 210 / 297; margin: 18px auto 0; border: 1px solid #cfd7e3; background: white; padding: 22px; box-sizing: border-box; box-shadow: 0 5px 14px rgba(15,23,42,.08); text-align: center; font-size: 9px; }
        .regular-preview.landscape { aspect-ratio: 297 / 210; }
        .logo { width: 28px; height: 28px; display: grid; place-items: center; margin: auto auto 5px; background: #f97316; color: white; font-weight: 900; }
        span, small { display: block; margin-top: 5px; } .meta { margin-top: 12px; text-align: left; display: flex; gap: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; } th, td { border-bottom: 1px solid #cfd7e3; padding: 5px 2px; text-align: right; } th:first-child, td:first-child { text-align: left; }
        .total { margin-top: 12px; text-align: right; font-size: 12px; font-weight: 900; }
      `}</style>
    </div>
  );
}
