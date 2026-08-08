import React from 'react';
import { FaChevronRight, FaCheckCircle, FaBan, FaCheck } from 'react-icons/fa';

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
  onInvoiceOrder,
  onReceiveOrder,
  onCancelOrder,
  selectedOrderIds = new Set(),
  onToggleSelect,
  onSelectAll,
  isAllSelected = false
}) {
  return (
    <div className={styles['hist-table-wrap']}>
      <table className={styles['hist-table']}>
        <thead>
          <tr>
            <th style={{ width: '40px', textAlign: 'center' }}>
              <span
                onClick={onSelectAll}
                title="Select All Orders"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  border: isAllSelected ? '2px solid #FF7A00' : '2px solid #cbd5e1',
                  background: '#ffffff',
                  cursor: 'pointer',
                  userSelect: 'none',
                  boxSizing: 'border-box'
                }}
              >
                {isAllSelected && <FaCheck style={{ color: '#FF7A00', fontSize: '11px' }} />}
              </span>
            </th>
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
            const isSelected = selectedOrderIds.has(o.id);
            const cfg = STATUS_CFG[o.orderStatus] || STATUS_CFG.DRAFT;
            const v   = vendors.find(x => String(x.id) === String(o.vendorId));
            const w   = warehouses.find(x => String(x.id) === String(o.warehouseId));
            return (
              <tr 
                key={o.id} 
                className={styles['hist-row']}
                style={{ backgroundColor: isSelected ? '#f0fdf4' : undefined, transition: 'background-color 0.15s ease' }}
              >
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
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
                </td>
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
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {/* DRAFT: Edit + Void only (No Receive) */}
                    {o.orderStatus === 'DRAFT' && (
                      <>
                        <button 
                          className={styles['btn-edit']} 
                          onClick={() => { loadDraft(o); setView('form'); }}
                          title="Edit Draft Order"
                        >
                          Edit <FaChevronRight />
                        </button>
                        <button 
                          className={styles['btn-edit']} 
                          style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => onCancelOrder && onCancelOrder(o)}
                          title="Void / Cancel Order"
                        >
                          Void <FaBan style={{ marginLeft: '4px' }} />
                        </button>
                      </>
                    )}

                    {/* CONFIRMED (Ordered, not yet received): Receive + Edit + Void */}
                    {o.orderStatus === 'CONFIRMED' && !o.isReceived && (
                      <>
                        <button 
                          className={styles['btn-edit']} 
                          style={{ background: '#ecfdf5', color: '#059669', borderColor: '#6ee7b7' }}
                          onClick={() => onReceiveOrder && onReceiveOrder(o)}
                          title="Receive order, update stock & generate vendor bill"
                        >
                          Receive <FaCheckCircle style={{ marginLeft: '4px' }} />
                        </button>
                        <button 
                          className={styles['btn-edit']} 
                          onClick={() => { loadDraft(o); setView('form'); }}
                          title="Edit Order"
                        >
                          Edit <FaChevronRight />
                        </button>
                        <button 
                          className={styles['btn-edit']} 
                          style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => onCancelOrder && onCancelOrder(o)}
                          title="Void / Cancel Order"
                        >
                          Void <FaBan style={{ marginLeft: '4px' }} />
                        </button>
                      </>
                    )}

                    {/* COMPLETED / RECEIVED (Already received): Void only (No Edit) */}
                    {(o.orderStatus === 'COMPLETED' || o.isReceived) && (
                      <>
                        <button 
                          className={styles['btn-edit']} 
                          style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => onCancelOrder && onCancelOrder(o)}
                          title="Void / Cancel Order"
                        >
                          Void <FaBan style={{ marginLeft: '4px' }} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
