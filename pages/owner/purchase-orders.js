import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import BranchRequiredGate from '../../components/BranchRequiredGate';
import ErrorBoundary from '../../components/purchasing/ErrorBoundary';
import PurchaseFilters from '../../components/purchasing/PurchaseFilters';
import PurchaseTable from '../../components/purchasing/PurchaseTable';
import PurchaseCards from '../../components/purchasing/PurchaseCards';
import PurchaseForm from '../../components/purchasing/PurchaseForm';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { formatTzDate } from '../../utils/timezoneUtils';
import api from '../../utils/api';
import { 
  FaPlus, FaArrowLeft, FaCheckCircle, FaExclamationCircle, FaFileInvoiceDollar 
} from 'react-icons/fa';
import styles from '../../components/purchasing/Purchasing.module.css';

export default function PurchaseOrdersPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Purchase Orders">
      <BranchRequiredGate>
        <ErrorBoundary>
          <PurchaseContent />
        </ErrorBoundary>
      </BranchRequiredGate>
    </RoleGate>
  );
}

function PurchaseContent() {
  const {
    timezone,
    currencySymbol,
    vendors,
    warehouses,
    products,
    loading,
    saving,
    view,
    setView,
    step,
    setStep,
    errors,
    setErrors,
    message,
    setMessage,
    msgType,
    showDraftModal,
    setShowDraftModal,
    showCancelConfirm,
    setShowCancelConfirm,
    drafts,
    history,
    historyLoading,
    historyPage,
    productSearch,
    setProductSearch,
    showSuggestions,
    setShowSuggestions,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    filterStatus,
    setFilterStatus,
    filterVendor,
    setFilterVendor,
    filterWarehouse,
    setFilterWarehouse,
    filterPayMethod,
    setFilterPayMethod,
    po,
    setPo,
    toast,
    fetchHistory,
    addProduct,
    updateLine,
    removeLine,
    handleSave,
    loadDraft,
    startFresh,
    vendorOptions,
    warehouseOptions,
    selectedVendor,
    selectedWarehouse,
    isLocked,
    statusCfg,
    filteredProducts,
    stepOk,
    warehouseStock,
    STATUS_CFG,
  } = usePurchaseOrders();

  const router = useRouter();

  useEffect(() => {
    if (router.query.view === 'history') {
      setView('history');
    }
  }, [router.query.view, setView]);

  // ── Document Viewer Popup ─────────────────────────────────────────────────
  // viewingDoc = { order, type: 'order' | 'invoice' | 'payment' } | null
  const [viewingDoc, setViewingDoc] = useState(null);

  const handleViewDocument = useCallback((order) => setViewingDoc({ order, type: 'order' }), []);
  const handleCloseDocument = useCallback(() => setViewingDoc(null), []);

  // Called by DocumentViewerPopup when user clicks invoice/payment link
  const handleViewLinked = useCallback((order, type) => {
    setViewingDoc({ order, type });
  }, []);

  const handleInvoiceOrder = useCallback(async (order) => {
    try {
      // Import api utility dynamically or use it directly (it's already imported at the top!)
      const r = await api.post(`/api/v1/orders/${order.id}/bill`);
      if (r.data.success) {
        toast('✅ Invoice generated successfully!', 'success');
        fetchHistory(); // refresh the table list
        // Transition popup view to 'invoice' mode to display the newly generated invoice details!
        setViewingDoc(prev => prev && prev.order.id === order.id ? { order: r.data.data, type: 'invoice' } : prev);
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to generate invoice', 'error');
    }
  }, [fetchHistory, toast]);

  // ── Loading Skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout title="Purchase Orders" showBack={false}>
        <div className={styles['po-skeleton-wrapper']}>
          <div className={styles['sk-header']} />
          <div className={styles['sk-body']}>
            <div className={styles['sk-left']}>
              <div className={styles['sk-card']} />
              <div className={styles['sk-card']} />
              <div className={`${styles['sk-card']} ${styles.tall}`} />
            </div>
            <div className={styles['sk-sidebar']}>
              <div className={styles['sk-card']} />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── HISTORY VIEW ──────────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <>
        <Head>
          <title>PO History — Cafe QR</title>
        </Head>
        <DashboardLayout title="Purchase Orders" showBack={false}>
          <div className={`${styles['po-wrap']} po-wrap`}>
            {/* Toolbar */}
            <div className={styles['hist-toolbar']}>
              <div className={styles['hist-toolbar-left']}>
                <PurchaseFilters
                  fromDate={fromDate} setFromDate={setFromDate}
                  toDate={toDate} setToDate={setToDate}
                  filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                  filterVendor={filterVendor} setFilterVendor={setFilterVendor}
                  filterWarehouse={filterWarehouse} setFilterWarehouse={setFilterWarehouse}
                  filterPayMethod={filterPayMethod} setFilterPayMethod={setFilterPayMethod}
                  vendorOptions={vendorOptions} warehouseOptions={warehouseOptions}
                  styles={styles}
                />
              </div>
            </div>

            {historyLoading ? (
              <div className={styles['po-spinner-box']}>
                <div className={styles['po-spinner']} />
                <span>Loading orders...</span>
              </div>
            ) : history.length === 0 ? (
              <div className={styles['po-empty-state']}>
                <h3>No Purchase Orders yet</h3>
                <p>Create your first PO to start tracking supplier orders</p>
                <button className={styles['btn-primary']} onClick={() => setView('form')}>
                  <FaPlus /> Create Purchase Order
                </button>
              </div>
            ) : (
              <>
                <PurchaseTable
                  history={history}
                  vendors={vendors}
                  warehouses={warehouses}
                  timezone={timezone}
                  currencySymbol={currencySymbol}
                  formatTzDate={formatTzDate}
                  loadDraft={loadDraft}
                  setView={setView}
                  STATUS_CFG={STATUS_CFG}
                  styles={styles}
                  onViewDocument={handleViewDocument}
                  onInvoiceOrder={handleInvoiceOrder}
                />
                <PurchaseCards
                  history={history}
                  vendors={vendors}
                  timezone={timezone}
                  currencySymbol={currencySymbol}
                  formatTzDate={formatTzDate}
                  loadDraft={loadDraft}
                  setView={setView}
                  STATUS_CFG={STATUS_CFG}
                  styles={styles}
                  onViewDocument={handleViewDocument}
                  onInvoiceOrder={handleInvoiceOrder}
                />
                {historyPage.totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '20px 0 8px' }}>
                    <button
                      disabled={historyLoading || historyPage.number === 0}
                      onClick={() => fetchHistory(historyPage.number - 1)}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontWeight: '700',
                        fontSize: '13px',
                        color: '#0ea5e9',
                        cursor: (historyLoading || historyPage.number === 0) ? 'not-allowed' : 'pointer',
                        opacity: (historyLoading || historyPage.number === 0) ? 0.4 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>
                      Page {historyPage.number + 1} of {historyPage.totalPages} &nbsp;·&nbsp; {historyPage.totalElements} total
                    </span>
                    <button
                      disabled={historyLoading || historyPage.number >= historyPage.totalPages - 1}
                      onClick={() => fetchHistory(historyPage.number + 1)}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontWeight: '700',
                        fontSize: '13px',
                        color: '#0ea5e9',
                        cursor: (historyLoading || historyPage.number >= historyPage.totalPages - 1) ? 'not-allowed' : 'pointer',
                        opacity: (historyLoading || historyPage.number >= historyPage.totalPages - 1) ? 0.4 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {message && <Toast msg={message} type={msgType} onClose={() => setMessage(null)} />}
        </DashboardLayout>

        {/* Document Viewer Popup */}
        {viewingDoc && (
          <DocumentViewerPopup
            order={viewingDoc.order}
            docType={viewingDoc.type}
            vendors={vendors}
            warehouses={warehouses}
            timezone={timezone}
            currencySymbol={currencySymbol}
            formatTzDate={formatTzDate}
            onClose={handleCloseDocument}
            onViewLinked={handleViewLinked}
            onInvoiceOrder={handleInvoiceOrder}
            STATUS_CFG={STATUS_CFG}
          />
        )}
      </>
    );
  }

  // ── FORM VIEW ─────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Purchase Orders — Cafe QR</title>
      </Head>
      <DashboardLayout title="Purchase Orders" showBack={false}>
        <PurchaseForm
          po={po} setPo={setPo}
          vendors={vendors} warehouses={warehouses} products={products} filteredProducts={filteredProducts}
          vendorOptions={vendorOptions} warehouseOptions={warehouseOptions}
          selectedVendor={selectedVendor} selectedWarehouse={selectedWarehouse}
          isLocked={isLocked} statusCfg={statusCfg}
          step={step} setStep={setStep} stepOk={stepOk}
          productSearch={productSearch} setProductSearch={setProductSearch}
          showSuggestions={showSuggestions} setShowSuggestions={setShowSuggestions}
          addProduct={addProduct} updateLine={updateLine} removeLine={removeLine}
          saving={saving} handleSave={handleSave}
          errors={errors} setErrors={setErrors}
          showDraftModal={showDraftModal} setShowDraftModal={setShowDraftModal}
          showCancelConfirm={showCancelConfirm} setShowCancelConfirm={setShowCancelConfirm}
          drafts={drafts} loadDraft={loadDraft}
          fetchHistory={fetchHistory} setView={setView}
          currencySymbol={currencySymbol}
          timezone={timezone} formatTzDate={formatTzDate}
          startFresh={startFresh}
          styles={styles}
          warehouseStock={warehouseStock}
        />
        {message && <Toast msg={message} type={msgType} onClose={() => setMessage(null)} />}
      </DashboardLayout>
    </>
  );
}

// ─── Shared Toast ────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  return (
    <div className={`${styles['po-toast']} ${styles[type === 'success' ? 'success' : 'error']}`} onClick={onClose}>
      {type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
      <span>{msg}</span>
      <button className={styles['toast-x']}>×</button>
    </div>
  );
}
