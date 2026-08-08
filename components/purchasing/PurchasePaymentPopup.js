/**
 * PurchasePaymentPopup.js
 *
 * Compact payment popup for Purchase Orders â€” mirrors the PaymentDialog style.
 * - Compact 340px card with orange theme
 * - Breakdown summary (subtotal + tax)
 * - 2-column grid method buttons (no vertical radio list)
 * - MIXED: per-method amount split panel
 * - CREDIT: "deferred / pending" note
 * - No round-off / discount logic
 */

import React, { useState, useMemo } from 'react';
import { FaTimes, FaWallet, FaBook, FaExclamationTriangle, FaPlus, FaInfoCircle } from 'react-icons/fa';

// â”€â”€â”€ Inline styles (mirrors PaymentDialog.styles.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const css = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1500,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)',
  },
  card: {
    width: 'min(340px,100%)',
    maxHeight: 'calc(100dvh - 40px)',
    overflowY: 'auto',
    background: 'white',
    borderRadius: 20,
    padding: 18,
    boxShadow: '0 20px 50px rgba(15,23,42,0.22)',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  headerTitle: { margin: 0, color: '#0f172a', fontSize: 17, fontWeight: 900 },
  headerSub: { display: 'block', color: '#64748b', fontSize: 11, fontWeight: 700, marginTop: 2 },
  closeBtn: {
    border: 0, background: 'transparent', color: '#94a3b8',
    cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  totalBanner: {
    borderRadius: 12, padding: '12px 14px',
    background: 'linear-gradient(135deg,#f97316,#ea580c)',
    color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  totalBannerLabel: { fontSize: 11, letterSpacing: '0.05em', fontWeight: 800, textTransform: 'uppercase', opacity: 0.9 },
  totalBannerAmt: { fontSize: 22, fontWeight: 900 },
  breakdown: {
    border: '1px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc',
    padding: '10px 12px', display: 'grid', gap: 6,
  },
  row: {
    display: 'flex', justifyContent: 'space-between', gap: 8,
    color: '#64748b', fontSize: 12, fontWeight: 700,
  },
  rowVal: { color: '#0f172a', fontWeight: 800 },
  dividerRow: {
    display: 'flex', justifyContent: 'space-between', gap: 8,
    color: '#64748b', fontSize: 12, fontWeight: 700,
    borderTop: '1px dashed #cbd5e1', paddingTop: 6, marginTop: 2,
  },
  sectionLabel: {
    color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
  },
  // 2-column method grid
  methodGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 },
  methodBtn: (active) => ({
    minHeight: 48, borderRadius: 12,
    border: `1px solid ${active ? '#f97316' : '#e2e8f0'}`,
    background: active ? '#fff7ed' : 'white',
    color: active ? '#ea580c' : '#64748b',
    fontSize: 12, fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    transition: 'all 0.2s ease',
  }),
  // Split panel
  splitPanel: {
    border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc',
    padding: 10, display: 'grid', gap: 8,
  },
  splitRow: { display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 6, alignItems: 'end' },
  fieldLabel: { display: 'grid', gap: 4, color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' },
  fieldInput: {
    border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px',
    color: '#0f172a', fontSize: 13, fontWeight: 700, outline: 'none', minWidth: 0, width: '100%',
  },
  fieldTag: {
    height: 38, display: 'flex', alignItems: 'center', padding: '0 10px',
    background: '#f1f5f9', borderRadius: 8, fontWeight: 700, fontSize: 13,
    color: '#0f172a', border: '1.5px solid #e2e8f0', userSelect: 'none',
  },
  splitFooter: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    color: '#475569', fontSize: 11, fontWeight: 800,
  },
  // Credit note
  creditNote: {
    border: '1px solid #99f6e4', borderRadius: 12, background: '#f0fdfa',
    padding: '10px 12px', color: '#0f766e', fontSize: 12, fontWeight: 700,
  },
  // Error text
  errorText: { color: '#dc2626', fontSize: 11, fontWeight: 800 },
  // No types
  noTypes: {
    padding: 14, background: '#fef2f2', border: '1.5px solid #fecaca',
    borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
  },
  // Actions
  actions: { display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10, marginTop: 6 },
  cancelBtn: {
    border: 0, borderRadius: 12, minHeight: 44, cursor: 'pointer',
    background: '#f1f5f9', color: '#475569', fontSize: 13, fontWeight: 800,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  confirmBtn: (disabled) => ({
    border: 0, borderRadius: 12, minHeight: 44,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#e2e8f0' : 'linear-gradient(135deg,#f97316,#ea580c)',
    color: disabled ? '#94a3b8' : 'white',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    opacity: disabled ? 0.65 : 1, transition: 'all 0.2s ease',
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────────

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (sym, val) =>
  `${sym}${parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PurchasePaymentPopup({
  po,
  payMethodOptions = [],  // Only the payment types configured in Payment Type Master
  currencySymbol = '₹',
  saving = false,
  onClose,
  onConfirm,              // ({ paymentMethod, paymentStatus, paymentSplits? }) => void
}) {
  const grandTotal = parseFloat(po?.grandTotal || 0);
  const subtotal   = parseFloat(po?.totalAmount || 0);
  const tax        = parseFloat(po?.totalTaxAmount || 0);

  // Use only what is set in Payment Type Master
  const options = payMethodOptions;

  const initialMethod = useMemo(() => {
    if (options.length === 0) return '';
    const inList = options.find(o => o.value === po?.paymentMethod);
    return inList ? inList.value : options[0].value;
  }, [options, po?.paymentMethod]);

  const [selectedMethod, setSelectedMethod] = useState(initialMethod);

  // Check if selected method is a Mixed / Split payment
  const isMixed = useMemo(() => {
    const cur = options.find(o => o.value === selectedMethod);
    if (!cur) return false;
    const v = String(cur.value || '').toUpperCase();
    const l = String(cur.label || '').toUpperCase();
    return v === 'MIXED' || l === 'MIXED' || l.includes('MIX') || cur.paymentType === 'MIXED';
  }, [options, selectedMethod]);

  // Check if selected method is Credit
  const isCredit = useMemo(() => {
    const cur = options.find(o => o.value === selectedMethod);
    if (!cur) return false;
    const v = String(cur.value || '').toUpperCase();
    const l = String(cur.label || '').toUpperCase();
    return v === 'CREDIT' || l === 'CREDIT' || cur.paymentType === 'CREDIT';
  }, [options, selectedMethod]);

  // Available methods for splitting in mixed mode
  const splitMethods = useMemo(() => {
    return options.filter(o => {
      const v = String(o.value || '').toUpperCase();
      const l = String(o.label || '').toUpperCase();
      return v !== 'CREDIT' && v !== 'MIXED' && !l.includes('MIX') && o.paymentType !== 'CREDIT' && o.paymentType !== 'MIXED';
    });
  }, [options]);

  const splitDefaults = useMemo(() => {
    if (splitMethods.length < 2) return [];
    return [
      { paymentMethod: splitMethods[0]?.value || '', amount: '' },
      { paymentMethod: splitMethods[1]?.value || '', amount: '' },
    ];
  }, [splitMethods]);

  const [splits, setSplits] = useState(splitDefaults);

  const hasNoTypes = options.length === 0;

  // MIXED validation
  const mixedTotal = splits.reduce((s, sp) => s + toNum(sp.amount), 0);
  const activeSplits = splits.filter(sp => toNum(sp.amount) > 0);
  const mixedInvalid = isMixed && (
    activeSplits.length < 2 ||
    Math.abs(mixedTotal - grandTotal) > 0.01
  );

  const canConfirm = !hasNoTypes && !!selectedMethod && !mixedInvalid;

  const updateSplit = (index, field, value) => {
    if (field === 'amount') {
      const typed = toNum(value);
      const remaining = Number(Math.max(0, grandTotal - typed).toFixed(2));
      setSplits(prev => prev.map((sp, i) => {
        if (i === index) return { ...sp, amount: value };
        if (prev.length === 2) return { ...sp, amount: String(remaining) };
        return sp;
      }));
    } else {
      setSplits(prev => prev.map((sp, i) => i === index ? { ...sp, [field]: value } : sp));
    }
  };

  const chooseMethod = (val) => {
    setSelectedMethod(val);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const paymentStatus = isCredit ? 'PENDING' : 'PAID';
    if (isMixed) {
      const normalised = splits.map(sp => ({
        paymentMethod: sp.paymentMethod,
        amount: Number(toNum(sp.amount).toFixed(2)),
      }));
      onConfirm?.({ paymentMethod: selectedMethod, paymentStatus: 'PAID', paymentSplits: normalised });
    } else {
      onConfirm?.({ paymentMethod: selectedMethod, paymentStatus });
    }
  };

  return (
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={css.card} onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div style={css.header}>
          <div>
            <h2 style={css.headerTitle}>Confirm Purchase</h2>
            <span style={css.headerSub}>
              {po?.orderNo ? `#${po.orderNo}` : 'New PO'} Â· Select payment method
            </span>
          </div>
          <button type="button" style={css.closeBtn} onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        {/* Total banner */}
        <div style={css.totalBanner}>
          <span style={css.totalBannerLabel}>Grand Total</span>
          <strong style={css.totalBannerAmt}>{fmt(currencySymbol, grandTotal)}</strong>
        </div>

        {/* Breakdown */}
        <div style={css.breakdown}>
          <div style={css.row}><span>Subtotal</span><strong style={css.rowVal}>{fmt(currencySymbol, subtotal)}</strong></div>
          {tax > 0 && <div style={css.row}><span>Tax</span><strong style={css.rowVal}>{fmt(currencySymbol, tax)}</strong></div>}
          <div style={css.dividerRow}><span>Grand Total</span><strong style={css.rowVal}>{fmt(currencySymbol, grandTotal)}</strong></div>
        </div>

        {/* Payment Method */}
        {hasNoTypes ? (
          <div style={css.noTypes}>
            <FaExclamationTriangle style={{ color: '#dc2626', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 3 }}>
                No Payment Types Configured
              </div>
              <div style={{ fontSize: 12, color: '#b91c1c', lineHeight: 1.5 }}>
                Set up at least one payment type for <strong>Purchases</strong> in the Payment Type Master.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={css.sectionLabel}>Payment Method</div>
            <div style={css.methodGrid}>
              {options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  style={css.methodBtn(selectedMethod === opt.value)}
                  onClick={() => chooseMethod(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}



        {/* MIXED split panel */}
        {isMixed && (
          <div style={css.splitPanel}>
            {splits.map((split, index) => {
              const label = splitMethods.find(o => o.value === split.paymentMethod)?.label || split.paymentMethod;
              return (
                <div key={index} style={css.splitRow}>
                  <label style={css.fieldLabel}>
                    Method
                    <div style={css.fieldTag}>{label}</div>
                  </label>
                  <label style={css.fieldLabel}>
                    Amount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={split.amount}
                      placeholder="0.00"
                      style={css.fieldInput}
                      onChange={e => updateSplit(index, 'amount', e.target.value)}
                    />
                  </label>
                </div>
              );
            })}
            <div style={css.splitFooter}>
              <span>{fmt(currencySymbol, mixedTotal)} / {fmt(currencySymbol, grandTotal)}</span>
            </div>
          </div>
        )}

        {/* Errors */}
        {mixedInvalid && (
          <div style={css.errorText}>
            {activeSplits.length < 2
              ? 'Enter amounts for at least two methods.'
              : `Split total must equal ${fmt(currencySymbol, grandTotal)}.`}
          </div>
        )}

        {/* Actions */}
        <div style={css.actions}>
          <button type="button" style={css.cancelBtn} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={css.confirmBtn(!canConfirm || saving)}
            disabled={!canConfirm || saving}
            onClick={handleConfirm}
          >
            {saving
              ? 'Saving...'
              : isCredit
                ? <><FaBook /> Complete as Credit</>
                : <><FaWallet /> Confirm Purchase</>
            }
          </button>
        </div>

      </div>
      <style>{`@keyframes pu-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
