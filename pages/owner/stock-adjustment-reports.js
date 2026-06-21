import React, { useState, useEffect } from 'react';
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
  FaTrash, FaTimesCircle, FaBug
} from 'react-icons/fa';

export default function StockAdjustmentReportsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']} requiredMenu="Stock">
      <ModuleGate>
        <AdjustmentReportContent />
      </ModuleGate>
    </RoleGate>
  );
}

function AdjustmentReportContent() {
  const { timezone, orgId } = useAuth();
  const [adjustments, setAdjustments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [dateFrom, setDateFrom] = useState(getTodayStr());
  const [dateTo, setDateTo] = useState(getTodayStr());

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const fetchData = async () => {
    try {
      const [aResp, wResp] = await Promise.all([
        api.get('/api/v1/inventory/adjustments'),
        api.get('/api/v1/warehouses')
      ]);
      if (aResp.data.success) setAdjustments(aResp.data.data || []);
      if (wResp.data.success) setWarehouses(wResp.data.data || []);
    } catch (err) {
      console.error("Failed to fetch adjustment report data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getWarehouseName = (id) => warehouses.find(wh => wh.id === id)?.name || '—';

  const filteredAdjustments = adjustments.filter(a => {
    const matchSearch = a.adjustmentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getWarehouseName(a.warehouseId).toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const matchReason = reasonFilter === 'ALL' || a.reason === reasonFilter;
    let matchDate = true;
    if (dateFrom) matchDate = new Date(a.adjustmentDate) >= new Date(dateFrom);
    if (dateTo && matchDate) matchDate = new Date(a.adjustmentDate) <= new Date(dateTo + 'T23:59:59');
    return matchSearch && matchStatus && matchReason && matchDate;
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
      'DRAFT': { bg: '#f8fafc', color: '#64748b', icon: <FaClock /> },
      'COMPLETED': { bg: '#ecfdf5', color: '#059669', icon: <FaCheckCircle /> }
    };
    const s = map[status] || map['DRAFT'];
    return (
      <span className="badge" style={{ background: s.bg, color: s.color }}>
        {s.icon} {status}
      </span>
    );
  };

  const getReasonBadge = (reason) => {
    const map = {
      'AUDIT': { bg: '#eff6ff', color: '#2563eb', icon: <FaClipboardList /> },
      'WASTAGE': { bg: '#fef3c7', color: '#b45309', icon: <FaTrash /> },
      'DAMAGE': { bg: '#fef2f2', color: '#dc2626', icon: <FaExclamationTriangle /> },
      'EXPIRY': { bg: '#fdf4ff', color: '#a21caf', icon: <FaTimesCircle /> }
    };
    const r = map[reason] || { bg: '#f1f5f9', color: '#475569', icon: <FaBug /> };
    return (
      <span className="badge" style={{ background: r.bg, color: r.color }}>
        {r.icon} {reason}
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
      render: (row) => <span className="mono-id">{row.adjustmentNumber}</span>
    },
    {
      key: 'adjustmentDate', label: 'Date',
      render: (row) => (
        <div className="dt-cell">
          <span className="d">{formatTzDate(row.adjustmentDate, timezone, { format: 'date' })}</span>
          <span className="t">{formatTzDate(row.adjustmentDate, timezone, { format: 'time' })}</span>
        </div>
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
    }
  ];

  if (loading) return <div className="loading-state-premium"><span>Compiling Adjustment Reports...</span></div>;

  return (
    <DashboardLayout title="Adjustment Reports" showBack={true}>
      <div className="report-container">

        {/* Status & Reason Pills */}
        <div className="pills-section">
          <div className="pills-group">
            <span className="pills-label">Status</span>
            <div className="pills-row">
              {Object.entries(statusCounts).map(([key, count]) => (
                <button 
                  key={key} 
                  className={`status-pill ${statusFilter === key ? 'active purple' : ''}`}
                  onClick={() => setStatusFilter(key)}
                >
                  <span className="pill-count">{count}</span>
                  <span className="pill-label">{key === 'ALL' ? 'All' : key}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pills-group">
            <span className="pills-label">Reason</span>
            <div className="pills-row">
              {Object.entries(reasonCounts).map(([key, count]) => (
                <button 
                  key={key} 
                  className={`status-pill small ${reasonFilter === key ? 'active pink' : ''}`}
                  onClick={() => setReasonFilter(key)}
                >
                  <span className="pill-count">{count}</span>
                  <span className="pill-label">{key === 'ALL' ? 'All' : key}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="filters-bar">
          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by adjustment # or warehouse..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="date-filters">
            <div className="date-group">
              <label><FaCalendarAlt /> From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="date-group">
              <label><FaCalendarAlt /> To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            {(searchTerm || statusFilter !== 'ALL' || reasonFilter !== 'ALL' || dateFrom || dateTo) && (
              <button className="clear-btn" onClick={clearFilters}>Clear All</button>
            )}
          </div>
        </div>

        {/* Report Table (shared component) */}
        <ReportTable
          columns={columns}
          data={filteredAdjustments}
          emptyIcon={<FaBalanceScale />}
          emptyTitle="No adjustments found"
          emptyText="Adjust your filters or create a new stock adjustment."
          accentColor="#8b5cf6"
        />

        <div className="report-footer">
          <span>Showing {filteredAdjustments.length} of {adjustments.length} adjustments</span>
        </div>
      </div>

      <style jsx>{`
        .report-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .report-container { padding: 0 16px 24px; } }

        .pills-section { display: flex; gap: 32px; margin-bottom: 20px; flex-wrap: wrap; }
        .pills-group { display: flex; flex-direction: column; gap: 8px; }
        .pills-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .pills-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .status-pill { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; transition: all 0.3s; font-family: inherit; }
        .status-pill.small { padding: 8px 14px; }
        .status-pill:hover { border-color: #8b5cf6; }
        .status-pill.active.purple { background: #8b5cf6; border-color: #8b5cf6; }
        .status-pill.active.pink { background: #ec4899; border-color: #ec4899; }
        .status-pill.active .pill-count, .status-pill.active .pill-label { color: white; }
        .pill-count { font-size: 18px; font-weight: 950; color: #1e293b; line-height: 1; }
        .pill-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }

        .filters-bar { background: white; border-radius: 20px; padding: 20px 24px; border: 1px solid #edf2f7; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); flex-wrap: wrap; }
        .search-box { position: relative; flex: 1; min-width: 200px; }
        .search-box .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-box input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 11px 12px 11px 42px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #1e293b; }
        .search-box input:focus { outline: none; border-color: #8b5cf6; background: white; box-shadow: 0 0 0 4px #f5f3ff; }
        .date-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .date-group { display: flex; flex-direction: column; gap: 4px; }
        .date-group label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; display: flex; align-items: center; gap: 4px; }
        .date-group input { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 12px; font-size: 12px; font-weight: 700; background: #f8fafc; color: #1e293b; }
        .clear-btn { background: #fef2f2; color: #dc2626; border: none; padding: 10px 16px; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer; transition: 0.2s; align-self: flex-end; }
        .clear-btn:hover { background: #fee2e2; }

        .mono-id { font-size: 13px; font-weight: 900; color: #8b5cf6; font-family: 'SF Mono', 'Menlo', monospace; }
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
      `}</style>
    </DashboardLayout>
  );
}
