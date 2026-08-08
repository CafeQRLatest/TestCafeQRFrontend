import React, { useRef, useEffect, useState, useMemo } from 'react';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';
import {
  FaSearch, FaWarehouse, FaTrash, FaPlus, FaMinus,
  FaFolderOpen, FaBoxOpen, FaCheckCircle, FaExclamationCircle,
  FaSave, FaClipboardList, FaArrowLeft, FaCalendarAlt,
  FaHashtag, FaTruck, FaTimesCircle, FaFileAlt, FaUserTie,
  FaShoppingCart, FaChevronRight
} from 'react-icons/fa';
import api from '../../utils/api';
import VariantSelector from '../VariantSelector';
import PurchasePaymentPopup from './PurchasePaymentPopup';

const STEPS = [
  { id: 1, label: 'Supplier',  icon: <FaUserTie /> },
  { id: 2, label: 'Products',  icon: <FaShoppingCart /> },
];

export default function PurchaseForm({
  po, setPo,
  vendors, warehouses, products, filteredProducts,
  vendorOptions, warehouseOptions,
  selectedVendor, selectedWarehouse,
  isLocked, statusCfg,
  step, setStep, stepOk,
  productSearch, setProductSearch,
  showSuggestions, setShowSuggestions,
  addProduct, updateLine, removeLine,
  saving, handleSave,
  errors, setErrors,
  showDraftModal, setShowDraftModal,
  showCancelConfirm, setShowCancelConfirm,
  drafts, loadDraft,
  fetchHistory, setView,
  currencySymbol,
  timezone, formatTzDate,
  startFresh,
  styles,
  warehouseStock = {},
  toast
}) {
  const searchRef = useRef(null);
  const searchInp = useRef(null);
  const linesEndRef = useRef(null);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [markAsReceived, setMarkAsReceived] = useState(true);
  const [activeVariantProduct, setActiveVariantProduct] = useState(null);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [pendingTargetStatus, setPendingTargetStatus] = useState(null);

  const handleProductClick = async (product) => {
    const hasVars = Boolean(
      product.hasVariants ||
      product.has_variants ||
      product.isVariant ||
      product.is_variant ||
      Number(product.variantCount || product.variant_count || 0) > 0 ||
      (Array.isArray(product.variantMappings) && product.variantMappings.length > 0) ||
      (Array.isArray(product.variantPricings) && product.variantPricings.length > 0)
    );

    if (hasVars) {
      setShowSuggestions(false);
      let fullProduct = product;
      try {
        const res = await api.get(`/api/v1/products/${product.id}`);
        if (res.data?.success && res.data?.data) {
          fullProduct = res.data.data;
        }
      } catch (e) {
        console.warn('Failed to fetch full product details for variant selector:', e);
      }
      setActiveVariantProduct(fullProduct);
    } else {
      addProduct(product);
    }
  };

  useEffect(() => {
    let active = true;
    const currentOrg = po.orgId || (typeof window !== 'undefined' ? (require('js-cookie').default?.get?.('orgId') || localStorage.getItem('pos_org_id') || '') : '');
    const params = { applicableFor: 'PURCHASES' };
    if (currentOrg) {
      params.orgId = currentOrg;
    }
    api.get('/api/v1/payment-types', { params })
      .then(res => {
        if (active && res?.data?.success && res?.data?.data) {
          setPaymentTypes(res.data.data);
        }
      })
      .catch(err => {
        console.error('Failed to load purchase payment types:', err);
      });
    return () => { active = false; };
  }, [po.orgId]);

  const payMethodOptions = useMemo(() => {
    if (!paymentTypes || paymentTypes.length === 0) {
      return [];
    }
    return paymentTypes
      .filter(pt => {
        const act = pt.isActive ?? pt.isactive ?? 'Y';
        const isPur = pt.purchase === 'Y' || (Array.isArray(pt.applicableFor) ? pt.applicableFor.includes('PURCHASES') : pt.applicableFor === 'PURCHASES');
        return act === 'Y' && isPur !== false;
      })
      .map(pt => ({
        value: pt.paymentType === 'CREDIT' ? 'CREDIT' : (pt.displayName ? pt.displayName.toUpperCase().replace(/\s+/g, '_') : (pt.paymentType || 'OTHERS')),
        label: pt.displayName || pt.paymentType
      }));
  }, [paymentTypes]);

  useEffect(() => {
    if (payMethodOptions.length > 0) {
      const hasCurrent = payMethodOptions.some(o => o.value === po.paymentMethod);
      if (!hasCurrent) {
        setPo(p => ({
          ...p,
          paymentMethod: payMethodOptions[0].value,
          paymentStatus: payMethodOptions[0].value === 'CREDIT' ? 'PENDING' : 'PAID'
        }));
      }
    } else {
      if (po.paymentMethod) {
        setPo(p => ({
          ...p,
          paymentMethod: '',
        }));
      }
    }
  }, [payMethodOptions, po.paymentMethod, setPo]);

  // Click outside suggestions dropdown handler
  useEffect(() => {
    const onOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [setShowSuggestions]);

  // Derived blank check
  const isDraftBlank = !po.vendorId && !po.warehouseId && !po.lines.length;

  const handleProceedToPayment = () => {
    const errs = {};
    if (!po.vendorId) errs.vendorId = 'Please select a vendor / supplier';
    if (!po.warehouseId) errs.warehouseId = 'Please select a receiving warehouse';
    if (!po.lines || !po.lines.length) errs.lines = 'Cart is empty. Please add at least one product.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const missing = [];
      if (errs.vendorId) missing.push('Vendor');
      if (errs.warehouseId) missing.push('Warehouse');
      if (errs.lines) missing.push('Products in Cart');

      if (errs.lines && missing.length === 1) {
        toast?.('No products in cart! Please add at least one product before proceeding.', 'error');
      } else {
        toast?.(`Please fill all mandatory fields: ${missing.join(', ')}`, 'error');
      }

      if (errs.vendorId || errs.warehouseId) {
        setStep(1);
      }
      return;
    }

    if (payMethodOptions.length === 0) {
      setErrors(prev => ({
        ...prev,
        paymentMethod: 'Cannot complete purchase order: Payment type not set in payment type master for purchase'
      }));
      toast?.('Cannot complete purchase order: Payment type not set in payment type master for purchase', 'error');
      return;
    }

    const targetStatus = markAsReceived ? 'COMPLETED' : 'CONFIRMED';
    setPendingTargetStatus(targetStatus);
    setShowPaymentPopup(true);
  };

  const handleSaveDraft = () => {
    if (!po.vendorId && !po.warehouseId && (!po.lines || !po.lines.length)) {
      toast?.('Nothing to save yet. Please fill mandatory fields: Vendor, Warehouse, or Products.', 'error');
      return;
    }
    handleSave('DRAFT');
  };

  const handleNextToProducts = () => {
    const errs = {};
    if (!po.vendorId) errs.vendorId = 'Please select a vendor / supplier';
    if (!po.warehouseId) errs.warehouseId = 'Please select a receiving warehouse';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const missing = [];
      if (errs.vendorId) missing.push('Vendor');
      if (errs.warehouseId) missing.push('Warehouse');
      toast?.(`Please fill all mandatory fields: ${missing.join(', ')}`, 'error');
      return;
    }
    setStep(2);
  };

  return (
    <div className={styles['po-wrap']}>
      {/* ── Stepper (mobile / tablet only) ─────────── */}
      <div className={styles['po-stepper']}>
        {STEPS.map((s, i) => {
          const done    = stepOk[s.id];
          const current = step === s.id;
          return (
            <React.Fragment key={s.id}>
              <button
                className={`${styles['step-btn']} ${current ? styles.active : ''} ${done ? styles.done : ''}`}
                onClick={() => setStep(s.id)}
              >
                <span className={styles['step-circle']}>
                  {done && !current ? <FaCheckCircle /> : s.icon}
                </span>
                <span className={styles['step-label']}>{s.label}</span>
              </button>
              <div className={`${styles['step-line']} ${stepOk[s.id] ? styles.done : ''}`} />
            </React.Fragment>
          );
        })}
        <button
          className={styles['step-btn']}
          onClick={() => { fetchHistory(); setView('history'); }}
        >
          <span className={styles['step-circle']} style={{ background: '#fff7ed', color: '#ea580c', borderColor: '#fdba74' }}>
            <FaClipboardList />
          </span>
          <span className={styles['step-label']} style={{ color: '#ea580c', fontWeight: '800' }}>PO History</span>
        </button>
      </div>

      {/* ── Main Form Grid ────────────────────────── */}
      <div className={styles['po-grid']}>
        {/* ── LEFT: Content ──────────────────────── */}
        <div className={styles['po-main']}>
          {/* STEP 1: Supplier & Details */}
          <div className={`${styles['po-card']} ${step !== 1 ? styles['mobile-hidden'] : ''}`}>
            {drafts.length > 0 && (
              <div className={styles['card-header']} style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
                <div className={styles['card-actions']}>
                  <button 
                    className={styles['btn-header-amber']} 
                    onClick={() => setShowDraftModal(true)}
                  >
                    <FaFolderOpen /> Drafts ({drafts.length})
                  </button>
                </div>
              </div>
            )}

            <div className={styles['field-grid']}>
              {/* Vendor */}
              <div className={`${styles['field-group']} ${errors.vendorId ? styles['has-error'] : ''}`}>
                <label className={styles['field-label']}>
                  <FaUserTie className={styles['lbl-icon']} /> Vendor / Supplier <span className={styles.req}>*</span>
                </label>
                <NiceSelect
                  placeholder="Choose a supplier..."
                  options={vendorOptions}
                  value={po.vendorId ? String(po.vendorId) : ''}
                  onChange={(v) => { 
                    setPo(p => ({ ...p, vendorId: v })); 
                    setErrors(e => ({ ...e, vendorId: '' })); 
                  }}
                  disabled={isLocked}
                />
                {errors.vendorId && (
                  <span className={styles['field-error']}>
                    <FaExclamationCircle /> {errors.vendorId}
                  </span>
                )}
                {vendors.length === 0 && (
                  <span className={styles['field-hint']}>
                    No vendors found — add partners in Configuration.
                  </span>
                )}
              </div>

              {/* Warehouse */}
              <div className={`${styles['field-group']} ${errors.warehouseId ? styles['has-error'] : ''}`}>
                <label className={styles['field-label']}>
                  <FaWarehouse className={styles['lbl-icon']} /> Receiving Warehouse <span className={styles.req}>*</span>
                </label>
                <NiceSelect
                  placeholder="Choose delivery location..."
                  options={warehouseOptions}
                  value={po.warehouseId ? String(po.warehouseId) : ''}
                  onChange={(v) => { 
                    setPo(p => ({ ...p, warehouseId: v })); 
                    setErrors(e => ({ ...e, warehouseId: '' })); 
                  }}
                  disabled={isLocked}
                />
                {errors.warehouseId && (
                  <span className={styles['field-error']}>
                    <FaExclamationCircle /> {errors.warehouseId}
                  </span>
                )}
              </div>

              {/* Order Date */}
              <div className={styles['field-group']}>
                <label className={styles['field-label']}>
                  <FaCalendarAlt className={styles['lbl-icon']} /> Order Date
                </label>
                <PremiumDateTimePicker 
                  value={po.orderDate} 
                  onChange={(v) => setPo(p => ({ ...p, orderDate: v }))}
                  disabled={isLocked}
                />
              </div>

              {/* Reference */}
              <div className={`${styles['field-group']} ${styles['span-2']}`}>
                <label className={styles['field-label']}>
                  <FaHashtag className={styles['lbl-icon']} /> Supplier Invoice / Reference
                </label>
                <input 
                  type="text" 
                  className={styles['field-input']} 
                  placeholder="e.g. INV-2024-0042"
                  value={po.reference} 
                  onChange={(e) => setPo(p => ({ ...p, reference: e.target.value }))} 
                  disabled={isLocked} 
                />
                <span className={styles['field-hint']}>Used for reconciliation with supplier bills</span>
              </div>
            </div>

            {/* Mobile: Next Step */}
            <div className={`${styles['step-nav']} ${styles['mobile-only']}`}>
              <button 
                className={`${styles['btn-primary']} ${styles.full}`}
                onClick={handleNextToProducts}
              >
                Next: Add Products <FaChevronRight />
              </button>
            </div>
          </div>

          {/* STEP 2: Products */}
          <div className={`${styles['po-card']} ${styles['no-inner-pad']} ${step !== 2 ? styles['mobile-hidden'] : ''}`}>
            <div className={`${styles['card-header']} ${styles.padded}`}>
              <div className={styles['ch-main']}>
                <FaShoppingCart className={styles['card-icon']} />
                <div>
                  <div className={styles['card-title']}>Order Items</div>
                  <div className={styles['card-sub']}>Search and add products to this purchase order</div>
                </div>
              </div>
              <div className={styles['card-actions']}>
                {po.lines.length > 0 && (
                  <span className={styles['items-badge']}>
                    {po.lines.length} item{po.lines.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Search bar */}
            {!isLocked && (
              <div className={`${styles['product-search-wrap']} ${styles.padded}`} ref={searchRef}>
                <div className={`${styles['product-search-bar']} ${showSuggestions ? styles.open : ''}`}>
                  <FaSearch className={styles['ps-icon']} />
                  <input
                    ref={searchInp}
                    type="text"
                    placeholder="Search by product name or SKU..."
                    value={productSearch}
                    autoComplete="off"
                    onChange={(e) => { setProductSearch(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                  {productSearch ? (
                    <button 
                      className={styles['ps-clear']} 
                      onClick={() => { setProductSearch(''); searchInp.current?.focus(); }}
                    >
                      ×
                    </button>
                  ) : (
                    <span className={styles['ps-hint']}>Tap to search</span>
                  )}
                </div>

                {showSuggestions && (
                  <div className={styles['ps-dropdown']}>
                    {products.length === 0 ? (
                      <div className={styles['ps-empty']}>No products configured. Add products in Product Management.</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className={styles['ps-empty']}>No match for &quot;<strong>{productSearch}</strong>&quot;</div>
                    ) : (
                      <>
                        {!productSearch && <div className={styles['ps-section-label']}>Recent Products</div>}
                        {filteredProducts.map(p => (
                          <button key={p.id} className={styles['ps-item']} onClick={() => handleProductClick(p)}>
                            <div className={styles['ps-item-left']}>
                              <div className={styles['ps-item-avatar']}>{p.name?.charAt(0)?.toUpperCase()}</div>
                              <div>
                                <div className={styles['ps-item-name']}>{p.name}</div>
                                <div className={styles['ps-item-meta']}>
                                  {p.categoryName && <span>{p.categoryName}</span>}
                                  {p.productCode && <span>#{p.productCode}</span>}
                                </div>
                              </div>
                            </div>
                            <div className={styles['ps-item-right']}>
                              {po.warehouseId && warehouseStock[p.id] !== undefined && (
                                <div style={{ color: '#059669', fontSize: '11px', fontWeight: 'bold', marginRight: '10px' }}>
                                  Stock: {warehouseStock[p.id]}
                                </div>
                              )}
                              {p.costPrice !== undefined && p.costPrice !== null && Number(p.costPrice) > 0 && (
                                <div className={styles['ps-item-price']}>
                                  {currencySymbol}{parseFloat(p.costPrice).toFixed(2)}
                                </div>
                              )}
                              <div className={styles['ps-item-unit']}>{p.uomName || 'units'}</div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Line items list */}
            <div ref={linesEndRef} />
            {errors.lines && (
              <div 
                className={styles['inline-error']} 
                style={{ 
                  margin: '12px 16px', 
                  padding: '10px 14px', 
                  background: '#fef2f2', 
                  border: '1.5px solid #fecaca', 
                  borderRadius: '10px', 
                  color: '#b91c1c', 
                  fontSize: '13px', 
                  fontWeight: '700', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px' 
                }}
              >
                <FaExclamationCircle style={{ color: '#dc2626', fontSize: '16px', flexShrink: 0 }} />
                <span>{errors.lines}</span>
              </div>
            )}

            {po.lines.length === 0 ? (
              <div 
                className={styles['lines-empty-premium']} 
                style={errors.lines ? { border: '2px dashed #fca5a5', background: '#fff5f5' } : {}}
              >
                <div className={styles['empty-graphic']}>
                  <div className={styles['blob']} />
                  <FaBoxOpen className={styles['lines-empty-icon']} style={errors.lines ? { color: '#ef4444' } : {}} />
                </div>
                <h3 style={errors.lines ? { color: '#dc2626' } : {}}>
                  {errors.lines ? 'Mandatory: Add at least one product' : 'Your order is empty'}
                </h3>
                <p style={{ color: errors.lines ? '#b91c1c' : '#64748b', fontSize: '12px', marginTop: '4px', textAlign: 'center' }}>
                  {errors.lines 
                    ? 'Cart is empty. Search products above or select from recent products to add items.'
                    : 'Search products above or select from the list to add items to your cart'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <table className={styles['lines-table']}>
                  <thead>
                    <tr>
                      <th className={styles['tc-num']}>#</th>
                      <th>Product</th>
                      <th className={styles['tc-qty']}>Quantity</th>
                      <th className={styles['tc-price']}>Unit Price</th>
                      <th className={styles['tc-tax']}>Tax %</th>
                      <th className={styles['tc-total']}>Line Total</th>
                      {!isLocked && <th className={styles['tc-del']}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((line, idx) => (
                      <tr key={idx} className={styles['line-row']}>
                        <td className={styles['tc-num']}>
                          <span className={styles['line-num']}>{idx + 1}</span>
                        </td>
                        <td>
                          <div className={styles['line-name']}>{line.productName}</div>
                          <div className={styles['line-meta']}>
                            {line.productCode && <span>#{line.productCode}</span>}
                            {line.categoryName && <span className={styles.orange}>{line.categoryName}</span>}
                            <span className={styles.muted}>{line.unitOfMeasure}</span>
                            {po.warehouseId && warehouseStock[line.productId] !== undefined && (
                              <span style={{ background: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                                Stock: {warehouseStock[line.productId]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={styles['tc-qty']}>
                          <div className={styles['qty-ctrl']}>
                            <button 
                              className={styles['qty-btn']} 
                              onClick={() => updateLine(idx, 'quantity', Math.max(0.001, (parseFloat(line.quantity) || 0) - 1))} 
                              disabled={isLocked}
                            >
                              <FaMinus />
                            </button>
                            <input 
                              type="number" 
                              className={styles['qty-inp']} 
                              min="0.001" 
                              step="0.001"
                              value={line.quantity}
                              onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                              disabled={isLocked} 
                            />
                            <button 
                              className={styles['qty-btn']} 
                              onClick={() => updateLine(idx, 'quantity', (parseFloat(line.quantity) || 0) + 1)} 
                              disabled={isLocked}
                            >
                              <FaPlus />
                            </button>
                          </div>
                        </td>
                        <td className={styles['tc-price']}>
                          <div className={styles['price-wrap']}>
                            <span className={styles['currency-prefix']}>{currencySymbol}</span>
                            <input 
                              type="number" 
                              className={styles['price-inp']} 
                              min="0" 
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                              disabled={isLocked} 
                            />
                          </div>
                        </td>
                        <td className={styles['tc-tax']}>
                          <div className={styles['price-wrap']}>
                            <input 
                              type="number" 
                              className={styles['tax-inp']} 
                              min="0" 
                              max="100" 
                              step="0.01"
                              value={line.taxRate}
                              onChange={(e) => updateLine(idx, 'taxRate', e.target.value)}
                              disabled={isLocked} 
                            />
                            <span className={styles['currency-suffix']}>%</span>
                          </div>
                        </td>
                        <td className={styles['tc-total']}>
                          <div className={styles['total-amount']}>
                            {currencySymbol}
                            {parseFloat(line.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          {parseFloat(line.taxAmount) > 0 && (
                            <div className={styles['total-tax']}>
                              incl. {currencySymbol}{parseFloat(line.taxAmount).toFixed(2)} tax
                            </div>
                          )}
                        </td>
                        {!isLocked && (
                          <td className={styles['tc-del']}>
                            <button 
                              className={styles['del-btn']} 
                              onClick={() => removeLine(idx)} 
                              title="Remove item"
                            >
                              <FaTrash />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile line cards */}
                <div className={styles['mobile-lines']}>
                  {po.lines.map((line, idx) => (
                    <div key={idx} className={styles['mobile-line-card']}>
                      <div className={styles['mlc-head']}>
                        <div>
                          <div className={styles['mlc-name']}>{line.productName}</div>
                          <div className={styles['mlc-meta']}>
                            {line.productCode && <span>#{line.productCode}</span>}
                            {line.categoryName && <span className={styles.orange}>{line.categoryName}</span>}
                          </div>
                        </div>
                        <div className={styles['mlc-head-right']}>
                          <div className={styles['mlc-total']}>
                            {currencySymbol}
                            {parseFloat(line.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          {!isLocked && (
                            <button 
                              className={`${styles['del-btn']} ${styles.sm}`} 
                              onClick={() => removeLine(idx)}
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={styles['mlc-controls']}>
                        <div className={styles['mlc-field']}>
                          <label>Quantity</label>
                          <div className={`${styles['qty-ctrl']} ${styles.sm}`}>
                            <button 
                              className={styles['qty-btn']} 
                              onClick={() => updateLine(idx, 'quantity', Math.max(0.001, (parseFloat(line.quantity)||0) - 1))} 
                              disabled={isLocked}
                            >
                              <FaMinus />
                            </button>
                            <input 
                              type="number" 
                              className={styles['qty-inp']} 
                              value={line.quantity}
                              onChange={(e) => updateLine(idx, 'quantity', e.target.value)} 
                              disabled={isLocked} 
                            />
                            <button 
                              className={styles['qty-btn']} 
                              onClick={() => updateLine(idx, 'quantity', (parseFloat(line.quantity)||0) + 1)} 
                              disabled={isLocked}
                            >
                              <FaPlus />
                            </button>
                          </div>
                        </div>
                        <div className={styles['mlc-field']}>
                          <label>Unit Price</label>
                          <div className={styles['price-wrap']}>
                            <span className={styles['currency-prefix']}>{currencySymbol}</span>
                            <input 
                              type="number" 
                              className={styles['price-inp']} 
                              value={line.unitPrice}
                              onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} 
                              disabled={isLocked} 
                            />
                          </div>
                        </div>
                        <div className={styles['mlc-field']}>
                          <label>Tax %</label>
                          <div className={styles['price-wrap']}>
                            <input 
                              type="number" 
                              className={styles['tax-inp']} 
                              value={line.taxRate}
                              onChange={(e) => updateLine(idx, 'taxRate', e.target.value)} 
                              disabled={isLocked} 
                            />
                            <span className={styles['currency-suffix']}>%</span>
                          </div>
                        </div>
                      </div>
                      {parseFloat(line.taxAmount) > 0 && (
                        <div className={styles['mlc-tax-note']}>
                          Includes {currencySymbol}{parseFloat(line.taxAmount).toFixed(2)} tax
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Mobile: nav */}
            <div className={`${styles['step-nav']} ${styles['mobile-only']} ${styles.padded}`}>
              <button className={styles['btn-ghost']} onClick={() => setStep(1)}>
                <FaArrowLeft /> Back
              </button>
              <div className="flex-1" />
            </div>
          </div>
        </div>

        {/* ── RIGHT: Summary Sidebar ─────────────── */}
        <div className={`${styles['po-sidebar']} ${step !== 2 ? styles['mobile-hidden'] : ''}`}>
          <div className={`${styles['po-card']} ${styles['summary-card']}`}>
            <div className={styles['card-header']} style={{ marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between', display: 'flex', width: '100%' }}>
              <div className={styles['summary-title']} style={{ margin: 0 }}>Order Summary</div>
              <button 
                className={styles['btn-header-amber']} 
                onClick={() => { fetchHistory(); setView('history'); }}
              >
                <FaClipboardList /> PO History
              </button>
            </div>

            {/* Doc info strip */}
            <div className={styles['summary-info-block']}>
              <div className={styles['info-row']}>
                <span className={styles['info-label']}>Document</span>
                <span className={styles['info-value']}>
                  {po.orderNo ? (
                    <code className={styles['po-code']}>{po.orderNo}</code>
                  ) : (
                    <span className={styles.pill}>NEW-PO</span>
                  )}
                </span>
              </div>
              <div className={styles['info-row']}>
                <span className={styles['info-label']}>Vendor</span>
                <span className={styles['info-value']}>
                  {selectedVendor?.name || <em className={styles['not-set']}>Not selected</em>}
                </span>
              </div>
              <div className={styles['info-row']}>
                <span className={styles['info-label']}>To</span>
                <span className={styles['info-value']}>
                  {selectedWarehouse?.name || <em className={styles['not-set']}>Not selected</em>}
                </span>
              </div>
              <div className={styles['info-row']}>
                <span className={styles['info-label']}>Date</span>
                <span className={styles['info-value']}>
                  {formatTzDate(po.orderDate, timezone, { format: 'date' })}
                </span>
              </div>
              {po.reference && (
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>Ref</span>
                  <span className={styles['info-value']}>{po.reference}</span>
                </div>
              )}

              {isLocked && po.paymentMethod && (
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>Payment Mode</span>
                  <span className={styles['info-value']}>
                    {po.paymentMethod === 'CREDIT' ? 'Credit' :
                     po.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' :
                     po.paymentMethod === 'UPI' ? 'UPI / Digital' :
                     po.paymentMethod ? po.paymentMethod.charAt(0) + po.paymentMethod.slice(1).toLowerCase() : 'Not Set'}
                  </span>
                </div>
              )}
            </div>

            {/* Notes & Remarks */}
            <div className={styles['summary-notes-group']}>
              <label className={styles['notes-label']}><FaFileAlt /> Notes & Remarks</label>
              <textarea
                className={styles['summary-notes-area']}
                disabled={isLocked}
                placeholder="Instructions, remarks..."
                value={po.description}
                onChange={(e) => setPo(p => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Financials */}
            <div className={styles['financials-box']}>
              <div className={styles['fin-row']}>
                <span>Items</span>
                <span>{po.lines.length}</span>
              </div>
              <div className={styles['fin-row']}>
                <span>Subtotal</span>
                <span>
                  {currencySymbol}
                  {parseFloat(po.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {parseFloat(po.totalTaxAmount) > 0 && (
                <div className={`${styles['fin-row']} ${styles.tax}`}>
                  <span>Tax</span>
                  <span>
                    +{currencySymbol}
                    {parseFloat(po.totalTaxAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className={styles['fin-divider']} />
              <div className={`${styles['fin-row']} ${styles.grand}`}>
                <span>Grand Total</span>
                <span>
                  {currencySymbol}
                  {parseFloat(po.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Actions */}
            {!isLocked ? (
              <div className={styles['action-col']}>
                <div
                  onClick={() => setMarkAsReceived(!markAsReceived)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 2px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      border: markAsReceived ? 'none' : '2px solid #cbd5e1',
                      background: markAsReceived ? '#FF7A00' : 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {markAsReceived && '✓'}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>
                    Mark as Received
                  </span>
                </div>

                <button
                  className={`${styles['btn-primary']} ${styles.full}`}
                  disabled={saving}
                  onClick={handleProceedToPayment}
                >
                  {saving ? (
                    <><span className={styles['btn-spin']} /> Saving...</>
                  ) : (
                    <><FaCheckCircle /> Complete Order</>
                  )}
                </button>
                <button
                  className={`${styles['btn-outline']} ${styles.full}`}
                  disabled={saving || isDraftBlank}
                  onClick={handleSaveDraft}
                >
                  <FaSave /> Save as Draft
                </button>
                <button
                  className={`${styles['btn-outline']} ${styles.full}`}
                  onClick={() => startFresh && startFresh()}
                  style={{ background: '#f8fafc', color: '#475569', borderColor: '#cbd5e1' }}
                >
                  <FaTimesCircle /> Clear All
                </button>
              </div>
            ) : (
              <div 
                className={styles['locked-notice']} 
                style={{ borderColor: statusCfg.border, background: statusCfg.bg }}
              >
                <span style={{ color: statusCfg.color }}>
                  {po.orderStatus === 'COMPLETED' ? <FaCheckCircle /> : <FaTimesCircle />}
                </span>
                <span style={{ color: statusCfg.color, marginLeft: '6px' }}>
                  {po.orderStatus === 'COMPLETED' ? 'Received. Stock updated.' : 'Order cancelled.'}
                </span>
              </div>
            )}
            {isLocked && (
              <button
                className={styles['btn-new-po']}
                onClick={() => startFresh && startFresh()}
              >
                <FaPlus /> Create New PO
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile Sticky Bar ─────────────────────────── */}
      {po.lines.length > 0 && !isLocked && (
        <div className={styles['mobile-bar']}>
          <div className={styles['mb-left']}>
            <div className={styles['mb-total']}>
              {currencySymbol}{parseFloat(po.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className={styles['mb-count']}>{po.lines.length} item{po.lines.length > 1 ? 's' : ''} added</div>
          </div>
          <div className={styles['mb-right']}>
            <button 
              className={styles['mb-save']} 
              onClick={handleSaveDraft} 
              disabled={saving} 
              title="Save Draft"
            >
              <FaSave />
            </button>
            <button 
              className={styles['mb-confirm']} 
              onClick={handleProceedToPayment} 
              disabled={saving}
            >
              {saving ? '...' : 'Complete Order'}
            </button>
          </div>
        </div>
      )}

      {/* ── Drafts Modal ──────────────────────────────── */}
      {showDraftModal && (
        <div className={styles['modal-overlay']} onClick={() => setShowDraftModal(false)}>
          <div className={styles['modal-box']} onClick={e => e.stopPropagation()}>
            <div className={styles['modal-head']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Draft Orders ({drafts.length})</span>
              <button className={styles['modal-close']} onClick={() => setShowDraftModal(false)} title="Close">×</button>
            </div>
            <div className={styles['modal-body']}>
              {drafts.map(d => {
                const v = vendors.find(x => String(x.id) === String(d.vendorId));
                const w = warehouses.find(x => String(x.id) === String(d.warehouseId));
                return (
                  <button key={d.id} className={styles['draft-tile']} onClick={() => loadDraft(d)}>
                    <div className={styles['dt-head']}>
                      <code>{d.orderNo}</code>
                      <span className={styles['dt-date']}>
                        {formatTzDate(d.orderDate, timezone, { format: 'date', year: undefined })}
                      </span>
                    </div>
                    <div className={styles['dt-route']}>
                      {v?.name || 'No Vendor'} → {w?.name || 'No Warehouse'}
                    </div>
                    <div className={styles['dt-foot']}>
                      <span>{(d.lines || []).length} item{(d.lines || []).length !== 1 ? 's' : ''}</span>
                      <strong>{currencySymbol}{parseFloat(d.grandTotal || 0).toFixed(2)}</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Confirm Modal ──────────────────────── */}
      {showCancelConfirm && (
        <div className={styles['modal-overlay']} onClick={() => setShowCancelConfirm(false)}>
          <div className={`${styles['modal-box']} ${styles['confirm-box']}`} onClick={e => e.stopPropagation()}>
            <div className={styles['modal-head']}>
              <span><FaTimesCircle style={{ color: '#ef4444', marginRight: '6px' }} /> Cancel Order?</span>
              <button className={styles['modal-close']} onClick={() => setShowCancelConfirm(false)}>×</button>
            </div>
            <div className={styles['modal-body']}>
              <p className={styles['confirm-msg']}>
                Are you sure you want to cancel <strong>{po.orderNo}</strong>? This action cannot be undone.
              </p>
              <div className={styles['confirm-actions']}>
                <button className={styles['btn-ghost']} onClick={() => setShowCancelConfirm(false)}>
                  Keep Order
                </button>
                <button 
                  className={styles['btn-danger']} 
                  disabled={saving} 
                  onClick={() => handleSave('CANCELLED')}
                >
                  {saving ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Variant Selector Modal ──────────────────── */}
      {activeVariantProduct && (
        <VariantSelector
          product={activeVariantProduct}
          isPurchaseMode={true}
          onClose={() => setActiveVariantProduct(null)}
          onSelect={(selectedVariant) => {
            addProduct(activeVariantProduct, selectedVariant);
            setActiveVariantProduct(null);
          }}
          themeColor="#ea580c"
          themeSoftColor="#fff7ed"
          themeDarkColor="#c2410c"
        />
      )}

      {/* ── Purchase Payment Popup ─────────────────── */}
      {showPaymentPopup && (
        <PurchasePaymentPopup
          po={po}
          payMethodOptions={payMethodOptions}
          currencySymbol={currencySymbol}
          saving={saving}
          onClose={() => setShowPaymentPopup(false)}
          onConfirm={({ paymentMethod, paymentStatus, paymentSplits }) => {
            // Pass payment details directly to avoid async state race
            setShowPaymentPopup(false);
            handleSave(pendingTargetStatus, { paymentMethod, paymentStatus, paymentSplits });
          }}
        />
      )}
    </div>
  );
}
