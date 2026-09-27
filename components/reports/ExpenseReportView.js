import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import { useNotification } from '../../context/NotificationContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import {
  FaChartBar, FaBoxes, FaCreditCard, FaReceipt,
  FaFileCsv, FaFileExcel, FaSearch, FaPlus, FaMoneyBillWave,
  FaChartLine
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

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const expParams = {
      fromDate: toInstant(dateFrom),
      toDate: toInstant(dateTo),
      from: toInstant(dateFrom),
      to: toInstant(dateTo),
      size: 5000,
      page: 0
    };
    if (selectedOrgId) {
      expParams.branchId = selectedOrgId;
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
  }, [dateFrom, dateTo, isSuperAdmin, selectedOrgId, notify]);

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

    const cashExp = list.filter(r => (r.paymentMethod || '').toUpperCase() === 'CASH')
      .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const onlineExp = totalExp - cashExp;

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
            <div key={i} className="rpt-exp-kpi" style={{ borderLeft: `4px solid ${c.color}` }}>
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
        (r.title || r.name || '').toLowerCase().includes(q) ||
        (r.categoryName || r.category || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
      const matchCat = categoryFilter === 'ALL' || (r.categoryId === categoryFilter || r.category === categoryFilter);
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
            filtered.map(r => [
              formatTzDate(r.date || r.createdAt, timezone, { format: 'short' }),
              r.categoryName || r.category?.name || 'General',
              r.title || r.name || r.description || '—',
              r.paymentMethod || '—',
              r.amount || 0
            ].map(csvCell).join(',')),
            'expense_records'
          )}><FaFileCsv /> CSV</button>
          <button className="rpt-exp-btn" onClick={() => exportExcel(
            filtered.map(r => ({
              'Date': formatTzDate(r.date || r.createdAt, timezone, { format: 'short' }),
              'Category': r.categoryName || r.category?.name || 'General',
              'Title / Description': r.title || r.name || r.description || '—',
              'Payment Method': r.paymentMethod || '—',
              'Amount': Number(r.amount || 0)
            })),
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
                    <td><span className="rpt-exp-st paid">{r.paymentMethod || 'CASH'}</span></td>
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
    list.forEach(r => {
      const pName = (r.paymentMethod || 'Cash').toUpperCase();
      if (!payMap[pName]) payMap[pName] = { name: pName, total: 0, count: 0 };
      payMap[pName].total += (parseFloat(r.amount) || 0);
      payMap[pName].count += 1;
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
          <div className="rpt-exp-tbl-wrap">
            <table className="rpt-exp-tbl">
              <thead>
                <tr>
                  <th>Payment Method</th>
                  <th className="r">Disbursements</th>
                  <th className="r">Total Outflow</th>
                  <th className="r">Share %</th>
                </tr>
              </thead>
              <tbody>
                {paymentList.map((p, idx) => {
                  const pct = totalExp > 0 ? ((p.total / totalExp) * 100).toFixed(1) : '0';
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700, color: '#1e293b' }}>{p.name}</td>
                      <td className="r">{p.count}</td>
                      <td className="r rpt-exp-amt" style={{ color: '#ef4444' }}>{SYM}{fmt(p.total)}</td>
                      <td className="r" style={{ fontWeight: 700, color: '#6366f1' }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td>Total</td>
                  <td className="r">{paymentList.reduce((acc, p) => acc + p.count, 0)}</td>
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

        .rpt-exp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .rpt-exp-kpi { background: #fff; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; display: grid; grid-template-areas: "label icon" "value icon"; grid-template-columns: 1fr auto; align-items: center; gap: 6px 12px; min-height: 85px; }
        .rpt-exp-kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,.03); }
        .rpt-exp-kpi-icon { grid-area: icon; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .rpt-exp-kpi-data { display: contents; }
        .rpt-exp-kpi-label { grid-area: label; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
        .rpt-exp-kpi-val { grid-area: value; font-size: 20px; font-weight: 850; color: #1e293b; }

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
