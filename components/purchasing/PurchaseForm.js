import React, { useRef, useEffect } from 'react';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';
import {
  FaSearch, FaWarehouse, FaTrash, FaPlus, FaMinus,
  FaFolderOpen, FaBoxOpen, FaCheckCircle, FaExclamationCircle,
  FaSave, FaClipboardList, FaArrowLeft, FaCalendarAlt,
  FaHashtag, FaTruck, FaTimesCircle, FaFileAlt, FaUserTie,
  FaShoppingCart, FaChevronRight
} from 'react-icons/fa';

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
  warehouseStock = {}
}) {
  const searchRef = useRef(null);
  const searchInp = useRef(null);
  const linesEndRef = useRef(null);

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
              {i < STEPS.length - 1 && (
                <div className={`${styles['step-line']} ${stepOk[s.id] ? styles.done : ''}`} />
              )}
            </React.Fragment>
          );
        })}
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

              {/* Expected Delivery */}
              <div className={styles['field-group']}>
                <label className={styles['field-label']}>
                  <FaCalendarAlt className={styles['lbl-icon']} /> Expected Delivery
                </label>
                <PremiumDateTimePicker 
                  value={po.expectedDate} 
                  onChange={(v) => setPo(p => ({ ...p, expectedDate: v }))}
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
                onClick={() => { 
                  if (!po.vendorId || !po.warehouseId) { 
                    setErrors({ 
                      vendorId: !po.vendorId ? 'Required' : '', 
                      warehouseId: !po.warehouseId ? 'Required' : '' 
                    }); 
                    return; 
                  } 
                  setStep(2); 
                }}
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
                {po.lines.length > 0 && !isLocked && (
                  <button 
                    className={styles['btn-header-danger']} 
                    onClick={() => { if (window.confirm('Clear all items?')) setPo(p => ({ ...p, lines: [], totalAmount: 0, totalTaxAmount: 0, grandTotal: 0 })); }}
                  >
                    <FaTrash /> Clear All
                  </button>
                )}
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
                          <button key={p.id} className={styles['ps-item']} onClick={() => addProduct(p)}>
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
                              {p.price > 0 && (
                                <div className={styles['ps-item-price']}>
                                  {currencySymbol}{parseFloat(p.price).toFixed(2)}
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
              <div className={styles['inline-error']}>
                <FaExclamationCircle /> {errors.lines}
              </div>
            )}

            {po.lines.length === 0 ? (
              <div className={styles['lines-empty-premium']}>
                <div className={styles['empty-graphic']}>
                  <div className={styles['blob']} />
                  <FaBoxOpen className={styles['lines-empty-icon']} />
                </div>
                <h3>Your order is empty</h3>
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
        <div className={styles['po-sidebar']}>
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

              {!isLocked && (
                <div className={`${styles['summary-payment-row']} ${styles['no-border']}`}>
                  <span className={styles['info-label']}>Payment Mode</span>
                  <NiceSelect
                    placeholder="Select Mode"
                    options={[
                      { value: 'CREDIT', label: 'Credit' },
                      { value: 'CASH', label: 'Cash' },
                      { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                      { value: 'UPI', label: 'UPI / Digital' },
                      { value: 'CARD', label: 'Card' },
                      { value: 'CHEQUE', label: 'Cheque' }
                    ]}
                    value={po.paymentMethod}
                    onChange={(v) => setPo(p => ({
                      ...p,
                      paymentMethod: v,
                      paymentStatus: v === 'CREDIT' ? 'PENDING' : 'PAID'
                    }))}
                  />
                </div>
              )}
              {isLocked && (
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>Payment Mode</span>
                  <span className={styles['info-value']}>
                    {po.paymentMethod === 'CREDIT' ? 'Credit' :
                     po.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' :
                     po.paymentMethod === 'UPI' ? 'UPI / Digital' :
                     po.paymentMethod ? po.paymentMethod.charAt(0) + po.paymentMethod.slice(1).toLowerCase() : 'Cash'}
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
                <button
                  className={`${styles['btn-primary']} ${styles.full}`}
                  disabled={saving}
                  onClick={() => handleSave(po.orderStatus === 'CONFIRMED' ? 'COMPLETED' : 'CONFIRMED')}
                >
                  {saving ? (
                    <><span className={styles['btn-spin']} /> Saving...</>
                  ) : po.orderStatus === 'CONFIRMED' ? (
                    <><FaCheckCircle /> Mark as Received</>
                  ) : (
                    <><FaTruck /> Confirm & Send Order</>
                  )}
                </button>
                <button
                  className={`${styles['btn-outline']} ${styles.full}`}
                  disabled={saving || isDraftBlank}
                  onClick={() => handleSave('DRAFT')}
                >
                  <FaSave /> Save as Draft
                </button>
                {po.id && (
                  <button
                    className={`${styles['btn-danger']} ${styles.full}`}
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    <FaTimesCircle /> Cancel Order
                  </button>
                )}
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
            <button
              className={styles['btn-new-po']}
              onClick={() => startFresh && startFresh()}
            >
              <FaPlus /> {isLocked ? 'Create New PO' : 'Start Fresh'}
            </button>
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
              onClick={() => handleSave('DRAFT')} 
              disabled={saving} 
              title="Save Draft"
            >
              <FaSave />
            </button>
            <button 
              className={styles['mb-confirm']} 
              onClick={() => handleSave(po.orderStatus === 'CONFIRMED' ? 'COMPLETED' : 'CONFIRMED')} 
              disabled={saving}
            >
              {saving ? '...' : po.orderStatus === 'CONFIRMED' ? 'Receive' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* ── Drafts Modal ──────────────────────────────── */}
      {showDraftModal && (
        <div className={styles['modal-overlay']} onClick={() => setShowDraftModal(false)}>
          <div className={styles['modal-box']} onClick={e => e.stopPropagation()}>
            <div className={styles['modal-head']}>
              <span><FaFolderOpen style={{ marginRight: '6px' }} /> Saved Drafts ({drafts.length})</span>
              <button className={styles['modal-close']} onClick={() => setShowDraftModal(false)}>×</button>
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
    </div>
  );
}
