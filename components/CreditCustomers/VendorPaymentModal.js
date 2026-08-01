import React from 'react';
import NiceSelect from '../NiceSelect';

export default function VendorPaymentModal({
  vendor,
  order,
  amount,
  setAmount,
  method,
  setMethod,
  notes,
  setNotes,
  manualAllocations = [],
  setManualAllocations,
  config,
  submitPayment,
  onClose,
  money,
  SYM,
  saving,
}) {
  if (!vendor) return null;

  const currentBalance = Number(vendor.balance ?? vendor.openingBalance ?? 0);
  const orderTotal = order ? Number(order.totalAmount || order.total_amount || 0) : 0;
  const orderPaid = order ? Number(order.amountPaid || order.amount_paid || 0) : 0;
  const orderDue = Math.max(0, orderTotal - orderPaid);
  const maxPayable = order 
    ? orderDue
    : (currentBalance > 0 ? currentBalance : 0);

  return (
    <div className="rpt-modal-overlay" onMouseDown={onClose}>
      <div className="rpt-modal" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '540px' }}>
        <h2 className="modal-title">
          {order 
            ? `Settle Purchase Order ${order.poNumber || order.orderNo}` 
            : 'Record Vendor Payment'}
        </h2>
        
        <div className="payment-summary-banner">
          <div className="summary-item">
            <span className="label">Vendor</span>
            <span className="value">{vendor.name}</span>
          </div>
          {order ? (
            <>
              <div className="summary-item">
                <span className="label">Order Total</span>
                <span className="value rpt-amt">{money(orderTotal)}</span>
              </div>
              {orderPaid > 0 && (
                <div className="summary-item">
                  <span className="label">Already Paid</span>
                  <span className="value rpt-amt text-success">{money(orderPaid)}</span>
                </div>
              )}
              <div className="summary-item">
                <span className="label">Remaining Due</span>
                <span className="value balance rpt-amt text-danger">
                  {money(orderDue)}
                </span>
              </div>
            </>
          ) : (
            <div className="summary-item">
              <span className="label">Current Owed Balance</span>
              <span className={`value balance rpt-amt ${currentBalance > 0 ? 'debt text-danger' : 'text-success'}`}>
                {money(currentBalance)}
              </span>
            </div>
          )}
        </div>

        <div className="modal-form">
          <div className="form-group">
            <label>Payment Amount ({SYM})</label>
            <input 
              className="form-input"
              type="number" 
              min="0"
              step="0.01" 
              value={amount} 
              onChange={(event) => setAmount(event.target.value)} 
              placeholder="0.00"
              autoFocus
            />
            {order ? (
              <span className="form-hint">Direct payment for this purchase bill.</span>
            ) : maxPayable > 0 ? (
              <span className="form-hint">
                Max payable: <strong>{money(maxPayable)}</strong>
              </span>
            ) : (
              <span className="form-hint text-success">
                No outstanding balance for this vendor.
              </span>
            )}
          </div>

          <div className="form-group">
            <label>Payment Method</label>
            <NiceSelect 
              value={method} 
              onChange={setMethod} 
              options={[
                { value: 'CASH', label: 'Cash' },
                { value: 'BANK', label: 'Bank Transfer' },
                { value: 'UPI', label: 'UPI / Digital' },
                { value: 'CHEQUE', label: 'Cheque' },
                { value: 'ONLINE', label: 'Card / Online' },
              ]} 
            />
          </div>

          <div className="form-group">
            <label>Payment Reference / Notes</label>
            <input 
              className="form-input"
              value={notes} 
              onChange={(event) => setNotes(event.target.value)} 
              placeholder="e.g. Bank Ref #123456 or Cheque #789"
            />
          </div>
        </div>

        {!order && manualAllocations.length > 0 && (
          <div className="manual-box" style={{ marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <strong style={{ fontSize: '12px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
              Purchase Bill Allocation (per order)
            </strong>
            <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {manualAllocations.map((row, index) => {
                const rowDue = row.amountDue != null ? row.amountDue : Math.max(0, Number(row.totalAmount || 0) - Number(row.amountPaid || 0));
                return (
                  <div key={row.orderId || index} className="allocation-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#475569', flex: 1 }}>
                      {row.poNumber}
                      <small className="text-danger" style={{ marginLeft: '4px' }}>({money(rowDue)} remaining due)</small>
                    </span>
                    <input 
                      className="form-input"
                      type="number" 
                      min="0" 
                      max={rowDue}
                      step="0.01" 
                      value={row.amount} 
                      onChange={(event) => {
                        if (typeof setManualAllocations === 'function') {
                          setManualAllocations((current) => 
                            current.map((item, itemIndex) => 
                              itemIndex === index ? { ...item, amount: event.target.value } : item
                            )
                          );
                        }
                      }} 
                      placeholder="0.00"
                      style={{ width: '100px', padding: '6px 10px', background: '#ffffff' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button 
            type="button" 
            className="rpt-modal-btn rpt-modal-btn-outline" 
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="primary" 
            onClick={submitPayment}
            disabled={saving || !amount || Number(amount) <= 0}
          >
            {saving ? 'Processing...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
