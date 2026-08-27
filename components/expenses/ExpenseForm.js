import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CafeQRPopup from '../CafeQRPopup';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';
import { SCOPE_ALL, SCOPE_GLOBAL } from '../../constants/expenseScopes';
import { useAuth } from '../../context/AuthContext';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';
import { useNotification } from '../../context/NotificationContext';
import { FaEdit, FaPlus } from 'react-icons/fa';
import styles from './Expenses.module.css';
import api from '../../utils/api';

/**
 * Timezone-safe "business now" using the IANA Intl API.
 */
function getBusinessNow(timezone) {
  if (!timezone) return new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
  } catch {
    return new Date();
  }
}

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Self-contained expense form modal.
 *
 * Props (11 instead of ~20):
 *   editing         — null (new) or expense object (edit, used for initialization)
 *   formCategories  — category options scoped to current branch
 *   branches        — branch options for the scope selector
 *   isSuperAdmin    — controls scope selector visibility
 *   saving          — bool passed from the hook to disable the save button
 *   pendingCatId    — set by the hook when a new category is created; form auto-selects it
 *   defaultBranchId — initial branch (orgId or GLOBAL); provided by the page
 *   onBranchChange  — called when the user changes scope so the hook reloads categories
 *   onSubmit        — receives the assembled, validated payload
 *   onClose         — close / cancel handler
 *   onOpenCatMgr    — opens the CategoryManager modal
 */
export default function ExpenseForm({
  editing,
  formCategories,
  branches,
  isSuperAdmin,
  saving,
  pendingCatId,
  defaultBranchId,
  onBranchChange,
  onSubmit,
  onClose,
  onOpenCatMgr
}) {
  const { timezone, orgId, orgName } = useAuth();
  const currencySymbol = useCurrencySymbol();
  const { notify } = useNotification();


  // ── Internal form field state ───────────────────────────────────────────────
  const [fDate,     setFDate]     = useState('');
  const [fTime,     setFTime]     = useState('');
  const [fCatId,    setFCatId]    = useState('');
  const [fAmount,   setFAmount]   = useState('');
  const [fDesc,     setFDesc]     = useState('');
  const [fMethod,   setFMethod]   = useState('CASH');
  const [fBranchId, setFBranchId] = useState('');
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');

  useEffect(() => {
    let active = true;
    const targetBranch = fBranchId || orgId;
    const orgParam = (targetBranch && targetBranch !== SCOPE_GLOBAL) ? `&orgId=${targetBranch}` : '';
    api.get(`/api/v1/payment-types?applicableFor=EXPENSES${orgParam}`)
      .then(res => {
        if (active && res?.data?.success && res?.data?.data) {
          setPaymentTypes(res.data.data);
        }
      })
      .catch(err => {
        console.error('Failed to load expense payment types:', err);
      });
    return () => { active = false; };
  }, [fBranchId, orgId]);

  const payMethodOptions = useMemo(() => {
    if (paymentTypes.length === 0) {
      return [
        { value: 'CASH', label: 'Cash' },
        { value: 'CARD', label: 'Card' },
        { value: 'UPI', label: 'UPI' },
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'CHEQUE', label: 'Cheque' },
        { value: 'ONLINE', label: 'Online' },
        { value: 'MIXED', label: 'Mixed' }
      ];
    }
    return paymentTypes
      .filter(pt => {
        const act = pt.isActive ?? pt.isactive ?? 'Y';
        return act === 'Y';
      })
      .map(pt => ({
        value: pt.displayName.toUpperCase(),
        label: pt.displayName
      }));
  }, [paymentTypes]);

  useEffect(() => {
    if (payMethodOptions.length > 0) {
      const hasCurrent = payMethodOptions.some(o => o.value === fMethod);
      if (!hasCurrent) {
        setFMethod(payMethodOptions[0].value);
      }
    }
  }, [payMethodOptions, fMethod]);

  // Initialize field state from `editing` (or safe defaults for new expense)
  useEffect(() => {
    if (editing) {
      const d = new Date(editing.expenseDate);
      setFDate(toLocalDate(d));
      setFTime(d.toTimeString().slice(0, 5));
      setFCatId(editing.categoryId || '');
      setFAmount(String(editing.amount || ''));
      setFMethod(editing.paymentMethod || 'CASH');
      setCashAmount(editing.cashAmount ? String(editing.cashAmount) : '');
      setOnlineAmount(editing.onlineAmount ? String(editing.onlineAmount) : '');
      setFDesc(editing.description || '');
      setFBranchId(editing.scope === SCOPE_GLOBAL || !editing.orgId ? SCOPE_GLOBAL : editing.orgId);
    } else {
      const now = getBusinessNow(timezone);
      setFDate(toLocalDate(now));
      setFTime(now.toTimeString().slice(0, 5));
      setFCatId('');
      setFAmount('');
      setFDesc('');
      setFMethod('CASH');
      setCashAmount('');
      setOnlineAmount('');
      setFBranchId(orgId || defaultBranchId || SCOPE_GLOBAL);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally runs only once on mount

  // Apply pendingCatId whenever the hook signals a new category was created
  useEffect(() => {
    if (pendingCatId) setFCatId(pendingCatId);
  }, [pendingCatId]);

  // Reload category options when the scope selector changes
  const handleBranchChange = useCallback((value) => {
    setFBranchId(value);
    setFCatId(''); // invalidate previous selection when scope changes
    if (onBranchChange) onBranchChange(value);
  }, [onBranchChange]);

  useEffect(() => {
    if (fMethod === 'MIXED') {
      if (!cashAmount && !onlineAmount) {
        setCashAmount(fAmount || '');
        setOnlineAmount('0');
      }
    }
  }, [fMethod, fAmount]);

  const handleCashChange = useCallback((val) => {
    setCashAmount(val);
    const cash = parseFloat(val) || 0;
    const online = parseFloat(onlineAmount) || 0;
    setFAmount(String(Number((cash + online).toFixed(2))));
  }, [onlineAmount]);

  const handleOnlineChange = useCallback((val) => {
    setOnlineAmount(val);
    const cash = parseFloat(cashAmount) || 0;
    const online = parseFloat(val) || 0;
    setFAmount(String(Number((cash + online).toFixed(2))));
  }, [cashAmount]);

  const selectedBranchName = useMemo(() => {
    if (editing) {
      if (editing.scope === SCOPE_GLOBAL || !editing.orgId) return 'Organization';
      const found = branches.find(b => b.id === editing.orgId);
      return found ? found.name : (orgName || 'Organization');
    }
    if (!fBranchId || fBranchId === SCOPE_GLOBAL) {
      return orgName || 'Organization';
    }
    const found = branches.find(b => b.id === fBranchId);
    return found ? found.name : (orgName || 'Organization');
  }, [editing, fBranchId, branches, orgName]);

  // ── Validation + payload assembly ───────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!fAmount || parseFloat(fAmount) <= 0) {
      notify('error', 'Enter a valid amount');
      return;
    }
    if (!fCatId) {
      notify('error', 'Select a category');
      return;
    }

    const scopeValue = editing
      ? (editing.scope === SCOPE_GLOBAL || !editing.orgId ? SCOPE_GLOBAL : editing.orgId)
      : (fBranchId || orgId || SCOPE_GLOBAL);

    const scopePayload = scopeValue === SCOPE_GLOBAL
      ? { scope: 'GLOBAL', branchId: null }
      : { scope: 'BRANCH', branchId: scopeValue };

    let cashVal = null;
    let onlineVal = null;

    if (fMethod === 'MIXED') {
      cashVal = parseFloat(cashAmount) || 0;
      onlineVal = parseFloat(onlineAmount) || 0;
      if (cashVal <= 0 && onlineVal <= 0) {
        notify('error', 'Enter a valid amount for Cash or Online');
        return;
      }
    }

    const payload = {
      categoryId:    fCatId,
      expenseDate:   new Date(`${fDate}T${fTime}:00`).toISOString(),
      amount:        parseFloat(fAmount),
      description:   fDesc || null,
      paymentMethod: fMethod || 'CASH',
      cashAmount:    cashVal,
      onlineAmount:  onlineVal,
      ...scopePayload
    };

    onSubmit(payload);
  }, [fAmount, fCatId, editing, fBranchId, orgId, fDate, fTime, fDesc, fMethod, notify, onSubmit, cashAmount, onlineAmount]);

  return (
    <CafeQRPopup
      title={editing ? 'Modify Transaction' : 'Record New Expense'}
      icon={editing ? FaEdit : FaPlus}
      onClose={onClose}
      onCancel={onClose}
      onSave={handleSave}
      saveLabel={editing ? 'Save Changes' : 'Complete'}
      cancelLabel="Cancel"
      isSaving={saving}
      maxWidth="440px"
    >
      {/* Expense Date */}
      <div className={styles['mdl-field']}>
        <label className={styles['mdl-lbl']}>
          Expense Date <span className={styles.req}>*</span>
        </label>
        <PremiumDateTimePicker
          value={`${fDate}T${fTime}`}
          onChange={val => {
            setFDate(val.slice(0, 10));
            setFTime(val.slice(11, 16));
          }}
        />
      </div>

      {/* Expense Scope / Branch — read-only display based on active branch selector */}
      <div className={styles['mdl-field']}>
        <label className={styles['mdl-lbl']}>
          Expense Scope <span className={styles.req}>*</span>
        </label>
        <input
          type="text"
          className={styles['amt-input']}
          style={{
            background: '#f8fafc',
            color: '#475569',
            borderColor: '#e2e8f0',
            cursor: 'not-allowed',
            fontWeight: 600,
            fontSize: '13px',
            height: '42px',
            padding: '0 12px',
            borderRadius: '10px',
            width: '100%',
            boxSizing: 'border-box'
          }}
          value={selectedBranchName}
          disabled
          readOnly
        />
      </div>

      {/* Category with inline "+ New" shortcut */}
      <div className={styles['mdl-field']}>
        <div className={styles['lbl-row']}>
          <label className={styles['mdl-lbl']}>
            Category <span className={styles.req}>*</span>
          </label>
          <button type="button" className={styles['lbl-act']} onClick={onOpenCatMgr}>
            <FaPlus /> New
          </button>
        </div>
        <NiceSelect
          value={fCatId}
          onChange={setFCatId}
          options={formCategories
            .filter(c => c.active !== false)
            .map(c => ({ value: c.id, label: c.name }))}
          placeholder="Select category…"
        />
      </div>

      {/* Amount + Payment Mode — two-column row */}
      <div className={styles['mdl-row']}>
        {fMethod !== 'MIXED' && (
          <div className={styles['mdl-field']}>
            <label className={styles['mdl-lbl']}>
              Amount <span className={styles.req}>*</span>
            </label>
            <div className={styles['amt-input-w']}>
              <span className={styles['amt-pre']}>{currencySymbol}</span>
              <input
                id="expense-amount"
                className={styles['amt-input']}
                type="number"
                step="0.01"
                min="0"
                value={fAmount}
                onChange={e => setFAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>
        )}
        <div className={styles['mdl-field']} style={{ gridColumn: fMethod === 'MIXED' ? 'span 2' : 'span 1' }}>
          <label className={styles['mdl-lbl']}>
            Payment Mode <span className={styles.req}>*</span>
          </label>
          <NiceSelect
            value={fMethod}
            onChange={setFMethod}
            options={payMethodOptions}
          />
        </div>
      </div>

      {/* Cash + Online Splits for MIXED payments */}
      {fMethod === 'MIXED' && (
        <div className={styles['mdl-row']} style={{ marginTop: '0px', marginBottom: '12px' }}>
          <div className={styles['mdl-field']}>
            <label className={styles['mdl-lbl']}>
              Cash Amount <span className={styles.req}>*</span>
            </label>
            <div className={styles['amt-input-w']}>
              <span className={styles['amt-pre']}>{currencySymbol}</span>
              <input
                className={styles['amt-input']}
                type="number"
                step="0.01"
                min="0"
                value={cashAmount}
                onChange={e => handleCashChange(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          <div className={styles['mdl-field']}>
            <label className={styles['mdl-lbl']}>
              Online Amount <span className={styles.req}>*</span>
            </label>
            <div className={styles['amt-input-w']}>
              <span className={styles['amt-pre']}>{currencySymbol}</span>
              <input
                className={styles['amt-input']}
                type="number"
                step="0.01"
                min="0"
                value={onlineAmount}
                onChange={e => handleOnlineChange(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className={styles['mdl-field']}>
        <label className={styles['mdl-lbl']}>Reference / Notes</label>
        <textarea
          id="expense-notes"
          className={styles['mdl-txt']}
          value={fDesc}
          onChange={e => setFDesc(e.target.value)}
          placeholder="Brief description of the expense…"
          rows={2}
        />
      </div>
    </CafeQRPopup>
  );
}
