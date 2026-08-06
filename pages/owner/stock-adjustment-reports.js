import React, { useState, useEffect, useMemo } from 'react';
import Cookies from 'js-cookie';
import NiceSelect from '../../components/NiceSelect';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import StockDocumentViewerPopup from '../../components/purchasing/StockDocumentViewerPopup';
import CafeQRPopup from '../../components/CafeQRPopup';
import { generateStockTransferPdf } from '../../utils/stockTransferPdf';

import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import ReportTable from '../../components/ReportTable';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import { 
  FaClipboardList, FaSearch, FaCalendarAlt, FaCheckCircle,
  FaClock, FaBalanceScale, FaExclamationTriangle,
  FaTrash, FaTimesCircle, FaBug, FaEye, FaPrint, FaBan
} from 'react-icons/fa';



export default function StockAdjustmentReportsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Stock">
      <ModuleGate>
        <AdjustmentReportContent />
      </ModuleGate>
    </RoleGate>
  );
}

function AdjustmentReportContent() {
  const { timezone, orgId, userRole } = useAuth();

  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [adjustments, setAdjustments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const PAGE_SIZE = 50;

  const [viewingDoc, setViewingDoc] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [voidingDoc, setVoidingDoc] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleVoidAdjustment = async () => {
    if (!voidingDoc) return;
    setVoiding(true);
    try {
      await api.put(`/api/v1/inventory/adjustments/${voidingDoc.id}`, { ...voidingDoc, status: 'CANCELLED' });
      showToast(`Adjustment ${voidingDoc.adjustmentNumber || ''} voided successfully!`, 'success');
      setAdjustments(prev => prev.map(a => a.id === voidingDoc.id ? { ...a, status: 'CANCELLED' } : a));
      setVoidingDoc(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to void adjustment', 'error');
    } finally {
      setVoiding(false);
    }
  };


  const getTodayStartStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00`;
  };

  const getTodayEndStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T23:59`;
  };

  const [dateFrom, setDateFrom] = useState(getTodayStartStr());
  const [dateTo, setDateTo] = useState(getTodayEndStr());

  useEffect(() => {
    fetchData(0);
  }, [orgId]);

  const fetchData = async (pageNum = 0) => {
    try {
      const [aResp, wResp] = await Promise.all([
        api.get(`/api/v1/inventory/adjustments?page=${pageNum}&size=${PAGE_SIZE}`),
        api.get('/api/v1/warehouses')
      ]);
      if (aResp.data.success) {
        const pageData = aResp.data.data;
        setAdjustments(pageData.content || []);
        setTotalPages(pageData.totalPages || 0);
        setTotalElements(pageData.totalElements || 0);
        setPage(pageNum);
      }
      if (wResp.data.success) setWarehouses(wResp.data.data || []);
    } catch (err) {
      console.error("Failed to fetch adjustment report data:", err);
    } finally {
      setLoading(false);
    }
  };



  const getWarehouseName = (id) => warehouses.find(wh => wh.id === id)?.name || '—';

  const activeOrgId = orgId || Cookies.get('orgId');


  const filteredWarehouses = useMemo(() => {
    if (!activeOrgId) return warehouses;
    return warehouses.filter(w => {
      const wOrg = String(w.organizationId || w.organization_id || w.orgId || w.org_id || w.organization?.id || '');
      return !wOrg || String(wOrg) === String(activeOrgId);
    });
  }, [warehouses, activeOrgId]);

  const warehouseOptions = useMemo(() => [
    { value: '', label: 'All Warehouses' },
    ...filteredWarehouses.map(w => ({ value: w.id, label: w.name }))
  ], [filteredWarehouses]);



  const filteredAdjustments = adjustments.filter(a => {
    const q = (searchTerm || '').toLowerCase();
    const matchSearch = !q ||
      (a.adjustmentNumber || '').toLowerCase().includes(q) ||
      getWarehouseName(a.warehouseId).toLowerCase().includes(q) ||
      (a.notes || '').toLowerCase().includes(q) ||
      (a.lines || []).some(l => (l.productName || l.sku || '').toLowerCase().includes(q));
    const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const matchReason = reasonFilter === 'ALL' || a.reason === reasonFilter;
    const matchWh = !warehouseFilter || String(a.warehouseId) === String(warehouseFilter);
    let matchDate = true;
    if (dateFrom) matchDate = new Date(a.adjustmentDate) >= new Date(dateFrom);
    if (dateTo && matchDate) {
      const endDate = new Date(dateTo);
      if (!String(dateTo).includes('T')) {
        endDate.setHours(23, 59, 59, 999);
      }
      matchDate = new Date(a.adjustmentDate) <= endDate;
    }

    return matchSearch && matchStatus && matchReason && matchWh && matchDate;
  });



  const statusCounts = {
    ALL: adjustments.length,
    DRAFT: adjustments.filter(a => a.status === 'DRAFT').length,
    COMPLETED: adjustments.filter(a => a.status === 'COMPLETED').length
  };

  const reasonCounts = {
    ALL: adjustments.length,
    AUDIT: adjustments.filter(a => a.reason === 'AUDIT').length,
    WASTAGE: adjustments.filter(a => a.reason === 'WASTAGE').length,
    DAMAGE: adjustments.filter(a => a.reason === 'DAMAGE').length,
    EXPIRY: adjustments.filter(a => a.reason === 'EXPIRY').length
  };

  const getStatusBadge = (status) => {
    const map = {
      'DRAFT': { bg: '#f8fafc', color: '#64748b' },
      'COMPLETED': { bg: '#ecfdf5', color: '#059669' }
    };
    const s = map[status] || map['DRAFT'];
    return (
      <span className="badge" style={{ background: s.bg, color: s.color }}>
        {status}
      </span>
    );
  };

  const getReasonBadge = (reason) => {
    const map = {
      'AUDIT': { bg: '#eff6ff', color: '#2563eb' },
      'WASTAGE': { bg: '#fef3c7', color: '#b45309' },
      'DAMAGE': { bg: '#fef2f2', color: '#dc2626' },
      'EXPIRY': { bg: '#fdf4ff', color: '#a21caf' }
    };
    const r = map[reason] || { bg: '#f1f5f9', color: '#475569' };
    return (
      <span className="badge" style={{ background: r.bg, color: r.color }}>
        {reason}
      </span>
    );
  };


  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setReasonFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const getTotalQtyChange = (adj) => {
    if (!adj.lines || adj.lines.length === 0) return 0;
    return adj.lines.reduce((sum, l) => sum + (l.quantityChange || 0), 0);
  };

  // Define columns for the shared ReportTable
  const columns = [
    {
      key: 'adjustmentNumber', label: 'Adjustment #',
      render: (row) => (
        <span 
          className="doc-no-link" 
          style={{ cursor: 'pointer', color: '#ea580c', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}
          onClick={() => setViewingDoc(row)}
          title="Click to view adjustment document"
        >
          {row.adjustmentNumber}
        </span>
      )
    },
    {
      key: 'adjustmentDate', label: 'Date',
      render: (row) => (
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
          {formatTzDate(row.adjustmentDate, timezone, { format: 'date' })}
          {' '}
          <span style={{ color: '#64748b', fontWeight: 500 }}>
            {formatTzDate(row.adjustmentDate, timezone, { format: 'time' })}
          </span>
        </span>
      )
    },
    {
      key: 'warehouse', label: 'Warehouse',
      render: (row) => <span className="wh-name">{getWarehouseName(row.warehouseId)}</span>
    },
    {
      key: 'reason', label: 'Reason',
      render: (row) => getReasonBadge(row.reason)
    },
    {
      key: 'items', label: 'Items', align: 'center',
      render: (row) => <span className="item-pill">{row.lines?.length || 0}</span>
    },
    {
      key: 'netQty', label: 'Net Qty', align: 'right',
      render: (row) => {
        const val = getTotalQtyChange(row);
        return (
          <span className={`qty-change ${val > 0 ? 'pos' : val < 0 ? 'neg' : 'neu'}`}>
            {val > 0 ? '+' : ''}{val}
          </span>
        );
      }
    },
    {
      key: 'status', label: 'Status',
      render: (row) => getStatusBadge(row.status)
    },
    {
      key: 'notes', label: 'Notes',
      render: (row) => <span className="notes-text">{row.notes?.slice(0, 30) || '—'}{row.notes?.length > 30 ? '...' : ''}</span>
    },
    {
      key: 'action', label: 'ACTIONS', align: 'right',
      render: (row) => {
        const wh = warehouses.find(w => String(w.id) === String(row.warehouseId));
        const adjOrgId = row.orgId || wh?.orgId || wh?.org_id || wh?.organizationId;
        const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';
        const isUserOrg = isSuperAdmin || (orgId && String(adjOrgId) === String(orgId));
        const isCancelled = row.status === 'CANCELLED' || row.status === 'VOIDED';

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '10px',
                background: expanded === row.id ? '#dbeafe' : '#eff6ff',
                color: '#2563eb', border: expanded === row.id ? '1px solid #93c5fd' : '1px solid #bfdbfe',
                fontSize: '15px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease', flexShrink: 0
              }}
              title="View Adjustment Lines"
              onClick={(e) => { e.stopPropagation(); setExpanded(prev => prev === row.id ? null : row.id); }}
            >
              <FaEye />
            </button>

            {isUserOrg && !isCancelled && (
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                  fontSize: '15px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease', flexShrink: 0
                }}
                title="Void / Cancel Adjustment"
                onClick={(e) => { e.stopPropagation(); setVoidingDoc(row); }}
              >
                <FaBan />
              </button>
            )}

            <button
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '10px',
                background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1',
                fontSize: '15px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease', flexShrink: 0
              }}
              title="Print / Export PDF"
              onClick={(e) => { e.stopPropagation(); generateStockTransferPdf(row, warehouses, []); }}
            >
              <FaPrint />
            </button>
          </div>
        );
      }
    }
  ];

  if (loading) return <div className="loading-state-premium"><span>Compiling Adjustment Reports...</span></div>;

  return (
    <DashboardLayout title="Adjustment Reports" showBack={true}>
      <div className="report-container">
        {/* Filters Bar matching Stock Transfer UI - All in 1 Line */}
        <div className="filters-bar">
          <div className="hist-dates">
            <PremiumDateTimePicker 
              value={dateFrom} 
              onChange={(val) => setDateFrom(val)} 
              themeColor="#f97316"
            />
            <span className="h-filter-sep">to</span>
            <PremiumDateTimePicker 
              value={dateTo} 
              onChange={(val) => setDateTo(val)} 
              themeColor="#f97316"
            />
          </div>

          <div className="wh-filter-group">
            <NiceSelect 
              options={warehouseOptions}
              value={warehouseFilter}
              onChange={(val) => setWarehouseFilter(val)}
            />
          </div>

          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by adjustment # or warehouse..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Report Table (shared component) */}
        <ReportTable
          columns={columns}
          data={filteredAdjustments}
          emptyIcon={<FaBalanceScale />}
          emptyTitle="No adjustments found"
          emptyText="Adjust your filters or create a new stock adjustment."
          accentColor="#f97316"
          expandedRowId={expanded}
          expandedRowContent={(row) => (
            <div style={{ background: '#fffbf5', padding: '14px 20px 14px 48px', borderTop: '1px solid #fed7aa', borderBottom: '1px solid #fed7aa' }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(249,115,22,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#ffffff' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316', width: '36px' }}>#</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Product</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>SKU</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Category</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Qty Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(row.lines && row.lines.length > 0) ? (
                      row.lines.map((line, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                          <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>{i + 1}</td>
                          <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{line.productName || `Product #${i + 1}`}</td>
                          <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{line.sku || '—'}</td>
                          <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{line.categoryName || '—'}</td>
                          <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                            <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', fontSize: '12px', fontWeight: 800, padding: '3px 10px', borderRadius: '6px', display: 'inline-block', minWidth: '32px', textAlign: 'center' }}>
                              {line.quantityChange > 0 ? `+${line.quantityChange}` : line.quantityChange}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ padding: '24px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, fontSize: '13px' }}>
                          No line items found for this adjustment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        />

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <button className="pg-btn" disabled={page === 0} onClick={() => fetchData(page - 1)}>← Prev</button>
            <span className="pg-info">Page {page + 1} of {totalPages} &nbsp;·&nbsp; {totalElements} total</span>
            <button className="pg-btn" disabled={page >= totalPages - 1} onClick={() => fetchData(page + 1)}>Next →</button>
          </div>
        )}

        <div className="report-footer">
          <span>Showing {filteredAdjustments.length} of {totalElements || adjustments.length} adjustments</span>
        </div>

        {/* Popups */}
        {viewingDoc && (
          <StockDocumentViewerPopup
            doc={viewingDoc}
            timezone={timezone}
            formatTzDate={formatTzDate}
            onClose={() => setViewingDoc(null)}
          />
        )}

        {voidingDoc && (
          <CafeQRPopup
            isOpen={true}
            type="warning"
            title="Void Stock Adjustment?"
            message={`Are you sure you want to void adjustment ${voidingDoc.adjustmentNumber}? This action will reverse/cancel this adjustment.`}
            confirmText={voiding ? "Voiding..." : "Yes, Void Adjustment"}
            cancelText="Cancel"
            onConfirm={handleVoidAdjustment}
            onCancel={() => setVoidingDoc(null)}
          />
        )}
      </div>

      {toast && (
        <div className={`tc-toast ${toast.type}`} onClick={() => setToast(null)}>
          {toast.type === "success" ? <FaCheckCircle /> : "⚠"}
          <span>{toast.msg}</span>
        </div>
      )}

      <style jsx>{`

        .report-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .report-container { padding: 0 16px 24px; } }

        /* Filters Bar */
        .filters-bar { background: white; border-radius: 16px; padding: 14px 20px; border: 1px solid #edf2f7; border-top: 3px solid #f97316; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); flex-wrap: nowrap; overflow-x: auto; }
        .search-box { position: relative; width: 320px; flex-shrink: 0; margin-left: auto; }
        .search-box .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #f97316; font-size: 13px; }
        .search-box input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px 8px 36px; border-radius: 10px; font-size: 12px; font-weight: 600; color: #1e293b; transition: 0.2s; box-sizing: border-box; }
        .search-box input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15); }

        .hist-dates { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .h-filter-sep { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: lowercase; }

        .wh-filter-group { flex-shrink: 0; min-width: 170px; }

        .mono-id { font-size: 13px; font-weight: 900; color: #f97316; font-family: 'SF Mono', 'Menlo', monospace; }
        .dt-cell { display: flex; flex-direction: column; gap: 2px; }
        .dt-cell .d { font-weight: 700; color: #1e293b; font-size: 13px; }
        .dt-cell .t { font-weight: 600; color: #94a3b8; font-size: 11px; }
        .wh-name { font-size: 13px; font-weight: 800; color: #1e293b; }
        .item-pill { font-size: 12px; font-weight: 800; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 8px; }
        .notes-text { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .qty-change { font-family: 'SF Mono', 'Menlo', monospace; font-size: 15px; font-weight: 900; }
        .qty-change.pos { color: #10b981; }
        .qty-change.neg { color: #ef4444; }
        .qty-change.neu { color: #64748b; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; white-space: nowrap; }

        .report-footer { padding: 16px 0; text-align: center; }
        .report-footer span { font-size: 12px; font-weight: 700; color: #94a3b8; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }

        .pagination-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 16px 0 4px; }
        .pg-btn { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; color: #f97316; cursor: pointer; transition: all 0.2s; }
        .pg-btn:hover:not(:disabled) { background: #fff7ed; border-color: #f97316; }
        .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pg-info { font-size: 13px; font-weight: 700; color: #64748b; }
      `}</style>

    </DashboardLayout>
  );
}
