import React from 'react';
import { FaChevronRight } from 'react-icons/fa';

export default function PurchaseCards({
  history,
  vendors,
  timezone,
  currencySymbol,
  formatTzDate,
  loadDraft,
  setView,
  STATUS_CFG,
  styles,
  onViewDocument,
  onInvoiceOrder
}) {
  return (
    <div className={styles['hist-mobile-list']}>
      {history.map(o => {
        const cfg = STATUS_CFG[o.orderStatus] || STATUS_CFG.DRAFT;
        const v   = vendors.find(x => String(x.id) === String(o.vendorId));
        return (
          <div key={o.id} className={styles['hist-card']}>
            <div className={styles['hc-top']}>
              <code 
                className={styles['po-code']}
                style={{ cursor: 'pointer', color: '#FF7A00', fontWeight: '800', textDecoration: 'underline' }}
                onClick={() => onViewDocument ? onViewDocument(o) : null}
              >
                {o.orderNo}
              </code>
              <span 
                className={styles['status-badge']} 
                style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
              >
                {cfg.label}
              </span>
            </div>
            <div className={styles['hc-vendor']}>{v?.name || 'Unknown Vendor'}</div>
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
              {o.orderStatus === 'DRAFT' && (
                <button 
                  className={`${styles['btn-edit']} ${styles.sm}`} 
                  onClick={() => { loadDraft(o); setView('form'); }}
                >
                  Edit <FaChevronRight />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
