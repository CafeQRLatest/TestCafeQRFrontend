import React from 'react';
import { FaChevronRight } from 'react-icons/fa';

export default function PurchaseTable({
  history,
  vendors,
  warehouses,
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
    <div className={styles['hist-table-wrap']}>
      <table className={styles['hist-table']}>
        <thead>
          <tr>
            <th>PO#</th>
            <th>Date</th>
            <th>Vendor</th>
            <th>Warehouse</th>
            <th>Reference</th>
            <th>Comment</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {history.map(o => {
            const cfg = STATUS_CFG[o.orderStatus] || STATUS_CFG.DRAFT;
            const v   = vendors.find(x => String(x.id) === String(o.vendorId));
            const w   = warehouses.find(x => String(x.id) === String(o.warehouseId));
            return (
              <tr key={o.id} className={styles['hist-row']}>
                <td>
                  <code 
                    className={styles['po-code']}
                    style={{ cursor: 'pointer', color: '#FF7A00', fontWeight: '800', textDecoration: 'underline' }}
                    onClick={() => onViewDocument ? onViewDocument(o) : null}
                  >
                    {o.orderNo}
                  </code>
                </td>
                <td>
                  <div className={styles['row-date']}>
                    <span className={styles['rd-d']}>
                      {formatTzDate(o.orderDate, timezone, { format: 'date', year: undefined })}
                    </span>
                    <span className={styles['rd-t']}>
                      {formatTzDate(o.orderDate, timezone, { format: 'time' })}
                    </span>
                  </div>
                </td>
                <td>
                  <strong>{v?.name || '—'}</strong>
                </td>
                <td className={styles['muted']}>
                  {w?.name || '—'}
                </td>
                <td className={styles['muted']}>
                  {o.reference || '—'}
                </td>
                <td>
                  <div className={styles['row-note']}>
                    <span>{o.description || '—'}</span>
                  </div>
                </td>
                <td>
                  <span className={styles['pill']}>{(o.lines || []).length}</span>
                </td>
                <td>
                  <strong>
                    {currencySymbol}
                    {parseFloat(o.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </strong>
                </td>
                <td>
                  <span 
                    className={styles['status-badge']} 
                    style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
                  >
                    {cfg.label}
                  </span>
                </td>
                <td>
                  {o.orderStatus === 'DRAFT' && (
                    <button 
                      className={styles['btn-edit']} 
                      onClick={() => { loadDraft(o); setView('form'); }}
                    >
                      Edit <FaChevronRight />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
