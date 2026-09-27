import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import SalesReportView from '../../components/reports/SalesReportView';
import PurchaseReportView from '../../components/reports/PurchaseReportView';
import ExpenseReportView from '../../components/reports/ExpenseReportView';
import PnLReportView from '../../components/reports/PnLReportView';
import PaymentTypeBalanceReport from '../../components/reports/PaymentTypeBalanceReport';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { getBusinessNow } from '../../utils/timezoneUtils';
import { publishAccountingDataChanged } from '../../utils/accountingRealtime';
import { isFeatureEnabled } from '../../utils/moduleVisibility';
import {
  FaReceipt, FaChartLine, FaWallet,
  FaCoins, FaShoppingBag, FaBuilding, FaBan
} from 'react-icons/fa';

function reportErrorMessage(err) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return 'Your session or branch access expired. Please sign in again or reselect the branch.';
  }
  return err?.response?.data?.message || 'Failed to load report data';
}

const toInstant = (dtLocal) => {
  if (!dtLocal) return undefined;
  try { return new Date(dtLocal + ':00').toISOString(); } catch { return undefined; }
};

export default function Reports() {
  const router = useRouter();
  const { timezone, orgId, userRole } = useAuth();
  const { notify } = useNotification();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  // Domain switcher: 'sales' | 'purchases' | 'expenses' | 'pnl' | 'balances'
  const [domain, setDomain] = useState(() => {
    const qSec = router.query?.section || router.query?.domain;
    if (['purchases', 'expenses', 'pnl', 'balances'].includes(qSec)) {
      return qSec;
    }
    return 'sales';
  });

  // Sync domain with router query
  useEffect(() => {
    if (!router.isReady) return;
    const sec = router.query?.section || router.query?.domain;
    if (['sales', 'purchases', 'expenses', 'pnl', 'balances'].includes(sec) && domain !== sec) {
      setDomain(sec);
    }
  }, [router.isReady, router.query?.section, router.query?.domain, domain]);

  const handleDomainChange = (newDomain) => {
    setDomain(newDomain);
    router.replace(
      { pathname: '/owner/reports', query: { ...router.query, section: newDomain } },
      undefined,
      { shallow: true }
    );
  };

  const bizNow = getBusinessNow(timezone);
  const getLocalDate = (d = bizNow) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [dateFrom, setDateFrom] = useState(() => `${getLocalDate()}T00:00`);
  const [dateTo, setDateTo] = useState(() => `${getLocalDate()}T23:59`);

  // Superadmin org/terminal filter states
  const [organizations, setOrganizations] = useState([]);
  const [allTerminals, setAllTerminals] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [config, setConfig] = useState(null);

  // Load organisations and terminals for superadmin
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

  // Load config
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
  }, [orgId, isSuperAdmin, selectedOrgId]);

  // Document Viewer Modal State
  const [viewingDoc, setViewingDoc] = useState(null);
  const viewDocument = useCallback(async (tx, type) => {
    if (tx.orderId) {
      try {
        const { data } = await api.get(`/api/v1/orders/${tx.orderId}`);
        if (data?.data) {
          setViewingDoc({ order: data.data, type });
        } else {
          setViewingDoc({ order: tx, type });
        }
      } catch (err) {
        console.warn('Failed to load full order details:', err);
        setViewingDoc({ order: tx, type });
      }
    } else {
      setViewingDoc({ order: tx, type });
    }
  }, []);

  // Voiding Order Modal State
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidingInProgress, setVoidingInProgress] = useState(false);

  const handleVoid = useCallback((inv) => {
    const invoiceId = inv.invoiceId || inv.id;
    if (!invoiceId) return notify('error', 'No order/invoice is linked to this row');
    setVoidingInvoice(inv);
    setVoidReason('');
  }, [notify]);

  const submitVoid = async () => {
    if (!voidingInvoice || voidingInProgress) return;
    const invoiceId = voidingInvoice.invoiceId || voidingInvoice.id;
    setVoidingInProgress(true);
    try {
      await api.post(`/api/v1/reports/invoices/${invoiceId}/void`, { reason: voidReason });
      notify('success', 'Order cancelled successfully');
      publishAccountingDataChanged({
        source: 'reports',
        reason: 'invoice-voided',
        invoiceId,
        orderId: voidingInvoice.orderId || null
      });
      setVoidingInvoice(null);
      setVoidReason('');
    } catch (e) {
      notify('error', e.response?.data?.message || 'Failed to cancel order');
    } finally {
      setVoidingInProgress(false);
    }
  };

  return (
    <DashboardLayout title="Reports & Analytics">
      <div className="rpt-page">
        {/* Top 5 Domain Switcher */}
        <div className="rpt-toggle-container">
          <button
            className={`rpt-toggle-btn ${domain === 'sales' ? 'active' : ''}`}
            onClick={() => handleDomainChange('sales')}
            type="button"
          >
            <FaShoppingBag />
            <span>Sales</span>
          </button>
          {isFeatureEnabled(config, 'purchaseEnabled') && (
            <button
              className={`rpt-toggle-btn ${domain === 'purchases' ? 'active' : ''}`}
              onClick={() => handleDomainChange('purchases')}
              type="button"
            >
              <FaReceipt />
              <span>Purchases</span>
            </button>
          )}
          <button
            className={`rpt-toggle-btn ${domain === 'expenses' ? 'active' : ''}`}
            onClick={() => handleDomainChange('expenses')}
            type="button"
          >
            <FaWallet />
            <span>Expenses</span>
          </button>
          <button
            className={`rpt-toggle-btn ${domain === 'pnl' ? 'active' : ''}`}
            onClick={() => handleDomainChange('pnl')}
            type="button"
          >
            <FaChartLine />
            <span>Profit & Loss</span>
          </button>
          <button
            className={`rpt-toggle-btn ${domain === 'balances' ? 'active' : ''}`}
            onClick={() => handleDomainChange('balances')}
            type="button"
          >
            <FaCoins />
            <span>Payment Balances</span>
          </button>
        </div>

        {/* Global Filter Bar */}
        <div className="rpt-controls">
          <div className="rpt-dates">
            <div className="rpt-dt-field">
              <span className="rpt-filter-lbl">From</span>
              <PremiumDateTimePicker
                value={dateFrom}
                onChange={setDateFrom}
                themeColor="#FF7A00"
              />
            </div>
            <div className="rpt-dt-field">
              <span className="rpt-filter-lbl">To</span>
              <PremiumDateTimePicker
                value={dateTo}
                onChange={setDateTo}
                themeColor="#FF7A00"
              />
            </div>
          </div>

          {isSuperAdmin && (
            <div className="rpt-sa-filters">
              <div className="rpt-sa-item">
                <label className="rpt-sa-label"><FaBuilding /> Branch</label>
                <NiceSelect
                  value={selectedOrgId}
                  onChange={handleOrgChange}
                  options={[
                    { value: '', label: 'All Branches' },
                    ...organizations.map(o => ({ value: o.id, label: o.name }))
                  ]}
                  placeholder="All Branches"
                  style={{ minWidth: 140 }}
                />
              </div>
              <div className="rpt-sa-item">
                <label className="rpt-sa-label">Terminal</label>
                <NiceSelect
                  value={selectedTerminalId}
                  onChange={setSelectedTerminalId}
                  options={[
                    { value: '', label: 'All Terminals' },
                    ...filteredTerminals.map(t => ({
                      value: t.id,
                      label: `${t.name || t.terminalCode}${t.organization ? ` (${t.organization.name})` : ''}`
                    }))
                  ]}
                  placeholder="All Terminals"
                  style={{ minWidth: 140 }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Domain View Components */}
        {domain === 'sales' && (
          <SalesReportView
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedOrgId={selectedOrgId}
            selectedTerminalId={selectedTerminalId}
            config={config}
            isSuperAdmin={isSuperAdmin}
            timezone={timezone}
            onViewDoc={viewDocument}
            onVoidInvoice={handleVoid}
            toInstant={toInstant}
            reportErrorMessage={reportErrorMessage}
          />
        )}

        {domain === 'purchases' && (
          <PurchaseReportView
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedOrgId={selectedOrgId}
            selectedTerminalId={selectedTerminalId}
            config={config}
            isSuperAdmin={isSuperAdmin}
            timezone={timezone}
            onViewDoc={viewDocument}
            toInstant={toInstant}
            reportErrorMessage={reportErrorMessage}
          />
        )}

        {domain === 'expenses' && (
          <ExpenseReportView
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedOrgId={selectedOrgId}
            selectedTerminalId={selectedTerminalId}
            config={config}
            isSuperAdmin={isSuperAdmin}
            timezone={timezone}
            toInstant={toInstant}
            reportErrorMessage={reportErrorMessage}
          />
        )}

        {domain === 'pnl' && (
          <PnLReportView
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedOrgId={selectedOrgId}
            selectedTerminalId={selectedTerminalId}
            config={config}
            isSuperAdmin={isSuperAdmin}
            toInstant={toInstant}
            reportErrorMessage={reportErrorMessage}
            timezone={timezone}
          />
        )}

        {domain === 'balances' && (
          <PaymentTypeBalanceReport
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedOrgId={selectedOrgId}
            selectedTerminalId={selectedTerminalId}
            config={config}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* Document Viewer Modal */}
        {viewingDoc && (
          <DocumentViewerPopup
            order={viewingDoc.order}
            type={viewingDoc.type}
            onClose={() => setViewingDoc(null)}
          />
        )}

        {/* Void Order Confirmation Modal */}
        {voidingInvoice && (
          <div className="rpt-modal-overlay">
            <div className="rpt-modal">
              <div className="rpt-modal-hdr">
                <FaBan style={{ color: '#ef4444' }} />
                <h3>Cancel Order</h3>
              </div>
              <p>
                Are you sure you want to cancel order <strong>#{voidingInvoice.orderNumber || voidingInvoice.invoiceNumber || voidingInvoice.id}</strong>?
                This will void the transaction and reverse accounting balances.
              </p>
              <label>Reason for cancellation (optional):</label>
              <textarea
                rows={3}
                placeholder="e.g. Customer changed mind, wrong items entered..."
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
              />
              <div className="rpt-modal-actions">
                <button
                  type="button"
                  className="rpt-modal-btn rpt-modal-btn-outline"
                  onClick={() => setVoidingInvoice(null)}
                  disabled={voidingInProgress}
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  className="rpt-modal-btn rpt-modal-btn-danger"
                  onClick={submitVoid}
                  disabled={voidingInProgress}
                >
                  {voidingInProgress ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .rpt-page {
          padding: 0 4px;
          animation: fadeIn 0.2s ease-out;
        }
        .rpt-toggle-container {
          display: flex;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 4px;
          gap: 4px;
          width: 100%;
          max-width: 900px;
          margin: 0 auto 18px auto;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          flex-wrap: nowrap;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .rpt-toggle-container::-webkit-scrollbar {
          display: none;
        }
        .rpt-toggle-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 16px;
          height: 38px;
          border: none;
          background: transparent;
          color: #64748b;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 12px;
          white-space: nowrap;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .rpt-toggle-btn:hover {
          color: #334155;
        }
        .rpt-toggle-btn.active {
          background: #f97316;
          color: white !important;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
        }
        .rpt-toggle-btn.active svg,
        .rpt-toggle-btn.active span {
          color: white !important;
        }
        .rpt-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: nowrap;
          background: #ffffff;
          padding: 8px 16px;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .rpt-controls::-webkit-scrollbar {
          display: none;
        }
        .rpt-dates {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: nowrap;
          flex-shrink: 0;
        }
        .rpt-dt-field {
          display: flex;
          align-items: center;
          gap: 7px;
          white-space: nowrap;
        }
        .rpt-filter-lbl {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          white-space: nowrap;
        }
        .rpt-dt-field :global(.premium-dt-picker) {
          width: 200px !important;
          flex-shrink: 0;
        }
        .rpt-dt-field :global(.dt-trigger) {
          height: 38px;
          padding: 6px 12px;
          border-radius: 10px;
        }
        .rpt-dt-field :global(.dt-input) {
          font-size: 12px;
          font-weight: 600;
        }
        .rpt-sa-filters {
          display: flex;
          gap: 14px;
          align-items: center;
          flex-wrap: nowrap;
          flex-shrink: 0;
        }
        .rpt-sa-item {
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .rpt-sa-label {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }
        .rpt-sa-item :global(button) {
          height: 38px !important;
          padding: 6px 12px !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
        }
        .rpt-modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(15,23,42,0.4);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 12px;
        }
        .rpt-modal {
          background: white;
          padding: 24px;
          border-radius: 18px;
          max-width: 380px;
          width: 100%;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .rpt-modal-hdr {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .rpt-modal h3 {
          font-size: 17px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        .rpt-modal p {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
          margin-bottom: 16px;
        }
        .rpt-modal label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          display: block;
          margin-bottom: 6px;
        }
        .rpt-modal textarea {
          width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          outline: none;
          background: #f8fafc;
          color: #1e293b;
          margin-bottom: 20px;
          box-sizing: border-box;
        }
        .rpt-modal-actions {
          display: flex;
          gap: 10px;
        }
        .rpt-modal-btn {
          flex: 1;
          height: 40px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
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
        .rpt-modal-btn-danger {
          background: #ef4444;
          color: #fff;
        }
        .rpt-modal-btn-danger:hover {
          background: #dc2626;
        }
        .rpt-modal-btn-danger:disabled {
          background: #fecaca;
          cursor: not-allowed;
        }
        @media(max-width: 768px) {
          .rpt-page { padding: 0 4px; }
          .rpt-toggle-container { max-width: 100%; margin-bottom: 12px; }
          .rpt-toggle-btn { padding: 4px 10px; height: 32px; font-size: 11.5px; gap: 4px; }
          .rpt-controls { padding: 8px 12px; gap: 10px; }
          .rpt-dt-field :global(.premium-dt-picker) { width: 180px !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
