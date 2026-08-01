import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import api from '../../utils/api';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';
import { useAuth } from '../../context/AuthContext';
import Cookies from 'js-cookie';
import { 
  FaDollarSign, FaWarehouse, FaSearch, FaBoxes, FaChartPie,
  FaSortAmountDown, FaSortAmountUp, FaFilter
} from 'react-icons/fa';
import ReportTable from '../../components/ReportTable';
import NiceSelect from '../../components/NiceSelect';

export default function StockValuationPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Stock">
      <ModuleGate>
        <ValuationContent />
      </ModuleGate>
    </RoleGate>
  );
}

function ValuationContent() {
  const sym = useCurrencySymbol();
  const { orgId, userRole } = useAuth();

  // Read current active organization ID for Super Admin or logged-in org
  const currentOrgId = orgId || (typeof window !== 'undefined' ? (Cookies.get('orgId') || '') : '');
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('ALL'); // 'ALL' | 'PRODUCTS' | 'INGREDIENTS'
  const [sortField, setSortField] = useState('value');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetchInitialData();
  }, [currentOrgId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const params = currentOrgId ? { orgId: currentOrgId } : {};

      const [wResp, pResp] = await Promise.all([
        api.get('/api/v1/warehouses', { params })
          .catch(err => {
            console.error("Failed to fetch warehouses:", err);
            return { data: { success: true, data: [] } };
          }),
        api.get('/api/v1/products', { params })
          .catch(err => {
            console.error("Failed to fetch products:", err);
            return { data: { success: true, data: [] } };
          })
      ]);

      const rawWarehouses = wResp.data?.data || [];
      // Filter warehouses for current organization (or global warehouses)
      const filteredWarehouses = rawWarehouses.filter((w) => {
        if (!currentOrgId || isSuperAdmin) return true;
        const wOrg = String(w.organizationId || w.organization_id || w.orgId || w.org_id || '');
        return !wOrg || String(wOrg) === String(currentOrgId);
      });

      setWarehouses(filteredWarehouses);
      if (pResp.data && pResp.data.success) {
        setProducts(pResp.data.data || []);
      }

      if (filteredWarehouses.length > 0) {
        // Default to 'ALL' to show consolidated view across all warehouses
        setSelectedWarehouseId('ALL');
        await fetchStock('ALL', currentOrgId);
      } else {
        setSelectedWarehouseId('ALL');
        await fetchStock('ALL', currentOrgId);
      }
    } catch (err) {
      console.error("Failed to load stock valuation data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStock = async (whId, orgIdParam) => {
    setLoading(true);
    try {
      let resp;
      if (!whId || whId === 'ALL') {
        // Consolidated view across all warehouses for current org
        const params = {};
        const effectiveOrg = orgIdParam || currentOrgId;
        if (effectiveOrg) params.orgId = effectiveOrg;
        resp = await api.get('/api/v1/inventory/consolidated-stock-overview', { params });
      } else {
        resp = await api.get(`/api/v1/inventory/stock-overview/${whId}`);
      }
      if (resp.data && resp.data.success) {
        setStock(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch stock:", err);
      setStock([]);
    } finally {
      setLoading(false);
    }
  };

  // Build Map of Stock by Product ID
  const stockMap = new Map();
  stock.forEach(item => {
    if (item.productId) {
      stockMap.set(String(item.productId).toLowerCase(), item);
    }
  });

  // Combine ALL Products (both ingredients & non-ingredients) with current Warehouse Stock
  const productIdsSeen = new Set();
  const allValuationItems = products.map(p => {
    const pId = String(p.id).toLowerCase();
    productIdsSeen.add(pId);
    const snap = stockMap.get(pId);
    
    const qty = snap ? Number(snap.currentQuantity || 0) : 0;
    const unitCost = Number(p.costPrice ?? p.purchasePrice ?? p.price ?? 0);
    const totalVal = qty * unitCost;

    const isIng = (
      p.isIngredient === true ||
      p.is_ingredient === true ||
      String(p.isIngredient || p.is_ingredient || '').trim().toUpperCase() === 'Y' ||
      String(p.isIngredient || p.is_ingredient || '').trim().toUpperCase() === 'TRUE' ||
      String(p.isIngredient || p.is_ingredient || '').trim() === '1' ||
      String(p.type || p.productType || p.product_type || '').toUpperCase() === 'INGREDIENT' ||
      String(p.type || p.productType || p.product_type || '').toUpperCase() === 'RAW_MATERIAL' ||
      String(p.categoryName || p.category_name || p.category || '').toLowerCase().includes('ingredient') ||
      String(p.categoryName || p.category_name || p.category || '').toLowerCase().includes('raw') ||
      String(p.categoryName || p.category_name || p.category || '').toLowerCase().includes('material') ||
      String(p.categoryName || p.category_name || p.category || '').toLowerCase().includes('supplies')
    );

    return {
      id: p.id,
      productId: p.id,
      sku: p.productCode || p.sku || '—',
      productName: p.name || 'Unknown Product',
      categoryName: p.categoryName || (isIng ? 'Ingredients' : 'General'),
      isIngredient: isIng,
      currentQuantity: qty,
      unitCost: unitCost,
      totalValue: totalVal,
      unitOfMeasure: p.unitOfMeasure || p.uom || 'units'
    };
  });

  // Include stock items that weren't in the product master list
  stock.forEach(s => {
    if (s.productId && !productIdsSeen.has(String(s.productId).toLowerCase())) {
      const p = products.find(prod => String(prod.id).toLowerCase() === String(s.productId).toLowerCase());
      const qty = Number(s.currentQuantity || 0);
      const unitCost = p ? Number(p.costPrice ?? p.purchasePrice ?? p.price ?? 0) : 0;
      allValuationItems.push({
        id: s.id || s.productId,
        productId: s.productId,
        sku: p?.productCode || p?.sku || '—',
        productName: p?.name || 'Unknown Product',
        categoryName: 'General',
        isIngredient: false,
        currentQuantity: qty,
        unitCost: unitCost,
        totalValue: qty * unitCost,
        unitOfMeasure: 'units'
      });
    }
  });

  // Filter Data based on Search and Type Filter Tabs
  const valuationData = allValuationItems.filter(item => {
    if (itemTypeFilter === 'INGREDIENTS' && !item.isIngredient) return false;
    if (itemTypeFilter === 'PRODUCTS' && item.isIngredient) return false;

    const search = searchTerm.toLowerCase().trim();
    if (!search) return true;
    const name = item.productName.toLowerCase();
    const sku = String(item.sku || '').toLowerCase();
    const cat = String(item.categoryName || '').toLowerCase();
    return name.includes(search) || sku.includes(search) || cat.includes(search);
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

  if (loading && warehouses.length === 0) return <div className="loading-state-premium"><span>Loading Stock Valuation...</span></div>;

  return (
    <DashboardLayout title="Stock Valuation" showBack={true}>
      <div className="val-container">

        {/* Toolbar Filters */}
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="wh-select-wrap">
              <NiceSelect
                value={selectedWarehouseId}
                onChange={(id) => {
                  setSelectedWarehouseId(id);
                  fetchStock(id);
                }}
                options={[
                  { value: 'ALL', label: 'All Warehouses' },
                  ...warehouses.map(w => ({
                    value: w.id,
                    label: `${w.name}${w.code ? ` (${w.code})` : ''}${w.isDefault ? ' ⭐ Default' : ''}`
                  }))
                ]}
                placeholder={warehouses.length === 0 ? "No warehouses found" : "Select Warehouse..."}
                style={{ minWidth: '220px' }}
              />
            </div>

            <div className="credit-mode-slider">
              <button 
                className={`slider-btn ${itemTypeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setItemTypeFilter('ALL')}
              >
                All Items ({allValuationItems.length})
              </button>
              <button 
                className={`slider-btn ${itemTypeFilter === 'PRODUCTS' ? 'active' : ''}`}
                onClick={() => setItemTypeFilter('PRODUCTS')}
              >
                Products & Goods ({allValuationItems.filter(i => !i.isIngredient).length})
              </button>
              <button 
                className={`slider-btn ${itemTypeFilter === 'INGREDIENTS' ? 'active' : ''}`}
                onClick={() => setItemTypeFilter('INGREDIENTS')}
              >
                Ingredients ({allValuationItems.filter(i => i.isIngredient).length})
              </button>
            </div>
          </div>

          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              className="search-input"
              placeholder="Search by name, SKU or category..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Valuation Table */}
        <ReportTable
          accentColor="#FF7A00"
          columns={[
            { 
              key: 'sku', 
              label: 'SKU / CODE', 
              render: (item) => <span className="sku-code">{item.sku && item.sku !== '—' ? `#${item.sku}` : '—'}</span> 
            },
            { 
              key: 'productName', 
              label: 'ITEM NAME', 
              render: (item) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span className="product-name-cell">{item.productName}</span>
                  {item.categoryName && <span className="cat-text">{item.categoryName}</span>}
                </div>
              )
            },
            { 
              key: 'currentQuantity', 
              label: 'QTY ON HAND', 
              align: 'right',
              render: (item) => (
                <span className="qty-badge-box">
                  <strong>{item.currentQuantity}</strong> <small>{item.unitOfMeasure}</small>
                </span>
              )
            },
            { 
              key: 'unitCost', 
              label: 'UNIT COST', 
              align: 'right',
              render: (item) => <span className="cost-cell">{sym}{item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            },
            { 
              key: 'totalValue', 
              label: 'TOTAL VALUE', 
              align: 'right',
              render: (item) => <span className="value-cell">{sym}{item.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            },
            { 
              key: 'pct', 
              label: '% OF TOTAL', 
              align: 'right',
              render: (item) => (
                <div className="pct-bar-wrap">
                  <div className="pct-bar-track">
                    <div className="pct-bar" style={{ width: `${totalValue > 0 ? Math.min(100, (item.totalValue / totalValue * 100)) : 0}%` }}></div>
                  </div>
                  <span className="pct-text">{totalValue > 0 ? (item.totalValue / totalValue * 100).toFixed(1) : '0.0'}%</span>
                </div>
              )
            }
          ]}
          data={sortedData}
          emptyTitle="No stock valuation data"
          emptyText="No ingredients or products match the current filters and selected warehouse."
          footer={
            <tr>
              <td colSpan="2"><strong>GRAND TOTAL ({sortedData.length} items)</strong></td>
              <td className="text-right"><strong>{totalUnits.toLocaleString('en-IN')}</strong></td>
              <td className="text-right">—</td>
              <td className="text-right"><strong className="grand-total">{sym}{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
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

        .toolbar { display: flex; gap: 16px; margin-bottom: 24px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
        .toolbar-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .wh-select-wrap { min-width: 220px; }

        .credit-mode-slider { display: inline-flex; align-items: center; background: #f1f5f9; padding: 4px; border-radius: 12px; border: 1px solid #e2e8f0; gap: 4px; }
        .slider-btn { display: flex; align-items: center; gap: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; color: #64748b; border-radius: 8px; border: none; background: transparent; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
        .slider-btn:hover { color: #0f172a; }
        .slider-btn.active { background: #ffffff; color: #f97316; font-weight: 800; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }

        .search-wrapper { position: relative; flex: 1; max-width: 320px; min-width: 220px; display: flex; align-items: center; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 0 14px; height: 42px; transition: all 0.2s ease; }
        .search-wrapper:focus-within { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08); }
        .search-icon { color: #94a3b8; font-size: 14px; margin-right: 10px; flex-shrink: 0; }
        .search-input { border: none; background: transparent; font-size: 13px; font-weight: 500; color: #0f172a; width: 100%; outline: none; height: 100%; font-family: 'Inter', sans-serif; }
        .search-input::placeholder { color: #94a3b8; }

        .sku-code { font-size: 13px; font-weight: 500; color: #475569; }
        .product-name-cell { font-size: 13.5px; font-weight: 800; color: #1e293b; }
        .type-badge-wrap { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
        .type-badge-pill { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.03em; }
        .type-badge-pill.ingredient { background: #ffedd5; color: #c2410c; }
        .type-badge-pill.product { background: #e6f4ea; color: #137333; }
        .cat-text { font-size: 11px; color: #64748b; font-weight: 600; }

        .qty-badge-box { display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-weight: 800; font-size: 13px; color: #334155; }
        .qty-badge-box small { font-weight: 600; color: #64748b; text-transform: lowercase; }

        .cost-cell { font-size: 13.5px; font-weight: 600; color: #475569; }
        .value-cell { font-size: 13.5px; font-weight: 800; color: #1e293b; }
        .grand-total { font-size: 15px; color: #059669; font-weight: 900; }

        .pct-bar-wrap { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
        .pct-bar-track { height: 6px; width: 80px; background: #e2e8f0; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
        .pct-bar { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 3px; transition: width 0.5s ease-out; }
        .pct-text { font-size: 12px; font-weight: 800; color: #475569; min-width: 44px; text-align: right; }

        .empty-state { padding: 60px 0; text-align: center; color: #94a3b8; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
      `}</style>
    </DashboardLayout>
  );
}
