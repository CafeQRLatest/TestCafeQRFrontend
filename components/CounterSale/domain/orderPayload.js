import { cartKeyFor } from './cart';

export function buildCustomerSelections({ 
  customersEnabled, 
  config, 
  selectedCustomers, 
  selectedCustomerId, 
  customerName, 
  customerPhone 
}) {
  if (!customersEnabled) return [];

  const selections = [];
  const seen = new Set();
  
  const addSelection = (customer) => {
    if (!customer) return;
    const name = String(customer.name || '').trim();
    const phone = String(customer.phone || '').trim();
    const id = customer.id || null;
    if (!id && !name && !phone) return;
    const key = id ? `id:${id}` : phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    selections.push({ id, name: name || null, phone: phone || null });
  };

  if (config?.allowMultipleCustomersPerOrder) {
    if (Array.isArray(selectedCustomers)) {
      selectedCustomers.forEach(addSelection);
    }
    addSelection({ name: customerName, phone: customerPhone });
  } else if (selectedCustomerId) {
    addSelection({ id: selectedCustomerId, name: customerName, phone: customerPhone });
  } else {
    addSelection({ name: customerName, phone: customerPhone });
  }

  return selections;
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
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
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

export function buildProcessedLines({ cart, totals, config }) {
  const dp = config?.currencyDecimalPlaces ?? 2;
  const processedItems = totals?.processed_items || [];

  return processedItems.map((pi, idx) => {
    const cartItem = cart[idx] || null;
    const unitPrice = Number(pi.unit_price ?? pi.price ?? cartItem?.price ?? 0);
    const productName = pi.item_name || pi.name || cartItem?.displayName || cartItem?.name || 'Item';

    const gstEnabled = Boolean(config?.taxEnabled);
    const taxRatePct  = Number(pi.tax_rate || 0);
    const isInclusive = gstEnabled && (pi.is_packaged_good || Boolean(config?.pricesIncludeTax));
    const rawDiscType = String(cartItem?.discount?.type || pi.line_discount_input_type || '').toLowerCase();
    const isPercentDisc = rawDiscType === 'percent' || rawDiscType === 'percentage';

    const matchedRate = (config?.taxRates || []).find(r => parseFloat(r.value) === taxRatePct);
    const taxCode     = gstEnabled && taxRatePct > 0 ? (matchedRate?.code  || `GST_${taxRatePct}`) : null;
    const taxName     = gstEnabled && taxRatePct > 0 ? (matchedRate?.name  || `GST ${taxRatePct}%`) : null;
    const qty         = Number(pi.quantity || 1);

    let clientLineId = cartItem?.clientLineId || cartItem?.client_line_id || pi.clientLineId || pi.client_line_id || null;
    if (!isValidUUID(clientLineId)) {
      const fallbackKey = cartItem?.cartKey || pi.cartKey || `${cartItem?.productId || pi.productId || pi.product_id || pi.id || pi.pid || 'line'}:${cartItem?.variantId || pi.variantId || 'base'}`;
      clientLineId = deterministicUUID(String(fallbackKey));
    }

    return {
      clientLineId,
      productId: cartItem?.productId || pi.productId || pi.product_id || pi.id || pi.pid || null,
      variantId: cartItem?.variantId || null,
      productName,
      categoryName: cartItem?.categoryName || pi.categoryName || pi.category || null,
      isPackagedGood: Boolean(
        cartItem?.isPackagedGood ?? 
        cartItem?.is_packaged_good ?? 
        cartItem?.is_packaged ?? 
        pi.isPackagedGood ?? 
        pi.is_packaged_good ?? 
        pi.is_packaged
      ),
      quantity: qty,
      unitPrice: Number(unitPrice.toFixed(dp)),
      unitOfMeasure: cartItem?.uomName || cartItem?.unitOfMeasure || pi.unitOfMeasure || pi.unit_of_measure || 'units',
      taxRate: taxRatePct,
      taxAmount: Number(Number(pi.tax_amount || 0).toFixed(dp)),
      discountAmount: Number(Number(pi.discount_amount || 0).toFixed(dp)),
      lineTotal: Number(Number(pi.line_total || (unitPrice * qty)).toFixed(dp)),

      grossLineAmount:          Number((unitPrice * qty).toFixed(dp)),
      unitPriceExTax:           Number((pi.unit_price_ex_tax || pi.unit_price_ex_tax_orig || 0).toFixed(dp + 2)),
      taxableAmount:            Number((pi.taxable_amount || 0).toFixed(dp)),
      taxType:                  pi.tax_type_resolved || (isInclusive ? 'INCLUSIVE' : (gstEnabled && taxRatePct > 0 ? 'EXCLUSIVE' : 'NONE')),
      taxSnapshotRate:          taxRatePct,
      taxCode,
      taxName,
      manualDiscountAmount:     (!isPercentDisc && cartItem?.discount?.value > 0) ? Number(cartItem.discount.value.toFixed(dp)) : null,
      manualDiscountPercent:    (isPercentDisc && cartItem?.discount?.value > 0) ? Number(cartItem.discount.value.toFixed(dp + 2)) : null,
      lineDiscountType:         isPercentDisc ? 'PERCENT' : 'AMOUNT',
      lineDiscountValue:        (cartItem?.discount?.value > 0) ? Number(cartItem.discount.value.toFixed(dp)) : null,
      allocatedOrderDiscount:   Number((pi.order_discount_share || 0).toFixed(dp)),
      description:              cartItem?.description || null,
    };
  });
}

export function buildOrderPayload({
  orgId,
  config,
  cart,
  totals,
  discountType,
  discountValue,
  customersEnabled,
  primaryCustomer,
  customerSelections,
  isCreditSale,
  selectedCreditCustomerId,
  selectedCreditCustomer,
  orderMode,
  kitchenEnabled,
  paymentPayload,
  parsedDate,
  initialTable,
  knownOffline,
  mainOfflineDevice,
  skipAutoPrintKinds,
  terminalId
}) {
  const dp = config?.currencyDecimalPlaces ?? 2;
  const processedLines = buildProcessedLines({ cart, totals, config });
  
  const effectiveOrderMode = kitchenEnabled ? orderMode : 'settle';
  const isCreditFinal = isCreditSale && effectiveOrderMode === 'settle';
  const isOfflineFinal = knownOffline && effectiveOrderMode === 'settle' && mainOfflineDevice;
  const isSettleDirect = effectiveOrderMode === 'settle' && paymentPayload !== null;

  const payload = {
    orderType: 'SALE',
    ...(orgId ? { orgId } : {}),
    ...(terminalId ? { terminalId } : {}),
    orderSource: knownOffline ? 'OFFLINE' : 'ONLINE',
    ...(parsedDate ? { orderDate: parsedDate } : {}),
    fulfillmentType: (initialTable && initialTable.tableNumber !== 'COUNTER')
      ? 'DINE_IN'
      : (initialTable?.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY'),
    tableNumber: (initialTable && initialTable.tableNumber !== 'COUNTER') ? initialTable.tableNumber : null,
    tableId: (initialTable && initialTable.tableNumber !== 'COUNTER') ? initialTable.id : null,
    
    orderStatus: effectiveOrderMode === 'kitchen'
      ? 'KITCHEN'
      : (isSettleDirect
        ? 'COMPLETED'
        : (isCreditFinal ? 'COMPLETED' : (isOfflineFinal ? 'COMPLETED' : 'BILLED'))),
    paymentStatus: effectiveOrderMode === 'kitchen'
      ? 'PENDING'
      : (isSettleDirect
        ? (paymentPayload.paymentMethod === 'CREDIT' ? 'PENDING' : 'PAID')
        : (isCreditFinal ? 'PENDING' : (isOfflineFinal ? 'PAID' : 'PENDING'))),
    ...(isSettleDirect
      ? { reference: paymentPayload.paymentMethod }
      : (isCreditFinal ? { reference: 'CREDIT' } : (isOfflineFinal ? { reference: 'CASH' } : {}))),
    isCredit: isSettleDirect ? paymentPayload.paymentMethod === 'CREDIT' : isCreditFinal,
    creditCustomerId: isSettleDirect
      ? (paymentPayload.paymentMethod === 'CREDIT' ? paymentPayload.creditCustomerId || null : null)
      : (isCreditSale ? selectedCreditCustomerId || null : null),
    
    ...(isSettleDirect && paymentPayload.paymentMethod !== 'CREDIT' ? {
      paymentMethod: paymentPayload.paymentMethod,
      amountPaid: paymentPayload.amountPaid,
      roundOffAmount: paymentPayload.roundOffAmount || 0,
      ...(paymentPayload.paymentMethod === 'MIXED' ? {
        paymentSplits: paymentPayload.paymentSplits,
      } : {}),
    } : {}),
    ...(customersEnabled ? {
      customerId: primaryCustomer?.id || null,
      customerIds: customerSelections.length > 0 ? customerSelections : null,
    } : {}),
    grandTotal: isSettleDirect
      ? Number((paymentPayload.amountPaid || totals.total_inc_tax).toFixed(dp))
      : Number(totals.total_inc_tax.toFixed(dp)),
    totalTaxAmount: Number(totals.total_tax.toFixed(dp)),
    totalDiscountAmount: Number(Number(totals.discount_amount || 0).toFixed(dp)),
    totalAmount: Number(totals.total_inc_tax.toFixed(dp)),

    grossAmount: Number((totals.gross_face_total || 0).toFixed(dp)),
    orderDiscountType: (String(discountType || '').toLowerCase() === 'percentage' || String(discountType || '').toLowerCase() === 'percent') ? 'PERCENT' : 'AMOUNT',
    orderDiscountValue: Number(discountValue || 0),
    discountSource: 'MANUAL',
    ...(skipAutoPrintKinds?.length ? { skipAutoPrintKinds } : {}),

    lines: processedLines
  };

  return payload;
}
