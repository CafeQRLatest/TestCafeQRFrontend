import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import api from '../../utils/api';
import { formatTzDate } from '../../utils/timezoneUtils';
import { 
  FaHistory, FaWarehouse, FaSearch, FaArrowRight, FaArrowLeft, FaTags, FaClock
} from 'react-icons/fa';
import ReportTable from '../../components/ReportTable';

export default function StockHistoryPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']}>
      <StockHistoryContent />
    </RoleGate>
  );
}

function StockHistoryContent() {
  const { timezone } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [ledgers, setLedgers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [wResp, pResp] = await Promise.all([
        api.get('/api/v1/warehouses'),
        api.get('/api/v1/product-management/products')
      ]);

      if (wResp.data.success) {
        setWarehouses(wResp.data.data || []);
        if (wResp.data.data?.length > 0) {
          const firstWh = wResp.data.data[0].id;
          setSelectedWarehouseId(firstWh);
          fetchHistory(firstWh);
        }
      }
      if (pResp.data.success) {
        setProducts(pResp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to load initial data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (whId) => {
    if (!whId) return;
    setLoading(true);
    try {
      const resp = await api.get(`/api/v1/inventory/history/${whId}`);
      if (resp.data.success) {
        setLedgers(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch stock history:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleWarehouseChange = (e) => {
    const id = e.target.value;
    setSelectedWarehouseId(id);
    fetchHistory(id);
  };

  const getProductName = (id) => {
    const p = products.find(prod => prod.id === id);
    return p ? p.name : 'Unknown Product';
  };

  const filteredLedgers = ledgers.filter(lg => {
    const name = getProductName(lg.productId).toLowerCase();
    const type = (lg.transactionType || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || type.includes(search);
  });

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'IN': return <FaArrowRight className="tx-in" title="Stock Increased" />;
      case 'OUT': return <FaArrowLeft className="tx-out" title="Stock Decreased" />;
      case 'ADJUSTMENT': return <FaTags className="tx-adj" title="Adjustment" />;
      case 'TRANSFER': return <FaWarehouse className="tx-tr" title="Transfer" />;
      default: return <FaHistory className="tx-def" />;
    }
  };

  if (loading && warehouses.length === 0) return <div className="loading-state-premium"><span>Loading Ledger Data...</span></div>;

  return (
    <DashboardLayout title="Stock Ledger" showBack={true}>
      <div className="overview-container">
        
        {/* Top Intelligence Bar */}
        <div className="intelligence-bar">
          <div className="wh-selector-box">
             <div className="selector-icon"><FaHistory /></div>
             <div className="selector-details">
                <label>Ledger Target Location</label>
                <select value={selectedWarehouseId} onChange={handleWarehouseChange}>
                   <option value="">Select Warehouse...</option>
                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
             </div>
          </div>

          <div className="search-intelligence">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder="Search by product or type..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        {/* Ledger Table */}
        <ReportTable
          accentColor="#4f46e5"
          columns={[
            { 
              key: 'transactionDate', 
              label: 'Date / Time',
              render: (lg) => (
                <div className="dt-cell">
                  <span className="d">{formatTzDate(lg.transactionDate, timezone, { format: 'date' })}</span>
                  <span className="t">{formatTzDate(lg.transactionDate, timezone, { format: 'time' })}</span>
                </div>
              )
            },
            { 
              key: 'productId', 
              label: 'Product / Item',
              render: (lg) => <span className="name-text">{getProductName(lg.productId)}</span>
            },
            { 
              key: 'transactionType', 
              label: 'Transaction Type',
              render: (lg) => (
                <div className="tx-pill">
                  {getTransactionIcon(lg.transactionType || 'SYSTEM')}
                  <span>{lg.transactionType || 'MANUAL'}</span>
                  {lg.referenceType && <span className="ref-tag">{lg.referenceType}</span>}
                </div>
              )
            },
            { 
              key: 'quantityChanged', 
              label: 'Qty Chg', 
              align: 'right',
              render: (lg) => (
                <span className={`qty-chg ${lg.quantityChanged > 0 ? 'pos' : lg.quantityChanged < 0 ? 'neg' : 'neu'}`}>
                  {lg.quantityChanged > 0 ? '+' : ''}{lg.quantityChanged}
                </span>
              )
            },
            { 
              key: 'quantityAfter', 
              label: 'Balance', 
              align: 'right',
              render: (lg) => <span className="qty-bal">{lg.quantityAfter}</span>
            }
          ]}
          data={filteredLedgers}
          emptyTitle="No ledger records"
          emptyText="This warehouse has no internal stock events recorded matching your query."
        />

      </div>

      <style jsx>{`
        .overview-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .overview-container { padding: 0 16px 24px; } }
        
        .intelligence-bar { background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7; display: flex; align-items: center; gap: 32px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        .wh-selector-box { display: flex; align-items: center; gap: 16px; min-width: 280px; }
        .selector-icon { width: 48px; height: 48px; background: #e0e7ff; color: #4f46e5; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
        .selector-details { display: flex; flex-direction: column; flex: 1; }
        .selector-details label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .selector-details select { background: none; border: none; font-size: 16px; font-weight: 800; color: #1e293b; outline: none; padding: 0; cursor: pointer; }

        .search-intelligence { position: relative; flex: 1; }
        .search-intelligence .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-intelligence input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 12px 12px 48px; border-radius: 12px; font-size: 14px; font-weight: 600; color: #1e293b; transition: 0.2s; }
        .search-intelligence input:focus { outline: none; border-color: #4f46e5; background: white; box-shadow: 0 0 0 4px #e0e7ff; }

        .dt-cell { display: flex; flex-direction: column; gap: 2px; }
        .dt-cell .d { font-weight: 700; color: #1e293b; font-size: 13px; }
        .dt-cell .t { font-weight: 600; color: #94a3b8; font-size: 11px; }

        .name-text { font-size: 14px; font-weight: 800; color: #1e293b; }

        .tx-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f8fafc; border-radius: 8px; font-size: 11px; font-weight: 800; color: #475569; }
        .tx-in { color: #10b981; font-size: 14px; }
        .tx-out { color: #ef4444; font-size: 14px; }
        .tx-adj { color: #f59e0b; font-size: 14px; }
        .tx-tr { color: #3b82f6; font-size: 14px; }
        .ref-tag { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 9px; margin-left: 4px; }

        .qty-chg { font-family: monospace; font-size: 14px; font-weight: 900; }
        .qty-chg.pos { color: #10b981; }
        .qty-chg.neg { color: #ef4444; }
        .qty-chg.neu { color: #64748b; }

        .qty-bal { font-size: 16px; font-weight: 900; color: #1e293b; }
        .text-right { text-align: right; }
        
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
      `}</style>
    </DashboardLayout>
  );
}
