import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { FaWallet, FaBook, FaChartPie, FaExchangeAlt, FaPlus, FaRedo, FaSearch, FaSync, FaExclamationTriangle, FaFileCsv, FaInfoCircle, FaChartBar, FaTag, FaChartLine, FaReceipt, FaCreditCard, FaFileInvoice, FaArrowDown, FaCheckCircle, FaEdit, FaBan, FaToggleOn, FaToggleOff, FaFilter, FaTrashAlt, FaPercent, FaCoins } from 'react-icons/fa';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import api from '../../utils/api';
import { getBusinessNow } from '../../utils/timezoneUtils';
import { subscribeAccountingDataChanged } from '../../utils/accountingRealtime';
import { getCurrencySymbol } from '../../constants/expenseScopes';


const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const TYPE_LABELS = { ASSET: 'Asset', LIABILITY: 'Liability', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expense' };
const TYPE_COLORS = { ASSET: '#10b981', LIABILITY: '#f59e0b', EQUITY: '#6366f1', INCOME: '#3b82f6', EXPENSE: '#ef4444' };

const blankAccount = {
  code: '',
  name: '',
  accountType: 'ASSET',
  accountSubType: '',
  openingBalance: 0,
  currentBalance: 0,
  cashAccount: false,
  bankAccount: false,
  isActive: 'Y'
};

function defaultJournalDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function localDatePart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultAccountingPeriod(timezone) {
  const bizNow = getBusinessNow(timezone);
  const date = localDatePart(bizNow);
  return {
    from: `${date}T00:00`,
    to: `${date}T23:59`
  };
}

function toInstant(dtLocal) {
  if (!dtLocal) return undefined;
  try {
    return new Date(`${dtLocal}:00`).toISOString();
  } catch {
    return undefined;
  }
}

function blankJournalLine() {
  return { accountId: '', debit: '', credit: '', description: '' };
}

/**********************************************************
 * Safe numeric parsing & formatting helpers
 **********************************************************/
function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return numberValue(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function periodDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function isWithinPeriod(value, selectedPeriod) {
  const target = periodDate(value);
  const from = periodDate(selectedPeriod?.from);
  const to = periodDate(selectedPeriod?.to);
  return Boolean(target && from && to && target >= from && target <= to);
}

function suggestedJournalDateForPeriod(selectedPeriod) {
  const now = defaultJournalDate();
  return isWithinPeriod(now, selectedPeriod) ? now : (selectedPeriod?.to || now);
}

function formatPeriodValue(value) {
  const parsed = periodDate(value);
  if (!parsed) return '-';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatPostingTime(value) {
  const parsed = periodDate(value);
  if (!parsed) return '-';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : '-';
}

function accountingErrorMessage(err, fallback) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return 'Your session or branch access expired. Please sign in again or reselect the branch.';
  }
  return err?.response?.data?.message || fallback;
}

export default function AccountingPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Accounting">
      <AccountingContent />
    </RoleGate>
  );
}

function AccountingContent() {
  const router = useRouter();
  const { timezone, userRole, currency } = useAuth();
  const SYM = getCurrencySymbol(currency);

  const { notify, showConfirm } = useNotification();
  const canManagePostingErrors = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  // Superadmin org/terminal filter states
  const [organizations, setOrganizations] = useState([]);
  const [allTerminals, setAllTerminals] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [config, setConfig] = useState(null);

  // Load organizations and terminals for superadmin
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([
      api.get('/api/v1/organizations'),
      api.get('/api/v1/terminals')
    ]).then(([orgRes, termRes]) => {
      if (orgRes.data?.success) setOrganizations(orgRes.data.data || []);
      if (termRes.data?.success) setAllTerminals(termRes.data.data || []);
    }).catch(() => {});
  }, [isSuperAdmin]);

  // Load configuration
  useEffect(() => {
    let active = true;
    const params = {};
    if (isSuperAdmin && selectedOrgId) {
      params.orgId = selectedOrgId;
    }
    api.get('/api/v1/configurations', { params })
      .then(res => {
        if (!active) return;
        setConfig(res.data?.data || null);
      })
      .catch(() => {
        if (active) setConfig(null);
      });
    return () => { active = false; };
  }, [isSuperAdmin, selectedOrgId]);

  // When org changes, clear terminal selection
  const handleOrgChange = (val) => {
    setSelectedOrgId(val);
    setSelectedTerminalId('');
  };

  // Terminals filtered by selected org
  const filteredTerminals = useMemo(() => {
    if (!selectedOrgId) return allTerminals;
    return allTerminals.filter(t => t.orgId === selectedOrgId || t.organization?.id === selectedOrgId);
  }, [allTerminals, selectedOrgId]);

  // State
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [postingErrors, setPostingErrors] = useState([]);
  const [retryingPostingId, setRetryingPostingId] = useState(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [detailLoadError, setDetailLoadError] = useState(null);

  const [savingAccount, setSavingAccount] = useState(false);
  const [postingJournal, setPostingJournal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [period, setPeriod] = useState(() => defaultAccountingPeriod(timezone));
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editAccountForm, setEditAccountForm] = useState(blankAccount);
  const [savingEditAccount, setSavingEditAccount] = useState(false);
  const [togglingAccountId, setTogglingAccountId] = useState(null);
  const [sortBy, setSortBy] = useState('entryDate');
  const [sortDir, setSortDir] = useState('DESC');
  const [accountsSortBy, setAccountsSortBy] = useState('code');
  const [accountsSortDir, setAccountsSortDir] = useState('ASC');
  const [journalTypeFilter, setJournalTypeFilter] = useState('all');
  const [voidingJournalId, setVoidingJournalId] = useState(null);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const handleDateFromChange = (value) => {
    if (!value) return;
    setPeriod(current => {
      const next = { ...current, from: value };
      const fromDate = new Date(next.from);
      const toDate = new Date(next.to);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
        if (fromDate > toDate) {
          notify('error', 'From date must be before to date');
          return current;
        }
        const days = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
        if (days > 366) {
          notify('error', 'Accounting date range cannot exceed 366 days');
          return current;
        }
      }
      setJournalForm(jf => ({
        ...jf,
        entryDate: jf.entryDate && isWithinPeriod(jf.entryDate, next)
          ? jf.entryDate
          : suggestedJournalDateForPeriod(next)
      }));
      return next;
    });
  };

  const handleDateToChange = (value) => {
    if (!value) return;
    setPeriod(current => {
      const next = { ...current, to: value };
      const fromDate = new Date(next.from);
      const toDate = new Date(next.to);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
        if (fromDate > toDate) {
          notify('error', 'From date must be before to date');
          return current;
        }
        const days = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
        if (days > 366) {
          notify('error', 'Accounting date range cannot exceed 366 days');
          return current;
        }
      }
      setJournalForm(jf => ({
        ...jf,
        entryDate: jf.entryDate && isWithinPeriod(jf.entryDate, next)
          ? jf.entryDate
          : suggestedJournalDateForPeriod(next)
      }));
      return next;
    });
  };

  const InfoTooltip = ({ id, text }) => {
    const isOpen = activeTooltip === id;
    const ref = React.useRef(null);
    const [coords, setCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
    const [arrowCoords, setArrowCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });

    useEffect(() => {
      if (isOpen) {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const screenWidth = window.innerWidth;
          
          if (rect.left < 16) {
            setCoords({ left: '-16px', transform: 'none', right: 'auto' });
            setArrowCoords({ left: '20px', transform: 'none', right: 'auto' });
          } else if (rect.right > screenWidth - 16) {
            setCoords({ right: '-16px', left: 'auto', transform: 'none' });
            setArrowCoords({ right: '20px', left: 'auto', transform: 'none' });
          } else {
            setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
            setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
          }
        }
      } else {
        setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
        setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
      }
    }, [isOpen]);

    return (
      <span
        className="custom-tooltip-wrapper"
        onMouseEnter={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
            setActiveTooltip(id);
          }
        }}
        onMouseLeave={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
            if (activeTooltip === id) setActiveTooltip(null);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveTooltip(isOpen ? null : id);
        }}
      >
        <FaInfoCircle className={`custom-tooltip-icon ${isOpen ? 'active' : ''}`} />
        {isOpen && (
          <span ref={ref} className="custom-tooltip-box" style={coords} onClick={(e) => e.stopPropagation()}>
            {text}
            <span className="custom-tooltip-arrow" style={arrowCoords} />
          </span>
        )}
      </span>
    );
  };

  const [accountForm, setAccountForm] = useState(blankAccount);
  const [journalForm, setJournalForm] = useState(() => {
    const initialPeriod = defaultAccountingPeriod(timezone);
    return {
      entryDate: suggestedJournalDateForPeriod(initialPeriod),
      description: '',
      lines: [blankJournalLine(), blankJournalLine()]
    };
  });

  const fetchAccountingData = useCallback(async (periodOverride = null) => {
    const effectivePeriod = periodOverride || period;
    setLoadError(null);
    setDetailLoadError(null);
    setInitialLoading(true);
    setDetailLoading(false);

    try {
      const periodParams = { from: toInstant(effectivePeriod.from), to: toInstant(effectivePeriod.to) };
      if (isSuperAdmin && selectedOrgId) periodParams.orgId = selectedOrgId;
      if (isSuperAdmin && selectedTerminalId) periodParams.terminalId = selectedTerminalId;
      const journalParams = { ...periodParams, sortBy, sortDir };

      // Core queries: Accounts & Summary
      const coreResults = await Promise.allSettled([
        api.get('/api/v1/accounting/accounts', { params: periodParams }),
        api.get('/api/v1/accounting/summary', { params: periodParams })
      ]);

      const [accountResp, summaryResp] = coreResults;
      if (accountResp.status === 'fulfilled' && accountResp.value.data.success) setAccounts(accountResp.value.data.data || []);
      if (summaryResp.status === 'fulfilled' && summaryResp.value.data.success) setSummary(summaryResp.value.data.data || null);

      const coreFailure = coreResults.find(result => result.status === 'rejected');
      if (coreFailure) {
        const message = accountingErrorMessage(coreFailure.reason, 'Core accounting data could not be loaded');
        setLoadError(message);
        notify('error', message);
        if ([401, 403].includes(coreFailure.reason?.response?.status)) {
          setInitialLoading(false);
          return;
        }
      }

      setInitialLoading(false);

      // Detail queries: reconciliation, journals, trial-balance, posting-errors
      const detailRequests = [
        {
          key: 'reconciliation',
          request: api.get('/api/v1/accounting/reconciliation', { params: periodParams }),
          apply: resp => setReconciliation(resp.data.data || null)
        },
        {
          key: 'journals',
          request: api.get('/api/v1/accounting/journals', { params: journalParams }),
          apply: resp => setJournals(resp.data.data || [])
        },
        {
          key: 'trial balance',
          request: api.get('/api/v1/accounting/trial-balance', { params: periodParams }),
          apply: resp => setTrialBalance(resp.data.data || [])
        }
      ];

      if (canManagePostingErrors) {
        detailRequests.push({
          key: 'posting errors',
          request: api.get('/api/v1/accounting/posting-errors'),
          apply: resp => setPostingErrors(resp.data.data || [])
        });
      } else {
        setPostingErrors([]);
      }

      setDetailLoading(true);
      const detailResults = await Promise.allSettled(detailRequests.map(item => item.request));

      let detailFailure = null;
      detailResults.forEach((result, index) => {
        const item = detailRequests[index];
        if (result.status === 'fulfilled' && result.value.data.success) {
          item.apply(result.value);
          return;
        }
        if (!detailFailure) {
          detailFailure = result.status === 'rejected'
            ? result.reason
            : { response: { data: { message: `${item.key} data could not be loaded` } } };
        }
      });

      if (detailFailure) {
        const message = accountingErrorMessage(detailFailure, 'Some detailed accounting data could not be loaded');
        setDetailLoadError(message);
        notify('warning', message);
      }
    } catch (err) {
      const message = accountingErrorMessage(err, 'Failed to load accounting data');
      setLoadError(message);
      notify('error', message);
    } finally {
      setInitialLoading(false);
      setDetailLoading(false);
    }
  }, [period, canManagePostingErrors, notify, sortBy, sortDir, selectedOrgId, selectedTerminalId, isSuperAdmin]);

  const handleSyncPastData = async () => {
    setSyncing(true);
    try {
      const resp = await api.post('/api/v1/accounting/backfill', {
        from: toInstant(period.from),
        to: toInstant(period.to),
        sourceTypes: ['INVOICE', 'PAYMENT', 'COGS', 'STOCK', 'EXPENSE', 'PURCHASE'],
        dryRun: false
      }, {
        skipOfflineQueue: true
      });
      if (resp.data.success) {
        const d = resp.data.data;
        const failures = Array.isArray(d.failures) ? d.failures.filter(Boolean) : [];
        const failurePreview = failures.length
          ? ` Failed: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? `, +${failures.length - 3} more` : ''}.`
          : '';
        notify((d.failed || 0) > 0 ? 'warning' : 'success', `Sync complete: ${d.posted || 0} posted, ${d.skipped || 0} skipped, ${d.failed || 0} failed.${failurePreview}`);
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryPosting = async (jobId) => {
    if (!jobId) return;
    setRetryingPostingId(jobId);
    try {
      const resp = await api.post(`/api/v1/accounting/posting-errors/${jobId}/retry`, {}, {
        skipOfflineQueue: true
      });
      if (resp.data.success) {
        notify('success', 'Posting retry queued');
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Posting retry failed');
    } finally {
      setRetryingPostingId(null);
    }
  };

  useEffect(() => {
    fetchAccountingData();
  }, [fetchAccountingData]);

  // Real-time synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let timerId = null;
    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => fetchAccountingData(), 500);
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    const unsubscribe = subscribeAccountingDataChanged(scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      if (timerId) window.clearTimeout(timerId);
      unsubscribe?.();
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [fetchAccountingData]);

  // Memoized filters & computed arrays
  const displayedAccounts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = !term ? accounts : accounts.filter(account => {
      return (
        account.code?.toLowerCase().includes(term) ||
        account.name?.toLowerCase().includes(term) ||
        account.accountType?.toLowerCase().includes(term) ||
        account.accountSubType?.toLowerCase().includes(term)
      );
    });

    const direction = accountsSortDir === 'ASC' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let valA = null;
      let valB = null;

      if (accountsSortBy === 'name') {
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) * direction;
      } else if (accountsSortBy === 'type') {
        return String(a.accountType || '').localeCompare(String(b.accountType || ''), undefined, { sensitivity: 'base' }) * direction;
      } else if (accountsSortBy === 'beforePeriod') {
        valA = numberValue(a.periodOpening);
        valB = numberValue(b.periodOpening);
      } else if (accountsSortBy === 'moneyIn') {
        valA = numberValue(a.periodDebit);
        valB = numberValue(b.periodDebit);
      } else if (accountsSortBy === 'moneyOut') {
        valA = numberValue(a.periodCredit);
        valB = numberValue(b.periodCredit);
      } else if (accountsSortBy === 'netChange') {
        valA = numberValue(a.periodNet);
        valB = numberValue(b.periodNet);
      } else if (accountsSortBy === 'afterPeriod') {
        valA = numberValue(a.periodClosing);
        valB = numberValue(b.periodClosing);
      } else if (accountsSortBy === 'totalDebit') {
        valA = Math.abs(numberValue(a.periodNet));
        valB = Math.abs(numberValue(b.periodNet));
      } else {
        // default / code
        const codeCompare = String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true, sensitivity: 'base' });
        if (codeCompare !== 0) return codeCompare * direction;
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) * direction;
      }

      if (valA !== null && valB !== null) {
        return (valA - valB) * direction;
      }
      return 0;
    });
  }, [accounts, searchTerm, accountsSortBy, accountsSortDir]);

  const sortedJournals = useMemo(() => {
    if (journalTypeFilter === 'all') return journals;
    return journals.filter(entry => {
      const source = String(entry.sourceType || '').toUpperCase();
      if (journalTypeFilter === 'payment') return source.includes('PAYMENT');
      if (journalTypeFilter === 'invoice') return source.includes('INVOICE') || source.includes('BILL') || source.includes('RECEIPT');
      if (journalTypeFilter === 'inventory') return source.includes('COGS') || source.includes('STOCK');
      if (journalTypeFilter === 'reversal') return source.includes('REV');
      if (journalTypeFilter === 'journal') return !source.includes('PAYMENT') && !source.includes('INVOICE') && !source.includes('BILL') && !source.includes('RECEIPT') && !source.includes('COGS') && !source.includes('STOCK') && !source.includes('REV');
      return true;
    });
  }, [journals, journalTypeFilter]);

  const accountOptions = useMemo(() => {
    return accounts.map(account => ({
      value: account.id,
      label: `${account.code} - ${account.name}`
    }));
  }, [accounts]);

  const accountById = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account;
      return acc;
    }, {});
  }, [accounts]);

  const journalTotals = useMemo(() => {
    return journalForm.lines.reduce((acc, line) => {
      acc.debit += numberValue(line.debit);
      acc.credit += numberValue(line.credit);
      return acc;
    }, { debit: 0, credit: 0 });
  }, [journalForm.lines]);

  const summaryValue = useCallback((key) => numberValue(summary?.[key]), [summary]);

  const periodLabel = useMemo(() => {
    return `Showing accounting data from ${formatPeriodValue(period.from)} to ${formatPeriodValue(period.to)}`;
  }, [period]);

  // CSV Export utility
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const exportCSV = (headers, rows, filename) => {
    if (!rows.length) return notify('error', 'No data to export');
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${period.from.split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const journalOutsideSelectedPeriod = useMemo(() => {
    return journalForm.entryDate && !isWithinPeriod(journalForm.entryDate, period);
  }, [journalForm.entryDate, period]);

  // Display map helper for journal entry rows
  const journalDisplay = useCallback((entry) => {
    const source = String(entry.sourceType || '').toUpperCase();
    const documentNo = entry.entryNo || '-';
    const amount = numberValue(entry.totalDebit);

    if (source.includes('PAYMENT')) {
      return {
        type: source.includes('OUTBOUND') ? 'Payment Out' : 'Payment In',
        documentNo,
        received: source.includes('OUTBOUND') ? 0 : amount,
        paid: source.includes('OUTBOUND') ? amount : 0,
        adjustment: 0
      };
    }
    if (source.includes('INVOICE') || source.includes('BILL') || source.includes('RECEIPT')) {
      return {
        type: source.includes('VENDOR') || source.includes('EXPENSE') ? 'Bill / Expense' : 'Sale Invoice',
        documentNo,
        received: 0,
        paid: 0,
        adjustment: amount
      };
    }
    if (source.includes('COGS') || source.includes('STOCK')) {
      return {
        type: 'Inventory',
        documentNo,
        received: 0,
        paid: 0,
        adjustment: amount
      };
    }
    if (source.includes('REV')) {
      return {
        type: 'Reversal',
        documentNo,
        received: 0,
        paid: 0,
        adjustment: amount
      };
    }
    return {
      type: 'Journal',
      documentNo,
      received: 0,
      paid: 0,
      adjustment: amount
    };
  }, []);

  // Creation/Edit form submissions
  const handleCreateAccount = async (event) => {
    event.preventDefault();
    if (!accountForm.code.trim() || !accountForm.name.trim()) {
      notify('error', 'Account code and name are required');
      return;
    }
    setSavingAccount(true);
    try {
      const payload = {
        ...accountForm,
        code: accountForm.code.trim().toUpperCase(),
        name: accountForm.name.trim(),
        openingBalance: numberValue(accountForm.openingBalance),
        currentBalance: numberValue(accountForm.currentBalance || accountForm.openingBalance)
      };
      const resp = await api.post('/api/v1/accounting/accounts', payload);
      if (resp.data.success) {
        notify('success', 'Account created');
        setAccountForm(blankAccount);
        setShowAddAccountModal(false);
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to create account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleUpdateAccount = async (event) => {
    event.preventDefault();
    if (!editAccountForm.name.trim()) {
      notify('error', 'Account name is required');
      return;
    }
    setSavingEditAccount(true);
    try {
      const payload = {
        name: editAccountForm.name.trim(),
        accountType: editAccountForm.accountType,
        accountSubType: editAccountForm.accountSubType,
        openingBalance: numberValue(editAccountForm.openingBalance),
        currentBalance: numberValue(editAccountForm.currentBalance),
        cashAccount: editAccountForm.cashAccount,
        bankAccount: editAccountForm.bankAccount,
      };
      const resp = await api.put(`/api/v1/accounting/accounts/${editingAccount.id}`, payload);
      if (resp.data.success) {
        notify('success', 'Account updated');
        setEditingAccount(null);
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to update account');
    } finally {
      setSavingEditAccount(false);
    }
  };

  const handleToggleAccountStatus = async (account) => {
    const newStatus = account.isActive === 'Y' ? 'N' : 'Y';
    const action = newStatus === 'N' ? 'Deactivate' : 'Activate';
    showConfirm({
      title: `${action} Account`,
      message: `Are you sure you want to ${action.toLowerCase()} the account "${account.name}"?`,
      onConfirm: async () => {
        setTogglingAccountId(account.id);
        try {
          const resp = await api.put(`/api/v1/accounting/accounts/${account.id}`, {
            ...account,
            isActive: newStatus
          });
          if (resp.data.success) {
            notify('success', `Account ${action.toLowerCase()}d`);
            await fetchAccountingData();
          }
        } catch (err) {
          notify('error', err.response?.data?.message || `Failed to ${action.toLowerCase()} account`);
        } finally {
          setTogglingAccountId(null);
        }
      }
    });
  };

  const handleVoidJournal = async (entry) => {
    const isManual = !entry.sourceType || String(entry.sourceType).toUpperCase() === 'MANUAL' || String(entry.sourceType).toUpperCase() === 'JOURNAL';
    if (!isManual) {
      notify('error', 'Only manually posted journal entries can be voided. Auto-entries are managed via Sync.');
      return;
    }
    showConfirm({
      title: 'Void Journal Entry',
      message: `Void entry ${entry.entryNo || entry.id}? This action cannot be undone and will reverse all debit/credit lines.`,
      onConfirm: async () => {
        setVoidingJournalId(entry.id);
        try {
          const resp = await api.post(`/api/v1/accounting/journals/${entry.id}/void`, {}, { skipOfflineQueue: true });
          if (resp.data.success) {
            notify('success', 'Journal entry voided');
            await fetchAccountingData();
          }
        } catch (err) {
          notify('error', err.response?.data?.message || 'Failed to void journal entry');
        } finally {
          setVoidingJournalId(null);
        }
      }
    });
  };

  const handleResyncAll = async () => {
    showConfirm({
      title: 'Rebuild Auto Entries',
      message: 'This safely rebuilds auto-posted accounting entries only. Manual journals will be preserved. Continue?',
      onConfirm: async () => {
        setSyncing(true);
        try {
          const resp = await api.post('/api/v1/accounting/resync-all', null, {
            skipOfflineQueue: true
          });
          if (resp.data.success) {
            const d = resp.data.data || {};
            const failures = Array.isArray(d.failures) ? d.failures.filter(Boolean) : [];
            const summary = `Done: ${d.posted || 0} posted, ${d.skipped || 0} skipped, ${d.failed || 0} failed.`;
            if ((d.failed || 0) > 0) {
              const preview = failures.slice(0, 3).join('; ');
              notify('warning', preview ? `${summary} Check: ${preview}` : summary);
            } else {
              notify('success', summary);
            }
            await fetchAccountingData();
          }
        } catch (err) {
          if (err.response?.status === 409) {
            notify('error', 'Auto-entry rebuild could not clear old accounting links yet. Refresh and try again after the latest backend deploy.');
          } else {
            notify('error', err.response?.data?.message || 'Fix failed. Please try again.');
          }
        } finally {
          setSyncing(false);
        }
      }
    });
  };

  const updateJournalLine = (index, patch) => {
    setJournalForm(current => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (
        lineIndex === index ? { ...line, ...patch } : line
      ))
    }));
  };

  const addJournalLine = () => {
    setJournalForm(current => ({
      ...current,
      lines: [...current.lines, blankJournalLine()]
    }));
  };

  const removeJournalLine = index => {
    setJournalForm(current => ({
      ...current,
      lines: current.lines.length <= 2
        ? current.lines
        : current.lines.filter((_, lineIndex) => lineIndex !== index)
    }));
  };

  const handlePostJournal = async (event) => {
    event.preventDefault();
    const lines = journalForm.lines
      .map(line => ({
        accountId: line.accountId,
        debit: numberValue(line.debit),
        credit: numberValue(line.credit),
        description: line.description?.trim() || null
      }))
      .filter(line => line.accountId && (line.debit > 0 || line.credit > 0));

    if (lines.length < 2) {
      notify('error', 'Add at least two journal lines');
      return;
    }
    if (Math.abs(journalTotals.debit - journalTotals.credit) > 0.001 || journalTotals.debit <= 0) {
      notify('error', 'Journal debit and credit must match');
      return;
    }

    setPostingJournal(true);
    try {
      const resp = await api.post('/api/v1/accounting/journals', {
        entryDate: journalForm.entryDate,
        description: journalForm.description?.trim() || null,
        lines
      });
      if (resp.data.success) {
        notify('success', 'Journal posted');
        setJournalForm({
          entryDate: suggestedJournalDateForPeriod(period),
          description: '',
          lines: [blankJournalLine(), blankJournalLine()]
        });
        setShowAddEntryModal(false);
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to post journal');
    } finally {
      setPostingJournal(false);
    }
  };

  // Error and Loading states
  if (loadError && !summary && accounts.length === 0 && !initialLoading) {
    return (
      <div className="loading-state loading-error-state">
        <span>{loadError}</span>
        <button
          type="button"
          onClick={() => fetchAccountingData()}
          style={{
            minHeight: '38px',
            border: 0,
            borderRadius: '8px',
            padding: '0 16px',
            background: '#f97316',
            color: '#fff',
            fontWeight: 900,
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (initialLoading && !summary && accounts.length === 0) {
    return <div className="loading-state"><span>Loading accounting summary...</span></div>;
  }

  const otherActivePayments = numberValue(reconciliation?.otherActivePaymentsTotal);
  const unmatchedPaymentCount = numberValue(reconciliation?.unmatchedPaymentCount);

  // Calculations sourced directly from the backend AccountingSummaryDto.
  // Backend now computes ex-tax grossSales and netSales per Indian GAAP / Ind AS 115.
  // grossSales = (billedTotal - outputTax) + discounts  (ex-tax, pre-discount revenue)
  // netSales   = billedTotal - outputTax               (ex-tax, post-discount revenue)
  const outputTax = summaryValue('outputTax');
  const discounts = summaryValue('discounts');
  const billedTotal = summaryValue('billedTotal');
  const grossSales = summaryValue('grossSales');  // ex-tax from backend
  const netSales = summaryValue('netSales');      // ex-tax from backend
  const paymentCollected = summaryValue('paymentCollected');
  const expenses = summaryValue('expenses') + summaryValue('cogsPurchases');
  const profit = summaryValue('profit');

  return (
    <DashboardLayout title="Money Book" showBack={true}>
      <div className="accounting-page" onClick={() => setActiveTooltip(null)}>
        {/* Period control panel (exact alignment with Reports screen layout) */}
        <div className="period-toolbar top-period-toolbar">
          <PremiumDateTimePicker value={period.from} onChange={handleDateFromChange} />
          <span className="period-sep">→</span>
          <PremiumDateTimePicker value={period.to} onChange={handleDateToChange} />
          {isSuperAdmin && (
            <>
              <span className="period-ctrl-sep" />
              <NiceSelect
                value={selectedOrgId}
                onChange={handleOrgChange}
                options={[
                  { value: '', label: 'All Branches' },
                  ...organizations.map(o => ({ value: o.id, label: o.name }))
                ]}
                style={{ minWidth: 140, maxWidth: 170 }}
              />
              <NiceSelect
                value={selectedTerminalId}
                onChange={setSelectedTerminalId}
                options={[
                  { value: '', label: 'All Terminals' },
                  ...filteredTerminals.map(t => ({ value: t.id, label: t.name + (t.terminalCode ? ` (${t.terminalCode})` : '') }))
                ]}
                style={{ minWidth: 140, maxWidth: 170 }}
              />
            </>
          )}
          <button
            type="button"
            className="tax-reports-shortcut-btn"
            onClick={() => router.push('/owner/tax-reports')}
            title="View Tax Reports & Details"
            style={{
              minHeight: '38px', height: '38px', padding: '0 14px', fontSize: '12.5px',
              background: '#fffbeb', border: '1.5px solid #fed7aa', color: '#ea580c',
              borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              marginLeft: 'auto'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#fef3c7';
              e.currentTarget.style.borderColor = '#f59e0b';
              e.currentTarget.style.color = '#b45309';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#fffbeb';
              e.currentTarget.style.borderColor = '#fed7aa';
              e.currentTarget.style.color = '#ea580c';
            }}
          >
            <FaPercent /> Tax Reports
          </button>
        </div>

        {/* Financial KPI summary cards (styled exactly like reports screen summary) */}
        <section className="summary-grid">
          {/* Card 1: Gross Sales */}
          {config?.discountEnabled !== false && (
            <div className="summary-tile" style={{ borderLeft: '4px solid #0ea5e9' }}>
              <div className="summary-tile-icon" style={{ background: '#f0f9ff', color: '#0ea5e9' }}><FaChartBar /></div>
              <div style={{ display: 'contents' }}>
                <span>
                  Gross Sales
                  <InfoTooltip id="grossSalesTip" text="Gross Sales (Ex-Tax): Pre-discount revenue excluding GST and Round Off. | Equation: Gross Sales = Net Sales + Discounts" />
                </span>
                <strong>{SYM}{money(grossSales)}</strong>
              </div>
            </div>
          )}

          {/* Card 2: Discounts */}
          {config?.discountEnabled !== false && (
            <div className="summary-tile" style={{ borderLeft: '4px solid #ec4899' }}>
              <div className="summary-tile-icon" style={{ background: '#fdf2f8', color: '#ec4899' }}><FaTag /></div>
              <div style={{ display: 'contents' }}>
                <span>
                  Discounts
                  <InfoTooltip id="discountsTip" text="Discounts: Total price reductions granted on orders (item-level and order-level). | Equation: Discounts = Gross Sales − Net Sales" />
                </span>
                <strong>{SYM}{money(discounts)}</strong>
              </div>
            </div>
          )}

          {/* Card 3: Net Sales */}
          <div className="summary-tile" style={{ borderLeft: '4px solid #16a34a' }}>
            <div className="summary-tile-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><FaChartLine /></div>
            <div style={{ display: 'contents' }}>
              <span>
                Net Sales
                <InfoTooltip id="netSalesTip" text="Net Sales (Ex-Tax): Revenue after discounts, excluding GST and Round Off. | Equation: Net Sales = Billed Total − GST − Round Off" />
              </span>
              <strong style={{ color: '#16a34a' }}>{SYM}{money(netSales)}</strong>
            </div>
          </div>

          {/* Card 4: Billed Total */}
          <div className="summary-tile" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="summary-tile-icon" style={{ background: '#ecfdf5', color: '#10b981' }}><FaReceipt /></div>
            <div style={{ display: 'contents' }}>
              <span>
                Billed Total
                <InfoTooltip id="billedTotalTip" text="Billed Total: The actual amount billed to customers, including GST, across all settled orders. | Equation: Billed Total = Net Sales + GST + Round Off" />
              </span>
              <strong>{SYM}{money(billedTotal)}</strong>
            </div>
          </div>

          {/* Card: Round Off */}
          {config?.roundOffEnabled !== false && (
            <div className="summary-tile" style={{ borderLeft: '4px solid #64748b' }}>
              <div className="summary-tile-icon" style={{ background: '#f1f5f9', color: '#64748b' }}><FaCoins /></div>
              <div style={{ display: 'contents' }}>
                <span>
                  Round Off
                  <InfoTooltip id="roundOffTip" text="Round Off: Net round-off adjustments on invoices. | Equation: Round Off = Billed Total − Net Sales − GST" />
                </span>
                <strong>{SYM}{money(summaryValue('roundOff'))}</strong>
              </div>
            </div>
          )}

          {/* Card 5: Payment Collected */}
          <div className="summary-tile" style={{ borderLeft: '4px solid #6366f1' }}>
            <div className="summary-tile-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}><FaCreditCard /></div>
            <div style={{ display: 'contents' }}>
              <span>
                Payment Collected
                <InfoTooltip id="paymentCollectedTip" text="Payment Collected: Total money actually received via Cash, UPI, Cards, or other modes. | Equation: Payment Collected = Cash + UPI + Card + Online + Bank + Cheque" />
              </span>
              <strong>{SYM}{money(paymentCollected)}</strong>
            </div>
          </div>

          {/* Card 6: Output Tax */}
          {config?.taxEnabled !== false && (
            <div className="summary-tile" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="summary-tile-icon" style={{ background: '#fef2f2', color: '#ef4444' }}><FaFileInvoice /></div>
              <div style={{ display: 'contents' }}>
                <span>
                  Output Tax
                  <InfoTooltip id="outputTaxTip" text="Output Tax (GST): Tax collected from customers, payable to the government. NOT part of business revenue. | Equation: Output Tax = Billed Total − Net Sales − Round Off" />
                </span>
                <strong>{SYM}{money(outputTax)}</strong>
              </div>
            </div>
          )}

          {/* Card 7: Expenses + COGS */}
          <div className="summary-tile" style={{ borderLeft: '4px solid #f43f5e' }}>
            <div className="summary-tile-icon" style={{ background: '#ffe4e6', color: '#f43f5e' }}><FaArrowDown /></div>
            <div style={{ display: 'contents' }}>
              <span>
                Expenses + COGS
                <InfoTooltip id="expensesTip" text="Expenses + COGS: Total operating expenses plus Cost of Goods Sold (raw materials, stock, purchases). | Equation: Total Costs = COGS + Operating Expenses" />
              </span>
              <strong style={{ color: '#ef4444' }}>{SYM}{money(expenses)}</strong>
            </div>
          </div>

          {/* Card 8: Profit */}
          <div className="summary-tile" style={{ borderLeft: `4px solid ${profit >= 0 ? '#10b981' : '#ef4444'}` }}>
            <div className="summary-tile-icon" style={{ background: profit >= 0 ? '#ecfdf5' : '#fef2f2', color: profit >= 0 ? '#10b981' : '#ef4444' }}><FaCheckCircle /></div>
            <div style={{ display: 'contents' }}>
              <span>
                Profit
                <InfoTooltip id="profitTip" text="Net Profit: Final business profit after all deductions. | Equation: Net Profit = Net Sales + Round Off − COGS − Operating Expenses" />
              </span>
              <strong style={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}>{SYM}{money(profit)}</strong>
            </div>
          </div>

        </section>

        {/* Main Work Area */}
        <section className="workspace">
          <header className="workspace-header">
            <div className="title-block">
              <div className="page-title"><FaWallet /> Money Book</div>
              <p>Track all your money — accounts, transactions, and balances in one place.</p>
            </div>
            <div className="workspace-header-actions">
              <button className="primary-button" onClick={handleSyncPastData} disabled={syncing} title="Sync all past sales, expenses & payments into accounting">
                <FaSync style={syncing ? { animation: 'spin 1s linear infinite' } : {}} /> {syncing ? 'Syncing...' : 'Sync Selected Period'}
              </button>


              <button className="btn-danger-outline" onClick={handleResyncAll} disabled={syncing} title="Rebuild only auto-posted accounting entries. Manual journals stay untouched.">
                Fix Auto Entries
              </button>
              <button className="icon-button" onClick={() => fetchAccountingData()} title="Refresh">
                <FaRedo />
              </button>
            </div>
          </header>

          {loadError && <div className="load-error-banner">{loadError}</div>}
          {detailLoading && <div className="load-banner">Loading detailed accounting rows...</div>}
          {detailLoadError && <div className="load-error-banner">{detailLoadError}</div>}

          {/* Sub-tabs selection */}
          <div className="tab-row">
            <button className={activeTab === 'accounts' ? 'active' : ''} onClick={() => setActiveTab('accounts')}><FaBook /> Money Accounts</button>
            <button className={activeTab === 'journals' ? 'active' : ''} onClick={() => setActiveTab('journals')}><FaExchangeAlt /> Transaction History</button>
            <button className={activeTab === 'trial' ? 'active' : ''} onClick={() => setActiveTab('trial')}><FaChartPie /> Balance Summary</button>
          </div>

          {/* Posting Errors warning block */}
          {canManagePostingErrors && postingErrors.length > 0 && (
            <div className="posting-error-panel">
              <div className="posting-error-heading">
                <strong><FaExclamationTriangle /> Accounting posting failures</strong>
                <span>{postingErrors.length} failed {postingErrors.length === 1 ? 'job' : 'jobs'}</span>
              </div>
              <div className="posting-error-list">
                {postingErrors.slice(0, 5).map(job => (
                  <div className="posting-error-row" key={job.id}>
                    <div className="posting-error-main">
                      <span className="posting-source">{job.sourceType || 'SOURCE'} #{shortId(job.sourceId)}</span>
                      <span className="posting-message">{job.lastError || 'No error detail returned'}</span>
                    </div>
                    <div className="posting-error-meta">
                      <span>{job.attemptCount || 0} attempts</span>
                      <span>{formatPostingTime(job.updatedAt)}</span>
                      <button
                        type="button"
                        className="posting-retry-button"
                        onClick={() => handleRetryPosting(job.id)}
                        disabled={retryingPostingId === job.id || syncing}
                        title="Retry accounting posting"
                      >
                        <FaRedo /> {retryingPostingId === job.id ? 'Retrying...' : 'Retry'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 1: Money Accounts */}
          {activeTab === 'accounts' && (
            <div className="panel table-panel" style={{ borderRadius: '8px', border: '1px solid #eef2f7' }}>
              <div className="panel-toolbar">
                <div>
                  <h3>Your Money Accounts</h3>
                  <p className="section-helper">Before/After include previous posted entries. Money In/Out and Net Change are only for the selected period.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="primary-button"
                    style={{ minHeight: '38px', height: '38px', padding: '0 14px', fontSize: '13px' }}
                    onClick={() => setShowAddAccountModal(true)}
                  >
                    <FaPlus /> Add Account
                  </button>
                  <button
                    type="button"
                    style={{
                      minHeight: '38px', height: '38px', padding: '0 14px', fontSize: '13px',
                      background: '#fff', border: '1.5px solid #f97316', color: '#f97316',
                      borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      transition: 'all 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#fff7ed'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}
                    onClick={() => setShowAddEntryModal(true)}
                    disabled={accounts.length === 0}
                    title="Add a manual journal entry"
                  >
                    <FaPlus /> Add Entry
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '38px', height: '38px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => exportCSV(
                      ['Account Code', 'Account Name', 'Type', 'Before Period', 'Money In', 'Money Out', 'Net Change', 'After Period', 'Status'],
                      displayedAccounts.map(a => [
                        a.code, a.name, a.accountType, a.periodOpening, a.periodDebit, a.periodCredit, a.periodNet, a.periodClosing, a.isActive === 'Y' ? 'Active' : 'Inactive'
                      ].map(csvCell).join(',')),
                      'money_accounts'
                    )}
                  >
                    <FaFileCsv /> Export CSV
                  </button>
                </div>
              </div>

              <div className="panel-filter-bar">
                <div className="panel-filters">
                  <div className="period-select-wrapper">
                    <span className="select-label">Sort by</span>
                    <NiceSelect
                      value={accountsSortBy}
                      onChange={setAccountsSortBy}
                      options={[
                        { value: 'code', label: 'Account Code' },
                        { value: 'name', label: 'Account Name' },
                        { value: 'type', label: 'Account Type' },
                        { value: 'beforePeriod', label: 'Before Period' },
                        { value: 'moneyIn', label: 'Money In' },
                        { value: 'moneyOut', label: 'Money Out' },
                        { value: 'netChange', label: 'Net Change' },
                        { value: 'afterPeriod', label: 'After Period' },
                        { value: 'totalDebit', label: 'Net Change (Abs)' }
                      ]}
                      style={{ minHeight: '38px', height: '38px', minWidth: '120px' }}
                    />
                  </div>
                  <div className="period-select-wrapper">
                    <span className="select-label">Direction</span>
                    <NiceSelect
                      value={accountsSortDir}
                      onChange={setAccountsSortDir}
                      options={[
                        { value: 'ASC', label: 'Ascending' },
                        { value: 'DESC', label: 'Descending' }
                      ]}
                      style={{ minHeight: '38px', height: '38px', minWidth: '160px' }}
                    />
                  </div>
                </div>
                <div className="search-field" style={{ minWidth: '220px' }}>
                  <FaSearch />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." />
                </div>
              </div>
              <div className="rpt-tbl-wrap">
                <table className="rpt-tbl">
                  <thead><tr><th>#</th><th>Account Name</th><th>Type</th><th className="amount">Before Period</th><th className="amount">Money In</th><th className="amount">Money Out</th><th className="amount">Net Change</th><th className="amount">After Period</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {displayedAccounts.map(account => (
                      <tr key={account.id}>
                        <td className="mono">{account.code}</td>
                        <td>{account.name}</td>
                        <td><span style={{ color: TYPE_COLORS[account.accountType] || '#64748b', fontWeight: 800, fontSize: '11px' }}>{TYPE_LABELS[account.accountType] || account.accountType}</span></td>
                        <td className="amount">{SYM}{money(account.periodOpening)}</td>
                        <td className="amount" style={{ color: '#10b981' }}>{SYM}{money(account.periodDebit)}</td>
                        <td className="amount" style={{ color: '#ef4444' }}>{SYM}{money(account.periodCredit)}</td>
                        <td className="amount" style={{ color: numberValue(account.periodNet) >= 0 ? '#10b981' : '#ef4444' }}>{SYM}{money(account.periodNet)}</td>
                        <td className="amount">{SYM}{money(account.periodClosing)}</td>

                        <td><span className={`status ${account.isActive === 'Y' ? 'active' : 'inactive'}`}>{account.isActive === 'Y' ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <div className="tbl-actions">
                            <button
                              type="button"
                              className="tbl-btn tbl-btn-edit"
                              title="Edit Account"
                              onClick={() => { setEditingAccount(account); setEditAccountForm({ ...account }); }}
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className={`tbl-btn ${account.isActive === 'Y' ? 'tbl-btn-activate' : 'tbl-btn-deactivate'}`}
                              title={account.isActive === 'Y' ? 'Deactivate Account' : 'Activate Account'}
                              disabled={togglingAccountId === account.id}
                              onClick={() => handleToggleAccountStatus(account)}
                            >
                              {account.isActive === 'Y' ? <FaToggleOn /> : <FaToggleOff />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {displayedAccounts.length === 0 && (
                      <tr><td colSpan={10} className="empty-cell">No accounts found for this selected period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* TAB 3: Transaction History */}
          {activeTab === 'journals' && (
            <div className="panel table-panel">
              <div className="panel-toolbar">
                <div>
                  <h3>📋 Transactions in Selected Period</h3>
                  <p className="section-helper">Journal-backed transactions dated inside the selected From and To range.</p>
                  {sortedJournals.length >= 500 && (
                    <p className="section-helper">Showing the latest 500 transactions for this period. Narrow the date range for older entries.</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '38px', height: '38px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => exportCSV(
                      ['Type', 'Document No', 'Date', 'Description', 'Received', 'Paid', 'Adjustment', 'Status'],
                      journals.map(entry => {
                        const view = journalDisplay(entry);
                        return [
                          view.type, view.documentNo, entry.entryDate, entry.description,
                          view.received, view.paid, view.adjustment, entry.status
                        ].map(csvCell).join(',');
                      }),
                      'transactions'
                    )}
                  >
                    <FaFileCsv /> Export CSV
                  </button>
                </div>
              </div>

              <div className="panel-filter-bar">
                <div className="panel-filters">
                  <div className="period-select-wrapper">
                    <span className="select-label">Type</span>
                    <NiceSelect
                      value={journalTypeFilter}
                      onChange={setJournalTypeFilter}
                      options={[
                        { value: 'all', label: 'All Types' },
                        { value: 'payment', label: 'Payments' },
                        { value: 'invoice', label: 'Sale Invoices' },
                        { value: 'inventory', label: 'Inventory' },
                        { value: 'reversal', label: 'Reversals' },
                        { value: 'journal', label: 'Manual Journals' },
                      ]}
                      style={{ minHeight: '38px', height: '38px', minWidth: '140px' }}
                    />
                  </div>
                  <div className="period-select-wrapper">
                    <span className="select-label">Sort by</span>
                    <NiceSelect
                      value={sortBy}
                      onChange={setSortBy}
                      options={[
                        { value: 'entryDate', label: 'Date' },
                        { value: 'entryNo', label: 'Entry #' },
                        { value: 'totalDebit', label: 'Amount' },
                        { value: 'createdAt', label: 'Created' }
                      ]}
                      style={{ minHeight: '38px', height: '38px', minWidth: '120px' }}
                    />
                  </div>
                  <div className="period-select-wrapper">
                    <span className="select-label">Direction</span>
                    <NiceSelect
                      value={sortDir}
                      onChange={setSortDir}
                      options={[
                        { value: 'DESC', label: 'Descending' },
                        { value: 'ASC', label: 'Ascending' }
                      ]}
                      style={{ minHeight: '38px', height: '38px', minWidth: '160px' }}
                    />
                  </div>
                </div>
              </div>
              <div className="rpt-tbl-wrap">
                <table className="rpt-tbl">
                  <thead><tr><th>Type</th><th>Document</th><th>Date</th><th>What For</th><th className="amount">Received</th><th className="amount">Paid</th><th className="amount">Adjustment</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {sortedJournals.map(entry => {
                      const view = journalDisplay(entry);
                      return (
                        <tr key={entry.id}>
                          <td><span className="type-pill">{view.type}</span></td>
                          <td className="mono">{view.documentNo}</td>
                          <td>{entry.entryDate?.replace('T', ' ').slice(0, 16)}</td>
                          <td>{entry.description || '-'}</td>
                          <td className="amount" style={{ color: '#10b981' }}>{view.received ? `₹${money(view.received)}` : '-'}</td>
                          <td className="amount" style={{ color: '#ef4444' }}>{view.paid ? `₹${money(view.paid)}` : '-'}</td>
                          <td className="amount">{view.adjustment ? `₹${money(view.adjustment)}` : '-'}</td>
                          <td><span className="status active">{entry.status}</span></td>
                          <td>
                            {view.type === 'Journal' && (
                              <button
                                type="button"
                                className="tbl-btn tbl-btn-void"
                                title="Void this journal entry"
                                disabled={voidingJournalId === entry.id}
                                onClick={() => handleVoidJournal(entry)}
                              >
                                <FaTrashAlt />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {sortedJournals.length === 0 && (
                      <tr><td colSpan={9} className="empty-cell">{journalTypeFilter !== 'all' ? 'No transactions match this filter.' : 'No accounting transactions in this selected period.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Trial Balance summary */}
          {activeTab === 'trial' && (
            <div className="panel table-panel">
              <div className="panel-toolbar">
                <div>
                  <h3>📊 Account Movement in Selected Period</h3>
                  <p className="section-helper">This is journal-backed and period-filtered. Money In and Money Out are debit and credit movement within the selected period.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ minHeight: '38px', height: '38px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => exportCSV(
                    ['Account Code', 'Account Name', 'Type', 'Money In', 'Money Out', 'Net Amount'],
                    trialBalance.map(row => [
                      row.code, row.name || accountById[row.accountId]?.name || '-', row.accountType,
                      row.debit, row.credit, row.balance
                    ].map(csvCell).join(',')),
                    'balance_summary'
                  )}
                >
                  <FaFileCsv /> Export CSV
                </button>
              </div>
              <div className="rpt-tbl-wrap">
                <table className="rpt-tbl">
                  <thead><tr><th>#</th><th>Account</th><th>Type</th><th className="amount">Money In</th><th className="amount">Money Out</th><th className="amount">Net Amount</th></tr></thead>
                  <tbody>
                    {trialBalance.map(row => (
                      <tr key={row.accountId}>
                        <td className="mono">{row.code}</td>
                        <td>{row.name || accountById[row.accountId]?.name || '-'}</td>
                        <td><span style={{ color: TYPE_COLORS[row.accountType] || '#64748b', fontWeight: 800, fontSize: '11px' }}>{TYPE_LABELS[row.accountType] || row.accountType}</span></td>
                        <td className="amount" style={{ color: '#10b981' }}>₹{money(row.debit)}</td>
                        <td className="amount" style={{ color: '#ef4444' }}>₹{money(row.credit)}</td>
                        <td className="amount" style={{ fontWeight: 900 }}>₹{money(row.balance)}</td>
                      </tr>
                    ))}
                    {trialBalance.length === 0 && (
                      <tr><td colSpan={6} className="empty-cell">No trial balance rows yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {showAddAccountModal && (
        <div className="rpt-modal-overlay" onClick={() => setShowAddAccountModal(false)}>
          <div className="rpt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <h2 className="modal-title">Add New Account</h2>
            <form onSubmit={handleCreateAccount} style={{ display: 'contents' }}>
              <div className="modal-form">
                <div className="form-grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Account #</label>
                    <input className="form-input" value={accountForm.code} onChange={e => setAccountForm({ ...accountForm, code: e.target.value.toUpperCase() })} placeholder="e.g. 1001" required />
                  </div>
                  <div className="form-group">
                    <label>Account Name</label>
                    <input className="form-input" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="e.g. Cash Register" required />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <NiceSelect
                      value={accountForm.accountType}
                      onChange={val => setAccountForm({ ...accountForm, accountType: val })}
                      options={ACCOUNT_TYPES.map(type => ({ value: type, label: TYPE_LABELS[type] || type }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <input className="form-input" value={accountForm.accountSubType} onChange={e => setAccountForm({ ...accountForm, accountSubType: e.target.value })} placeholder="e.g. Cash, Bank, Sales" />
                  </div>
                  <div className="form-group">
                    <label>Starting Amount (₹)</label>
                    <input className="form-input" type="number" step="0.01" value={accountForm.openingBalance} onChange={e => setAccountForm({ ...accountForm, openingBalance: e.target.value, currentBalance: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Current Amount (₹)</label>
                    <input className="form-input" type="number" step="0.01" value={accountForm.currentBalance} onChange={e => setAccountForm({ ...accountForm, currentBalance: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
                <div className="flag-row" style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0 0' }}>
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '13px', color: '#334155' }}>
                    <input type="checkbox" checked={accountForm.cashAccount} onChange={e => setAccountForm({ ...accountForm, cashAccount: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                    This is a cash register
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '13px', color: '#334155' }}>
                    <input type="checkbox" checked={accountForm.bankAccount} onChange={e => setAccountForm({ ...accountForm, bankAccount: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                    This is a bank account
                  </label>
                </div>
              </div>
              <div className="rpt-modal-actions">
                <button type="button" onClick={() => setShowAddAccountModal(false)} className="rpt-modal-btn rpt-modal-btn-outline" disabled={savingAccount}>
                  Cancel
                </button>
                <button type="submit" className="rpt-modal-btn rpt-modal-btn-primary" disabled={savingAccount}>
                  {savingAccount ? 'Adding...' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingAccount && (
        <div className="rpt-modal-overlay" onClick={() => setEditingAccount(null)}>
          <div className="rpt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <h2 className="modal-title">Edit Account — {editingAccount.code}</h2>
            <form onSubmit={handleUpdateAccount} style={{ display: 'contents' }}>
              <div className="modal-form">
                <div className="form-grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Account Code</label>
                    <input className="form-input" value={editAccountForm.code} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                  <div className="form-group">
                    <label>Account Name</label>
                    <input className="form-input" value={editAccountForm.name} onChange={e => setEditAccountForm({ ...editAccountForm, name: e.target.value })} placeholder="e.g. Cash Register" required />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <NiceSelect
                      value={editAccountForm.accountType}
                      onChange={val => setEditAccountForm({ ...editAccountForm, accountType: val })}
                      options={ACCOUNT_TYPES.map(type => ({ value: type, label: TYPE_LABELS[type] || type }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <input className="form-input" value={editAccountForm.accountSubType || ''} onChange={e => setEditAccountForm({ ...editAccountForm, accountSubType: e.target.value })} placeholder="e.g. Cash, Bank, Sales" />
                  </div>
                  <div className="form-group">
                    <label>Opening Balance (₹)</label>
                    <input className="form-input" type="number" step="0.01" value={editAccountForm.openingBalance} onChange={e => setEditAccountForm({ ...editAccountForm, openingBalance: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Current Balance (₹)</label>
                    <input className="form-input" type="number" step="0.01" value={editAccountForm.currentBalance} onChange={e => setEditAccountForm({ ...editAccountForm, currentBalance: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
                <div className="flag-row" style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0 0' }}>
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '13px', color: '#334155' }}>
                    <input type="checkbox" checked={editAccountForm.cashAccount} onChange={e => setEditAccountForm({ ...editAccountForm, cashAccount: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                    This is a cash register
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '13px', color: '#334155' }}>
                    <input type="checkbox" checked={editAccountForm.bankAccount} onChange={e => setEditAccountForm({ ...editAccountForm, bankAccount: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                    This is a bank account
                  </label>
                </div>
              </div>
              <div className="rpt-modal-actions">
                <button type="button" onClick={() => setEditingAccount(null)} className="rpt-modal-btn rpt-modal-btn-outline" disabled={savingEditAccount}>
                  Cancel
                </button>
                <button type="submit" className="rpt-modal-btn rpt-modal-btn-primary" disabled={savingEditAccount}>
                  {savingEditAccount ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddEntryModal && (
        <div className="rpt-modal-overlay" onClick={() => setShowAddEntryModal(false)}>
          <div className="rpt-modal rpt-modal-wide" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Manual Journal Entry</h2>
            <form onSubmit={handlePostJournal} style={{ display: 'contents' }}>
              <div className="modal-form">
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Entry Date &amp; Time</label>
                    <input
                      className="form-input"
                      type="datetime-local"
                      value={journalForm.entryDate}
                      onChange={e => setJournalForm({ ...journalForm, entryDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <input
                      className="form-input"
                      value={journalForm.description}
                      onChange={e => setJournalForm({ ...journalForm, description: e.target.value })}
                      placeholder="e.g. Paid electricity bill"
                    />
                  </div>
                </div>
                {journalOutsideSelectedPeriod && (
                  <div className="inline-warning" style={{ margin: '4px 0 8px' }}>
                    This entry date is outside the selected period — it won&apos;t appear in the current view after posting.
                  </div>
                )}
                <div className="journal-lines" style={{ margin: '12px 0 0' }}>
                  <div className="journal-head">
                    <span>Account</span><span>Money In (+)</span><span>Money Out (−)</span><span>Note</span><span></span>
                  </div>
                  {journalForm.lines.map((line, index) => (
                    <div className="journal-line" key={index}>
                      <NiceSelect
                        value={line.accountId}
                        onChange={val => updateJournalLine(index, { accountId: val })}
                        options={accountOptions}
                        placeholder="Select account"
                        style={{ minHeight: '38px', height: '38px' }}
                      />
                      <input className="form-input" type="number" step="0.01" value={line.debit} onChange={e => updateJournalLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} placeholder="0.00" />
                      <input className="form-input" type="number" step="0.01" value={line.credit} onChange={e => updateJournalLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} placeholder="0.00" />
                      <input className="form-input" value={line.description} onChange={e => updateJournalLine(index, { description: e.target.value })} placeholder="Line note" />
                      <button type="button" className="line-remove" onClick={() => removeJournalLine(index)}>×</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="rpt-modal-btn rpt-modal-btn-outline" style={{ marginTop: '10px', width: 'fit-content' }} onClick={addJournalLine}>+ Add Row</button>
                <div className={`journal-total ${Math.abs(journalTotals.debit - journalTotals.credit) < 0.001 && journalTotals.debit > 0 ? 'balanced' : ''}`} style={{ margin: '10px 0 0' }}>
                  Money In: ₹{money(journalTotals.debit)} &nbsp;/&nbsp; Money Out: ₹{money(journalTotals.credit)}
                  &nbsp;{Math.abs(journalTotals.debit - journalTotals.credit) < 0.001 && journalTotals.debit > 0 ? '✓ Balanced' : '⚠ Must match'}
                </div>
              </div>
              <div className="rpt-modal-actions">
                <button type="button" onClick={() => setShowAddEntryModal(false)} className="rpt-modal-btn rpt-modal-btn-outline" disabled={postingJournal}>
                  Cancel
                </button>
                <button type="submit" className="rpt-modal-btn rpt-modal-btn-primary" disabled={postingJournal || accounts.length === 0}>
                  {postingJournal ? 'Saving...' : 'Post Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .accounting-page { padding: 24px 40px; min-height: calc(100vh - 80px); background: #f8fafc; color: #0f172a; }
        .top-period-toolbar {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          margin-bottom: 20px;
          background: #fff;
          padding: 10px 16px !important;
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
          width: 100%;
          flex-wrap: nowrap;
          box-sizing: border-box;
        }
        
        :global(.custom-tooltip-wrapper) {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 6px;
          z-index: 30;
        }
        :global(.custom-tooltip-icon) {
          color: #94a3b8;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        :global(.custom-tooltip-icon:hover),
        :global(.custom-tooltip-icon.active) {
          color: #f97316;
          transform: scale(1.15);
        }
        :global(.custom-tooltip-box) {
          position: absolute;
          bottom: 135%;
          left: 50%;
          transform: translateX(-50%);
          width: 220px;
          background: #ea580c;
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 11.5px;
          font-weight: 600;
          line-height: 1.45;
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3), 0 4px 6px rgba(0, 0, 0, 0.05);
          z-index: 1000;
          white-space: normal;
          text-align: left;
          text-transform: none;
          animation: tooltip-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        :global(.custom-tooltip-arrow) {
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid #ea580c;
        }
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .rpt-modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 12px;
          animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .rpt-modal {
          background: white;
          padding: 24px;
          border-radius: 16px;
          width: 100%;
          box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.15);
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          display: grid;
          gap: 16px;
        }
        .rpt-modal-wide {
          max-width: 800px !important;
        }
        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .modal-title {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.01em;
          border-bottom: 1.5px solid #f1f5f9;
          padding-bottom: 10px;
        }
        .modal-form {
          display: grid;
          gap: 14px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .rpt-modal label {
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: .5px;
        }
        .rpt-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
          border-top: 1px solid #f1f5f9;
          padding-top: 16px;
        }
        .rpt-modal-btn {
          height: 38px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          padding: 0 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .rpt-modal-btn-outline {
          background: #fff;
          border: 1.5px solid #e2e8f0;
          color: #64748b;
        }
        .rpt-modal-btn-outline:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .rpt-modal-btn-primary {
          background: #f97316;
          color: #fff;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
        }
        .rpt-modal-btn-primary:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.35);
          background: #ea580c;
        }
        .rpt-modal-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .form-input {
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          padding: 11px 14px;
          color: #1e293b;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.15s ease;
          background: #f8fafc;
        }
        .form-input:focus {
          outline: none;
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
          background: #ffffff;
        }

        .top-period-toolbar :global(.premium-dt-picker) {
          width: 230px !important;
          flex-shrink: 0;
        }
        .period-sep {
          font-size: 16px;
          color: #94a3b8;
          font-weight: 700;
          user-select: none;
        }
        .period-ctrl-sep {
          width: 1px;
          height: 24px;
          background: #e2e8f0;
          margin: 0 4px;
        }
        .period-select-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
        }
        .select-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }
        .period-caption { margin: 0 0 16px 4px; color: #64748b; font-size: 12px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .summary-tile {
          position: relative;
          z-index: 1;
          background: #fff;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          display: grid;
          grid-template-areas: "label icon" "value icon";
          grid-template-columns: 1fr auto;
          grid-template-rows: auto auto;
          align-items: center;
          gap: 6px 12px;
          transition: transform 0.2s, box-shadow 0.2s, z-index 0.2s;
          min-height: 90px;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .summary-tile:hover,
        .summary-tile:focus-within,
        .summary-tile:has(.custom-tooltip-icon.active) {
          z-index: 25;
        }
        .summary-tile:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.03); }
        .summary-tile span { grid-area: label; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px; }
        .summary-tile strong { grid-area: value; font-size: 20px; font-weight: 800; color: #1e293b; line-height: 1.1; word-break: break-word; }
        .summary-tile-icon { grid-area: icon; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .workspace { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: visible; }
        .workspace-header { padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eef2f7; gap: 12px; }
        .page-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 900; }
        .title-block p { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 600; }
        .icon-button { width: 40px; height: 40px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .icon-button:hover { color: #f97316; border-color: #fed7aa; background: #fff7ed; }
        .tbl-actions { display: flex; align-items: center; gap: 6px; }
        .tbl-btn { width: 30px; height: 30px; border-radius: 7px; border: 1px solid #e2e8f0; background: #f8fafc; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; transition: all 0.15s; }
        .tbl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tbl-btn-edit { color: #6366f1; border-color: #e0e7ff; background: #f5f3ff; }
        .tbl-btn-edit:hover { background: #e0e7ff; border-color: #a5b4fc; color: #4338ca; }
        .tbl-btn-deactivate { color: #f59e0b; border-color: #fde68a; background: #fffbeb; }
        .tbl-btn-deactivate:hover { background: #fef3c7; border-color: #f59e0b; color: #b45309; }
        .tbl-btn-activate { color: #10b981; border-color: #a7f3d0; background: #ecfdf5; }
        .tbl-btn-activate:hover { background: #d1fae5; border-color: #10b981; color: #047857; }
        .tbl-btn-void { color: #ef4444; border-color: #fecaca; background: #fef2f2; }
        .tbl-btn-void:hover { background: #fee2e2; border-color: #ef4444; color: #b91c1c; }
        .tab-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #eef2f7; background: #f8fafc; }
        .tab-row button { border: 1px solid transparent; background: transparent; color: #64748b; border-radius: 8px; padding: 9px 12px; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .tab-row button.active { background: #fff; color: #f97316; border-color: #fed7aa; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
        .period-toolbar { display: flex; align-items: end; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #eef2f7; background: #fff; flex-wrap: wrap; position: relative; z-index: 20; }
        .period-toolbar label { min-width: 220px; }
        .period-toolbar label.small-control { min-width: 160px; }
        .period-toolbar .primary-button, .period-toolbar .secondary-button { min-width: 96px; }
        .posting-error-panel { margin: 12px 16px 0; border: 1px solid #fecaca; background: #fef2f2; color: #7f1d1d; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .posting-error-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .posting-error-heading strong { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 900; }
        .posting-error-heading span { font-size: 11px; font-weight: 900; color: #991b1b; }
        .posting-error-list { display: flex; flex-direction: column; gap: 8px; }
        .posting-error-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid #fecaca; background: #fff; border-radius: 8px; padding: 10px; }
        .posting-error-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .posting-source { color: #991b1b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .posting-message { color: #7f1d1d; font-size: 12px; font-weight: 800; line-height: 1.35; overflow-wrap: anywhere; }
        .posting-error-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; color: #991b1b; font-size: 11px; font-weight: 900; }
        .posting-retry-button { min-height: 30px; border: 1px solid #fecaca; border-radius: 8px; background: #fff; color: #991b1b; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; font-size: 11px; font-weight: 900; cursor: pointer; }
        .posting-retry-button:hover { background: #fee2e2; }
        .posting-retry-button:disabled { opacity: .6; cursor: not-allowed; }
        .load-banner { margin: 12px 16px 0; padding: 10px 12px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 8px; font-size: 12px; font-weight: 800; }
        .load-error-banner { margin: 12px 16px 0; padding: 10px 12px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 8px; font-size: 12px; font-weight: 800; }
        .recon-warning { margin: 12px 16px 0; padding: 10px 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 8px; font-size: 12px; font-weight: 800; }
        .recon-warning.compact { margin: 0; }
        .recon-summary { margin: 12px 16px 0; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
        .recon-copy { display: flex; flex-direction: column; gap: 4px; }
        .recon-copy strong { color: #0f172a; font-size: 14px; font-weight: 900; }
        .recon-copy span { color: #64748b; font-size: 12px; font-weight: 700; line-height: 1.45; }
        .recon-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .recon-grid > div { border: 1px solid #eef2f7; background: #f8fafc; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 5px; }
        .recon-grid > div.warn { border-color: #fed7aa; background: #fff7ed; }
        .recon-grid span { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 900; letter-spacing: .3px; }
        .recon-grid strong { color: #0f172a; font-size: 16px; font-weight: 900; }
        .recon-grid .warn strong { color: #c2410c; }
        .split-layout { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 16px; padding: 16px; }
        .panel { padding: 16px; background: #fff; }
        .split-layout .panel { border: 1px solid #eef2f7; border-radius: 8px; }
        .panel h3 { margin: 0 0 14px; font-size: 15px; font-weight: 900; }
        .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; }
        input:not(.form-input):not([type="checkbox"]), select:not(.form-input) { min-height: 38px; border: 1px solid #dbe3ef; border-radius: 8px; padding: 8px 10px; color: #0f172a; font-size: 13px; font-weight: 600; background: #fff; outline: none; }
        input:not(.form-input):not([type="checkbox"]):focus, select:not(.form-input):focus { border-color: #fb923c; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .flag-row { display: flex; gap: 14px; margin: 14px 0; flex-wrap: wrap; }
        .flag-row label { flex-direction: row; align-items: center; text-transform: none; font-size: 12px; }
        .flag-row input { min-height: auto; }
        .primary-button, .secondary-button { border: none; border-radius: 8px; min-height: 38px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 900; cursor: pointer; }
        .primary-button { background: #f97316; color: #fff; }
        .primary-button:disabled { opacity: .6; cursor: not-allowed; }
        .secondary-button { background: #eef6ff; color: #0369a1; }
        .workspace-header-actions { display: flex; gap: 8px; align-items: center; }
        .workspace-header-actions .primary-button { height: 38px; min-height: 38px; font-size: 12.5px; }
        .workspace-header-actions .btn-danger-outline {
          height: 38px;
          min-height: 38px;
          border: 1.5px solid #fca5a5;
          background: #fff;
          color: #dc2626;
          border-radius: 8px;
          padding: 0 14px;
          font-size: 12.5px;
          font-weight: 900;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .workspace-header-actions .btn-danger-outline:hover {
          background: #fff5f5;
          border-color: #ef4444;
          color: #b91c1c;
        }
        .workspace-header-actions .btn-danger-outline:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .workspace-header-actions .icon-button {
          width: 38px;
          height: 38px;
          min-height: 38px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .workspace-header-actions .icon-button:hover {
          color: #f97316;
          border-color: #fed7aa;
          background: #fff7ed;
        }
        .panel-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .panel-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
        .panel-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .section-helper { margin: -6px 0 12px; color: #64748b; font-size: 12px; font-weight: 700; line-height: 1.45; }
        .panel-toolbar .section-helper { margin: 4px 0 0; }
        .inline-warning { margin: -4px 0 12px; padding: 10px 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 8px; font-size: 12px; font-weight: 800; }
        .search-field { width: min(320px, 100%); height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #dbe3ef; border-radius: 8px; color: #94a3b8; }
        .search-field input { min-height: auto; border: 0; box-shadow: none; padding: 0; flex: 1; }
        .rpt-tbl-wrap{background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:auto;box-shadow:0 1px 3px rgba(0,0,0,.02)}
        .rpt-tbl{width:100%;border-collapse:collapse;min-width:920px}
        .rpt-tbl th{background:#fff;padding:12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #FF7A00}
        .rpt-tbl td{padding:12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;vertical-align:middle;white-space:nowrap}
        .rpt-tbl tr:last-child td{border-bottom:none}
        .rpt-tbl tbody tr{cursor:default;transition:background .15s}
        .rpt-tbl tbody tr:hover td{background:#fffbf5}
        .rpt-tbl .r{text-align:right}
        .rpt-tbl .amount{text-align:right}
        .rpt-tbl th.amount{text-align:right;font-weight:600;color:#64748b}
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 800; color: #0f172a; }
        .amount { text-align: right; font-weight: 800; color: #0f172a; }
        .status { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 900; }
        .status.active { background: #ecfdf5; color: #047857; }
        .status.inactive { background: #fef2f2; color: #b91c1c; }
        .type-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .empty-cell { text-align: center; color: #94a3b8; padding: 36px 16px; }
        .journal-meta { grid-template-columns: 240px 1fr; margin-bottom: 14px; }
        .journal-lines { border: 1px solid #eef2f7; border-radius: 8px; overflow: hidden; }
        .journal-head, .journal-line { display: grid; grid-template-columns: minmax(220px, 1.6fr) minmax(110px, .7fr) minmax(110px, .7fr) minmax(160px, 1fr) 36px; gap: 8px; align-items: center; padding: 8px; }
        .journal-head { background: #f8fafc; color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .journal-line { border-top: 1px solid #eef2f7; }
        .line-remove { width: 30px; height: 30px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; color: #94a3b8; cursor: pointer; }
        .journal-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
        .journal-total { color: #b91c1c; font-size: 13px; font-weight: 900; margin-right: auto; }
        .journal-total.balanced { color: #047857; }
        .loading-state { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #0f172a; font-weight: 800; }
        .loading-error-state { flex-direction: column; gap: 12px; padding: 24px; text-align: center; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 980px) {
          .accounting-page { padding: 12px; }
          .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .split-layout { grid-template-columns: 1fr; }
          .journal-head { display: none; }
          .journal-line { grid-template-columns: 1fr; }
          .journal-meta, .form-grid { grid-template-columns: 1fr; }
          .panel-toolbar { align-items: stretch; flex-direction: column; }
          .panel-filter-bar { flex-direction: column; align-items: stretch; gap: 12px; }
          .panel-filters { flex-direction: column; align-items: stretch; gap: 8px; }
          .panel-filters :global(.nice-select) { width: 100% !important; }
          .panel-filter-bar .search-field { width: 100% !important; }
          .recon-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .posting-error-row { grid-template-columns: 1fr; }
          .posting-error-meta { justify-content: flex-start; }
          .period-toolbar { align-items: stretch; }
          .period-toolbar label, .period-toolbar .primary-button, .period-toolbar .secondary-button { width: 100%; min-width: 0; }
          .top-period-toolbar { flex-direction: column; align-items: stretch !important; gap: 10px !important; }
          .top-period-toolbar :global(.premium-dt-picker) { width: 100% !important; }
          .period-ctrl-sep { display: none; }
          .period-select-wrapper { width: 100%; justify-content: space-between; }
          .period-select-wrapper :global(.nice-select) { flex: 1; }
        }
        @media (max-width: 560px) {
          .summary-grid { grid-template-columns: 1fr; }
          .recon-grid { grid-template-columns: 1fr; }
          .workspace-header { align-items: flex-start; flex-direction: column; gap: 12px; }
          .workspace-header > div:last-child { width: 100%; flex-wrap: wrap; }
        }
      `}</style>
    </DashboardLayout>
  );
}
