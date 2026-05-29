/**
 * utils/orderCalculations.js
 *
 * Centralized logic for calculating order totals, taxes, discounts, and round-off.
 * GST compliant (India) and consistent across Cart, Counter, Kitchen, Invoice.
 */

export function calculateOrderTotals(
  items,
  orderDiscount = { type: 'amount', value: 0 },
  profile = {}
) {
  const gstEnabled = !!profile?.gst_enabled;
  const baseRate = Number(profile?.default_tax_rate ?? 0);
  const pricesIncludeTax = gstEnabled ? !!profile?.prices_include_tax : false;

  /* ------------------------------------------------------------------
   * STEP 1: Item-level normalization + line discounts
   * ------------------------------------------------------------------ */
  const processedItems = items.map(item => {
    const qty = Number(item.quantity ?? 1);
    const faceUnit = Number(item.price ?? 0);
    const isPackaged = !!(item.is_packaged_good || item.is_packaged);
    const itemTaxRate = Number(item.tax_rate ?? 0);
    
    // Logic: If Packaged, use Item Rate (fallback to Base). If Not Packaged, ALWAYS use Base Rate.
    const rate = gstEnabled 
      ? (isPackaged 
          ? (itemTaxRate > 0 ? itemTaxRate : baseRate) 
          : baseRate) 
      : 0;

    const isInclusive = gstEnabled && (isPackaged || pricesIncludeTax);

    // Normalize MRP → base
    const baseUnit =
      isInclusive && rate > 0 ? faceUnit / (1 + rate / 100) : faceUnit;

    const totalBaseBeforeDisc = baseUnit * qty;

    // Resolve line discount input
    let dType = 'amount';
    let dVal = 0;

    if (item.discount_percent > 0) {
      dType = 'percent';
      dVal = item.discount_percent;
    } else if (item.discount_amount > 0) {
      dVal = item.discount_amount;
    } else if (item.discount) {
      dType = item.discount.type;
      dVal = Number(item.discount.value || 0);
    }

    // Normalize: accept both 'percent' and 'percentage'
    if (dType === 'percentage') dType = 'percent';

    // Line discount
    let lineDiscBase = 0;
    let lineDiscDisplay = 0; // The "Unit" the user intended (Base for Excl, Face for Incl)

    if (dType === 'percent') {
      lineDiscBase = totalBaseBeforeDisc * (dVal / 100);
      lineDiscDisplay = isInclusive ? (lineDiscBase * (1 + rate / 100)) : lineDiscBase;
    } else {
      if (isInclusive && rate > 0) {
        lineDiscBase = dVal / (1 + rate / 100);
        lineDiscDisplay = dVal;
      } else {
        lineDiscBase = dVal;
        lineDiscDisplay = dVal;
      }
    }

    if (lineDiscBase > totalBaseBeforeDisc) {
      lineDiscBase = totalBaseBeforeDisc;
    }

    // Line discount (face impact on the total)
    const lineDiscFace = lineDiscBase * (1 + rate / 100);

    const initialTaxableBase = Math.max(
      0,
      totalBaseBeforeDisc - lineDiscBase
    );

    return {
      ...item,
      item_name: item.name || item.item_name,
      quantity: qty,

      unit_price: faceUnit,              // MRP
      unit_price_ex_tax_orig: baseUnit,  // Base

      tax_rate: rate,
      is_packaged_good: isPackaged,
      hsn: item.hsn || null,

      line_discount_amount: lineDiscBase, // Base
      line_discount_face: lineDiscFace,   // Face
      _lineDiscDisplay: lineDiscDisplay,

      order_discount_share: 0,            // Base
      order_discount_face_share: 0,       // Face
      _orderDiscDisplay: 0,

      _taxableBase: initialTaxableBase,
      _taxAmount: initialTaxableBase * (rate / 100)
    };
  });

  /* ------------------------------------------------------------------
   * STEP 2: Order-level discount distribution (Mixed Unit Pool)
   * ------------------------------------------------------------------ */
  let discType = orderDiscount?.type || 'amount';
  let discVal = Number(orderDiscount?.value || 0);

  if (typeof orderDiscount === 'number') {
    discType = 'amount';
    discVal = orderDiscount;
  }

  // Normalize: UI uses 'percentage', calculation uses 'percent'
  if (discType === 'percentage') discType = 'percent';

  // No longer filtering out packaged items
  const discountableItems = processedItems; 
  const totalBaseDiscountable = discountableItems.reduce(
    (s, i) => s + i._taxableBase,
    0
  );

  if (discVal > 0 && totalBaseDiscountable > 0) {
    if (discType === 'percent') {
      const totalOrderDiscEx = totalBaseDiscountable * (discVal / 100);

      discountableItems.forEach(i => {
        const isIncl = gstEnabled && (i.is_packaged_good || pricesIncludeTax);
        const shareRatio = i._taxableBase / totalBaseDiscountable;
        const itemDiscEx = totalOrderDiscEx * shareRatio;

        i.order_discount_share = itemDiscEx;
        i.order_discount_face_share = itemDiscEx * (1 + i.tax_rate / 100);
        i._orderDiscDisplay = isIncl ? i.order_discount_face_share : itemDiscEx;

        i._taxableBase = Math.max(0, i._taxableBase - itemDiscEx);
        i._taxAmount = i._taxableBase * (i.tax_rate / 100);
      });
    } else {
      // "Amount" based discount distribution:
      // Rule: For inclusive items, reduction is on Face (MRP). 
      // For exclusive items, reduction is on Taxable Base.
      // This ensures the "Discount: 1.00" on the bill matches the user's manual entry perfectly.
      const totalPool = discountableItems.reduce((s, i) => {
        const isIncl = gstEnabled && (i.is_packaged_good || pricesIncludeTax);
        // Pool is the sum of "Face Value" for inclusive and "Base Value" for exclusive
        const itemVal = isIncl ? (i._taxableBase * (1 + i.tax_rate / 100)) : i._taxableBase;
        return s + itemVal;
      }, 0);

      const totalOrderDiscUnit = Math.min(discVal, totalPool);

      discountableItems.forEach(i => {
        const isIncl = gstEnabled && (i.is_packaged_good || pricesIncludeTax);
        const itemVal = isIncl ? (i._taxableBase * (1 + i.tax_rate / 100)) : i._taxableBase;
        const shareRatio = totalPool > 0 ? (itemVal / totalPool) : 0;
        const discUnit = totalOrderDiscUnit * shareRatio;

        if (isIncl) {
          // discUnit reduces Face (MRP)
          const itemDiscEx = discUnit / (1 + i.tax_rate / 100);
          i.order_discount_share = itemDiscEx;
          i.order_discount_face_share = discUnit;
          i._orderDiscDisplay = discUnit;
        } else {
          // discUnit reduces Taxable Base
          i.order_discount_share = discUnit;
          i.order_discount_face_share = discUnit * (1 + i.tax_rate / 100);
          i._orderDiscDisplay = discUnit;
        }

        i._taxableBase = Math.max(0, i._taxableBase - i.order_discount_share);
        i._taxAmount = i._taxableBase * (i.tax_rate / 100);
      });
    }
  }

  /* ------------------------------------------------------------------
   * STEP 3: Final aggregation
   * ------------------------------------------------------------------ */
  let sumTaxable = 0;
  let sumTax = 0;
  let sumTaxAdded = 0;
  let sumTaxIncluded = 0;
  let sumTotalInc = 0;
  let grossFace = 0;

  let sumLineDiscDisplay = 0;
  let sumOrderDiscDisplay = 0;

  let hasPackaged = false;

  const finalItems = processedItems.map(i => {
    let taxable = 0;
    let tax = 0;
    let total = 0;

    const isIncl = gstEnabled && (i.is_packaged_good || pricesIncludeTax);

    if (isIncl) {
      // Inclusive Path: Discounted Face Value (MRP) is the absolute truth.
      const faceTarget = (i.unit_price * i.quantity) - i.line_discount_face - i.order_discount_face_share;
      total = Number(faceTarget.toFixed(2));
      taxable = Number((total / (1 + i.tax_rate / 100)).toFixed(2));
      tax = Number((total - taxable).toFixed(2));
    } else {
      // Exclusive Path: Base + Tax is the truth.
      taxable = Number(i._taxableBase.toFixed(2));
      tax = Number(i._taxAmount.toFixed(2));
      total = Number((taxable + tax).toFixed(2));
    }

    sumTaxable += taxable;
    sumTax += tax;
    sumTotalInc += total;

    grossFace += i.unit_price * i.quantity;
    sumLineDiscDisplay += i._lineDiscDisplay;
    sumOrderDiscDisplay += i._orderDiscDisplay;

    if (i.is_packaged_good) hasPackaged = true;

    if (isIncl) {
      sumTaxIncluded += tax;
    } else {
      sumTaxAdded += tax;
    }

    const qty = i.quantity || 1;

    return {
      ...i,
      line_discount_amount: Number(i.line_discount_amount.toFixed(2)),
      line_discount_face: Number(i.line_discount_face.toFixed(2)),
      
      order_discount_base_share: Number(i.order_discount_share.toFixed(2)),
      order_discount_share: Number(i.order_discount_share.toFixed(2)),
      order_discount_face_share: Number(i.order_discount_face_share.toFixed(2)),

      taxable_amount: taxable,
      tax_amount: tax,
      line_total: total,

      discount_amount: Number(
        (i.line_discount_face + i.order_discount_face_share).toFixed(2)
      ),

      unit_price_ex_tax: Number((taxable / qty).toFixed(4)),
      unit_tax_amount: Number((tax / qty).toFixed(4)),
      unit_price_inc_tax: Number((total / qty).toFixed(4))
    };
  });

  /* ------------------------------------------------------------------
   * STEP 4: Round-off
   * ------------------------------------------------------------------ */
  const roundCfg = profile?.round_off_config || {};
  let roundOffAmount = 0;

  if (roundCfg.round_off_enabled) {
    if (
      roundCfg.round_off_mode === 'manual' &&
      roundCfg.round_off_manual_value !== undefined
    ) {
      roundOffAmount = Number(roundCfg.round_off_manual_value || 0);
    } else if (roundCfg.round_off_mode === 'automatic') {
      const factor = Number(roundCfg.round_off_auto_factor || 1);
      const rounded = Math.round(sumTotalInc / factor) * factor;
      roundOffAmount = rounded - sumTotalInc;
    }
  }

  const finalPayable = Number((sumTotalInc + roundOffAmount).toFixed(2));

  /* ------------------------------------------------------------------
   * STEP 5: Return totals
   * ------------------------------------------------------------------ */
  const subtotalBaseBeforeDisc = processedItems.reduce(
    (s, i) => s + i.unit_price_ex_tax_orig * i.quantity,
    0
  );

  const realBaseAfterLine = processedItems.reduce(
    (s, i) =>
      s + (i.unit_price_ex_tax_orig * i.quantity - i.line_discount_amount),
    0
  );

  return {
    line_subtotal: Number(grossFace.toFixed(2)),
    
    // UI facing discount amounts (Reflects the "Units" entered)
    discount_amount: Number((sumLineDiscDisplay + sumOrderDiscDisplay).toFixed(2)),
    bill_discount_amount: Number(sumOrderDiscDisplay.toFixed(2)),
    line_discount_total: Number(sumLineDiscDisplay.toFixed(2)),

    // Explicit Base/Face impact totals for background logic
    total_order_discount_base: processedItems.reduce((s,i) => s + i.order_discount_share, 0),
    total_line_discount_base: processedItems.reduce((s,i) => s + i.line_discount_amount, 0),

    round_off_amount: Number(roundOffAmount.toFixed(2)),
    total_amount: finalPayable,

    gross_face_total: Number(grossFace.toFixed(2)),
    subtotal_base_ex_tax: Number(subtotalBaseBeforeDisc.toFixed(2)),
    subtotal_after_line_discounts: Number(realBaseAfterLine.toFixed(2)),

    taxable_amount: Number(sumTaxable.toFixed(2)),
    total_tax: Number(sumTax.toFixed(2)),
    total_tax_added: Number(sumTaxAdded.toFixed(2)),
    total_tax_included: Number(sumTaxIncluded.toFixed(2)),
    total_inc_tax: Number(sumTotalInc.toFixed(2)),

    order_discount_face: processedItems.reduce((s,i) => s + i.order_discount_face_share, 0),
    line_discount_face: processedItems.reduce((s,i) => s + i.line_discount_face, 0),

    has_packaged: hasPackaged,
    is_all_packaged: processedItems.length > 0 && processedItems.every(i => i.is_packaged_good),
    
    order_discount_percent:
      discType === 'percent'
        ? discVal
        : grossFace > 0
        ? (processedItems.reduce((s,i) => s + i.order_discount_share, 0) / subtotalBaseBeforeDisc) * 100
        : 0,

    processed_items: finalItems
  };
}
