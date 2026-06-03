import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { 
  FaBoxes, FaWarehouse, FaSearch, FaExclamationTriangle, FaCheckCircle,
  FaArrowRight, FaArrowLeft, FaHistory, FaSortAmountDown, FaBuilding
} from 'react-icons/fa';

export default function StockOverviewPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']}>
      <StockContent />
    </RoleGate>
  );
}

function StockContent() {
  const { orgId: userOrgId } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (userOrgId) {
      setSelectedOrgId(userOrgId);
    }
    fetchInitialData();
  }, [userOrgId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const orgIdToUse = selectedOrgId || userOrgId || '';
      const [wResp, pResp, orgResp] = await Promise.all([
        api.get('/api/v1/warehouses', { params: orgIdToUse ? { orgId: orgIdToUse } : {} }),
        api.get('/api/v1/product-management/products'),
        api.get('/api/v1/organizations').catch(() => ({ data: { success: true, data: [] } }))
      ]);

      if (orgResp.data.success) {
        setOrganizations(orgResp.data.data || []);
      }
      if (wResp.data.success) {
        const whs = wResp.data.data || [];
        setWarehouses(whs);
        if (whs.length > 0) {
          setSelectedWarehouseId(whs[0].id);
          fetchStock(whs[0].id);
        } else {
          setSelectedWarehouseId('');
          setStock([]);
        }
      }
      if (pResp.data.success) {
        setProducts(pResp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to load initial stock data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async (orgId) => {
    setLoading(true);
    try {
      const resp = await api.get('/api/v1/warehouses', { params: orgId ? { orgId } : {} });
      if (resp.data.success) {
        const whs = resp.data.data || [];
        setWarehouses(whs);
        if (whs.length > 0) {
          setSelectedWarehouseId(whs[0].id);
          fetchStock(whs[0].id);
        } else {
          setSelectedWarehouseId('');
          setStock([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch warehouses:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStock = async (whId) => {
    if (!whId) return;
    setLoading(true);
    try {
      const resp = await api.get(`/api/v1/inventory/stock-overview/${whId}`);
      if (resp.data.success) {
        setStock(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch stock:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleWarehouseChange = (e) => {
    const id = e.target.value;
    setSelectedWarehouseId(id);
    fetchStock(id);
  };

  const handleOrgChange = (e) => {
    const id = e.target.value;
    setSelectedOrgId(id);
    fetchWarehouses(id);
  };

  const getProductName = (id) => {
    const p = products.find(prod => prod.id === id);
    return p ? p.name : 'Unknown Product';
  };

  const getProductCost = (id) => {
    const p = products.find(prod => prod.id === id);
    return p ? (p.costPrice || p.price || 0) : 0;
  };

  const filteredStock = stock.filter(item => {
    const name = getProductName(item.productId).toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  const totalValuation = filteredStock.reduce((acc, item) => acc + (item.currentQuantity * getProductCost(item.productId)), 0);

  const orgOptions = [
    { value: '', label: 'All Branches' },
    ...organizations.map(o => ({ value: o.id, label: o.name }))
  ];

  const whOptions = warehouses.map(w => ({ value: w.id, label: w.name }));

  if (loading && warehouses.length === 0) return <div className="loading-state-premium"><span>Scanning Inventory Grid...</span></div>;

  return (
    <DashboardLayout title="Inventory Intelligence" showBack={true}>
      <div className="overview-container">
        
        {/* Top Intelligence Bar */}
        <div className="intelligence-bar">
          <div className="wh-selector-box">
             <div className="selector-icon branch-icon"><FaBuilding /></div>
             <div className="selector-details">
                <label>Active Branch</label>
                <NiceSelect 
                   value={selectedOrgId} 
                   onChange={(val) => {
                     setSelectedOrgId(val);
                     fetchWarehouses(val);
                   }}
                   options={orgOptions}
                   placeholder="All Branches"
                />
             </div>
          </div>

          <div className="wh-selector-box">
             <div className="selector-icon"><FaWarehouse /></div>
             <div className="selector-details">
                <label>Storage Location</label>
                <NiceSelect 
                   value={selectedWarehouseId} 
                   onChange={(val) => {
                     setSelectedWarehouseId(val);
                     fetchStock(val);
                   }}
                   options={whOptions}
                   placeholder="Select Warehouse..."
                   disabled={warehouses.length === 0}
                />
             </div>
          </div>

          <div className="search-intelligence">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder="Search product inventory..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="stats-box">
             <div className="stat-item">
                <span className="stat-val">{filteredStock.length}</span>
                <span className="stat-label">Active SKUs</span>
             </div>
             <div className="stat-item warning">
                <span className="stat-val">{filteredStock.filter(s => s.currentQuantity <= 5).length}</span>
                <span className="stat-label">Low Stock</span>
             </div>
             <div className="stat-item valuation">
                <span className="stat-val">₹{totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span className="stat-label">Stock Value</span>
             </div>
          </div>
        </div>

        {/* Stock Grid */}
        <div className="stock-grid">
           {filteredStock.length > 0 ? (
             filteredStock.map(item => (
               <div key={item.id} className="stock-card-premium">
                  <div className="card-glare"></div>
                  <div className="stock-info">
                     <span className="sku-tag">#{item.productId.slice(0, 8)}</span>
                     <h3 className="product-name">{getProductName(item.productId)}</h3>
                     <div className="stock-badge">
                        <span className="qty">{item.currentQuantity}</span>
                        <span className="unit">Units Available</span>
                     </div>
                     <div className="sku-valuation">
                        Valuation: ₹{(item.currentQuantity * getProductCost(item.productId)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                     </div>
                  </div>
                  
                  <div className="stock-visualization">
                     <div className="progress-track">
                        <div 
                          className={`progress-fill ${item.currentQuantity > 10 ? 'healthy' : item.currentQuantity > 0 ? 'low' : 'out'}`} 
                          style={{ width: `${Math.min(item.currentQuantity * 2, 100)}%` }}
                        ></div>
                     </div>
                     <div className="stock-status-text">
                        {item.currentQuantity > 10 ? (
                          <><FaCheckCircle /> Optimized Level</>
                        ) : item.currentQuantity > 0 ? (
                          <><FaExclamationTriangle /> Critical Reorder</>
                        ) : (
                          "Out of Stock"
                        )}
                     </div>
                  </div>

                  <div className="card-footer-actions">
                     <button className="action-btn" title="View History"><FaHistory /> Ledger</button>
                  </div>
               </div>
             ))
           ) : (
             <div className="no-result-state">
                <FaBoxes className="bg-icon" />
                <h3>No Inventory Found</h3>
                <p>Ensure products are received into this warehouse via Purchase Orders or Stock Transfers.</p>
             </div>
           )}
        </div>

      </div>

      <style jsx>{`
        .overview-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .overview-container { padding: 0 16px 24px; } }
        
        .intelligence-bar { background: white; border-radius: 16px; padding: 12px 20px; border: 1px solid #edf2f7; display: flex; align-items: center; gap: 16px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        @media (max-width: 1024px) { .intelligence-bar { flex-direction: column; align-items: stretch; gap: 12px; } }

        .wh-selector-box { display: flex; align-items: center; gap: 10px; min-width: 180px; }
        .selector-icon { width: 36px; height: 36px; background: #fff7ed; color: #f97316; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .selector-icon.branch-icon { background: #eff6ff; color: #3b82f6; }
        .selector-details { display: flex; flex-direction: column; flex: 1; min-width: 0; position: relative; }
        .selector-details label { font-size: 9px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
        
        .wh-selector-box :global(.nice-select-trigger) {
          border: none !important;
          background: transparent !important;
          height: 24px !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        
        .wh-selector-box :global(.nice-select-trigger > span:first-child) {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #1e293b !important;
        }

        .wh-selector-box :global(.nice-select-trigger > span:last-child) {
          font-size: 9px !important;
          right: 0 !important;
          color: #94a3b8 !important;
        }

        .search-intelligence { position: relative; flex: 1; }
        .search-intelligence .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 13px; }
        .search-intelligence input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px 8px 36px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #1e293b; transition: 0.2s; }
        .search-intelligence input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 4px #fff7ed; }

        .stats-box { display: flex; gap: 16px; border-left: 1px solid #f1f5f9; padding-left: 20px; }
        @media (max-width: 1024px) { .stats-box { border-left: none; padding-left: 0; justify-content: space-around; } }
        .stat-item { display: flex; flex-direction: column; align-items: center; }
        .stat-val { font-size: 18px; font-weight: 950; color: #1e293b; line-height: 1; }
        .stat-label { font-size: 9px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-top: 2px; }
        .stat-item.warning .stat-val { color: #f59e0b; }

        .stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
        
        .stock-card-premium { background: white; border-radius: 24px; padding: 24px; border: 1px solid #edf2f7; position: relative; overflow: hidden; transition: 0.3s; display: flex; flex-direction: column; gap: 20px; }
        .stock-card-premium:hover { transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border-color: #f97316; }
        .card-glare { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(249,115,22,0.03) 0%, transparent 70%); pointer-events: none; }
        
        .sku-tag { font-size: 10px; font-weight: 800; color: #94a3b8; letter-spacing: 0.5px; }
        .product-name { margin: 4px 0 12px; font-size: 18px; font-weight: 900; color: #1e293b; line-height: 1.2; height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        
        .stock-badge { display: flex; align-items: baseline; gap: 6px; }
        .qty { font-size: 32px; font-weight: 950; color: #1e293b; letter-spacing: -1px; }
        .unit { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
        
        .sku-valuation { margin-top: 4px; font-size: 13px; font-weight: 800; color: #059669; }

        .stock-visualization { display: flex; flex-direction: column; gap: 8px; }
        .progress-track { width: 100%; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: 1s ease-out; }
        .progress-fill.healthy { background: #10b981; }
        .progress-fill.low { background: #f59e0b; }
        .progress-fill.out { background: #ef4444; }
        
        .stock-status-text { font-size: 11px; font-weight: 800; color: #64748b; display: flex; align-items: center; gap: 6px; }
        .stock-card-premium:hover .stock-status-text { color: #1e293b; }

        .card-footer-actions { border-top: 1px solid #f8fafc; padding-top: 16px; margin-top: auto; display: flex; justify-content: flex-end; }
        .action-btn { background: none; border: none; font-size: 11px; font-weight: 900; color: #f97316; text-transform: uppercase; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 12px; border-radius: 10px; transition: 0.2s; }
        .action-btn:hover { background: #fff7ed; }

        .no-result-state { grid-column: 1 / -1; height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #94a3b8; }
        .bg-icon { font-size: 64px; opacity: 0.1; margin-bottom: 24px; }
        .no-result-state h3 { font-size: 20px; font-weight: 900; color: #1e293b; margin: 0; }
        .no-result-state p { margin-top: 8px; max-width: 320px; font-weight: 500; font-size: 14px; }

        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
      `}</style>
    </DashboardLayout>
  );
}
