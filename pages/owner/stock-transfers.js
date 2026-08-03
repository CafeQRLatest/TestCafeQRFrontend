import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import BranchRequiredGate from '../../components/BranchRequiredGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { formatTzDate } from '../../utils/timezoneUtils';
import { 
  FaExchangeAlt, FaTrash, FaSearch, FaSave,
  FaWarehouse, FaMapMarkerAlt, FaPlus, FaMinus,
  FaFolderOpen, FaBoxOpen, FaHistory
} from 'react-icons/fa';

export default function StockTransfersPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Stock">
      <ModuleGate>
        <BranchRequiredGate>
          <TransferContent />
        </BranchRequiredGate>
      </ModuleGate>
    </RoleGate>
  );
}

function TransferContent() {
  const { timezone, userRole, clientId, orgId } = useAuth();
  const { notify } = useNotification();
  const currentOrgId = orgId || (typeof window !== 'undefined' ? (require('js-cookie').default.get('orgId') || '') : '');
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [sourceStock, setSourceStock] = useState({});
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoTransfer, setAutoTransfer] = useState(false);
  const [fetchingStock, setFetchingStock] = useState(false);
  
  const [productSearch, setProductSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapRef = useRef(null);

  const [transfer, setTransfer] = useState({
    transferNumber: 'Auto Generated',
    transferDate: new Date().toISOString(),
    sourceWarehouseId: '',
    destWarehouseId: '',
    status: 'DRAFT',
    lines: []
  });

  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');

  const showToast = (msg, type = 'success') => {
    notify(type === 'error' ? 'error' : 'success', msg);
  };

  const [drafts, setDrafts] = useState([]);
  const [showDraftModal, setShowDraftModal] = useState(false);

  useEffect(() => {
    fetchInitialData();
    fetchDrafts();
    const handleClickOutside = (event) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (transfer.sourceWarehouseId) {
      fetchSourceStock(transfer.sourceWarehouseId);
    } else {
      setSourceStock({});
    }
  }, [transfer.sourceWarehouseId]);

  // Restrict Source Warehouse ONLY to the active/logged-in organization's warehouses
  const sourceWarehouses = useMemo(() => {
    return warehouses.filter(w => {
      if (!currentOrgId) return true;
      const wOrg = String(w.organizationId || w.organization_id || w.orgId || w.org_id || '');
      return !wOrg || String(wOrg) === String(currentOrgId);
    });
  }, [warehouses, currentOrgId]);

  const sourceWarehouseOptions = useMemo(() => {
    return sourceWarehouses.map(w => ({ value: w.id, label: w.name }));
  }, [sourceWarehouses]);

  useEffect(() => {
    if (sourceWarehouses.length > 0) {
      const defaultWh = sourceWarehouses.find(w => w.isDefault) || sourceWarehouses[0];
      setTransfer(prev => {
        const isCurrentValid = sourceWarehouses.some(w => w.id === prev.sourceWarehouseId);
        if (!isCurrentValid && defaultWh) {
          return { ...prev, sourceWarehouseId: defaultWh.id };
        }
        return prev;
      });
    }
  }, [sourceWarehouses]);

  const fetchInitialData = async () => {
    try {
      const [wResp, pResp] = await Promise.all([
        api.get('/api/v1/warehouses'),
        api.get('/api/v1/products')
      ]);
      if (wResp.data.success) {
        const allWh = wResp.data.data || [];
        setWarehouses(allWh);

        // For non-SUPER_ADMIN: auto-select the branch's warehouse as source
        if (userRole !== 'SUPER_ADMIN' && clientId) {
          const branchWh = allWh.find(w =>
            String(w.clientId || w.client_id || '') === String(clientId)
          );
          if (branchWh) {
            setTransfer(prev => ({ ...prev, sourceWarehouseId: branchWh.id }));
          }
        }
      }
      if (pResp.data.success) {
        setProducts((pResp.data.data || []).filter(p => p.isActive !== false && p.isactive !== 'N'));
      }
    } catch (err) {
      console.error("Failed to load generics:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrafts = async () => {
    try {
      const resp = await api.get('/api/v1/inventory/transfers?status=DRAFT');
      if (resp.data.success) setDrafts(resp.data.data || []);
    } catch (err) {
      console.warn("Failed to load drafts");
    }
  };

  const loadDraft = (d) => {
    setTransfer({
      id: d.id,
      transferNumber: d.transferNumber,
      transferDate: d.transferDate,
      sourceWarehouseId: d.sourceWarehouseId,
      destWarehouseId: d.destWarehouseId,
      status: d.status,
      lines: d.lines || []
    });
    if (d.sourceWarehouseId) fetchSourceStock(d.sourceWarehouseId);
    setShowDraftModal(false);
    showToast(`Loaded ${d.transferNumber}`, "success");
  };

  const fetchSourceStock = async (warehouseId) => {
    setFetchingStock(true);
    try {
      const resp = await api.get(`/api/v1/inventory/stock-overview/${warehouseId}`);
      if (resp.data.success) {
        const stockMap = {};
        (resp.data.data || []).forEach(item => {
          item.currentStock = item.currentQuantity;
          stockMap[item.productId] = item;
        });
        setSourceStock(stockMap);
      }
    } catch (err) {
      console.warn("Could not fetch stock overview:", err);
    } finally {
      setFetchingStock(false);
    }
  };

  const handleSave = async (targetStatus = 'DRAFT') => {
    const finalStatus = targetStatus === 'SUBMIT'
      ? (autoTransfer ? 'COMPLETED' : 'IN_TRANSIT')
      : targetStatus;

    if (!transfer.sourceWarehouseId) return showToast("Please select a Source Warehouse", "error");
    if (!transfer.destWarehouseId) return showToast("Please select a Target Warehouse", "error");
    if (transfer.sourceWarehouseId === transfer.destWarehouseId) return showToast("Source and Target Warehouses must be different", "error");
    if (!transfer.lines || transfer.lines.length === 0) return showToast("Please add at least one product item to your transfer cart", "error");
    
    const invalidQtyLine = transfer.lines.find(l => !l.transferQuantity || Number(l.transferQuantity) <= 0);
    if (invalidQtyLine) return showToast("Transfer quantity for all items must be at least 1", "error");

    const zeroStockItem = transfer.lines.find(l => {
      const current = sourceStock[l.productId]?.currentStock || 0;
      return current <= 0;
    });

    if (zeroStockItem && finalStatus !== 'DRAFT') {
      return showToast(`Cannot transfer non-stock item "${zeroStockItem.productName || 'product'}". Source stock is 0.`, "error");
    }

    const overdraftItem = transfer.lines.find(l => {
      const current = sourceStock[l.productId]?.currentStock || 0;
      return (Number(l.transferQuantity) || 0) > current;
    });

    if (overdraftItem && finalStatus !== 'DRAFT') {
      return showToast(`Transfer quantity for "${overdraftItem.productName || 'product'}" exceeds available stock.`, "error");
    }

    setSaving(true);
    try {
      const payload = {
        ...transfer,
        transferNumber: (transfer.transferNumber === 'Auto Generated' || !transfer.transferNumber) ? null : transfer.transferNumber,
        orgId: transfer.orgId || currentOrgId,
        status: finalStatus,
        lines: transfer.lines.map(l => ({
          ...l,
          transferQuantity: Number(l.transferQuantity) || 1
        }))
      };
      const method = transfer.id ? 'put' : 'post';
      const url = transfer.id 
        ? `/api/v1/inventory/transfers/${transfer.id}` 
        : '/api/v1/inventory/transfers';
      
      const resp = await api[method](url, payload);
      
      if (resp.data.success) {
        const toastMsg = finalStatus === 'COMPLETED'
          ? 'Stock Transfer Executed Successfully!'
          : finalStatus === 'IN_TRANSIT'
          ? 'Transfer Sent for Destination Confirmation.'
          : 'Draft Saved.';
        showToast(toastMsg, "success");
        setTransfer({
          transferNumber: 'Auto Generated',
          transferDate: new Date().toISOString(),
          sourceWarehouseId: sourceWarehouseOptions[0]?.value || '',
          destWarehouseId: '',
          status: 'DRAFT',
          lines: []
        });
        setSourceStock({});
        setProductSearch("");
        fetchDrafts();
      } else {
        showToast(resp.data.message || "Failed to execute transfer", "error");
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message || "Failed to execute transfer", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddProduct = (product) => {
    const stockObj = sourceStock[product.id];
    const available = stockObj ? (Number(stockObj.currentStock) || 0) : 0;
    
    const existingIdx = transfer.lines.findIndex(l => l.productId === product.id);
    if (existingIdx >= 0) {
      const currentQty = Number(transfer.lines[existingIdx].transferQuantity) || 0;
      if (transfer.sourceWarehouseId && available > 0 && currentQty >= available) {
        showToast(`Warning: quantity exceeds available stock (${available} units) for ${product.name}`, "error");
      }
      const newLines = [...transfer.lines];
      newLines[existingIdx].transferQuantity = currentQty + 1;
      setTransfer({ ...transfer, lines: newLines });
    } else {
      setTransfer({ ...transfer, lines: [...transfer.lines, { productId: product.id, transferQuantity: 1 }] });
      if (transfer.sourceWarehouseId && available <= 0) {
        showToast(`"${product.name}" added (0 available stock in source warehouse)`, "error");
      }
    }
    setProductSearch("");
    setShowSuggestions(false);
  };

  const updateLineQty = (index, value, maxStock = Infinity) => {
    if (value === '' || value === null || value === undefined) {
      const newLines = [...transfer.lines];
      newLines[index].transferQuantity = '';
      setTransfer({ ...transfer, lines: newLines });
      return;
    }

    const rawNum = parseInt(value, 10);
    if (isNaN(rawNum) || rawNum < 1) {
      const newLines = [...transfer.lines];
      newLines[index].transferQuantity = 1;
      setTransfer({ ...transfer, lines: newLines });
      return;
    }

    let qty = rawNum;
    if (transfer.sourceWarehouseId && maxStock < Infinity && qty > maxStock) {
      qty = Math.max(1, maxStock);
      showToast(`Quantity capped at available stock (${maxStock} units)`, "error");
    }

    const newLines = [...transfer.lines];
    newLines[index].transferQuantity = qty;
    setTransfer({ ...transfer, lines: newLines });
  };

  const removeLine = (index) => {
    const newLines = transfer.lines.filter((_, i) => i !== index);
    setTransfer({ ...transfer, lines: newLines });
  };

  if (loading) return <div className="loading-state">Loading Module...</div>;

  const totalItems = transfer.lines.length;
  const totalUnits = transfer.lines.reduce((sum, line) => sum + (Number(line.transferQuantity) || 0), 0);

  const swapWarehouses = () => {
    setTransfer(prev => ({
      ...prev,
      sourceWarehouseId: prev.destWarehouseId,
      destWarehouseId: prev.sourceWarehouseId
    }));
  };

  const getSourceWhName = () => warehouses.find(w => w.id === transfer.sourceWarehouseId)?.name || 'Origin';
  const getDestWhName = () => warehouses.find(w => w.id === transfer.destWarehouseId)?.name || 'Target';


  const warehouseOptions = warehouses.map(w => ({ value: w.id, label: w.name }));

  const filteredSuggestions = productSearch.trim() === "" 
    ? products.slice(0, 15) 
    : products.filter(p => 
        (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) || 
        (p.productCode || "").toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 15);

  return (
    <DashboardLayout title="" showBack={true}>
      <div className="premium-fluid-wrapper">
        <div className="fluid-grid">
          <div className="fluid-main">
            
            <div className="premium-card routing-hub-card">
              <div className="hub-content">
                <div className="wh-field">
                  <div className="wh-label-row">
                    <FaWarehouse className="wh-icon src" />
                    <span className="wh-label">Source Warehouse <span style={{ color: '#ef4444' }}>*</span></span>
                  </div>
                  <NiceSelect 
                    placeholder="Select Source..."
                    options={sourceWarehouseOptions}
                    value={transfer.sourceWarehouseId}
                    onChange={(val) => setTransfer({...transfer, sourceWarehouseId: val})}
                    disabled={sourceWarehouseOptions.length <= 1}
                  />
                </div>

                <button className="hub-interchange" onClick={swapWarehouses} title="Swap Source/Target">
                  <FaExchangeAlt />
                </button>

                <div className="wh-field">
                  <div className="wh-label-row">
                    <FaMapMarkerAlt className="wh-icon dst" />
                    <span className="wh-label">Target Warehouse <span style={{ color: '#ef4444' }}>*</span></span>
                  </div>
                  <NiceSelect 
                    placeholder="Select Target..."
                    options={warehouseOptions}
                    value={transfer.destWarehouseId}
                    onChange={(val) => setTransfer({...transfer, destWarehouseId: val})}
                  />
                </div>
              </div>
            </div>

            {transfer.sourceWarehouseId && transfer.sourceWarehouseId === transfer.destWarehouseId && (
              <div className="premium-alert error" style={{marginBottom: '24px', marginTop: '-12px'}}>Source and destination cannot be identical.</div>
            )}

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
                      <div className="no-sug">Catalog item not found.</div>
                    ) : (
                      filteredSuggestions.map(p => {
                        const stockObj = sourceStock[p.id];
                        const currentStock = stockObj ? stockObj.currentStock : 0;
                        const hasSource = !!transfer.sourceWarehouseId;
                        return (
                          <div 
                            key={p.id} 
                            className="sug-item" 
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleAddProduct(p);
                            }}
                          >
                             <div className="sug-left">
                               <div className="sug-name">{p.name} {p.productCode ? `(#${p.productCode})` : ''}</div>
                               <div className="sug-cat">{p.categoryName || 'General'}</div>
                             </div>
                             {hasSource && (
                               <div className={`sug-stock ${currentStock > 0 ? 'instock' : 'outofstock'}`}>
                                 {currentStock} Available
                               </div>
                             )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="premium-card cart-card" style={{marginTop: '0'}}>
                <div className="cart-table-wrapper">
                {transfer.lines.length === 0 ? (
                    <div className="empty-cart-classic">
                      <div className="empty-cart-icon-box"><FaBoxOpen /></div>
                      <p className="empty-primary">Your transfer cart is empty</p>
                      <span className="empty-secondary">Add products from our catalog to begin document preparation.</span>
                    </div>
                ) : (
                    <>
                    <table className="classic-cart-table">
                      <thead>
                        <tr>
                          <th className="col-idx">#</th>
                          <th className="col-product">Product</th>
                          <th className="col-qty">Transfer Qty</th>
                          <th className="col-status">Source Stock</th>
                          <th className="col-action"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {transfer.lines.map((line, idx) => {
                          const p = products.find(prod => prod.id === line.productId);
                          if (!p) return null;

                          const stockObj = sourceStock[line.productId];
                          const currentStock = stockObj ? stockObj.currentStock : 0;
                          const overdraft = !!transfer.sourceWarehouseId && line.transferQuantity > currentStock;

                          return (
                            <tr key={idx} className={overdraft ? 'row-overstocked' : ''}>
                              <td className="col-idx">{idx + 1}</td>
                              <td className="col-product">
                                <div className="p-name">{p.name}</div>
                                <div className="p-meta">
                                   {p.productCode && <span className="p-sku">#{p.productCode}</span>}
                                   <span className="p-category">{p.categoryName}</span>
                                </div>
                              </td>
                              <td className="col-qty">
                                <div className="classic-qty-group">
                                   <button 
                                     type="button"
                                     className="qty-btn" 
                                     onClick={() => updateLineQty(idx, (Number(line.transferQuantity) || 1) - 1, currentStock)}
                                     disabled={(Number(line.transferQuantity) || 1) <= 1}
                                   >
                                     <FaMinus />
                                   </button>
                                   <input 
                                     type="number"
                                     className="qty-input"
                                     value={line.transferQuantity}
                                     min="1"
                                     max={transfer.sourceWarehouseId ? currentStock : undefined}
                                     onChange={(e) => updateLineQty(idx, e.target.value, currentStock)}
                                     onBlur={() => {
                                       if (!line.transferQuantity || Number(line.transferQuantity) < 1) {
                                         updateLineQty(idx, 1, currentStock);
                                       }
                                     }}
                                   />
                                   <button 
                                     type="button"
                                     className="qty-btn" 
                                     onClick={() => updateLineQty(idx, (Number(line.transferQuantity) || 1) + 1, currentStock)}
                                     disabled={transfer.sourceWarehouseId && (Number(line.transferQuantity) || 1) >= currentStock}
                                   >
                                     <FaPlus />
                                   </button>
                                </div>
                              </td>
                               <td className="col-status">
                                 {transfer.sourceWarehouseId ? (
                                   <div className={`classic-pill ${overdraft ? 'danger' : 'success'}`}>
                                      {currentStock} Available
                                   </div>
                                 ) : (
                                   <div className="classic-pill neutral">--</div>
                                 )}
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
                      {transfer.lines.map((line, idx) => {
                        const p = products.find(prod => prod.id === line.productId);
                        if (!p) return null;
                        const stockObj = sourceStock[line.productId];
                        const currentStock = stockObj ? stockObj.currentStock : 0;
                        const overdraft = !!transfer.sourceWarehouseId && line.transferQuantity > currentStock;

                        return (
                          <div key={idx} className={`mobile-cart-item ${overdraft ? 'overstocked' : ''}`}>
                            <div className="m-item-head">
                              <div className="m-item-info">
                                <span className="m-item-name">{p.name}</span>
                                <span className="m-item-meta">{p.productCode && `#${p.productCode} • `}{p.categoryName}</span>
                              </div>
                              <button className="m-item-remove" onClick={() => removeLine(idx)}><FaTrash /></button>
                            </div>
                            <div className="m-item-controls">
                               <div className="stock-info">
                                 {transfer.sourceWarehouseId ? (
                                   <span className={`stock-pill ${overdraft ? 'danger' : 'success'}`}>
                                     Stock: {currentStock}
                                   </span>
                                 ) : <span className="stock-pill">No Source</span>}
                               </div>
                               <div className="classic-qty-group small">
                                 <button 
                                   type="button"
                                   className="qty-btn" 
                                   onClick={() => updateLineQty(idx, (Number(line.transferQuantity) || 1) - 1, currentStock)}
                                   disabled={(Number(line.transferQuantity) || 1) <= 1}
                                 >
                                   <FaMinus />
                                 </button>
                                 <input 
                                   type="number"
                                   className="qty-input"
                                   value={line.transferQuantity}
                                   min="1"
                                   max={transfer.sourceWarehouseId ? currentStock : undefined}
                                   onChange={(e) => updateLineQty(idx, e.target.value, currentStock)}
                                   onBlur={() => {
                                     if (!line.transferQuantity || Number(line.transferQuantity) < 1) {
                                       updateLineQty(idx, 1, currentStock);
                                     }
                                   }}
                                 />
                                 <button 
                                   type="button"
                                   className="qty-btn" 
                                   onClick={() => updateLineQty(idx, (Number(line.transferQuantity) || 1) + 1, currentStock)}
                                   disabled={transfer.sourceWarehouseId && (Number(line.transferQuantity) || 1) >= currentStock}
                                 >
                                   <FaPlus />
                                 </button>
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
          </div>

          <div className="fluid-sidebar">
             <div className="premium-card summary-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 className="comp-summary-title" style={{ margin: 0 }}>Process Summary</h3>
                  <Link href="/owner/stock-transfer-reports" className="history-header-btn" title="View Transfer History">
                    <FaHistory /> History
                  </Link>
                </div>
                
                <div className="summary-list">
                  <div className="sm-item">
                    <span className="sm-label">Document:</span>
                    <div style={{display:'flex', alignItems:'center', gap: '8px'}}>
                      <span className="sm-value">{transfer.transferNumber}</span>
                      <button className="invoke-btn" onClick={() => setShowDraftModal(true)} title="Load Drafts">
                        <FaFolderOpen />
                      </button>
                    </div>
                  </div>
                  <div className="sm-item">
                    <span className="sm-label">Origin:</span>
                    <span className="sm-value">{getSourceWhName()}</span>
                  </div>
                  <div className="sm-item">
                    <span className="sm-label">Target:</span>
                    <span className="sm-value">{getDestWhName()}</span>
                  </div>
                </div>

                <div className="comp-stats-box">
                  <div className="cs-row">
                    <span>No. of Products</span>
                    <span className="cs-val">{totalItems}</span>
                  </div>
                  <div className="cs-row accent">
                    <span>Total Transfer Units</span>
                    <span className="cs-val">{totalUnits}</span>
                  </div>
                </div>

                {/* Transfer Notes / Remarks */}
                <div className="notes-box-wrap" style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Transfer Notes / Remarks
                  </label>
                  <textarea 
                    className="premium-textarea" 
                    placeholder="Add transfer notes or remarks here..."
                    rows={2}
                    value={transfer.notes || ''}
                    onChange={(e) => setTransfer({...transfer, notes: e.target.value})}
                    style={{ width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '12px', resize: 'vertical' }}
                  />
                </div>

                {/* Auto Transfer Toggle */}
                <div className="auto-transfer-toggle">
                  <button
                    className={`att-btn ${autoTransfer ? 'att-on' : 'att-off'}`}
                    onClick={() => setAutoTransfer(!autoTransfer)}
                    type="button"
                  >
                    <div className="att-track">
                      <div className="att-thumb" />
                    </div>
                    <div className="att-text">
                      <span className="att-label">Auto Transfer</span>
                      <span className="att-desc">
                        {autoTransfer
                          ? 'Stock moves immediately on submit'
                          : 'Requires confirmation from target warehouse'}
                      </span>
                    </div>
                  </button>
                </div>

                <div className="comp-action-stack">
                   <button 
                     className={`action-prime ${autoTransfer ? 'prime-green' : ''}`}
                     onClick={() => handleSave('SUBMIT')}
                     disabled={saving}
                   >
                     {saving ? '...' : autoTransfer ? 'Transfer Now' : 'Send for Confirmation'}
                   </button>
                   
                   <button 
                     className="action-sec"
                     onClick={() => handleSave('DRAFT')}
                     disabled={saving}
                   >
                     <FaSave /> Save as Draft
                   </button>

                   <Link href="/owner/stock-transfer-reports" className="action-history">
                     <FaHistory /> Transfer History
                   </Link>
                </div>
             </div>
          </div>
        </div>

        {/* Sticky Mobile Action Bar */}
        {transfer.lines.length > 0 && (
          <div className="mobile-action-bar">
            <div className="ma-info">
              <span className="ma-qty">{totalUnits} Units</span>
              <span className="ma-count">{totalItems} Products</span>
            </div>
            <button className={`ma-btn ${autoTransfer ? 'ma-btn-green' : ''}`} onClick={() => handleSave('SUBMIT')}>
              {autoTransfer ? 'Transfer Now' : 'Send for Confirm'}
            </button>
          </div>
        )}

        {showDraftModal && (
          <div className="draft-modal-overlay">
            <div className="draft-modal">
              <div className="modal-head">
                <h3>Draft Recovery Hub</h3>
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
                          <span className="tile-id">{d.transferNumber}</span>
                          <span className="tile-date">{formatTzDate(d.transferDate, timezone, { format: 'date' })}</span>
                        </div>
                        <div className="tile-route">
                          {warehouses.find(w => w.id === d.sourceWarehouseId)?.name || 'N/A'} &rarr; {warehouses.find(w => w.id === d.destWarehouseId)?.name || 'N/A'}
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



      <style jsx>{`
        /* Re-Stabilized Professional Layout */
        .premium-fluid-wrapper { width: 100%; padding: 16px; background: #f8fafc; min-height: 100vh; font-family: 'Inter', sans-serif; }
        .fluid-grid { display: flex; gap: 16px; align-items: flex-start; max-width: 1500px; margin: 0 auto; width: 100%; }
        .fluid-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
        .fluid-sidebar { width: 320px; flex-shrink: 0; position: sticky; top: 16px; }

        .premium-card { background: white; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; }
        .premium-alert.error { background: #fef2f2; border: 1px solid #fee2e2; color: #b91c1c; padding: 12px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .mobile-action-bar { display: none; }
        
        /* Routing Hub Ultra-Compact */
        .routing-hub-card { border-top: 3px solid #f97316; }
        .hub-content { display: flex; align-items: center; gap: 16px; }
        .wh-field { flex: 1; }
        .wh-label-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .wh-icon { font-size: 12px; color: #94a3b8; }
        .wh-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .hub-interchange { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #e2e8f0; background: white; color: #f97316; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: 14px; transition: 0.2s; flex-shrink: 0; }

        /* Search Bar Brand Overhaul */
        .search-wrap { position: relative; width: 100%; }
        .search-bar.product { display: flex; align-items: center; border: 2px solid #e2e8f0; border-radius: 12px; height: 56px; padding: 0 20px; background: #fff; transition: 0.3s; }
        .search-bar.product:focus-within { border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); }
        .search-icon { color: #f97316; font-size: 18px; }
        .search-bar.product input { flex: 1; border: none; outline: none; padding-left: 15px; font-size: 16px; font-weight: 600; color: #0f172a; }
        .search-bar.product input::placeholder { color: #94a3b8; }
        .clear-search { background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }

        .suggestions-popover { position: absolute; top: calc(100% + 8px); left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 1000; max-height: 400px; overflow-y: auto; }
        .sug-item { padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
        .sug-item:hover { background: #fff7ed; }
        .sug-name { font-size: 14px; font-weight: 700; color: #0f172a; }
        .sug-cat { font-size: 11px; color: #f97316; font-weight: 700; text-transform: uppercase; }
        .sug-stock { font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 6px; }
        .no-sug { padding: 20px; text-align: center; color: #64748b; font-size: 13px; font-weight: 600; }

        /* Manifest Table Overhaul */
        .cart-table-wrapper { margin-top: 0; width: 100%; overflow-x: auto; }
        .classic-cart-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .classic-cart-table th { padding: 12px 16px; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; text-align: left; background: #fcfcfd; }
        .classic-cart-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        
        .col-idx { width: 40px; }
        .col-product { width: auto; }
        .col-qty { width: 160px; }
        .col-status { width: 180px; }
        .col-action { width: 60px; text-align: right; }

        .p-name { font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 1px; }
        .p-meta { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; }
        .p-sku { color: #94a3b8; }
        .p-category { color: #f97316; text-transform: uppercase; }

        /* Tactical Qty Control */
        .classic-qty-group { display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 3px; width: fit-content; gap: 2px; }
        .qty-btn { width: 28px; height: 28px; border-radius: 7px; border: none; background: white; cursor: pointer; color: #0f172a; display: flex; align-items: center; justify-content: center; font-size: 11px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: 0.2s; }
        .qty-btn:hover:not(:disabled) { background: #f97316; color: white; transform: translateY(-1px); }
        .qty-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .qty-input { width: 50px; height: 28px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; font-size: 14px; font-weight: 800; color: #0f172a; outline: none; background: white; transition: 0.2s; -moz-appearance: textfield; }
        .qty-input::-webkit-outer-spin-button, .qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .qty-input:focus { border-color: #f97316; box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2); }

        .classic-pill { font-size: 10px; font-weight: 800; }
        .classic-pill.success { color: #166534; }
        .classic-pill.danger { color: #991b1b; }

        .classic-trash { background: none; border: none; color: #ef4444; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; opacity: 0.7; }

        .premium-textarea { width: 100%; min-height: 80px; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; font-family: inherit; font-size: 14px; font-weight: 600; color: #0f172a !important; background: #ffffff !important; resize: vertical; margin-top: 8px; outline: none; }
        .premium-textarea:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15); }

        /* Compact Summary Sidebar Re-Polished */
        .comp-summary-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 16px; }

        .history-header-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; border-radius: 8px; font-size: 11px; font-weight: 700; text-decoration: none; transition: all 0.2s; }
        .history-header-btn:hover { background: #f97316; color: white; border-color: #f97316; }

        .action-history { display: flex; align-items: center; justify-content: center; gap: 8px; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700; text-decoration: none; transition: all 0.2s; margin-top: 4px; }
        .action-history:hover { background: #0f172a; color: white; border-color: #0f172a; }
        .summary-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .sm-item { display: flex; justify-content: space-between; font-size: 12px; color: #1e293b; }
        .sm-label { font-weight: 600; color: #64748b; }
        .sm-value { font-weight: 700; color: #0f172a; text-align: right; }

        .comp-stats-box { background: #f1f5f9; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
        .cs-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; }
        .cs-row.accent { padding-top: 8px; border-top: 1px dashed #cbd5e1; margin-top: 8px; color: #0f172a; }
        .cs-val { font-size: 14px; font-weight: 800; color: #0f172a; }
        .comp-action-stack { display: flex; flex-direction: column; gap: 12px; width: 100%; }
        .action-prime { background: #f97316; color: white; border: none; padding: 16px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; width: 100%; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2); transition: all 0.2s; }
        .action-prime.prime-green { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
        .action-prime:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.92; }
        .action-prime:disabled { opacity: 0.5; cursor: not-allowed; }
        .action-sec { background: #fff; color: #0f172a; border: 2px solid #e2e8f0; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; cursor: pointer; }

        /* Auto Transfer Toggle */
        .auto-transfer-toggle { margin-bottom: 16px; }
        .att-btn { width: 100%; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: all 0.2s; text-align: left; }
        .att-btn.att-on { background: #ecfdf5; border-color: #6ee7b7; }
        .att-btn.att-off { background: #f8fafc; border-color: #e2e8f0; }
        .att-btn:hover { border-color: #f97316; }
        .att-track { width: 40px; height: 22px; border-radius: 11px; background: #cbd5e1; flex-shrink: 0; position: relative; transition: background 0.2s; }
        .att-on .att-track { background: #10b981; }
        .att-thumb { width: 18px; height: 18px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: left 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        .att-on .att-thumb { left: 20px; }
        .att-text { flex: 1; min-width: 0; }
        .att-label { display: block; font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
        .att-on .att-label { color: #065f46; }
        .att-desc { display: block; font-size: 11px; font-weight: 500; color: #64748b; line-height: 1.4; }
        .att-on .att-desc { color: #047857; }
        .ma-btn-green { background: #10b981 !important; }

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
            .ma-count { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
            .ma-btn { background: #f97316; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 800; font-size: 14px; }
            
            .premium-fluid-wrapper { padding-bottom: 80px; } /* Space for navbar */
            .hub-content { flex-direction: column; align-items: stretch; }
        }

        @media (max-width: 767px) {
            .hub-content { flex-direction: column; align-items: stretch; gap: 8px; }
            .hub-interchange { margin-top: 0; align-self: center; }
            .classic-cart-table { display: none; }
            .mobile-cart-list { display: flex; flex-direction: column; gap: 10px; padding: 10px 0; }
            .mobile-cart-item { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
            .mobile-cart-item.overstocked { border-left: 4px solid #ef4444; background: #fef2f2; }
            .m-item-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
            .m-item-info { display: flex; flex-direction: column; gap: 2px; }
            .m-item-name { font-size: 14px; font-weight: 800; color: #0f172a; }
            .m-item-meta { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
            .m-item-remove { background: none; border: none; color: #ef4444; font-size: 14px; padding: 4px; }
            .m-item-controls { display: flex; justify-content: space-between; align-items: center; }
            .stock-pill { font-size: 11px; font-weight: 800; color: #64748b; }
            .stock-pill.success { color: #166534; }
            .stock-pill.danger { color: #b91c1c; }
            .classic-qty-group.small { padding: 2px; }
            .classic-qty-group.small .qty-btn { width: 24px; height: 24px; font-size: 9px; }
            .classic-qty-group.small .qty-num { min-width: 28px; font-size: 12px; }

            .search-bar.product { height: 48px; padding: 0 12px; }
            .search-bar.product input { font-size: 14px; padding-left: 10px; }
        }

        @media (min-width: 768px) {
            .mobile-cart-list { display: none; }
        }
      `}</style>
    </DashboardLayout>
  );
}
