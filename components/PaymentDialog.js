import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaCreditCard, FaExchangeAlt, FaMoneyBillWave, FaTimes, FaWallet } from 'react-icons/fa';

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

  input {
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

export default function PaymentDialog({ order, loading = false, onClose, onConfirm }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [discountAmount, setDiscountAmount] = useState('');
  const [roundOffAmount, setRoundOffAmount] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');

  const baseTotal = Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);
  const taxAmount = Number(order?.totalTaxAmount ?? order?.total_tax_amount ?? 0);
  const discount = toNumber(discountAmount);
  const roundOff = toNumber(roundOffAmount);
  const payable = useMemo(() => Math.max(0, baseTotal - discount + roundOff), [baseTotal, discount, roundOff]);
  const subtotal = Math.max(0, baseTotal - taxAmount);
  const mixedTotal = toNumber(cashAmount) + toNumber(onlineAmount);
  const mixedInvalid = paymentMethod === 'MIXED' && Math.abs(mixedTotal - payable) > 0.01;

  const chooseMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'MIXED') {
      const half = Number((payable / 2).toFixed(2));
      setCashAmount(String(half));
      setOnlineAmount(String(Number((payable - half).toFixed(2))));
    }
  };

  const submit = () => {
    if (mixedInvalid) return;
    onConfirm?.({
      paymentMethod,
      amountPaid: Number(payable.toFixed(2)),
      cashAmount: paymentMethod === 'MIXED' ? Number(toNumber(cashAmount).toFixed(2)) : null,
      onlineAmount: paymentMethod === 'MIXED' ? Number(toNumber(onlineAmount).toFixed(2)) : null,
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
        </MethodGrid>

        {paymentMethod === 'MIXED' && (
          <FieldGrid>
            <Field>
              Cash Amount
              <input type="number" min="0" step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} />
            </Field>
            <Field>
              Online Amount
              <input type="number" min="0" step="0.01" value={onlineAmount} onChange={(event) => setOnlineAmount(event.target.value)} />
            </Field>
          </FieldGrid>
        )}

        {mixedInvalid && (
          <ErrorText>Mixed payment split must equal {money(payable)}.</ErrorText>
        )}

        <Actions>
          <Button type="button" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" $primary disabled={loading || mixedInvalid} onClick={submit}>
            {loading ? 'Settling...' : <><FaWallet /> Settle & Finish</>}
          </Button>
        </Actions>
      </Card>
    </Overlay>
  );
}
