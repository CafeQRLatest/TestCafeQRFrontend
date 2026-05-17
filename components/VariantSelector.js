import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaCheckCircle, FaMinus, FaPlus, FaTimes, FaUtensils } from 'react-icons/fa';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(10px);

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const Card = styled.div`
  width: min(620px, 100%);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  overflow: hidden;

  @media (max-width: 640px) {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 24px 24px 0 0;
  }
`;

const Header = styled.div`
  padding: 24px 28px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;

  @media (max-width: 520px) {
    padding: 20px;
  }

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 24px;
    font-weight: 900;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    overflow-wrap: anywhere;
  }

  span {
    display: inline-flex;
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
  }

  @media (max-width: 520px) {
    h2 {
      font-size: 21px;
    }
  }
`;

const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 20px;
`;

const OptionList = styled.div`
  padding: 22px 28px;
  overflow-y: auto;
  display: grid;
  gap: 12px;

  @media (max-width: 520px) {
    padding: 18px 16px;
  }
`;

const OptionButton = styled.div`
  border: 2px solid ${props => props.$active ? '#f97316' : '#e2e8f0'};
  background: ${props => props.$active ? '#fff7ed' : 'white'};
  border-radius: 18px;
  padding: 18px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  cursor: pointer;
  text-align: left;
  min-width: 0;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.$active ? '#f97316' : '#cbd5e1'};
    transform: translateY(-1px);
  }

  strong {
    color: #0f172a;
    font-size: 17px;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 6px;
    color: #334155;
    font-size: 14px;
    font-weight: 800;
  }

  @media (max-width: 520px) {
    padding: 16px;
    align-items: stretch;
    flex-direction: column;
  }
`;

const Footer = styled.div`
  padding: 18px 28px 24px;
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 14px;

  @media (max-width: 520px) {
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  }
`;

const AddButton = styled.button`
  width: 100%;
  border: 0;
  border-radius: 18px;
  background: #f97316;
  color: white;
  min-height: 56px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 900;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const Empty = styled.div`
  padding: 40px;
  text-align: center;
  color: #64748b;
  font-weight: 800;
`;

const OptionMeta = styled.div`
  min-width: 0;
`;

const QuantityControls = styled.div`
  display: inline-grid;
  grid-template-columns: 42px minmax(42px, auto) 42px;
  align-items: center;
  justify-content: end;
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid #fed7aa;
  overflow: hidden;
  background: white;
  color: #0f172a;
  flex: 0 0 auto;

  @media (max-width: 520px) {
    width: 100%;
    grid-template-columns: 48px 1fr 48px;
  }
`;

const QuantityButton = styled.button`
  height: 44px;
  border: 0;
  background: #fff7ed;
  color: #f97316;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;

  &:disabled {
    color: #cbd5e1;
    background: #f8fafc;
    cursor: not-allowed;
  }
`;

const QuantityValue = styled.div`
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid #fed7aa;
  border-right: 1px solid #fed7aa;
  font-weight: 900;
  min-width: 42px;
`;

const SummaryBox = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;

  span {
    color: #475569;
    font-size: 13px;
    font-weight: 900;
  }

  strong {
    color: #f97316;
    font-size: 22px;
    font-weight: 900;
    white-space: nowrap;
  }

  @media (max-width: 420px) {
    align-items: stretch;
    flex-direction: column;

    strong {
      white-space: normal;
    }
  }
`;

const SectionHeader = styled.div`
  margin: 12px 0 4px;
  padding: 0 4px;
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 8px;

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #f1f5f9;
  }
`;

const UpsellList = styled.div`
  display: grid;
  gap: 10px;
  margin-top: 8px;
`;

const UpsellButton = styled(OptionButton)`
  padding: 12px 16px;
  border-radius: 14px;
  border-width: 1px;

  strong {
    font-size: 15px;
  }

  span {
    font-size: 13px;
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
      <Card onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <div>
            <h2><FaUtensils /> {product.name}</h2>
            <span>{product.category?.name || product.categoryName || 'Menu Item'}</span>
          </div>
          <CloseButton type="button" onClick={onClose} aria-label="Close variant selector">
            <FaTimes />
          </CloseButton>
        </Header>

        <OptionList>
          {options.length > 0 && (
            <>
              <SectionHeader>Variants / Options</SectionHeader>
              <div style={{ display: 'grid', gap: '12px' }}>
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
                      onClick={() => quantityMode ? selectQuantityOption(option.id) : setSelectedId(option.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          quantityMode ? selectQuantityOption(option.id) : setSelectedId(option.id);
                        }
                      }}
                    >
                      <OptionMeta>
                        <strong>{option.label}</strong>
                        <span>₹{Number(option.price || 0).toFixed(2)}</span>
                      </OptionMeta>
                      {quantityMode ? (
                        <QuantityControls
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <QuantityButton type="button" disabled={quantity <= 0} onClick={() => updateQuantity(option.id, -1)}>
                            <FaMinus />
                          </QuantityButton>
                          <QuantityValue>{quantity}</QuantityValue>
                          <QuantityButton type="button" onClick={() => updateQuantity(option.id, 1)}>
                            <FaPlus />
                          </QuantityButton>
                        </QuantityControls>
                      ) : (
                        active && <FaCheckCircle color="#f97316" />
                      )}
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
                      onClick={() => toggleUpsell(u.id)}
                    >
                      <OptionMeta>
                        <strong>{u.upsellProduct?.name}</strong>
                        <span>₹{Number(u.upsellProduct?.price || 0).toFixed(2)}</span>
                      </OptionMeta>
                      {active ? (
                        <QuantityControls
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <QuantityButton type="button" onClick={() => updateUpsellQuantity(u.id, -1)}>
                            <FaMinus />
                          </QuantityButton>
                          <QuantityValue>{quantity}</QuantityValue>
                          <QuantityButton type="button" onClick={() => updateUpsellQuantity(u.id, 1)}>
                            <FaPlus />
                          </QuantityButton>
                        </QuantityControls>
                      ) : (
                        <FaPlus color="#cbd5e1" />
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
            <SummaryBox>
              <span>{totalQty} item{totalQty === 1 ? '' : 's'} selected</span>
              <strong>₹{totalAmount.toFixed(2)}</strong>
            </SummaryBox>
          )}
          <AddButton
            type="button"
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
