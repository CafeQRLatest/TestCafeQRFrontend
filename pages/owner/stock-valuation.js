import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import api from '../../utils/api';
import { 
  FaDollarSign, FaWarehouse, FaSearch, FaBoxes, FaChartPie,
  FaSortAmountDown, FaSortAmountUp, FaDownload
} from 'react-icons/fa';
import ReportTable from '../../components/ReportTable';

export default function StockValuationPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']}>
      <ModuleGate>
        <ValuationContent />
      </ModuleGate>
    </RoleGate>
  );
}

function ValuationContent() {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('value');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [wResp, pResp] = await Promise.all([
        api.get('/api/v1/warehouses')
          .catch(err => {
            console.error("Failed to fetch warehouses:", err);
            return { data: { success: true, data: [] } };
          }),
        api.get('/api/v1/products')
          .catch(err => {
            console.error("Failed to fetch products:", err);
            return { data: { success: true, data: [] } };
          })
      ]);

      if (wResp.data && wResp.data.success) {
        setWarehouses(wResp.data.data || []);
        if (wResp.data.data?.length > 0) {
          setSelectedWarehouseId(wResp.data.data[0].id);
          fetchStock(wResp.data.data[0].id);
        }
      }
      if (pResp.data && pResp.data.success) {
        setProducts(pResp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to load stock valuation data:", err);
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

  const getProduct = (id) => {
    if (!id) return null;
    return products.find(p => p.id?.toLowerCase() === id.toLowerCase());
  };
  const getProductName = (id) => getProduct(id)?.name || 'Unknown Product';
  const getProductCost = (id) => {
    const p = getProduct(id);
    return p ? (p.costPrice || p.price || 0) : 0;
  };
  const getProductSku = (id) => {
    const p = getProduct(id);
    return p ? (p.productCode || p.sku || p.id?.slice(0, 8)) : id?.slice(0, 8);
  };

  const valuationData = stock
    .map(item => ({
      ...item,
      productName: getProductName(item.productId),
      unitCost: getProductCost(item.productId),
      totalValue: item.currentQuantity * getProductCost(item.productId),
      sku: getProductSku(item.productId)
    }))
    .filter(item => {
      const search = searchTerm.toLowerCase();
      if (!search) return true;
      const name = item.productName.toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      return name.includes(search) || sku.includes(search);
    });

  // Sort
  const sortedData = [...valuationData].sort((a, b) => {
    let valA, valB;
    switch (sortField) {
      case 'name': valA = a.productName; valB = b.productName; break;
      case 'qty': valA = a.currentQuantity; valB = b.currentQuantity; break;
      case 'cost': valA = a.unitCost; valB = b.unitCost; break;
      case 'value': default: valA = a.totalValue; valB = b.totalValue; break;
    }
    if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return sortDir === 'asc' ? valA - valB : valB - valA;
  });

  const totalUnits = valuationData.reduce((a, b) => a + b.currentQuantity, 0);
  const totalValue = valuationData.reduce((a, b) => a + b.totalValue, 0);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <FaSortAmountUp style={{ fontSize: 10, marginLeft: 4 }} /> : <FaSortAmountDown style={{ fontSize: 10, marginLeft: 4 }} />;
  };

  if (loading && warehouses.length === 0) return <div className="loading-state-premium"><span>Calculating Asset Values...</span></div>;

  return (
    <DashboardLayout title="Stock Valuation" showBack={true}>
      <div className="val-container">
        
        {/* Summary Cards */}
        <div className="summary-row">
          <div className="summary-card primary">
            <div className="sc-icon"><FaDollarSign /></div>
            <div className="sc-data">
              <span className="sc-value">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span className="sc-label">Total Inventory Value</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="sc-icon blue"><FaBoxes /></div>
            <div className="sc-data">
              <span className="sc-value">{valuationData.length}</span>
              <span className="sc-label">Active SKUs</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="sc-icon purple"><FaChartPie /></div>
            <div className="sc-data">
              <span className="sc-value">{totalUnits.toLocaleString('en-IN')}</span>
              <span className="sc-label">Total Units in Stock</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="val-filters">
          <div className="wh-selector-box">
            <div className="selector-icon"><FaWarehouse /></div>
            <div className="selector-details">
              <label>Warehouse</label>
              <select value={selectedWarehouseId} onChange={handleWarehouseChange}>
                <option value="">Select Warehouse...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Valuation Table */}
        <ReportTable
          accentColor="#10b981"
          columns={[
            { 
              key: 'sku', 
              label: 'SKU', 
              render: (item) => <span className="sku-code">#{item.sku}</span> 
            },
            { 
              key: 'productName', 
              label: 'Product Name', 
              render: (item) => <span className="product-name-cell">{item.productName}</span> 
            },
            { 
              key: 'currentQuantity', 
              label: 'Qty on Hand', 
              align: 'right',
              render: (item) => (
                <span className={`qty-cell ${item.currentQuantity <= 5 ? 'low' : ''}`}>
                  {item.currentQuantity}
                </span>
              )
            },
            { 
              key: 'unitCost', 
              label: 'Unit Cost', 
              align: 'right',
              render: (item) => <span className="cost-cell">₹{item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            },
            { 
              key: 'totalValue', 
              label: 'Total Value', 
              align: 'right',
              render: (item) => <span className="value-cell">₹{item.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            },
            { 
              key: 'pct', 
              label: '% of Total', 
              align: 'right',
              render: (item) => (
                <div className="pct-bar-wrap">
                  <div className="pct-bar" style={{ width: `${totalValue > 0 ? (item.totalValue / totalValue * 100) : 0}%` }}></div>
                  <span className="pct-text">{totalValue > 0 ? (item.totalValue / totalValue * 100).toFixed(1) : '0.0'}%</span>
                </div>
              )
            }
          ]}
          data={sortedData}
          emptyTitle="No valuation data"
          emptyText="Select a warehouse with stock to view valuation."
          footer={
            <tr>
              <td colSpan="2"><strong>GRAND TOTAL</strong></td>
              <td className="text-right"><strong>{totalUnits.toLocaleString('en-IN')}</strong></td>
              <td className="text-right">—</td>
              <td className="text-right"><strong className="grand-total">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
              <td className="text-right"><strong>100%</strong></td>
            </tr>
          }
        />

      </div>

      <style jsx>{`
        .val-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .val-container { padding: 0 16px 24px; } }

        .summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 24px; }
        .summary-card { background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        .summary-card.primary { background: linear-gradient(135deg, #065f46 0%, #047857 100%); border: none; }
        .summary-card.primary .sc-value, .summary-card.primary .sc-label { color: white; }
        .summary-card.primary .sc-label { opacity: 0.8; }
        .sc-icon { width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: white; flex-shrink: 0; }
        .sc-icon.blue { background: #eff6ff; color: #3b82f6; }
        .sc-icon.purple { background: #f5f3ff; color: #8b5cf6; }
        .sc-data { display: flex; flex-direction: column; }
        .sc-value { font-size: 24px; font-weight: 950; color: #1e293b; line-height: 1.1; }
        .sc-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }

        .val-filters { background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7; display: flex; align-items: center; gap: 24px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        @media (max-width: 768px) { .val-filters { flex-direction: column; align-items: stretch; } }
        .wh-selector-box { display: flex; align-items: center; gap: 16px; min-width: 260px; }
        .selector-icon { width: 44px; height: 44px; background: #ecfdf5; color: #10b981; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
        .selector-details { display: flex; flex-direction: column; flex: 1; }
        .selector-details label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .selector-details select { background: none; border: none; font-size: 15px; font-weight: 800; color: #1e293b; outline: none; padding: 0; cursor: pointer; }
        .search-box { position: relative; flex: 1; }
        .search-box .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-box input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 12px 12px 48px; border-radius: 12px; font-size: 14px; font-weight: 600; color: #1e293b; transition: 0.2s; }
        .search-box input:focus { outline: none; border-color: #10b981; background: white; box-shadow: 0 0 0 4px #ecfdf5; }

        .sku-code { font-size: 11px; font-weight: 800; color: #94a3b8; font-family: 'SF Mono', monospace; }
        .product-name-cell { font-size: 14px; font-weight: 800; color: #1e293b; }
        .qty-cell { font-size: 15px; font-weight: 900; color: #1e293b; }
        .qty-cell.low { color: #f59e0b; }
        .cost-cell { font-size: 13px; font-weight: 700; color: #64748b; }
        .value-cell { font-size: 15px; font-weight: 900; color: #059669; }
        .grand-total { font-size: 16px; color: #059669; }

        .pct-bar-wrap { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
        .pct-bar { height: 6px; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 3px; min-width: 2px; max-width: 100px; transition: width 0.5s ease-out; }
        .pct-text { font-size: 11px; font-weight: 800; color: #64748b; min-width: 40px; text-align: right; }

        .empty-state { padding: 60px 0; text-align: center; color: #94a3b8; }
        .empty-icon { font-size: 48px; color: #e2e8f0; margin-bottom: 16px; }
        .empty-state h3 { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0 0 8px; }
        .empty-state p { font-size: 13px; margin: 0; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
      `}</style>
    </DashboardLayout>
  );
}
