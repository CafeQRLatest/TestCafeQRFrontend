import React from 'react';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { formatTzDate } from '../../utils/timezoneUtils';
import { prettyMethod } from '../../constants/payMethods';
import styles from './Expenses.module.css';

export default function ExpenseTable({
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
      <div className={`${styles['erp-table-wrapper']} ${styles['desk-only']}`}>
        <div className={styles['exp-loading']}>
          <div className={styles['loading-spinner']} />
          <span>Synchronizing records…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles['erp-table-wrapper']} ${styles['desk-only']}`}>
      <table className={styles['erp-table']}>
        <thead>
          <tr>
            <th style={{ width: '160px' }}>Expense No</th>
            <th style={{ width: '140px' }}>Date</th>
            <th style={{ width: '150px' }}>Category</th>
            <th>Notes</th>
            <th style={{ width: '120px' }}>Payment Type</th>
            <th style={{ width: '120px' }}>Updated By</th>
            <th className={styles['text-right']} style={{ width: '110px' }}>Amount</th>
            <th style={{ width: '100px' }}>Status</th>
            <th style={{ width: '90px' }}></th>
          </tr>
        </thead>
        <tbody>
          {expenses.map(r => {
            const d = new Date(r.expenseDate);
            const cat = categories.find(c => String(c.id) === String(r.categoryId));
            return (
              <tr 
                key={r.id} 
                className={`${styles['erp-tr']} ${isVoid ? styles['voided-row'] : ''}`}
              >
                <td>
                  <span className={styles['row-docno']}>{r.referenceNumber || '—'}</span>
                </td>
                <td>
                  <div className={styles['row-date']}>
                    <span className={styles['rd-d']}>
                      {formatTzDate(d, timezone, { format: 'date', year: undefined })}
                    </span>
                    <span className={styles['rd-t']}>
                      {formatTzDate(d, timezone, { format: 'time' })}
                    </span>
                  </div>
                </td>
                <td>
                  <div className={styles['row-cat']}>
                    <span className={styles['rc-text']}>
                      {cat ? cat.name : (r.categoryName || 'Uncategorized')}
                    </span>
                  </div>
                </td>
                <td>
                  <div className={styles['row-note']}>
                    <span>{r.description || '—'}</span>
                  </div>
                </td>
                <td>
                  <div className={styles['row-pay']}>
                    {r.paymentMethod === 'MIXED' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className={`${styles['method-tag']} ${styles.cash}`} style={{ fontSize: '10px', padding: '1px 4px' }}>
                          Cash: {sym}{parseFloat(r.cashAmount || 0).toFixed(2)}
                        </span>
                        <span className={`${styles['method-tag']} ${styles.online}`} style={{ fontSize: '10px', padding: '1px 4px' }}>
                          Online: {sym}{parseFloat(r.onlineAmount || 0).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className={`${styles['method-tag']} ${styles[r.paymentMethod?.toLowerCase() || '']}`}>
                        {prettyMethod(r.paymentMethod)}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={styles['row-ub']}>
                    {r.updatedBy ? (r.updatedBy.includes('@') ? r.updatedBy.split('@')[0] : r.updatedBy) : 'SYSTEM'}
                  </span>
                </td>
                <td className={styles['text-right']}>
                  <span className={styles['row-amt']}>{sym}{parseFloat(r.amount).toFixed(2)}</span>
                </td>
                <td>
                  <span className={`${styles['status-tag']} ${isVoid ? styles.void : styles.active}`}>
                    {isVoid ? 'Voided' : 'Completed'}
                  </span>
                </td>
                <td>
                  <div className={styles['row-acts']}>
                    {!isVoid && (
                      <>
                        <button 
                          className={`${styles['ract-btn']} ${styles.edit}`} 
                          onClick={() => openEdit(r)} 
                          title="Edit"
                        >
                          <FaEdit />
                        </button>
                        <button 
                          className={`${styles['ract-btn']} ${styles.danger}`} 
                          onClick={() => handleDelete(r.id)} 
                          title="Delete"
                        >
                          <FaTrash />
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
