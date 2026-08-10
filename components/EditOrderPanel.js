import React, { useEffect, useMemo, useState } from 'react';
import { FaChevronRight, FaMinus, FaPlus, FaSave, FaSearch, FaTimes, FaTrash, FaUtensils } from 'react-icons/fa';
import api from '../utils/api';
import { calculateOrderTotals } from '../utils/orderCalculations';
import VariantSelector from './VariantSelector';
import { useNotification } from '../context/NotificationContext';
import { isDiscountModuleEnabled } from '../utils/moduleVisibility';
import { useAuth } from '../context/AuthContext';
import {
  Overlay,
  Panel,
  Header,
  CloseButton,
  Body,
  Section,
  SectionHead,
  SearchBox,
  ScrollList,
  ProductButton,
  ProductAction,
  LineRow,
  LineInfo,
  QtyGroup,
  QtyInput,
  IconButton,
  Footer,
  SummaryDetails,
  SaveButton,
  EmptyState,
  LoadingBubble,
  DiscountBtn,
  ModalBackdrop,
  DiscountModalContent,
  DiscountModalHeader,
  DiscountTabHeader,
  DiscountTabButton,
  DiscountModalBody,
  DiscountModalFooter,
  DiscountRow,
  DiscountRowInfo,
  DiscountInputWrapper,
  DiscUnitToggle,
  RoundOffField,
  FooterControls,
} from './EditOrderPanel.styles';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDiscountType(type) {
  return String(type || '').toUpperCase() === 'PERCENT'
    ? 'percent'
    : 'amount';
}

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

  const manualPercent =
    line.manualDiscountPercent ??
    line.manual_discount_percent;

  const manualAmount =
    line.manualDiscountAmount ??
    line.manual_discount_amount;

  let initialType = 'amount';
  let initialVal = 0;

  if (manualPercent != null && Number(manualPercent) > 0) {
    initialType = 'percent';
    initialVal = toNumber(manualPercent);
  } else if (manualAmount != null && Number(manualAmount) > 0) {
    initialType = 'amount';
    initialVal = toNumber(manualAmount);
  } else if (line.discount?.value != null) {
    initialType =
      line.discount.type === 'percent' ||
      line.discount.type === 'percentage'
        ? 'percent'
        : 'amount';

    initialVal = toNumber(line.discount.value);
  } else if (
    (line.lineDiscountType || line.line_discount_type) &&
    (line.lineDiscountValue ?? line.line_discount_value) != null
  ) {
    const ldType = line.lineDiscountType || line.line_discount_type;
    initialType =
      String(ldType).toUpperCase() === 'PERCENT' ||
      String(ldType).toUpperCase() === 'PERCENTAGE'
        ? 'percent'
        : 'amount';
    initialVal = toNumber(line.lineDiscountValue ?? line.line_discount_value);
  }

  return {
    cartKey: lineKey(line, index),
    id: line.id || line.lineId || line.line_id || null,
    lineId: line.id || line.lineId || line.line_id || null,
    clientLineId: line.clientLineId || line.client_line_id || null,
    productId: line.productId || line.product_id || null,
    variantId,
    variantName,
    productName,
    displayName,
    categoryName: line.categoryName || line.category_name || null,
    isPackagedGood: Boolean(line.isPackagedGood ?? line.is_packaged_good ?? line.is_packaged),
    quantity: toNumber(line.quantity || line.qty || 1) || 1,
    unitPrice: toNumber(line.unitPrice ?? line.unit_price ?? line.price),
    taxRate: toNullableNumber(line.taxRate ?? line.tax_rate),
    unitOfMeasure: line.unitOfMeasure || line.unit_of_measure || 'units',
    discount_percent: initialType === 'percent' ? initialVal : 0,
    discount_amount: initialType === 'amount' ? initialVal : 0,
    discount: { type: initialType, value: initialVal },
    originalQuantity: toNumber(line.quantity || line.qty || 1) || 1,
    taxType: line.taxType ?? line.tax_type ?? null,
    taxCode: line.taxCode ?? line.tax_code ?? null,
    taxName: line.taxName ?? line.tax_name ?? null,
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
    taxRate: toNullableNumber(product.taxRate ?? product.tax_rate),
    unitOfMeasure: product.uomName || product.uom?.name || product.unitOfMeasure || 'units',
    discount_percent: 0,
    discount_amount: 0,
    discount: { type: 'amount', value: 0 },
    originalQuantity: 0,
  };
}

function isValidUUID(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function deterministicUUID(str) {
  let h1 = 1779033703, h2 = 3024738477, h3 = 3362453659, h4 = 50249321;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h4 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const seed = [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
  
  const hex = [];
  for (let i = 0; i < 4; i++) {
    let s = seed[i];
    for (let j = 0; j < 4; j++) {
      const b = (s >>> (j * 8)) & 0xff;
      hex.push(b.toString(16).padStart(2, '0'));
    }
  }
  
  hex[6] = ((parseInt(hex[6], 16) & 0x0f) | 0x40).toString(16).padStart(2, '0');
  hex[8] = ((parseInt(hex[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
}

export default function EditOrderPanel({ order, onClose, onSave, saving = false }) {
  const { notify } = useNotification();
  const { canDeleteOrderItem, canDecrementOrderItem } = useAuth();
  const [fullOrder, setFullOrder] = useState(order);
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState(null);
  const sym = config?.currencySymbol || '₹';
  const [lines, setLines] = useState(() => (order?.lines || []).map(normalizeLine));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [variantProduct, setVariantProduct] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variablePriceProduct, setVariablePriceProduct] = useState(null);
  const [variablePriceInput, setVariablePriceInput] = useState('');

  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState(0);
  const [manualFinalAmount, setManualFinalAmount] = useState('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [localDiscounts, setLocalDiscounts] = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab] = useState('line'); // 'line' | 'total'

  const dp = config?.currencyDecimalPlaces ?? 2;
  const isCompleted = fullOrder?.orderStatus === 'COMPLETED' || fullOrder?.order_status === 'COMPLETED';
  const discountsEnabled = isDiscountModuleEnabled(config);
  const roundOffEnabled = Boolean(config?.roundOffEnabled);
  const roundOffMode = String(config?.roundOffMode || 'automatic').toLowerCase();

  // Sync state with local states when discount modal opens
  useEffect(() => {
    if (showDiscountModal && lines.length > 0) {
      const initial = {};
      lines.forEach(item => {
        const key = item.cartKey;
        if (item.discount_percent > 0) {
          initial[key] = { type: 'percentage', value: item.discount_percent };
        } else if (item.discount_amount > 0) {
          initial[key] = { type: 'amount', value: item.discount_amount };
        } else if (item.discount) {
          initial[key] = { type: item.discount.type || 'amount', value: item.discount.value || 0 };
        } else {
          initial[key] = { type: 'amount', value: 0 };
        }
      });
      setLocalDiscounts(initial);
      setLocalOrderDiscountType(discountType || 'amount');
      setLocalOrderDiscountValue(discountValue || 0);
      setDiscountModalTab('line');
    }
  }, [showDiscountModal, lines, discountType, discountValue]);

  const handleApplyDiscounts = () => {
    const discountsEnabled = isDiscountModuleEnabled(config);
    if (!discountsEnabled) return;

    setLines(prev => prev.map(item => {
      const key = item.cartKey;
      const disc = localDiscounts[key];
      if (disc) {
        if (disc.type === 'percentage' || disc.type === 'percent') {
          return {
            ...item,
            discount_percent: disc.value,
            discount_amount: 0,
            discount: { type: 'percent', value: disc.value }
          };
        } else {
          return {
            ...item,
            discount_percent: 0,
            discount_amount: disc.value,
            discount: { type: 'amount', value: disc.value }
          };
        }
      }
      return item;
    }));
    setDiscountType(localOrderDiscountType === 'percentage' || localOrderDiscountType === 'percent' ? 'percent' : 'amount');
    setDiscountValue(localOrderDiscountValue);
    setShowDiscountModal(false);
  };

  const handleClearAllDiscounts = () => {
    const discountsEnabled = isDiscountModuleEnabled(config);
    if (!discountsEnabled) return;

    setLocalDiscounts(prev => {
      const next = {};
      Object.keys(prev).forEach(key => {
        next[key] = { type: 'amount', value: 0 };
      });
      return next;
    });
    setLocalOrderDiscountType('amount');
    setLocalOrderDiscountValue(0);
  };

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

        const loadedDiscountType = normalizeDiscountType(
          loadedOrder.orderDiscountType ??
          loadedOrder.order_discount_type ??
          loadedOrder.orderDiscount?.type
        );
        const loadedDiscountValue = toNumber(
          loadedOrder.orderDiscountValue ??
          loadedOrder.order_discount_value ??
          loadedOrder.orderDiscount?.value
        );
        setDiscountType(loadedDiscountType);
        setDiscountValue(loadedDiscountValue);
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
    if (!term) return [];
    return products
      .filter((product) => product.isActive !== false && product.isactive !== 'N' && String(product.name || '').toLowerCase().includes(term))
      .slice(0, 40);
  }, [products, search]);

  const totals = useMemo(() => {
    if (!lines.length) {
      return {
        grossTotal: 0,
        discount: 0,
        taxable: 0,
        tax: 0,
        basePayable: 0,
        autoRoundOff: 0,
        processedLines: [],
      };
    }

    const configProfile = {
      tax_enabled: config?.taxEnabled,
      default_tax_rate: (() => {
        if (!config?.taxEnabled) return 0;
        const rates = config?.taxRates || [];
        const def = rates.find(r => r.id === config?.taxDefaultId);
        return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
      })(),
      prices_include_tax: config?.pricesIncludeTax,
      currencyDecimalPlaces: dp,
      round_off_config: {
        round_off_enabled: roundOffEnabled,
        round_off_mode: roundOffMode,
        round_off_auto_factor: Number(config?.roundOffAutoFactor ?? 1),
      }
    };

    const calculated = calculateOrderTotals(
      lines.map((line) => ({
        clientLineId: line.clientLineId ?? line.id ?? line.cartKey,
        id: line.cartKey,
        productId: line.productId,
        name: line.displayName || line.productName,
        price: line.unitPrice,
        quantity: toNumber(line.quantity) || 1,
        tax_rate: line.taxRate,
        is_packaged_good: line.isPackagedGood,
        is_packaged: line.isPackagedGood,
        discount_percent: line.discount_percent,
        discount_amount: line.discount_amount,
        discount: line.discount,
        tax_type:
          line.taxType ??
          line.tax_type ??
          line.taxTypeResolved ??
          line.tax_type_resolved ??
          null,
        tax_code: line.taxCode ?? line.tax_code ?? null,
        tax_name: line.taxName ?? line.tax_name ?? null,
      })),
      { type: discountType, value: discountValue },
      configProfile
    );

    const processedLines = (calculated.processed_items || []).map((processed) => {
      const original = lines.find(line => line.cartKey === processed.id);
      if (!original) {
        throw new Error(`Line mapping integrity error: cartKey "${processed.id}" mismatch in EditOrderPanel calculations.`);
      }
      const hasLineDiscount = original?.discount && original.discount.value > 0;
      const isPercentLineDisc = hasLineDiscount && (original.discount.type === 'percent' || original.discount.type === 'percentage');
      const manualDiscountAmount = hasLineDiscount && !isPercentLineDisc ? Number(original.discount.value) : null;
      const manualDiscountPercent = hasLineDiscount && isPercentLineDisc ? Number(original.discount.value) : null;

      return {
        ...original,
        clientLineId: processed.clientLineId,
        quantity: processed.quantity,
        unitPrice: processed.unit_price,
        taxRate: processed.tax_rate,
        taxAmount: processed.tax_amount,
        discountAmount: processed.discount_amount,
        lineTotal: processed.line_total,
        grossLineAmount: processed.gross_line_amount,
        unitPriceExTax: processed.unit_price_ex_tax,
        taxableAmount: processed.taxable_amount,
        taxType: processed.tax_type_resolved,
        taxSnapshotRate: processed.tax_snapshot_rate,
        taxCode: processed.tax_code,
        taxName: processed.tax_name,
        manualDiscountAmount,
        manualDiscountPercent,
        allocatedOrderDiscount: processed.order_discount_base_share,
        allocatedOrderDiscountFace: processed.order_discount_face_share,
      };
    });

    return {
      grossTotal: calculated.gross_face_total,
      discount: calculated.discount_amount,
      taxable: calculated.taxable_amount,
      tax: calculated.total_tax,
      basePayable: calculated.total_inc_tax,
      autoRoundOff: calculated.round_off_amount || 0,
      processedLines,
    };
  }, [lines, discountType, discountValue, config, roundOffEnabled, roundOffMode, dp]);

  const roundOff = useMemo(() => {
    if (!roundOffEnabled) return 0;
    if (roundOffMode === 'automatic') {
      return totals ? totals.autoRoundOff : 0;
    } else { // manual
      if (!manualFinalAmount || isNaN(Number(manualFinalAmount))) {
        return 0;
      }
      return Number((Number(manualFinalAmount) - totals.basePayable).toFixed(dp));
    }
  }, [roundOffEnabled, roundOffMode, totals, manualFinalAmount, dp]);

  const payable = roundOffEnabled
    ? (roundOffMode === 'manual' && manualFinalAmount !== '' && !isNaN(Number(manualFinalAmount))
        ? Number(Number(manualFinalAmount).toFixed(dp))
        : Number((totals.basePayable + roundOff).toFixed(dp)))
    : totals.basePayable;

  useEffect(() => {
    if (config?.roundOffEnabled && config?.roundOffMode === 'manual' && totals) {
      const dp = config?.currencyDecimalPlaces ?? 2;
      setManualFinalAmount(totals.basePayable.toFixed(dp));
    }
  }, [totals?.basePayable, config]);

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
      notify('error', 'Unable to load item options. Please try again.');
    } finally {
      setVariantLoading(false);
    }
  };

  const addProduct = async (product) => {
    // Variable price: show a prompt for custom price
    if (product.isVariablePrice) {
      setVariablePriceProduct(product);
      setVariablePriceInput(String(Number(product.price || 0)));
      return;
    }
    const hasVariants = Boolean(product.hasVariants || product.has_variants || Number(product.variantCount || product.variant_count || 0) > 0);
    const hasUpsells = Boolean(product.hasUpsells || Number(product.upsellCount || 0) > 0);
    
    if (hasVariants || hasUpsells) {
      await openVariantSelector(product);
      return;
    }
    upsertLine(productToLine(product));
  };

  const confirmVariablePrice = () => {
    if (!variablePriceProduct) return;
    const customPrice = parseFloat(variablePriceInput);
    if (isNaN(customPrice) || customPrice < 0) return;
    const uniqueKey = `${variablePriceProduct.id}:vp_${Date.now()}`;
    upsertLine({
      ...productToLine(variablePriceProduct),
      cartKey: uniqueKey,
      unitPrice: customPrice,
    });
    setVariablePriceProduct(null);
    setVariablePriceInput('');
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
        taxRate: toNullableNumber(variantProduct.taxRate ?? variantProduct.tax_rate),
        unitOfMeasure: variantProduct.uomName || variantProduct.uom?.name || variantProduct.unitOfMeasure || 'units',
        discount_percent: 0,
        discount_amount: 0,
        discount: { type: 'amount', value: 0 },
        originalQuantity: 0,
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
          taxRate: toNullableNumber(item.taxRate ?? item.tax_rate),
          unitOfMeasure: item.uomName || item.uom?.name || 'units',
          discount_percent: 0,
          discount_amount: 0,
          discount: { type: 'amount', value: 0 },
          originalQuantity: 0,
        });
      });
    }

    setVariantProduct(null);
  };

  const syncLines = (selectedOptions, additionalItems = []) => {
    if (!variantProduct) return;
    const productId = String(variantProduct.id);
    
    // Validate decrement and delete permissions for existing variant lines
    const existingProductLines = lines.filter(
      (line) => String(line.productId) === productId
    );

    for (const existing of existingProductLines) {
      const proposed = selectedOptions.find(opt => String(opt.id) === String(existing.variantId));
      const proposedQty = proposed ? proposed.quantity : 0;

      if (proposedQty === 0 && existing.originalQuantity > 0 && !canDeleteOrderItem) {
        notify('error', `You do not have permission to delete the existing variant: ${existing.displayName || existing.productName}`);
        return; // Abort sync completely
      }

      if (proposedQty > 0 && proposedQty < existing.originalQuantity && !canDecrementOrderItem) {
        notify('error', `You do not have permission to decrease the quantity of the existing variant: ${existing.displayName || existing.productName}`);
        return; // Abort sync completely
      }
    }

    setLines((current) => {
      // Find all existing lines for THIS product
      const existingProductLinesCurrent = current.filter(
        (line) => String(line.productId) === productId
      );

      // Keep lines for other products
      let next = current.filter(
        (line) => String(line.productId) !== productId
      );

      // Add/merge selected variants
      selectedOptions.forEach((variant) => {
        const displayName = `${variantProduct.name} (${variant.label})`;
        const cartKey = `${variantProduct.id}:${variant.id}`;
        
        // Check if this variant already existed in the order
        const existing = existingProductLinesCurrent.find(
          (line) => String(line.variantId) === String(variant.id)
        );

        if (existing) {
          // Merge: keep identity, tax, discounts, etc., but update quantity
          next.push({
            ...existing,
            quantity: variant.quantity,
          });
        } else {
          // New variant line
          next.push({
            cartKey,
            id: null,
            lineId: null,
            clientLineId: null,
            productId: variantProduct.id,
            variantId: variant.id,
            variantName: variant.label,
            productName: displayName,
            displayName,
            categoryName: variantProduct.categoryName || variantProduct.category?.name || null,
            isPackagedGood: Boolean(variantProduct.isPackagedGood || variantProduct.is_packaged_good || variantProduct.is_packaged),
            quantity: variant.quantity,
            unitPrice: toNumber(variant.price),
            taxRate: toNullableNumber(variantProduct.taxRate ?? variantProduct.tax_rate),
            unitOfMeasure: variantProduct.uomName || variantProduct.uom?.name || variantProduct.unitOfMeasure || 'units',
            discount_percent: 0,
            discount_amount: 0,
            discount: { type: 'amount', value: 0 },
            originalQuantity: 0,
          });
        }
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
          taxRate: toNullableNumber(item.taxRate ?? item.tax_rate),
          unitOfMeasure: item.uomName || item.uom?.name || 'units',
          discount_percent: 0,
          discount_amount: 0,
          discount: { type: 'amount', value: 0 },
          originalQuantity: 0,
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
      .map((line) => {
        if (line.cartKey === cartKey) {
          const nextQty = Math.max(0, line.quantity + delta);
          if (delta < 0 && !canDecrementOrderItem && nextQty < line.originalQuantity) {
            notify('error', 'You do not have permission to decrease the quantity of an existing item');
            return line;
          }
          if (nextQty <= 0 && line.originalQuantity > 0 && !canDeleteOrderItem) {
            notify('error', 'You do not have permission to delete an existing item');
            return line;
          }
          return { ...line, quantity: nextQty };
        }
        return line;
      })
      .filter((line) => line.quantity > 0));
  };

  const removeLine = (cartKey) => {
    const lineToRemove = lines.find((line) => line.cartKey === cartKey);
    if (lineToRemove && lineToRemove.originalQuantity > 0 && !canDeleteOrderItem) {
      notify('error', 'You do not have permission to delete an existing item');
      return;
    }
    setLines((current) => current.filter((line) => line.cartKey !== cartKey));
  };

  const submit = () => {
    const dp = config?.currencyDecimalPlaces ?? 2;

    const processedLines = (totals.processedLines || []).map((line) => {
      const taxRatePct = line.taxRate != null ? Number(Number(line.taxRate).toFixed(2)) : null;

      let clientLineId = line.clientLineId || line.client_line_id || null;
      if (!isValidUUID(clientLineId)) {
        const fallbackKey = line.cartKey || `${line.productId || 'line'}:${line.variantId || 'base'}`;
        clientLineId = deterministicUUID(String(fallbackKey));
      }

      return {
        id: line.id || line.lineId || line.line_id || null,
        clientLineId,
        productId: line.productId || null,
        variantId: line.variantId || null,
        productName: line.displayName || line.productName || 'Item',
        categoryName: line.categoryName || null,
        isPackagedGood: Boolean(line.isPackagedGood),
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice.toFixed(dp)),
        unitOfMeasure: line.unitOfMeasure || 'units',
        taxRate: taxRatePct,
        // Enriched line-level tax/discount fields (intent/snapshots only)
        taxType: line.taxType,
        taxSnapshotRate: line.taxSnapshotRate,
        taxCode: line.taxCode,
        taxName: line.taxName,
        manualDiscountAmount: line.manualDiscountAmount,
        manualDiscountPercent: line.manualDiscountPercent,
      };
    });

    onSave?.({
      ...fullOrder,
      skipAutoPrintKinds: [], // Clear any skip instructions so the backend generates the KOT edit print job
      orderType: fullOrder?.orderType || 'SALE',
      orderStatus: fullOrder?.orderStatus || fullOrder?.order_status || 'KITCHEN',
      paymentStatus: fullOrder?.paymentStatus || fullOrder?.payment_status || 'PENDING',
      fulfillmentType: fullOrder?.fulfillmentType || fullOrder?.fulfillment_type || 'DINE_IN',
      tableNumber: fullOrder?.tableNumber || fullOrder?.table_number || null,
      tableId: fullOrder?.tableId || fullOrder?.table_id || null,
      
      // Enriched order-level tax/discount fields (intent/snapshots only)
      orderDiscountType: discountType === 'percentage' || discountType === 'percent' ? 'PERCENT' : 'AMOUNT',
      orderDiscountValue: Number(discountValue || 0),
      discountSource: fullOrder?.discountSource || 'MANUAL',
      requestedRoundOff:
        roundOffEnabled && roundOffMode === 'manual'
          ? Number(roundOff.toFixed(dp))
          : null,
      roundOffMode:
        roundOffEnabled
          ? roundOffMode.toUpperCase()
          : 'DISABLED',
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
              ) : !search.trim() ? (
                <EmptyState style={{ color: '#94a3b8' }}>Type to search and add products</EmptyState>
              ) : filteredProducts.length ? (
                filteredProducts.map((product) => {
                  const hasOptions = product.hasVariants || product.variantCount > 0;
                  return (
                    <ProductButton key={product.id} type="button" onClick={() => addProduct(product)}>
                      <div>
                        <strong>
                          {product.name}
                          {product.isVariablePrice && <span style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '6px', verticalAlign: 'middle' }}>OPEN</span>}
                        </strong>
                        <span>{product.categoryName || 'Menu item'}</span>
                      </div>
                      {hasOptions || product.hasUpsells || product.upsellCount > 0 ? (
                        <ProductAction>
                          <small>Options available</small>
                          <FaChevronRight />
                        </ProductAction>
                      ) : (
                        <strong>{sym}{Number(product.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}</strong>
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
                    <span>{sym}{Number(line.unitPrice || 0).toFixed(config?.currencyDecimalPlaces ?? 2)} each</span>
                  </LineInfo>
                  <QtyGroup>
                    <IconButton type="button" onClick={() => updateQty(line.cartKey, -1)}><FaMinus /></IconButton>
                    <QtyInput
                      type="number"
                      value={line.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setLines((current) =>
                            current.map((lineItem) => {
                              if (lineItem.cartKey === line.cartKey) {
                                const nextQty = Math.max(0, val);
                                if (!canDecrementOrderItem && nextQty < lineItem.originalQuantity) {
                                  notify('error', 'You do not have permission to decrease the quantity of an existing item');
                                  return lineItem;
                                }
                                if (nextQty <= 0 && lineItem.originalQuantity > 0 && !canDeleteOrderItem) {
                                  notify('error', 'You do not have permission to delete an existing item');
                                  return lineItem;
                                }
                                return { ...lineItem, quantity: nextQty };
                              }
                              return lineItem;
                            })
                          );
                        } else {
                          setLines((current) =>
                            current.map((lineItem) =>
                              lineItem.cartKey === line.cartKey
                                ? { ...lineItem, quantity: '' }
                                : lineItem
                            )
                          );
                        }
                      }}
                      onBlur={() => {
                        setLines((current) =>
                          current
                            .map((lineItem) => {
                              if (lineItem.cartKey === line.cartKey) {
                                const q = toNumber(lineItem.quantity);
                                if (q <= 0 && lineItem.originalQuantity > 0 && !canDeleteOrderItem) {
                                  notify('error', 'You do not have permission to delete an existing item');
                                  return { ...lineItem, quantity: lineItem.originalQuantity };
                                }
                                return { ...lineItem, quantity: q <= 0 ? 0 : q };
                              }
                              return lineItem;
                            })
                            .filter((lineItem) => lineItem.quantity > 0)
                        );
                      }}
                    />
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
          <SummaryDetails>
            <div className="row">
              <span>Gross Total:</span>
              <span>{sym}{Number(totals.grossTotal || 0).toFixed(dp)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="row" style={{ color: '#dc2626' }}>
                <span>Discount:</span>
                <span>-{sym}{Number(totals.discount).toFixed(dp)}</span>
              </div>
            )}
            {config?.taxEnabled && totals.taxable > 0 && (
              <div className="row">
                <span>Subtotal:</span>
                <span>{sym}{Number(totals.taxable || 0).toFixed(dp)}</span>
              </div>
            )}
            {config?.taxEnabled && totals.tax > 0 && (
              <div className="row">
                <span>Tax Amount:</span>
                <span>{sym}{Number(totals.tax).toFixed(dp)}</span>
              </div>
            )}
            {roundOff !== 0 && (
              <div className="row">
                <span>Round Off:</span>
                <span>{roundOff > 0 ? '+' : ''}{sym}{Number(Math.abs(roundOff)).toFixed(dp)}</span>
              </div>
            )}
            <div className="row total-row">
              <span>Grand Total:</span>
              <strong>{sym}{Number(payable || 0).toFixed(dp)}</strong>
            </div>
          </SummaryDetails>
          {isCompleted && (
            <FooterControls>
              {discountsEnabled && (
                <DiscountBtn type="button" onClick={() => setShowDiscountModal(true)}>
                  {totals.discount > 0 ? `Edit Discounts (${sym}${Number(totals.discount).toFixed(dp)})` : 'Apply Discount'}
                </DiscountBtn>
              )}
              {roundOffEnabled && roundOffMode === 'manual' && (
                <RoundOffField style={{ maxWidth: 'none' }}>
                  Desired Final Amount
                  <input
                    type="number"
                    step="any"
                    value={manualFinalAmount}
                    onChange={(event) => setManualFinalAmount(event.target.value)}
                    placeholder="Enter final amount..."
                  />
                </RoundOffField>
              )}
              {roundOffEnabled && roundOffMode === 'automatic' && roundOff !== 0 && (
                <RoundOffField style={{ maxWidth: 'none' }}>
                  Round Off (Auto)
                  <input type="number" step="any" value={roundOff.toFixed(dp)} readOnly style={{ background: '#f8fafc', color: '#64748b' }} />
                </RoundOffField>
              )}
            </FooterControls>
          )}
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
            themeColor="#f97316"
            themeSoftColor="#fff7ed"
            themeDarkColor="#ea580c"
          />
        </div>
      )}
      {discountsEnabled && showDiscountModal && (
        <ModalBackdrop 
          onMouseDown={(e) => { e.stopPropagation(); setShowDiscountModal(false); }} 
          onClick={(e) => { e.stopPropagation(); setShowDiscountModal(false); }}
        >
          <DiscountModalContent 
            onMouseDown={(e) => e.stopPropagation()} 
            onClick={e => e.stopPropagation()}
          >
            <DiscountModalHeader>
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
                onMouseOver={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                aria-label="Close discounts modal"
              >
                <FaTimes size={10} />
              </button>
            </DiscountModalHeader>
            <DiscountTabHeader>
              <DiscountTabButton
                type="button"
                $active={discountModalTab === 'line'}
                $themeColor="#ea580c"
                onClick={() => setDiscountModalTab('line')}
              >
                Line Discounts
              </DiscountTabButton>
              <DiscountTabButton
                type="button"
                $active={discountModalTab === 'total'}
                $themeColor="#ea580c"
                onClick={() => setDiscountModalTab('total')}
              >
                Total Discount
              </DiscountTabButton>
            </DiscountTabHeader>
            <DiscountModalBody>
              {discountModalTab === 'line' ? (
                lines.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>
                    Add items to your cart first to apply discounts.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {lines.map(item => {
                      const key = item.cartKey;
                      const disc = localDiscounts[key] || { type: 'amount', value: 0 };
                      return (
                        <DiscountRow key={key}>
                          <DiscountRowInfo>
                            <span>{item.displayName || item.productName}</span>
                            <small>{sym}{Number(item.unitPrice || 0).toFixed(dp)} x {item.quantity}</small>
                          </DiscountRowInfo>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <DiscountInputWrapper $themeColor="#ea580c">
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
                            </DiscountInputWrapper>
                            <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                              <DiscUnitToggle 
                                type="button"
                                $active={disc.type === 'amount'} 
                                $themeColor="#ea580c"
                                onClick={() => {
                                  setLocalDiscounts(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], type: 'amount' }
                                  }));
                                }}
                              >
                                {sym}
                              </DiscUnitToggle>
                              <DiscUnitToggle 
                                type="button"
                                $active={disc.type === 'percentage'} 
                                $themeColor="#ea580c"
                                onClick={() => {
                                  setLocalDiscounts(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], type: 'percentage' }
                                  }));
                                }}
                              >
                                %
                              </DiscUnitToggle>
                            </div>
                          </div>
                        </DiscountRow>
                      );
                    })}
                  </div>
                )
              ) : (
                <div style={{ padding: '16px 0' }}>
                  <DiscountRow style={{ background: '#f8fafc', borderColor: '#edf2f7', justifyContent: 'space-between', padding: '12px 16px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>Total Discount</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DiscountInputWrapper $themeColor="#ea580c">
                        <input 
                          type="number"
                          min="0"
                          max={localOrderDiscountType === 'percentage' || localOrderDiscountType === 'percent' ? 100 : undefined}
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
                      </DiscountInputWrapper>
                      <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                        <DiscUnitToggle 
                          type="button"
                          $active={localOrderDiscountType === 'amount'} 
                          $themeColor="#ea580c"
                          onClick={() => setLocalOrderDiscountType('amount')}
                        >
                          {sym}
                        </DiscUnitToggle>
                        <DiscUnitToggle 
                          type="button"
                          $active={localOrderDiscountType === 'percentage' || localOrderDiscountType === 'percent'} 
                          $themeColor="#ea580c"
                          onClick={() => setLocalOrderDiscountType('percentage')}
                        >
                          %
                        </DiscUnitToggle>
                      </div>
                    </div>
                  </DiscountRow>
                </div>
              )}
            </DiscountModalBody>
            <DiscountModalFooter>
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
                  background: '#ea580c', 
                  fontWeight: '700', 
                  fontSize: '13px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
            </DiscountModalFooter>
          </DiscountModalContent>
        </ModalBackdrop>
      )}
    </Overlay>
  );
}
