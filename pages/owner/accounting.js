import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaWallet, FaBook, FaChartPie, FaExchangeAlt, FaPlus, FaRedo, FaSearch, FaArrowDown, FaArrowUp, FaSync, FaExclamationTriangle } from 'react-icons/fa';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import RoleGate from '../../components/RoleGate';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import api from '../../utils/api';
import { getBusinessNow } from '../../utils/timezoneUtils';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const TYPE_LABELS = { ASSET: '💰 What You Own', LIABILITY: '📋 What You Owe', EQUITY: '🏦 Business Capital', INCOME: '📈 Money Coming In', EXPENSE: '📉 Money Going Out' };
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

export default function AccountingPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
      <AccountingContent />
    </RoleGate>
  );
}

function AccountingContent() {
  const { timezone, userRole } = useAuth();
  const { notify } = useNotification();
  const canManagePostingErrors = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [postingErrors, setPostingErrors] = useState([]);
  const [retryingPostingId, setRetryingPostingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [postingJournal, setPostingJournal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState(() => defaultAccountingPeriod(timezone));
  const [appliedPeriod, setAppliedPeriod] = useState(() => defaultAccountingPeriod(timezone));
  const [sortBy, setSortBy] = useState('entryDate');
  const [sortDir, setSortDir] = useState('DESC');
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
    const effectivePeriod = periodOverride || appliedPeriod;
    setLoading(true);
    try {
      const periodParams = { from: toInstant(effectivePeriod.from), to: toInstant(effectivePeriod.to) };
      const journalParams = { ...periodParams, sortBy, sortDir };
      const requests = [
        api.get('/api/v1/accounting/accounts', { params: periodParams }),
        api.get('/api/v1/accounting/summary', { params: periodParams }),
        api.get('/api/v1/accounting/reconciliation', { params: periodParams }),
        api.get('/api/v1/accounting/journals', { params: journalParams }),
        api.get('/api/v1/accounting/trial-balance', { params: periodParams })
      ];
      if (canManagePostingErrors) {
        requests.push(api.get('/api/v1/accounting/posting-errors'));
      } else {
        setPostingErrors([]);
      }

      const [accountResp, summaryResp, reconciliationResp, journalResp, trialResp, postingErrorResp] = await Promise.allSettled(requests);
      if (accountResp.status === 'fulfilled' && accountResp.value.data.success) setAccounts(accountResp.value.data.data || []);
      if (summaryResp.status === 'fulfilled' && summaryResp.value.data.success) setSummary(summaryResp.value.data.data || null);
      if (reconciliationResp.status === 'fulfilled' && reconciliationResp.value.data.success) setReconciliation(reconciliationResp.value.data.data || null);
      if (journalResp.status === 'fulfilled' && journalResp.value.data.success) setJournals(journalResp.value.data.data || []);
      if (trialResp.status === 'fulfilled' && trialResp.value.data.success) setTrialBalance(trialResp.value.data.data || []);
      if (canManagePostingErrors && postingErrorResp?.status === 'fulfilled' && postingErrorResp.value.data.success) {
        setPostingErrors(postingErrorResp.value.data.data || []);
      } else if (canManagePostingErrors && postingErrorResp?.status === 'rejected') {
        setPostingErrors([]);
        notify('warning', postingErrorResp.reason?.response?.data?.message || 'Posting failure details could not be loaded');
      }

      const failed = [accountResp, summaryResp, reconciliationResp, journalResp, trialResp].find(result => result.status === 'rejected');
      if (failed) {
        notify('error', failed.reason?.response?.data?.message || 'Some accounting data could not be loaded');
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to load accounting data');
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod, canManagePostingErrors, notify, sortBy, sortDir]);

  const handleSyncPastData = async () => {
    setSyncing(true);
    try {
      const resp = await api.post('/api/v1/accounting/backfill', {
        from: toInstant(appliedPeriod.from),
        to: toInstant(appliedPeriod.to),
        sourceTypes: ['INVOICE', 'PAYMENT', 'COGS', 'STOCK', 'EXPENSE', 'PURCHASE'],
        dryRun: false
      });
      if (resp.data.success) {
        const d = resp.data.data;
        notify('success', `Sync complete: ${d.posted || 0} posted, ${d.skipped || 0} skipped, ${d.failed || 0} failed.`);
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
      const resp = await api.post(`/api/v1/accounting/posting-errors/${jobId}/retry`);
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
    const direction = sortDir === 'ASC' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'totalDebit') {
        const amountDiff = Math.abs(numberValue(a.periodNet)) - Math.abs(numberValue(b.periodNet));
        if (amountDiff !== 0) return amountDiff * direction;
      }
      const codeCompare = String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true, sensitivity: 'base' });
      if (codeCompare !== 0) return codeCompare * direction;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) * direction;
    });
  }, [accounts, searchTerm, sortBy, sortDir]);

  const sortedJournals = useMemo(() => {
    return journals;
  }, [journals]);

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
    return `Showing accounting data from ${formatPeriodValue(appliedPeriod.from)} to ${formatPeriodValue(appliedPeriod.to)}`;
  }, [appliedPeriod]);

  const journalOutsideSelectedPeriod = useMemo(() => {
    return journalForm.entryDate && !isWithinPeriod(journalForm.entryDate, appliedPeriod);
  }, [journalForm.entryDate, appliedPeriod]);

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
      return { type: source.includes('VENDOR') || source.includes('EXPENSE') ? 'Bill / Expense' : 'Sale Invoice', documentNo, received: 0, paid: 0, adjustment: amount };
    }
    if (source.includes('COGS') || source.includes('STOCK')) {
      return { type: 'Inventory', documentNo, received: 0, paid: 0, adjustment: amount };
    }
    if (source.includes('REV')) {
      return { type: 'Reversal', documentNo, received: 0, paid: 0, adjustment: amount };
    }
    return { type: 'Journal', documentNo, received: 0, paid: 0, adjustment: amount };
  }, []);

  const handleCreateAccount = async event => {
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
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to create account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleResyncAll = async () => {
    if (!window.confirm('This safely rebuilds auto-posted accounting entries only. Manual journals will be preserved.\n\nContinue?')) return;
    setSyncing(true);
    try {
      const resp = await api.post('/api/v1/accounting/resync-all');
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
  };

  const handleApplyPeriod = () => {
    const fromDate = new Date(period.from);
    const toDate = new Date(period.to);
    if (!period.from || !period.to || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      notify('error', 'Select both from and to dates');
      return;
    }
    if (fromDate > toDate) {
      notify('error', 'From date must be before to date');
      return;
    }
    const days = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 366) {
      notify('error', 'Accounting date range cannot exceed 366 days');
      return;
    }
    const nextPeriod = { ...period };
    setAppliedPeriod(nextPeriod);
    setJournalForm(current => ({
      ...current,
      entryDate: current.entryDate && isWithinPeriod(current.entryDate, nextPeriod)
        ? current.entryDate
        : suggestedJournalDateForPeriod(nextPeriod)
    }));
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

  const handlePostJournal = async event => {
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
        setJournalForm({ entryDate: suggestedJournalDateForPeriod(appliedPeriod), description: '', lines: [blankJournalLine(), blankJournalLine()] });
        await fetchAccountingData();
        setActiveTab('journals');
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to post journal');
    } finally {
      setPostingJournal(false);
    }
  };

  if (loading) {
    return <div className="loading-state"><span>Loading accounting...</span></div>;
  }

  const otherActivePayments = numberValue(reconciliation?.otherActivePaymentsTotal);
  const unmatchedPaymentCount = numberValue(reconciliation?.unmatchedPaymentCount);

  return (
    <DashboardLayout title="Money Book" showBack={true}>
      <div className="accounting-page">
        <div className="period-toolbar top-period-toolbar">
          <label>
            From
            <PremiumDateTimePicker value={period.from} onChange={value => setPeriod(current => ({ ...current, from: value }))} />
          </label>
          <label>
            To
            <PremiumDateTimePicker value={period.to} onChange={value => setPeriod(current => ({ ...current, to: value }))} />
          </label>
          <label className="small-control">
            Sort by
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="entryDate">Date</option>
              <option value="entryNo">Entry #</option>
              <option value="totalDebit">Amount</option>
              <option value="createdAt">Created</option>
            </select>
          </label>
          <label className="small-control">
            Direction
            <select value={sortDir} onChange={e => setSortDir(e.target.value)}>
              <option value="DESC">Newest / High first</option>
              <option value="ASC">Oldest / Low first</option>
            </select>
          </label>
          <button type="button" className="primary-button" onClick={handleApplyPeriod}>Apply</button>
          <button type="button" className="secondary-button" onClick={() => fetchAccountingData()}><FaRedo /> Refresh</button>
        </div>

        <div className="period-caption">{periodLabel}</div>

        <section className="summary-grid">
          <div className="summary-tile" style={{borderLeft:'4px solid #10b981'}}>
            <span>💰 Gross Sales</span>
            <strong>₹{money(summaryValue('grossSales'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #6366f1'}}>
            <span>🏷️ Discounts</span>
            <strong>₹{money(summaryValue('discounts'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #3b82f6'}}>
            <span>📈 Net Sales</span>
            <strong style={{color:'#3b82f6'}}>₹{money(summaryValue('netSales'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #ef4444'}}>
            <span>🧾 Billed Total</span>
            <strong>₹{money(summaryValue('billedTotal'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #06b6d4'}}>
            <span>💳 Payment Collected</span>
            <strong>₹{money(summaryValue('paymentCollected'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #f97316'}}>
            <span>🧮 Output Tax</span>
            <strong>₹{money(summaryValue('outputTax'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #ef4444'}}>
            <span>📉 Expenses + COGS</span>
            <strong style={{color:'#ef4444'}}>₹{money(summaryValue('expenses') + summaryValue('cogsPurchases'))}</strong>
            <small>For selected period</small>
          </div>
          <div className="summary-tile" style={{borderLeft:`4px solid ${summaryValue('profit') >= 0 ? '#10b981' : '#ef4444'}`}}>
            <span>✅ Profit</span>
            <strong style={{color: summaryValue('profit') >= 0 ? '#10b981' : '#ef4444'}}>₹{money(summaryValue('profit'))}</strong>
            <small>For selected period</small>
          </div>
        </section>

        <section className="workspace">
          <header className="workspace-header">
            <div className="title-block">
              <div className="page-title"><FaWallet /> Money Book</div>
              <p>Track all your money — accounts, transactions, and balances in one place.</p>
            </div>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              <button className="primary-button" onClick={handleSyncPastData} disabled={syncing} title="Sync all past sales, expenses & payments into accounting">
                <FaSync style={syncing ? {animation:'spin 1s linear infinite'} : {}} /> {syncing ? 'Syncing...' : 'Sync Selected Period'}
              </button>
              <button className="secondary-button" onClick={handleResyncAll} disabled={syncing} title="Rebuild only auto-posted accounting entries. Manual journals stay untouched." style={{fontSize:'10px',padding:'6px 10px',borderColor:'#ef4444',color:'#ef4444'}}>
                Fix Auto Entries
              </button>
              <button className="icon-button" onClick={() => fetchAccountingData()} title="Refresh">
                <FaRedo />
              </button>
            </div>
          </header>

          <div className="tab-row">
            <button className={activeTab === 'accounts' ? 'active' : ''} onClick={() => setActiveTab('accounts')}><FaBook /> Money Accounts</button>
            <button className={activeTab === 'post' ? 'active' : ''} onClick={() => setActiveTab('post')}><FaPlus /> Add Entry</button>
            <button className={activeTab === 'journals' ? 'active' : ''} onClick={() => setActiveTab('journals')}><FaExchangeAlt /> Transaction History</button>
            <button className={activeTab === 'trial' ? 'active' : ''} onClick={() => setActiveTab('trial')}><FaChartPie /> Balance Summary</button>
          </div>

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

          {reconciliation?.outOfSync && (
            <div className="recon-warning">
              {reconciliation.warnings?.join(' ')} Use Sync Selected Period if these are expected old records.
            </div>
          )}

          {reconciliation && (
            <div className="recon-summary">
              <div className="recon-copy">
                <strong>Sales & Payment Reconciliation</strong>
                <span>Billed sales come from completed sales. Linked payments are attached to those sales. Other active payments explain any cash difference.</span>
              </div>
              <div className="recon-grid">
                <div><span>Billed Sales</span><strong>₹{money(reconciliation.billedSalesTotal)}</strong></div>
                <div><span>Linked Payments</span><strong>₹{money(reconciliation.linkedSalesPaymentsTotal)}</strong></div>
                <div className={otherActivePayments > 0 ? 'warn' : ''}><span>Other Active Payments</span><strong>₹{money(reconciliation.otherActivePaymentsTotal)}</strong></div>
                <div><span>Payment Collected</span><strong>₹{money(reconciliation.paymentCollectedTotal)}</strong></div>
              </div>
              {otherActivePayments > 0 && (
                <div className="recon-warning compact">
                  Other active payments: ₹{money(otherActivePayments)}
                  {unmatchedPaymentCount > 0 ? ` across ${unmatchedPaymentCount} payment(s)` : ''}. These are counted in cash/accounting but not linked to completed sales in this period.
                </div>
              )}
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="split-layout">
              <form className="panel" onSubmit={handleCreateAccount}>
                <h3>➕ Add New Account</h3>
                <div className="form-grid">
                  <label>
                    Account #
                    <input value={accountForm.code} onChange={e => setAccountForm({ ...accountForm, code: e.target.value.toUpperCase() })} placeholder="e.g. 1001" />
                  </label>
                  <label>
                    Account Name
                    <input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="e.g. Cash Register" />
                  </label>
                  <label>
                    Type
                    <select value={accountForm.accountType} onChange={e => setAccountForm({ ...accountForm, accountType: e.target.value })}>
                      {ACCOUNT_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type] || type}</option>)}
                    </select>
                  </label>
                  <label>
                    Category
                    <input value={accountForm.accountSubType} onChange={e => setAccountForm({ ...accountForm, accountSubType: e.target.value })} placeholder="e.g. Cash, Bank, Sales" />
                  </label>
                  <label>
                    Starting Amount (₹)
                    <input type="number" step="0.01" value={accountForm.openingBalance} onChange={e => setAccountForm({ ...accountForm, openingBalance: e.target.value, currentBalance: e.target.value })} placeholder="0.00" />
                  </label>
                  <label>
                    Current Amount (₹)
                    <input type="number" step="0.01" value={accountForm.currentBalance} onChange={e => setAccountForm({ ...accountForm, currentBalance: e.target.value })} placeholder="0.00" />
                  </label>
                </div>
                <div className="flag-row">
                  <label><input type="checkbox" checked={accountForm.cashAccount} onChange={e => setAccountForm({ ...accountForm, cashAccount: e.target.checked })} /> 💵 This is a cash register</label>
                  <label><input type="checkbox" checked={accountForm.bankAccount} onChange={e => setAccountForm({ ...accountForm, bankAccount: e.target.checked })} /> 🏦 This is a bank account</label>
                </div>
                <button className="primary-button" type="submit" disabled={savingAccount}>
                  <FaPlus /> {savingAccount ? 'Adding...' : '+ Add Account'}
                </button>
              </form>

              <div className="panel table-panel">
                <div className="panel-toolbar">
                  <div>
                    <h3>Your Money Accounts</h3>
                    <p className="section-helper">Before/After include previous posted entries. Money In/Out and Net Change are only for the selected period.</p>
                  </div>
                  <div className="search-field"><FaSearch /><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." /></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Account Name</th><th>Type</th><th className="amount">Before Period</th><th className="amount">Money In</th><th className="amount">Money Out</th><th className="amount">Net Change</th><th className="amount">After Period</th><th>Status</th></tr></thead>
                    <tbody>
                      {displayedAccounts.map(account => (
                        <tr key={account.id}>
                          <td className="mono">{account.code}</td>
                          <td>{account.name}</td>
                          <td><span style={{color: TYPE_COLORS[account.accountType] || '#64748b', fontWeight:800, fontSize:'11px'}}>{TYPE_LABELS[account.accountType] || account.accountType}</span></td>
                          <td className="amount">₹{money(account.periodOpening)}</td>
                          <td className="amount" style={{color:'#10b981'}}>₹{money(account.periodDebit)}</td>
                          <td className="amount" style={{color:'#ef4444'}}>₹{money(account.periodCredit)}</td>
                          <td className="amount" style={{color: numberValue(account.periodNet) >= 0 ? '#10b981' : '#ef4444'}}>₹{money(account.periodNet)}</td>
                          <td className="amount">₹{money(account.periodClosing)}</td>
                          <td><span className={`status ${account.isActive === 'Y' ? 'active' : 'inactive'}`}>{account.isActive === 'Y' ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      ))}
                      {displayedAccounts.length === 0 && (
                        <tr><td colSpan={9} className="empty-cell">No accounts found for this selected period.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'post' && (
            <form className="panel" onSubmit={handlePostJournal}>
              <h3>📝 Add a Money Entry</h3>
              <p className="section-helper">Manual entries posted here affect the selected period only if their entry date is inside this range.</p>
              <div className="form-grid journal-meta">
                <label>
                  When did this happen?
                  <input type="datetime-local" value={journalForm.entryDate} onChange={e => setJournalForm({ ...journalForm, entryDate: e.target.value })} />
                </label>
                <label>
                  What is this for?
                  <input value={journalForm.description} onChange={e => setJournalForm({ ...journalForm, description: e.target.value })} placeholder="e.g. Paid electricity bill" />
                </label>
              </div>
              {journalOutsideSelectedPeriod && (
                <div className="inline-warning">This entry date is outside the selected period, so it will not appear in the current period view after posting.</div>
              )}
              <div className="journal-lines">
                <div className="journal-head">
                  <span>Account</span><span>Money In (+)</span><span>Money Out (-)</span><span>Note</span><span></span>
                </div>
                {journalForm.lines.map((line, index) => (
                  <div className="journal-line" key={index}>
                    <select value={line.accountId} onChange={e => updateJournalLine(index, { accountId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <input type="number" step="0.01" value={line.debit} onChange={e => updateJournalLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} placeholder="0.00" />
                    <input type="number" step="0.01" value={line.credit} onChange={e => updateJournalLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} placeholder="0.00" />
                    <input value={line.description} onChange={e => updateJournalLine(index, { description: e.target.value })} placeholder="Line note" />
                    <button type="button" className="line-remove" onClick={() => removeJournalLine(index)}>x</button>
                  </div>
                ))}
              </div>
              <div className="journal-footer">
                <button type="button" className="secondary-button" onClick={addJournalLine}>+ Add Row</button>
                <div className={`journal-total ${Math.abs(journalTotals.debit - journalTotals.credit) < 0.001 && journalTotals.debit > 0 ? 'balanced' : ''}`}>
                  In: ₹{money(journalTotals.debit)} / Out: ₹{money(journalTotals.credit)} {Math.abs(journalTotals.debit - journalTotals.credit) < 0.001 && journalTotals.debit > 0 ? '✅ Balanced!' : '⚠️ Must match!'}
                </div>
                <button type="submit" className="primary-button" disabled={postingJournal || accounts.length === 0}>
                  {postingJournal ? 'Saving...' : '✅ Save Entry'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'journals' && (
            <div className="panel table-panel">
              <h3>📋 Transactions in Selected Period</h3>
              <p className="section-helper">Journal-backed transactions dated inside the selected From and To range.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Type</th><th>Document</th><th>Date</th><th>What For</th><th className="amount">Received</th><th className="amount">Paid</th><th className="amount">Adjustment</th><th>Status</th></tr></thead>
                  <tbody>
                    {sortedJournals.map(entry => {
                      const view = journalDisplay(entry);
                      return (
                        <tr key={entry.id}>
                          <td><span className="type-pill">{view.type}</span></td>
                          <td className="mono">{view.documentNo}</td>
                          <td>{entry.entryDate?.replace('T', ' ').slice(0, 16)}</td>
                          <td>{entry.description || '-'}</td>
                          <td className="amount" style={{color:'#10b981'}}>{view.received ? `₹${money(view.received)}` : '-'}</td>
                          <td className="amount" style={{color:'#ef4444'}}>{view.paid ? `₹${money(view.paid)}` : '-'}</td>
                          <td className="amount">{view.adjustment ? `₹${money(view.adjustment)}` : '-'}</td>
                          <td><span className="status active">{entry.status}</span></td>
                        </tr>
                      );
                    })}
                    {journals.length === 0 && (
                      <tr><td colSpan={8} className="empty-cell">No accounting transactions in this selected period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'trial' && (
            <div className="panel table-panel">
              <h3>📊 Account Movement in Selected Period</h3>
              <p className="section-helper">This is journal-backed and period-filtered. Money In and Money Out are debit and credit movement within the selected period.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Account</th><th>Type</th><th>Money In</th><th>Money Out</th><th>Net Amount</th></tr></thead>
                  <tbody>
                    {trialBalance.map(row => (
                      <tr key={row.accountId}>
                        <td className="mono">{row.code}</td>
                        <td>{row.name || accountById[row.accountId]?.name || '-'}</td>
                        <td><span style={{color: TYPE_COLORS[row.accountType] || '#64748b', fontWeight:800, fontSize:'11px'}}>{TYPE_LABELS[row.accountType] || row.accountType}</span></td>
                        <td className="amount" style={{color:'#10b981'}}>₹{money(row.debit)}</td>
                        <td className="amount" style={{color:'#ef4444'}}>₹{money(row.credit)}</td>
                        <td className="amount" style={{fontWeight:900}}>₹{money(row.balance)}</td>
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

      <style jsx>{`
        .accounting-page { padding: 24px 40px; min-height: calc(100vh - 80px); background: #f8fafc; color: #0f172a; }
        .top-period-toolbar { margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
        .period-caption { margin: 0 0 14px; color: #64748b; font-size: 12px; font-weight: 800; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
        .summary-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .summary-tile span { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; }
        .summary-tile strong { font-size: 22px; font-weight: 900; color: #0f172a; }
        .summary-tile small { color: #94a3b8; font-size: 11px; font-weight: 800; }
        .workspace { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: visible; }
        .workspace-header { padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eef2f7; gap: 12px; }
        .page-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 900; }
        .title-block p { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 600; }
        .icon-button { width: 40px; height: 40px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .icon-button:hover { color: #f97316; border-color: #fed7aa; background: #fff7ed; }
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
        input, select { min-height: 38px; border: 1px solid #dbe3ef; border-radius: 8px; padding: 8px 10px; color: #0f172a; font-size: 13px; font-weight: 600; background: #fff; outline: none; }
        input:focus, select:focus { border-color: #fb923c; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .flag-row { display: flex; gap: 14px; margin: 14px 0; flex-wrap: wrap; }
        .flag-row label { flex-direction: row; align-items: center; text-transform: none; font-size: 12px; }
        .flag-row input { min-height: auto; }
        .primary-button, .secondary-button { border: none; border-radius: 8px; min-height: 38px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 900; cursor: pointer; }
        .primary-button { background: #f97316; color: #fff; }
        .primary-button:disabled { opacity: .6; cursor: not-allowed; }
        .secondary-button { background: #eef6ff; color: #0369a1; }
        .panel-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
        .section-helper { margin: -6px 0 12px; color: #64748b; font-size: 12px; font-weight: 700; line-height: 1.45; }
        .panel-toolbar .section-helper { margin: 4px 0 0; }
        .inline-warning { margin: -4px 0 12px; padding: 10px 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 8px; font-size: 12px; font-weight: 800; }
        .search-field { width: min(320px, 100%); height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #dbe3ef; border-radius: 8px; color: #94a3b8; }
        .search-field input { min-height: auto; border: 0; box-shadow: none; padding: 0; flex: 1; }
        .table-wrap { overflow-x: auto; border: 1px solid #eef2f7; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; min-width: 920px; }
        th { text-align: left; padding: 12px; font-size: 11px; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
        td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        tr:last-child td { border-bottom: 0; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 800; color: #0f172a; }
        .amount { text-align: right; font-weight: 800; color: #0f172a; }
        .status { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 900; }
        .status.active { background: #ecfdf5; color: #047857; }
        .status.inactive { background: #fef2f2; color: #b91c1c; }
        .type-pill { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; background:#f1f5f9; color:#475569; font-size:11px; font-weight:900; white-space:nowrap; }
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
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 980px) {
          .accounting-page { padding: 12px; }
          .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .split-layout { grid-template-columns: 1fr; }
          .journal-head { display: none; }
          .journal-line { grid-template-columns: 1fr; }
          .journal-meta, .form-grid { grid-template-columns: 1fr; }
          .panel-toolbar { align-items: stretch; flex-direction: column; }
          .recon-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .posting-error-row { grid-template-columns: 1fr; }
          .posting-error-meta { justify-content: flex-start; }
          .period-toolbar { align-items: stretch; }
          .period-toolbar label, .period-toolbar .primary-button, .period-toolbar .secondary-button { width: 100%; min-width: 0; }
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
