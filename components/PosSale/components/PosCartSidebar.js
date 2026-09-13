import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FaTimes, FaFire, FaWallet, FaTrashAlt, FaUser, FaPhoneAlt, 
  FaStickyNote, FaShoppingBag, FaStar, FaChevronLeft, FaChevronRight,
  FaPercentage 
} from 'react-icons/fa';
import PosCartItem from './PosCartItem';
import { isLoyaltyModuleEnabled } from '../../../utils/moduleVisibility';

// ── Styled Components ──

const SidebarContainer = styled.aside`
  width: ${props => props.$isCounterMode ? '100%' : (props.$isWide ? '50%' : '380px')};
  min-width: ${props => props.$isCounterMode ? '100%' : (props.$isWide ? '480px' : '380px')};
  max-width: ${props => props.$isCounterMode ? '100%' : (props.$isWide ? '50%' : '380px')};
  border-left: ${props => props.$isCounterMode ? 'none' : '1px solid #e2e8f0'};
  background: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  flex: 1;
  position: relative;
  z-index: 20;
  transition: width 0.24s cubic-bezier(0.16, 1, 0.3, 1), max-width 0.24s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.24s cubic-bezier(0.16, 1, 0.3, 1);

  @media (max-width: 900px) {
    position: ${props => props.$isCounterMode ? 'relative' : 'fixed'};
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    min-width: 0 !important;
    max-width: ${props => props.$isCounterMode ? '100%' : 'min(100%, 420px)'};
    box-shadow: ${props => props.$isCounterMode ? 'none' : '-6px 0 28px rgba(15, 23, 42, 0.18)'};
    transform: ${props => (props.$isCounterMode || props.$mobileOpen) ? 'translateX(0)' : 'translateX(100%)'};
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: ${props => props.$isCounterMode ? '20' : '1050'};
  }
`;

const HeaderBar = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const HeaderTitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  h2 {
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.01em;
  }
`;

const EdgeResizeTab = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: -13px;
  width: 24px;
  height: 50px;
  border-radius: 8px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 35;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: ${props => props.$themeColor ? `${props.$themeColor}15` : '#fff7ed'};
    border-color: ${props => props.$themeColor || '#f97316'};
    color: ${props => props.$themeColor || '#ea580c'};
    transform: translateY(-50%) scale(1.1);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.16);
  }

  @media (max-width: 900px) {
    display: none;
  }
`;

const ItemCountBadge = styled.span`
  background: ${props => props.$themeSoft || '#fff7ed'};
  color: ${props => props.$themeDark || '#ea580c'};
  border: 1px solid ${props => props.$themeColor ? `${props.$themeColor}30` : '#fed7aa'};
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  letter-spacing: -0.2px;
`;

const ClearCartBtn = styled.button`
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;

  &:hover {
    color: #ef4444;
    background: #fef2f2;
  }
`;

const CloseMobileBtn = styled.button`
  display: none;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 4px;

  @media (max-width: 900px) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

// ── Customer Minimal Section ──

const CustomerBar = styled.div`
  padding: 8px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  position: relative;
`;

const CustomerUnifiedBar = styled.div`
  display: flex;
  align-items: center;
  height: 32px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 8px;
  gap: 8px;
  transition: all 0.16s ease;

  &:focus-within {
    border-color: ${props => props.$themeColor || '#f97316'};
    box-shadow: 0 0 0 2px ${props => props.$themeColor ? `${props.$themeColor}18` : 'rgba(249, 115, 22, 0.12)'};
  }

  .field {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .divider {
    width: 1px;
    height: 16px;
    background: #e2e8f0;
    flex-shrink: 0;
  }

  input {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 11.5px;
    font-weight: 500;
    color: #0f172a;
    outline: none;

    &::placeholder {
      color: #94a3b8;
      font-size: 11.5px;
    }
  }
`;

const SelectedCustomerPill = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  color: #0f172a;

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 700;
  }

  .phone {
    color: #64748b;
    font-size: 11.5px;
  }

  .pts {
    color: #ea580c;
    font-weight: 800;
    font-size: 10.5px;
    background: #fff7ed;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid #fed7aa;
  }
`;

const RemoveCustBtn = styled.button`
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;

  &:hover {
    color: #ef4444;
    background: #fef2f2;
  }
`;

const DropdownList = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 14px;
  right: 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  max-height: 180px;
  overflow-y: auto;
  z-index: 100;
`;

const DropdownItem = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid #f8fafc;

  &:hover {
    background: #f8fafc;
  }

  .d-name {
    font-weight: 700;
    color: #0f172a;
  }

  .d-phone {
    color: #64748b;
    font-size: 11px;
  }
`;

// ── Cart Body & Empty State ──

const CartItemsScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MinimalEmptyCart = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 16px;
  text-align: center;
  color: #94a3b8;
  gap: 6px;

  .empty-title {
    font-weight: 700;
    font-size: 14px;
    color: #64748b;
  }

  .empty-sub {
    font-size: 12px;
    color: #94a3b8;
  }
`;

// ── Bottom Summary & Action ──

const CartBottomSection = styled.div`
  border-top: 1px solid #f1f5f9;
  background: #ffffff;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;

  @media (max-width: 480px) {
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
    gap: 6px;
  }
`;

const WideActionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
  align-items: center;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const SummaryInlineWrap = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11.5px;
  color: #64748b;

  @media (max-width: 480px) {
    font-size: 11px;
    gap: 6px;
  }
`;

const SummaryBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 10px 12px;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
  color: ${props => props.$color || '#64748b'};
  font-weight: ${props => props.$bold ? 700 : 500};

  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #1e293b;
  }

  &.grand-total {
    font-size: 14.5px;
    font-weight: 900;
    color: #0f172a;
    padding-top: 6px;
    margin-top: 2px;
    border-top: 1px dashed #cbd5e1;

    .grand-num {
      font-size: 17.5px;
      font-weight: 900;
      letter-spacing: -0.3px;
    }
  }
`;

const KitchenNoteBox = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: 0 9px;
  transition: all 0.16s ease;

  &:focus-within {
    background: #ffffff;
    border-color: ${props => props.$themeColor || '#f97316'};
    box-shadow: 0 0 0 2px ${props => props.$themeColor ? `${props.$themeColor}18` : 'rgba(249, 115, 22, 0.12)'};
  }

  input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 11.5px;
    font-weight: 500;
    color: #0f172a;
    outline: none;

    &::placeholder {
      color: #94a3b8;
    }
  }

  .clear-btn {
    border: none;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;

    &:hover {
      color: #0f172a;
    }
  }
`;

const PrimarySubmitBtn = styled.button`
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 12px;
  background: ${props => props.disabled 
    ? '#e2e8f0' 
    : `linear-gradient(135deg, ${props.$themeColor || '#f97316'} 0%, ${props.$themeDark || '#ea580c'} 100%)`};
  color: ${props => props.disabled ? '#94a3b8' : '#ffffff'};
  font-weight: 800;
  font-size: 13.5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  box-shadow: ${props => props.disabled ? 'none' : `0 3px 12px ${props.$themeColor ? `${props.$themeColor}40` : 'rgba(249, 115, 22, 0.3)'}`};
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 5px 16px ${props => props.$themeColor ? `${props.$themeColor}50` : 'rgba(249, 115, 22, 0.4)'};
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
`;

const CartDiscountBtn = styled.button`
  width: 100%;
  height: 29px;
  border-radius: 7px;
  border: 1px dashed ${props => props.$hasDiscount ? '#fca5a5' : '#cbd5e1'};
  background: ${props => props.$hasDiscount ? '#fef2f2' : '#ffffff'};
  color: ${props => props.$hasDiscount ? '#dc2626' : '#475569'};
  font-weight: 700;
  font-size: 11.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
  user-select: none;

  &:hover {
    background: ${props => props.$hasDiscount ? '#fee2e2' : '#f8fafc'};
    border-color: ${props => props.$hasDiscount ? '#ef4444' : (props.$themeColor || '#16a34a')};
    color: ${props => props.$hasDiscount ? '#b91c1c' : (props.$themeColor || '#16a34a')};
  }

  &:active {
    transform: scale(0.99);
  }
`;

export default function PosCartSidebar({
  bootstrap,
  catalog,
  cart,
  customer,
  discounts,
  order,
  ui,
  mobileCartOpen,
  setMobileCartOpen,
  isCounterMode = false
}) {
  const { config } = bootstrap;
  const { 
    items: cartItems, cartKeyFor, updateQty, handleEditProductFromCart, 
    setItemDescription, totals, roundOffPreview,
    orderNote, setOrderNote, clearCart
  } = cart;
  const {
    customersEnabled, selectedId: selectedCustomerId, name: customerName, 
    phone: customerPhone, setName: setCustomerName, setPhone: setCustomerPhone, 
    showDropdown: showCustomerDropdown, setShowDropdown: setShowCustomerDropdown, 
    handleCustomerKeyDown, removeCustomer, selectCustomer, filteredCustomers
  } = customer;
  const { discountsEnabled, setShowModal: setShowDiscountModal } = discounts || {};
  const { activeOrderMode, processing, handleCompleteSettle, handlePlaceOrder } = order;
  const { THEME: theme, sym } = ui;

  const currencyDecimalPlaces = config?.currencyDecimalPlaces ?? 2;
  const totalQty = cartItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
  const loyaltyActive = Boolean(isLoyaltyModuleEnabled(config) || config?.loyaltyEnabled === true);
  const [isWide, setIsWide] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pos_cart_wide') === 'true';
    }
    return false;
  });

  const toggleWide = () => {
    setIsWide(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('pos_cart_wide', String(next));
      }
      return next;
    });
  };

  const hasTax = config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0);
  const taxAmount = (totals.total_tax_added || 0) + (totals.total_tax_included || 0);
  const isTaxInclusive = totals.total_tax_included > 0;
  const subtotalDisplay = isTaxInclusive 
    ? totals.line_subtotal 
    : (totals.subtotal_base_ex_tax || totals.taxable_amount || totals.line_subtotal);
  const payableGrandTotal = (config?.roundOffEnabled && roundOffPreview !== 0 && totals.grand_total) 
    ? totals.grand_total 
    : totals.total_inc_tax;

  return (
    <SidebarContainer $mobileOpen={mobileCartOpen} $isWide={isWide} $isCounterMode={isCounterMode}>
      {/* Expand / Collapse Border Tab on Center of Divider (only in standard mode) */}
      {!isCounterMode && (
        <EdgeResizeTab
          type="button"
          onClick={toggleWide}
          title={isWide ? "Restore normal cart width (380px) >" : "Expand cart to half screen (50%) <"}
          $themeColor={theme?.main}
        >
          {isWide ? <FaChevronRight size={11} /> : <FaChevronLeft size={11} />}
        </EdgeResizeTab>
      )}

      {/* 1. Header Bar */}
      <HeaderBar>
        <HeaderTitleGroup>
          <h2>{isCounterMode ? 'Order Items' : 'Cart'}</h2>
          {isCounterMode && cartItems.length > 0 && (
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
              {cartItems.length} items
            </span>
          )}
        </HeaderTitleGroup>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {cartItems.length > 0 && typeof clearCart === 'function' && (
            <ClearCartBtn type="button" onClick={clearCart} title="Clear entire cart">
              <FaTrashAlt size={11} /> Clear
            </ClearCartBtn>
          )}
          <CloseMobileBtn type="button" onClick={() => setMobileCartOpen(false)} aria-label="Close cart">
            <FaTimes size={14} />
          </CloseMobileBtn>
        </div>
      </HeaderBar>

      {/* 2. Sleek Minimal Customer Details */}
      {customersEnabled && (
        <CustomerBar>
          {selectedCustomerId ? (
            <SelectedCustomerPill>
              <div className="meta">
                <FaUser size={10} style={{ color: theme.main }} />
                <span className="name">{customerName}</span>
                {customerPhone && <span className="phone">• {customerPhone}</span>}
              </div>
              <RemoveCustBtn 
                type="button" 
                onClick={() => removeCustomer(selectedCustomerId)}
                title="Change customer"
              >
                <FaTimes size={11} />
              </RemoveCustBtn>
            </SelectedCustomerPill>
          ) : (
            <CustomerUnifiedBar $themeColor={theme.main}>
              <div className="field">
                <FaUser size={9.5} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onKeyDown={handleCustomerKeyDown}
                />
              </div>
              <div className="divider" />
              <div className="field">
                <FaPhoneAlt size={9.5} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Phone"
                  value={customerPhone}
                  onChange={e => {
                    setCustomerPhone(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onKeyDown={handleCustomerKeyDown}
                />
              </div>
            </CustomerUnifiedBar>
          )}

          {/* Autocomplete Dropdown */}
          {showCustomerDropdown && (customerName || customerPhone) && filteredCustomers.length > 0 && (
            <DropdownList>
              {filteredCustomers.map(c => (
                <DropdownItem key={c.id} onClick={() => selectCustomer(c)}>
                  <span className="d-name">{c.name}</span>
                  <span className="d-phone">{c.phone || 'No phone'}</span>
                </DropdownItem>
              ))}
            </DropdownList>
          )}
        </CustomerBar>
      )}

      {/* 3. Cart Items Scroll List */}
      <CartItemsScroll>
        {cartItems.length === 0 ? (
          <MinimalEmptyCart>
            <FaShoppingBag size={28} style={{ color: '#cbd5e1', marginBottom: 4 }} />
            <span className="empty-title">Cart is empty</span>
            <span className="empty-sub">Select products from the menu to start order</span>
          </MinimalEmptyCart>
        ) : (
          cartItems.map(item => (
            <PosCartItem
              key={cartKeyFor(item)}
              item={item}
              cartKeyFor={cartKeyFor}
              sym={sym}
              currencyDecimalPlaces={currencyDecimalPlaces}
              theme={theme}
              updateQty={updateQty}
              discountsEnabled={discountsEnabled && activeOrderMode === 'settle'}
              handleEditProductFromCart={handleEditProductFromCart}
              setItemDescription={setItemDescription}
              isWide={isWide || isCounterMode}
            />
          ))
        )}
      </CartItemsScroll>

      {/* 4. Bottom Order Summary & Actions */}
      <CartBottomSection>
            {cartItems.length > 0 && (isWide || isCounterMode) ? (
              <WideActionGrid>
                <div>
                  <KitchenNoteBox $themeColor={theme.main}>
                    <FaStickyNote size={10.5} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input
                      type="text"
                      placeholder="Kitchen note (e.g. less spicy)..."
                      value={orderNote || ''}
                      onChange={(e) => setOrderNote && setOrderNote(e.target.value)}
                      maxLength={180}
                    />
                    {orderNote && (
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => setOrderNote && setOrderNote('')}
                        title="Clear note"
                      >
                        <FaTimes size={10} />
                      </button>
                    )}
                  </KitchenNoteBox>
                  {discountsEnabled && activeOrderMode === 'settle' && (
                    <CartDiscountBtn
                      type="button"
                      onClick={() => setShowDiscountModal && setShowDiscountModal(true)}
                      $hasDiscount={totals.discount_amount > 0}
                      $themeColor={theme.main}
                      style={{ marginTop: '6px' }}
                    >
                      <FaPercentage size={9} />
                      <span>{totals.discount_amount > 0 ? `Edit Discounts (${sym}${totals.discount_amount.toFixed(currencyDecimalPlaces)})` : 'Apply Discount'}</span>
                    </CartDiscountBtn>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <SummaryBox>
                    <SummaryInlineWrap>
                      <span>Gross: <b style={{ color: '#0f172a' }}>{sym}{totals.line_subtotal.toFixed(currencyDecimalPlaces)}</b></span>
                      {totals.discount_amount > 0 && (
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>Disc: -{sym}{totals.discount_amount.toFixed(currencyDecimalPlaces)}</span>
                      )}
                      {config?.taxEnabled && (
                        <span>Subtotal: <b style={{ color: '#0f172a' }}>{sym}{totals.taxable_amount.toFixed(currencyDecimalPlaces)}</b></span>
                      )}
                      {config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0) && (
                        <span>Tax: <b style={{ color: '#0f172a' }}>{sym}{(totals.total_tax_added + totals.total_tax_included).toFixed(currencyDecimalPlaces)}</b></span>
                      )}
                      {config?.roundOffEnabled && roundOffPreview !== 0 && (
                        <span style={{ color: '#94a3b8' }}>R.Off: {(roundOffPreview > 0 ? '+' : '')}{sym}{Math.abs(roundOffPreview).toFixed(currencyDecimalPlaces)}</span>
                      )}
                    </SummaryInlineWrap>
                    <SummaryRow className="grand-total" style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 4, marginTop: 2 }}>
                      <span>Grand Total</span>
                      <span className="num grand-num" style={{ color: theme?.main || '#0f172a' }}>
                        {sym}{payableGrandTotal.toFixed(currencyDecimalPlaces)}
                      </span>
                    </SummaryRow>
                  </SummaryBox>

                  <PrimarySubmitBtn
                    type="button"
                    disabled={cartItems.length === 0 || processing}
                    $themeColor={theme.main}
                    $themeDark={theme.dark}
                    onClick={activeOrderMode === 'kitchen' ? () => handlePlaceOrder() : handleCompleteSettle}
                    style={{ height: '38px', fontSize: '12.5px' }}
                  >
                    {processing ? 'Processing...' : (
                      activeOrderMode === 'kitchen' ? (
                        <>
                          <FaFire size={12} />
                          <span>Send to Kitchen</span>
                        </>
                      ) : (
                        <>
                          <FaWallet size={12} />
                          <span>Complete Sale</span>
                        </>
                      )
                    )}
                  </PrimarySubmitBtn>
                </div>
              </WideActionGrid>
            ) : (
              <>
                {cartItems.length > 0 ? (
                  <SummaryBox>
                    <SummaryRow>
                      <span>Gross Total</span>
                      <span className="num">{sym}{totals.line_subtotal.toFixed(currencyDecimalPlaces)}</span>
                    </SummaryRow>

                    {totals.discount_amount > 0 && (
                      <SummaryRow $color="#dc2626">
                        <span>Discount</span>
                        <span className="num" style={{ color: '#dc2626', fontWeight: 700 }}>
                          -{sym}{totals.discount_amount.toFixed(currencyDecimalPlaces)}
                        </span>
                      </SummaryRow>
                    )}

                    {config?.taxEnabled && (
                      <SummaryRow>
                        <span>Subtotal</span>
                        <span className="num">{sym}{totals.taxable_amount.toFixed(currencyDecimalPlaces)}</span>
                      </SummaryRow>
                    )}

                    {config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0) && (
                      <SummaryRow>
                        <span>Tax Amount</span>
                        <span className="num">{sym}{(totals.total_tax_added + totals.total_tax_included).toFixed(currencyDecimalPlaces)}</span>
                      </SummaryRow>
                    )}

                    {config?.roundOffEnabled && roundOffPreview !== 0 && (
                      <SummaryRow style={{ color: '#94a3b8' }}>
                        <span>Round Off</span>
                        <span className="num">{(roundOffPreview > 0 ? '+' : '')}{sym}{Math.abs(roundOffPreview).toFixed(currencyDecimalPlaces)}</span>
                      </SummaryRow>
                    )}

                    <SummaryRow className="grand-total">
                      <span>Grand Total</span>
                      <span className="num grand-num" style={{ color: theme?.main || '#0f172a' }}>
                        {sym}{payableGrandTotal.toFixed(currencyDecimalPlaces)}
                      </span>
                    </SummaryRow>
                  </SummaryBox>
                ) : (
                  <SummaryBox style={{ padding: '8px 12px' }}>
                    <SummaryRow className="grand-total" style={{ border: 'none', margin: 0, padding: 0 }}>
                      <span>Grand Total</span>
                      <span className="num grand-num">{sym}{(0).toFixed(currencyDecimalPlaces)}</span>
                    </SummaryRow>
                  </SummaryBox>
                )}

            {/* 5. Sleek Kitchen Note */}
            <KitchenNoteBox $themeColor={theme.main}>
              <FaStickyNote size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Kitchen note (e.g. less spicy)..."
                value={orderNote || ''}
                onChange={(e) => setOrderNote && setOrderNote(e.target.value)}
                maxLength={180}
              />
              {orderNote && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => setOrderNote && setOrderNote('')}
                  title="Clear note"
                >
                  <FaTimes size={10} />
                </button>
              )}
            </KitchenNoteBox>

            {/* 5b. Apply Discount for Settle Order */}
            {discountsEnabled && activeOrderMode === 'settle' && (
              <CartDiscountBtn
                type="button"
                onClick={() => setShowDiscountModal && setShowDiscountModal(true)}
                $hasDiscount={totals.discount_amount > 0}
                $themeColor={theme.main}
                style={{ marginTop: '6px', marginBottom: '2px' }}
              >
                <FaPercentage size={9.5} />
                <span>{totals.discount_amount > 0 ? `Edit Discounts (${sym}${totals.discount_amount.toFixed(currencyDecimalPlaces)})` : 'Apply Discount'}</span>
              </CartDiscountBtn>
            )}

            {/* 6. Primary Action Button */}
            <PrimarySubmitBtn
              type="button"
              disabled={cartItems.length === 0 || processing}
              $themeColor={theme.main}
              $themeDark={theme.dark}
              onClick={activeOrderMode === 'kitchen' ? () => handlePlaceOrder() : handleCompleteSettle}
            >
              {processing ? 'Processing...' : (
                activeOrderMode === 'kitchen' ? (
                  <>
                    <FaFire size={13} />
                    <span>Send to Kitchen</span>
                  </>
                ) : (
                  <>
                    <FaWallet size={13} />
                    <span>Complete Sale</span>
                  </>
                )
              )}
            </PrimarySubmitBtn>
          </>
        )}
      </CartBottomSection>
    </SidebarContainer>
  );
}
