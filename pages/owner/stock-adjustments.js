import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import BranchRequiredGate from '../../components/BranchRequiredGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { formatTzDate } from '../../utils/timezoneUtils';
import { 
  FaSearch, FaWarehouse, FaTag, FaExchangeAlt, 
  FaTrash, FaPlus, FaMinus, FaFolderOpen, FaBoxOpen,
  FaCheckCircle, FaExclamationCircle, FaSave, FaChartLine
} from 'react-icons/fa';
import VariantSelector from '../../components/VariantSelector';

export default function StockAdjustmentsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']} requiredMenu="Stock">
      <ModuleGate>
        <BranchRequiredGate>
          <AdjustmentContent />
        </BranchRequiredGate>
      </ModuleGate>
    </RoleGate>
  );
}

function AdjustmentContent() {
  const { timezone } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [showDraftModal, setShowDraftModal] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [productSearch, setProductSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeVariantProduct, setActiveVariantProduct] = useState(null);
  const searchWrapRef = useRef(null);

  const [adjustment, setAdjustment] = useState({
    adjustmentNumber: `ADJ-${Date.now().toString().slice(-6)}`,
    adjustmentDate: new Date().toISOString(),
    warehouseId: '',
    reason: 'AUDIT',
    status: 'DRAFT',
    lines: [],
    notes: ''
  });

  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');

  useEffect(() => {
    fetchInitialData();
    fetchDrafts();
    const handleClickOutside = (event) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      if (wResp.data && wResp.data.success) setWarehouses(wResp.data.data || []);
      if (pResp.data && pResp.data.success) {
        setProducts((pResp.data.data || []).filter(p => p.isactive !== 'N' && p.isActive !== false));
      }
    } catch (err) {
      console.error("Failed to load initial data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrafts = async () => {
    try {
      const resp = await api.get('/api/v1/inventory/adjustments?status=DRAFT');
      if (resp.data.success) setDrafts(resp.data.data || []);
    } catch (err) {
      console.warn("Failed to load drafts");
    }
  };

  const [sourceStock, setSourceStock] = useState({});
  const [fetchingStock, setFetchingStock] = useState(false);

  const fetchSourceStock = async (whId) => {
    if (!whId) return;
    setFetchingStock(true);
    try {
      const resp = await api.get(`/api/v1/inventory/stock-overview/${whId}`);
      if (resp.data.success) {
        const stockMap = {};
        (resp.data.data || []).forEach(s => {
          s.currentStock = s.currentQuantity;
          stockMap[s.productId] = s;
        });
        setSourceStock(stockMap);
      }
    } catch (err) {
      console.warn("Failed to fetch location stock");
    } finally {
      setFetchingStock(false);
    }
  };

  useEffect(() => {
    if (adjustment.warehouseId) fetchSourceStock(adjustment.warehouseId);
  }, [adjustment.warehouseId]);

  const loadDraft = (d) => {
    setAdjustment({
      id: d.id,
      adjustmentNumber: d.adjustmentNumber,
      adjustmentDate: d.adjustmentDate,
      warehouseId: d.warehouseId,
      reason: d.reason,
      status: d.status,
      lines: d.lines || [],
      notes: d.notes || ''
    });
    setShowDraftModal(false);
    showToast(`Loaded ${d.adjustmentNumber}`, "success");
  };

  const addProductToManifest = (product) => {
    const hasVariants = (product.variantMappings && product.variantMappings.length > 0) || (product.variantPricings && product.variantPricings.length > 0);
    if (hasVariants) {
      setActiveVariantProduct(product);
      setShowSuggestions(false);
      return;
    }

    const exists = adjustment.lines.find(l => l.productId === product.id && !l.variantId);
    if (exists) {
      showToast(`${product.name} is already in the list`, "error");
      return;
    }

    const newLine = {
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      categoryName: product.categoryName,
      unitName: product.unitName,
      quantityChange: 1,
      unitCost: product.costPrice || 0
    };

    setAdjustment({ ...adjustment, lines: [newLine, ...adjustment.lines] });
    setProductSearch("");
    setShowSuggestions(false);
  };

  const handleVariantSelect = (selectedVariant) => {
    if (!activeVariantProduct) return;
    const exists = adjustment.lines.find(l => l.productId === activeVariantProduct.id && l.variantId === selectedVariant.id);
    if (exists) {
      showToast(`${activeVariantProduct.name} (${selectedVariant.label}) is already in the list`, "error");
      return;
    }

    const newLine = {
      productId: activeVariantProduct.id,
      variantId: selectedVariant.id,
      productName: `${activeVariantProduct.name} (${selectedVariant.label})`,
      productCode: activeVariantProduct.productCode,
      categoryName: activeVariantProduct.categoryName,
      unitName: activeVariantProduct.unitName,
      quantityChange: 1,
      unitCost: selectedVariant.price || activeVariantProduct.costPrice || 0
    };

    setAdjustment({ ...adjustment, lines: [newLine, ...adjustment.lines] });
    setProductSearch("");
    setActiveVariantProduct(null);
  };

  const updateLineQty = (idx, val) => {
    const newLines = [...adjustment.lines];
    newLines[idx].quantityChange = val;
    setAdjustment({ ...adjustment, lines: newLines });
  };

  const removeLine = (idx) => {
    const newLines = adjustment.lines.filter((_, i) => i !== idx);
    setAdjustment({ ...adjustment, lines: newLines });
  };

  const handleSave = async (targetStatus) => {
    const finalStatus = targetStatus;

    if (!adjustment.warehouseId) return showToast("Select Warehouse", "error");
    if (!adjustment.lines || adjustment.lines.length === 0) return showToast("Add items for adjustment", "error");
    
    setSaving(true);
    try {
      const payload = { ...adjustment, status: finalStatus };
      const method = adjustment.id ? 'put' : 'post';
      const url = adjustment.id 
        ? `/api/v1/inventory/adjustments/${adjustment.id}` 
        : '/api/v1/inventory/adjustments';
      
      const resp = await api[method](url, payload);
      
      if (resp.data.success) {
        showToast(`Adjustment ${finalStatus === 'COMPLETED' ? 'Executed' : 'Saved'}!`, "success");
        setAdjustment({
          adjustmentNumber: `ADJ-${Date.now().toString().slice(-6)}`,
          adjustmentDate: new Date().toISOString(),
          warehouseId: '',
          reason: 'AUDIT',
          status: 'DRAFT',
          lines: [],
          notes: ''
        });
        setProductSearch("");
        fetchDrafts();
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const showToast = (msg, type) => {
    setMessage(msg);
    setMsgType(type);
    setTimeout(() => setMessage(null), 3000);
  };

  const totalItems = adjustment.lines.length;
  const totalQtyChange = adjustment.lines.reduce((acc, l) => acc + (l.quantityChange || 0), 0);
  const warehouseOptions = warehouses.map(w => ({ value: w.id, label: w.name }));
  const reasonOptions = [
    { value: 'AUDIT', label: 'AUDIT CORRECTION' },
    { value: 'WASTAGE', label: 'WASTAGE / SPOILAGE' },
    { value: 'DAMAGE', label: 'PHYSICAL DAMAGE' },
    { value: 'EXPIRY', label: 'EXPIRY' }
  ];

  const filteredSuggestions = productSearch.trim() === "" 
    ? products.slice(0, 15) 
    : products.filter(p => 
        (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) || 
        (p.productCode || "").toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 15);

  if (loading) return <div className="loading-state-premium"><span>Optimizing Audit Workspace...</span></div>;

  return (
    <DashboardLayout title="" showBack={true}>
      <div className="premium-fluid-wrapper">
        <div className="fluid-grid">
          <div className="fluid-main">
            
            <div className="premium-card routing-hub-card">
              <div className="hub-content">
                <div className="wh-field">
                  <div className="wh-label-row">
                    <FaWarehouse className="wh-icon" />
                    <span className="wh-label">Adjustment Warehouse</span>
                  </div>
                  <NiceSelect 
                    placeholder="Select Warehouse..."
                    options={warehouseOptions}
                    value={adjustment.warehouseId}
                    onChange={(val) => setAdjustment({...adjustment, warehouseId: val})}
                  />
                </div>

                <div className="wh-field">
                  <div className="wh-label-row">
                    <FaTag className="wh-icon" />
                    <span className="wh-label">Adjustment Reason</span>
                  </div>
                  <NiceSelect 
                    placeholder="Select Reason..."
                    options={reasonOptions}
                    value={adjustment.reason}
                    onChange={(val) => setAdjustment({...adjustment, reason: val})}
                  />
                </div>
              </div>
            </div>

            <div className="search-wrap catalog-search-wrap" ref={searchWrapRef}>
              <div className="search-bar product">
                <FaSearch className="search-icon" />
                <input 
                  autoFocus={true}
                  type="text" 
                  placeholder="Search products..." 
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />
                {productSearch && (
                  <button className="clear-search" onClick={() => setProductSearch("")}>&times;</button>
                )}
              </div>
                 
                 {showSuggestions && (
                   <div className="suggestions-popover">
                     {filteredSuggestions.length === 0 ? (
                        <div className="no-sug">No products found matching &quot;{productSearch}&quot;</div>
                     ) : (
                       filteredSuggestions.map(p => (
                         <div key={p.id} className="sug-item" onClick={() => addProductToManifest(p)}>
                           <div className="sug-left">
                             <div className="sug-name">{p.name}</div>
                             <div className="sug-cat">{p.categoryName} • {p.productCode || 'NO SKU'}</div>
                           </div>
                           <div className="sug-stock success">
                             {sourceStock[p.id]?.currentStock || 0} {p.unitName}
                           </div>
                         </div>
                       ))
                     )}
                   </div>
                 )}
            </div>

            <div className="premium-card cart-card" style={{marginTop: '0'}}>
                <div className="cart-table-wrapper">
                {adjustment.lines.length === 0 ? (
                  <div className="empty-cart-classic">
                    <div className="empty-cart-icon-box"><FaBoxOpen /></div>
                    <p className="empty-primary">Manifest is empty</p>
                    <span className="empty-secondary">Add products from your catalog to begin adjustment</span>
                  </div>
                ) : (
                    <>
                    <table className="classic-cart-table">
                      <thead>
                        <tr>
                          <th className="col-idx">#</th>
                          <th className="col-product">Product</th>
                          <th className="col-stock">Current Stock</th>
                          <th className="col-qty">Adjustment Qty (+/-)</th>
                          <th className="col-action"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjustment.lines.map((line, idx) => {
                          const p = products.find(prod => prod.id === line.productId) || line;
                          const currentStockVal = sourceStock[line.productId]?.currentStock !== undefined ? sourceStock[line.productId].currentStock : 0;
                          return (
                            <tr key={idx}>
                              <td className="col-idx">{idx + 1}</td>
                              <td className="col-product">
                                <div className="p-name">{line.productName || p.name}</div>
                                <div className="p-meta">
                                   {line.productCode && <span className="p-sku">#{line.productCode}</span>}
                                   <span className="p-category">{line.categoryName || p.categoryName}</span>
                                </div>
                              </td>
                              <td className="col-stock">
                                <div className="classic-pill success" style={{ background: '#ecfdf5', color: '#059669', display: 'inline-flex', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                  {currentStockVal} {line.unitName || p.unitName || 'units'}
                                </div>
                              </td>
                              <td className="col-qty">
                                <div className="classic-qty-group">
                                   <button className="qty-btn" onClick={() => updateLineQty(idx, (line.quantityChange || 0) - 1)}><FaMinus /></button>
                                   <div className="qty-num">
                                      <input 
                                        type="number" 
                                        className="qty-raw-input"
                                        value={line.quantityChange}
                                        onChange={(e) => updateLineQty(idx, parseFloat(e.target.value) || 0)}
                                      />
                                   </div>
                                   <button className="qty-btn" onClick={() => updateLineQty(idx, (line.quantityChange || 0) + 1)}><FaPlus /></button>
                                </div>
                              </td>
                              <td className="col-action">
                                <button className="classic-trash" onClick={() => removeLine(idx)}><FaTrash/></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mobile-cart-list">
                      {adjustment.lines.map((line, idx) => {
                        const p = products.find(prod => prod.id === line.productId) || line;
                        return (
                          <div key={idx} className="mobile-cart-item">
                            <div className="m-item-head">
                              <div className="m-item-info">
                                <span className="m-item-name">{line.productName || p.name}</span>
                                <span className="m-item-meta">{line.productCode && `#${line.productCode} • `}{line.categoryName || p.categoryName}</span>
                              </div>
                              <button className="m-item-remove" onClick={() => removeLine(idx)}><FaTrash /></button>
                            </div>
                            <div className="m-item-controls">
                               <span className="stock-pill">Current: {sourceStock[p.id]?.currentStock || 0}</span>
                               <div className="classic-qty-group small">
                                 <button className="qty-btn" onClick={() => updateLineQty(idx, (line.quantityChange || 0) - 1)}><FaMinus /></button>
                                 <div className="qty-num">
                                    <input 
                                      type="number" 
                                      className="qty-raw-input"
                                      value={line.quantityChange}
                                      onChange={(e) => updateLineQty(idx, parseFloat(e.target.value) || 0)}
                                    />
                                 </div>
                                 <button className="qty-btn" onClick={() => updateLineQty(idx, (line.quantityChange || 0) + 1)}><FaPlus /></button>
                               </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </>
                )}
                </div>
            </div>

             <div className="premium-card notes-card" style={{marginTop: '0'}}>
               <textarea 
                 className="premium-textarea" 
                 placeholder="Audit Notes..."
                 value={adjustment.notes}
                 onChange={(e) => setAdjustment({...adjustment, notes: e.target.value})}
               />
            </div>
          </div>

          <div className="fluid-sidebar">
             <div className="premium-card summary-card">
                <div className="summary-list">
                  <div className="sm-item">
                    <span className="sm-label">Document:</span>
                    <div style={{display:'flex', alignItems:'center', gap: '8px'}}>
                      <span className="sm-value">{adjustment.adjustmentNumber}</span>
                      <button className="invoke-btn" onClick={() => setShowDraftModal(true)} title="Load Drafts">
                        <FaFolderOpen />
                      </button>
                    </div>
                  </div>
                  <div className="sm-item">
                    <span className="sm-label">Location:</span>
                    <span className="sm-value">{warehouses.find(w => w.id === adjustment.warehouseId)?.name || 'Select Warehouse'}</span>
                  </div>
                  <div className="sm-item">
                    <span className="sm-label">Reason:</span>
                    <span className="sm-value">{reasonOptions.find(r => r.value === adjustment.reason)?.label}</span>
                  </div>
                </div>

                <div className="comp-stats-box">
                  <div className="cs-row">
                    <span>Products Affected</span>
                    <span className="cs-val">{totalItems}</span>
                  </div>
                  <div className="cs-row accent">
                    <span>Net Quantity Change</span>
                    <span className={`cs-val ${totalQtyChange < 0 ? 'neg' : ''}`}>
                      {totalQtyChange > 0 ? '+' : ''}{totalQtyChange}
                    </span>
                  </div>
                </div>

                <div className="comp-action-stack">
                   <button 
                     className="action-prime"
                     onClick={() => handleSave('COMPLETED')}
                     disabled={saving || adjustment.lines.length === 0}
                   >
                     {saving ? "..." : "Commit Adjustment"}
                   </button>
                   
                   <button 
                     className="action-sec"
                     onClick={() => handleSave('DRAFT')}
                     disabled={saving || adjustment.lines.length === 0}
                   >
                     <FaSave /> Save Draft
                   </button>
                </div>
             </div>
          </div>
        </div>

        {/* Sticky Mobile Action Bar */}
        {adjustment.lines.length > 0 && (
          <div className="mobile-action-bar">
            <div className="ma-info">
              <span className={`ma-qty ${totalQtyChange < 0 ? 'neg' : ''}`}>
                {totalQtyChange > 0 ? '+' : ''}{totalQtyChange} Net
              </span>
              <span className="ma-count">{totalItems} Products</span>
            </div>
            <button className="ma-btn" onClick={() => handleSave('COMPLETED')}>
              Commit
            </button>
          </div>
        )}

        {showDraftModal && (
          <div className="draft-modal-overlay">
            <div className="draft-modal">
              <div className="modal-head">
                <h3>Draft Corrections Hub</h3>
                <button onClick={() => setShowDraftModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                {drafts.length === 0 ? (
                  <div className="no-drafts">No pending drafts found.</div>
                ) : (
                  <div className="draft-grid">
                    {drafts.map(d => (
                      <div key={d.id} className="draft-tile" onClick={() => loadDraft(d)}>
                        <div className="tile-main">
                          <span className="tile-id">{d.adjustmentNumber}</span>
                          <span className="tile-date">{formatTzDate(d.adjustmentDate, timezone, { format: 'date' })}</span>
                        </div>
                        <div className="tile-route">
                          {warehouses.find(w => w.id === d.warehouseId)?.name || 'N/A'} &bull; {d.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div className={`classic-toast ${msgType}`} onClick={() => setMessage(null)}>
          {msgType === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
          <span>{message}</span>
        </div>
      )}

      {activeVariantProduct && (
        <VariantSelector
          product={activeVariantProduct}
          onClose={() => setActiveVariantProduct(null)}
          stockMap={sourceStock}
          onSelect={handleVariantSelect}
        />
      )}

      <style jsx>{`
        /* Re-Stabilized Professional Layout */
        .premium-fluid-wrapper { width: 100%; padding: 16px; background: #f8fafc; min-height: 100vh; font-family: 'Inter', sans-serif; }
        .fluid-grid { display: flex; gap: 16px; align-items: flex-start; max-width: 1500px; margin: 0 auto; width: 100%; }
        .fluid-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
        .fluid-sidebar { width: 320px; flex-shrink: 0; position: sticky; top: 16px; }

        .premium-card { background: white; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; }
        .routing-hub-card { border-top: 3px solid #f97316; }
        .hub-content { display: flex; align-items: center; gap: 16px; }
        .wh-field { flex: 1; }
        .wh-label-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .wh-icon { font-size: 12px; color: #f97316; }
        .wh-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

        /* Search Bar Brand Overhaul */
        .search-wrap { position: relative; width: 100%; }
        .search-bar.product { display: flex; align-items: center; border: 2px solid #e2e8f0; border-radius: 12px; height: 56px; padding: 0 20px; background: #fff; transition: 0.3s; }
        .search-bar.product:focus-within { border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); }
        .search-icon { color: #f97316; font-size: 18px; }
        .search-bar.product input { flex: 1; border: none; outline: none; padding-left: 15px; font-size: 16px; font-weight: 600; color: #0f172a; }
        .clear-search { background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }

        .suggestions-popover { position: absolute; top: calc(100% + 8px); left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 1000; max-height: 400px; overflow-y: auto; }
        .sug-item { padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
        .sug-item:hover { background: #fff7ed; }
        .sug-name { font-size: 14px; font-weight: 700; color: #0f172a; }
        .sug-cat { font-size: 11px; color: #f97316; font-weight: 700; text-transform: uppercase; }
        .sug-stock { font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 6px; }

        /* Manifest Table Overhaul */
        .cart-table-wrapper { width: 100%; overflow-x: auto; }
        .classic-cart-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .classic-cart-table th { padding: 12px 16px; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; text-align: left; }
        .classic-cart-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        
        .col-idx { width: 40px; }
        .col-product { width: auto; }
        .col-qty { width: 180px; }
        .col-action { width: 60px; text-align: right; }

        .p-name { font-size: 14px; font-weight: 800; color: #0f172a; }
        .p-meta { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; margin-top: 2px; }
        .p-sku { color: #94a3b8; }
        .p-category { color: #f97316; text-transform: uppercase; }

        /* Tactical Tactical Qty Control */
        .classic-qty-group { display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 3px; width: fit-content; }
        .qty-btn { width: 28px; height: 28px; border-radius: 7px; border: none; background: white; cursor: pointer; color: #0f172a; display: flex; align-items: center; justify-content: center; font-size: 11px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .qty-btn:hover { background: #0f172a; color: white; }
        .qty-num { min-width: 40px; }
        .qty-raw-input { background: transparent; border: none; outline: none; width: 100%; text-align: center; font-size: 14px; font-weight: 800; color: #0f172a; }

        .classic-trash { background: none; border: none; color: #ef4444; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; opacity: 0.7; }
        .classic-trash:hover { opacity: 1; transform: scale(1.1); }

        .premium-textarea { width: 100%; min-height: 80px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; font-family: inherit; font-size: 13px; font-weight: 600; resize: vertical; margin-top: 8px; outline: none; }
        .premium-textarea:focus { border-color: #f97316; }

        /* Summary Sidebar */
        .comp-summary-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 16px; }
        .summary-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .sm-item { display: flex; justify-content: space-between; font-size: 12px; color: #1e293b; }
        .sm-label { font-weight: 600; color: #64748b; }
        .sm-value { font-weight: 700; color: #0f172a; text-align: right; }

        .comp-stats-box { background: #f1f5f9; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
        .cs-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; }
        .cs-row.accent { padding-top: 8px; border-top: 1px dashed #cbd5e1; margin-top: 8px; color: #0f172a; }
        .cs-val { font-size: 14px; font-weight: 800; color: #0f172a; }
        .cs-val.neg { color: #dc2626; }
        .accent .cs-val { color: #f97316; font-size: 18px; }

        .comp-action-stack { display: flex; flex-direction: column; gap: 12px; width: 100%; }
        .action-prime { background: #f97316; color: white; border: none; padding: 16px; border-radius: 12px; font-size: 15px; font-weight: 800; cursor: pointer; width: 100%; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2); }
        .action-sec { background: #fff; color: #0f172a; border: 2px solid #e2e8f0; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; cursor: pointer; }

        /* Empty Cart */
        .empty-cart-classic { padding: 40px; text-align: center; }
        .empty-cart-icon-box { background: #f8fafc; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #94a3b8; font-size: 24px; }
        .empty-primary { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
        .empty-secondary { font-size: 12px; color: #64748b; font-weight: 600; }

        /* Draft Modal */
        .draft-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .draft-modal { background: white; width: 100%; max-width: 500px; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid #e2e8f0; border-top: 3px solid #f97316; }
        .modal-head { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .modal-head h3 { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
        .modal-body { padding: 12px; max-height: 400px; overflow-y: auto; }
        .draft-tile { padding: 12px; border: 1px solid #f1f5f9; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: 0.2s; }
        .draft-tile:hover { border-color: #f97316; background: #fff7ed; }
        .tile-main { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .tile-id { font-size: 13px; font-weight: 700; color: #0f172a; }
        .tile-date { font-size: 11px; color: #64748b; }
        .tile-route { font-size: 11px; font-weight: 600; color: #334155; }
        .no-drafts { padding: 40px; text-align: center; color: #64748b; font-size: 14px; }
        
        .invoke-btn { background: #f1f5f9; border: none; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #f97316; cursor: pointer; transition: 0.2s; }
        .invoke-btn:hover { background: #f97316; color: white; }

        .classic-toast { position: fixed; bottom: 32px; right: 32px; padding: 16px 24px; border-radius: 12px; background: #1e293b; color: white; display: flex; align-items: center; gap: 12px; font-weight: 700; box-shadow: 0 20px 40px rgba(0,0,0,0.15); z-index: 1000; }
        .classic-toast.success { border-left: 4px solid #10b981; }
        .classic-toast.error { border-left: 4px solid #ef4444; }

        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; background: #f8fafc; }

        @media (max-width: 1200px) {
            .fluid-grid { flex-direction: column; width: 100%; }
            .fluid-sidebar { width: 100%; position: static; margin-top: 16px; }
        }

        @media (max-width: 768px) {
            .mobile-action-bar {
              position: fixed; bottom: 0; left: 0; right: 0;
              background: #0f172a; color: white;
              padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
              z-index: 1000; box-shadow: 0 -8px 24px rgba(0,0,0,0.15);
              border-top: 1px solid rgba(255,255,255,0.1);
            }
            .ma-info { display: flex; flex-direction: column; }
            .ma-qty { font-size: 16px; font-weight: 800; color: #f97316; }
            .ma-qty.neg { color: #ef4444; }
            .ma-count { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
            .ma-btn { background: #f97316; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 800; font-size: 14px; }
            
            .premium-fluid-wrapper { padding-bottom: 80px; } /* Space for navbar */
            .hub-content { flex-direction: column; align-items: stretch; gap: 8px; }

            .classic-cart-table { display: none; }
            .mobile-cart-list { display: flex; flex-direction: column; gap: 10px; padding: 10px 0; }
            .mobile-cart-item { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
            .m-item-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
            .m-item-info { display: flex; flex-direction: column; gap: 2px; }
            .m-item-name { font-size: 14px; font-weight: 800; color: #0f172a; }
            .m-item-meta { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
            .m-item-remove { background: none; border: none; color: #ef4444; font-size: 14px; padding: 4px; }
            .m-item-controls { display: flex; justify-content: space-between; align-items: center; }
            .stock-pill { font-size: 11px; font-weight: 800; color: #64748b; }
            .classic-qty-group.small { padding: 2px; }
            .classic-qty-group.small .qty-btn { width: 24px; height: 24px; font-size: 9px; }
            .classic-qty-group.small .qty-num { min-width: 28px; }
            .classic-qty-group.small .qty-raw-input { font-size: 12px; }

            .search-bar.product { height: 48px; padding: 0 12px; }
            .search-bar.product input { font-size: 14px; padding-left: 10px; }
        }

        @media (min-width: 769px) {
            .mobile-cart-list { display: none; }
        }
      `}</style>
    </DashboardLayout>
  );
}
