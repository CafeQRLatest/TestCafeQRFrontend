import React, { useState, useRef, useEffect } from 'react';
import { FaPlus, FaMinus, FaImage, FaFire, FaLeaf, FaChevronRight } from 'react-icons/fa';
import * as S from '../CounterSale.styles';
import { isNonVegProduct } from '../domain/cart';

const ProductCard = React.memo(function ProductCard({ 
  product, 
  quantity, 
  hasOptions, 
  sym, 
  currencyDecimalPlaces, 
  theme, 
  onAdd, 
  onIncrement, 
  onDecrement,
  onSetQty,
  activeOrderMode = 'settle',
  menuImagesEnabled = true
}) {
  const nonVeg = isNonVegProduct(product);
  const [showDesc, setShowDesc] = useState(false);
  const [localQty, setLocalQty] = useState(quantity);
  const timerRef = useRef(null);

  useEffect(() => {
    setLocalQty(quantity);
  }, [quantity]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const isLongPressRef = useRef(false);

  const handleTouchStart = () => {
    if (!product.description) return;
    isLongPressRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowDesc(true);
      isLongPressRef.current = true;
    }, 500);
  };

  const handleTouchEnd = (event) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isLongPressRef.current) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      setShowDesc(false);
      isLongPressRef.current = false;
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAdd(product);
    }
  };

  return (
    <S.CsProductCard
      role="button"
      tabIndex={0}
      $themeColor={theme.main}
      $inCart={quantity > 0}
      $noImage={!menuImagesEnabled}
      onClick={() => {
        onAdd(product);
      }}
      onKeyDown={handleKeyDown}
    >
      {menuImagesEnabled ? (
        <S.CsProdImg style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}>
          {!product.imageUrl && <FaImage />}
          <S.CsVegBadge $nonVeg={nonVeg}>{nonVeg ? <FaFire /> : <FaLeaf />}</S.CsVegBadge>
        </S.CsProdImg>
      ) : (
        <S.CsVegBadge $nonVeg={nonVeg} style={{ top: '8px', right: '8px' }}>
          {nonVeg ? <FaFire /> : <FaLeaf />}
        </S.CsVegBadge>
      )}
      <S.CsProductBody>
        <S.CsProdNameWrapper style={!menuImagesEnabled ? { paddingRight: '16px' } : undefined}>
          <S.CsProdName
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchEnd}
            title={product.description || ''}
            style={product.description ? { cursor: 'help', textDecoration: 'underline dotted #cbd5e1' } : undefined}
          >
            {product.name}
          </S.CsProdName>
          {product.description && showDesc && (
            <S.CsNameTooltip $mode={activeOrderMode}>
              {product.description}
            </S.CsNameTooltip>
          )}
        </S.CsProdNameWrapper>
        <S.CsCategoryTag>{product.categoryName || 'Menu item'}</S.CsCategoryTag>
        <S.CsProdPriceRow>
          <S.CsProdPrice $themeColor={theme.main}>
            {product.isVariablePrice && <span style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px', verticalAlign: 'middle' }}>OPEN</span>}
            {sym}{Number(product.price || 0).toFixed(currencyDecimalPlaces)}{hasOptions ? '+' : ''}
          </S.CsProdPrice>
          {hasOptions ? (
            <S.CsAddBtn $themeColor={theme.main} $outline>
              {quantity > 0 && <S.CsVariantCount $themeColor={theme.main}>{quantity}</S.CsVariantCount>}
              Options <FaChevronRight style={{ fontSize: '9px' }} />
            </S.CsAddBtn>
          ) : quantity > 0 ? (
            <S.CsProductStepper
              $themeColor={theme.main}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <S.CsProductQtyBtn 
                type="button" 
                $themeColor={theme.main} 
                onClick={(event) => onDecrement(event, product)}
              >
                <FaMinus />
              </S.CsProductQtyBtn>
              <S.CsProductQtyValue 
                type="number"
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
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (['e', 'E', '+', '-'].includes(e.key)) {
                    e.preventDefault();
                  }
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
              />
              <S.CsProductQtyBtn 
                type="button" 
                $themeColor={theme.main} 
                onClick={(event) => onIncrement(event, product)}
              >
                <FaPlus />
              </S.CsProductQtyBtn>
            </S.CsProductStepper>
          ) : (
            <S.CsAddBtn $themeColor={theme.main}>
              <FaPlus /> Add
            </S.CsAddBtn>
          )}
        </S.CsProdPriceRow>
      </S.CsProductBody>

    </S.CsProductCard>
  );
});

export default ProductCard;
