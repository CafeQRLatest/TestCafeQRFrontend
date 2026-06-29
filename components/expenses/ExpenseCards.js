import React from 'react';
import { FaEdit, FaTrash, FaWallet } from 'react-icons/fa';
import { formatTzDate } from '../../utils/timezoneUtils';
import { prettyMethod } from '../../constants/payMethods';
import styles from './Expenses.module.css';

export default function ExpenseCards({
  expenses,
  categories,
  timezone,
  loading,
  openEdit,
  handleDelete,
  filterStatus,
  currencySymbol = '₹'
}) {
  const sym = currencySymbol;
  const isVoid = filterStatus === 'VOID';

  if (loading) {
    return (
      <div className={`${styles['mob-list']} ${styles['phn-only']}`}>
        {[1, 2, 3].map(n => (
          <div key={n} className={styles['mob-card']} style={{ opacity: 0.5 }}>
            <div className={styles['mc-top']}>
              <div className={styles['mc-left']}>
                <div style={{ width: 120, height: 12, background: '#e2e8f0', borderRadius: 6 }} />
                <div style={{ width: 80, height: 10, background: '#f1f5f9', borderRadius: 6, marginTop: 6 }} />
              </div>
              <div style={{ width: 60, height: 28, background: '#fef2f2', borderRadius: 8 }} />
            </div>
            <div style={{ width: '60%', height: 10, background: '#f1f5f9', borderRadius: 6, margin: '8px 0' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles['mob-list']} ${styles['phn-only']}`}>
      {expenses.map(r => {
        const d = new Date(r.expenseDate);
        const cat = categories.find(c => String(c.id) === String(r.categoryId));
        return (
          <div
            className={`${styles['mob-card']} ${isVoid ? styles.void : ''}`}
            key={r.id}
          >
            <div className={styles['mc-top']}>
              <div className={styles['mc-left']}>
                <span className={styles['row-docno']}>{r.referenceNumber || '—'}</span>
                <span className={`${styles['st-badge']} ${isVoid ? styles.void : styles.active}`}>
                  {isVoid ? 'Voided' : 'Completed'}
                </span>
                <div className={styles['mc-meta-row']} style={{ marginTop: 8 }}>
                  <span className={styles['rd-d']}>
                    {formatTzDate(d, timezone, { format: 'date', year: undefined })}
                  </span>
                  <span className={styles['rd-t']}>
                    {formatTzDate(d, timezone, { format: 'time' })}
                  </span>
                </div>
              </div>
              <div className={styles['mc-amt-badge']}>
                <span className={styles['row-amt']}>{sym}{parseFloat(r.amount).toFixed(2)}</span>
              </div>
            </div>

            <div className={styles['mc-mid']}>
              <div className={styles['mc-meta-row']}>
                <span className={styles['rc-text']}>
                  {cat ? cat.name : (r.categoryName || 'Uncategorized')}
                </span>
              </div>
              {r.description && (
                <div className={styles['mc-note']}>{r.description}</div>
              )}
            </div>

            <div className={styles['mc-btm']}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {r.paymentMethod === 'MIXED' ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div className={`${styles['mc-pay-pill']} ${styles.cash}`}>
                      <span>Cash: {sym}{parseFloat(r.cashAmount || 0).toFixed(2)}</span>
                    </div>
                    <div className={`${styles['mc-pay-pill']} ${styles.online}`}>
                      <span>Online: {sym}{parseFloat(r.onlineAmount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles['mc-pay-pill']}>
                    <FaWallet style={{ fontSize: 8 }} />
                    <span>{prettyMethod(r.paymentMethod)}</span>
                  </div>
                )}
                {r.updatedBy && (
                  <div className={styles['mc-by-pill']}>
                    <span>By: {r.updatedBy.includes('@') ? r.updatedBy.split('@')[0] : r.updatedBy}</span>
                  </div>
                )}
              </div>
              {!isVoid && (
                <div className={styles['mc-acts']}>
                  <button
                    className={styles['ract-btn']}
                    onClick={() => openEdit(r)}
                    aria-label="Edit expense"
                  >
                    <FaEdit />
                  </button>
                  <button
                    className={`${styles['ract-btn']} ${styles.danger}`}
                    onClick={() => handleDelete(r.id)}
                    aria-label="Delete expense"
                  >
                    <FaTrash />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
