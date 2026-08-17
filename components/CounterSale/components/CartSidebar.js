import React, { useState, useEffect } from 'react';
import { FaTimes, FaWallet, FaFire, FaUtensils } from 'react-icons/fa';
import * as S from '../CounterSale.styles';
import CartItem from './CartItem';
import CustomerSelector from './CustomerSelector';
import OrderSummary from './OrderSummary';

// Dedicated sub-component for Kitchen Note with mode-aware dynamic coloring
function KitchenNoteInput({ orderNote, setOrderNote, activeOrderMode, theme }) {
  const [localValue, setLocalValue] = useState(orderNote || '');

  // Keep local input in sync if parent orderNote changes from outside (e.g. cleared on order submit)
  useEffect(() => {
    setLocalValue(orderNote || '');
  }, [orderNote]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);
    if (typeof setOrderNote === 'function') {
      setOrderNote(val);
    }
  };

  const handleClear = () => {
    setLocalValue('');
    if (typeof setOrderNote === 'function') {
      setOrderNote('');
    }
  };

  const hasNote = Boolean(localValue && localValue.trim());
  const isKitchenMode = activeOrderMode === 'kitchen';

  // Dynamic Theme Colors: Softer Flame Orange for Kitchen mode, Emerald for Settle mode
  const activeBg = isKitchenMode ? '#fff7ed' : '#f0fdf4';
  const activeBorder = isKitchenMode ? '#fdba74' : '#a7f3d0';
  const activeInputBorder = isKitchenMode ? '#fed7aa' : '#bbf7d0';
  const activeTitleColor = isKitchenMode ? '#9a3412' : '#047857';
  const activeGlow = isKitchenMode 
    ? '0 2px 6px -1px rgba(249, 115, 22, 0.12)' 
    : '0 2px 6px -1px rgba(16, 185, 129, 0.12)';

  return (
    <div 
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        padding: '8px 10px',
        background: hasNote ? activeBg : '#f8fafc',
        border: `1px solid ${hasNote ? activeBorder : '#e2e8f0'}`,
        borderRadius: '8px',
        boxShadow: hasNote ? activeGlow : '0 1px 2px rgba(15, 23, 42, 0.02)',
        transition: 'all 0.15s ease-in-out'
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '9.5px',
          fontWeight: 600,
          color: hasNote ? activeTitleColor : '#64748b',
          letterSpacing: '0.03em',
          textTransform: 'uppercase'
        }}>
          Kitchen Note (whole order)
        </span>
        {hasNote && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '9.5px',
              fontWeight: 600,
              padding: '0 2px'
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Input Field */}
      <div style={{ width: '100%' }}>
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          placeholder="e.g. Less spicy, extra napkins..."
          maxLength={200}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '5px 9px',
            border: `1px solid ${hasNote ? activeInputBorder : '#cbd5e1'}`,
            borderRadius: '6px',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#0f172a',
            background: 'white',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'all 0.15s ease'
          }}
        />
      </div>
    </div>
  );
}

export default function CartSidebar({
  bootstrap,
  catalog,
  cart,
  customer,
  discounts,
  order,
  ui,
  mobileCartOpen,
  setMobileCartOpen
}) {
  const { config } = bootstrap;
  const { productListingOn } = catalog;
  const { 
    items: cartItems, cartKeyFor, updateQty, handleEditProductFromCart, 
    setItemDescription, totals, roundOffPreview, cartCountLabel,
    orderNote, setOrderNote
  } = cart;
  const {
    customersEnabled, selectedId: selectedCustomerId, name: customerName, 
    phone: customerPhone, age: customerAge, setName: setCustomerName, 
    setPhone: setCustomerPhone, setAge: setCustomerAge, showDropdown: showCustomerDropdown, 
    setShowDropdown: setShowCustomerDropdown, handleCustomerKeyDown, removeCustomer, 
    selectCustomer, filteredCustomers, selectedCustomers
  } = customer;
  const { discountsEnabled, setShowModal: setShowDiscountModal } = discounts;
  const { activeOrderMode, processing, handleCompleteSettle, handlePlaceOrder } = order;
  const { THEME: theme, sym } = ui;

  const currencyDecimalPlaces = config?.currencyDecimalPlaces ?? 2;

  const renderPayButton = (extraStyles = {}) => {
    return (
      <S.CsPayBtn 
        $color={theme.main} 
        $colorDark={theme.dark} 
        disabled={cartItems.length === 0 || processing}
        onClick={activeOrderMode === 'kitchen' ? () => handlePlaceOrder() : handleCompleteSettle}
        style={extraStyles}
      >
        {processing ? 'Processing...' : (
          <>
            {activeOrderMode === 'kitchen' ? <FaFire/> : <FaWallet/>}
            <span style={{ marginLeft: activeOrderMode === 'kitchen' ? '8px' : '6px' }}>
              {activeOrderMode === 'kitchen' ? 'Send to Kitchen' : 'Complete Sale'}
            </span>
          </>
        )}
      </S.CsPayBtn>
    );
  };

  const customerProps = {
    customersEnabled,
    config,
    selectedCustomerId,
    customerName,
    customerPhone,
    customerAge,
    setCustomerName,
    setCustomerPhone,
    setCustomerAge,
    showCustomerDropdown,
    setShowCustomerDropdown,
    handleCustomerKeyDown,
    removeCustomer,
    selectCustomer,
    filteredCustomers,
    selectedCustomers
  };

  const summaryProps = {
    totals,
    roundOffPreview,
    config,
    sym,
    theme,
    currencyDecimalPlaces
  };

  // Render the Side Bar (Standard view: productListingOn = true)
  if (productListingOn) {
    return (
      <S.CsCartSection $mobileOpen={mobileCartOpen}>
        <S.CsCartHeader>
          <div>
            <S.CsTitle style={{ fontSize: '18px' }}>Your Cart</S.CsTitle>
            <S.CsSubtitle style={{ color: theme.main, fontWeight: 800 }}>{cartCountLabel}</S.CsSubtitle>
          </div>
          <S.CsCartCloseBtn type="button" onClick={() => setMobileCartOpen(false)} aria-label="Close cart">
            <FaTimes />
          </S.CsCartCloseBtn>
        </S.CsCartHeader>

        <CustomerSelector {...customerProps} />

        <S.CsCartBody>
          {cartItems.length === 0 ? (
            <S.CsEmptyCart>
              <FaUtensils size={48} style={{ opacity: 0.2 }}/>
              <div>
                <div style={{ fontWeight: 800, color: '#475569', fontSize: '18px' }}>Empty Cart</div>
                <div style={{ fontSize: '13px' }}>Select items from the left to start</div>
              </div>
            </S.CsEmptyCart>
          ) : (
            cartItems.map(item => (
              <CartItem
                key={cartKeyFor(item)}
                item={item}
                cartKeyFor={cartKeyFor}
                sym={sym}
                currencyDecimalPlaces={currencyDecimalPlaces}
                theme={theme}
                updateQty={updateQty}
                discountsEnabled={discountsEnabled}
                handleEditProductFromCart={handleEditProductFromCart}
                setItemDescription={setItemDescription}
              />
            ))
          )}
        </S.CsCartBody>

        <S.CsCartFooter>
          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <OrderSummary {...summaryProps} />
            <div style={{ height: '1px', background: '#e2e8f0', margin: '8px 0' }}/>
            <S.CsSummaryRow $bold>
              <span>Grand Total</span>
              <span>{sym}{totals.total_inc_tax.toFixed(currencyDecimalPlaces)}</span>
            </S.CsSummaryRow>
          </div>

          <KitchenNoteInput 
            orderNote={orderNote} 
            setOrderNote={setOrderNote} 
            activeOrderMode={activeOrderMode} 
            theme={theme} 
          />

          {discountsEnabled && activeOrderMode === 'settle' && (
            <S.CsDiscountBtn type="button" onClick={() => setShowDiscountModal(true)} style={{ marginBottom: '10px' }}>
              {totals.discount_amount > 0 ? `Edit Discounts (${sym}${totals.discount_amount.toFixed(currencyDecimalPlaces)})` : 'Apply Discount'}
            </S.CsDiscountBtn>
          )}

          {renderPayButton()}
        </S.CsCartFooter>
      </S.CsCartSection>
    );
  }

  // Render the Split View (Counter view: productListingOn = false)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '12px', marginTop: '8px' }}>
      <S.CsCounterSplitGrid>
        
        {/* Left Column: Cart items listing */}
        <S.CsCounterCartListPanel>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cartItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#64748b', padding: '30px 16px' }}>
                <FaUtensils size={36} style={{ opacity: 0.18, marginBottom: 12 }} />
                <div style={{ fontWeight: 800, color: '#475569', fontSize: '16px' }}>Empty Cart</div>
                <div style={{ fontSize: '12px', marginTop: 4 }}>Search or scan above to add items to your order</div>
              </div>
            ) : (
              cartItems.map(item => (
                <CartItem
                  key={cartKeyFor(item)}
                  item={item}
                  cartKeyFor={cartKeyFor}
                  sym={sym}
                  currencyDecimalPlaces={currencyDecimalPlaces}
                  theme={theme}
                  updateQty={updateQty}
                  discountsEnabled={discountsEnabled}
                  handleEditProductFromCart={handleEditProductFromCart}
                  setItemDescription={setItemDescription}
                />
              ))
            )}
          </div>
        </S.CsCounterCartListPanel>

        {/* Right Column: Calculations & Customer picker */}
        <S.CsCounterCalculationsPanel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }} className="custom-scrollbar">
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>Summary Info</div>
            
            <CustomerSelector {...customerProps} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'white', padding: '8px 10px', borderRadius: '8px', border: '1px solid #edf2f7', boxShadow: '0 4px 12px rgba(15,23,42,0.02)' }}>
              <OrderSummary {...summaryProps} />
              <div style={{ height: '1px', borderTop: '1px dashed #cbd5e1', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '12px' }}>Grand Total</span>
                <span style={{ color: theme.main, fontWeight: 900, fontSize: '16px' }}>{sym}{totals.total_inc_tax.toFixed(currencyDecimalPlaces)}</span>
              </div>
            </div>

            <KitchenNoteInput 
              orderNote={orderNote} 
              setOrderNote={setOrderNote} 
              activeOrderMode={activeOrderMode} 
              theme={theme} 
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
            {discountsEnabled && activeOrderMode === 'settle' && (
              <S.CsDiscountBtn type="button" onClick={() => setShowDiscountModal(true)}>
                {totals.discount_amount > 0 ? `Edit Discounts (${sym}${totals.discount_amount.toFixed(currencyDecimalPlaces)})` : 'Apply Discount'}
              </S.CsDiscountBtn>
            )}

            {renderPayButton({ 
              height: '44px', 
              padding: '0 16px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '8px', 
              borderRadius: '8px', 
              width: '100%', 
              fontSize: '14px', 
              fontWeight: '800', 
              margin: 0 
            })}
          </div>
        </S.CsCounterCalculationsPanel>

      </S.CsCounterSplitGrid>
    </div>
  );
}
