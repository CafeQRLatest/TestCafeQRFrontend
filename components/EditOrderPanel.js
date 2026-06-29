import React, { useEffect, useMemo, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { FaChevronRight, FaMinus, FaPlus, FaSave, FaSearch, FaTimes, FaTrash, FaUtensils } from 'react-icons/fa';
import api from '../utils/api';
import { calculateOrderTotals } from '../utils/orderCalculations';
import VariantSelector from './VariantSelector';
import { useNotification } from '../context/NotificationContext';
import { isDiscountModuleEnabled } from '../utils/moduleVisibility';
import { useAuth } from '../context/AuthContext';

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
  border-bottom: 1px solid #f1f5f9;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-width: 0;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 14px;
    font-weight: 500;
    overflow-wrap: anywhere;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 10px;
    font-weight: 400;
    margin-top: 1px;
    letter-spacing: 0.5px;
  }
`;

const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 4px;
  border-radius: 4px;
  &:hover {
    color: #ef4444;
    background: #f1f5f9;
  }
`;

const Body = styled.div`
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 16px;
  padding: 16px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
    padding: 12px;
  }
`;

const Section = styled.section`
  min-height: 0;
  background: white;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const SectionHead = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: grid;
  gap: 8px;

  strong {
    color: #334155;
    font-size: 14px;
    font-weight: 500;
  }
`;

const SearchBox = styled.div`
  position: relative;

  svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 13px;
  }

  input {
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 12px 10px 34px;
    font-weight: 400;
    color: #0f172a;
    outline: none;
    font-size: 13px;
    transition: all 0.2s ease;
    &:focus {
      border-color: #f97316;
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
    }
  }
`;

const ScrollList = styled.div`
  overflow-y: auto;
  min-height: 0;
  padding: 12px;
  display: grid;
  gap: 8px;
`;

const ProductButton = styled.button`
  border: 1px solid #f1f5f9;
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  min-width: 0;
  transition: all 0.2s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  strong {
    display: block;
    color: #0f172a;
    font-size: 13px;
    font-weight: 500;
  }

  span {
    display: block;
    margin-top: 2px;
    color: #64748b;
    font-size: 11px;
    font-weight: 400;
  }
`;

const ProductAction = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: #f97316;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
`;

const LineRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
  transition: border-color 0.2s;

  &:hover {
    border-color: #e2e8f0;
  }

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
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 2px;
    color: #64748b;
    font-size: 11px;
    font-weight: 400;
  }
`;

const QtyGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;

  @media (max-width: 520px) {
    justify-content: space-between;
    width: 100%;
  }
`;

const QtyInput = styled.input`
  border: 0;
  background: transparent;
  color: #0f172a;
  font-size: 11px;
  font-weight: 500;
  width: 20px;
  text-align: center;
  padding: 0;
  margin: 0;
  outline: none;
  -moz-appearance: textfield;
  
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

const IconButton = styled.button`
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: ${props => props.$danger ? '#fee2e2' : 'white'};
  color: ${props => props.$danger ? '#dc2626' : '#475569'};
  border: ${props => props.$danger ? '0' : '1px solid #e2e8f0'};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${props => props.$danger ? '#fca5a5' : '#f1f5f9'};
    color: ${props => props.$danger ? '#b91c1c' : '#0f172a'};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const Footer = styled.div`
  background: white;
  border-top: 1px solid #f1f5f9;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
    padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  }
`;

const SummaryDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #64748b;
  min-width: 180px;

  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .total-row {
    color: #0f172a;
    font-size: 14px;
    font-weight: 500;
    margin-top: 4px;
    border-top: 1px dashed #e2e8f0;
    padding-top: 4px;
  }
`;

const SaveButton = styled.button`
  border: 0;
  border-radius: 10px;
  background: #f97316;
  color: white;
  min-height: 40px;
  padding: 0 18px;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s, transform 0.1s;

  &:hover:not(:disabled) {
    background: #ea580c;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  @media (max-width: 520px) {
    width: 100%;
    justify-content: center;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 400;
`;

const LoadingBubble = styled.div`
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 1390;
  transform: translate(-50%, -50%);
  padding: 10px 16px;
  border-radius: 10px;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-size: 13px;
  font-weight: 500;
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const DiscountBtn = styled.button`
  width: 100%;
  height: 36px;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
  background: white;
  color: #475569;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #0f172a;
  }
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const DiscountModalContent = styled.div`
  background: white;
  width: min(480px, 94vw);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${fadeIn} 0.2s ease-out;
`;

const DiscountModalHeader = styled.div`
  padding: 8px 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const DiscountTabHeader = styled.div`
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 0 16px;
`;

const DiscountTabButton = styled.button`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background: transparent;
  color: ${props => props.$active ? props.$themeColor : '#64748b'};
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  font-family: 'Outfit', sans-serif;
  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 25%;
    right: 25%;
    height: 3px;
    border-radius: 99px;
    background: ${props => props.$active ? props.$themeColor : 'transparent'};
    transition: all 0.2s;
  }
`;

const DiscountModalBody = styled.div`
  padding: 16px 20px;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DiscountModalFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #edf2f7;
  display: flex;
  gap: 10px;
`;

const DiscountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #edf2f7;
`;

const DiscountRowInfo = styled.div`
  flex: 1;
  min-width: 0;
  span {
    display: block;
    font-weight: 700;
    font-size: 13px;
    color: #1e293b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
  }
`;

const DiscountInputWrapper = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  padding: 2px;
  height: 32px;
  &:focus-within {
    border-color: ${props => props.$themeColor};
  }
`;

const DiscUnitToggle = styled.button`
  border: none;
  background: ${props => props.$active ? props.$themeColor : 'transparent'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  width: 22px;
  height: 22px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  &:hover {
    background: ${props => props.$active ? props.$themeColor : '#f1f5f9'};
  }
`;

const RoundOffField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  width: 100%;
  max-width: 180px;

  input {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 10px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    outline: none;
    background: white;
    transition: all 0.2s ease;
    &:focus {
      border-color: #f97316;
    }
  }
`;

const FooterControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
  
  @media (max-width: 520px) {
    width: 100%;
  }
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

  const hasManualFields = 
    line.manualDiscountPercent !== undefined || 
    line.manual_discount_percent !== undefined || 
    line.manualDiscountAmount !== undefined || 
    line.manual_discount_amount !== undefined;

  let discPercent = 0;
  let discAmount = 0;

  if (hasManualFields) {
    discPercent = toNumber(line.manualDiscountPercent ?? line.manual_discount_percent ?? 0);
    discAmount = toNumber(line.manualDiscountAmount ?? line.manual_discount_amount ?? 0);
  } else {
    discPercent = toNumber(line.discountPercent ?? line.discount_percent ?? 0);
    discAmount = toNumber(line.discountAmount ?? line.discount_amount ?? 0);
  }

  let initialType = 'amount';
  let initialVal = 0;
  if (discPercent > 0) {
    initialType = 'percent';
    initialVal = discPercent;
  } else if (discAmount > 0) {
    initialType = 'amount';
    initialVal = discAmount;
  } else if (line.discount) {
    initialType = line.discount.type || 'amount';
    initialVal = line.discount.value || 0;
  }

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
    discount_percent: initialType === 'percent' ? initialVal : 0,
    discount_amount: initialType === 'amount' ? initialVal : 0,
    discount: { type: initialType, value: initialVal },
    originalQuantity: toNumber(line.quantity || line.qty || 1) || 1,
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
    discount_percent: 0,
    discount_amount: 0,
    discount: { type: 'amount', value: 0 },
    originalQuantity: 0,
  };
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

  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState(0);
  const [manualFinalAmount, setManualFinalAmount] = useState('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [localDiscounts, setLocalDiscounts] = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab] = useState('line'); // 'line' | 'total'

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
      return { total_amount: 0, total_tax: 0, total_inc_tax: 0, line_subtotal: 0, processed_items: [] };
    }
    const isCompleted = fullOrder?.orderStatus === 'COMPLETED' || fullOrder?.order_status === 'COMPLETED';

    const activeDiscountType = isCompleted ? discountType : 'amount';
    const activeDiscountVal = isCompleted ? discountValue : 0;

    const baseCalculated = calculateOrderTotals(
      lines.map((line) => ({
        id: line.cartKey,
        productId: line.productId,
        name: line.displayName || line.productName,
        price: line.unitPrice,
        quantity: toNumber(line.quantity),
        tax_rate: (line.taxRate !== undefined && line.taxRate !== null && line.taxRate !== '') ? Number(line.taxRate) : null,
        is_packaged_good: line.isPackagedGood,
        is_packaged: line.isPackagedGood,
        discount_percent: line.discount_percent,
        discount_amount: line.discount_amount,
        discount: line.discount,
      })),
      { type: activeDiscountType, value: activeDiscountVal },
      {
        gst_enabled: config?.taxEnabled,
        default_tax_rate: (() => {
          if (!config?.taxEnabled) return 0;
          const rates = config?.taxRates || [];
          const def = rates.find(r => r.id === config?.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config?.pricesIncludeTax,
        currencyDecimalPlaces: config?.currencyDecimalPlaces,
        round_off_config: {
          round_off_enabled: false,
        },
      }
    );

    const roundOffEnabled = Boolean(config?.roundOffEnabled);
    const roundOffMode = config?.roundOffMode || 'automatic';
    const roundOffAutoFactor = Number(config?.roundOffAutoFactor ?? 1);
    const dp = config?.currencyDecimalPlaces ?? 2;

    let roundOffAmount = 0;
    if (isCompleted && roundOffEnabled) {
      if (roundOffMode === 'manual') {
        if (manualFinalAmount !== '' && !isNaN(Number(manualFinalAmount))) {
          roundOffAmount = Number((Number(manualFinalAmount) - baseCalculated.total_inc_tax).toFixed(dp));
        }
      } else if (roundOffMode === 'automatic') {
        const factor = roundOffAutoFactor > 0 ? roundOffAutoFactor : 1;
        const cleanBase = baseCalculated.total_inc_tax || 0;
        const rounded = Math.round(cleanBase / factor) * factor;
        roundOffAmount = Number((rounded - cleanBase).toFixed(dp));
      }
    }

    const finalPayable = Number((baseCalculated.total_inc_tax + roundOffAmount).toFixed(dp));

    return {
      ...baseCalculated,
      round_off_amount: roundOffAmount,
      total_amount: finalPayable,
    };
  }, [config, lines, fullOrder, discountType, discountValue, manualFinalAmount]);

  const baseCalculatedPayable = useMemo(() => {
    if (!lines.length) return 0;
    const isCompleted = fullOrder?.orderStatus === 'COMPLETED' || fullOrder?.order_status === 'COMPLETED';
    const activeDiscountType = isCompleted ? discountType : 'amount';
    const activeDiscountVal = isCompleted ? discountValue : 0;

    return calculateOrderTotals(
      lines.map((line) => ({
        id: line.cartKey,
        productId: line.productId,
        name: line.displayName || line.productName,
        price: line.unitPrice,
        quantity: toNumber(line.quantity),
        tax_rate: (line.taxRate !== undefined && line.taxRate !== null && line.taxRate !== '') ? Number(line.taxRate) : null,
        is_packaged_good: line.isPackagedGood,
        is_packaged: line.isPackagedGood,
        discount_percent: line.discount_percent,
        discount_amount: line.discount_amount,
        discount: line.discount,
      })),
      { type: activeDiscountType, value: activeDiscountVal },
      {
        gst_enabled: config?.taxEnabled,
        default_tax_rate: (() => {
          if (!config?.taxEnabled) return 0;
          const rates = config?.taxRates || [];
          const def = rates.find(r => r.id === config?.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config?.pricesIncludeTax,
        currencyDecimalPlaces: config?.currencyDecimalPlaces,
        round_off_config: {
          round_off_enabled: false,
        },
      }
    ).total_inc_tax;
  }, [config, lines, fullOrder, discountType, discountValue]);

  useEffect(() => {
    if (config?.roundOffEnabled && config?.roundOffMode === 'manual') {
      const dp = config?.currencyDecimalPlaces ?? 2;
      setManualFinalAmount(baseCalculatedPayable.toFixed(dp));
    }
  }, [baseCalculatedPayable, config]);

  const isCompleted = fullOrder?.orderStatus === 'COMPLETED' || fullOrder?.order_status === 'COMPLETED';
  const discountsEnabled = isDiscountModuleEnabled(config);
  const roundOffEnabled = Boolean(config?.roundOffEnabled);
  const roundOffMode = config?.roundOffMode || 'automatic';
  const dp = config?.currencyDecimalPlaces ?? 2;

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
          taxRate: toNumber(item.taxRate || item.tax_rate),
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
          discount_percent: 0,
          discount_amount: 0,
          discount: { type: 'amount', value: 0 },
          originalQuantity: 0,
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
          return { ...line, quantity: nextQty };
        }
        return line;
      })
      .filter((line) => {
        if (line.quantity <= 0 && line.originalQuantity > 0 && !canDeleteOrderItem) {
          notify('error', 'You do not have permission to delete an existing item');
          return true; // Keep it
        }
        return line.quantity > 0;
      }));
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
    const gstEnabled = Boolean(config?.taxEnabled);
    const dp = config?.currencyDecimalPlaces ?? 2;

    const processedLines = (totals.processed_items || []).map((processed, index) => {
      const original = lines.find((line) => line.cartKey === processed.id) || lines[index];
      const quantity = toNumber(processed.quantity || original?.quantity || 1) || 1;
      const unitPrice = toNumber(processed.unit_price ?? original?.unitPrice);
      const taxRatePct = Number(toNumber(processed.tax_rate || original?.taxRate).toFixed(2));
      const isInclusive = gstEnabled && (Boolean(original?.isPackagedGood) || Boolean(config?.pricesIncludeTax));

      // Resolve tax code/name snapshot from config rates
      const matchedRate = (config?.taxRates || []).find(r => parseFloat(r.value) === taxRatePct);
      const taxCode = gstEnabled && taxRatePct > 0 ? (matchedRate?.code || `GST_${taxRatePct}`) : null;
      const taxName = gstEnabled && taxRatePct > 0 ? (matchedRate?.name || `GST ${taxRatePct}%`) : null;

      const hasLineDiscount = original?.discount && original.discount.value > 0;
      const isPercentLineDisc = hasLineDiscount && (original.discount.type === 'percent' || original.discount.type === 'percentage');
      const manualDiscountAmount = hasLineDiscount && !isPercentLineDisc ? Number(original.discount.value) : null;
      const manualDiscountPercent = hasLineDiscount && isPercentLineDisc ? Number(original.discount.value) : null;

      return {
        productId: original?.productId || null,
        variantId: original?.variantId || null,
        productName: original?.displayName || original?.productName || processed.item_name || 'Item',
        categoryName: original?.categoryName || null,
        isPackagedGood: Boolean(original?.isPackagedGood),
        quantity,
        unitPrice: Number(unitPrice.toFixed(dp)),
        unitOfMeasure: original?.unitOfMeasure || 'units',
        taxRate: taxRatePct,
        taxAmount: Number(toNumber(processed.tax_amount).toFixed(dp)),
        discountAmount: Number(toNumber(processed.discount_amount).toFixed(dp)),
        lineTotal: Number(toNumber(processed.line_total || unitPrice * quantity).toFixed(dp)),

        // ─── GST Enrichment fields (V1_110) ───────────────────────────
        grossLineAmount:        Number((unitPrice * quantity).toFixed(dp)),
        unitPriceExTax:         Number((processed.unit_price_ex_tax || processed.unit_price_ex_tax_orig || 0).toFixed(dp + 2)),
        taxableAmount:          Number((processed.taxable_amount || 0).toFixed(dp)),
        taxType:                isInclusive ? 'INCLUSIVE' : (gstEnabled && taxRatePct > 0 ? 'EXCLUSIVE' : 'NONE'),
        taxSnapshotRate:        taxRatePct,
        taxCode,
        taxName,
        manualDiscountAmount,
        manualDiscountPercent,
        allocatedOrderDiscount: Number((processed.order_discount_share || 0).toFixed(dp)),
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
      grandTotal: Number(toNumber(totals.total_amount).toFixed(dp)),
      totalTaxAmount: Number(toNumber(totals.total_tax).toFixed(dp)),
      totalAmount: Number(toNumber(totals.total_inc_tax).toFixed(dp)),
      totalDiscountAmount: Number(toNumber(totals.discount_amount).toFixed(dp)),
      roundOffAmount: Number(toNumber(totals.round_off_amount).toFixed(dp)),
      // ─── GST Discount Engine order-level fields (V1_110) ───────────
      grossAmount:        Number((totals.gross_face_total || 0).toFixed(dp)),
      orderDiscountType:  isCompleted ? (discountType === 'percentage' || discountType === 'percent' ? 'PERCENT' : 'AMOUNT') : 'AMOUNT',
      orderDiscountValue: isCompleted ? Number(discountValue || 0) : 0,
      discountSource:     fullOrder?.discountSource || 'MANUAL',
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
                        <strong>{product.name}</strong>
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
              <span>{sym}{Number(totals.gross_face_total || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
            </div>
            {totals.discount_amount > 0 && (
              <div className="row" style={{ color: '#dc2626' }}>
                <span>Discount:</span>
                <span>-{sym}{Number(totals.discount_amount).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
              </div>
            )}
            {config?.taxEnabled && totals.taxable_amount > 0 && (
              <div className="row">
                <span>Subtotal:</span>
                <span>{sym}{Number(totals.taxable_amount || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
              </div>
            )}
            {config?.taxEnabled && totals.total_tax > 0 && (
              <div className="row">
                <span>Tax Amount:</span>
                <span>{sym}{Number(totals.total_tax).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
              </div>
            )}
            {totals.round_off_amount !== 0 && (
              <div className="row">
                <span>Round Off:</span>
                <span>{totals.round_off_amount > 0 ? '+' : ''}{sym}{Number(Math.abs(totals.round_off_amount)).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
              </div>
            )}
            <div className="row total-row">
              <span>Grand Total:</span>
              <strong>{sym}{Number(totals.total_amount || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}</strong>
            </div>
          </SummaryDetails>
          {isCompleted && (
            <FooterControls>
              {discountsEnabled && (
                <DiscountBtn type="button" onClick={() => setShowDiscountModal(true)}>
                  {totals.discount_amount > 0 ? `Edit Discounts (${sym}${Number(totals.discount_amount).toFixed(dp)})` : 'Apply Discount'}
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
              {roundOffEnabled && roundOffMode === 'automatic' && totals.round_off_amount !== 0 && (
                <RoundOffField style={{ maxWidth: 'none' }}>
                  Round Off (Auto)
                  <input type="number" step="any" value={totals.round_off_amount.toFixed(dp)} readOnly style={{ background: '#f8fafc', color: '#64748b' }} />
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
