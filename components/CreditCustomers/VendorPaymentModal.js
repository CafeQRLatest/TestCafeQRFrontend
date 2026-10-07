import React, { useState, useEffect, useMemo } from 'react';
import NiceSelect from '../NiceSelect';
import { fetchPurchasePaymentTypes } from '../../services/paymentApi';

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

  const [paymentTypes, setPaymentTypes] = useState([]);

  useEffect(() => {
    let active = true;
    const orgId = vendor?.organizationId || vendor?.orgId || order?.orgId || config?.organizationId || null;
    fetchPurchasePaymentTypes(orgId)
      .then((data) => {
        if (active && Array.isArray(data)) {
          setPaymentTypes(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load purchase payment types:', err);
      });
    return () => { active = false; };
  }, [vendor, order, config]);

  const paymentOptions = useMemo(() => {
    if (!paymentTypes || paymentTypes.length === 0) {
      return [
        { value: 'CASH', label: 'Cash' },
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'UPI', label: 'UPI / Digital' },
        { value: 'CHEQUE', label: 'Cheque' },
        { value: 'ONLINE', label: 'Card / Online' },
      ];
    }

    const filtered = paymentTypes.filter((pt) => {
      const act = pt.isActive ?? pt.isactive ?? 'Y';
      if (act === 'N' || act === false) return false;
      const isPurchase = pt.purchase === 'Y' || (Array.isArray(pt.applicableFor) ? pt.applicableFor.includes('PURCHASES') : pt.applicableFor === 'PURCHASES');
      if (isPurchase === false) return false;
      if (pt.paymentType === 'CREDIT' || String(pt.displayName || '').toUpperCase() === 'CREDIT') return false;
      if (String(pt.displayName || '').toUpperCase() === 'MIXED') return false;
      return true;
    });

    if (filtered.length === 0) {
      return [
        { value: 'CASH', label: 'Cash' },
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'UPI', label: 'UPI / Digital' },
        { value: 'CHEQUE', label: 'Cheque' },
        { value: 'ONLINE', label: 'Card / Online' },
      ];
    }

    return filtered.map((pt) => {
      const rawUpper = String(pt.displayName || pt.paymentType || 'OTHERS').toUpperCase().trim();
      let val = rawUpper.replace(/[\s\/-]+/g, '_');
      if (rawUpper === 'CASH') val = 'CASH';
      else if (rawUpper === 'BANK' || rawUpper === 'BANK TRANSFER') val = 'BANK';
      else if (rawUpper === 'UPI' || rawUpper.startsWith('UPI')) val = 'UPI';
      else if (rawUpper === 'CHEQUE' || rawUpper === 'CHECK') val = 'CHEQUE';
      else if (rawUpper === 'ONLINE' || rawUpper === 'CARD / ONLINE' || rawUpper === 'CARD') val = 'ONLINE';
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

  const currentBalance = Number(vendor.balance ?? vendor.openingBalance ?? 0);
  const orderTotal = order ? Number(order.total ?? order.totalAmount ?? order.total_amount ?? order.grandTotal ?? 0) : 0;
  const orderDue = order ? Number(order.amountDue ?? Math.max(0, orderTotal - Number(order.amountPaid ?? order.amount_paid ?? 0))) : 0;
  const orderPaid = order ? Number(order.amountPaid ?? order.amount_paid ?? Math.max(0, orderTotal - orderDue)) : 0;
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
              options={paymentOptions} 
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
