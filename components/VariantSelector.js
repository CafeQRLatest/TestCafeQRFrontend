import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaTimes } from 'react-icons/fa';

function stripSymbols(str) {
  if (!str) return '';
  return str
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const Card = styled.div`
  width: min(380px, 100%);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  border-top: 3px solid ${props => props.$themeColor || '#f97316'};
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  overflow: hidden;

  @media (max-width: 640px) {
    width: 100%;
    max-height: min(85dvh, calc(100dvh - env(safe-area-inset-top, 0px)));
    border-radius: 22px 22px 0 0;
  }
`;

const Header = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 16px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    overflow-wrap: anywhere;
  }

  span {
    display: inline-flex;
    margin-top: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 10px;
    font-weight: 700;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 50%;
  transition: 0.2s;

  &:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
`;

const OptionList = styled.div`
  padding: 16px 20px;
  overflow-y: auto;
  display: grid;
  gap: 10px;
`;

const OptionButton = styled.div`
  border: 1px solid ${props => props.$active ? props.$themeColor : '#cbd5e1'};
  background: ${props => props.$active ? props.$themeSoftColor : 'white'};
  border-radius: 8px;
  padding: 5px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  text-align: left;
  min-width: 0;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${props => props.$active ? props.$themeColor : '#94a3b8'};
  }

  strong {
    color: #0f172a;
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 1px;
    color: #475569;
    font-size: 11px;
    font-weight: 600;
  }
`;

const Footer = styled.div`
  padding: 12px 20px 16px;
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 10px;
`;

const AddButton = styled.button`
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: ${props => props.$themeColor};
  color: white;
  min-height: 44px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 4px 12px ${props => props.$themeColor}33;
  transition: all 0.2s ease;

  &:disabled {
    opacity: 0.5;
    box-shadow: none;
    cursor: not-allowed;
    transform: none;
  }

  &:hover:not(:disabled) {
    background: ${props => props.$themeDarkColor};
    transform: translateY(-1px);
  }
`;

const Empty = styled.div`
  padding: 30px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
`;

const OptionMeta = styled.div`
  min-width: 0;
`;

const QuantityControls = styled.div`
  display: inline-grid;
  grid-template-columns: 24px minmax(24px, auto) 24px;
  align-items: center;
  justify-content: end;
  min-height: 24px;
  border-radius: 6px;
  border: 1px solid ${props => props.$themeColor}40;
  overflow: hidden;
  background: white;
  color: #0f172a;
  flex: 0 0 auto;
`;

const QuantityButton = styled.button`
  height: 24px;
  border: 0;
  background: ${props => props.$themeSoftColor};
  color: ${props => props.$themeColor};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;

  &:disabled {
    color: #cbd5e1;
    background: #f8fafc;
    cursor: not-allowed;
  }
`;

const QuantityValue = styled.div`
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid ${props => props.$themeColor}20;
  border-right: 1px solid ${props => props.$themeColor}20;
  font-weight: 700;
  font-size: 11px;
  min-width: 24px;
`;

const SummaryBox = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 8px 14px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;

  span {
    color: #475569;
    font-size: 11px;
    font-weight: 700;
  }

  strong {
    color: ${props => props.$themeColor};
    font-size: 15px;
    font-weight: 800;
    white-space: nowrap;
  }
`;

const SectionHeader = styled.div`
  margin: 6px 0 2px;
  padding: 0 2px;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 6px;

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #f1f5f9;
  }
`;

const UpsellList = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 6px;
`;

const UpsellButton = styled(OptionButton)`
  padding: 5px 12px;
  border-radius: 8px;

  strong {
    font-size: 13px;
  }

  span {
    font-size: 11px;
  }
`;

function buildVariantOptions(product) {
  const basePrice = Number(product?.price || 0);
  const pricings = Array.isArray(product?.variantPricings) ? product.variantPricings : [];
  if (pricings.length) {
    return pricings
      .filter((pricing) => pricing?.isAvailable !== false && pricing?.variantOption)
      .map((pricing) => {
        const option = pricing.variantOption;
        const price = pricing.overridePrice != null
          ? Number(pricing.overridePrice)
          : basePrice + Number(option.additionalPrice || 0);
        return {
          id: option.id,
          label: option.name,
          price,
          groupId: option.groupId,
        };
      });
  }

  const mappings = Array.isArray(product?.variantMappings) ? product.variantMappings : [];
  return mappings.flatMap((mapping) => {
    const options = mapping?.variantGroup?.options || [];
    return options.map((option) => ({
      id: option.id,
      label: option.name,
      price: basePrice + Number(option.additionalPrice || 0),
      groupId: option.groupId,
    }));
  });
}

function normalizeQuantities(source, options) {
  const next = {};
  options.forEach((option) => {
    const raw = source?.[option.id] ?? source?.[String(option.id)] ?? 0;
    const value = Number(raw || 0);
    if (Number.isFinite(value) && value > 0) {
      next[String(option.id)] = value;
    }
  });
  return next;
}

const EMPTY_QUANTITIES = {};

export default function VariantSelector({
  product,
  onClose,
  onSelect,
  quantityMode = false,
  initialQuantities = EMPTY_QUANTITIES,
  onSelectMany,
  themeColor = '#f97316',
  themeSoftColor = '#fff7ed',
  themeDarkColor = '#ea580c',
  stockMap = null
}) {
  const [selectedId, setSelectedId] = useState('');
  const [quantities, setQuantities] = useState({});
  const [upsellQuantities, setUpsellQuantities] = useState({});

  const options = useMemo(() => buildVariantOptions(product), [product]);
  const upsells = useMemo(() => (product?.upsells || []).filter(u => u.isActive !== false), [product]);

  const selected = options.find((option) => String(option.id) === String(selectedId));
  const initialQuantityMap = useMemo(
    () => normalizeQuantities(initialQuantities, options),
    [initialQuantities, options]
  );
  const initialTotalQty = useMemo(
    () => Object.values(initialQuantityMap).reduce((sum, value) => sum + Number(value || 0), 0),
    [initialQuantityMap]
  );
  const selectedOptions = useMemo(
    () => options
      .map((option) => ({ ...option, quantity: Number(quantities[String(option.id)] || 0) }))
      .filter((option) => option.quantity > 0),
    [options, quantities]
  );
  const totalQty = useMemo(
    () => selectedOptions.reduce((sum, option) => sum + option.quantity, 0),
    [selectedOptions]
  );
  const selectedUpsellItems = useMemo(() => upsells
    .filter(u => Number(upsellQuantities[u.id] || 0) > 0)
    .map(u => ({
      ...u.upsellProduct,
      productId: u.upsellProduct.id,
      cartKey: `${u.upsellProduct.id}:base`,
      displayName: u.upsellProduct.name,
      qty: Number(upsellQuantities[u.id] || 0)
    })), [upsells, upsellQuantities]);

  const totalUpsellQty = useMemo(
    () => selectedUpsellItems.reduce((sum, item) => sum + item.qty, 0),
    [selectedUpsellItems]
  );

  const totalAmount = useMemo(() => {
    const variantsTotal = selectedOptions.reduce((sum, option) => sum + Number(option.price || 0) * option.quantity, 0);
    const upsellsTotal = selectedUpsellItems.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
    return variantsTotal + upsellsTotal;
  }, [selectedOptions, selectedUpsellItems]);

  useEffect(() => {
    if (quantityMode) {
      setQuantities(initialQuantityMap);
      return;
    }
    setQuantities(EMPTY_QUANTITIES);
    setSelectedId('');
  }, [initialQuantityMap, quantityMode]);

  const updateQuantity = (optionId, delta) => {
    setQuantities((current) => {
      const key = String(optionId);
      const currentQty = Number(current[key] || 0);
      const nextQty = Math.max(0, currentQty + delta);
      if (nextQty <= 0) {
        const rest = { ...current };
        delete rest[key];
        return rest;
      }
      return { ...current, [key]: nextQty };
    });
  };

  const selectQuantityOption = (optionId) => {
    setQuantities((current) => {
      const key = String(optionId);
      if (Number(current[key] || 0) > 0) return current;
      return { ...current, [key]: 1 };
    });
  };

  const toggleUpsell = (upsellId) => {
    setUpsellQuantities(prev => {
      const key = String(upsellId);
      if (Number(prev[key] || 0) > 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: 1 };
    });
  };

  const updateUpsellQuantity = (upsellId, delta) => {
    setUpsellQuantities(prev => {
      const key = String(upsellId);
      const current = Number(prev[key] || 0);
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return { ...prev, [key]: next };
    });
  };

  if (!product) return null;

  return (
    <Overlay onMouseDown={onClose}>
      <Card $themeColor={themeColor} onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <div>
            <h2>{stripSymbols(product.name)}</h2>
            <div>
              <span>{stripSymbols(product.category?.name || product.categoryName || 'Menu Item')}</span>
            </div>
          </div>
          <CloseButton type="button" onClick={onClose} aria-label="Close variant selector">
            <FaTimes />
          </CloseButton>
        </Header>

        <OptionList>
          {options.length > 0 && (
            <>
              <SectionHeader>Variants / Options</SectionHeader>
              <div style={{ display: 'grid', gap: '8px' }}>
                {options.map((option) => {
                  const optionKey = String(option.id);
                  const quantity = Number(quantities[optionKey] || 0);
                  const active = quantityMode ? quantity > 0 : String(selectedId) === optionKey;
                  return (
                    <OptionButton
                      key={option.id}
                      role="button"
                      tabIndex={0}
                      $active={active}
                      $themeColor={themeColor}
                      $themeSoftColor={themeSoftColor}
                      onClick={() => quantityMode ? selectQuantityOption(option.id) : setSelectedId(option.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          quantityMode ? selectQuantityOption(option.id) : setSelectedId(option.id);
                        }
                      }}
                    >
                      <OptionMeta>
                        <strong>{stripSymbols(option.label)}</strong>
                        <span>₹{Number(option.price || 0).toFixed(2)}</span>
                        {stockMap && (
                          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold', marginTop: '2px' }}>
                            Stock: {stockMap[option.id] !== undefined ? (stockMap[option.id]?.currentStock !== undefined ? stockMap[option.id].currentStock : stockMap[option.id]) : (stockMap[`${product.id}_${option.id}`]?.currentStock || 0)}
                          </div>
                        )}
                      </OptionMeta>
                      {quantityMode ? (
                        <QuantityControls
                          $themeColor={themeColor}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <QuantityButton type="button" $themeColor={themeColor} $themeSoftColor={themeSoftColor} disabled={quantity <= 0} onClick={() => updateQuantity(option.id, -1)}>
                            -
                          </QuantityButton>
                          <QuantityValue $themeColor={themeColor}>{quantity}</QuantityValue>
                          <QuantityButton type="button" $themeColor={themeColor} $themeSoftColor={themeSoftColor} onClick={() => updateQuantity(option.id, 1)}>
                            +
                          </QuantityButton>
                        </QuantityControls>
                      ) : null}
                    </OptionButton>
                  );
                })}
              </div>
            </>
          )}

          {upsells.length > 0 && (
            <>
              <SectionHeader>Suggested Add-ons</SectionHeader>
              <UpsellList>
                {upsells.map((u) => {
                  const quantity = Number(upsellQuantities[u.id] || 0);
                  const active = quantity > 0;
                  return (
                    <UpsellButton
                      key={u.id}
                      $active={active}
                      $themeColor={themeColor}
                      $themeSoftColor={themeSoftColor}
                      onClick={() => toggleUpsell(u.id)}
                    >
                      <OptionMeta>
                        <strong>{stripSymbols(u.upsellProduct?.name)}</strong>
                        <span>₹{Number(u.upsellProduct?.price || 0).toFixed(2)}</span>
                      </OptionMeta>
                      {active ? (
                        <QuantityControls
                          $themeColor={themeColor}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <QuantityButton type="button" $themeColor={themeColor} $themeSoftColor={themeSoftColor} onClick={() => updateUpsellQuantity(u.id, -1)}>
                            -
                          </QuantityButton>
                          <QuantityValue $themeColor={themeColor}>{quantity}</QuantityValue>
                          <QuantityButton type="button" $themeColor={themeColor} $themeSoftColor={themeSoftColor} onClick={() => updateUpsellQuantity(u.id, 1)}>
                            +
                          </QuantityButton>
                        </QuantityControls>
                      ) : (
                        <span style={{ fontSize: '16px', fontWeight: '800', color: themeColor }}>+</span>
                      )}
                    </UpsellButton>
                  );
                })}
              </UpsellList>
            </>
          )}

          {!options.length && !upsells.length && (
            <Empty>No options are configured for this item.</Empty>
          )}
        </OptionList>

        <Footer>
          {quantityMode && (
            <SummaryBox $themeColor={themeColor}>
              <span>{totalQty} item{totalQty === 1 ? '' : 's'} selected</span>
              <strong>₹{totalAmount.toFixed(2)}</strong>
            </SummaryBox>
          )}
          <AddButton
            type="button"
            $themeColor={themeColor}
            $themeSoftColor={themeSoftColor}
            $themeDarkColor={themeDarkColor}
            disabled={quantityMode ? (!totalQty && !totalUpsellQty && !initialTotalQty) : (!selected && !totalUpsellQty)}
            onClick={() => {
              if (quantityMode) {
                onSelectMany?.(selectedOptions, selectedUpsellItems);
                return;
              }
              if (selected) {
                onSelect?.(selected, selectedUpsellItems);
              } else if (selectedUpsellItems.length > 0 && !options.length) {
                // If only upsells were selected for a product with no variants
                onSelect?.(null, selectedUpsellItems);
              }
            }}
          >
            {quantityMode
              ? (totalQty > 0 || totalUpsellQty > 0) ? `Update Cart (${totalQty + totalUpsellQty})` : 'Clear From Cart'
              : (selected || totalUpsellQty > 0) ? 'Add To Cart' : 'Select Options'}
          </AddButton>
        </Footer>
      </Card>
    </Overlay>
  );
}
