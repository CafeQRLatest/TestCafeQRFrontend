import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import DashboardLayout from '../../components/DashboardLayout';
import ModuleGate from '../../components/ModuleGate';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import {
  fetchLoyaltyPrograms,
  createLoyaltyProgram,
  updateLoyaltyProgram,
  fetchCustomerLoyalty,
  fetchCustomerTransactions,
} from '../../services/loyaltyApi';
import {
  FaCrown,
  FaPlus,
  FaStar,
  FaHistory,
  FaSearch,
  FaEdit,
  FaCheckCircle,
  FaTimesCircle,
  FaExchangeAlt,
  FaGift,
  FaCoins,
  FaUserCheck,
  FaSlidersH,
  FaArrowRight,
  FaInfoCircle,
  FaTrashAlt,
} from 'react-icons/fa';
import { formatTzDate } from '../../utils/timezoneUtils';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_PROGRAM = {
  name: '',
  description: '',
  isActive: true,
  isDefault: false,
  isClientWide: false,
  priority: 10,
  spendAmount: 100,
  earnPoints: 1,
  pointsRequired: 100,
  discountAmount: 10,
  minPoints: 0,
  maxPointsPerOrder: null,
  allowPartial: true,
};

const TXN_TYPE_CFG = {
  EARN: { label: 'Earned', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', sign: '+' },
  REDEEM: { label: 'Redeemed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', sign: '-' },
  REVERSAL: { label: 'Reversal', color: '#d97706', bg: '#fffbeb', border: '#fde68a', sign: '±' },
  ADJUSTMENT: { label: 'Adjustment', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', sign: '±' },
  EXPIRE: { label: 'Expired', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', sign: '-' },
};

function fmtSign(n) {
  if (n > 0) return `+${fmtNum(n)}`;
  return `${fmtNum(n)}`;
}

// Locale-neutral grouping (no hard-coded en-IN lakh grouping: shops run in IN, ZA, AE, SA).
function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : String(n);
}

function pts(n) {
  const num = Number(n);
  return `${fmtNum(n)} ${Math.abs(num) === 1 ? 'pt' : 'pts'}`;
}

function formatDate(iso, tz = null) {
  if (!iso) return '—';
  try {
    return formatTzDate(iso, tz);
  } catch {
    return iso;
  }
}

// Field-level validation for the programme form. Mirrors the server rules so the owner sees
// problems next to the field instead of a server error after pressing Save.
function validateProgramForm(form) {
  const errs = {};
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const isInt = (v) => Number.isInteger(num(v));

  if (!String(form.name || '').trim()) errs.name = 'Enter a programme name.';

  const spend = num(form.spendAmount);
  if (!(spend >= 0.01)) errs.spendAmount = 'Enter an amount greater than 0.';

  if (!isInt(form.earnPoints) || num(form.earnPoints) < 1) errs.earnPoints = 'Enter whole points, 1 or more.';

  if (!isInt(form.pointsRequired) || num(form.pointsRequired) < 1) errs.pointsRequired = 'Enter whole points, 1 or more.';

  const disc = num(form.discountAmount);
  if (!(disc >= 0.01)) errs.discountAmount = 'Enter a discount greater than 0.';

  const minRaw = form.minPoints;
  const minPts = minRaw === '' || minRaw === null || minRaw === undefined ? 0 : num(minRaw);
  if (!Number.isInteger(minPts) || minPts < 0) errs.minPoints = 'Enter 0 or more whole points.';

  const maxRaw = form.maxPointsPerOrder;
  if (maxRaw !== '' && maxRaw !== null && maxRaw !== undefined) {
    const maxPts = num(maxRaw);
    if (!Number.isInteger(maxPts) || maxPts < 1) {
      errs.maxPointsPerOrder = 'Leave blank for no limit, or enter 1 or more.';
    } else if (!errs.minPoints && maxPts < minPts) {
      errs.maxPointsPerOrder = `Must be at least the minimum (${minPts} pts).`;
    } else if (!form.allowPartial && !errs.pointsRequired && maxPts < num(form.pointsRequired)) {
      errs.maxPointsPerOrder = `Must be at least ${num(form.pointsRequired)} pts when points are used in whole blocks.`;
    }
  }

  const prio = num(form.priority);
  if (form.priority !== '' && form.priority !== null && form.priority !== undefined && !Number.isInteger(prio)) {
    errs.priority = 'Enter a whole number.';
  }
  return errs;
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <span className="field-hint" style={{ color: '#ef4444' }}>{msg}</span>;
}

// ─── Minimal Standard Program Card Component ─────────────────────────────────

function ProgramCard({ prog, onEdit, onToggleActive, onSetDefault }) {
  const currencySymbol = useCurrencySymbol();
  const { userRole } = useAuth();
  const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';
  const isClientWide = Boolean(prog.isClientWide ?? prog.is_client_wide);
  const canModify = !isClientWide || isSuperAdmin;

  const earn = prog.earnRule;
  const redeem = prog.redemptionRule;

  return (
    <div className="loyalty-card-minimal">
      <div className="card-header">
        <div className="card-title-group">
          <h3 className="program-title">{prog.name}</h3>
          {prog.isDefault && <span className="badge-default">Default</span>}
          <button
            type="button"
            className={`status-chip ${prog.isActive ? 'active' : 'inactive'} ${!canModify ? 'disabled' : ''}`}
            onClick={() => canModify && onToggleActive && onToggleActive(prog)}
            title={canModify ? 'Click to toggle status' : 'Client-wide program: Only Super Admin can modify'}
            style={!canModify ? { cursor: 'not-allowed', opacity: 0.7 } : {}}
          >
            {prog.isActive ? 'Active' : 'Inactive'}
          </button>
        </div>

        <div className="card-actions">
          {!prog.isDefault && prog.isActive && canModify && onSetDefault && (
            <button
              type="button"
              className="btn-default-colorful"
              onClick={() => onSetDefault(prog)}
              title="Set as Default Program"
            >
              Set Default
            </button>
          )}
          <button
            type="button"
            className="icon-btn-edit"
            onClick={() => onEdit(prog)}
            title={canModify ? 'Edit Program' : 'View Program Details (Read-Only)'}
          >
            {canModify ? <FaEdit /> : <FaInfoCircle />}
          </button>
        </div>
      </div>

      {prog.description && <p className="program-desc">{prog.description}</p>}

      <div className="rules-summary">
        <div className="rule-row">
          <span className="rule-badge earn">EARN</span>
          <span className="rule-text">
            Spend <strong>{currencySymbol}{earn?.spendAmount?.toLocaleString('en-IN') || 100}</strong> ➔ Earn <strong>{earn?.earnPoints || 1} pt{earn?.earnPoints !== 1 ? 's' : ''}</strong>
          </span>
        </div>

        <div className="rule-row">
          <span className="rule-badge redeem">REDEEM</span>
          <span className="rule-text">
            <strong>{redeem?.pointsRequired || 100} pts</strong> ➔ <strong>{currencySymbol}{redeem?.discountAmount?.toLocaleString('en-IN') || 10}</strong>
          </span>
          {redeem?.minPoints > 0 && <span className="min-tag">Min {redeem.minPoints} pts</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Program Modal Component ──────────────────────────────────────────────────

function ProgramModal({ prog, onClose, onSaved, currentDefaultName = null }) {
  const currencyDecimals = useCurrencyDecimals();
  const currencySymbol = useCurrencySymbol();
  const { userRole, orgName } = useAuth();
  const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';

  const isClientWideProgram = Boolean(prog?.isClientWide ?? prog?.is_client_wide);
  // Non-super-admins cannot edit client-level programs
  const isReadOnly = Boolean(prog?.id) && isClientWideProgram && !isSuperAdmin;

  const [form, setForm] = useState(
    prog
      ? {
          name: prog.name || '',
          description: prog.description || '',
          isActive: (prog.isActive ?? prog.active ?? true) !== false,
          isDefault: Boolean(prog.isDefault ?? prog.default ?? false),
          isClientWide: Boolean(prog.isClientWide ?? prog.is_client_wide ?? false),
          priority: prog.priority ?? 10,
          spendAmount: prog.earnRule?.spendAmount ?? 100,
          earnPoints: prog.earnRule?.earnPoints ?? 1,
          pointsRequired: prog.redemptionRule?.pointsRequired ?? 100,
          discountAmount: prog.redemptionRule?.discountAmount ?? 10,
          minPoints: prog.redemptionRule?.minPoints ?? 0,
          maxPointsPerOrder: prog.redemptionRule?.maxPointsPerOrder ?? null,
          allowPartial: prog.redemptionRule?.allowPartial !== false,
        }
      : { ...EMPTY_PROGRAM }
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const initialFormRef = useRef(JSON.stringify(form));

  const fieldErrors = useMemo(() => validateProgramForm(form), [form]);
  const hasErrors = Object.keys(fieldErrors).length > 0;
  const showErr = (k) => (touched || form[k] !== EMPTY_PROGRAM[k] ? fieldErrors[k] : null);
  const moneyStep = currencyDecimals > 0 ? (1 / 10 ** currencyDecimals).toFixed(currencyDecimals) : '1';
  const wasDefault = Boolean(prog?.isDefault ?? prog?.default ?? false);

  // Plain-language example of what the rules mean for a customer
  const livePreview = useMemo(() => {
    const spend = parseFloat(form.spendAmount) || 0;
    const earnPts = parseInt(form.earnPoints, 10) || 0;
    const reqPts = parseInt(form.pointsRequired, 10) || 0;
    const disc = parseFloat(form.discountAmount) || 0;

    if (spend <= 0 || earnPts <= 0 || reqPts <= 0 || disc <= 0) return null;
    const valuePerPoint = disc / reqPts;
    const returnPercent = ((earnPts / spend) * valuePerPoint * 100).toFixed(1);
    // Example bill: 10x the spend step, so the customer clearly earns some points
    const exampleSpend = spend * 10;
    const examplePoints = earnPts * 10;
    const exampleValue = form.allowPartial
      ? examplePoints * valuePerPoint
      : Math.floor(examplePoints / reqPts) * disc;

    return {
      returnPercent,
      valuePerPoint: valuePerPoint.toFixed(currencyDecimals),
      exampleSpend: exampleSpend.toFixed(currencyDecimals),
      examplePoints,
      exampleValue: exampleValue.toFixed(currencyDecimals),
    };
  }, [form, currencyDecimals]);

  function handleCancel() {
    const dirty = JSON.stringify(form) !== initialFormRef.current;
    if (!isReadOnly && dirty && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  }

  async function handleSave(e) {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) {
      setError('Please fix the highlighted fields.');
      return;
    }
    if (wasDefault && !form.isDefault
        && !window.confirm('This programme will no longer be the default. Customers will not earn or redeem points until another programme is made default. Continue?')) {
      return;
    }
    const finalIsActive = Boolean(form.isActive);
    const finalIsDefault = finalIsActive ? Boolean(form.isDefault) : false;

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        isActive: finalIsActive,
        isDefault: finalIsDefault,
        isClientWide: form.isClientWide,
        priority: Number.isInteger(parseInt(form.priority, 10)) ? parseInt(form.priority, 10) : 10,
        spendAmount: parseFloat(form.spendAmount),
        earnPoints: parseInt(form.earnPoints),
        pointsRequired: parseInt(form.pointsRequired),
        discountAmount: parseFloat(form.discountAmount),
        minPoints: parseInt(form.minPoints, 10) || 0,
        maxPointsPerOrder:
          form.maxPointsPerOrder === '' || form.maxPointsPerOrder === null || form.maxPointsPerOrder === undefined
            ? null
            : parseInt(form.maxPointsPerOrder, 10),
        allowPartial: form.allowPartial,
      };

      if (prog?.id) {
        await updateLoyaltyProgram(prog.id, { id: prog.id, ...payload });
      } else {
        await createLoyaltyProgram(payload);
      }
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save program.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon">
              <FaCrown />
            </div>
            <div>
              <h2>{prog?.id ? 'Edit Loyalty Program' : 'Create Loyalty Program'}</h2>
              <p className="modal-sub">Set how customers earn points and what their points are worth</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          {isReadOnly && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              borderRadius: '8px',
              color: '#6d28d9',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              <FaInfoCircle style={{ fontSize: '16px', flexShrink: 0 }} />
              <span>This is a client-level program. Only Super Admin can edit or modify client-wide loyalty programs.</span>
            </div>
          )}

          {/* General Section */}
          <div className="form-section">
            <span className="section-tag">1. BASIC DETAILS</span>
            <div className="form-group">
              <label>Program Name *</label>
              <input
                type="text"
                placeholder="e.g. Gold Rewards Program"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                readOnly={isReadOnly}
                disabled={isReadOnly}
              />
              <FieldError msg={showErr('name')} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                rows={2}
                placeholder="Short summary for customers and staff..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                readOnly={isReadOnly}
                disabled={isReadOnly}
              />
            </div>
            <div className="form-row">
              <div className="form-group toggle-group">
                <label>Default Program?</label>
                <div
                  className={`toggle-switch ${form.isDefault ? 'on' : ''} ${(!form.isActive || isReadOnly) ? 'disabled' : ''}`}
                  onClick={() => {
                    if (!form.isActive || isReadOnly) return;
                    setForm((f) => ({ ...f, isDefault: !f.isDefault }));
                  }}
                  title={isReadOnly ? 'Only Super Admin can modify client-wide programs' : (!form.isActive ? 'Only active programs can be set as default' : '')}
                >
                  <div className="toggle-handle" />
                </div>
                {!form.isActive && <span className="field-hint" style={{ color: '#ef4444' }}>Only active programs can be default</span>}
                {form.isActive && form.isDefault && !wasDefault && currentDefaultName && (
                  <span className="field-hint" style={{ color: '#b45309' }}>Replaces current default: {currentDefaultName}</span>
                )}
                {form.isActive && form.isDefault && (
                  <span className="field-hint">Points are earned and redeemed with the default programme.</span>
                )}
              </div>
              <div className="form-group toggle-group">
                <label>Active Status</label>
                <div
                  className={`toggle-switch ${form.isActive ? 'on' : ''} ${isReadOnly ? 'disabled' : ''}`}
                  onClick={() => {
                    if (isReadOnly) return;
                    const nextActive = !form.isActive;
                    setForm((f) => ({
                      ...f,
                      isActive: nextActive,
                      isDefault: nextActive ? f.isDefault : false
                    }));
                  }}
                >
                  <div className="toggle-handle" />
                </div>
              </div>
              {isSuperAdmin && (
                <div className="form-group toggle-group">
                  <label>Apply to All Branches?</label>
                  <div
                    className={`toggle-switch ${form.isClientWide ? 'on' : ''} ${isReadOnly ? 'disabled' : ''}`}
                    onClick={() => {
                      if (isReadOnly) return;
                      setForm((f) => ({ ...f, isClientWide: !f.isClientWide }));
                    }}
                  >
                    <div className="toggle-handle" />
                  </div>
                  <span className="field-hint">{form.isClientWide ? 'Client-wide (all branches)' : (prog?.branchName || orgName ? `Branch: ${prog?.branchName || orgName}` : 'This branch only')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Earning Section */}
          <div className="form-section">
            <span className="section-tag">2. EARNING RULES</span>
            <div className="rule-card-input">
              <div className="form-row">
                <div className="form-group">
                  <label>For every spend of ({currencySymbol})</label>
                  <div className="input-prefix">
                    <span>{currencySymbol}</span>
                    <input
                      type="number"
                      min={moneyStep}
                      step={moneyStep}
                      value={form.spendAmount}
                      onChange={(e) => setForm((f) => ({ ...f, spendAmount: e.target.value }))}
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                    />
                  </div>
                  <FieldError msg={showErr('spendAmount')} />
                </div>
                <div className="arrow-sep">➔</div>
                <div className="form-group">
                  <label>Customer earns (points)</label>
                  <div className="input-prefix">
                    <span>pts</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.earnPoints}
                      onChange={(e) => setForm((f) => ({ ...f, earnPoints: e.target.value }))}
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                    />
                  </div>
                  <FieldError msg={showErr('earnPoints')} />
                </div>
              </div>
            </div>
          </div>

          {/* Redemption Section */}
          <div className="form-section">
            <span className="section-tag">3. REDEMPTION RULES</span>
            <div className="rule-card-input">
              <div className="form-row">
                <div className="form-group">
                  <label>Every (points)</label>
                  <div className="input-prefix">
                    <span>pts</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.pointsRequired}
                      onChange={(e) => setForm((f) => ({ ...f, pointsRequired: e.target.value }))}
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                    />
                  </div>
                  <FieldError msg={showErr('pointsRequired')} />
                </div>
                <div className="arrow-sep">➔</div>
                <div className="form-group">
                  <label>are worth a discount of ({currencySymbol})</label>
                  <div className="input-prefix">
                    <span>{currencySymbol}</span>
                    <input
                      type="number"
                      min={moneyStep}
                      step={moneyStep}
                      value={form.discountAmount}
                      onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                    />
                  </div>
                  <FieldError msg={showErr('discountAmount')} />
                </div>
              </div>

              <div className="form-row mt-12">
                <div className="form-group">
                  <label>Points needed before first use</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.minPoints}
                    onChange={(e) => setForm((f) => ({ ...f, minPoints: e.target.value }))}
                    disabled={isReadOnly}
                    readOnly={isReadOnly}
                  />
                  {showErr('minPoints')
                    ? <FieldError msg={showErr('minPoints')} />
                    : <span className="field-hint">
                        {(parseInt(form.minPoints, 10) || 0) === 0
                          ? 'Customers can use points straight away'
                          : `Customers need ${parseInt(form.minPoints, 10)} pts before they can use them`}
                      </span>}
                </div>
                <div className="form-group">
                  <label>Most points usable on one bill</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="No limit"
                    value={form.maxPointsPerOrder ?? ''}
                    disabled={isReadOnly}
                    readOnly={isReadOnly}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxPointsPerOrder: e.target.value !== '' ? e.target.value : null,
                      }))
                    }
                  />
                  {showErr('maxPointsPerOrder')
                    ? <FieldError msg={showErr('maxPointsPerOrder')} />
                    : <span className="field-hint">Leave blank for no limit</span>}
                </div>
              </div>

              <div className="form-row mt-12">
                <div className="form-group toggle-group">
                  <label>Allow any number of points?</label>
                  <div
                    className={`toggle-switch ${form.allowPartial ? 'on' : ''} ${isReadOnly ? 'disabled' : ''}`}
                    onClick={() => {
                      if (isReadOnly) return;
                      setForm((f) => ({ ...f, allowPartial: !f.allowPartial }));
                    }}
                  >
                    <div className="toggle-handle" />
                  </div>
                  <span className="field-hint">
                    {form.allowPartial
                      ? 'On: e.g. 150 pts can be used for a proportional discount'
                      : `Off: points are used in blocks of ${parseInt(form.pointsRequired, 10) || '—'} only`}
                  </span>
                </div>
              </div>
              <span className="field-hint" style={{ display: 'block', marginTop: '8px' }}>
                Points are shared across all branches: a customer can use points earned at any branch.
              </span>
            </div>
          </div>

          {/* Live Formula Preview Box */}
          {livePreview && (
            <div className="preview-box">
              <FaInfoCircle className="preview-icon" />
              <div>
                <strong>Customers get back {livePreview.returnPercent}% of what they spend</strong>
                <p>
                  Example: a bill of {currencySymbol}{livePreview.exampleSpend} earns {pts(livePreview.examplePoints)}, worth {currencySymbol}{livePreview.exampleValue} off a later bill. 1 point = {currencySymbol}{livePreview.valuePerPoint}.
                </p>
              </div>
            </div>
          )}

          {error && <div className="error-alert">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              {isReadOnly ? 'Close' : 'Cancel'}
            </button>
            {!isReadOnly && (
              <button type="submit" className="btn-submit" disabled={saving || (touched && hasErrors)}>
                {saving ? 'Saving...' : prog?.id ? 'Update Program' : 'Create Program'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Programs Tab View ────────────────────────────────────────────────────────

function ProgramsTab() {
  const currencySymbol = useCurrencySymbol();
  const { userRole, orgName } = useAuth();
  const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';

  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalProg, setModalProg] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(async (forceFresh = false) => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchLoyaltyPrograms(forceFresh);
      setPrograms(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load loyalty programs', e);
      setLoadError(e?.response?.data?.message || 'Could not load loyalty programmes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredPrograms = useMemo(() => {
    if (!search.trim()) return programs;
    const q = search.toLowerCase();
    return programs.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    );
  }, [programs, search]);

  const totalPages = Math.ceil(filteredPrograms.length / pageSize) || 1;

  const paginatedPrograms = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPrograms.slice(start, start + pageSize);
  }, [filteredPrograms, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  function openCreate() {
    setModalProg(null);
    setShowModal(true);
  }

  function openEdit(p) {
    setModalProg(p);
    setShowModal(true);
  }

  function handleSaved() {
    setShowModal(false);
    load(true);
  }

  // Name of the current default in the scope the edited programme belongs to (for the "replaces" hint)
  const currentDefaultName = useMemo(() => {
    const editingClientWide = Boolean(modalProg?.isClientWide ?? modalProg?.is_client_wide);
    const d = programs.find((p) =>
      Boolean(p.isDefault ?? p.default) &&
      Boolean(p.isClientWide ?? p.is_client_wide) === editingClientWide &&
      p.id !== modalProg?.id);
    return d ? d.name : null;
  }, [programs, modalProg]);

  return (
    <div className="tab-pane">
      {/* PO History-Style Toolbar */}
      <div className="po-toolbar-card">
        <div className="po-toolbar-left">
          <button type="button" className="btn-primary" onClick={openCreate} style={{ padding: '6px 16px', fontSize: '12px', height: '32px' }}>
            <FaPlus /> Create Program
          </button>
        </div>

        {/* Small Search Input Bar */}
        <div className="compact-search-wrap">
          <FaSearch className="compact-search-icon" />
          <input
            type="text"
            className="compact-search-input"
            placeholder="Search programs by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="compact-clear-btn"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {loading && <div className="loading-state">Loading loyalty programs...</div>}

      {!loading && loadError && (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <FaTimesCircle />
          </div>
          <h3>Couldn&apos;t load programmes</h3>
          <p>{loadError}</p>
          <button type="button" className="btn-primary mt-14" onClick={() => load(true)}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && filteredPrograms.length === 0 && (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <FaStar />
          </div>
          {search.trim() ? (
            <>
              <h3>No programmes match &quot;{search.trim()}&quot;</h3>
              <p>Try a different name, or clear the search.</p>
            </>
          ) : (
            <>
              <h3>No Loyalty Programs Yet</h3>
              <p>Create a programme and mark it as default so customers start earning points.</p>
              <button type="button" className="btn-primary mt-14" onClick={openCreate}>
                <FaPlus /> Create Program
              </button>
            </>
          )}
        </div>
      )}

      {!loading && !loadError && filteredPrograms.length > 0 && (
        <div className="po-table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th>PROGRAM NAME</th>
                <th>DESCRIPTION</th>
                <th>BRANCH</th>
                <th>EARN RULE</th>
                <th>REDEMPTION RULE</th>
                <th>STATUS</th>
                <th>DEFAULT</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPrograms.map((p) => {
                const isActive = (p.isActive ?? p.active ?? true) !== false;
                const isDefault = Boolean(p.isDefault ?? p.default ?? false);
                const isClientWide = Boolean(p.isClientWide ?? p.is_client_wide);
                const displayBranchName = isClientWide ? 'All Branches' : (p.branchName || orgName || 'This Branch');
                const earn = p.earnRule;
                const redeem = p.redemptionRule;
                return (
                  <tr key={p.id} className="po-row">
                    <td>
                      <span className="po-code-cell" onClick={() => openEdit(p)}>{p.name}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', color: p.description ? '#475569' : '#94a3b8' }}>
                        {p.description || '—'}
                      </span>
                    </td>
                    <td>
                      {isClientWide ? (
                        <span className="status-badge-po" style={{ color: '#7c3aed', backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', fontSize: '11px' }}>
                          All Branches
                        </span>
                      ) : (
                        <span className="status-badge-po" style={{ color: '#0369a1', backgroundColor: '#f0f9ff', borderColor: '#bae6fd', fontSize: '11px' }}>
                          {displayBranchName}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#1e293b' }}>
                        {earn ? <>Spend {currencySymbol}{fmtNum(earn.spendAmount)} ➔ Earn {pts(earn.earnPoints)}</> : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#1e293b' }}>
                        {redeem ? <>{pts(redeem.pointsRequired)} ➔ {currencySymbol}{fmtNum(redeem.discountAmount)} off</> : '—'}
                      </span>
                      {redeem && redeem.allowPartial === false && (
                        <span style={{ fontSize: '10.5px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                          Whole blocks
                        </span>
                      )}
                      {redeem?.minPoints > 0 && (
                        <span style={{ fontSize: '10.5px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                          Min {redeem.minPoints} pts
                        </span>
                      )}
                    </td>
                    <td>
                      {isActive ? (
                        <span className="status-badge-po" style={{ color: '#059669', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}>
                          Active
                        </span>
                      ) : (
                        <span className="status-badge-po" style={{ color: '#64748b', backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td>
                      {isDefault ? (
                        <span className="status-badge-po" style={{ color: '#c2410c', backgroundColor: '#ffedd5', borderColor: '#fed7aa' }}>
                          Default
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {Boolean(p.isClientWide ?? p.is_client_wide) && !isSuperAdmin ? (
                        <button
                          type="button"
                          className="action-btn-po"
                          onClick={() => openEdit(p)}
                          title="View Program Details (Client-Wide: Super Admin only can edit)"
                          style={{ color: '#6d28d9', borderColor: '#ddd6fe', backgroundColor: '#f5f3ff' }}
                        >
                          <FaInfoCircle /> View
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="action-btn-po"
                          onClick={() => openEdit(p)}
                          title="Edit Program"
                        >
                          <FaEdit /> Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredPrograms.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '16px',
              background: '#ffffff',
              borderTop: '1px solid #f1f5f9'
            }}>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: '#f97316',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ← Previous
              </button>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>
                Page {currentPage} of {totalPages} &nbsp;·&nbsp; {filteredPrograms.length} total
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: '#f97316',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ProgramModal
          prog={modalProg}
          currentDefaultName={currentDefaultName}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ─── Customer Loyalty History Tab View ────────────────────────────────────────

const TXN_PAGE_SIZE = 100;

function CustomerLoyaltyTab() {
  const currencySymbol = useCurrencySymbol();
  const { timezone } = useAuth();
  const fmtDate = useCallback((iso) => formatDate(iso, timezone), [timezone]);
  const [shopConfig, setShopConfig] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [customersError, setCustomersError] = useState('');
  const [docError, setDocError] = useState('');
  const [txnServerPage, setTxnServerPage] = useState(0);
  const [txnHasMore, setTxnHasMore] = useState(false);
  const [txnTotal, setTxnTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestSeq = useRef(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [showDropdown, setShowDropdown] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);

  const handleOpenDoc = useCallback(async (orderId, pointsRedeemed = null) => {
    if (!orderId) return;
    setDocLoading(true);
    setDocError('');
    try {
      const res = await api.get(`/api/v1/orders/${orderId}`);
      const ord = res.data?.data || res.data;
      if (ord) {
        if (pointsRedeemed && !ord.redeemPoints) {
          ord.redeemPoints = Math.abs(pointsRedeemed);
        }
        setViewingDoc({ order: ord, type: 'SO' });
      }
    } catch (e) {
      console.error('Failed to fetch order document:', e);
      setDocError(e?.response?.data?.message || 'Could not open this order. Please try again.');
    } finally {
      setDocLoading(false);
    }
  }, []);

  const loadAccountAndTxns = useCallback(async (cid) => {
    if (!cid) return;
    // Ignore responses for a customer the user has since moved away from
    const seq = ++requestSeq.current;
    setAccountLoading(true);
    setTxnLoading(true);
    setAccount(null);
    setAccountError('');
    setTransactions([]);
    setTxnServerPage(0);
    setTxnHasMore(false);
    setTxnTotal(0);
    try {
      const [acc, txns] = await Promise.all([
        fetchCustomerLoyalty(cid, true),
        fetchCustomerTransactions(cid, 0, TXN_PAGE_SIZE),
      ]);
      if (seq !== requestSeq.current) return;
      setAccount(acc);
      setTransactions(txns?.content || []);
      setTxnHasMore(txns ? txns.last === false : false);
      setTxnTotal(txns?.totalElements ?? (txns?.content?.length || 0));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      console.error(e);
      setAccount(null);
      setTransactions([]);
      setAccountError(e?.response?.data?.message || 'Could not load this customer\'s points. Please try again.');
    } finally {
      if (seq === requestSeq.current) {
        setAccountLoading(false);
        setTxnLoading(false);
      }
    }
  }, []);

  const loadOlderTxns = useCallback(async () => {
    if (!selectedCustomerId || !txnHasMore) return;
    const seq = requestSeq.current;
    const nextPage = txnServerPage + 1;
    setLoadingMore(true);
    try {
      const txns = await fetchCustomerTransactions(selectedCustomerId, nextPage, TXN_PAGE_SIZE);
      if (seq !== requestSeq.current) return;
      setTransactions((prev) => [...prev, ...(txns?.content || [])]);
      setTxnServerPage(nextPage);
      setTxnHasMore(txns ? txns.last === false : false);
    } catch (e) {
      console.error(e);
      setAccountError(e?.response?.data?.message || 'Could not load older history. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [selectedCustomerId, txnHasMore, txnServerPage]);

  // Shop configuration (tax display + timezone) for the order popup
  useEffect(() => {
    api.get('/api/v1/configurations')
      .then((res) => setShopConfig(res.data?.data || {}))
      .catch(() => setShopConfig(null));
  }, []);

  // Load customer directory for quick selection
  useEffect(() => {
    setLoadingCustomers(true);
    setCustomersError('');
    api
      .get('/api/v1/purchasing/customers')
      .then((res) => {
        const list = res.data?.data || res.data || [];
        const arr = Array.isArray(list) ? list : [];
        setCustomers(arr);
      })
      .catch((e) => {
        console.error('Failed to load customers', e);
        setCustomersError(e?.response?.data?.message || 'Could not load customers. Refresh the page to try again.');
      })
      .finally(() => setLoadingCustomers(false));
  }, []);

  const filteredCustomerList = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const filteredTransactions = useMemo(() => {
    if (filterType === 'ALL') return transactions;
    return transactions.filter((t) => t.transactionType === filterType);
  }, [transactions, filterType]);

  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedCustomerId]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  return (
    <div className="tab-pane">
      {/* PO History-Style Filter Toolbar Card */}
      <div className="po-toolbar-card">
        <div className="po-toolbar-left">
          <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'EARN', label: 'Earned' },
              { id: 'REDEEM', label: 'Redeemed' },
              { id: 'REVERSAL', label: 'Reversal' },
              { id: 'ADJUSTMENT', label: 'Adjustment' },
              { id: 'EXPIRE', label: 'Expired' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: filterType === tab.id ? '600' : '500',
                  color: filterType === tab.id ? '#ffffff' : '#64748b',
                  background: filterType === tab.id ? '#ea580c' : 'transparent',
                  boxShadow: filterType === tab.id ? '0 2px 4px rgba(234, 88, 12, 0.25)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Small Search Input Bar on Top Right */}
        <div className="compact-search-wrap">
          <FaSearch className="compact-search-icon" />
          <input
            type="text"
            className="compact-search-input"
            placeholder="Search customer name or phone..."
            value={customerSearch}
            onFocus={() => setShowDropdown(true)}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setShowDropdown(true);
              // Typing a new search drops the previously shown customer so old data isn't mistaken for the new one
              if (selectedCustomerId) {
                requestSeq.current += 1;
                setSelectedCustomerId(null);
                setAccount(null);
                setAccountError('');
                setTransactions([]);
                setAccountLoading(false);
                setTxnLoading(false);
              }
            }}
          />
          {customerSearch && (
            <button
              type="button"
              className="compact-clear-btn"
              onClick={() => {
                requestSeq.current += 1;
                setCustomerSearch('');
                setSelectedCustomerId(null);
                setAccount(null);
                setAccountError('');
                setTransactions([]);
                setAccountLoading(false);
                setTxnLoading(false);
                setShowDropdown(false);
              }}
            >
              ×
            </button>
          )}

          {/* Autocomplete Dropdown */}
          {showDropdown && customerSearch.trim() !== '' && (
            <div className="compact-autocomplete-dropdown">
              {loadingCustomers ? (
                <div className="dropdown-item muted">Loading customers...</div>
              ) : customersError ? (
                <div className="dropdown-item muted" style={{ color: '#dc2626' }}>{customersError}</div>
              ) : filteredCustomerList.length === 0 ? (
                <div className="dropdown-item muted">No matching customer found</div>
              ) : (
                filteredCustomerList.map((c) => (
                  <div
                    key={c.id}
                    className={`dropdown-item ${selectedCustomerId === c.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setCustomerSearch(c.phone ? `${c.name} (${c.phone})` : c.name);
                      setShowDropdown(false);
                      loadAccountAndTxns(c.id);
                    }}
                  >
                    <div className="item-name">{c.name}</div>
                    {c.phone && <div className="item-phone">{c.phone}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {(accountLoading || txnLoading) && (
        <div className="loading-state">Loading transactions...</div>
      )}

      {docLoading && <div className="loading-state">Opening order...</div>}
      {docError && (
        <div className="error-alert" style={{ marginBottom: '12px' }}>
          {docError}{' '}
          <button type="button" className="compact-clear-btn" onClick={() => setDocError('')}>×</button>
        </div>
      )}

      {!selectedCustomerId && !accountLoading && (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <FaHistory />
          </div>
          <h3>Select a Customer</h3>
          <p>Search and select a customer above to view their loyalty transactions.</p>
        </div>
      )}

      {selectedCustomerId && !accountLoading && accountError && (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <FaTimesCircle />
          </div>
          <h3>Couldn&apos;t load points</h3>
          <p>{accountError}</p>
          <button type="button" className="btn-primary mt-14" onClick={() => loadAccountAndTxns(selectedCustomerId)}>
            Retry
          </button>
        </div>
      )}

      {selectedCustomerId && !accountLoading && !accountError && !account && (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <FaTimesCircle />
          </div>
          <h3>No Loyalty Account Created Yet</h3>
          <p>This customer hasn&apos;t earned any points yet. Points are added automatically when they pay for a sale with their details attached.</p>
        </div>
      )}

      {account && (
        <>
          {/* PO Summary Strip Header */}
          <div className="po-summary-strip">
            <div className="strip-left">
              <div className="strip-avatar">
                {account.customerName ? account.customerName.charAt(0).toUpperCase() : 'C'}
              </div>
              <div>
                <div className="strip-name">{account.customerName || 'Customer'}</div>
                {(account.customerPhone || account.programName) && (
                  <div className="strip-sub">
                    {account.customerPhone && <span>{account.customerPhone}</span>}
                    {account.customerPhone && account.programName && <span> · </span>}
                    {account.programName && <span>Programme: {account.programName}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="strip-stats">
              <div className="strip-stat-box highlight">
                <span className="strip-lbl">AVAILABLE BALANCE</span>
                <span className="strip-val">{pts(account.currentPoints ?? 0)}</span>
              </div>
              <div className="strip-stat-box">
                <span className="strip-lbl">LIFETIME EARNED</span>
                <span className="strip-val positive">+{pts(account.lifetimeEarned ?? 0)}</span>
              </div>
              <div className="strip-stat-box">
                <span className="strip-lbl">LIFETIME REDEEMED</span>
                <span className="strip-val muted">-{pts(account.lifetimeRedeemed ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* PO History-Style Table */}
          <div className="po-table-wrap">
            {filteredTransactions.length === 0 ? (
              <div className="empty-ledger">
                {filterType === 'ALL'
                  ? 'No points activity yet for this customer.'
                  : `No ${(TXN_TYPE_CFG[filterType]?.label || filterType).toLowerCase()} entries${txnHasMore ? ' in the loaded history' : ''}.`}
              </div>
            ) : (
              <>
                <table className="po-table">
                  <thead>
                    <tr>
                      <th>DATE & TIME</th>
                      <th>DOCUMENT NO</th>
                      <th>PROGRAM</th>
                      <th>BRANCH</th>
                      <th>TYPE</th>
                      <th>POINTS</th>
                      <th>BALANCE AFTER</th>
                      <th>REMARKS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.map((t) => {
                      const cfg = TXN_TYPE_CFG[t.transactionType] || TXN_TYPE_CFG.ADJUSTMENT;
                      // Reversals/adjustments can go either way: colour by the actual sign
                      const amountColor = (t.transactionType === 'REVERSAL' || t.transactionType === 'ADJUSTMENT')
                        ? (t.points >= 0 ? '#059669' : '#dc2626')
                        : cfg.color;
                      return (
                        <tr key={t.id} className="po-row">
                          <td className="date-cell">{fmtDate(t.createdAt)}</td>
                          <td>
                            {t.orderId ? (
                              <span
                                className="po-code-cell"
                                onClick={() => handleOpenDoc(t.orderId, t.transactionType === 'REDEEM' ? Math.abs(t.points) : null)}
                                title="Click to view sales order document"
                              >
                                {t.orderNumber || `#${String(t.orderId).slice(0, 8)}`}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: t.programName ? '#475569' : '#94a3b8' }}>
                              {t.programName || '—'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: t.branchName ? '#475569' : '#94a3b8' }}>
                              {t.branchName || '—'}
                            </span>
                          </td>
                          <td>
                            <span
                              className="status-badge-po"
                              style={{
                                color: cfg.color,
                                backgroundColor: cfg.bg,
                                borderColor: cfg.border,
                              }}
                            >
                              {cfg.label}
                            </span>
                          </td>
                          <td className="points-cell" style={{ color: amountColor }}>
                            {fmtSign(t.points)} {Math.abs(t.points) === 1 ? 'pt' : 'pts'}
                          </td>
                          <td className="balance-cell">{pts(t.balanceAfter ?? 0)}</td>
                          <td className="remarks-cell">{t.remarks || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredTransactions.length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    padding: '16px',
                    background: '#ffffff',
                    borderTop: '1px solid #f1f5f9'
                  }}>
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontWeight: '700',
                        fontSize: '13px',
                        color: '#f97316',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        opacity: currentPage === 1 ? 0.4 : 1,
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>
                      Page {currentPage} of {totalPages} &nbsp;·&nbsp; {filterType === 'ALL'
                        ? `${fmtNum(txnTotal || filteredTransactions.length)} total`
                        : `${fmtNum(filteredTransactions.length)} shown`}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontWeight: '700',
                        fontSize: '13px',
                        color: '#f97316',
                        cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                        opacity: currentPage >= totalPages ? 0.4 : 1,
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      Next →
                    </button>
                    {txnHasMore && currentPage >= totalPages && (
                      <button
                        type="button"
                        onClick={loadOlderTxns}
                        disabled={loadingMore}
                        style={{
                          padding: '8px 18px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          fontWeight: '700',
                          fontSize: '13px',
                          color: '#f97316',
                          cursor: loadingMore ? 'wait' : 'pointer',
                        }}
                      >
                        {loadingMore ? 'Loading...' : 'Load older history'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {viewingDoc && (
        <DocumentViewerPopup
          order={viewingDoc.order}
          docType={viewingDoc.type}
          vendors={[]}
          warehouses={[]}
          timezone={timezone || shopConfig?.timezone || undefined}
          currencySymbol={currencySymbol}
          formatTzDate={(val, tz) => formatDate(val, tz || timezone)}
          onClose={() => setViewingDoc(null)}
          onViewLinked={(order, type) => setViewingDoc({ order, type })}
          STATUS_CFG={{
            DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
            BILLED:    { label: 'Billed',    color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
            COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
            PAID:      { label: 'Paid',      color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
            CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
          }}
          config={shopConfig}
        />
      )}
    </div>
  );
}

// ─── Main Loyalty Page Component ──────────────────────────────────────────────

function LoyaltyContent() {
  const [activeTab, setActiveTab] = useState('history');

  return (
    <div className="loyalty-page">
      {/* Mode / Tab Switcher */}
      <div className="po-toolbar-card" style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>
          {activeTab === 'history' ? 'Customer Loyalty Transactions' : 'Loyalty Programs'}
        </div>
        <div className="header-tabs-bar">
          <button
            type="button"
            className={`header-tab-btn ${activeTab === 'programs' ? 'active' : ''}`}
            onClick={() => setActiveTab('programs')}
          >
            <FaStar /> Loyalty Programs
          </button>
          <button
            type="button"
            className={`header-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <FaHistory /> Loyalty Transactions
          </button>
        </div>
      </div>

      {activeTab === 'programs' ? <ProgramsTab /> : <CustomerLoyaltyTab />}

      {/* Styles */}
      <style jsx global>{`
        .loyalty-page {
          padding: 24px 24px 60px;
          color: #1e293b;
          font-family: 'Inter', sans-serif;
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .header-title-area {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .title-icon-badge {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          box-shadow: 0 6px 16px rgba(245, 158, 11, 0.3);
        }

        h1, h2, h3 {
          font-family: 'Outfit', sans-serif;
        }

        h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
        }

        .subtitle {
          margin: 4px 0 0;
          font-size: 13.5px;
          color: #64748b;
        }

        /* KPI Grid */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 28px;
        }

        .kpi-card {
          background: #ffffff;
          border-radius: 14px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
        }

        .kpi-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .kpi-icon-wrap.gold { background: #fffbeb; color: #f59e0b; }
        .kpi-icon-wrap.blue { background: #eff6ff; color: #3b82f6; }
        .kpi-icon-wrap.green { background: #ecfdf5; color: #10b981; }
        .kpi-icon-wrap.purple { background: #f5f3ff; color: #8b5cf6; }

        .kpi-data {
          display: flex;
          flex-direction: column;
        }

        .kpi-label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .kpi-val {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
        }

        .kpi-val.text-sm {
          font-size: 15px;
          font-weight: 700;
        }

        .kpi-val.text-green {
          color: #059669;
        }

        /* Tab Slider */
        .tab-slider-wrap {
          margin-bottom: 24px;
        }

        .tab-slider {
          display: inline-flex;
          align-items: center;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          gap: 4px;
        }

        .slider-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          font-size: 14px;
          font-weight: 700;
          color: #64748b;
          border-radius: 9px;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .slider-btn:hover {
          color: #0f172a;
        }

        .slider-btn.active {
          background: #ffffff;
          color: #f59e0b;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        /* Toolbar Row */
        .toolbar-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .search-wrap {
          position: relative;
          min-width: 280px;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 14px;
        }

        .search-wrap input {
          width: 100%;
          padding: 10px 14px 10px 40px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          outline: none;
          background: #ffffff;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .search-wrap input:focus {
          border-color: #f97316;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.4);
        }

        /* Programs Grid */
        .programs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 20px;
        }

        /* Minimal Standard Program Card */
        .loyalty-card-minimal {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .loyalty-card-minimal:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .card-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .program-title {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          text-transform: capitalize;
        }

        .badge-default {
          background: #ffedd5;
          color: #ea580c;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid #fed7aa;
        }

        .status-chip {
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 700;
          border: none;
          cursor: pointer;
        }

        .status-chip.active {
          background: #ecfdf5;
          color: #059669;
        }

        .status-chip.inactive {
          background: #f1f5f9;
          color: #64748b;
        }

        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-default-colorful {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          color: #ea580c;
          border: 1px solid #fed7aa;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .btn-default-colorful:hover {
          transform: translateY(-1px);
          background: #ffedd5;
          box-shadow: 0 2px 8px rgba(234, 88, 12, 0.2);
        }

        .star-icn {
          color: #f59e0b;
          font-size: 11px;
        }

        .icon-btn-edit {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s ease;
        }

        .icon-btn-edit:hover {
          background: #f97316;
          color: #ffffff;
          border-color: #f97316;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
        }

        .program-desc {
          margin: 0;
          font-size: 13px;
          color: #64748b;
        }

        .rules-summary {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .rule-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13.5px;
          color: #334155;
        }

        .rule-badge {
          font-size: 10.5px;
          font-weight: 800;
          padding: 3px 0;
          width: 64px;
          text-align: center;
          border-radius: 5px;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }

        .rule-badge.earn {
          background: #fffbeb;
          color: #d97706;
          border: 1px solid #fde68a;
        }

        .rule-badge.redeem {
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #fed7aa;
        }

        .rule-text {
          color: #1e293b;
          white-space: nowrap;
        }

        .rule-text strong {
          color: #0f172a;
          font-weight: 800;
        }

        .min-tag {
          font-size: 11.5px;
          font-weight: 600;
          color: #64748b;
          background: #ffffff;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          margin-left: auto;
          white-space: nowrap;
        }

        .rule-header {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        }

        .rule-icon.earn { color: #f59e0b; }
        .rule-icon.redeem { color: #ea580c; }

        .rule-content {
          font-size: 13px;
          color: #1e293b;
          line-height: 1.4;
        }

        .rule-content .highlight {
          color: #0f172a;
          font-weight: 800;
        }

        .sub-rule {
          display: block;
          font-size: 11px;
          color: #64748b;
          margin-top: 2px;
        }

        .rule-muted {
          font-size: 12px;
          color: #94a3b8;
          font-style: italic;
        }

        /* Empty State */
        .empty-state-card {
          background: #ffffff;
          border: 2px dashed #cbd5e1;
          border-radius: 16px;
          padding: 48px 24px;
          text-align: center;
          color: #64748b;
          margin-top: 10px;
        }

        .empty-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: #f1f5f9;
          color: #94a3b8;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          margin-bottom: 16px;
        }

        .empty-state-card h3 {
          margin: 0 0 6px;
          font-size: 18px;
          color: #1e293b;
        }

        .empty-state-card p {
          margin: 0;
          font-size: 13.5px;
          max-width: 400px;
          margin: 0 auto;
        }

        .mt-14 { margin-top: 14px; }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .modal-box {
          background: #ffffff;
          border-radius: 20px;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
        }

        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .modal-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #fffbeb;
          color: #f59e0b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }

        .modal-sub {
          margin: 2px 0 0;
          font-size: 12px;
          color: #64748b;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 20px;
          color: #94a3b8;
          cursor: pointer;
        }

        .modal-body {
          padding: 24px;
        }

        .form-section {
          margin-bottom: 22px;
        }

        .section-tag {
          display: block;
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.8px;
          margin-bottom: 12px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }

        .form-group label {
          font-size: 12.5px;
          font-weight: 700;
          color: #475569;
        }

        .form-group input, .form-group textarea {
          padding: 9px 13px;
          border: 1.5px solid #e2e8f0;
          border-radius: 9px;
          font-size: 13.5px;
          outline: none;
          font-family: inherit;
          box-sizing: border-box;
        }

        .form-group input:focus, .form-group textarea:focus {
          border-color: #f97316;
        }

        .field-hint {
          font-size: 11px;
          color: #94a3b8;
        }

        .form-row {
          display: flex;
          gap: 14px;
          align-items: center;
        }

        .input-prefix {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-prefix span {
          position: absolute;
          left: 12px;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
        }

        .input-prefix input {
          width: 100%;
          padding-left: 36px;
        }

        .arrow-sep {
          font-size: 18px;
          color: #cbd5e1;
          margin-top: 18px;
        }

        .rule-card-input {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
        }

        .mt-12 { margin-top: 12px; }

        /* Toggles */
        .toggle-group {
          align-items: center;
        }

        .toggle-switch {
          width: 44px;
          height: 24px;
          border-radius: 12px;
          background: #cbd5e1;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toggle-switch.on {
          background: #f97316;
        }

        .toggle-handle {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          transition: left 0.2s;
        }

        .toggle-switch.on .toggle-handle {
          left: 22px;
        }

        /* Preview Box */
        .preview-box {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          color: #9a3412;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .preview-icon {
          font-size: 18px;
          margin-top: 2px;
          color: #ea580c;
        }

        .preview-box p {
          margin: 2px 0 0;
          font-size: 12px;
          color: #c2410c;
        }

        .error-alert {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 10px 14px;
          border-radius: 9px;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .modal-footer {
          display: flex;
          gap: 12px;
          margin-top: 10px;
        }

        .btn-cancel {
          flex: 1;
          padding: 11px 0;
          background: #f1f5f9;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
        }

        .btn-submit {
          flex: 2;
          padding: 11px 0;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
        }

        /* Customer Picker */
        .customer-picker-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px;
          margin-bottom: 20px;
        }

        .picker-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }

        /* Customer Suggestions */
        .customer-suggestions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #f1f5f9;
        }

        .cust-suggestion-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.15s ease;
        }

        .cust-suggestion-chip:hover {
          border-color: #f97316;
          background: #fff7ed;
        }

        .cust-suggestion-chip.active {
          border-color: #f97316;
          background: #f97316;
          color: #ffffff;
        }

        .chip-name {
          font-weight: 700;
        }

        .chip-phone {
          font-size: 12px;
          opacity: 0.8;
        }

        .no-cust-found {
          font-size: 12.5px;
          color: #94a3b8;
          font-style: italic;
        }

        /* Profile Banner - Professional Enterprise Card */
        .profile-banner {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 20px 24px;
          color: #0f172a;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.06);
          flex-wrap: wrap;
        }

        .banner-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .avatar-ring {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #ffedd5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .cust-name {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.2px;
        }

        .cust-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .meta-tag {
          font-size: 12.5px;
          color: #64748b;
          font-weight: 500;
        }

        .program-tag {
          font-size: 11.5px;
          color: #0284c7;
          font-weight: 600;
          background: #f0f9ff;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid #e0f2fe;
        }

        .banner-stats {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .stat-pill {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 16px;
          display: flex;
          flex-direction: column;
          min-width: 140px;
        }

        .stat-pill.highlight {
          background: #fff7ed;
          border: 1px solid #ffedd5;
          border-left: 4px solid #f97316;
        }

        .stat-lbl {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .stat-pill.highlight .stat-lbl {
          color: #c2410c;
        }

        .stat-val {
          font-size: 19px;
          font-weight: 800;
          color: #0f172a;
          margin-top: 2px;
        }

        .stat-pill.highlight .stat-val {
          color: #ea580c;
          font-size: 20px;
        }

        .stat-val.positive {
          color: #16a34a;
        }

        .stat-val.muted {
          color: #64748b;
        }

        /* Ledger Table */
        .ledger-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        }

        .ledger-header {
          padding: 16px 20px;
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .ledger-header h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 800;
          color: #1e293b;
          letter-spacing: 0.5px;
        }

        .filter-chips {
          display: flex;
          gap: 6px;
        }

        .chip {
          padding: 5px 14px;
          font-size: 11.5px;
          font-weight: 700;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .chip:hover {
          border-color: #cbd5e1;
          color: #334155;
        }

        /* Header Tab Switcher (Top Right Tabs) */
        .header-tabs-bar {
          display: flex;
          gap: 6px;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
        }

        .header-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          border: none;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .header-tab-btn:hover {
          color: #1e293b;
        }

        .header-tab-btn.active {
          background: #ffffff;
          color: #f97316;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        /* PO History Toolbar Card */
        .po-toolbar-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          background: #ffffff;
          padding: 10px 16px;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          border-top: 3px solid #f97316;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .compact-select {
          height: 32px;
          padding: 0 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
          background: #f8fafc;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }

        .compact-select:hover {
          border-color: #cbd5e1;
        }

        .compact-select:focus {
          border-color: #f97316;
          background: #ffffff;
        }

        .compact-search-wrap {
          position: relative;
          flex: 1 1 220px;
          max-width: 320px;
        }

        .compact-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 11px;
          pointer-events: none;
        }

        .compact-search-input {
          width: 100%;
          height: 32px;
          padding-left: 30px;
          padding-right: 28px;
          border: 1.5px solid #e2e8f0;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: #1e293b;
          background: #f8fafc;
          outline: none;
          box-sizing: border-box;
          transition: all 0.15s ease;
        }

        .compact-search-input:focus {
          border-color: #f97316;
          background: #ffffff;
        }

        .compact-clear-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 14px;
          color: #94a3b8;
          cursor: pointer;
        }

        .compact-autocomplete-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
          z-index: 999;
          max-height: 240px;
          overflow-y: auto;
          padding: 6px;
        }

        /* PO Summary Strip */
        .po-summary-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px 18px;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }

        .strip-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .strip-avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #ffedd5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
        }

        .strip-name {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
        }

        .strip-sub {
          display: flex;
          gap: 8px;
          font-size: 11.5px;
          color: #64748b;
          margin-top: 2px;
        }

        .strip-program {
          color: #0284c7;
          font-weight: 600;
          background: #f0f9ff;
          padding: 1px 6px;
          border-radius: 4px;
        }

        .strip-stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .strip-stat-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 6px 12px;
          display: flex;
          flex-direction: column;
          min-width: 120px;
        }

        .strip-stat-box.highlight {
          background: #fff7ed;
          border-color: #ffedd5;
          border-left: 3px solid #f97316;
        }

        .strip-lbl {
          font-size: 9px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
        }

        .strip-val {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }

        .strip-val.positive { color: #16a34a; }
        .strip-val.muted { color: #64748b; }

        /* PO History Exact Table Styling */
        .po-table-wrap {
          width: 100%;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
        }

        .po-table {
          width: 100%;
          border-collapse: collapse;
        }

        .po-table thead {
          background: #ffffff;
        }

        .po-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          border-bottom: 2px solid #f97316;
          white-space: nowrap;
        }

        .po-row {
          transition: all 0.15s ease;
          border-left: 3px solid transparent;
        }

        .po-row:hover {
          border-left-color: #f97316;
          background: #fafbff;
        }

        .po-row td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          font-size: 13px;
          color: #1e293b;
        }

        .po-row:last-child td {
          border-bottom: none;
        }

        .po-code-cell {
          color: #ea580c;
          font-weight: 700;
          text-decoration: underline;
          cursor: pointer;
        }

        .status-badge-po {
          display: inline-flex;
          align-items: center;
          padding: 3px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 800;
          border: 1px solid transparent;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .action-btn-po {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #334155;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .action-btn-po:hover {
          border-color: #cbd5e1;
          background: #ffffff;
          color: #f97316;
        }

        .date-cell { color: #64748b; font-size: 12px; }
        .points-cell { font-weight: 800; font-size: 13.5px; }
        .balance-cell { font-weight: 700; color: #0f172a; }
        .remarks-cell { color: #64748b; font-size: 12px; }
      `}</style>
    </div>
  );
}

export default function LoyaltyPage() {
  return (
    <DashboardLayout title="Loyalty" subtitle="Manage programs, rules, and customer rewards">
      <ModuleGate>
        <LoyaltyContent />
      </ModuleGate>
    </DashboardLayout>
  );
}
