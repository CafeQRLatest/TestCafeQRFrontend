import React from 'react';
import { FaTimes } from 'react-icons/fa';
import * as S from '../CounterSale.styles';

export default function DiscountDialog({
  discounts,
  cart,
  ui,
  bootstrap
}) {
  const { config } = bootstrap;
  const { THEME: theme, sym } = ui;
  const { items: cartItems, cartKeyFor } = cart;
  const {
    discountsEnabled, showModal: showDiscountModal, setShowModal: setShowDiscountModal,
    modalTab: discountModalTab, setModalTab: setDiscountModalTab, localDiscounts,
    setLocalDiscounts, localOrderDiscountType, setLocalOrderDiscountType,
    localOrderDiscountValue, setLocalOrderDiscountValue, handleClearAllDiscounts,
    handleApplyDiscounts
  } = discounts;

  if (!discountsEnabled || !showDiscountModal) return null;

  const currencyDecimalPlaces = config?.currencyDecimalPlaces ?? 2;

  return (
    <S.CsModalBackdrop onClick={() => setShowDiscountModal(false)}>
      <S.CsDiscountModalContent onClick={e => e.stopPropagation()}>
        <S.CsDiscountModalHeader>
          <button
            type="button"
            onClick={() => setShowDiscountModal(false)}
            style={{
              border: 'none',
              background: '#f1f5f9',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              transition: 'all 0.15s ease'
            }}
            aria-label="Close discounts modal"
          >
            <FaTimes size={10} />
          </button>
        </S.CsDiscountModalHeader>
        
        <S.CsDiscountTabHeader>
          <S.CsDiscountTabButton
            type="button"
            $active={discountModalTab === 'total'}
            $themeColor={theme.main}
            onClick={() => setDiscountModalTab('total')}
          >
            Total Discount
          </S.CsDiscountTabButton>
          <S.CsDiscountTabButton
            type="button"
            $active={discountModalTab === 'line'}
            $themeColor={theme.main}
            onClick={() => setDiscountModalTab('line')}
          >
            Line Discounts
          </S.CsDiscountTabButton>
        </S.CsDiscountTabHeader>

        <S.CsDiscountModalBody>
          {discountModalTab === 'line' ? (
            cartItems.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>
                Add items to your cart first to apply discounts.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cartItems.map(item => {
                  const key = cartKeyFor(item);
                  const disc = localDiscounts[key] || { type: 'amount', value: 0 };
                  return (
                    <S.CsDiscountRow key={key}>
                      <S.CsDiscountRowInfo>
                        <span>{item.displayName || item.name}</span>
                        <small>{sym}{Number(item.price || 0).toFixed(currencyDecimalPlaces)} x {item.qty}</small>
                      </S.CsDiscountRowInfo>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <S.CsDiscountInputWrapper $themeColor={theme.main}>
                          <input 
                            type="number"
                            min="0"
                            max={disc.type === 'percentage' ? 100 : undefined}
                            value={disc.value || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setLocalDiscounts(prev => ({
                                ...prev,
                                [key]: { ...prev[key], value: val }
                              }));
                            }}
                            style={{
                              border: 'none',
                              outline: 'none',
                              width: '60px',
                              padding: '0 4px',
                              fontSize: '13px',
                              fontWeight: '700',
                              textAlign: 'right',
                              color: '#000000'
                            }}
                          />
                        </S.CsDiscountInputWrapper>
                        
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                          <S.CsDiscUnitToggle 
                            type="button"
                            $active={disc.type === 'amount'} 
                            $themeColor={theme.main}
                            onClick={() => {
                              setLocalDiscounts(prev => ({
                                ...prev,
                                [key]: { ...prev[key], type: 'amount' }
                              }));
                            }}
                          >
                            {sym}
                          </S.CsDiscUnitToggle>
                          <S.CsDiscUnitToggle 
                            type="button"
                            $active={disc.type === 'percentage'} 
                            $themeColor={theme.main}
                            onClick={() => {
                              setLocalDiscounts(prev => ({
                                ...prev,
                                [key]: { ...prev[key], type: 'percentage' }
                              }));
                            }}
                          >
                            %
                          </S.CsDiscUnitToggle>
                        </div>
                      </div>
                    </S.CsDiscountRow>
                  );
                })}
              </div>
            )
          ) : (
            <div style={{ padding: '16px 0' }}>
              <S.CsDiscountRow style={{ background: '#f8fafc', borderColor: '#edf2f7', justifyContent: 'space-between', padding: '12px 16px' }}>
                <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>Total Discount</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <S.CsDiscountInputWrapper $themeColor={theme.main}>
                    <input 
                      type="number"
                      min="0"
                      max={localOrderDiscountType === 'percentage' ? 100 : undefined}
                      value={localOrderDiscountValue || ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setLocalOrderDiscountValue(val);
                      }}
                      style={{
                        border: 'none',
                        outline: 'none',
                        width: '60px',
                        padding: '0 4px',
                        fontSize: '13px',
                        fontWeight: '700',
                        textAlign: 'right',
                        color: '#000000',
                        background: 'transparent'
                      }}
                    />
                  </S.CsDiscountInputWrapper>
                  
                  <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                    <S.CsDiscUnitToggle 
                      type="button"
                      $active={localOrderDiscountType === 'amount'} 
                      $themeColor={theme.main}
                      onClick={() => setLocalOrderDiscountType('amount')}
                    >
                      {sym}
                    </S.CsDiscUnitToggle>
                    <S.CsDiscUnitToggle 
                      type="button"
                      $active={localOrderDiscountType === 'percentage'} 
                      $themeColor={theme.main}
                      onClick={() => setLocalOrderDiscountType('percentage')}
                    >
                      %
                    </S.CsDiscUnitToggle>
                  </div>
                </div>
              </S.CsDiscountRow>
            </div>
          )}
        </S.CsDiscountModalBody>

        <S.CsDiscountModalFooter>
          <button 
            type="button"
            onClick={handleClearAllDiscounts} 
            style={{
              flex: 1, 
              height: '36px', 
              borderRadius: '8px', 
              border: '1px solid #cbd5e1', 
              background: 'white', 
              fontWeight: '700', 
              fontSize: '13px',
              color: '#64748b',
              cursor: 'pointer'
            }}
          >
            Clear All
          </button>
          <button 
            type="button"
            onClick={handleApplyDiscounts}
            style={{
              flex: 1, 
              height: '36px', 
              borderRadius: '8px', 
              border: 'none', 
              background: theme.main, 
              fontWeight: '700', 
              fontSize: '13px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Apply
          </button>
        </S.CsDiscountModalFooter>
      </S.CsDiscountModalContent>
    </S.CsModalBackdrop>
  );
}
