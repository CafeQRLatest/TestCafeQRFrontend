import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { FaPlus, FaMinus, FaChevronRight } from 'react-icons/fa';
import { isNonVegProduct } from '../../CounterSale/domain/cart';

function formatPrice(val, decimals = 2) {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// ── Styled Components ──

const CardWrapper = styled.div`
  background: #ffffff;
  border-radius: 14px;
  border: 1.5px solid ${props => props.$inCart 
    ? (props.$themeColor || '#f97316') 
    : (props.$themeColor ? `${props.$themeColor}45` : '#fdba74')};
  box-shadow: ${props => props.$inCart 
    ? `0 6px 20px ${props.$themeColor ? `${props.$themeColor}30` : 'rgba(249, 115, 22, 0.2)'}` 
    : '0 2px 7px rgba(15, 23, 42, 0.04)'};
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: visible;
  position: relative;
  min-height: ${props => props.$hasImage ? '204px' : '114px'};
  user-select: none;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.09);
    border-color: ${props => props.$themeColor || '#f97316'};
  }

  &:hover .prod-img-inner {
    transform: scale(1.05);
  }

  &:active {
    transform: translateY(0) scale(0.99);
  }

  @media (max-width: 640px) {
    min-height: ${props => props.$hasImage ? '142px' : '78px'};
    border-radius: 9px;
    border-width: 1px;
  }
`;

const ImageHeader = styled.div`
  height: 96px;
  position: relative;
  overflow: hidden;
  border-top-left-radius: 12.5px;
  border-top-right-radius: 12.5px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-bottom: 1px solid #f1f5f9;

  @media (max-width: 640px) {
    height: 56px;
    padding: 3px;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
  }
`;

const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const ImageSkeleton = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    #f8fafc 25%,
    #f1f5f9 50%,
    #f8fafc 75%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;

  &::after {
    content: '';
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #e2e8f0;
    border-top-color: #cbd5e1;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const CardImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: ${props => props.$loaded ? 1 : 0};
  transition: opacity 0.22s ease-in, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
  position: relative;
`;

const VegIndicator = styled.div`
  position: absolute;
  top: 9px;
  right: 9px;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid ${props => props.$nonVeg ? '#ef4444' : '#16a34a'};
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);

  &::after {
    content: '';
    width: 7.5px;
    height: 7.5px;
    border-radius: ${props => props.$nonVeg ? '1px' : '50%'};
    background: ${props => props.$nonVeg ? '#ef4444' : '#16a34a'};
  }

  @media (max-width: 640px) {
    top: 4px;
    right: 4px;
    width: 12px;
    height: 12px;
    border-width: 1.2px;
    border-radius: 3px;

    &::after {
      width: 5px;
      height: 5px;
    }
  }
`;

const CartCountCircle = styled.div`
  position: absolute;
  top: -8px;
  left: -8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid ${props => props.$themeColor || '#f97316'};
  color: ${props => props.$themeDark || '#ea580c'};
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
  z-index: 10;
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;

  @media (max-width: 640px) {
    top: -5px;
    left: -5px;
    width: 18px;
    height: 18px;
    font-size: 9.5px;
    border-width: 1.5px;
  }
`;

const CardBody = styled.div`
  padding: ${props => props.$hasImage ? '10px 12px 12px' : '11px 12px 11px'};
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: space-between;
  gap: 7px;

  @media (max-width: 640px) {
    padding: 4px 5px 6px;
    gap: 2px;
  }
`;

const MetaRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media (max-width: 640px) {
    gap: 2px;
  }
`;

const ProductName = styled.div`
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.32;
  letter-spacing: -0.015em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 19px;
  padding-right: ${props => props.$noImage ? '22px' : '0'};

  @media (max-width: 640px) {
    font-size: 11px;
    line-height: 1.2;
    min-height: 14px;
    max-height: 28px;
    padding-right: ${props => props.$noImage ? '14px' : '0'};
  }
`;

const CategoryPill = styled.span`
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 5px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 640px) {
    font-size: 8.5px;
    padding: 1px 4px;
    border-radius: 3px;
  }
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 6px;

  @media (max-width: 640px) {
    margin-top: 2px;
    gap: 3px;
  }
`;

const PriceTag = styled.div`
  display: flex;
  align-items: baseline;
  gap: 5px;

  .price-val {
    font-weight: 750;
    font-size: 14px;
    color: #0f172a;
    letter-spacing: -0.3px;
    font-variant-numeric: tabular-nums;

    @media (max-width: 640px) {
      font-size: 10.5px;
      font-weight: 700;
    }
  }

  .open-badge {
    font-size: 8px;
    font-weight: 800;
    background: #f59e0b;
    color: white;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.4px;

    @media (max-width: 640px) {
      font-size: 7px;
      padding: 1px 3px;
    }
  }
`;

const ActionRow = styled.div`
  width: 100%;
  margin-top: 6px;

  @media (max-width: 640px) {
    margin-top: 2px;
  }
`;

const AddButton = styled.button`
  width: 100%;
  height: 34px;
  border: none;
  background: linear-gradient(135deg, ${props => props.$themeColor || '#f97316'} 0%, ${props => props.$themeDark || '#ea580c'} 100%);
  color: white;
  font-weight: 700;
  font-size: 12.5px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 2px 8px ${props => props.$themeColor ? `${props.$themeColor}35` : 'rgba(249, 115, 22, 0.28)'};
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px ${props => props.$themeColor ? `${props.$themeColor}50` : 'rgba(249, 115, 22, 0.38)'};
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    height: 25px;
    font-size: 10px;
    border-radius: 6px;
    gap: 3px;
  }
`;

const OptionsButton = styled.button`
  width: 100%;
  height: 34px;
  border: 1.5px solid ${props => props.$themeColor || '#f97316'};
  background: ${props => props.$themeSoft || '#fff7ed'};
  color: ${props => props.$themeDark || '#ea580c'};
  font-weight: 700;
  font-size: 12px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.18s ease;

  &:hover {
    background: ${props => props.$themeSoft || '#ffedd5'};
    border-color: ${props => props.$themeDark || '#ea580c'};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    height: 25px;
    font-size: 9.5px;
    border-radius: 6px;
    gap: 3px;
  }
`;

const StepperWrapper = styled.div`
  width: 100%;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${props => props.$themeSoft || '#fff7ed'};
  border: 1.5px solid ${props => props.$themeColor || '#f97316'};
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 7px ${props => props.$themeColor ? `${props.$themeColor}20` : 'rgba(249, 115, 22, 0.15)'};

  @media (max-width: 640px) {
    height: 25px;
    border-radius: 6px;
    border-width: 1px;
  }
`;

const StepperBtn = styled.button`
  border: none;
  background: transparent;
  color: ${props => props.$themeDark || '#ea580c'};
  width: 38px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.12s;
  flex-shrink: 0;

  &:hover {
    background: rgba(0,0,0,0.06);
  }

  &:active {
    background: rgba(0,0,0,0.12);
  }

  @media (max-width: 640px) {
    width: 22px;
    font-size: 9px;
  }
`;

const StepperInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: center;
  font-weight: 800;
  font-size: 13.5px;
  color: ${props => props.$themeDark || '#ea580c'};
  outline: none;
  -moz-appearance: textfield;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  @media (max-width: 640px) {
    font-size: 11px;
  }
`;

const PosProductCard = React.memo(function PosProductCard({
  product,
  quantity,
  hasOptions,
  sym = '₹',
  currencyDecimalPlaces = 2,
  theme,
  onAdd,
  onIncrement,
  onDecrement,
  onSetQty,
  menuImagesEnabled = true
}) {
  const nonVeg = isNonVegProduct(product);
  const [localQty, setLocalQty] = useState(quantity);
  const hasImage = Boolean(menuImagesEnabled && product.imageUrl);

  const themeColor = theme?.main || '#f97316';
  const themeDark = theme?.dark || '#ea580c';
  const themeSoft = theme?.soft || '#fff7ed';

  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [product.imageUrl]);

  useEffect(() => {
    setLocalQty(quantity);
  }, [quantity]);

  const handleCardClick = (e) => {
    if (e.target.closest('input') || e.target.closest('button')) return;
    onAdd(product);
  };

  return (
    <CardWrapper
      role="button"
      tabIndex={0}
      $themeColor={themeColor}
      $inCart={quantity > 0}
      $hasImage={hasImage}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd(product);
        }
      }}
    >
      {/* FSSAI Veg / Non-Veg Indicator */}
      <VegIndicator $nonVeg={nonVeg} title={nonVeg ? 'Non-Veg' : 'Veg'} />

      {/* Cart quantity circle badge (number only) */}
      {quantity > 0 && (
        <CartCountCircle
          $themeColor={themeColor}
          $themeDark={themeDark}
          title={`${quantity} in cart`}
        >
          {quantity}
        </CartCountCircle>
      )}

      {/* Render Image Header ONLY if image is available and enabled */}
      {hasImage && (
        <ImageHeader>
          {!imageLoaded && <ImageSkeleton />}
          <CardImg
            className="prod-img-inner"
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            $loaded={imageLoaded}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
        </ImageHeader>
      )}

      {/* Content Body */}
      <CardBody $hasImage={hasImage}>
        <MetaRow>
          <ProductName
            title={product.name}
            $noImage={!hasImage}
            $inCart={quantity > 0}
          >
            {product.name}
          </ProductName>
        </MetaRow>

        <PriceRow>
          <PriceTag>
            {product.isVariablePrice && <span className="open-badge">OPEN</span>}
            <span className="price-val">
              {sym}{formatPrice(product.price, currencyDecimalPlaces)}{hasOptions ? '+' : ''}
            </span>
          </PriceTag>
        </PriceRow>

        <ActionRow>
          {hasOptions ? (
            <OptionsButton
              type="button"
              $themeColor={themeColor}
              $themeDark={themeDark}
              $themeSoft={themeSoft}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(product);
              }}
            >
              Options <FaChevronRight size={9} />
            </OptionsButton>
          ) : quantity > 0 ? (
            <StepperWrapper
              $themeColor={themeColor}
              $themeSoft={themeSoft}
              onClick={(e) => e.stopPropagation()}
            >
              <StepperBtn
                type="button"
                $themeDark={themeDark}
                onClick={(e) => {
                  e.stopPropagation();
                  onDecrement(e, product);
                }}
                aria-label="Decrease quantity"
              >
                <FaMinus />
              </StepperBtn>
              <StepperInput
                type="number"
                $themeDark={themeDark}
                value={localQty === 0 && quantity > 0 ? '' : localQty}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalQty(val === '' ? '' : parseInt(val, 10));
                  if (val !== '' && !isNaN(parseInt(val, 10))) {
                    onSetQty(product, parseInt(val, 10));
                  }
                }}
                onBlur={() => {
                  if (localQty === '' || isNaN(parseInt(localQty, 10)) || parseInt(localQty, 10) <= 0) {
                    onSetQty(product, 0);
                    setLocalQty(0);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <StepperBtn
                type="button"
                $themeDark={themeDark}
                onClick={(e) => {
                  e.stopPropagation();
                  onIncrement(e, product);
                }}
                aria-label="Increase quantity"
              >
                <FaPlus />
              </StepperBtn>
            </StepperWrapper>
          ) : (
            <AddButton
              type="button"
              $themeColor={themeColor}
              $themeDark={themeDark}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(product);
              }}
            >
              <FaPlus size={10} /> Add
            </AddButton>
          )}
        </ActionRow>
      </CardBody>
    </CardWrapper>
  );
});

export default PosProductCard;
