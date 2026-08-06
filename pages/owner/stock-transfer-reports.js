import React, { useState, useEffect, useMemo } from 'react';
import Cookies from 'js-cookie';


import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import ReportTable from '../../components/ReportTable';
import CafeQRPopup from '../../components/CafeQRPopup';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import { generateStockTransferPdf } from '../../utils/stockTransferPdf';
import { 
  FaSearch, FaExchangeAlt, FaEye, FaPrint, FaBan, FaCheckCircle
} from 'react-icons/fa';

import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import StockDocumentViewerPopup from '../../components/purchasing/StockDocumentViewerPopup';

export default function StockTransferReportsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Stock">
      <ModuleGate>
        <TransferReportContent />
      </ModuleGate>
    </RoleGate>
  );
}

function TransferReportContent() {
  const { timezone, orgId, userRole } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState('');
  const [toWarehouseFilter, setToWarehouseFilter] = useState('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const PAGE_SIZE = 50;

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
      const [tResp, wResp] = await Promise.all([
        api.get(`/api/v1/inventory/transfers?page=${pageNum}&size=${PAGE_SIZE}`),
        api.get('/api/v1/warehouses')
      ]);
      if (tResp.data.success) {
        const pageData = tResp.data.data;
        setTransfers(pageData.content || []);
        setTotalPages(pageData.totalPages || 0);
        setTotalElements(pageData.totalElements || 0);
        setPage(pageNum);
      }
      if (wResp.data.success) setWarehouses(wResp.data.data || []);
    } catch (err) {
      console.error("Failed to fetch transfer report data:", err);
    } finally {
      setLoading(false);
    }
  };



  const getWarehouseName = (id) => warehouses.find(wh => wh.id === id)?.name || '—';

  const filteredTransfers = transfers.filter(t => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || 
      (t.transferNumber && t.transferNumber.toLowerCase().includes(q)) ||
      getWarehouseName(t.sourceWarehouseId).toLowerCase().includes(q) ||
      getWarehouseName(t.destWarehouseId).toLowerCase().includes(q) ||
      (t.lines || []).some(l => (l.productName || l.productId || '').toLowerCase().includes(q)) ||
      (t.notes && t.notes.toLowerCase().includes(q));

    const matchFromWh = !fromWarehouseFilter || String(t.sourceWarehouseId) === String(fromWarehouseFilter);
    const matchToWh = !toWarehouseFilter || String(t.destWarehouseId) === String(toWarehouseFilter);

    let matchDate = true;
    if (dateFrom) matchDate = new Date(t.transferDate) >= new Date(dateFrom);
    if (dateTo && matchDate) {
      const endDate = new Date(dateTo);
      if (!String(dateTo).includes('T')) {
        endDate.setHours(23, 59, 59, 999);
      }
      matchDate = new Date(t.transferDate) <= endDate;
    }

    return matchSearch && matchFromWh && matchToWh && matchDate;
  });

  const getStatusBadge = (status) => {
    const map = {
      'DRAFT': { bg: '#f8fafc', color: '#64748b', label: 'Draft' },
      'IN_TRANSIT': { bg: '#fff7ed', color: '#ea580c', label: 'In Transit' },
      'COMPLETED': { bg: '#ecfdf5', color: '#059669', label: 'Completed' },
      'CANCELLED': { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' }
    };
    const s = map[status] || { bg: '#f8fafc', color: '#64748b', label: status ? status.replace(/_/g, ' ') : 'Draft' };
    return (
      <span className="status-badge" style={{ background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  };

  const activeOrgId = orgId || Cookies.get('orgId');

  const sourceWarehouses = useMemo(() => {
    if (!activeOrgId) return warehouses;
    return warehouses.filter(w => {
      const wOrg = String(w.organizationId || w.organization_id || w.orgId || w.org_id || w.organization?.id || '');
      return !wOrg || String(wOrg) === String(activeOrgId);
    });
  }, [warehouses, activeOrgId]);

  const fromWarehouseOptions = useMemo(() => [
    { value: '', label: 'All Source Warehouses' },
    ...sourceWarehouses.map(w => ({ value: w.id, label: w.name }))
  ], [sourceWarehouses]);

  const toWarehouseOptions = useMemo(() => [
    { value: '', label: 'All Target Warehouses' },
    ...warehouses.map(w => ({ value: w.id, label: w.name }))
  ], [warehouses]);




  const [viewingDoc, setViewingDoc] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [voidingDoc, setVoidingDoc] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleVoidTransfer = async () => {
    if (!voidingDoc) return;
    setVoiding(true);
    try {
      await api.put(`/api/v1/inventory/transfers/${voidingDoc.id}`, { ...voidingDoc, status: 'CANCELLED' });
      showToast(`Transfer ${voidingDoc.transferNumber || ''} voided successfully!`, 'success');
      setTransfers(prev => prev.map(t => t.id === voidingDoc.id ? { ...t, status: 'CANCELLED' } : t));
      setVoidingDoc(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to void transfer', 'error');
    } finally {
      setVoiding(false);
    }
  };

  const columns = [
    {
      key: 'transferNumber', label: 'Transfer #',
      render: (row) => (
        <span 
          className="doc-no-link" 
          style={{ cursor: 'pointer', color: '#ea580c', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}
          onClick={() => setViewingDoc(row)}
          title="Click to view transfer document"
        >
          {row.transferNumber}
        </span>
      )
    },
    {
      key: 'transferDate', label: 'Date',
      render: (row) => (
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
          {formatTzDate(row.transferDate, timezone, { format: 'date' })}
          {' '}
          <span style={{ color: '#64748b', fontWeight: 500 }}>
            {formatTzDate(row.transferDate, timezone, { format: 'time' })}
          </span>
        </span>
      )
    },
    {
      key: 'source', label: 'Source',
      render: (row) => <span className="wh-name">{getWarehouseName(row.sourceWarehouseId)}</span>
    },
    {
      key: 'arrow', label: '', width: '40px',
      render: () => <FaExchangeAlt style={{ color: '#f97316', fontSize: 14 }} />
    },
    {
      key: 'dest', label: 'Destination',
      render: (row) => <span className="wh-name">{getWarehouseName(row.destWarehouseId)}</span>
    },
    {
      key: 'items', label: 'Items', align: 'center',
      render: (row) => <span className="item-pill">{row.lines?.length || 0}</span>
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
        const wh = warehouses.find(w => String(w.id) === String(row.sourceWarehouseId));
        const sourceOrgId = row.orgId || wh?.orgId || wh?.org_id || wh?.organizationId;
        const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';
        const isSourceOrg = isSuperAdmin || (orgId && String(sourceOrgId) === String(orgId));
        const isCancelled = row.status === 'CANCELLED' || row.status === 'VOIDED';

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            {/* Eye — toggles inline lines panel */}
            <button
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '10px',
                background: expanded === row.id ? '#dbeafe' : '#eff6ff',
                color: '#2563eb', border: expanded === row.id ? '1px solid #93c5fd' : '1px solid #bfdbfe',
                fontSize: '15px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease', flexShrink: 0
              }}
              title="View Transfer Lines"
              onClick={(e) => { e.stopPropagation(); setExpanded(prev => prev === row.id ? null : row.id); }}
            >
              <FaEye />
            </button>

            {/* Void — only source org & not already cancelled */}
            {isSourceOrg && !isCancelled && (
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                  fontSize: '15px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease', flexShrink: 0
                }}
                title="Void / Cancel Transfer"
                onClick={(e) => { e.stopPropagation(); setVoidingDoc(row); }}
              >
                <FaBan />
              </button>
            )}

            {/* Print — always visible, generates PDF directly */}
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

  if (loading) return <div className="loading-state-premium"><span>Compiling Transfer Reports...</span></div>;

  return (
    <DashboardLayout title="Transfer Reports" showBack={true}>
      <div className="report-container">

        {/* Filters Bar matching Sales History UI - All in 1 Line */}
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
              options={fromWarehouseOptions}
              value={fromWarehouseFilter}
              onChange={(val) => setFromWarehouseFilter(val)}
            />
          </div>

          <div className="wh-filter-group">
            <NiceSelect 
              options={toWarehouseOptions}
              value={toWarehouseFilter}
              onChange={(val) => setToWarehouseFilter(val)}
            />
          </div>


          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search transfer #, product, notes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Report Table with inline expanded lines row */}
        <ReportTable
          columns={columns}
          data={filteredTransfers}
          emptyIcon={<FaExchangeAlt />}
          emptyTitle="No transfers found"
          emptyText="Adjust your filters or create a new stock transfer."
          accentColor="#f97316"
          expandedRowId={expanded}
          expandedRowContent={(row) => (
            <div style={{ background: '#fffbf5', padding: '14px 20px 14px 48px', borderTop: '1px solid #fed7aa', borderBottom: '1px solid #fed7aa' }}>
              {/* Inner card */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(249,115,22,0.06)' }}>
                {/* Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#ffffff' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316', width: '36px' }}>#</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Product</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>SKU</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Category</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Qty</th>
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
                            <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', fontSize: '12px', fontWeight: 800, padding: '3px 10px', borderRadius: '6px', display: 'inline-block', minWidth: '32px', textAlign: 'center' }}>{line.transferQuantity}</span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ padding: '24px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, fontSize: '13px' }}>
                          No line items found for this transfer.
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
          <span>Showing {filteredTransfers.length} of {totalElements || transfers.length} transfers</span>
        </div>

        {viewingDoc && (
          <StockDocumentViewerPopup
            doc={viewingDoc}
            docType="stock_transfer"
            warehouses={warehouses}
            products={[]}
            timezone={timezone}
            formatTzDate={formatTzDate}
            onClose={() => setViewingDoc(null)}
          />
        )}

        {/* Void Confirmation Modal */}
        {voidingDoc && (
          <CafeQRPopup
            title={`Void Transfer ${voidingDoc.transferNumber || ''}`}
            subtitle="Are you sure you want to void this stock transfer?"
            maxWidth="500px"
            onClose={() => setVoidingDoc(null)}
            hideFooter={true}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                Voiding <strong>{voidingDoc.transferNumber}</strong> will cancel the shipment record and revert stock balances. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  style={{ background: '#f1f5f9', border: 'none', color: '#475569', padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setVoidingDoc(null)}
                >
                  Cancel
                </button>
                <button
                  style={{ background: '#dc2626', color: 'white', border: 'none', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: voiding ? 'not-allowed' : 'pointer', opacity: voiding ? 0.6 : 1 }}
                  disabled={voiding}
                  onClick={handleVoidTransfer}
                >
                  {voiding ? 'Voiding...' : 'Yes, Void Transfer'}
                </button>
              </div>
            </div>
          </CafeQRPopup>
        )}

        {toast && (
          <div className={`tc-toast ${toast.type}`} onClick={() => setToast(null)}>
            {toast.type === 'success' ? <FaCheckCircle /> : '⚠'}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .report-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .report-container { padding: 0 16px 24px; } }

        .filters-bar { background: white; border-radius: 16px; padding: 14px 20px; border: 1px solid #edf2f7; border-top: 3px solid #f97316; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); flex-wrap: nowrap; overflow-x: auto; }
        .search-box { position: relative; flex: 1; min-width: 180px; }
        .search-box .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #f97316; }
        .search-box input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px 10px 42px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #1e293b; transition: 0.2s; }
        .search-box input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15); }

        .hist-dates { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .h-filter-sep { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: lowercase; }

        .wh-filter-group { flex-shrink: 0; min-width: 170px; }
        .wh-filter-group select:focus { border-color: #f97316; background: white; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15); }

        .mono-id { font-size: 13px; font-weight: 900; color: #f97316; font-family: 'SF Mono', 'Menlo', monospace; }
        .dt-cell { display: flex; flex-direction: column; gap: 2px; }
        .dt-cell .d { font-weight: 700; color: #1e293b; font-size: 13px; }
        .dt-cell .t { font-weight: 600; color: #94a3b8; font-size: 11px; }
        .wh-name { font-size: 13px; font-weight: 800; color: #1e293b; }
        .item-pill { font-size: 12px; font-weight: 800; color: #ea580c; background: #fff7ed; padding: 4px 10px; border-radius: 8px; }
        .notes-text { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .status-badge { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; text-transform: capitalize; white-space: nowrap; }

        /* Lines Panel */
        .lines-panel { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; margin-top: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
        .lines-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .lines-panel-title { font-size: 13px; font-weight: 700; color: #334155; }
        .lines-close-btn { background: transparent; border: none; color: #64748b; font-size: 14px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
        .lines-close-btn:hover { color: #0f172a; background: #f1f5f9; }
        .lines-table { width: 100%; border-collapse: collapse; }
        .lines-table th { padding: 12px 18px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #f97316; background: #ffffff; }
        .lines-table td { padding: 12px 18px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; }
        .lines-table tr:last-child td { border-bottom: none; }
        .r { text-align: right; }
        .td-num { color: #94a3b8; font-weight: 600; width: 40px; }
        .td-name { font-weight: 600; color: #1e293b; }
        .td-sku { color: #94a3b8; font-size: 12px; font-family: monospace; }
        .td-cat { color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .qty-badge { background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; display: inline-block; }

        .report-footer { padding: 16px 0; text-align: center; }
        .report-footer span { font-size: 12px; font-weight: 700; color: #94a3b8; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }

        .pagination-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 16px 0 4px; }
        .pg-btn { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; color: #f97316; cursor: pointer; transition: all 0.2s; }
        .pg-btn:hover:not(:disabled) { background: #fff7ed; border-color: #f97316; }
        .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pg-info { font-size: 13px; font-weight: 700; color: #64748b; }

        .tc-toast { position: fixed; bottom: 24px; right: 24px; display: flex; align-items: center; gap: 10px; background: #1e293b; color: white; padding: 14px 20px; border-radius: 14px; font-size: 13px; font-weight: 700; box-shadow: 0 8px 30px rgba(0,0,0,0.25); z-index: 9999; cursor: pointer; animation: slideIn 0.3s ease; max-width: 340px; }
        .tc-toast.success svg { color: #f97316; }
        .tc-toast.error { background: #7f1d1d; }
        @keyframes slideIn { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </DashboardLayout>
  );
}
