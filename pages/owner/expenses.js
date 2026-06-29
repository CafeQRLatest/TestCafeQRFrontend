import React, { useMemo } from 'react';
import Head from 'next/head';
import DashboardLayout from '../../components/DashboardLayout';
import ErrorBoundary from '../../components/expenses/ErrorBoundary';
import ExpenseFilters from '../../components/expenses/ExpenseFilters';
import ExpenseTable from '../../components/expenses/ExpenseTable';
import ExpenseCards from '../../components/expenses/ExpenseCards';
import ExpenseForm from '../../components/expenses/ExpenseForm';
import CategoryManager from '../../components/expenses/CategoryManager';
import { useExpenses } from '../../hooks/useExpenses';
import { useExpenseExport } from '../../hooks/useExpenseExport';
import { SCOPE_ALL, SCOPE_GLOBAL } from '../../constants/expenseScopes';
import { prettyMethod } from '../../constants/payMethods';
import { FaPlus, FaCog, FaFileExcel, FaFileCsv, FaFileAlt } from 'react-icons/fa';
import styles from '../../components/expenses/Expenses.module.css';

export default function ExpensesPage() {
  const {
    // Filter
    filters, dispatch,
    // Data
    expenses: records, categories, formCategories, loading, branches,
    // Form
    showForm, setShowForm, editing, setEditing,
    saving, handleSubmit, openAdd, openEdit, handleDelete,
    // pendingCatId: auto-selects a newly created category in ExpenseForm
    pendingCatId, clearPendingCatId,
    // Category manager
    showCatMgr, setShowCatMgr,
    catName, setCatName,
    catSaving, catActiveFilter, setCatActiveFilter,
    addCategory, toggleCatActive,
    // Misc
    isSuperAdmin, timezone, orgId, currencySymbol, loadCategoriesForScope,
    expPage, expTotalPages, expTotalElements, fetchPage
  } = useExpenses();

  const { exportToCSV, exportToExcel } = useExpenseExport({ categories, timezone });

  // Scope for CategoryManager when opened from outside the form
  const catMgrScope = isSuperAdmin
    ? (filters.branch === SCOPE_ALL ? SCOPE_GLOBAL : filters.branch)
    : (orgId || SCOPE_GLOBAL);

  const totalExpenses = useMemo(() => {
    return records.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  }, [records]);

  const expensesByPaymentMethod = useMemo(() => {
    const map = {};
    records.forEach(r => {
      const method = (r.paymentMethod || 'OTHER').toUpperCase();
      if (method === 'MIXED') {
        const cash = parseFloat(r.cashAmount) || 0;
        const online = parseFloat(r.onlineAmount) || 0;
        map['CASH'] = (map['CASH'] || 0) + cash;
        map['ONLINE'] = (map['ONLINE'] || 0) + online;
      } else {
        map[method] = (map[method] || 0) + (parseFloat(r.amount) || 0);
      }
    });
    return Object.entries(map).map(([method, amount]) => ({
      method,
      amount
    })).sort((a, b) => b.amount - a.amount);
  }, [records]);

  return (
    <>
      <Head>
        <title>Expenses — Cafe QR</title>
        <meta name="description" content="Record, review and export business expenses across all branches." />
      </Head>

      <DashboardLayout title="Expenses">
        <ErrorBoundary>
          <div className={styles['exp-page']}>

            {/* ── ACTION BAR ── */}
            <div className={styles['exp-action-bar']}>
              <button id="btn-add-expense" className={`${styles['eab-btn']} ${styles.primary}`} onClick={openAdd}>
                <FaPlus /> Add Expense
              </button>
              <button id="btn-manage-categories" className={`${styles['eab-btn']} ${styles.ghost}`} onClick={() => setShowCatMgr(true)}>
                <FaCog /> Categories
              </button>
              <button id="btn-export-excel" className={`${styles['eab-btn']} ${styles.export}`} onClick={() => exportToExcel(records)}>
                <FaFileExcel /> Excel
              </button>
              <button id="btn-export-csv" className={`${styles['eab-btn']} ${styles.export}`} onClick={() => exportToCSV(records)}>
                <FaFileCsv /> CSV
              </button>
            </div>

            {/* ── FILTER BAR ── */}
            <ExpenseFilters
              filters={filters}
              dispatch={dispatch}
              categories={categories}
              branches={branches}
              isSuperAdmin={isSuperAdmin}
            />

            {/* ── SUMMARY SECTION ── */}
            {!loading && records.length > 0 && (
              <div className={styles['summary-container']}>
                <div className={styles['summary-card']}>
                  <div className={styles['kpi-title']}>Total Expenses</div>
                  <div className={styles['kpi-value']}>
                    {currencySymbol}{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={styles['kpi-subtitle']}>
                    Calculated for the selected period
                  </div>
                </div>
                <div className={styles['breakdown-card']}>
                  <div className={styles['breakdown-title']}>Expenses By Payment Method</div>
                  <div className={styles['breakdown-grid']}>
                    {expensesByPaymentMethod.map(({ method, amount }) => (
                      <div key={method} className={styles['breakdown-item']}>
                        <span className={styles['breakdown-method-label']}>
                          {prettyMethod(method)}
                        </span>
                        <span className={styles['breakdown-method-value']}>
                          {currencySymbol}{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── LOADING skeleton (no records yet) ── */}
            {loading && (
              <>
                <ExpenseTable
                  expenses={[]}
                  categories={[]}
                  timezone={timezone}
                  loading={true}
                  openEdit={openEdit}
                  handleDelete={handleDelete}
                  filterStatus={filters.status}
                  currencySymbol={currencySymbol}
                />
                <ExpenseCards
                  expenses={[]}
                  categories={[]}
                  timezone={timezone}
                  loading={true}
                  openEdit={openEdit}
                  handleDelete={handleDelete}
                  filterStatus={filters.status}
                  currencySymbol={currencySymbol}
                />
              </>
            )}

            {/* ── EMPTY STATE ── */}
            {!loading && records.length === 0 && (
              <div className={styles['erp-empty-state']}>
                <div className={styles['empty-ic']}><FaFileAlt /></div>
                <div className={styles['empty-title']}>No Transaction History</div>
                <div className={styles['empty-sub']}>Adjust your filters or record your first expense.</div>
                <button
                  className={`${styles['eab-btn']} ${styles.primary} ${styles['mt-20']}`}
                  onClick={openAdd}
                >
                  <FaPlus /> Add First Expense
                </button>
              </div>
            )}

            {/* ── DATA ── */}
            {!loading && records.length > 0 && (
              <>
                <ExpenseTable
                  expenses={records}
                  categories={categories}
                  timezone={timezone}
                  loading={false}
                  openEdit={openEdit}
                  handleDelete={handleDelete}
                  filterStatus={filters.status}
                  currencySymbol={currencySymbol}
                />
                <ExpenseCards
                  expenses={records}
                  categories={categories}
                  timezone={timezone}
                  loading={false}
                  openEdit={openEdit}
                  handleDelete={handleDelete}
                  filterStatus={filters.status}
                  currencySymbol={currencySymbol}
                />

                {/* ── PAGINATION BAR ── */}
                {expTotalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    padding: '16px 0',
                    borderTop: '1px solid #f1f5f9',
                    marginTop: '12px'
                  }}>
                    <button
                      disabled={expPage === 0}
                      onClick={() => fetchPage(expPage - 1)}
                      style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        fontWeight: '700',
                        fontSize: '13px',
                        cursor: expPage === 0 ? 'not-allowed' : 'pointer',
                        opacity: expPage === 0 ? 0.4 : 1
                      }}
                    >
                      ← Prev
                    </button>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                      Page {expPage + 1} of {expTotalPages}
                      <span style={{ marginLeft: '8px', fontWeight: '400' }}>({expTotalElements} records)</span>
                    </span>
                    <button
                      disabled={expPage >= expTotalPages - 1}
                      onClick={() => fetchPage(expPage + 1)}
                      style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        fontWeight: '700',
                        fontSize: '13px',
                        cursor: expPage >= expTotalPages - 1 ? 'not-allowed' : 'pointer',
                        opacity: expPage >= expTotalPages - 1 ? 0.4 : 1
                      }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}

          </div>
        </ErrorBoundary>

        {/* ── EXPENSE FORM MODAL ── */}
        {showForm && (
          <ExpenseForm
            editing={editing}
            formCategories={formCategories}
            branches={branches}
            isSuperAdmin={isSuperAdmin}
            saving={saving}
            pendingCatId={pendingCatId}
            defaultBranchId={isSuperAdmin ? (orgId || SCOPE_GLOBAL) : (orgId || '')}
            onBranchChange={(branchId) => {
              loadCategoriesForScope(branchId);
              clearPendingCatId();
            }}
            onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditing(null); }}
            onOpenCatMgr={() => setShowCatMgr(true)}
          />
        )}

        {/* ── CATEGORY MANAGER MODAL ── */}
        {showCatMgr && (
          <CategoryManager
            categories={showForm ? formCategories : categories}
            catName={catName}
            setCatName={setCatName}
            catSaving={catSaving}
            catActiveFilter={catActiveFilter}
            setCatActiveFilter={setCatActiveFilter}
            addCategory={addCategory}
            toggleCatActive={toggleCatActive}
            currentScope={catMgrScope}
            onClose={() => setShowCatMgr(false)}
          />
        )}

      </DashboardLayout>
    </>
  );
}
