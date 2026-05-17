import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaChevronRight, FaMinus, FaPlus, FaSave, FaSearch, FaTimes, FaTrash, FaUtensils } from 'react-icons/fa';
import api from '../utils/api';
import { calculateOrderTotals } from '../utils/orderCalculations';
import VariantSelector from './VariantSelector';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  @media (max-width: 760px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const Panel = styled.div`
  width: min(980px, 100%);
  height: min(760px, calc(100dvh - 40px));
  background: #f8fafc;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;

  @media (max-width: 760px) {
    width: 100%;
    height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 24px 24px 0 0;
  }
`;

const Header = styled.div`
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: clamp(20px, 5.8vw, 22px);
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    margin-top: 4px;
  }
`;

const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 20px;
`;

const Body = styled.div`
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 18px;
  padding: 18px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
    padding: 14px;
  }
`;

const Section = styled.section`
  min-height: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const SectionHead = styled.div`
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;

  strong {
    color: #0f172a;
    font-size: 15px;
    font-weight: 900;
  }
`;

const SearchBox = styled.div`
  position: relative;

  svg {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
  }

  input {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 14px;
    padding: 12px 12px 12px 38px;
    font-weight: 800;
    color: #0f172a;
    outline: none;
  }
`;

const ScrollList = styled.div`
  overflow-y: auto;
  min-height: 0;
  padding: 12px;
  display: grid;
  gap: 10px;
`;

const ProductButton = styled.button`
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  min-width: 0;

  strong {
    display: block;
    color: #0f172a;
    font-size: 13px;
    font-weight: 900;
  }

  span {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
  }
`;

const ProductAction = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  color: #f97316;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
`;

const LineRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const LineInfo = styled.div`
  min-width: 0;

  strong {
    display: block;
    color: #0f172a;
    font-size: 13px;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
  }
`;

const QtyGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 12px;
  background: white;
  border: 1px solid #e2e8f0;

  @media (max-width: 520px) {
    justify-content: space-between;
    width: 100%;
  }
`;

const IconButton = styled.button`
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: ${props => props.$danger ? '#fee2e2' : '#f1f5f9'};
  color: ${props => props.$danger ? '#dc2626' : '#475569'};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const Footer = styled.div`
  background: white;
  border-top: 1px solid #e2e8f0;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  }
`;

const Total = styled.div`
  color: #0f172a;
  font-size: 18px;
  font-weight: 900;
  overflow-wrap: anywhere;
`;

const SaveButton = styled.button`
  border: 0;
  border-radius: 16px;
  background: #f97316;
  color: white;
  min-height: 48px;
  padding: 0 22px;
  cursor: pointer;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  font-size: 14px;
  font-weight: 900;

  @media (max-width: 520px) {
    width: 100%;
    justify-content: center;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: 28px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
`;

const LoadingBubble = styled.div`
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 1390;
  transform: translate(-50%, -50%);
  padding: 12px 18px;
  border-radius: 14px;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function lineKey(line, index) {
  return line.cartKey || line.id || `${line.productId || line.product_id || line.productName || 'line'}-${line.variantId || 'base'}-${index}`;
}

function normalizeLine(line, index) {
  const productName = line.productName || line.product_name || line.name || 'Item';
  const variantId = line.variantId || line.variant_id || null;
  const variantName = line.variantName || line.variant_name || null;
  const displayName = variantName && !String(productName).includes(`(${variantName})`)
    ? `${productName} (${variantName})`
    : productName;
  return {
    cartKey: lineKey(line, index),
    productId: line.productId || line.product_id || null,
    variantId,
    variantName,
    productName,
    displayName,
    categoryName: line.categoryName || line.category_name || null,
    isPackagedGood: Boolean(line.isPackagedGood ?? line.is_packaged_good ?? line.is_packaged),
    quantity: toNumber(line.quantity || line.qty || 1) || 1,
    unitPrice: toNumber(line.unitPrice ?? line.unit_price ?? line.price),
    taxRate: toNumber(line.taxRate ?? line.tax_rate),
    unitOfMeasure: line.unitOfMeasure || line.unit_of_measure || 'units',
  };
}

function productToLine(product) {
  return {
    cartKey: `${product.id}:base`,
    productId: product.id,
    variantId: null,
    productName: product.name,
    displayName: product.name,
    categoryName: product.categoryName || product.category?.name || null,
    isPackagedGood: Boolean(product.isPackagedGood || product.is_packaged_good || product.is_packaged),
    quantity: 1,
    unitPrice: toNumber(product.price),
    taxRate: toNumber(product.taxRate || product.tax_rate),
    unitOfMeasure: product.uomName || product.uom?.name || product.unitOfMeasure || 'units',
  };
}

export default function EditOrderPanel({ order, onClose, onSave, saving = false }) {
  const [fullOrder, setFullOrder] = useState(order);
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState(null);
  const [lines, setLines] = useState(() => (order?.lines || []).map(normalizeLine));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [variantProduct, setVariantProduct] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [orderRes, productsRes, configRes] = await Promise.all([
          order?.id ? api.get(`/api/v1/orders/${order.id}`) : Promise.resolve({ data: { data: order } }),
          api.get('/api/v1/products'),
          api.get('/api/v1/configurations').catch(() => ({ data: { data: null } })),
        ]);
        if (!alive) return;
        const loadedOrder = orderRes.data.data || order;
        setFullOrder(loadedOrder);
        setLines((loadedOrder?.lines || []).map(normalizeLine));
        setProducts(productsRes.data.data || []);
        setConfig(configRes.data.data || null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [order]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter((product) => product.isActive !== false && product.isactive !== 'N' && (!term || String(product.name || '').toLowerCase().includes(term)))
      .slice(0, 40);
  }, [products, search]);

  const totals = useMemo(() => {
    if (!lines.length) {
      return { total_amount: 0, total_tax: 0, total_inc_tax: 0, line_subtotal: 0, processed_items: [] };
    }
    return calculateOrderTotals(
      lines.map((line) => ({
        id: line.cartKey,
        productId: line.productId,
        name: line.displayName || line.productName,
        price: line.unitPrice,
        quantity: line.quantity,
        tax_rate: line.taxRate || 0,
        is_packaged_good: line.isPackagedGood,
        is_packaged: line.isPackagedGood,
      })),
      { type: 'amount', value: 0 },
      {
        gst_enabled: config?.taxEnabled,
        default_tax_rate: (() => {
          if (!config?.taxEnabled) return 0;
          const rates = config?.taxRates || [];
          const def = rates.find(r => r.id === config?.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config?.pricesIncludeTax,
        round_off_config: { round_off_enabled: config?.roundOffEnabled },
      }
    );
  }, [config, lines]);

  const upsertLine = (newLine) => {
    setLines((current) => {
      const existing = current.find((line) => line.cartKey === newLine.cartKey);
      if (existing) {
        return current.map((line) => line.cartKey === newLine.cartKey ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, newLine];
    });
    setSearch('');
  };

  const openVariantSelector = async (product) => {
    setVariantLoading(true);
    try {
      const { data } = await api.get(`/api/v1/products/${product.id}`);
      const detail = data.data || {};
      setVariantProduct({
        ...product,
        ...detail,
        categoryName: product.categoryName || detail.category?.name,
        uomName: product.uomName || detail.uom?.name,
      });
    } catch (error) {
      console.error('Failed to load product variants', error);
      alert('Unable to load item options. Please try again.');
    } finally {
      setVariantLoading(false);
    }
  };

  const addProduct = async (product) => {
    const hasVariants = Boolean(product.hasVariants || product.has_variants || Number(product.variantCount || product.variant_count || 0) > 0);
    const hasUpsells = Boolean(product.hasUpsells || Number(product.upsellCount || 0) > 0);
    
    if (hasVariants || hasUpsells) {
      await openVariantSelector(product);
      return;
    }
    upsertLine(productToLine(product));
  };

  const addOptions = (variant, additionalItems = []) => {
    if (!variantProduct) return;
    
    if (variant) {
      const displayName = `${variantProduct.name} (${variant.label})`;
      upsertLine({
        cartKey: `${variantProduct.id}:${variant.id}`,
        productId: variantProduct.id,
        variantId: variant.id,
        variantName: variant.label,
        productName: displayName,
        displayName,
        categoryName: variantProduct.categoryName || variantProduct.category?.name || null,
        isPackagedGood: Boolean(variantProduct.isPackagedGood || variantProduct.is_packaged_good || variantProduct.is_packaged),
        quantity: 1,
        unitPrice: toNumber(variant.price),
        taxRate: toNumber(variantProduct.taxRate || variantProduct.tax_rate),
        unitOfMeasure: variantProduct.uomName || variantProduct.uom?.name || variantProduct.unitOfMeasure || 'units',
      });
    }

    if (additionalItems && additionalItems.length > 0) {
      additionalItems.forEach(item => {
        upsertLine({
          cartKey: `${item.id}:base`,
          productId: item.id,
          productName: item.name,
          displayName: item.name,
          categoryName: item.categoryName || null,
          isPackagedGood: Boolean(item.isPackagedGood),
          quantity: item.qty || 1,
          unitPrice: toNumber(item.price),
          taxRate: toNumber(item.taxRate || item.tax_rate),
          unitOfMeasure: item.uomName || item.uom?.name || 'units',
        });
      });
    }

    setVariantProduct(null);
  };

  const syncLines = (selectedOptions, additionalItems = []) => {
    if (!variantProduct) return;
    const productId = String(variantProduct.id);
    
    setLines((current) => {
      // Filter out existing variants of THIS product (base product + variants)
      let next = current.filter((line) => String(line.productId) !== productId);
      
      // Add selected variants
      selectedOptions.forEach((variant) => {
        const displayName = `${variantProduct.name} (${variant.label})`;
        next.push({
          cartKey: `${variantProduct.id}:${variant.id}`,
          productId: variantProduct.id,
          variantId: variant.id,
          variantName: variant.label,
          productName: displayName,
          displayName,
          categoryName: variantProduct.categoryName || variantProduct.category?.name || null,
          isPackagedGood: Boolean(variantProduct.isPackagedGood || variantProduct.is_packaged_good || variantProduct.is_packaged),
          quantity: variant.quantity,
          unitPrice: toNumber(variant.price),
          taxRate: toNumber(variantProduct.taxRate || variantProduct.tax_rate),
          unitOfMeasure: variantProduct.uomName || variantProduct.uom?.name || variantProduct.unitOfMeasure || 'units',
        });
      });

      return next;
    });

    if (additionalItems && additionalItems.length > 0) {
      additionalItems.forEach(item => {
        upsertLine({
          cartKey: `${item.id}:base`,
          productId: item.id,
          productName: item.name,
          displayName: item.name,
          categoryName: item.categoryName || null,
          isPackagedGood: Boolean(item.isPackagedGood),
          quantity: item.qty || 1,
          unitPrice: toNumber(item.price),
          taxRate: toNumber(item.taxRate || item.tax_rate),
          unitOfMeasure: item.uomName || item.uom?.name || 'units',
        });
      });
    }

    setVariantProduct(null);
  };

  const currentVariantQuantities = useMemo(() => {
    if (!variantProduct) return {};
    const productId = String(variantProduct.id);
    return lines
      .filter((line) => String(line.productId) === productId && line.variantId)
      .reduce((acc, line) => {
        acc[String(line.variantId)] = line.quantity;
        return acc;
      }, {});
  }, [lines, variantProduct]);

  const updateQty = (cartKey, delta) => {
    setLines((current) => current
      .map((line) => line.cartKey === cartKey ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
      .filter((line) => line.quantity > 0));
  };

  const removeLine = (cartKey) => {
    setLines((current) => current.filter((line) => line.cartKey !== cartKey));
  };

  const submit = () => {
    const processedLines = (totals.processed_items || []).map((processed, index) => {
      const original = lines.find((line) => line.cartKey === processed.id) || lines[index];
      const quantity = toNumber(processed.quantity || original?.quantity || 1) || 1;
      const unitPrice = toNumber(processed.unit_price ?? original?.unitPrice);
      return {
        productId: original?.productId || null,
        variantId: original?.variantId || null,
        productName: original?.displayName || original?.productName || processed.item_name || 'Item',
        categoryName: original?.categoryName || null,
        isPackagedGood: Boolean(original?.isPackagedGood),
        quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        unitOfMeasure: original?.unitOfMeasure || 'units',
        taxRate: Number(toNumber(processed.tax_rate || original?.taxRate).toFixed(2)),
        taxAmount: Number(toNumber(processed.tax_amount).toFixed(2)),
        discountAmount: Number(toNumber(processed.discount_amount).toFixed(2)),
        lineTotal: Number(toNumber(processed.line_total || unitPrice * quantity).toFixed(2)),
      };
    });

    onSave?.({
      ...fullOrder,
      orderType: fullOrder?.orderType || 'SALE',
      orderStatus: fullOrder?.orderStatus || fullOrder?.order_status || 'KITCHEN',
      paymentStatus: fullOrder?.paymentStatus || fullOrder?.payment_status || 'PENDING',
      fulfillmentType: fullOrder?.fulfillmentType || fullOrder?.fulfillment_type || 'DINE_IN',
      tableNumber: fullOrder?.tableNumber || fullOrder?.table_number || null,
      tableId: fullOrder?.tableId || fullOrder?.table_id || null,
      grandTotal: Number(toNumber(totals.total_amount).toFixed(2)),
      totalTaxAmount: Number(toNumber(totals.total_tax).toFixed(2)),
      totalAmount: Number(toNumber(totals.total_inc_tax).toFixed(2)),
      totalDiscountAmount: Number(toNumber(totals.discount_amount).toFixed(2)),
      lines: processedLines,
    });
  };

  if (!order) return null;

  return (
    <Overlay onMouseDown={onClose}>
      <Panel onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <div>
            <h2><FaUtensils /> Edit Order</h2>
            <span>{order.orderNo || order.order_no || `#${String(order.id || '').slice(0, 8)}`}</span>
          </div>
          <CloseButton type="button" onClick={onClose} aria-label="Close edit order panel">
            <FaTimes />
          </CloseButton>
        </Header>

        <Body>
          <Section>
            <SectionHead>
              <strong>Add Items</strong>
              <SearchBox>
                <FaSearch />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" />
              </SearchBox>
            </SectionHead>
            <ScrollList>
              {loading ? (
                <EmptyState>Loading products...</EmptyState>
              ) : filteredProducts.length ? (
                filteredProducts.map((product) => {
                  const hasOptions = product.hasVariants || product.variantCount > 0;
                  return (
                    <ProductButton key={product.id} type="button" onClick={() => addProduct(product)}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.categoryName || 'Menu item'}</span>
                      </div>
                      {hasOptions || product.hasUpsells || product.upsellCount > 0 ? (
                        <ProductAction>
                          <small>Options available</small>
                          <FaChevronRight />
                        </ProductAction>
                      ) : (
                        <strong>₹{Number(product.price || 0).toFixed(2)}</strong>
                      )}
                    </ProductButton>
                  );
                })
              ) : (
                <EmptyState>No products found</EmptyState>
              )}
            </ScrollList>
          </Section>

          <Section>
            <SectionHead>
              <strong>Order Items</strong>
            </SectionHead>
            <ScrollList>
              {lines.length ? lines.map((line) => (
                <LineRow key={line.cartKey}>
                  <LineInfo 
                    style={{ cursor: 'pointer' }}
                    onClick={async () => {
                      const p = products.find(p => String(p.id) === String(line.productId));
                      if (p) {
                        const hasOptions = p.hasVariants || p.variantCount > 0 || p.hasUpsells || p.upsellCount > 0;
                        if (hasOptions) await openVariantSelector(p);
                      }
                    }}
                  >
                    <strong>{line.displayName || line.productName}</strong>
                    <span>₹{Number(line.unitPrice || 0).toFixed(2)} each</span>
                  </LineInfo>
                  <QtyGroup>
                    <IconButton type="button" onClick={() => updateQty(line.cartKey, -1)}><FaMinus /></IconButton>
                    <strong>{line.quantity}</strong>
                    <IconButton type="button" onClick={() => updateQty(line.cartKey, 1)}><FaPlus /></IconButton>
                  </QtyGroup>
                  <IconButton type="button" $danger onClick={() => removeLine(line.cartKey)}><FaTrash /></IconButton>
                </LineRow>
              )) : (
                <EmptyState>No items in this order</EmptyState>
              )}
            </ScrollList>
          </Section>
        </Body>

        <Footer>
          <Total>Total ₹{Number(totals.total_amount || 0).toFixed(2)}</Total>
          <SaveButton type="button" disabled={saving || lines.length === 0} onClick={submit}>
            <FaSave /> {saving ? 'Saving...' : 'Save Order'}
          </SaveButton>
        </Footer>
      </Panel>
      {variantLoading && <LoadingBubble onMouseDown={(event) => event.stopPropagation()}>Loading item options...</LoadingBubble>}
      {variantProduct && (
        <div onMouseDown={(event) => event.stopPropagation()}>
          <VariantSelector
            product={variantProduct}
            onClose={() => setVariantProduct(null)}
            onSelect={addOptions}
            quantityMode
            initialQuantities={currentVariantQuantities}
            onSelectMany={syncLines}
          />
        </div>
      )}
    </Overlay>
  );
}
