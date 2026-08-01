import React from 'react';
import NiceSelect from '../NiceSelect';

export default function PaymentModal({
  customer,
  invoice,
  amount,
  setAmount,
  method,
  setMethod,
  manualAllocations,
  setManualAllocations,
  config,
  submitPayment,
  onClose,
  money,
  SYM,
}) {
  if (!customer) return null;

  // For bulk settlement, use balance OR totalCreditExtended as fallback
  const customerBalance = Number(customer.balance || customer.totalCreditExtended || 0);

  // For direct invoice payment, break out total vs amount due
  const invoiceTotal = invoice ? Number(invoice.total || invoice.grandTotal || invoice.amountDue || 0) : 0;
  const invoiceDue = invoice ? Number(invoice.amountDue || 0) : 0;
  const invoiceAlreadyPaid = Math.max(0, invoiceTotal - invoiceDue);

  return (
    <div className="rpt-modal-overlay" onMouseDown={onClose}>
      <div className="rpt-modal" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '540px' }}>
        <h2 className="modal-title">
          {invoice 
            ? `Pay for Order ${invoice.orderNo || invoice.invoiceNo}` 
            : 'Record Customer Payment'}
        </h2>
        
        <div className="payment-summary-banner">
          <div className="summary-item">
            <span className="label">Customer</span>
            <span className="value">{customer.name}</span>
          </div>
          {invoice ? (
            <>
              {invoiceTotal > 0 && (
                <div className="summary-item">
                  <span className="label">Order Total</span>
                  <span className="value rpt-amt">{money(invoiceTotal)}</span>
                </div>
              )}
              {invoiceAlreadyPaid > 0 && (
                <div className="summary-item">
                  <span className="label">Already Paid</span>
                  <span className="value rpt-amt text-success">{money(invoiceAlreadyPaid)}</span>
                </div>
              )}
              <div className="summary-item">
                <span className="label">Order Due</span>
                <span className="value balance rpt-amt text-danger">
                  {money(invoiceDue || invoiceTotal)}
                </span>
              </div>
            </>
          ) : (
            <div className="summary-item">
              <span className="label">Current Balance</span>
              <span className={`value balance rpt-amt ${customerBalance > 0 ? 'debt text-danger' : 'text-success'}`}>
                {money(customerBalance)}
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
            {invoice ? (
              <span className="form-hint">
                Direct payment for this order. Max: <strong>{money(invoiceDue || invoiceTotal)}</strong>
              </span>
            ) : (
              customerBalance > 0
                ? <span className="form-hint">Max payable: <strong>{money(customerBalance)}</strong></span>
                : <span className="form-hint text-success">No outstanding balance for this customer.</span>
            )}
          </div>
          <div className="form-group">
            <label>Payment Method</label>
            <NiceSelect 
              value={method} 
              onChange={setMethod} 
              options={[
                { value: 'CASH', label: 'Cash' },
                { value: 'UPI', label: 'UPI / QR Code' },
                { value: 'CARD', label: 'Card Payment' },
                { value: 'BANK', label: 'Bank Transfer' },
                { value: 'ONLINE', label: 'Online' },
                { value: 'CHEQUE', label: 'Cheque' },
              ]} 
            />
          </div>
        </div>

        {config?.creditAllocationMode === 'MANUAL' && manualAllocations.length > 0 && (
          <div className="manual-box">
            <strong>Invoice Allocation Settings</strong>
            <div className="allocation-list">
              {manualAllocations.map((row, index) => (
                <div key={row.invoiceId} className="allocation-row">
                  <span>
                    {row.orderNo || row.invoiceNo}
                    <small className="text-danger"> ({money(row.amountDue)} due)</small>
                  </span>
                  <input 
                    className="form-input"
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={row.amount} 
                    onChange={(event) => {
                      setManualAllocations((current) => 
                        current.map((item, itemIndex) => 
                          itemIndex === index ? { ...item, amount: event.target.value } : item
                        )
                      );
                    }} 
                    placeholder="0.00"
                    style={{ width: '100px', padding: '6px 10px', background: '#ffffff' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="modal-actions">
          <button className="rpt-modal-btn rpt-modal-btn-outline" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submitPayment}>Record Payment</button>
        </div>
      </div>
    </div>
  );
}
