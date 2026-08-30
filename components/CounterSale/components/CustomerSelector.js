import React from 'react';
import { FaTimes, FaUsers } from 'react-icons/fa';
import * as S from '../CounterSale.styles';
import { isLoyaltyModuleEnabled } from '../../../utils/moduleVisibility';

export default function CustomerSelector({
  customersEnabled,
  config,
  selectedCustomerId,
  selectedCustomer,
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
}) {
  if (!customersEnabled) return null;

  const loyaltyActive = Boolean(isLoyaltyModuleEnabled(config) || config?.loyaltyEnabled === true);
  const pts = loyaltyActive ? (selectedCustomer?.loyaltyPoints ?? selectedCustomer?.loyalty_points) : null;

  return (
    <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #edf2f7', borderRadius: '12px', border: '1px solid #edf2f7', boxShadow: '0 4px 12px rgba(15,23,42,0.015)' }}>
      <S.CsCustomerPickerArea style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Customer Details</span>
          {pts !== undefined && pts !== null && (
            <span style={{ color: '#ea580c', fontWeight: 800, fontSize: '10.5px', background: '#fff7ed', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fed7aa' }}>
              ★ {pts} pts
            </span>
          )}
        </div>
        {!config?.allowMultipleCustomersPerOrder && selectedCustomerId ? (
          <S.CsCustomerChip style={{ padding: '6px 12px', fontSize: '12px', width: '100%', justifyContent: 'space-between', borderRadius: '8px' }}>
            <span>
              {customerName} {customerPhone ? `(${customerPhone})` : ''}
              {pts !== undefined && pts !== null && (
                <span style={{ marginLeft: '6px', color: '#ea580c', fontWeight: 700, fontSize: '11px' }}>
                  ({pts} pts)
                </span>
              )}
            </span>
            <S.CsRemoveChip onClick={() => removeCustomer(selectedCustomerId)} style={{ display: 'flex', alignItems: 'center' }}><FaTimes size={10}/></S.CsRemoveChip>
          </S.CsCustomerChip>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <S.CsCustomerInputWrap style={{ height: 34, padding: '0 8px', borderRadius: '8px', gap: '6px' }}>
              <FaUsers color="#94a3b8" size={11} />
              <S.CsCustomerInput
                placeholder="Customer Name"
                value={customerName}
                onChange={e => {
                  setCustomerName(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onKeyDown={handleCustomerKeyDown}
                style={{ fontSize: '12px' }}
              />
            </S.CsCustomerInputWrap>

            <div style={{ display: 'flex', gap: '6px' }}>
              <S.CsCustomerInputWrap style={{ flex: 1, height: 34, padding: '0 8px', borderRadius: '8px', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>📞</span>
                <S.CsCustomerInput
                  placeholder="Phone Number (Optional)"
                  value={customerPhone}
                  onChange={e => {
                    setCustomerPhone(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onKeyDown={handleCustomerKeyDown}
                  style={{ fontSize: '12px' }}
                />
              </S.CsCustomerInputWrap>

              {config?.customerAgeEnabled && (
                <S.CsCustomerInputWrap style={{ width: '60px', height: 34, padding: '0 8px', borderRadius: '8px', gap: '4px' }}>
                  <S.CsCustomerInput
                    placeholder="Age"
                    value={customerAge}
                    onChange={e => setCustomerAge(e.target.value)}
                    style={{ fontSize: '12px', textAlign: 'center' }}
                    type="number"
                  />
                </S.CsCustomerInputWrap>
              )}
            </div>
          </div>
        )}

        {showCustomerDropdown && (customerName || customerPhone) && filteredCustomers.length > 0 && (
          <S.CsCustomerDropdown style={{ zIndex: 110 }}>
            {filteredCustomers.map(c => (
              <S.CsCustomerOption key={c.id} onClick={() => selectCustomer(c)}>
                <S.CsCustomerName>{c.name}</S.CsCustomerName>
                <S.CsCustomerPhone>{c.phone || 'No phone'}</S.CsCustomerPhone>
              </S.CsCustomerOption>
            ))}
          </S.CsCustomerDropdown>
        )}

        {config?.allowMultipleCustomersPerOrder && selectedCustomers.length > 0 && (
          <S.CsCustomerChips style={{ marginTop: '6px' }}>
            {selectedCustomers.map(c => (
              <S.CsCustomerChip key={c.id} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '8px' }}>
                {c.name}
                <S.CsRemoveChip onClick={() => removeCustomer(c.id)} style={{ display: 'flex', alignItems: 'center' }}><FaTimes size={8}/></S.CsRemoveChip>
              </S.CsCustomerChip>
            ))}
          </S.CsCustomerChips>
        )}
      </S.CsCustomerPickerArea>
    </div>
  );
}
