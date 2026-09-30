import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { formatTzDate, businessTimeToUtc } from '../../utils/timezoneUtils';
import {
  FaChartBar, FaBoxes, FaCreditCard, FaReceipt,
  FaFileCsv, FaFileExcel, FaSearch, FaPlus, FaMoneyBillWave,
  FaChartLine, FaWallet, FaMobileAlt
} from 'react-icons/fa';

const EXPENSE_TABS = [
  { key: 'exp_summary', label: 'Expense Summary', icon: <FaChartBar /> },
  { key: 'exp_records', label: 'Expense Records', icon: <FaReceipt /> },
  { key: 'exp_categories', label: 'Category Spending', icon: <FaBoxes /> },
  { key: 'exp_payments', label: 'Payment Methods', icon: <FaCreditCard /> },
];

export default function ExpenseReportView({
  dateFrom,
  dateTo,
  selectedOrgId,
  isSuperAdmin,
  timezone,
  SYM = '₹'
}) {
  const router = useRouter();
  const { notify } = useNotification();
  const [subTab, setSubTab] = useState('exp_summary');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [expenseRecords, setExpenseRecords] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const toInstant = (dtLocal, isEnd = false) => {
    if (!dtLocal) return undefined;
    const val = isEnd && dtLocal.length === 16 ? `${dtLocal}:59` : dtLocal;
    try { return businessTimeToUtc(val, timezone); } catch { return undefined; }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const expParams = {
      fromDate: toInstant(dateFrom),
      toDate: toInstant(dateTo, true),
      from: toInstant(dateFrom),
      to: toInstant(dateTo, true),
      size: 5000,
      page: 0
    };
    if (selectedOrgId) {
      expParams.branchId = selectedOrgId;
      expParams.orgId = selectedOrgId;
      expParams.branch = selectedOrgId;
    }

    try {
      const [expRes, catRes] = await Promise.allSettled([
        api.get('/api/v1/expenses', { params: expParams }),
        api.get('/api/v1/expenses/categories')
      ]);

      if (expRes.status === 'fulfilled' && expRes.value.data?.success) {
        const content = expRes.value.data.data?.content || expRes.value.data.data || [];
        setExpenseRecords(Array.isArray(content) ? content : []);
      } else if (expRes.status === 'rejected') {
        throw expRes.reason;
      }

      if (catRes.status === 'fulfilled' && catRes.value.data?.success) {
        setExpenseCategories(catRes.value.data.data || []);
      }
    } catch (err) {
      console.error('Expense report load error:', err);
      const msg = err?.response?.data?.message || 'Failed to load expense report';
      setLoadError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedOrgId, timezone, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const exportCSV = (headers, rows, filename) => {
    if (!rows.length) return notify('error', 'No data to export');
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportExcel = async (data, sheetName, filename) => {
    if (!data.length) return notify('error', 'No data');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      notify('error', 'Excel export failed');
    }
  };

  // Render Sub Tabs
  const renderSummary = () => {
    const list = Array.isArray(expenseRecords) ? expenseRecords : [];
    const totalExp = list.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const count = list.length;
    const avgExp = count > 0 ? totalExp / count : 0;

    let cashExp = 0;
    let onlineExp = 0;
    list.forEach(r => {
      const method = (r.paymentMethod || 'CASH').toUpperCase();
      const totalAmt = parseFloat(r.amount) || 0;
      if (method === 'MIXED') {
        let cash = parseFloat(r.cashAmount ?? r.cash_amount ?? 0);
        let online = parseFloat(r.onlineAmount ?? r.online_amount ?? 0);
        if (cash <= 0 && online <= 0) {
          cash = totalAmt / 2;
          online = totalAmt - cash;
        } else if (cash <= 0 && online > 0) {
          cash = Math.max(0, totalAmt - online);
        } else if (online <= 0 && cash > 0) {
          online = Math.max(0, totalAmt - cash);
        }
        cashExp += cash;
        onlineExp += online;
      } else if (method === 'CASH') {
        cashExp += totalAmt;
      } else {
        onlineExp += totalAmt;
      }
    });

    const cards = [
      { label: 'Total Expenses', val: `${SYM}${fmt(totalExp)}`, color: '#f43f5e', bg: '#fff1f2', icon: <FaReceipt /> },
      { label: 'Expense Entries', val: count, color: '#3b82f6', bg: '#eff6ff', icon: <FaBoxes /> },
      { label: 'Cash Outflow', val: `${SYM}${fmt(cashExp)}`, color: '#f97316', bg: '#fff7ed', icon: <FaMoneyBillWave /> },
      { label: 'Bank / Online Outflow', val: `${SYM}${fmt(onlineExp)}`, color: '#6366f1', bg: '#eef2ff', icon: <FaCreditCard /> },
      { label: 'Average Voucher', val: `${SYM}${fmt(avgExp)}`, color: '#8b5cf6', bg: '#f5f3ff', icon: <FaChartLine /> },
    ];

    return (
      <>
        <div className="rpt-exp-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Metric', 'Value'],
            [
              ['Total Expenses', totalExp],
              ['Total Entries', count],
              ['Cash Outflow', cashExp],
              ['Bank/Online Outflow', onlineExp],
              ['Average Voucher', avgExp]
            ].map(row => row.map(csvCell).join(',')),
            'expense_summary'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            [
              { Metric: 'Total Expenses', Value: totalExp },
              { Metric: 'Total Entries', Value: count },
              { Metric: 'Cash Outflow', Value: cashExp },
              { Metric: 'Bank/Online Outflow', Value: onlineExp },
              { Metric: 'Average Voucher', Value: avgExp }
            ],
            'Expense Summary', 'expense_summary'
          )}><FaFileExcel /> Excel</button>
        </div>

        <div className="rpt-exp-kpi-grid">
          {cards.map((c, i) => (
            <div key={i} className="rpt-exp-kpi" style={{ borderLeft: `2.5px solid ${c.color}` }}>
              <div className="rpt-exp-kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="rpt-exp-kpi-data">
                <span className="rpt-exp-kpi-label">{c.label}</span>
                <span className="rpt-exp-kpi-val">{c.val}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderRecords = () => {
    const list = Array.isArray(expenseRecords) ? expenseRecords : [];
    const filtered = list.filter(r => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q || (
        (r.referenceNumber || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.title || r.name || '').toLowerCase().includes(q) ||
        (r.categoryName || r.category || '').toLowerCase().includes(q)
      );
      const matchCat = categoryFilter === 'ALL' || (
        String(r.categoryId) === String(categoryFilter) ||
        r.categoryName === categoryFilter ||
        r.category === categoryFilter
      );
      return matchSearch && matchCat;
    });

    return (
      <>
        <div className="rpt-exp-toolbar">
          <NiceSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'ALL', label: 'All Categories' },
              ...expenseCategories.map(c => ({ value: c.id, label: c.name }))
            ]}
            style={{ width: 170 }}
          />
          <div style={{ position: 'relative', width: 220 }}>
            <input
              type="text"
              placeholder="Search Expense…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="rpt-exp-search-input"
            />
            <FaSearch className="rpt-exp-search-icon" />
          </div>
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Date', 'Category', 'Title / Description', 'Payment Method', 'Amount'],
            filtered.map(r => {
              const isMixed = (r.paymentMethod || '').toUpperCase() === 'MIXED';
              const cash = parseFloat(r.cashAmount ?? r.cash_amount) || (parseFloat(r.amount) / 2 || 0);
              const online = parseFloat(r.onlineAmount ?? r.online_amount) || (parseFloat(r.amount) / 2 || 0);
              const payDisplay = isMixed ? `Cash: ${fmt(cash)} + Online: ${fmt(online)}` : (r.paymentMethod || '—');
              return [
                formatTzDate(r.date || r.createdAt, timezone, { format: 'short' }),
                r.categoryName || r.category?.name || 'General',
                r.title || r.name || r.description || '—',
                payDisplay,
                r.amount || 0
              ].map(csvCell).join(',');
            }),
            'expense_records'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            filtered.map(r => {
              const isMixed = (r.paymentMethod || '').toUpperCase() === 'MIXED';
              const cash = parseFloat(r.cashAmount ?? r.cash_amount) || (parseFloat(r.amount) / 2 || 0);
              const online = parseFloat(r.onlineAmount ?? r.online_amount) || (parseFloat(r.amount) / 2 || 0);
              const payDisplay = isMixed ? `Cash: ${fmt(cash)} + Online: ${fmt(online)}` : (r.paymentMethod || '—');
              return {
                'Date': formatTzDate(r.date || r.createdAt, timezone, { format: 'short' }),
                'Category': r.categoryName || r.category?.name || 'General',
                'Title / Description': r.title || r.name || r.description || '—',
                'Payment Method': payDisplay,
                'Amount': Number(r.amount || 0)
              };
            }),
            'Expense Records', 'expense_records'
          )}><FaFileExcel /> Excel</button>
        </div>

        {filtered.length === 0 ? (
          <div className="rpt-exp-empty">No expense records match the search filter</div>
        ) : (
          <div className="rpt-exp-tbl-wrap">
            <table className="rpt-exp-tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Title / Memo</th>
                  <th>Disbursement Method</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td>{formatTzDate(r.date || r.createdAt, timezone, { format: 'short' })}</td>
                    <td><span className="rpt-exp-pill">{r.categoryName || r.category?.name || 'General'}</span></td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{r.title || r.name || r.description || 'Expense Entry'}</td>
                    <td>
                      {(r.paymentMethod || '').toUpperCase() === 'MIXED' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
                          <span className="rpt-exp-st paid" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                            Cash: {SYM}{fmt(parseFloat(r.cashAmount ?? r.cash_amount) || (parseFloat(r.amount) / 2 || 0))}
                          </span>
                          <span className="rpt-exp-st paid" style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                            Online: {SYM}{fmt(parseFloat(r.onlineAmount ?? r.online_amount) || (parseFloat(r.amount) / 2 || 0))}
                          </span>
                        </div>
                      ) : (
                        <span className="rpt-exp-st paid">{r.paymentMethod || 'CASH'}</span>
                      )}
                    </td>
                    <td className="r rpt-exp-amt" style={{ color: '#ef4444' }}>{SYM}{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderCategories = () => {
    const list = Array.isArray(expenseRecords) ? expenseRecords : [];
    const catMap = {};
    list.forEach(r => {
      const cName = r.categoryName || r.category?.name || 'General';
      if (!catMap[cName]) catMap[cName] = { name: cName, total: 0, count: 0 };
      catMap[cName].total += (parseFloat(r.amount) || 0);
      catMap[cName].count += 1;
    });

    const categoriesList = Object.values(catMap).sort((a, b) => b.total - a.total);
    const totalExp = categoriesList.reduce((acc, c) => acc + c.total, 0);

    return (
      <>
        <div className="rpt-exp-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Category', 'Entries Count', 'Total Spent', 'Share %'],
            categoriesList.map(c => {
              const share = totalExp > 0 ? ((c.total / totalExp) * 100).toFixed(1) : '0';
              return [c.name, c.count, c.total, `${share}%`].map(csvCell).join(',');
            }),
            'expense_categories'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            categoriesList.map(c => {
              const share = totalExp > 0 ? ((c.total / totalExp) * 100).toFixed(1) : '0';
              return {
                'Category': c.name,
                'Entries Count': c.count,
                'Total Spent': c.total,
                'Share %': `${share}%`
              };
            }),
            'Category Spending', 'expense_categories'
          )}><FaFileExcel /> Excel</button>
        </div>

        {categoriesList.length === 0 ? (
          <div className="rpt-exp-empty">No category data for selected range</div>
        ) : (
          <div className="rpt-exp-tbl-wrap">
            <table className="rpt-exp-tbl">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="r">Transactions</th>
                  <th className="r">Total Spent</th>
                  <th className="r">Share %</th>
                </tr>
              </thead>
              <tbody>
                {categoriesList.map((c, idx) => {
                  const pct = totalExp > 0 ? ((c.total / totalExp) * 100).toFixed(1) : '0';
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700, color: '#1e293b' }}>{c.name}</td>
                      <td className="r">{c.count}</td>
                      <td className="r rpt-exp-amt" style={{ color: '#ef4444' }}>{SYM}{fmt(c.total)}</td>
                      <td className="r" style={{ fontWeight: 700, color: '#f97316' }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td>Total</td>
                  <td className="r">{categoriesList.reduce((acc, c) => acc + c.count, 0)}</td>
                  <td className="r rpt-exp-amt" style={{ color: '#ef4444' }}>{SYM}{fmt(totalExp)}</td>
                  <td className="r">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderPayments = () => {
    const list = Array.isArray(expenseRecords) ? expenseRecords : [];
    const payMap = {};

    const addPay = (method, amount) => {
      const val = parseFloat(amount) || 0;
      if (val <= 0) return;
      const m = (method || 'CASH').toUpperCase();
      if (!payMap[m]) payMap[m] = { name: m, total: 0, count: 0 };
      payMap[m].total += val;
      payMap[m].count += 1;
    };

    list.forEach(r => {
      const method = (r.paymentMethod || 'CASH').toUpperCase();
      const totalAmt = parseFloat(r.amount) || 0;
      if (method === 'MIXED') {
        let cash = parseFloat(r.cashAmount ?? r.cash_amount ?? 0);
        let online = parseFloat(r.onlineAmount ?? r.online_amount ?? 0);
        if (cash <= 0 && online <= 0) {
          cash = totalAmt / 2;
          online = totalAmt - cash;
        } else if (cash <= 0 && online > 0) {
          cash = Math.max(0, totalAmt - online);
        } else if (online <= 0 && cash > 0) {
          online = Math.max(0, totalAmt - cash);
        }
        if (cash > 0) addPay('CASH', cash);
        if (online > 0) addPay('ONLINE', online);
      } else {
        addPay(method, totalAmt);
      }
    });

    const paymentList = Object.values(payMap).sort((a, b) => b.total - a.total);
    const totalExp = paymentList.reduce((acc, p) => acc + p.total, 0);

    return (
      <>
        <div className="rpt-exp-toolbar">
          <button className="rpt-exp-btn" onClick={() => exportCSV(
            ['Payment Method', 'Disbursements', 'Total Disbursed', 'Share %'],
            paymentList.map(p => {
              const share = totalExp > 0 ? ((p.total / totalExp) * 100).toFixed(1) : '0';
              return [p.name, p.count, p.total, `${share}%`].map(csvCell).join(',');
            }),
            'expense_payments'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            paymentList.map(p => {
              const share = totalExp > 0 ? ((p.total / totalExp) * 100).toFixed(1) : '0';
              return {
                'Payment Method': p.name,
                'Disbursements': p.count,
                'Total Disbursed': p.total,
                'Share %': `${share}%`
              };
            }),
            'Expense Payments', 'expense_payments'
          )}><FaFileExcel /> Excel</button>
        </div>

        {paymentList.length === 0 ? (
          <div className="rpt-exp-empty">No payment data for selected range</div>
        ) : (
          <>
            <div className="rpt-exp-pay-grid">
              {paymentList.map((p, i) => {
                const method = String(p.name || '').toUpperCase();
                let theme = { color: '#6366f1', bg: '#f5f3ff', grad: 'linear-gradient(135deg, #8b5cf6, #6366f1)', icon: <FaWallet /> };
                if (method.includes('CASH')) {
                  theme = { color: '#10b981', bg: '#ecfdf4', grad: 'linear-gradient(135deg, #10b981, #059669)', icon: <FaMoneyBillWave /> };
                } else if (method.includes('CARD') || method.includes('DEBIT') || method.includes('CREDIT')) {
                  theme = { color: '#3b82f6', bg: '#eff6ff', grad: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', icon: <FaCreditCard /> };
                } else if (method.includes('ONLINE') || method.includes('UPI')) {
                  theme = { color: '#ea580c', bg: '#fff7ed', grad: 'linear-gradient(135deg, #f97316, #ea580c)', icon: <FaMobileAlt /> };
                }
                const pct = totalExp > 0 ? Number(((p.total / totalExp) * 100).toFixed(1)) : 0;
                const avgAmount = p.count > 0 ? p.total / p.count : 0;

                return (
                  <div key={i} className="rpt-exp-pay-card" style={{ borderTop: `2.5px solid ${theme.color}` }}>
                    <div className="rpt-exp-pay-card-header">
                      <div className="rpt-exp-pay-icon-box" style={{ background: theme.bg, color: theme.color }}>
                        {theme.icon}
                      </div>
                      <div className="rpt-exp-pay-method-info">
                        <span className="rpt-exp-pay-method-name">{p.name}</span>
                        <span className="rpt-exp-pay-meta">{p.count} txns · {pct}%</span>
                      </div>
                    </div>
                    <div className="rpt-exp-pay-body">
                      <div className="rpt-exp-pay-amt">{SYM}{fmt(p.total)}</div>
                      <div className="rpt-exp-pay-avg">Avg: {SYM}{fmt(avgAmount)}</div>
                    </div>
                    <div className="rpt-exp-pay-bar-wrapper">
                      <div className="rpt-exp-pay-bar-fill" style={{ width: `${pct}%`, background: theme.grad }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  };

  const subTabContent = {
    exp_summary: renderSummary,
    exp_records: renderRecords,
    exp_categories: renderCategories,
    exp_payments: renderPayments,
  };

  return (
    <div className="rpt-exp-view">
      <div className="rpt-exp-subtabs">
        {EXPENSE_TABS.map(t => (
          <button
            key={t.key}
            className={`rpt-exp-subtab ${subTab === t.key ? 'active' : ''}`}
            onClick={() => setSubTab(t.key)}
            title={t.label}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      {loadError && <div className="rpt-exp-error">{loadError}</div>}

      <div className="rpt-exp-body">
        {loading ? (
          <div className="rpt-exp-loading">Aggregating operating expenses…</div>
        ) : (
          subTabContent[subTab]?.()
        )}
      </div>

      <style jsx global>{`
        .rpt-exp-view { width: 100%; display: flex; flex-direction: column; gap: 14px; }
        .rpt-exp-subtabs { display: flex; gap: 4px; overflow-x: auto; padding: 4px 0 10px; -webkit-overflow-scrolling: touch; }
        .rpt-exp-subtab { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-size: 11px; font-weight: 700; cursor: pointer; transition: .2s; white-space: nowrap; }
        .rpt-exp-subtab:hover { border-color: #f43f5e; color: #f43f5e; }
        .rpt-exp-subtab.active { background: #f43f5e; color: #fff; border-color: #f43f5e; box-shadow: 0 4px 10px rgba(244,63,94,.2); }

        .rpt-exp-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
        .rpt-exp-btn { padding: 8px 14px; border-radius: 10px; border: 1.5px solid #f43f5e; background: #fff; color: #f43f5e; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: .2s; }
        .rpt-exp-btn:hover { background: #fff1f2; transform: translateY(-1px); }

        .rpt-exp-search-input { width: 100%; height: 36px; padding: 6px 12px 6px 30px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 12px; outline: none; }
        .rpt-exp-search-icon { position: absolute; left: 10px; top: 11px; color: #94a3b8; font-size: 11px; }

        .rpt-exp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
        .rpt-exp-kpi { background: #fff; padding: 10px 14px; border-radius: 12px; border: 1px solid #f1f5f9; display: grid; grid-template-areas: "label icon" "value icon"; grid-template-columns: 1fr auto; align-items: center; gap: 4px 10px; min-height: 64px; }
        .rpt-exp-kpi:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.03); }
        .rpt-exp-kpi-icon { grid-area: icon; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .rpt-exp-kpi-data { display: contents; }
        .rpt-exp-kpi-label { grid-area: label; font-size: 9.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
        .rpt-exp-kpi-val { grid-area: value; font-size: 16px; font-weight: 800; color: #1e293b; }

        .rpt-exp-pay-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .rpt-exp-pay-card { flex: 1 1 230px; max-width: 300px; background: #fff; padding: 12px 14px; border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,.02); display: flex; flex-direction: column; gap: 8px; }
        .rpt-exp-pay-card:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,0.04); }
        .rpt-exp-pay-card-header { display: flex; align-items: center; gap: 10px; }
        .rpt-exp-pay-icon-box { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; }
        .rpt-exp-pay-method-info { display: flex; flex-direction: column; gap: 1px; }
        .rpt-exp-pay-method-name { font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
        .rpt-exp-pay-meta { font-size: 10px; color: #94a3b8; font-weight: 600; }
        .rpt-exp-pay-body { display: flex; justify-content: space-between; align-items: baseline; }
        .rpt-exp-pay-amt { font-size: 16px; font-weight: 850; color: #1e293b; }
        .rpt-exp-pay-avg { font-size: 10.5px; color: #64748b; font-weight: 600; }
        .rpt-exp-pay-bar-wrapper { height: 4px; background: #f1f5f9; border-radius: 2px; overflow: hidden; }
        .rpt-exp-pay-bar-fill { height: 100%; border-radius: 2px; }

        .rpt-exp-tbl-wrap { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: auto; box-shadow: 0 1px 3px rgba(0,0,0,.02); }
        .rpt-exp-tbl { width: 100%; border-collapse: collapse; min-width: 600px; }
        .rpt-exp-tbl th { background: #fff; padding: 8px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #f43f5e; }
        .rpt-exp-tbl td { padding: 8px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; white-space: nowrap; }
        .rpt-exp-tbl .r { text-align: right; }
        .rpt-exp-pill { font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 20px; background: #f1f5f9; color: #475569; text-transform: uppercase; }
        .rpt-exp-st { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; }
        .rpt-exp-st.paid { background: #ecfdf5; color: #10b981; }
        .rpt-exp-amt { font-weight: 800; color: #1e293b; }

        .rpt-exp-loading, .rpt-exp-empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .rpt-exp-error { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 12px; font-weight: 800; }
      `}</style>
    </div>
  );
}
