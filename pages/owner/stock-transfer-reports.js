import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import ReportTable from '../../components/ReportTable';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import { 
  FaFileAlt, FaSearch, FaTruck, FaCalendarAlt, FaCheckCircle,
  FaClock, FaExchangeAlt, FaTimesCircle
} from 'react-icons/fa';

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
  const { timezone, orgId } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const PAGE_SIZE = 50;
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [dateFrom, setDateFrom] = useState(getTodayStr());
  const [dateTo, setDateTo] = useState(getTodayStr());

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
    const matchSearch = t.transferNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getWarehouseName(t.sourceWarehouseId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      getWarehouseName(t.destWarehouseId).toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    let matchDate = true;
    if (dateFrom) matchDate = new Date(t.transferDate) >= new Date(dateFrom);
    if (dateTo && matchDate) matchDate = new Date(t.transferDate) <= new Date(dateTo + 'T23:59:59');
    return matchSearch && matchStatus && matchDate;
  });

  const statusCounts = {
    ALL: transfers.length,
    DRAFT: transfers.filter(t => t.status === 'DRAFT').length,
    IN_TRANSIT: transfers.filter(t => t.status === 'IN_TRANSIT').length,
    COMPLETED: transfers.filter(t => t.status === 'COMPLETED').length
  };

  const getStatusBadge = (status) => {
    const map = {
      'DRAFT': { bg: '#f8fafc', color: '#64748b', icon: <FaClock /> },
      'IN_TRANSIT': { bg: '#fef3c7', color: '#b45309', icon: <FaTruck /> },
      'COMPLETED': { bg: '#ecfdf5', color: '#059669', icon: <FaCheckCircle /> },
      'CANCELLED': { bg: '#fef2f2', color: '#dc2626', icon: <FaTimesCircle /> }
    };
    const s = map[status] || map['DRAFT'];
    return (
      <span className="status-badge" style={{ background: s.bg, color: s.color }}>
        {s.icon} {status.replace('_', ' ')}
      </span>
    );
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  // Define columns for the shared ReportTable
  const columns = [
    {
      key: 'transferNumber', label: 'Transfer #',
      render: (row) => <span className="mono-id">{row.transferNumber}</span>
    },
    {
      key: 'transferDate', label: 'Date',
      render: (row) => (
        <div className="dt-cell">
          <span className="d">{formatTzDate(row.transferDate, timezone, { format: 'date' })}</span>
          <span className="t">{formatTzDate(row.transferDate, timezone, { format: 'time' })}</span>
        </div>
      )
    },
    {
      key: 'source', label: 'Source',
      render: (row) => <span className="wh-name">{getWarehouseName(row.sourceWarehouseId)}</span>
    },
    {
      key: 'arrow', label: '', width: '40px',
      render: () => <FaExchangeAlt style={{ color: '#cbd5e1', fontSize: 14 }} />
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
    }
  ];

  if (loading) return <div className="loading-state-premium"><span>Compiling Transfer Reports...</span></div>;

  return (
    <DashboardLayout title="Transfer Reports" showBack={true}>
      <div className="report-container">

        {/* Status Pills */}
        <div className="status-pills">
          {Object.entries(statusCounts).map(([key, count]) => (
            <button 
              key={key} 
              className={`status-pill ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              <span className="pill-count">{count}</span>
              <span className="pill-label">{key === 'ALL' ? 'All' : key.replace('_', ' ')}</span>
            </button>
          ))}
        </div>

        {/* Filters Bar */}
        <div className="filters-bar">
          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by transfer # or warehouse..." 
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
            {(searchTerm || statusFilter !== 'ALL' || dateFrom || dateTo) && (
              <button className="clear-btn" onClick={clearFilters}>Clear All</button>
            )}
          </div>
        </div>

        {/* Report Table (shared component) */}
        <ReportTable
          columns={columns}
          data={filteredTransfers}
          emptyIcon={<FaExchangeAlt />}
          emptyTitle="No transfers found"
          emptyText="Adjust your filters or create a new stock transfer."
          accentColor="#0ea5e9"
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
      </div>

      <style jsx>{`
        .report-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .report-container { padding: 0 16px 24px; } }

        .status-pills { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .status-pill { display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: white; border: 1px solid #e2e8f0; border-radius: 14px; cursor: pointer; transition: all 0.3s; font-family: inherit; }
        .status-pill:hover { border-color: #0ea5e9; }
        .status-pill.active { background: #0ea5e9; border-color: #0ea5e9; }
        .status-pill.active .pill-count, .status-pill.active .pill-label { color: white; }
        .pill-count { font-size: 20px; font-weight: 950; color: #1e293b; line-height: 1; }
        .pill-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }

        .filters-bar { background: white; border-radius: 20px; padding: 20px 24px; border: 1px solid #edf2f7; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); flex-wrap: wrap; }
        .search-box { position: relative; flex: 1; min-width: 200px; }
        .search-box .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-box input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 11px 12px 11px 42px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #1e293b; }
        .search-box input:focus { outline: none; border-color: #0ea5e9; background: white; box-shadow: 0 0 0 4px #e0f2fe; }
        .date-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .date-group { display: flex; flex-direction: column; gap: 4px; }
        .date-group label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; display: flex; align-items: center; gap: 4px; }
        .date-group input { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 12px; font-size: 12px; font-weight: 700; background: #f8fafc; color: #1e293b; }
        .clear-btn { background: #fef2f2; color: #dc2626; border: none; padding: 10px 16px; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer; transition: 0.2s; align-self: flex-end; }
        .clear-btn:hover { background: #fee2e2; }

        .mono-id { font-size: 13px; font-weight: 900; color: #0ea5e9; font-family: 'SF Mono', 'Menlo', monospace; }
        .dt-cell { display: flex; flex-direction: column; gap: 2px; }
        .dt-cell .d { font-weight: 700; color: #1e293b; font-size: 13px; }
        .dt-cell .t { font-weight: 600; color: #94a3b8; font-size: 11px; }
        .wh-name { font-size: 13px; font-weight: 800; color: #1e293b; }
        .item-pill { font-size: 12px; font-weight: 800; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 8px; }
        .notes-text { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; white-space: nowrap; }

        .report-footer { padding: 16px 0; text-align: center; }
        .report-footer span { font-size: 12px; font-weight: 700; color: #94a3b8; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }

        .pagination-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 16px 0 4px; }
        .pg-btn { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; color: #0ea5e9; cursor: pointer; transition: all 0.2s; }
        .pg-btn:hover:not(:disabled) { background: #e0f2fe; border-color: #0ea5e9; }
        .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pg-info { font-size: 13px; font-weight: 700; color: #64748b; }
      `}</style>
    </DashboardLayout>
  );
}
