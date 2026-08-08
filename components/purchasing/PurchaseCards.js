import React from 'react';
import { FaChevronRight, FaCheckCircle, FaBan, FaCheck } from 'react-icons/fa';

export default function PurchaseCards({
  history,
  vendors,
  warehouses = [],
  timezone,
  currencySymbol,
  formatTzDate,
  loadDraft,
  setView,
  STATUS_CFG,
  styles,
  onViewDocument,
  onInvoiceOrder,
  onReceiveOrder,
  onCancelOrder,
  selectedOrderIds = new Set(),
  onToggleSelect
}) {
  return (
    <div className={styles['hist-mobile-list']}>
      {history.map(o => {
        const isSelected = selectedOrderIds.has(o.id);
        const cfg = STATUS_CFG[o.orderStatus] || STATUS_CFG.DRAFT;
        const v   = vendors.find(x => String(x.id) === String(o.vendorId));
        const w   = warehouses.find(x => String(x.id) === String(o.warehouseId));
        return (
          <div 
            key={o.id} 
            className={styles['hist-card']}
            style={{ 
              borderColor: isSelected ? '#0ea5e9' : undefined, 
              backgroundColor: isSelected ? '#f0fdf4' : undefined,
              transition: 'all 0.15s ease'
            }}
          >
            <div className={styles['hc-top']}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  onClick={() => onToggleSelect && onToggleSelect(o.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: isSelected ? '2px solid #FF7A00' : '2px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  {isSelected && <FaCheck style={{ color: '#FF7A00', fontSize: '11px' }} />}
                </span>
                <code 
                  className={styles['po-code']}
                  style={{ cursor: 'pointer', color: '#f97316', fontWeight: '800', textDecoration: 'underline' }}
                  onClick={() => onViewDocument ? onViewDocument(o) : null}
                >
                  {o.orderNo}
                </code>
              </div>
              <span 
                className={styles['status-badge']} 
                style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
              >
                {cfg.label}
              </span>
            </div>
            <div className={styles['hc-vendor']}>{v?.name || 'Unknown Vendor'}</div>
            {w?.name && (
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '6px' }}>
                🏬 {w.name}
              </div>
            )}
            {o.reference && (
              <div className={styles['hc-ref']}>
                Ref: <span>{o.reference}</span>
              </div>
            )}
            {o.description && (
              <div className={styles['hc-note']}>
                {o.description}
              </div>
            )}
            <div className={styles['hc-meta']}>
              <span>
                {formatTzDate(o.orderDate, timezone, { format: 'date', year: undefined })} • {formatTzDate(o.orderDate, timezone, { format: 'time' })}
              </span>
              <span>{(o.lines || []).length} items</span>
            </div>
            <div className={styles['hc-bottom']}>
              <strong className={styles['hc-total']}>
                {currencySymbol}
                {parseFloat(o.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {/* DRAFT: Edit + Void only */}
                {o.orderStatus === 'DRAFT' && (
                  <>
                    <button 
                      className={`${styles['btn-edit']} ${styles.sm}`} 
                      onClick={() => { loadDraft(o); setView('form'); }}
                    >
                      Edit <FaChevronRight />
                    </button>
                    <button 
                      className={`${styles['btn-edit']} ${styles.sm}`} 
                      style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => onCancelOrder && onCancelOrder(o)}
                    >
                      Void <FaBan style={{ marginLeft: '4px' }} />
                    </button>
                  </>
                )}

                {/* CONFIRMED (Ordered, not yet received): Receive + Edit + Void */}
                {o.orderStatus === 'CONFIRMED' && !o.isReceived && (
                  <>
                    <button 
                      className={`${styles['btn-edit']} ${styles.sm}`} 
                      style={{ background: '#ecfdf5', color: '#059669', borderColor: '#6ee7b7' }}
                      onClick={() => onReceiveOrder && onReceiveOrder(o)}
                    >
                      Receive <FaCheckCircle style={{ marginLeft: '4px' }} />
                    </button>
                    <button 
                      className={`${styles['btn-edit']} ${styles.sm}`} 
                      onClick={() => { loadDraft(o); setView('form'); }}
                    >
                      Edit <FaChevronRight />
                    </button>
                    <button 
                      className={`${styles['btn-edit']} ${styles.sm}`} 
                      style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => onCancelOrder && onCancelOrder(o)}
                    >
                      Void <FaBan style={{ marginLeft: '4px' }} />
                    </button>
                  </>
                )}

                {/* COMPLETED / RECEIVED (Already received): Void only (No Edit) */}
                {(o.orderStatus === 'COMPLETED' || o.isReceived) && (
                  <>
                    <button 
                      className={`${styles['btn-edit']} ${styles.sm}`} 
                      style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => onCancelOrder && onCancelOrder(o)}
                    >
                      Void <FaBan style={{ marginLeft: '4px' }} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
