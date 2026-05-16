import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaWallet, FaBook, FaChartPie, FaExchangeAlt, FaPlus, FaRedo, FaSearch, FaArrowDown, FaArrowUp, FaSync } from 'react-icons/fa';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import { useNotification } from '../../context/NotificationContext';
import api from '../../utils/api';

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

function defaultAccountingPeriod() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  from.setMinutes(from.getMinutes() - from.getTimezoneOffset());
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return {
    from: from.toISOString().slice(0, 16),
    to: now.toISOString().slice(0, 16)
  };
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

export default function AccountingPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
      <AccountingContent />
    </RoleGate>
  );
}

function AccountingContent() {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [postingJournal, setPostingJournal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState(defaultAccountingPeriod);
  const [appliedPeriod, setAppliedPeriod] = useState(defaultAccountingPeriod);
  const [sortBy, setSortBy] = useState('entryDate');
  const [sortDir, setSortDir] = useState('DESC');
  const [accountForm, setAccountForm] = useState(blankAccount);
  const [journalForm, setJournalForm] = useState({
    entryDate: defaultJournalDate(),
    description: '',
    lines: [blankJournalLine(), blankJournalLine()]
  });

  const fetchAccountingData = useCallback(async (periodOverride = null) => {
    const effectivePeriod = periodOverride || appliedPeriod;
    setLoading(true);
    try {
      const periodParams = { from: effectivePeriod.from, to: effectivePeriod.to };
      const journalParams = { ...periodParams, sortBy, sortDir };
      const [accountResp, summaryResp, reconciliationResp, journalResp, trialResp] = await Promise.allSettled([
        api.get('/api/v1/accounting/accounts', { params: periodParams }),
        api.get('/api/v1/accounting/summary', { params: periodParams }),
        api.get('/api/v1/accounting/reconciliation', { params: periodParams }),
        api.get('/api/v1/accounting/journals', { params: journalParams }),
        api.get('/api/v1/accounting/trial-balance', { params: periodParams })
      ]);
      if (accountResp.status === 'fulfilled' && accountResp.value.data.success) setAccounts(accountResp.value.data.data || []);
      if (summaryResp.status === 'fulfilled' && summaryResp.value.data.success) setSummary(summaryResp.value.data.data || null);
      if (reconciliationResp.status === 'fulfilled' && reconciliationResp.value.data.success) setReconciliation(reconciliationResp.value.data.data || null);
      if (journalResp.status === 'fulfilled' && journalResp.value.data.success) setJournals(journalResp.value.data.data || []);
      if (trialResp.status === 'fulfilled' && trialResp.value.data.success) setTrialBalance(trialResp.value.data.data || []);

      const failed = [accountResp, summaryResp, reconciliationResp, journalResp, trialResp].find(result => result.status === 'rejected');
      if (failed) {
        notify('error', failed.reason?.response?.data?.message || 'Some accounting data could not be loaded');
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to load accounting data');
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod, notify, sortBy, sortDir]);

  const handleSyncPastData = async () => {
    setSyncing(true);
    try {
      const resp = await api.post('/api/v1/accounting/backfill', {
        from: appliedPeriod.from,
        to: appliedPeriod.to,
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

  useEffect(() => {
    fetchAccountingData();
  }, [fetchAccountingData]);

  const filteredAccounts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter(account => {
      return (
        account.code?.toLowerCase().includes(term) ||
        account.name?.toLowerCase().includes(term) ||
        account.accountType?.toLowerCase().includes(term) ||
        account.accountSubType?.toLowerCase().includes(term)
      );
    });
  }, [accounts, searchTerm]);

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
        const d = resp.data.data;
        notify('success', `Done: ${d.posted || 0} posted, ${d.skipped || 0} skipped, ${d.failed || 0} failed.`);
        await fetchAccountingData();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Fix failed. Please try again.');
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
    setAppliedPeriod({ ...period });
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
        setJournalForm({ entryDate: defaultJournalDate(), description: '', lines: [blankJournalLine(), blankJournalLine()] });
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

  return (
    <DashboardLayout title="Money Book" showBack={true}>
      <div className="accounting-page">
        <section className="summary-grid">
          <div className="summary-tile" style={{borderLeft:'4px solid #10b981'}}>
            <span>💰 Gross Sales</span>
            <strong>₹{money(summaryValue('grossSales'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #6366f1'}}>
            <span>🏷️ Discounts</span>
            <strong>₹{money(summaryValue('discounts'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #3b82f6'}}>
            <span>📈 Net Sales</span>
            <strong style={{color:'#3b82f6'}}>₹{money(summaryValue('netSales'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #ef4444'}}>
            <span>🧾 Billed Total</span>
            <strong>₹{money(summaryValue('billedTotal'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #06b6d4'}}>
            <span>💳 Payment Collected</span>
            <strong>₹{money(summaryValue('paymentCollected'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #f97316'}}>
            <span>🧮 Output Tax</span>
            <strong>₹{money(summaryValue('outputTax'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:'4px solid #ef4444'}}>
            <span>📉 Expenses + COGS</span>
            <strong style={{color:'#ef4444'}}>₹{money(summaryValue('expenses') + summaryValue('cogsPurchases'))}</strong>
          </div>
          <div className="summary-tile" style={{borderLeft:`4px solid ${summaryValue('profit') >= 0 ? '#10b981' : '#ef4444'}`}}>
            <span>✅ Profit</span>
            <strong style={{color: summaryValue('profit') >= 0 ? '#10b981' : '#ef4444'}}>₹{money(summaryValue('profit'))}</strong>
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

          <div className="period-toolbar">
            <label>
              From
              <input
                type="datetime-local"
                value={period.from}
                onChange={e => setPeriod(current => ({ ...current, from: e.target.value }))}
              />
            </label>
            <label>
              To
              <input
                type="datetime-local"
                value={period.to}
                onChange={e => setPeriod(current => ({ ...current, to: e.target.value }))}
              />
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

          {reconciliation?.outOfSync && (
            <div className="recon-warning">
              {reconciliation.warnings?.join(' ')} Use Sync Selected Period if these are expected old records.
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
                  <h3>Your Money Accounts</h3>
                  <div className="search-field"><FaSearch /><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." /></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Account Name</th><th>Type</th><th className="amount">Opening</th><th className="amount">In</th><th className="amount">Out</th><th className="amount">Closing</th><th>Status</th></tr></thead>
                    <tbody>
                      {filteredAccounts.map(account => (
                        <tr key={account.id}>
                          <td className="mono">{account.code}</td>
                          <td>{account.name}</td>
                          <td><span style={{color: TYPE_COLORS[account.accountType] || '#64748b', fontWeight:800, fontSize:'11px'}}>{TYPE_LABELS[account.accountType] || account.accountType}</span></td>
                          <td className="amount">₹{money(account.periodOpening)}</td>
                          <td className="amount" style={{color:'#10b981'}}>₹{money(account.periodDebit)}</td>
                          <td className="amount" style={{color:'#ef4444'}}>₹{money(account.periodCredit)}</td>
                          <td className="amount">₹{money(account.periodClosing)}</td>
                          <td><span className={`status ${account.isActive === 'Y' ? 'active' : 'inactive'}`}>{account.isActive === 'Y' ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      ))}
                      {filteredAccounts.length === 0 && (
                        <tr><td colSpan={8} className="empty-cell">No accounts found.</td></tr>
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
              <h3>📋 Recent Transactions</h3>
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
                      <tr><td colSpan={8} className="empty-cell">No transactions in the selected range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'trial' && (
            <div className="panel table-panel">
              <h3>📊 Balance Summary</h3>
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
        .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
        .summary-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .summary-tile span { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; }
        .summary-tile strong { font-size: 22px; font-weight: 900; color: #0f172a; }
        .workspace { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .workspace-header { padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eef2f7; }
        .page-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 900; }
        .title-block p { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 600; }
        .icon-button { width: 40px; height: 40px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .icon-button:hover { color: #f97316; border-color: #fed7aa; background: #fff7ed; }
        .tab-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #eef2f7; background: #f8fafc; }
        .tab-row button { border: 1px solid transparent; background: transparent; color: #64748b; border-radius: 8px; padding: 9px 12px; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .tab-row button.active { background: #fff; color: #f97316; border-color: #fed7aa; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
        .period-toolbar { display: flex; align-items: end; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #eef2f7; background: #fff; flex-wrap: wrap; }
        .period-toolbar label { min-width: 220px; }
        .period-toolbar label.small-control { min-width: 160px; }
        .period-toolbar .primary-button, .period-toolbar .secondary-button { min-width: 96px; }
        .recon-warning { margin: 12px 16px 0; padding: 10px 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 8px; font-size: 12px; font-weight: 800; }
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
        .search-field { width: min(320px, 100%); height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #dbe3ef; border-radius: 8px; color: #94a3b8; }
        .search-field input { min-height: auto; border: 0; box-shadow: none; padding: 0; flex: 1; }
        .table-wrap { overflow-x: auto; border: 1px solid #eef2f7; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; min-width: 720px; }
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
          .period-toolbar { align-items: stretch; }
          .period-toolbar label, .period-toolbar .primary-button, .period-toolbar .secondary-button { width: 100%; min-width: 0; }
        }
        @media (max-width: 560px) {
          .summary-grid { grid-template-columns: 1fr; }
          .workspace-header { align-items: flex-start; gap: 12px; }
        }
      `}</style>
    </DashboardLayout>
  );
}
