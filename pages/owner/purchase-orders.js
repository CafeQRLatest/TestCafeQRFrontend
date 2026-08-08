import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import PurchaseDocumentViewerPopup from '../../components/purchasing/PurchaseDocumentViewerPopup';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { formatTzDate } from '../../utils/timezoneUtils';
import api from '../../utils/api';
import { 
  FaPlus, FaArrowLeft, FaCheckCircle, FaExclamationCircle, FaFileInvoiceDollar, FaBan 
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
    filterSearch,
    handleFilterSearchChange,
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
    payMethodOptions,
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

  // ── Multi-Select Bulk Actions State ───────────────────────────────────────
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [bulkVoidModalOpen, setBulkVoidModalOpen] = useState(false);
  const [bulkReceiveModalOpen, setBulkReceiveModalOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const handleToggleSelect = useCallback((orderId) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const isAllSelected = history.length > 0 && history.every(o => selectedOrderIds.has(o.id));

  const handleSelectAll = useCallback(() => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (history.length > 0 && history.every(o => next.has(o.id))) {
        history.forEach(o => next.delete(o.id));
      } else {
        history.forEach(o => next.add(o.id));
      }
      return next;
    });
  }, [history]);

  const handleClearSelection = useCallback(() => {
    setSelectedOrderIds(new Set());
  }, []);

  // Compute selected order capabilities
  const selectedOrders = useMemo(() => {
    return history.filter(o => selectedOrderIds.has(o.id));
  }, [history, selectedOrderIds]);

  // Bulk void is allowed as long as any non-voided order is selected
  const canBulkVoid = selectedOrders.length > 0 && selectedOrders.some(o => o.orderStatus !== 'VOID' && o.orderStatus !== 'CANCELLED');

  // Bulk receive is allowed ONLY IF all selected orders are non-received and not voided/cancelled
  const canBulkReceive = selectedOrders.length > 0 && selectedOrders.every(o => !o.isReceived && o.orderStatus !== 'VOID' && o.orderStatus !== 'CANCELLED');

  const confirmBulkVoid = useCallback(async () => {
    if (selectedOrderIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const orderIds = Array.from(selectedOrderIds);
      const r = await api.post('/api/v1/purchase/orders/bulk-void', { orderIds });
      if (r.data.success) {
        const res = r.data.data;
        toast(`✅ Voided ${res.processedCount} purchase orders successfully!`, 'success');
        if (res.errors && res.errors.length > 0) {
          toast(`⚠️ ${res.errors.length} order(s) could not be voided`, 'warning');
        }
        setSelectedOrderIds(new Set());
        setBulkVoidModalOpen(false);
        fetchHistory();
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to bulk void orders', 'error');
    } finally {
      setBulkProcessing(false);
    }
  }, [selectedOrderIds, fetchHistory, toast]);

  const confirmBulkReceive = useCallback(async () => {
    if (selectedOrderIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const orderIds = Array.from(selectedOrderIds);
      const r = await api.post('/api/v1/purchase/orders/bulk-receive', { orderIds });
      if (r.data.success) {
        const res = r.data.data;
        toast(`✅ Received ${res.processedCount} purchase orders & updated warehouse stock!`, 'success');
        if (res.errors && res.errors.length > 0) {
          toast(`⚠️ ${res.errors.length} order(s) could not be received`, 'warning');
        }
        setSelectedOrderIds(new Set());
        setBulkReceiveModalOpen(false);
        fetchHistory();
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to bulk receive orders', 'error');
    } finally {
      setBulkProcessing(false);
    }
  }, [selectedOrderIds, fetchHistory, toast]);

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
      const r = await api.post(`/api/v1/purchase/orders/${order.id}/receive`);
      if (r.data.success) {
        toast('✅ Purchase Order received — Vendor Bill Invoice generated!', 'success');
        fetchHistory(); // refresh the table list
        setViewingDoc(prev => prev && prev.order.id === order.id ? { order: r.data.data, type: 'invoice' } : prev);
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to generate invoice', 'error');
    }
  }, [fetchHistory, toast]);

  const handleReceiveOrder = useCallback(async (order) => {
    try {
      const r = await api.post(`/api/v1/purchase/orders/${order.id}/receive`);
      if (r.data.success) {
        toast('✅ Order received — Stock updated & Vendor Bill generated!', 'success');
        fetchHistory();
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to receive order', 'error');
    }
  }, [fetchHistory, toast]);

  const [cancelTarget, setCancelTarget] = useState(null);

  const handleCancelOrder = useCallback((order) => {
    setCancelTarget(order);
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    try {
      const r = await api.post(`/api/v1/purchase/orders/${cancelTarget.id}/void`);
      if (r.data.success) {
        toast(`✅ Purchase Order ${cancelTarget.orderNo} voided successfully`, 'success');
        setCancelTarget(null);
        fetchHistory();
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to void order', 'error');
    }
  }, [cancelTarget, fetchHistory, toast]);

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
        <DashboardLayout title="PO History" showBack={true} onBack={() => setView('form')}>
          <div className={`${styles['po-wrap']} po-wrap`}>
            {/* Filter Card (FIRST) */}
            <div className={styles['hist-toolbar']} style={{ width: '100%', marginBottom: '12px' }}>
              <PurchaseFilters
                fromDate={fromDate} setFromDate={setFromDate}
                toDate={toDate} setToDate={setToDate}
                filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                filterVendor={filterVendor} setFilterVendor={setFilterVendor}
                filterWarehouse={filterWarehouse} setFilterWarehouse={setFilterWarehouse}
                filterPayMethod={filterPayMethod} setFilterPayMethod={setFilterPayMethod}
                filterSearch={filterSearch} handleFilterSearchChange={handleFilterSearchChange}
                payMethodOptions={payMethodOptions}
                vendorOptions={vendorOptions} warehouseOptions={warehouseOptions}
                styles={styles}
              />
            </div>

            {/* Bulk Action Buttons Row (Only shown when orders are selected) */}
            {(canBulkReceive || canBulkVoid) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px', gap: '10px' }}>
                {canBulkReceive && (
                  <button
                    onClick={() => setBulkReceiveModalOpen(true)}
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#fff',
                      border: 'none',
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '20px',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 3px 10px rgba(5,150,105,0.3)'
                    }}
                  >
                    <FaCheckCircle style={{ fontSize: '13px' }} /> Receive ({selectedOrderIds.size})
                  </button>
                )}
                {canBulkVoid && (
                  <button
                    onClick={() => setBulkVoidModalOpen(true)}
                    style={{
                      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                      color: '#fff',
                      border: 'none',
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '20px',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 3px 10px rgba(220,38,38,0.3)'
                    }}
                  >
                    <FaBan style={{ fontSize: '13px' }} /> Void ({selectedOrderIds.size})
                  </button>
                )}
              </div>
            )}

            {historyLoading ? (
              <div className={styles['po-spinner-box']}>
                <div className={styles['po-spinner']} />
                <span>Loading orders...</span>
              </div>
            ) : history.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 16px',
                color: '#64748b',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: '#fff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.03)'
              }}>
                <FaFileInvoiceDollar style={{ fontSize: '40px', color: '#cbd5e1' }} />
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#475569' }}>No orders found</div>
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
                  onReceiveOrder={handleReceiveOrder}
                  onCancelOrder={handleCancelOrder}
                  selectedOrderIds={selectedOrderIds}
                  onToggleSelect={handleToggleSelect}
                  onSelectAll={handleSelectAll}
                  isAllSelected={isAllSelected}
                />
                <PurchaseCards
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
                  onReceiveOrder={handleReceiveOrder}
                  onCancelOrder={handleCancelOrder}
                  selectedOrderIds={selectedOrderIds}
                  onToggleSelect={handleToggleSelect}
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

        {/* Purchase Document Viewer Popup */}
        {viewingDoc && (
          <PurchaseDocumentViewerPopup
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

        {/* Single Void / Cancel Purchase Order Confirmation Modal */}
        {cancelTarget && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: '16px'
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px', maxWidth: '420px', width: '100%',
              padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              textAlign: 'center'
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2',
                color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: '20px'
              }}>
                <FaBan />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                Void Purchase Order?
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                Are you sure you want to void / cancel Purchase Order <strong style={{ color: '#0f172a' }}>{cancelTarget.orderNo}</strong>? This will void linked vendor bills, payments, and reverse warehouse stock.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  onClick={() => setCancelTarget(null)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                    background: '#fff', color: '#475569', fontWeight: '600', fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCancel}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: '#dc2626', color: '#fff', fontWeight: '600', fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Confirm Void
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Void Modal */}
        {bulkVoidModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: '16px'
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px', maxWidth: '440px', width: '100%',
              padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2',
                color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: '20px'
              }}>
                <FaBan />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                Void {selectedOrderIds.size} Purchase Order(s)?
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                Are you sure you want to void all <strong style={{ color: '#0f172a' }}>{selectedOrderIds.size}</strong> selected purchase orders? Any linked vendor bills and outbound payments will also be voided and inventory stock intake reversed.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  disabled={bulkProcessing}
                  onClick={() => setBulkVoidModalOpen(false)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                    background: '#fff', color: '#475569', fontWeight: '600', fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={bulkProcessing}
                  onClick={confirmBulkVoid}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: '#dc2626', color: '#fff', fontWeight: '700', fontSize: '13px',
                    cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.7 : 1
                  }}
                >
                  {bulkProcessing ? 'Voiding...' : `Confirm Void (${selectedOrderIds.size})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Receive Modal */}
        {bulkReceiveModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: '16px'
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px', maxWidth: '440px', width: '100%',
              padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5',
                color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: '20px'
              }}>
                <FaCheckCircle />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                Receive {selectedOrderIds.size} Purchase Order(s)?
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                Are you sure you want to receive all <strong style={{ color: '#0f172a' }}>{selectedOrderIds.size}</strong> selected orders? This will intake the items into destination warehouses and generate corresponding Vendor Bill invoices.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  disabled={bulkProcessing}
                  onClick={() => setBulkReceiveModalOpen(false)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                    background: '#fff', color: '#475569', fontWeight: '600', fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={bulkProcessing}
                  onClick={confirmBulkReceive}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: '#059669', color: '#fff', fontWeight: '700', fontSize: '13px',
                    cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.7 : 1
                  }}
                >
                  {bulkProcessing ? 'Receiving...' : `Confirm Receive (${selectedOrderIds.size})`}
                </button>
              </div>
            </div>
          </div>
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
          toast={toast}
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
