import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: vpFadeIn 0.15s ease;
  @keyframes vpFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const Modal = styled.div`
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 25px 60px rgba(15, 23, 42, 0.25);
  overflow: hidden;
  animation: vpSlideUp 0.2s ease;
  @keyframes vpSlideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

const Header = styled.div`
  padding: 20px 24px 12px;
  border-bottom: 1px solid #f1f5f9;
`;

const ProductName = styled.h3`
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
`;

const SuggestedPrice = styled.p`
  margin: 0;
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
`;

const OpenBadge = styled.span`
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-left: 8px;
  vertical-align: middle;
`;

const Body = styled.div`
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const PriceInput = styled.input`
  width: 100%;
  padding: 12px 14px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  outline: none;
  text-align: center;
  box-sizing: border-box;
  transition: border-color 0.2s;
  &:focus {
    border-color: ${props => props.$themeColor || '#16a34a'};
    box-shadow: 0 0 0 3px ${props => (props.$themeColor || '#16a34a') + '22'};
  }
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const QtyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const QtyInput = styled.input`
  width: 70px;
  padding: 8px 10px;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  text-align: center;
  box-sizing: border-box;
  transition: border-color 0.2s;
  &:focus {
    border-color: ${props => props.$themeColor || '#16a34a'};
  }
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const FooterRow = styled.div`
  padding: 16px 24px 20px;
  display: flex;
  gap: 10px;
  border-top: 1px solid #f1f5f9;
`;

const CancelBtn = styled.button`
  flex: 1;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: #e2e8f0; }
`;

const ConfirmBtn = styled.button`
  flex: 2;
  padding: 12px;
  font-size: 14px;
  font-weight: 700;
  color: white;
  background: ${props => props.$themeColor || '#16a34a'};
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.9; }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export default function VariablePriceModal({
  product,
  onConfirm,
  onClose,
  sym = '₹',
  themeColor = '#16a34a',
  currencyDecimalPlaces = 2,
}) {
  const basePrice = Number(product?.price || 0);
  const [price, setPrice] = useState(basePrice > 0 ? String(basePrice) : '');
  const [qty, setQty] = useState('1');
  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus and select the price input
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const parsedPrice = parseFloat(price);
  const parsedQty = parseInt(qty, 10);
  const isValid = !isNaN(parsedPrice) && parsedPrice >= 0 && !isNaN(parsedQty) && parsedQty > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(product, parsedPrice, parsedQty);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isValid) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <Header>
          <ProductName>
            {product?.name || 'Product'}
            <OpenBadge>OPEN</OpenBadge>
          </ProductName>
          {basePrice > 0 && (
            <SuggestedPrice>
              Suggested price: {sym}{basePrice.toFixed(currencyDecimalPlaces)}
            </SuggestedPrice>
          )}
        </Header>
        <Body>
          <InputGroup>
            <Label>Enter Price ({sym})</Label>
            <PriceInput
              ref={inputRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={price}
              onChange={e => setPrice(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              $themeColor={themeColor}
            />
          </InputGroup>
          <QtyRow>
            <Label style={{ margin: 0 }}>Qty</Label>
            <QtyInput
              type="number"
              inputMode="numeric"
              min="1"
              value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={handleKeyDown}
              $themeColor={themeColor}
            />
            {isValid && (
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                = {sym}{(parsedPrice * parsedQty).toFixed(currencyDecimalPlaces)}
              </span>
            )}
          </QtyRow>
        </Body>
        <FooterRow>
          <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
          <ConfirmBtn
            type="button"
            disabled={!isValid}
            onClick={handleConfirm}
            $themeColor={themeColor}
          >
            Add to Cart
          </ConfirmBtn>
        </FooterRow>
      </Modal>
    </Overlay>
  );
}
