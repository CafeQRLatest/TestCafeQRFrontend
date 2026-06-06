import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaBook, FaCreditCard, FaExchangeAlt, FaMoneyBillWave, FaPlus, FaTimes, FaTrash, FaWallet } from 'react-icons/fa';
import { calculateOrderTotals } from '../utils/orderCalculations';
import NiceSelect from './NiceSelect';
import CreditCustomerQuickCreateModal from './CreditCustomerQuickCreateModal';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const Card = styled.div`
  width: min(340px, 100%);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  background: white;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media (max-width: 640px) {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 20px 20px 0 0;
    padding: 16px 14px calc(16px + env(safe-area-inset-bottom, 0px));
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 17px;
    font-weight: 900;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    margin-top: 2px;
  }
`;

const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TotalBanner = styled.div`
  border-radius: 12px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;

  span {
    font-size: 11px;
    letter-spacing: 0.05em;
    font-weight: 800;
    text-transform: uppercase;
    opacity: 0.9;
  }

  strong {
    font-size: 22px;
    font-weight: 900;
  }
`;

const Breakdown = styled.div`
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;

  strong {
    color: #0f172a;
    font-weight: 800;
  }
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;

  input,
  select {
    min-width: 0;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 10px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    outline: none;
  }
`;

const SplitPanel = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

const CreditPanel = styled.div`
  border: 1px solid #99f6e4;
  border-radius: 12px;
  background: #f0fdfa;
  padding: 10px;
  display: grid;
  gap: 6px;
`;

const CreditLabel = styled.div`
  color: #0f766e;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
`;

const CreditPickerRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
`;

const NewCreditButton = styled.button`
  min-height: 38px;
  border: 1px solid #99f6e4;
  border-radius: 10px;
  background: white;
  color: #0f766e;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

const SplitRow = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1fr auto;
  gap: 6px;
  align-items: end;
`;

const IconButton = styled.button`
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: ${props => props.$danger ? '#fee2e2' : '#e0f2fe'};
  color: ${props => props.$danger ? '#dc2626' : '#0369a1'};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const SplitFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 11px;
  font-weight: 800;

  button {
    border: 0;
    border-radius: 8px;
    padding: 6px 10px;
    background: #fff7ed;
    color: #ea580c;
    font-weight: 800;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
`;

const MethodGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
`;

const MethodButton = styled.button`
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid ${props => props.$active ? '#f97316' : '#e2e8f0'};
  background: ${props => props.$active ? '#fff7ed' : 'white'};
  color: ${props => props.$active ? '#ea580c' : '#64748b'};
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 10px;
  margin-top: 6px;
`;

const Button = styled.button`
  border: 0;
  border-radius: 12px;
  min-height: 44px;
  cursor: pointer;
  background: ${props => props.$primary ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#f1f5f9'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  font-size: 13px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.div`
  color: #dc2626;
  font-size: 11px;
  font-weight: 800;
`;



const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => `\u20B9${Number(value || 0).toFixed(2)}`;

const SPLIT_METHODS = ['CASH', 'ONLINE', 'UPI', 'CARD', 'BANK', 'CHEQUE'];

const createInitialSplits = (payable) => {
  const half = Number((payable / 2).toFixed(2));
  return [
    { paymentMethod: 'CASH', amount: String(half), referenceNo: '' },
    { paymentMethod: 'ONLINE', amount: String(Number((payable - half).toFixed(2))), referenceNo: '' },
  ];
};

export default function PaymentDialog({ 
  order, 
  loading = false, 
  config = null, 
  creditCustomers = [], 
  onClose, 
  onConfirm, 
  onCreditCustomerCreated 
}) {
  const creditEnabled = Boolean(config?.creditEnabled);
  const roundOffEnabled = Boolean(config?.roundOffEnabled);
  const roundOffMode = config?.roundOffMode || 'automatic';
  const roundOffAutoFactor = Number(config?.roundOffAutoFactor ?? 1);
  const roundOffManualLimit = Number(config?.roundOffManualLimit ?? 10);

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentSplits, setPaymentSplits] = useState([]);
  const [creditCustomerId, setCreditCustomerId] = useState(order?.creditCustomerId || order?.credit_customer_id || '');
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);



  const [modifiedOrder, setModifiedOrder] = useState(null);
  const [totals, setTotals] = useState(null);

  const toCartItems = (lines) => {
    return (lines || []).map((line, index) => {
      const price = toNumber(line.unitPrice ?? line.unit_price ?? line.price ?? 0);
      const qty = toNumber(line.quantity ?? line.qty ?? 1) || 1;
      const key = line.cartKey || line.id || `${line.productId || 'line'}-${line.variantId || 'base'}-${index}`;
      
      const discPercent = line.discountPercent ?? line.discount_percent ?? 0;
      const discAmount = line.discountAmount ?? line.discount_amount ?? 0;

      let initialType = 'amount';
      let initialVal = 0;
      if (discPercent > 0) {
        initialType = 'percent';
        initialVal = discPercent;
      } else if (discAmount > 0) {
        initialVal = discAmount;
      } else if (line.discount) {
        initialType = line.discount.type || 'amount';
        initialVal = line.discount.value || 0;
      }

      return {
        ...line,
        cartKey: key,
        displayName: line.productName || line.product_name || line.name || 'Item',
        price,
        qty,
        discount_percent: initialType === 'percent' ? initialVal : 0,
        discount_amount: initialType === 'amount' ? initialVal : 0,
        discount: { type: initialType, value: initialVal },
      };
    });
  };

  const baseTotal = Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);

  // Startup hook to calculate initial totals and lines using centralized GST math
  useEffect(() => {
    if (order && !modifiedOrder) {
      const items = toCartItems(order.lines || []);
      const configProfile = {
        gst_enabled: config?.taxEnabled,
        default_tax_rate: (() => {
          if (!config?.taxEnabled) return 0;
          const rates = config?.taxRates || [];
          const def = rates.find(r => r.id === config?.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config?.pricesIncludeTax,
        round_off_config: {
          round_off_enabled: config?.roundOffEnabled,
          round_off_mode: config?.roundOffMode || 'automatic',
          round_off_auto_factor: Number(config?.roundOffAutoFactor ?? 1),
        },
      };
      
      const totalLineDisc = items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
      const totalDisc = Number(order.totalDiscountAmount ?? order.total_discount_amount ?? 0);

      const ordDiscType = order.orderDiscount?.type || 'amount';
      const ordDiscVal = order.orderDiscount?.value || Math.max(0, totalDisc - totalLineDisc);

      const orderDisc = {
        type: ordDiscType === 'percent' ? 'percent' : 'amount',
        value: ordDiscVal,
      };

      const calculated = calculateOrderTotals(
        items.map((line) => ({
          id: line.cartKey,
          productId: line.productId,
          name: line.displayName,
          price: line.price,
          quantity: line.qty,
          tax_rate: line.taxRate || line.tax_rate || 0,
          is_packaged_good: line.isPackagedGood,
          is_packaged: line.isPackagedGood,
          discount_percent: line.discount_percent,
          discount_amount: line.discount_amount,
          discount: line.discount,
        })),
        orderDisc,
        configProfile
      );

      const processedLines = (calculated.processed_items || []).map((processed, idx) => {
        const original = items[idx];
        return {
          ...original,
          quantity: processed.quantity,
          unitPrice: processed.unit_price,
          taxRate: processed.tax_rate,
          taxAmount: processed.tax_amount,
          discountAmount: processed.discount_amount,
          lineTotal: processed.line_total,
        };
      });

      setModifiedOrder({
        ...order,
        grandTotal: calculated.total_amount,
        totalTaxAmount: calculated.total_tax,
        totalAmount: calculated.total_inc_tax,
        totalDiscountAmount: calculated.discount_amount,
        lines: processedLines,
      });

      setTotals({
        grossTotal: calculated.gross_face_total,
        discount: calculated.discount_amount,
        taxable: calculated.taxable_amount,
        tax: calculated.total_tax,
        roundOff: calculated.round_off_amount,
        payable: calculated.total_amount,
      });
    }
  }, [order, config, modifiedOrder]);



  // Derived values from calculated totals
  const activePayable = totals ? totals.payable : baseTotal;
  const gross = totals ? totals.grossTotal : baseTotal;
  const disc = totals ? totals.discount : Number(order?.totalDiscountAmount ?? 0);
  const tax = totals ? totals.tax : Number(order?.totalTaxAmount ?? 0);
  const round = totals ? totals.roundOff : 0;
  const subtotal = Math.max(0, gross - disc);

  const [roundOffAmount, setRoundOffAmount] = useState('0.00');

  useEffect(() => {
    if (totals) {
      setRoundOffAmount(String(totals.roundOff));
    }
  }, [totals]);

  const roundOff = toNumber(roundOffAmount);
  const payable = roundOffEnabled && roundOffMode === 'manual'
    ? Number((subtotal + tax + roundOff).toFixed(2))
    : activePayable;

  const isRoundOffValid = useMemo(() => {
    if (!roundOffEnabled) return true;
    if (roundOffMode === 'manual') {
      return Math.abs(roundOff) <= roundOffManualLimit;
    }
    return true;
  }, [roundOffEnabled, roundOffMode, roundOff, roundOffManualLimit]);

  const isDiscountValid = true; // Fully managed inside the discount modal!

  const mixedTotal = paymentSplits.reduce((sum, split) => sum + toNumber(split.amount), 0);
  const selectedSplitMethods = paymentSplits.map((split) => split.paymentMethod).filter(Boolean);
  const hasDuplicateSplitMethod = new Set(selectedSplitMethods).size !== selectedSplitMethods.length;
  const hasInvalidSplitRow = paymentSplits.some((split) => !split.paymentMethod || toNumber(split.amount) <= 0);
  const mixedInvalid = paymentMethod === 'MIXED'
    && (paymentSplits.length === 0 || hasDuplicateSplitMethod || hasInvalidSplitRow || Math.abs(mixedTotal - payable) > 0.01);
  const creditInvalid = paymentMethod === 'CREDIT' && !creditCustomerId;
  const creditCustomerOptions = useMemo(
    () => creditCustomers.map((customer) => ({
      value: customer.id,
      label: `${customer.name || 'Credit Customer'}${customer.phone ? ` (${customer.phone})` : ''} - ${money(customer.balance)}`,
    })),
    [creditCustomers]
  );

  const handleCreditCustomerCreated = (customer) => {
    if (!customer?.id) return;
    setCreditCustomerId(customer.id);
    onCreditCustomerCreated?.(customer);
  };

  const chooseMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'MIXED') {
      setPaymentSplits((current) => current.length > 0 ? current : createInitialSplits(payable));
    } else if (method !== 'MIXED') {
      setPaymentSplits([]);
    }
  };

  const updateSplit = (index, field, value) => {
    setPaymentSplits((current) => current.map((split, currentIndex) => (
      currentIndex === index ? { ...split, [field]: value } : split
    )));
  };

  const addSplitRow = () => {
    setPaymentSplits((current) => {
      const usedMethods = new Set(current.map((split) => split.paymentMethod));
      const nextMethod = SPLIT_METHODS.find((method) => !usedMethods.has(method));
      if (!nextMethod) return current;
      return [...current, { paymentMethod: nextMethod, amount: '', referenceNo: '' }];
    });
  };

  const removeSplitRow = (index) => {
    setPaymentSplits((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submit = () => {
    if (mixedInvalid || creditInvalid || !isRoundOffValid) return;
    const finalRoundOff = roundOffEnabled ? roundOff : 0;
    const finalOrder = modifiedOrder ? {
      ...modifiedOrder,
      grandTotal: payable,
      totalAmount: payable,
      roundOffAmount: finalRoundOff,
    } : null;

    if (paymentMethod === 'CREDIT') {
      onConfirm?.({
        paymentMethod: 'CREDIT',
        creditCustomerId,
        amountPaid: 0,
        discountAmount: Number(disc.toFixed(2)),
        roundOffAmount: Number(finalRoundOff.toFixed(2)),
        updatedOrder: finalOrder, // Send modified lines & totals back to host first!
      });
      return;
    }
    const normalizedSplits = paymentMethod === 'MIXED'
      ? paymentSplits.map((split) => ({
          paymentMethod: split.paymentMethod,
          amount: Number(toNumber(split.amount).toFixed(2)),
          referenceNo: split.referenceNo?.trim() || null,
        }))
      : [];
    const cashAmount = normalizedSplits
      .filter((split) => split.paymentMethod === 'CASH')
      .reduce((sum, split) => sum + split.amount, 0);
    const nonCashAmount = normalizedSplits
      .filter((split) => split.paymentMethod !== 'CASH')
      .reduce((sum, split) => sum + split.amount, 0);
    onConfirm?.({
      paymentMethod,
      amountPaid: Number(payable.toFixed(2)),
      cashAmount: paymentMethod === 'MIXED' ? Number(cashAmount.toFixed(2)) : null,
      onlineAmount: paymentMethod === 'MIXED' ? Number(nonCashAmount.toFixed(2)) : null,
      paymentSplits: normalizedSplits,
      discountAmount: Number(disc.toFixed(2)),
      roundOffAmount: Number(finalRoundOff.toFixed(2)),
      updatedOrder: finalOrder, // Send modified lines & totals back to host first!
    });
  };

  if (!order) return null;

  return (
    <Overlay onMouseDown={onClose}>
      <Card onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <div>
            <h2>Payment Collection</h2>
            <span>{order.orderNo || order.order_no || `#${String(order.id || '').slice(0, 8)}`} - {order.tableNumber || order.table_number || 'Counter'}</span>
          </div>
          <CloseButton type="button" onClick={onClose} aria-label="Close payment dialog">
            <FaTimes />
          </CloseButton>
        </Header>

        <TotalBanner>
          <span>Settled Total</span>
          <strong>{money(payable)}</strong>
        </TotalBanner>

        <Breakdown>
          <Row><span>Gross Total</span><strong>{money(gross)}</strong></Row>
          {disc > 0 && <Row style={{ color: '#ea580c' }}><span>Discount</span><strong>-{money(disc)}</strong></Row>}
          <Row><span>Subtotal</span><strong>{money(subtotal)}</strong></Row>
          <Row><span>Tax</span><strong>{money(tax)}</strong></Row>
          {roundOffEnabled && (
            <Row><span>Round Off</span><strong>{money(roundOff)}</strong></Row>
          )}
        </Breakdown>

        {roundOffEnabled && roundOffMode === 'manual' && (
          <Field>
            Round Off (Limit ±₹{roundOffManualLimit.toFixed(2)})
            <input type="number" step="0.01" value={roundOffAmount} onChange={(event) => setRoundOffAmount(event.target.value)} />
          </Field>
        )}

        <MethodGrid>
          <MethodButton type="button" $active={paymentMethod === 'CASH'} onClick={() => chooseMethod('CASH')}>
            <FaMoneyBillWave /> Cash
          </MethodButton>
          <MethodButton type="button" $active={paymentMethod === 'ONLINE'} onClick={() => chooseMethod('ONLINE')}>
            <FaCreditCard /> Online
          </MethodButton>
          <MethodButton type="button" $active={paymentMethod === 'MIXED'} onClick={() => chooseMethod('MIXED')}>
            <FaExchangeAlt /> Mixed
          </MethodButton>
          {creditEnabled && (
            <MethodButton type="button" $active={paymentMethod === 'CREDIT'} onClick={() => chooseMethod('CREDIT')}>
              <FaBook /> Credit
            </MethodButton>
          )}
        </MethodGrid>

        {paymentMethod === 'CREDIT' && (
          <CreditPanel>
            <CreditLabel>Credit Customer</CreditLabel>
            <CreditPickerRow>
              <NiceSelect
                value={creditCustomerId}
                onChange={setCreditCustomerId}
                placeholder="Choose customer..."
                options={creditCustomerOptions}
                maxHeight={320}
                style={{ height: 42, minWidth: 0 }}
              />
              <NewCreditButton type="button" onClick={() => setShowNewCreditCustomer(true)}>
                <FaPlus /> New
              </NewCreditButton>
            </CreditPickerRow>
          </CreditPanel>
        )}

        {paymentMethod === 'MIXED' && (
          <SplitPanel>
            {paymentSplits.map((split, index) => (
              <SplitRow key={`${split.paymentMethod}-${index}`}>
                <Field>
                  Method
                  <select
                    value={split.paymentMethod}
                    onChange={(event) => updateSplit(index, 'paymentMethod', event.target.value)}
                  >
                    {SPLIT_METHODS.map((method) => (
                      <option
                        key={method}
                        value={method}
                        disabled={paymentSplits.some((row, rowIndex) => rowIndex !== index && row.paymentMethod === method)}
                      >
                        {method}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  Amount
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={split.amount}
                    onChange={(event) => updateSplit(index, 'amount', event.target.value)}
                  />
                </Field>
                <IconButton
                  type="button"
                  $danger
                  onClick={() => removeSplitRow(index)}
                  disabled={paymentSplits.length <= 1}
                  aria-label="Remove payment split"
                >
                  <FaTrash />
                </IconButton>
              </SplitRow>
            ))}
            <SplitFooter>
              <button type="button" onClick={addSplitRow} disabled={paymentSplits.length >= SPLIT_METHODS.length}>
                <FaPlus /> Add Split
              </button>
              <span>{money(mixedTotal)} / {money(payable)}</span>
            </SplitFooter>
          </SplitPanel>
        )}
        {mixedInvalid && (
          <ErrorText>Mixed payment split must be valid and equal {money(payable)}.</ErrorText>
        )}
        {creditInvalid && (
          <ErrorText>Choose a credit customer to complete this order as credit.</ErrorText>
        )}
        {!isRoundOffValid && (
          <ErrorText>Manual round off must not exceed the limit of ±₹{roundOffManualLimit.toFixed(2)}.</ErrorText>
        )}
 
        <Actions>
          <Button type="button" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" $primary disabled={loading || mixedInvalid || creditInvalid || !isRoundOffValid} onClick={submit}>
            {loading ? 'Settling...' : paymentMethod === 'CREDIT' ? <><FaBook /> Complete as Credit</> : <><FaWallet /> Settle & Finish</>}
          </Button>
        </Actions>
        <CreditCustomerQuickCreateModal
          open={showNewCreditCustomer}
          themeColor="#14b8a6"
          onClose={() => setShowNewCreditCustomer(false)}
          onCreated={handleCreditCustomerCreated}
        />
      </Card>
    </Overlay>
  );
}

