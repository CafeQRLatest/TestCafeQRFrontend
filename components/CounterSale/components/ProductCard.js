import React, { useState, useRef, useEffect } from 'react';
import { FaPlus, FaMinus, FaImage, FaFire, FaLeaf, FaChevronRight } from 'react-icons/fa';
import * as S from '../CounterSale.styles';
import { isNonVegProduct } from '../domain/cart';
import { formatQty, parseQty, uomPrecisionOf } from '../domain/quantity';

const ProductCard = React.memo(function ProductCard({ 
  product, 
  quantity, 
  cartLineCount = 0,
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
  const precision = uomPrecisionOf(product);
  const unitLabel = product.uomShortName || product.uomName || null;
  const [showDesc, setShowDesc] = useState(false);
  const [localQty, setLocalQty] = useState(formatQty(quantity, precision));
  const editingQtyRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!editingQtyRef.current) setLocalQty(formatQty(quantity, precision));
  }, [quantity, precision]);

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
            {unitLabel && <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', marginLeft: '3px' }}>/ {unitLabel}</span>}
          </S.CsProdPrice>
          {hasOptions ? (
            <S.CsAddBtn $themeColor={theme.main} $outline>
              {cartLineCount > 0 && <S.CsVariantCount $themeColor={theme.main} title={`${cartLineCount} ${cartLineCount === 1 ? 'line' : 'lines'} in cart`} style={{ width: 10, height: 10, minWidth: 10, padding: 0, background: '#16a34a', border: 'none' }} />}
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
                type="text"
                inputMode={precision > 0 ? 'decimal' : 'numeric'}
                style={{ width: `${Math.max(3, String(localQty).length + 1)}ch`, flex: '0 0 auto' }}
                value={localQty === 0 && quantity > 0 ? '' : localQty}
                onFocus={(e) => { editingQtyRef.current = true; e.target.select(); }}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!/^\d*[.,]?\d*$/.test(val)) return;
                  if ((val.split(/[.,]/)[1] || '').length > precision) return;
                  setLocalQty(val);
                  const next = parseQty(val, precision);
                  if (next > 0) {
                    onSetQty(product, next);
                  }
                }}
                onBlur={() => {
                  editingQtyRef.current = false;
                  const next = parseQty(localQty, precision);
                  if (next <= 0) {
                    onSetQty(product, 0);
                    setLocalQty(0);
                  } else {
                    setLocalQty(formatQty(next, precision));
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
