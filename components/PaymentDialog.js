import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaBook, FaPlus, FaTimes, FaWallet, FaMoneyBillWave, FaQrcode, FaCreditCard, FaLayerGroup, FaStore } from 'react-icons/fa';
import { calculateOrderTotals } from '../utils/orderCalculations';
import { isDiscountModuleEnabled } from '../utils/moduleVisibility';
import NiceSelect from './NiceSelect';
import CreditCustomerQuickCreateModal from './CreditCustomerQuickCreateModal';
import { fetchSalesPaymentTypes } from '../services/paymentApi';
import { cartKeyFor } from './CounterSale/domain/cart';
import {
  THEMES,
  Overlay, Card,
  Header, CloseButton,
  TotalBanner, Breakdown, Row,
  FieldGrid, Field,
  SplitPanel, SplitRow, IconButton, SplitFooter,
  CreditPanel, CreditLabel, CreditPickerRow, NewCreditButton,
  MethodGrid, MethodButton,
  Actions, Button, ErrorText, DiscountBtn,
  ModalBackdrop, DiscountModalContent, DiscountModalHeader,
  DiscountTabHeader, DiscountTabButton,
  DiscountModalBody, DiscountModalFooter,
  DiscountRow, DiscountRowInfo, DiscountInputWrapper, DiscUnitToggle,
} from './PaymentDialog.styles';



const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getMethodIcon = (val, ptType) => {
  const v = String(val || '').toUpperCase();
  if (v === 'CASH') return <FaMoneyBillWave style={{ fontSize: '14px', color: '#16a34a' }} />;
  if (v === 'ONLINE' || v === 'UPI' || v === 'QR CODE') return <FaQrcode style={{ fontSize: '14px', color: '#0284c7' }} />;
  if (v === 'CARD') return <FaCreditCard style={{ fontSize: '14px', color: '#6366f1' }} />;
  if (ptType === 'CREDIT' || v.includes('CREDIT')) return <FaBook style={{ fontSize: '14px', color: '#d97706' }} />;
  if (v === 'MIXED') return <FaLayerGroup style={{ fontSize: '14px', color: '#ea580c' }} />;
  return <FaStore style={{ fontSize: '14px', color: '#64748b' }} />;
};

export default function PaymentDialog({ 
  order, 
  loading = false, 
  config = null, 
  creditCustomers = [], 
  onClose, 
  onConfirm, 
  onCreditCustomerCreated,
  themeColor = 'orange',
  disableEditDiscount = false
}) {
  const dp = Number(config?.currencyDecimalPlaces ?? 2);
  const sym = config?.currencySymbol || '₹';
  const money = useCallback((value) => `${sym}${Number(value || 0).toFixed(dp)}`, [dp, sym]);

  const createInitialSplits = () => {
    return [
      { paymentMethod: 'CASH', amount: '', referenceNo: '' },
      { paymentMethod: 'ONLINE', amount: '', referenceNo: '' },
    ];
  };

  const theme = THEMES[themeColor] || THEMES.orange;
  const creditEnabled = Boolean(config?.creditEnabled);
  const roundOffEnabled = Boolean(config?.roundOffEnabled);
  const roundOffMode = String(config?.roundOffMode || 'automatic').toLowerCase();
  const roundOffAutoFactor = Number(config?.roundOffAutoFactor ?? 1);
  const roundOffManualLimit = Number(config?.roundOffManualLimit ?? 10);
  const discountsEnabled = isDiscountModuleEnabled(config);

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentSplits, setPaymentSplits] = useState([]);
  const [creditCustomerId, setCreditCustomerId] = useState(order?.creditCustomerId || order?.credit_customer_id || '');
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);
  const [paymentTypes, setPaymentTypes] = useState([]);

  useEffect(() => {
    let active = true;
    fetchSalesPaymentTypes(null)
      .then(data => {
        if (active) setPaymentTypes(data);
      })
      .catch(err => {
        console.error('Failed to load active sales payment types:', err);
      });
    return () => { active = false; };
  }, []);

  const selectOptions = useMemo(() => {
    const list = paymentTypes.length > 0 ? paymentTypes : [
      { displayName: 'Cash', paymentType: 'OTHERS', sales: 'Y', isactive: 'Y' },
      { displayName: 'Online', paymentType: 'OTHERS', sales: 'Y', isactive: 'Y' },
      { displayName: 'Credit', paymentType: 'CREDIT', sales: 'Y', isactive: 'Y' }
    ];

    const filtered = list.filter(pt => {
      const act = pt.isActive ?? pt.isactive ?? 'Y';
      if (act !== 'Y') return false;
      if (pt.sales !== 'Y') return false;
      if (pt.paymentType === 'CREDIT' && !creditEnabled) return false;
      if (pt.displayName?.toUpperCase() === 'MIXED') return false;
      return true;
    });

    const mapped = filtered.map(pt => ({
      value: pt.displayName.toUpperCase(),
      label: pt.displayName + (pt.paymentType === 'CREDIT' ? ' (Credit Ledger)' : ''),
      paymentType: pt.paymentType
    }));

    mapped.push({ value: 'MIXED', label: 'Mixed / Split Payment', paymentType: 'OTHERS' });
    return mapped;
  }, [paymentTypes, creditEnabled]);


  useEffect(() => {
    if (selectOptions.length > 0) {
      const hasCurrent = selectOptions.some(o => o.value === paymentMethod);
      if (!hasCurrent) {
        setPaymentMethod(selectOptions[0].value);
      }
    }
  }, [selectOptions, paymentMethod]);

  // Discount Modal States
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [localDiscounts, setLocalDiscounts] = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab] = useState('line'); // 'line' | 'total'

  const [cartItems, setCartItems] = useState([]);
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState(0);


  const toCartItems = (lines) => {
    return (lines || []).map((line, index) => {
      const price = toNumber(line.unitPrice ?? line.unit_price ?? line.price ?? 0);
      const qty = toNumber(line.quantity ?? line.qty ?? 1) || 1;
      const key = line.cartKey || line.id || `${line.productId || 'line'}-${line.variantId || 'base'}-${index}`;
      
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
      }

      return {
        ...line,
        cartKey: key,
        displayName: line.productName || line.product_name || line.name || 'Item',
        price,
        qty,
        discount_percent: initialType === 'percent' ? initialVal : 0,
        discount_amount: initialType === 'amount' ? initialVal : 0,
        discount: { type: initialType, value: initialVal },
      };
    });
  };

  // Seed the cart and discounts on startup
  useEffect(() => {
    if (order) {
      const items = toCartItems(order.lines || []);
      setCartItems(items);

      const ordDiscType =
        order.orderDiscountType ??
        order.order_discount_type ??
        order.orderDiscount?.type ??
        'AMOUNT';

      const ordDiscVal =
        order.orderDiscountValue ??
        order.order_discount_value ??
        order.orderDiscount?.value ??
        0;

      setDiscountType(
        String(ordDiscType).toUpperCase() === 'PERCENT'
          ? 'percent'
          : 'amount'
      );

      setDiscountValue(Number(ordDiscVal || 0));
    }
  }, [order]);

  // Sync state with local states when discount modal opens
  useEffect(() => {
    if (showDiscountModal && cartItems.length > 0) {
      const initial = {};
      cartItems.forEach(item => {
        const key = cartKeyFor(item);
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
  }, [showDiscountModal, cartItems, discountType, discountValue]);

  const baseTotal = Number(order?.grandTotal ?? order?.grand_total ?? order?.totalAmount ?? order?.total_amount ?? 0);

  // Compute reactive totals
  const totals = useMemo(() => {
    if (cartItems.length === 0) return null;

    const isCreditPayment = paymentMethod === 'CREDIT';

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
      isCredit: isCreditPayment,
      round_off_config: {
        round_off_enabled: isCreditPayment ? false : roundOffEnabled,
        round_off_mode: roundOffMode,
        round_off_auto_factor: roundOffAutoFactor,
      }
    };

    const calculated = calculateOrderTotals(
      cartItems.map((line) => ({
        clientLineId: line.clientLineId ?? line.id ?? line.cartKey,
        id: line.cartKey,
        productId: line.productId,
        name: line.displayName,
        price: line.price,
        quantity: line.qty,
        tax_rate: (line.taxRate !== undefined && line.taxRate !== null && line.taxRate !== '') ? Number(line.taxRate) : ((line.tax_rate !== undefined && line.tax_rate !== null && line.tax_rate !== '') ? Number(line.tax_rate) : null),
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

    const originalByClientLineId = new Map(
      cartItems.map(item => [item.clientLineId ?? item.id ?? item.cartKey, item])
    );

    const processedLines = (calculated.processed_items || []).map((processed) => {
      const original = originalByClientLineId.get(processed.clientLineId);
      if (!original) {
        throw new Error("Line mapping integrity error: clientLineId mismatch in PaymentDialog calculations.");
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
  }, [cartItems, discountType, discountValue, config, roundOffEnabled, roundOffMode, roundOffAutoFactor, dp]);

  // Derived values from calculated totals
  const activeBasePayable = totals ? totals.basePayable : baseTotal;
  const gross = totals ? totals.grossTotal : baseTotal;
  const disc = totals ? totals.discount : Number(order?.totalDiscountAmount ?? 0);
  const tax = totals ? totals.tax : Number(order?.totalTaxAmount ?? 0);
  const taxableSubtotal = totals ? totals.taxable : Math.max(0, gross - disc - tax);
  const taxLabel = config?.pricesIncludeTax ? 'Tax (Incl.)' : 'Tax (Excl.)';
  const subtotal = Math.max(0, gross - disc);

  const [manualFinalAmount, setManualFinalAmount] = useState('');

  // Sync manual final amount with activeBasePayable when it changes
  useEffect(() => {
    if (roundOffMode === 'manual') {
      setManualFinalAmount(activeBasePayable.toFixed(dp));
    }
  }, [activeBasePayable, roundOffMode, dp]);

  const isCreditPayment = paymentMethod === 'CREDIT';

  const roundOff = useMemo(() => {
    if (!roundOffEnabled || isCreditPayment) return 0;
    if (roundOffMode === 'automatic') {
      return totals ? totals.autoRoundOff : 0;
    } else { // manual
      if (!manualFinalAmount || isNaN(Number(manualFinalAmount))) {
        return 0;
      }
      return Number((Number(manualFinalAmount) - activeBasePayable).toFixed(dp));
    }
  }, [roundOffEnabled, isCreditPayment, roundOffMode, totals, manualFinalAmount, activeBasePayable, dp]);

  // Payable = clean base + round-off (whatever mode)
  const payable = (roundOffEnabled && !isCreditPayment)
    ? (roundOffMode === 'manual' && manualFinalAmount !== '' && !isNaN(Number(manualFinalAmount))
        ? Number(Number(manualFinalAmount).toFixed(dp))
        : Number((activeBasePayable + roundOff).toFixed(dp)))
    : Number(activeBasePayable.toFixed(dp));

  const isRoundOffValid = useMemo(() => {
    if (!roundOffEnabled) return true;
    if (roundOffMode === 'manual') {
      return Math.abs(roundOff) <= roundOffManualLimit;
    }
    return true;
  }, [roundOffEnabled, roundOffMode, roundOff, roundOffManualLimit]);

  const isDiscountValid = true; // Fully managed inside the discount modal!

  const isCreditSelected = useMemo(() => {
    const currentOpt = selectOptions.find(o => o.value === paymentMethod);
    return currentOpt?.paymentType === 'CREDIT';
  }, [paymentMethod, selectOptions]);

  const mixedTotal = paymentSplits.reduce((sum, split) => sum + toNumber(split.amount), 0);
  const selectedSplitMethods = paymentSplits.map((split) => split.paymentMethod).filter(Boolean);
  const hasDuplicateSplitMethod = new Set(selectedSplitMethods).size !== selectedSplitMethods.length;
  const hasInvalidSplitRow = paymentSplits.some((split) => !split.paymentMethod || toNumber(split.amount) < 0);
  const activeSplitsCount = paymentSplits.filter(split => toNumber(split.amount) > 0).length;
  const isMixedNotSplit = paymentMethod === 'MIXED' && activeSplitsCount < 2;
  const mixedInvalid = paymentMethod === 'MIXED'
    && (paymentSplits.length === 0 || hasDuplicateSplitMethod || hasInvalidSplitRow || Math.abs(mixedTotal - payable) > 0.01 || isMixedNotSplit);
  const creditInvalid = isCreditSelected && !creditCustomerId;
  const creditCustomerOptions = useMemo(
    () => creditCustomers.map((customer) => ({
      value: customer.id,
      label: `${customer.name || 'Credit Customer'}${customer.phone ? ` (${customer.phone})` : ''} - ${money(customer.balance)}`,
    })),
    [creditCustomers, money]
  );

  const creditLimitWarning = useMemo(() => {
    if (!isCreditSelected || !creditCustomerId) return '';
    const customer = creditCustomers.find(c => String(c.id) === String(creditCustomerId));
    if (!customer) return '';
    const limit = Number(customer.creditLimit || 0);
    if (limit <= 0) return '';
    const currentBalance = Number(customer.balance || 0);
    const orderTotal = Number(payable || 0);
    const projected = currentBalance + orderTotal;
    if (projected > limit) {
      return `Credit limit warning: projected balance ${sym}${projected.toFixed(dp)} exceeds ${sym}${limit.toFixed(dp)}.`;
    }
    return '';
  }, [isCreditSelected, creditCustomerId, creditCustomers, payable, sym, dp]);

  const handleCreditCustomerCreated = (customer) => {
    if (!customer?.id) return;
    setCreditCustomerId(customer.id);
    onCreditCustomerCreated?.(customer);
  };

  const chooseMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'MIXED') {
      setPaymentSplits((current) => current.length > 0 ? current : createInitialSplits());
    } else if (method !== 'MIXED') {
      setPaymentSplits([]);
    }
  };

  const updateSplit = (index, field, value) => {
    if (field === 'amount') {
      const typed = toNumber(value);
      const remaining = Number(Math.max(0, payable - typed).toFixed(dp));
      setPaymentSplits((current) =>
        current.map((split, currentIndex) => {
          if (currentIndex === index) return { ...split, amount: value };
          if (current.length === 2) {
            return { ...split, amount: String(remaining) };
          }
          return split;
        })
      );
    } else {
      setPaymentSplits((current) => current.map((split, currentIndex) => (
        currentIndex === index ? { ...split, [field]: value } : split
      )));
    }
  };

  const handleApplyDiscounts = () => {
    if (!discountsEnabled) return;

    setCartItems(prev => prev.map(item => {
      const key = cartKeyFor(item);
      const disc = localDiscounts[key];
      if (disc) {
        if (disc.type === 'percentage') {
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

  const submit = () => {
    if (mixedInvalid || creditInvalid || !isRoundOffValid) return;
    const finalRoundOff = roundOffEnabled ? roundOff : 0;
    const finalOrder = totals ? {
      ...order,
      lines: totals.processedLines.map(line => ({
        id: line.id,
        clientLineId: line.clientLineId || line.id || null,
        productId: line.productId || line.id,
        variantId: line.variantId || null,
        productName: line.displayName || line.productName || line.name || 'Item',
        unitPrice: line.price,
        quantity: line.quantity ?? line.qty,
        taxRate: (line.taxRate !== undefined && line.taxRate !== null && line.taxRate !== '') ? Number(line.taxRate) : null,
        discount: line.discount,
        unitOfMeasure: line.unitOfMeasure || null,
        description: line.description || null,
        isPackagedGood: line.isPackagedGood === true || line.is_packaged_good === true,
        // Enriched line-level tax/discount fields (intent/snapshots only)
        taxType: line.taxType,
        taxSnapshotRate: line.taxSnapshotRate,
        taxCode: line.taxCode,
        taxName: line.taxName,
        manualDiscountAmount: line.manualDiscountAmount,
        manualDiscountPercent: line.manualDiscountPercent,
      })),
      orderDiscount: discountsEnabled ? { type: discountType, value: discountValue } : { type: 'amount', value: 0 },
      // Enriched order-level tax/discount fields (intent/snapshots only)
      orderDiscountType: discountType === 'percentage' || discountType === 'percent' ? 'PERCENT' : 'AMOUNT',
      orderDiscountValue: Number(discountValue || 0),
      discountSource: 'MANUAL',
      requestedRoundOff:
        roundOffEnabled && roundOffMode === 'manual'
          ? Number(finalRoundOff.toFixed(dp))
          : null,
      roundOffMode:
        roundOffEnabled
          ? roundOffMode.toUpperCase()
          : 'DISABLED',
    } : null;

    if (isCreditSelected) {
      onConfirm?.({
        paymentMethod,
        creditCustomerId,
        amountPaid: 0,
        discountAmount: Number(disc.toFixed(dp)),
        roundOffAmount: Number(finalRoundOff.toFixed(dp)),
        updatedOrder: finalOrder, // Send modified lines & totals back to host first!
      });
      return;
    }
    const normalizedSplits = paymentMethod === 'MIXED'
      ? paymentSplits.map((split) => ({
          paymentMethod: split.paymentMethod,
          amount: Number(toNumber(split.amount).toFixed(dp)),
          referenceNo: split.referenceNo?.trim() || null,
        }))
      : [];
    const cashAmount = normalizedSplits
      .filter((split) => split.paymentMethod === 'CASH')
      .reduce((sum, split) => sum + split.amount, 0);
    const nonCashAmount = normalizedSplits
      .filter((split) => split.paymentMethod !== 'CASH')
      .reduce((sum, split) => sum + split.amount, 0);
    onConfirm?.({
      paymentMethod,
      amountPaid: Number(payable.toFixed(dp)),
      cashAmount: paymentMethod === 'MIXED' ? Number(cashAmount.toFixed(dp)) : null,
      onlineAmount: paymentMethod === 'MIXED' ? Number(nonCashAmount.toFixed(dp)) : null,
      paymentSplits: normalizedSplits,
      discountAmount: Number(disc.toFixed(dp)),
      roundOffAmount: Number(finalRoundOff.toFixed(dp)),
      updatedOrder: finalOrder, // Send modified lines & totals back to host first!
    });
  };

  if (!order) return null;

  return (
    <Overlay onMouseDown={onClose}>
      <Card onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <div>
            <h2>Payment Collection</h2>
            <span>{order.orderNo || order.order_no || `#${String(order.id || '').slice(0, 8)}`} - {order.tableNumber || order.table_number || 'Counter'}</span>
          </div>
          <CloseButton type="button" onClick={onClose} aria-label="Close payment dialog">
            <FaTimes />
          </CloseButton>
        </Header>

        <TotalBanner $theme={theme}>
          <span>Settled Total</span>
          <strong>{money(payable)}</strong>
        </TotalBanner>

        <Breakdown>
          <Row><span>Gross Total</span><strong>{money(gross)}</strong></Row>
          {disc > 0 && <Row style={{ color: '#dc2626' }}><span>Discount</span><strong>-{money(disc)}</strong></Row>}
          {config?.taxEnabled && <Row><span>Subtotal</span><strong>{money(taxableSubtotal)}</strong></Row>}
          {config?.taxEnabled && <Row><span>Tax Amount</span><strong>{money(tax)}</strong></Row>}
          {roundOffEnabled && !isCreditPayment && roundOff !== 0 && (
            <Row style={{ color: roundOff >= 0 ? '#16a34a' : '#dc2626' }}>
              <span>Round Off{roundOffMode === 'manual' ? ' (Manual)' : ''}</span>
              <strong>{roundOff > 0 ? '+' : ''}{money(roundOff)}</strong>
            </Row>
          )}
          <Row style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '6px', marginTop: '2px' }}>
            <span>Grand Total</span><strong>{money(payable)}</strong>
          </Row>
        </Breakdown>

        {discountsEnabled && !disableEditDiscount && (
          <DiscountBtn type="button" onClick={() => setShowDiscountModal(true)} style={{ marginTop: '4px', height: '36px' }}>
            {disc > 0 ? `Edit Discounts (${money(disc)})` : 'Apply Discount'}
          </DiscountBtn>
        )}

        {!isCreditPayment && roundOffEnabled && roundOffMode === 'manual' && (
          <Field>
            Desired Final Amount
            <input
              type="number"
              step="any"
              value={manualFinalAmount}
              onChange={(event) => setManualFinalAmount(event.target.value)}
              placeholder="Enter final amount..."
            />
          </Field>
        )}
        {!isCreditPayment && roundOffEnabled && roundOffMode === 'automatic' && roundOff !== 0 && (
          <Field>
            Round Off (Auto)
            <input type="number" step="any" value={roundOff.toFixed(dp)} readOnly style={{ background: '#f8fafc', color: '#64748b' }} />
          </Field>
        )}

        <Field style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Payment Method</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>Select method</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            maxHeight: '190px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}>
            {selectOptions.map((opt) => {
              const isSelected = paymentMethod === opt.value;
              const displayLabel = opt.value === 'CREDIT' ? 'Credit Ledger' 
                : (opt.value === 'MIXED' ? 'Split Payment' 
                : (opt.displayName || opt.label.replace(' (Credit Ledger)', '').replace(' / Split Payment', '')));

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => chooseMethod(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid #ea580c' : '1.5px solid #e2e8f0',
                    background: isSelected ? '#fff7ed' : '#ffffff',
                    color: isSelected ? '#ea580c' : '#334155',
                    fontWeight: isSelected ? '700' : '600',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 3px 8px rgba(234, 88, 12, 0.18)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
                    lineHeight: '1.2'
                  }}
                >
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {displayLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        {isCreditSelected && (
          <CreditPanel>
            <CreditLabel>Credit Customer</CreditLabel>
            <CreditPickerRow>
              <NiceSelect
                value={creditCustomerId}
                onChange={setCreditCustomerId}
                placeholder="Choose customer..."
                options={creditCustomerOptions}
                maxHeight={320}
                style={{ height: 42, minWidth: 0 }}
              />
              <NewCreditButton type="button" onClick={() => setShowNewCreditCustomer(true)}>
                <FaPlus /> New
              </NewCreditButton>
            </CreditPickerRow>
            {creditLimitWarning && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: '#fff7ed',
                border: '1px solid #ffedd5',
                borderRadius: '8px',
                color: '#ea580c',
                fontSize: '12px',
                fontWeight: '600',
                lineHeight: '1.4',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ fontSize: '14px' }}>⚠️</span>
                {creditLimitWarning}
              </div>
            )}
          </CreditPanel>
        )}

        {paymentMethod === 'MIXED' && (
          <SplitPanel>
            {paymentSplits.map((split, index) => (
              <SplitRow key={`${split.paymentMethod}-${index}`} style={{ gridTemplateColumns: '1.1fr 1fr' }}>
                <Field>
                  Method
                  <div style={{
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    background: '#f1f5f9',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    color: '#0f172a',
                    border: '1.5px solid #e2e8f0',
                    userSelect: 'none'
                  }}>
                    {split.paymentMethod === 'CASH' ? 'Cash' : 'Online'}
                  </div>
                </Field>
                <Field>
                  Amount
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={split.amount}
                    placeholder="0.00"
                    onChange={(event) => updateSplit(index, 'amount', event.target.value)}
                  />
                </Field>
              </SplitRow>
            ))}
            <SplitFooter $theme={theme}>
              <span style={{ marginLeft: 'auto' }}>{money(mixedTotal)} / {money(payable)}</span>
            </SplitFooter>
          </SplitPanel>
        )}
        {mixedInvalid && (
          <ErrorText>
            {isMixedNotSplit
              ? `Mixed payment requires at least two payment methods with a non-zero amount. Total must equal ${money(payable)}.`
              : `Mixed payment split must be valid and equal ${money(payable)}.`}
          </ErrorText>
        )}
        {creditInvalid && (
          <ErrorText>Choose a credit customer to complete this order as credit.</ErrorText>
        )}
        {!isRoundOffValid && (
          <ErrorText>Manual round off must not exceed the limit of ±{sym}{roundOffManualLimit.toFixed(dp)}.</ErrorText>
        )}
 
        <Actions>
          <Button type="button" $theme={theme} disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" $theme={theme} $primary disabled={loading || mixedInvalid || creditInvalid || !isRoundOffValid} onClick={submit}>
            {loading ? 'Settling...' : isCreditSelected ? <><FaBook /> Complete as Credit</> : <><FaWallet /> Settle & Finish</>}
          </Button>
        </Actions>
        <CreditCustomerQuickCreateModal
          open={showNewCreditCustomer}
          themeColor="#14b8a6"
          onClose={() => setShowNewCreditCustomer(false)}
          onCreated={handleCreditCustomerCreated}
        />
        {discountsEnabled && !disableEditDiscount && showDiscountModal && (
          <ModalBackdrop onClick={() => setShowDiscountModal(false)}>
            <DiscountModalContent onClick={e => e.stopPropagation()}>
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
                  $themeColor={theme.primaryDark}
                  onClick={() => setDiscountModalTab('line')}
                >
                  Line Discounts
                </DiscountTabButton>
                <DiscountTabButton
                  type="button"
                  $active={discountModalTab === 'total'}
                  $themeColor={theme.primaryDark}
                  onClick={() => setDiscountModalTab('total')}
                >
                  Total Discount
                </DiscountTabButton>
              </DiscountTabHeader>
              <DiscountModalBody>
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
                          <DiscountRow key={key}>
                            <DiscountRowInfo>
                              <span>{item.displayName || item.name}</span>
                              <small>{sym}{Number(item.price || 0).toFixed(dp)} x {item.qty}</small>
                            </DiscountRowInfo>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DiscountInputWrapper $themeColor={theme.primaryDark}>
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
                                  $themeColor={theme.primaryDark}
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
                                  $themeColor={theme.primaryDark}
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
                        <DiscountInputWrapper $themeColor={theme.primaryDark}>
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
                            $themeColor={theme.primaryDark}
                            onClick={() => setLocalOrderDiscountType('amount')}
                          >
                            {sym}
                          </DiscUnitToggle>
                          <DiscUnitToggle 
                            type="button"
                            $active={localOrderDiscountType === 'percentage' || localOrderDiscountType === 'percent'} 
                            $themeColor={theme.primaryDark}
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
                    background: theme.primaryDark, 
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
      </Card>
    </Overlay>
  );
}

