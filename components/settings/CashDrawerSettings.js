import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  FaCashRegister,
  FaCheckCircle,
  FaChevronDown,
  FaExclamationTriangle,
  FaMoneyBillWave,
    FaSpinner,
} from 'react-icons/fa';
import NiceSelect from '../NiceSelect';
import {
  CASH_DRAWER_TRIGGERS,
  DEFAULT_HARDWARE,
  describeDrawerError,
  getDrawerHardware,
  openCashDrawer,
  saveDrawerHardware,
} from '../../utils/cashDrawer';


// Pulse strength presets (ESC p t1/t2, units of 2 ms). Custom values stay possible under "Advanced".
const STRENGTHS = [
  { key: 'normal', label: 'Normal', hint: 'Most drawers', onTime: 25, offTime: 250 },
  { key: 'strong', label: 'Strong', hint: 'Stiff latch', onTime: 50, offTime: 250 },
  { key: 'max', label: 'Extra strong', hint: 'Old / heavy drawers', onTime: 100, offTime: 250 },
];

const PINS = [
  { key: '2', label: 'Pin 2 (standard)' },
  { key: '5', label: 'Pin 5' },
  { key: 'both', label: 'Both pins' },
];

function readPrinterNames() {
  if (typeof window === 'undefined') return [];
  const names = [];
  try {
    const arr = JSON.parse(window.localStorage.getItem('PRINT_WIN_PRINTER_NAMES_BILL') || '[]');
    if (Array.isArray(arr)) names.push(...arr);
  } catch { /* ignore */ }
  const single = window.localStorage.getItem('PRINT_WIN_PRINTER_NAME');
  if (single) names.push(single);
  return Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));
}

async function discoverHubPrinters() {
  if (typeof window === 'undefined') return [];
  const url = window.localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return [];
    const list = await resp.json();
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cash drawer settings on the Hardware tab.
 *  • Branch rule (saved with Configuration): which payment types open the drawer.
 *  • This terminal (saved instantly on the device): drawer connected, printer, kick pin, strength, test.
 */
export default function CashDrawerSettings({ enabled, canTest }) {
  const [hw, setHw] = useState(DEFAULT_HARDWARE);
  const [printers, setPrinters] = useState([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const flashTimer = useRef(null);

  useEffect(() => {
    const current = getDrawerHardware();
    setHw(current);
    const known = readPrinterNames();
    setPrinters(known);
    discoverHubPrinters().then((found) => {
      if (found.length) setPrinters((prev) => Array.from(new Set([...prev, ...found])));
    });
    const isPreset = STRENGTHS.some((s) => s.onTime === current.onTime && s.offTime === current.offTime);
    if (!isPreset) setShowAdvanced(true);
    return () => clearTimeout(flashTimer.current);
  }, []);

  // Terminal hardware is saved immediately — nothing to forget to click.
  const updateHw = useCallback((patch) => {
    setHw((prev) => {
      const next = { ...prev, ...patch };
      saveDrawerHardware(next);
      return getDrawerHardware();
    });
    setTestResult(null);
    setSavedFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
  }, []);


  const strength = STRENGTHS.find((s) => s.onTime === hw.onTime && s.offTime === hw.offTime)?.key || 'custom';

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await openCashDrawer({ trigger: CASH_DRAWER_TRIGGERS.TEST, reason: 'Hardware test' });
    setTesting(false);
    setTestResult(res);
  };

  const testDisabledReason = !enabled
    ? 'Turn on Cash Drawer under Configuration first'
    : !hw.enabled
      ? 'Turn on "Drawer connected" above'
      : !canTest
        ? 'Your role needs the "Open Drawer (No Sale)" permission'
        : null;

  const printerOptions = [
    { value: '', label: 'Same as bill printer' },
    ...printers.map((p) => ({ value: p, label: p })),
    ...(hw.printerName && !printers.includes(hw.printerName) ? [{ value: hw.printerName, label: hw.printerName }] : []),
  ];

  return (
    <Card>
      <CardHead>
        <HeadIcon><FaCashRegister size={18} /></HeadIcon>
        <div className="head-text">
          <div className="title-row">
            <h3>Cash Drawer</h3>
            <StatusPill $on={enabled}>
              <i /> {enabled ? 'On for this branch' : 'Off for this branch'}
            </StatusPill>
          </div>
          <p>Drawer plugged into the receipt printer&apos;s drawer port (RJ11 / &quot;DK&quot;). The POS asks the printer to pop it open.</p>
        </div>
      </CardHead>

      {!enabled && (
        <Banner>
          <FaExclamationTriangle size={13} />
          <span>Cash Drawer is turned off. Switch it on in <b>Configuration → Cash Drawer</b>, then press <b>Save</b>.</span>
        </Banner>
      )}

      <RuleNote>
        <FaMoneyBillWave size={14} />
        <span>The drawer opens automatically only when cash is taken — <b>Cash</b> payments and <b>split payments with a cash part</b>. Card, UPI, online and credit sales never open it.</span>
      </RuleNote>

      {/* ── 2. This terminal ────────────────────────────────────────── */}
      <Section>
        <SectionTitle>
          <Step>1</Step>
          <div>
            <strong>This terminal</strong>
            <span>Saved instantly on this device only. Set this up on each till that has a drawer.</span>
          </div>
          <SavedTag $show={savedFlash}><FaCheckCircle size={11} /> Saved</SavedTag>
        </SectionTitle>

        <Row>
          <RowText>
            <b>Drawer connected</b>
            <span>Turn off on terminals without a drawer — they will never send a kick.</span>
          </RowText>
          <Switch type="button" role="switch" aria-checked={hw.enabled} $on={hw.enabled} onClick={() => updateHw({ enabled: !hw.enabled })}>
            <i />
          </Switch>
        </Row>

        <Fade $dim={!hw.enabled}>
          <FieldGrid className="template-configuration-section">
            <div className="input-group">
              <label className="group-lbl">Drawer is plugged into</label>
              <NiceSelect
                options={printerOptions}
                value={hw.printerName || ''}
                onChange={(v) => updateHw({ printerName: v })}
                disabled={!hw.enabled}
              />
              <small className="field-hint">Recommended. Change only if the drawer is on a different printer.</small>
            </div>

            <div className="input-group">
              <label className="group-lbl">Drawer connector</label>
              <NiceSelect
                options={PINS.map((p) => ({ value: p.key, label: p.label }))}
                value={hw.pin}
                onChange={(v) => updateHw({ pin: v })}
                disabled={!hw.enabled}
              />
              <small className="field-hint">Most drawers use pin 2. Not sure? Choose &quot;Both pins&quot;.</small>
            </div>

            <div className="input-group">
              <label className="group-lbl">Kick strength</label>
              <NiceSelect
                options={[
                  ...STRENGTHS.map((st) => ({ value: st.key, label: st.label })),
                  { value: 'custom', label: 'Custom timing' },
                ]}
                value={strength}
                onChange={(v) => {
                  if (v === 'custom') { setShowAdvanced(true); return; }
                  const st = STRENGTHS.find((x) => x.key === v);
                  if (st) updateHw({ onTime: st.onTime, offTime: st.offTime });
                }}
                disabled={!hw.enabled}
              />
              <small className="field-hint">{(STRENGTHS.find((x) => x.key === strength) || { hint: 'Custom pulse timing' }).hint}. Use Strong if the drawer only clicks.</small>
              <AdvancedToggle type="button" onClick={() => setShowAdvanced((v) => !v)} $open={showAdvanced}>
                Advanced timing {strength === 'custom' ? '(custom)' : ''} <FaChevronDown size={10} />
              </AdvancedToggle>
            </div>
          </FieldGrid>

          {showAdvanced && (
            <FieldGrid className="template-configuration-section" style={{ marginTop: 12 }}>
              <div className="input-group">
                <label className="group-lbl">Pulse on (×2 ms)</label>
                <input type="number" className="form-input" min={1} max={255} value={hw.onTime}
                  onChange={(e) => updateHw({ onTime: e.target.value })} disabled={!hw.enabled} />
                <small className="field-hint">{Number(hw.onTime) * 2} ms</small>
              </div>
              <div className="input-group">
                <label className="group-lbl">Pulse off (×2 ms)</label>
                <input type="number" className="form-input" min={1} max={255} value={hw.offTime}
                  onChange={(e) => updateHw({ offTime: e.target.value })} disabled={!hw.enabled} />
                <small className="field-hint">{Number(hw.offTime) * 2} ms</small>
              </div>
            </FieldGrid>
          )}
        </Fade>
      </Section>

      {/* ── 3. Test ─────────────────────────────────────────────────── */}
      <Section $last>
        <SectionTitle>
          <Step>2</Step>
          <div>
            <strong>Test the drawer</strong>
            <span>Sends one kick to the printer. The test is recorded in Cash Drawer History.</span>
          </div>
        </SectionTitle>

        <TestRow>
          <TestBtn type="button" onClick={runTest} disabled={testing || Boolean(testDisabledReason)}>
            {testing ? <FaSpinner className="spin" size={13} /> : <FaCashRegister size={13} />}
            {testing ? 'Sending…' : 'Open drawer now'}
          </TestBtn>
          {testDisabledReason && <small className="why">{testDisabledReason}</small>}
        </TestRow>

        {testResult && (
          testResult.ok ? (
            <Result $ok>
              <FaCheckCircle size={14} />
              <div>
                <b>Kick sent{testResult.via ? ` via ${testResult.via}` : ''}.</b>
                <span>Drawer didn&apos;t pop? Try <b>Both</b> connectors, then <b>Strong</b>. Check the drawer cable is in the printer&apos;s DK port, not a phone/LAN port.</span>
              </div>
            </Result>
          ) : (
            <Result>
              <FaExclamationTriangle size={14} />
              <div>
                <b>The drawer did not open.</b>
                <span>{describeDrawerError(testResult.error)} The drawer itself has no setup — once the bill printer prints a test receipt, the drawer will open too.</span>
              </div>
            </Result>
          )
        )}
      </Section>
    </Card>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const Card = styled.div`
  margin-top: 20px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-top: 3px solid #f97316;
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  overflow: hidden;
`;

const CardHead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px 14px;
  .head-text { flex: 1; min-width: 0; }
  .title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; }
  h3 { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; }
  @media (max-width: 480px) { padding: 16px 14px 12px; }
  p { margin: 3px 0 0; font-size: 12.5px; color: #64748b; line-height: 1.45; }
`;

const HeadIcon = styled.div`
  width: 42px; height: 42px; border-radius: 12px;
  background: #fff7ed; color: #ea580c;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
`;

const StatusPill = styled.span`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap;
  color: ${({ $on }) => ($on ? '#15803d' : '#b45309')};
  background: ${({ $on }) => ($on ? '#f0fdf4' : '#fffbeb')};
  border: 1px solid ${({ $on }) => ($on ? '#bbf7d0' : '#fde68a')};
  i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
`;

const Banner = styled.div`
  display: flex; align-items: center; gap: 8px;
  margin: 0 20px 6px; padding: 10px 12px; border-radius: 10px;
  @media (max-width: 480px) { margin: 0 14px 6px; }
  background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 13px;
  svg { flex-shrink: 0; }
`;

const RuleNote = styled.div`
  display: flex; align-items: flex-start; gap: 10px;
  margin: 0 20px 16px; padding: 12px 14px; border-radius: 12px;
  @media (max-width: 480px) { margin: 0 14px 14px; }
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 13px; line-height: 1.45;
  svg { flex-shrink: 0; margin-top: 2px; color: #16a34a; }
`;

const Section = styled.div`
  padding: 16px 20px ${({ $last }) => ($last ? '20px' : '16px')};
  border-top: 1px solid #f1f5f9;
  @media (max-width: 480px) { padding-left: 14px; padding-right: 14px; }
`;

const SectionTitle = styled.div`
  display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;
  strong { display: block; font-size: 14.5px; color: #0f172a; font-weight: 800; }
  span { display: block; font-size: 12px; color: #64748b; margin-top: 2px; }
`;

const Step = styled.span`
  && {
    width: 24px; height: 24px; border-radius: 50%; margin: 0;
    background: #0f172a; color: #ffffff; font-size: 12px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
`;

const SavedTag = styled.span`
  && {
    margin: 0 0 0 auto; display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 700; color: #15803d; white-space: nowrap;
    opacity: ${({ $show }) => ($show ? 1 : 0)}; transition: opacity 0.25s ease;
  }
`;






const Row = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #f1f5f9;
`;

const RowText = styled.div`
  b { display: block; font-size: 14px; color: #0f172a; }
  span { display: block; font-size: 12px; color: #64748b; margin-top: 2px; }
`;

const Switch = styled.button`
  position: relative; width: 46px; height: 26px; border-radius: 999px; border: none; cursor: pointer; flex-shrink: 0;
  background: ${({ $on }) => ($on ? '#f97316' : '#cbd5e1')}; transition: background 0.15s ease;
  i {
    position: absolute; top: 3px; left: ${({ $on }) => ($on ? '23px' : '3px')};
    width: 20px; height: 20px; border-radius: 50%; background: #ffffff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25); transition: left 0.15s ease;
  }
`;

const Fade = styled.div`
  opacity: ${({ $dim }) => ($dim ? 0.45 : 1)};
  pointer-events: ${({ $dim }) => ($dim ? 'none' : 'auto')};
  transition: opacity 0.15s ease;
`;




const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
  .field-hint { font-size: 11.5px; color: #94a3b8; margin-top: -2px; }
  .nice-select-trigger { min-height: 48px; }
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const AdvancedToggle = styled.button`
  align-self: flex-start; margin-top: 0; padding: 0; border: none; background: none; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #64748b;
  svg { transition: transform 0.15s ease; transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')}); }
  &:hover { color: #ea580c; }
`;



const TestRow = styled.div`
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  .why { font-size: 12px; color: #b45309; }
  .spin { animation: cdspin 0.8s linear infinite; }
  @keyframes cdspin { to { transform: rotate(360deg); } }
`;

const TestBtn = styled.button`
  display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 20px;
  border-radius: 11px; border: none; cursor: pointer; font-size: 14px; font-weight: 800; color: #ffffff;
  background: linear-gradient(135deg, #f97316, #ea580c); box-shadow: 0 6px 14px rgba(234, 88, 12, 0.22);
  &:hover:not(:disabled) { filter: brightness(1.05); }
  &:disabled { background: #e2e8f0; color: #94a3b8; box-shadow: none; cursor: not-allowed; }
`;

const Result = styled.div`
  display: flex; align-items: flex-start; gap: 10px; margin-top: 12px; padding: 12px 14px; border-radius: 12px;
  background: ${({ $ok }) => ($ok ? '#f0fdf4' : '#fef2f2')};
  border: 1px solid ${({ $ok }) => ($ok ? '#bbf7d0' : '#fecaca')};
  color: ${({ $ok }) => ($ok ? '#15803d' : '#b91c1c')};
  svg { flex-shrink: 0; margin-top: 2px; }
  b { display: block; font-size: 13.5px; }
  span { display: block; font-size: 12.5px; color: #475569; margin-top: 3px; line-height: 1.45; }
`;
