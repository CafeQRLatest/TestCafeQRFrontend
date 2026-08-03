import React, { useState, useEffect, useMemo } from 'react';

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

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(currentOrgId || '');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('ALL');
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('ALL'); // 'ALL' | 'PRODUCTS' | 'INGREDIENTS'
  const [sortField, setSortField] = useState('value');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    api.get('/api/v1/organizations')
      .then(res => {
        if (res.data?.success) {
          setOrganizations(res.data.data || []);
        }
      })
      .catch(() => {});
  }, []);

  const loadValuationData = async (orgIdVal, whIdVal) => {
    setLoading(true);
    try {
      const effectiveOrg = orgIdVal !== undefined ? orgIdVal : selectedOrgId;
      const effectiveWh = whIdVal !== undefined ? whIdVal : selectedWarehouseId;

      const params = {};
      if (effectiveOrg) params.orgId = effectiveOrg;

      const [wResp, pResp] = await Promise.all([
        api.get('/api/v1/warehouses', { params }).catch(err => {
          console.error("Failed to fetch warehouses:", err);
          return { data: { success: true, data: [] } };
        }),
        api.get('/api/v1/products', { params }).catch(err => {
          console.error("Failed to fetch products:", err);
          return { data: { success: true, data: [] } };
        })
      ]);

      const rawWarehouses = wResp.data?.data || [];
      setWarehouses(rawWarehouses);

      if (pResp.data && pResp.data.success) {
        setProducts(pResp.data.data || []);
      }

      // Correct endpoint: /api/v1/inventory/stock-overview
      let stockUrl = '/api/v1/inventory/stock-overview';
      let stockParams = {};
      if (effectiveWh && effectiveWh !== 'ALL') {
        stockUrl = `/api/v1/inventory/stock-overview/${effectiveWh}`;
      } else {
        if (effectiveOrg) stockParams.orgId = effectiveOrg;
      }

      const stockResp = await api.get(stockUrl, { params: stockParams }).catch(err => {
        console.error("Failed to fetch stock:", err);
        return { data: { success: true, data: [] } };
      });

      if (stockResp.data && stockResp.data.success) {
        setStock(stockResp.data.data || []);
      } else {
        setStock([]);
      }
    } catch (err) {
      console.error("Failed to load stock valuation data:", err);
      setStock([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadValuationData(selectedOrgId, selectedWarehouseId || 'ALL');
  }, [selectedOrgId]);

  const filteredWarehouses = useMemo(() => {
    if (!selectedOrgId) return warehouses;
    return warehouses.filter(w => {
      const wOrg = String(w.organizationId || w.organization_id || w.orgId || w.org_id || w.organization?.id || '');
      return !wOrg || String(wOrg) === String(selectedOrgId);
    });
  }, [warehouses, selectedOrgId]);


  // Build Valuation Items from granular Stock Snapshots & Products
  const allValuationItems = [];
  const processedKeys = new Set();

  // Pre-build set of productIds that have at least one variant snapshot
  const productsWithVariantSnapshots = new Set(
    (stock || [])
      .filter(s => s.variantId != null)
      .map(s => String(s.productId).toLowerCase())
  );

  (stock || []).forEach(s => {
    if (s.productId) {
      const pId = String(s.productId).toLowerCase();
      const vId = s.variantId ? String(s.variantId).toLowerCase() : null;

      // Skip base product snapshot if this product has variant-level snapshots
      if (!vId && productsWithVariantSnapshots.has(pId)) return;

      const key = vId ? `${pId}_${vId}` : pId;
      if (processedKeys.has(key)) return;
      processedKeys.add(key);

      const p = products.find(prod => String(prod.id).toLowerCase() === pId);
      const qty = Number(s.currentQuantity || 0);

      const unitCost = Number(
        s.variantCostPrice ?? s.unitCost ?? s.costPrice ?? p?.costPrice ?? p?.purchasePrice ?? p?.price ?? 0
      );
      const totalVal = qty * unitCost;

      const variantLabel = s.variantOptionName || s.variantName || s.variantLabel;
      const displayName = variantLabel ? `${p?.name || s.productName || 'Product'} (${variantLabel})` : (p?.name || s.productName || 'Unknown Product');

      const isIng = p ? (
        p.isIngredient === true ||
        p.is_ingredient === true ||
        String(p.isIngredient || p.is_ingredient || '').trim().toUpperCase() === 'Y' ||
        String(p.isIngredient || p.is_ingredient || '').trim().toUpperCase() === 'TRUE' ||
        String(p.type || p.productType || '').toUpperCase() === 'INGREDIENT' ||
        String(p.categoryName || '').toLowerCase().includes('ingredient')
      ) : false;

      allValuationItems.push({
        id: key,
        productId: s.productId,
        variantId: s.variantId || null,
        sku: p?.productCode || p?.sku || s.productCode || '—',
        productName: displayName,
        categoryName: p?.categoryName || s.categoryName || (isIng ? 'Ingredients' : 'General'),
        isIngredient: isIng,
        currentQuantity: qty,
        unitCost: unitCost,
        totalValue: totalVal,
        unitOfMeasure: p?.uomName || p?.unitOfMeasure || p?.uom || 'units'
      });
    }
  });

  // Fallback: add products with no stock snapshot at all (show 0 qty)
  // Skip products that have variant-level snapshots (they already appear as variants above)
  products.forEach(p => {
    const pId = String(p.id).toLowerCase();
    const isVariantProduct = p.hasVariants || Number(p.variantCount || 0) > 0;
    const isAlreadyPresent = Array.from(processedKeys).some(k => k === pId || k.startsWith(`${pId}_`));

    // Skip variant products entirely (they appear as their variant rows),
    // and skip non-variant products already in the list
    if (isVariantProduct || isAlreadyPresent) return;

    const isIng = (
      p.isIngredient === true ||
      p.is_ingredient === true ||
      String(p.isIngredient || p.is_ingredient || '').trim().toUpperCase() === 'Y' ||
      String(p.isIngredient || p.is_ingredient || '').trim().toUpperCase() === 'TRUE' ||
      String(p.type || p.productType || '').toUpperCase() === 'INGREDIENT' ||
      String(p.categoryName || '').toLowerCase().includes('ingredient')
    );

    allValuationItems.push({
      id: p.id,
      productId: p.id,
      sku: p.productCode || p.sku || '—',
      productName: p.name || 'Unknown Product',
      categoryName: p.categoryName || (isIng ? 'Ingredients' : 'General'),
      isIngredient: isIng,
      currentQuantity: 0,
      unitCost: Number(p.costPrice ?? p.purchasePrice ?? p.price ?? 0),
      totalValue: 0,
      unitOfMeasure: p.uomName || p.unitOfMeasure || p.uom || 'units'
    });
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
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 50;

  useEffect(() => {
    setPage(0);
  }, [searchTerm, itemTypeFilter, selectedOrgId, selectedWarehouseId]);

  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    return sortedData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [sortedData, page]);

  if (loading && warehouses.length === 0) return <div className="loading-state-premium"><span>Loading Stock Valuation...</span></div>;

  return (
    <DashboardLayout title="Stock Valuation" showBack={true}>
      <div className="val-container">

        {/* Toolbar Filters */}
        <div className="toolbar">
          <div className="toolbar-left">
            {/* Organization Filter */}
            {(isSuperAdmin || organizations.length > 0) && (
              <div className="wh-select-wrap">
                <NiceSelect
                  value={selectedOrgId}
                  onChange={(orgVal) => {
                    setSelectedOrgId(orgVal);
                    setSelectedWarehouseId('ALL');
                    loadValuationData(orgVal, 'ALL');
                  }}
                  options={[
                    { value: '', label: 'All Organizations' },
                    ...organizations.map(o => ({
                      value: o.id,
                      label: o.name || `Org #${o.id}`
                    }))
                  ]}
                  placeholder="Select Organization..."
                  style={{ minWidth: '200px' }}
                />
              </div>
            )}

            {/* Warehouse Filter */}
            <div className="wh-select-wrap">
              <NiceSelect
                value={selectedWarehouseId}
                onChange={(whId) => {
                  setSelectedWarehouseId(whId);
                  loadValuationData(selectedOrgId, whId);
                }}
                options={[
                  { value: 'ALL', label: 'All Warehouses' },
                  ...filteredWarehouses.map(w => ({
                    value: w.id,
                    label: `${w.name}${w.code ? ` (${w.code})` : ''}${w.isDefault ? ' ⭐ Default' : ''}`
                  }))
                ]}
                placeholder={filteredWarehouses.length === 0 ? "No warehouses found" : "Select Warehouse..."}
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
          data={paginatedData}
          emptyTitle="No stock valuation data"
          emptyText="No ingredients or products match the current filters and selected warehouse."
        />

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <button className="pg-btn" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</button>
            <span className="pg-info">Page {page + 1} of {totalPages} &nbsp;·&nbsp; {sortedData.length} items</span>
            <button className="pg-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>Next →</button>
          </div>
        )}

        <div className="report-footer">
          <span>Showing {paginatedData.length} of {sortedData.length} items</span>
        </div>
      </div>

      <style jsx>{`
        .val-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .val-container { padding: 0 16px 24px; } }

        .pagination-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 20px 0 10px; }
        .pg-btn { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 18px; font-size: 13px; font-weight: 700; color: #f97316; cursor: pointer; transition: all 0.2s; }
        .pg-btn:hover:not(:disabled) { background: #fff7ed; border-color: #f97316; }
        .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pg-info { font-size: 13px; font-weight: 700; color: #64748b; }
        .report-footer { padding: 12px 0; text-align: center; }
        .report-footer span { font-size: 12px; font-weight: 700; color: #94a3b8; }

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

