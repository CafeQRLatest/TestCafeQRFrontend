import React, { useState, useEffect, useMemo } from 'react';
import NiceSelect from '../NiceSelect';
import { fetchSalesPaymentTypes } from '../../services/paymentApi';

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

  const [paymentTypes, setPaymentTypes] = useState([]);

  useEffect(() => {
    let active = true;
    const orgId = customer?.organizationId || customer?.orgId || invoice?.orgId || config?.organizationId || null;
    fetchSalesPaymentTypes(orgId)
      .then((data) => {
        if (active && Array.isArray(data)) {
          setPaymentTypes(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load sales payment types:', err);
      });
    return () => { active = false; };
  }, [customer, invoice, config]);

  const paymentOptions = useMemo(() => {
    if (!paymentTypes || paymentTypes.length === 0) {
      return [
        { value: 'CASH', label: 'Cash' },
        { value: 'UPI', label: 'UPI / QR Code' },
        { value: 'CARD', label: 'Card Payment' },
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'ONLINE', label: 'Online' },
        { value: 'CHEQUE', label: 'Cheque' },
      ];
    }

    const filtered = paymentTypes.filter((pt) => {
      const act = pt.isActive ?? pt.isactive ?? 'Y';
      if (act === 'N' || act === false) return false;
      const isSales = pt.sales === 'Y' || (Array.isArray(pt.applicableFor) ? pt.applicableFor.includes('SALES') : pt.applicableFor === 'SALES');
      if (isSales === false) return false;
      if (pt.paymentType === 'CREDIT' || String(pt.displayName || '').toUpperCase() === 'CREDIT') return false;
      if (String(pt.displayName || '').toUpperCase() === 'MIXED') return false;
      return true;
    });

    if (filtered.length === 0) {
      return [
        { value: 'CASH', label: 'Cash' },
        { value: 'UPI', label: 'UPI / QR Code' },
        { value: 'CARD', label: 'Card Payment' },
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'ONLINE', label: 'Online' },
        { value: 'CHEQUE', label: 'Cheque' },
      ];
    }

    return filtered.map((pt) => {
      const rawUpper = String(pt.displayName || pt.paymentType || 'OTHERS').toUpperCase().trim();
      let val = rawUpper.replace(/[\s\/-]+/g, '_');
      if (rawUpper === 'CASH') val = 'CASH';
      else if (rawUpper === 'UPI' || rawUpper.startsWith('UPI')) val = 'UPI';
      else if (rawUpper === 'CARD' || rawUpper.includes('CARD')) val = 'CARD';
      else if (rawUpper === 'BANK' || rawUpper === 'BANK TRANSFER') val = 'BANK';
      else if (rawUpper === 'CHEQUE' || rawUpper === 'CHECK') val = 'CHEQUE';
      else if (rawUpper === 'ONLINE') val = 'ONLINE';
      return {
        value: val,
        label: pt.displayName || pt.paymentType,
        isDefault: Boolean(pt.isDefault),
      };
    });
  }, [paymentTypes]);

  useEffect(() => {
    if (paymentOptions.length > 0 && typeof setMethod === 'function') {
      const exists = paymentOptions.some((opt) => opt.value === method);
      if (!exists) {
        const defaultOpt = paymentOptions.find((opt) => opt.isDefault) || paymentOptions[0];
        setMethod(defaultOpt.value);
      }
    }
  }, [paymentOptions, method, setMethod]);

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
              options={paymentOptions} 
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
