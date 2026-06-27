import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CafeQRPopup from '../CafeQRPopup';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';
import { SCOPE_ALL, SCOPE_GLOBAL, getCurrencySymbol } from '../../constants/expenseScopes';
import { useAuth } from '../../context/AuthContext';
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
  const { timezone, orgId, currency } = useAuth();
  const currencySymbol = getCurrencySymbol(currency);
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
    const orgParam = (isSuperAdmin && fBranchId && fBranchId !== SCOPE_GLOBAL) ? `&orgId=${fBranchId}` : '';
    api.get(`/api/v1/purchasing/payment-types?applicableFor=EXPENSES${orgParam}`)
      .then(res => {
        if (active && res?.data?.success && res?.data?.data) {
          setPaymentTypes(res.data.data);
        }
      })
      .catch(err => {
        console.error('Failed to load expense payment types:', err);
      });
    return () => { active = false; };
  }, [fBranchId, isSuperAdmin]);

  const payMethodOptions = useMemo(() => {
    if (paymentTypes.length === 0) {
      return [
        { value: 'CASH', label: 'Cash' },
        { value: 'CARD', label: 'Card' },
        { value: 'UPI', label: 'UPI' },
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'CHEQUE', label: 'Cheque' },
        { value: 'ONLINE', label: 'Online' }
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
      setFBranchId(defaultBranchId || (isSuperAdmin ? SCOPE_GLOBAL : (orgId || '')));
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
    if (isSuperAdmin && (!fBranchId || fBranchId === SCOPE_ALL)) {
      notify('error', 'Select an organization or branch');
      return;
    }

    const scopeValue  = isSuperAdmin ? fBranchId : (orgId || SCOPE_GLOBAL);
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
  }, [fAmount, fCatId, fBranchId, fDate, fTime, fDesc, fMethod, isSuperAdmin, orgId, notify, onSubmit, cashAmount, onlineAmount]);

  const expenseScopeOptions = [
    { value: SCOPE_GLOBAL, label: 'Organization' },
    ...branches.map(b => ({ value: b.id, label: b.name }))
  ];

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

      {/* Scope selector — super-admin only */}
      {isSuperAdmin && (
        <div className={styles['mdl-field']}>
          <label className={styles['mdl-lbl']}>
            Expense Scope <span className={styles.req}>*</span>
          </label>
          <NiceSelect
            value={fBranchId}
            onChange={handleBranchChange}
            options={expenseScopeOptions}
            placeholder="Select scope…"
          />
        </div>
      )}

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
