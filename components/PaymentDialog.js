import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaBook, FaCreditCard, FaExchangeAlt, FaMoneyBillWave, FaPlus, FaTimes, FaTrash, FaWallet } from 'react-icons/fa';
import NiceSelect from './NiceSelect';
import CreditCustomerQuickCreateModal from './CreditCustomerQuickCreateModal';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(10px);

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const Card = styled.div`
  width: min(432px, 100%);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  background: white;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);

  @media (max-width: 640px) {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 24px 24px 0 0;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: clamp(20px, 5.6vw, 22px);
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    margin-top: 4px;
  }
`;

const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 20px;
`;

const TotalBanner = styled.div`
  margin-top: 18px;
  border-radius: 18px;
  padding: 20px;
  background: linear-gradient(135deg, #f97316, #c2410c);
  color: white;

  span {
    display: block;
    font-size: 11px;
    letter-spacing: 0.08em;
    font-weight: 900;
    text-transform: uppercase;
    opacity: 0.86;
  }

  strong {
    display: block;
    margin-top: 8px;
    font-size: clamp(30px, 10vw, 38px);
    line-height: 1;
    font-weight: 900;
    overflow-wrap: anywhere;
  }
`;

const Breakdown = styled.div`
  margin-top: 14px;
  border: 1px dashed #cbd5e1;
  border-radius: 18px;
  background: #f8fafc;
  padding: 14px 16px;
  display: grid;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;

  strong {
    color: #0f172a;
  }
`;

const FieldGrid = styled.div`
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 10px;
`;

const Field = styled.label`
  display: grid;
  gap: 6px;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;

  input,
  select {
    min-width: 0;
    border: 1px solid #cbd5e1;
    border-radius: 13px;
    padding: 11px 12px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 800;
    outline: none;
  }
`;

const SplitPanel = styled.div`
  margin-top: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 10px;
`;

const CreditPanel = styled.div`
  margin-top: 16px;
  border: 1px solid #99f6e4;
  border-radius: 18px;
  background: #f0fdfa;
  padding: 12px;
  display: grid;
  gap: 8px;
`;

const CreditLabel = styled.div`
  color: #0f766e;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
`;

const CreditPickerRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const NewCreditButton = styled.button`
  min-height: 42px;
  border: 1px solid #99f6e4;
  border-radius: 13px;
  background: white;
  color: #0f766e;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

const SplitRow = styled.div`
  display: grid;
  grid-template-columns: minmax(108px, 0.95fr) minmax(96px, 1fr) 42px;
  gap: 8px;
  align-items: end;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const IconButton = styled.button`
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 12px;
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

  @media (max-width: 420px) {
    width: 100%;
  }
`;

const SplitFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 900;

  button {
    border: 0;
    border-radius: 12px;
    padding: 10px 12px;
    background: #fff7ed;
    color: #ea580c;
    font-weight: 900;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
`;

const MethodGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 10px;
  margin-top: 16px;
`;

const MethodButton = styled.button`
  min-height: 76px;
  border-radius: 16px;
  border: 1px solid ${props => props.$active ? '#f97316' : '#e2e8f0'};
  background: ${props => props.$active ? '#fff7ed' : 'white'};
  color: ${props => props.$active ? '#ea580c' : '#64748b'};
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  display: grid;
  place-items: center;
  gap: 6px;
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 12px;
  margin-top: 20px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const Button = styled.button`
  border: 0;
  border-radius: 16px;
  min-height: 56px;
  cursor: pointer;
  background: ${props => props.$primary ? '#f97316' : '#f8fafc'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  font-size: 15px;
  font-weight: 900;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.div`
  margin-top: 10px;
  color: #dc2626;
  font-size: 12px;
  font-weight: 800;
`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const SPLIT_METHODS = ['CASH', 'ONLINE', 'UPI', 'CARD', 'BANK', 'CHEQUE'];

const createInitialSplits = (payable) => {
  const half = Number((payable / 2).toFixed(2));
  return [
    { paymentMethod: 'CASH', amount: String(half), referenceNo: '' },
    { paymentMethod: 'ONLINE', amount: String(Number((payable - half).toFixed(2))), referenceNo: '' },
  ];
};

export default function PaymentDialog({ order, loading = false, creditEnabled = false, creditCustomers = [], onClose, onConfirm, onCreditCustomerCreated }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [discountAmount, setDiscountAmount] = useState('');
  const [roundOffAmount, setRoundOffAmount] = useState('');
  const [paymentSplits, setPaymentSplits] = useState([]);
  const [creditCustomerId, setCreditCustomerId] = useState(order?.creditCustomerId || order?.credit_customer_id || '');
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);

  const baseTotal = Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);
  const taxAmount = Number(order?.totalTaxAmount ?? order?.total_tax_amount ?? 0);
  const discount = toNumber(discountAmount);
  const roundOff = toNumber(roundOffAmount);
  const payable = useMemo(() => Math.max(0, baseTotal - discount + roundOff), [baseTotal, discount, roundOff]);
  const subtotal = Math.max(0, baseTotal - taxAmount);
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
    if (mixedInvalid || creditInvalid) return;
    if (paymentMethod === 'CREDIT') {
      onConfirm?.({
        paymentMethod: 'CREDIT',
        creditCustomerId,
        amountPaid: 0,
        discountAmount: Number(discount.toFixed(2)),
        roundOffAmount: Number(roundOff.toFixed(2)),
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
      discountAmount: Number(discount.toFixed(2)),
      roundOffAmount: Number(roundOff.toFixed(2)),
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
          <Row><span>Gross Total</span><strong>{money(baseTotal)}</strong></Row>
          <Row><span>Subtotal</span><strong>{money(subtotal)}</strong></Row>
          <Row><span>Discount</span><strong>{money(discount)}</strong></Row>
          <Row><span>Tax</span><strong>{money(taxAmount)}</strong></Row>
          <Row><span>Round Off</span><strong>{money(roundOff)}</strong></Row>
        </Breakdown>

        <FieldGrid>
          <Field>
            Discount
            <input type="number" min="0" step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} />
          </Field>
          <Field>
            Round Off
            <input type="number" step="0.01" value={roundOffAmount} onChange={(event) => setRoundOffAmount(event.target.value)} />
          </Field>
        </FieldGrid>

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

        <Actions>
          <Button type="button" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" $primary disabled={loading || mixedInvalid || creditInvalid} onClick={submit}>
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
