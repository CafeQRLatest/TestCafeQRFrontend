import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import {
  FaCashRegister,
  FaCoins,
  FaExchangeAlt,
  FaMoneyBillWave,
  FaPen,
  FaShieldAlt,
  FaTimes,
  FaUndoAlt,
  FaUserClock,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { getCachedConfig } from '../utils/moduleVisibility';
import { formatTzDate } from '../utils/timezoneUtils';
import {
  CASH_DRAWER_TRIGGERS,
  MANUAL_OPEN_REASONS,
  canManuallyOpenDrawer,
  describeDrawerError,
  openCashDrawer,
  readDrawerConfig,
} from '../utils/cashDrawer';

const OTHER = '__other__';

const REASON_ICONS = {
  'Give change': FaExchangeAlt,
  'Cash pickup / drop': FaMoneyBillWave,
  'Float check': FaCoins,
  'Correct previous transaction': FaUndoAlt,
  'Shift handover count': FaUserClock,
};

/**
 * Manual "Open Drawer" (No Sale) button.
 * Renders nothing unless the branch has the cash drawer enabled, this terminal has a drawer,
 * and the user's role has "Open Cash Drawer" (or is ADMIN / SUPER_ADMIN).
 */
export default function CashDrawerButton({ config, compact = false }) {
  const auth = useAuth();
  const { notify } = useNotification() || {};
  const [mounted, setMounted] = useState(false);
  const [, forceRefresh] = useState(0);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [busy, setBusy] = useState(false);
  const [openedAt, setOpenedAt] = useState(null);
  const otherRef = useRef(null);

  useEffect(() => {
    // Render nothing on the server; on the client re-read the cached branch config every render,
    // because the POS screen refreshes it (setCachedConfig) after this button has mounted.
    setMounted(true);
    const refresh = () => forceRefresh((n) => n + 1);
    const timer = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const cachedConfig = mounted ? getCachedConfig() : null;
  const effectiveConfig = config && Object.prototype.hasOwnProperty.call(config, 'cashDrawerEnabled') ? config : cachedConfig;
  const visible = canManuallyOpenDrawer(auth, effectiveConfig);
  const { reasonRequired } = readDrawerConfig(effectiveConfig);
  const finalReason = reason === OTHER ? otherText.trim() : reason;

  const close = useCallback(() => {
    if (busy) return;
    setShowReason(false);
    setReason('');
    setOtherText('');
  }, [busy]);

  const kick = useCallback(async (why) => {
    setBusy(true);
    try {
      const result = await openCashDrawer({ trigger: CASH_DRAWER_TRIGGERS.MANUAL, reason: why });
      if (result.ok) notify?.('success', 'Cash drawer opened');
      else notify?.('error', `Cash drawer did not open. ${describeDrawerError(result.error)}`);
    } finally {
      setBusy(false);
      setShowReason(false);
      setReason('');
      setOtherText('');
    }
  }, [notify]);

  // Keyboard: Esc closes, 1–6 picks a reason, Enter confirms.
  useEffect(() => {
    if (!showReason) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      const typing = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
      if (!typing && /^[1-6]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        setReason(idx < MANUAL_OPEN_REASONS.length ? MANUAL_OPEN_REASONS[idx] : OTHER);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && finalReason && !busy) { e.preventDefault(); kick(finalReason); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showReason, finalReason, busy, close, kick]);

  useEffect(() => {
    if (reason === OTHER) otherRef.current?.focus();
  }, [reason]);

  if (!visible) return null;

  const onClick = (e) => {
    e.stopPropagation();
    if (busy) return;
    if (reasonRequired) {
      setOpenedAt(new Date());
      setShowReason(true);
    } else {
      kick(null);
    }
  };

  const userName = [auth?.firstName, auth?.lastName].filter(Boolean).join(' ') || auth?.email || 'Current user';
  const terminal = auth?.terminalName || 'This terminal';

  const dialog = showReason && (
    <Overlay onClick={(e) => { e.stopPropagation(); close(); }}>
      <Dialog role="dialog" aria-modal="true" aria-labelledby="cash-drawer-reason-title" onClick={(e) => e.stopPropagation()}>
        <Header>
          <HeaderIcon><FaCashRegister size={18} /></HeaderIcon>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="cash-drawer-reason-title">Open cash drawer</h3>
            <span>No Sale — choose why you need the drawer</span>
          </div>
          <CloseBtn type="button" onClick={close} disabled={busy} aria-label="Close">
            <FaTimes size={14} />
          </CloseBtn>
        </Header>

        <MetaRow>
          <span><b>{userName}</b></span>
          <Dot />
          <span>{terminal}</span>
          <Dot />
          <span>{openedAt ? formatTzDate(openedAt, auth?.timezone, { format: 'time' }) : ''}</span>
        </MetaRow>

        <Body>
          <ReasonGrid role="radiogroup" aria-label="Reason">
            {MANUAL_OPEN_REASONS.map((r, i) => {
              const Icon = REASON_ICONS[r] || FaCashRegister;
              const active = reason === r;
              return (
                <ReasonTile key={r} type="button" role="radio" aria-checked={active} $active={active} onClick={() => setReason(r)}>
                  <TileIcon $active={active}><Icon size={14} /></TileIcon>
                  <span className="label">{r}</span>
                  <kbd>{i + 1}</kbd>
                </ReasonTile>
              );
            })}
            <ReasonTile type="button" role="radio" aria-checked={reason === OTHER} $active={reason === OTHER} onClick={() => setReason(OTHER)}>
              <TileIcon $active={reason === OTHER}><FaPen size={13} /></TileIcon>
              <span className="label">Other</span>
              <kbd>{MANUAL_OPEN_REASONS.length + 1}</kbd>
            </ReasonTile>
          </ReasonGrid>

          {reason === OTHER && (
            <OtherWrap>
              <textarea
                ref={otherRef}
                rows={2}
                maxLength={255}
                placeholder="Describe the reason (required)"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
              />
              <small>{otherText.length}/255</small>
            </OtherWrap>
          )}

          <AuditNote>
            <FaShieldAlt size={12} />
            <span>Logged to Cash Drawer History with your name, terminal and time.</span>
          </AuditNote>
        </Body>

        <Footer>
          <GhostBtn type="button" onClick={close} disabled={busy}>Cancel <kbd>Esc</kbd></GhostBtn>
          <PrimaryBtn type="button" disabled={busy || !finalReason} onClick={() => kick(finalReason)}>
            <FaCashRegister size={13} />
            {busy ? 'Opening…' : 'Open drawer'}
          </PrimaryBtn>
        </Footer>
      </Dialog>
    </Overlay>
  );

  return (
    <>
      <DrawerBtn type="button" onClick={onClick} disabled={busy} title="Open cash drawer (No Sale)" aria-label="Open cash drawer">
        <FaCashRegister size={13} />
        {!compact && <span>{busy ? 'Opening…' : 'Drawer'}</span>}
      </DrawerBtn>
      {/* Portal so the popup is never clipped or stacked under POS modals. */}
      {dialog && mounted ? createPortal(dialog, document.body) : null}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const popIn = keyframes`from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; }`;

const DrawerBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  touch-action: manipulation;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    border-color: #f97316;
    background: #fff7ed;
    color: #ea580c;
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  @media (max-width: 580px) {
    height: 30px;
    padding: 0 9px;
    span { display: none; }
  }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10050;
  padding: 16px;
  animation: ${fadeIn} 0.15s ease-out;
`;

const Dialog = styled.div`
  background: #ffffff;
  border-radius: 18px;
  width: 100%;
  max-width: 460px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
  animation: ${popIn} 0.18s ease-out;
  font-family: inherit;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 12px;
  border-top: 4px solid #f97316;

  h3 { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; }
  span { display: block; margin-top: 2px; font-size: 12.5px; color: #64748b; }
`;

const HeaderIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #fff7ed;
  color: #ea580c;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const CloseBtn = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  &:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 18px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  font-size: 12px;
  color: #475569;
  b { color: #0f172a; font-weight: 700; }
`;

const Dot = styled.i`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #cbd5e1;
`;

const Body = styled.div`
  padding: 14px 18px 4px;
  overflow-y: auto;
`;

const ReasonGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  @media (max-width: 420px) { grid-template-columns: 1fr; }
`;

const ReasonTile = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1.5px solid ${({ $active }) => ($active ? '#f97316' : '#e2e8f0')};
  background: ${({ $active }) => ($active ? '#fff7ed' : '#ffffff')};
  box-shadow: ${({ $active }) => ($active ? '0 0 0 3px rgba(249, 115, 22, 0.12)' : 'none')};
  color: #1e293b;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
  touch-action: manipulation;

  .label { flex: 1; font-size: 13.5px; font-weight: 700; line-height: 1.25; }
  kbd {
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 700;
    color: #94a3b8;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 1px 6px;
    background: #f8fafc;
  }
  &:hover { border-color: #fdba74; }
`;

const TileIcon = styled.span`
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${({ $active }) => ($active ? '#f97316' : '#f1f5f9')};
  color: ${({ $active }) => ($active ? '#ffffff' : '#64748b')};
  transition: all 0.12s ease;
`;

const OtherWrap = styled.div`
  position: relative;
  margin-top: 10px;

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: none;
    padding: 10px 12px 18px;
    border-radius: 12px;
    border: 1.5px solid #e2e8f0;
    font-size: 14px;
    font-family: inherit;
    color: #0f172a;
    outline: none;
    &:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12); }
  }
  small { position: absolute; right: 10px; bottom: 6px; font-size: 10.5px; color: #94a3b8; }
`;

const AuditNote = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
  svg { color: #16a34a; flex-shrink: 0; }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px 18px;
`;

const GhostBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 16px;
  border-radius: 11px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  kbd { font-family: inherit; font-size: 10.5px; color: #94a3b8; border: 1px solid #e2e8f0; border-radius: 5px; padding: 1px 5px; }
  &:hover:not(:disabled) { background: #f8fafc; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  @media (max-width: 420px) { kbd { display: none; } }
`;

const PrimaryBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 20px;
  border-radius: 11px;
  border: none;
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(234, 88, 12, 0.25);
  &:hover:not(:disabled) { filter: brightness(1.05); }
  &:disabled { background: #e2e8f0; color: #94a3b8; box-shadow: none; cursor: not-allowed; }
`;
