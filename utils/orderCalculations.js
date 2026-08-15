/**
 * utils/orderCalculations.js
 *
 * Centralized financial calculation engine.
 * Semantics mirror OrderCalculationService.java exactly.
 *
 * FaceAmount  — customer-visible monetary amount (tax-inclusive for inclusive lines,
 *               same as base for NONE/zero-rate items).
 * BaseAmount  — ex-tax taxable base used for tax computation.
 *
 * Order-level discounts are always allocated against faceAfterLineDiscount
 * (customer-visible eligible amount per line), then the base share is derived
 * by back-calculating through the tax factor.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tax type helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the effective tax type for a single item, matching backend resolveTaxType().
 *
 * Priority:
 *  1. GST disabled globally → 'NONE'
 *  2. Packaged good → 'INCLUSIVE' (MRP = face price)
 *  3. Explicit item.tax_type string → parse it
 *  4. Config fallback: pricesIncludeTax → 'INCLUSIVE', else → 'EXCLUSIVE'
 *
 * @returns {'INCLUSIVE'|'EXCLUSIVE'|'NONE'}
 */
function resolveTaxType(item, taxEnabled, pricesIncludeTax) {
  if (!taxEnabled) return 'NONE';
  const isPackaged = !!(item.is_packaged_good || item.is_packaged);
  if (isPackaged) return 'INCLUSIVE';

  const explicit = (item.tax_type || '').trim().toUpperCase();
  if (explicit === 'INCLUSIVE' || explicit === 'EXCLUSIVE' || explicit === 'NONE') {
    return explicit;
  }

  return pricesIncludeTax ? 'INCLUSIVE' : 'EXCLUSIVE';
}

function normalizeDiscountType(raw) {
  if (!raw) return 'AMOUNT';
  const u = raw.trim().toUpperCase();
  const normalized = u === 'PERCENTAGE' ? 'PERCENT' : u;
  if (normalized !== 'PERCENT' && normalized !== 'AMOUNT') {
    throw new Error(`Invalid discount type: "${raw}"`);
  }
  return normalized;
}

/**
 * Rounds a monetary value to currency decimal places.
 * Makes rounding boundaries explicit throughout the calculation engine,
 * mirroring backend INTERNAL_SCALE / ROUNDING policy at display boundaries.
 *
 * @param {number} value
 * @param {number} dp - currency decimal places (e.g. 2)
 * @returns {number}
 */
function roundMoney(value, dp) {
  return Number(Number(value || 0).toFixed(dp));
}

// ─────────────────────────────────────────────────────────────────────────────────
// Main calculation function
// ─────────────────────────────────────────────────────────────────────────────────

export function calculateOrderTotals(
  items,
  orderDiscount = { type: 'amount', value: 0 },
  profile = {}
) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      line_subtotal: 0,
      gross_amount: 0,
      gross_face_total: 0,
      line_discount_display_amount: 0,
      order_discount_display_amount: 0,
      discount_amount: 0,
      bill_discount_amount: 0,
      line_discount_total: 0,
      total_line_discount_base: 0,
      total_order_discount_base: 0,
      line_discount_face: 0,
      order_discount_face: 0,
      taxable_amount: 0,
      total_tax: 0,
      total_tax_added: 0,
      total_tax_included: 0,
      total_inc_tax: 0,
      subtotal_base_ex_tax: 0,
      subtotal_after_line_discounts: 0,
      total_before_round_off: 0,
      round_off_amount: 0,
      grand_total: 0,
      total_amount: 0,
      has_packaged: false,
      is_all_packaged: false,
      order_discount_percent: 0,
      processed_items: []
    };
  }

  const taxEnabled      = !!profile?.tax_enabled;
  const baseRate        = Number(profile?.default_tax_rate ?? 0);
  if (!Number.isFinite(baseRate) || baseRate < 0) {
    throw new Error('Default tax rate must be a finite non-negative number.');
  }
  const pricesIncludeTax = taxEnabled ? !!profile?.prices_include_tax : false;
  const dp              = Number(profile?.currencyDecimalPlaces ?? 2);

  if (!Number.isInteger(dp) || dp < 0 || dp > 6) {
    throw new Error('Invalid currency decimal places.');
  }

  // ── Order discount inputs ──────────────────────────────────────────────────
  let discType = typeof orderDiscount === 'number'
    ? 'AMOUNT'
    : normalizeDiscountType(orderDiscount?.type);
  let discVal  = typeof orderDiscount === 'number'
    ? Number(orderDiscount)
    : Number(orderDiscount?.value || 0);

  if (!Number.isFinite(discVal) || discVal < 0) {
    throw new Error('Order discount value must be a finite non-negative number.');
  }
  if (discType === 'PERCENT' && discVal > 100) {
    throw new Error('Order discount percentage cannot exceed 100%.');
  }

  /* --------------------------------------------------------------------------
   * STEP 1 — Line-level normalisation + line discounts
   * ---------------------------------------------------------------------- */
  const processedItems = items.map(item => {
    const qty       = Number(item.quantity ?? item.qty ?? 1);
    const faceUnit  = Number(item.price ?? 0);
    const clientLineId = item.clientLineId ?? item.client_line_id ?? null;

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Quantity must be greater than zero.');
    }

    if (!Number.isFinite(faceUnit) || faceUnit < 0) {
      throw new Error('Unit price cannot be negative.');
    }

    const taxType   = resolveTaxType(item, taxEnabled, pricesIncludeTax);
    const isInclusive = taxType === 'INCLUSIVE';
    const isNone      = taxType === 'NONE';

    // Rate: use item's own rate when available; fall back to profile base rate
    const rate = isNone
      ? 0
      : (item.tax_rate !== undefined && item.tax_rate !== null && item.tax_rate !== '' && Number(item.tax_rate) !== 0
          ? Number(item.tax_rate)
          : baseRate);

    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('Tax rate cannot be negative.');
    }

    const lineRate = rate / 100;

    // Ex-tax unit price
    const baseUnit  = isInclusive && rate > 0
      ? faceUnit / (1 + lineRate)
      : faceUnit;

    // ── Stage 1: Gross (before any discount) ─────────────────────────────
    const grossBase = baseUnit * qty;
    const grossFace = isInclusive
      ? faceUnit * qty
      : grossBase * (1 + lineRate);

    // ── Resolve line discount inputs ──────────────────────────────────────
    if (item.discount_percent !== undefined && item.discount_percent !== null) {
      const dpVal = Number(item.discount_percent);
      if (!Number.isFinite(dpVal) || dpVal < 0) {
        throw new Error('Discount percentage cannot be negative.');
      }
      if (dpVal > 100) {
        throw new Error('Discount percentage cannot exceed 100%.');
      }
    }
    if (item.discount_amount !== undefined && item.discount_amount !== null) {
      const daVal = Number(item.discount_amount);
      if (!Number.isFinite(daVal) || daVal < 0) {
        throw new Error('Discount amount cannot be negative.');
      }
    }
    if (item.discount) {
      const dv = Number(item.discount.value || 0);
      if (!Number.isFinite(dv) || dv < 0) {
        throw new Error('Discount value cannot be negative.');
      }
      const dt = normalizeDiscountType(item.discount.type);
      if (dt === 'PERCENT' && dv > 100) {
        throw new Error('Discount percentage cannot exceed 100%.');
      }
    }

    let dType = 'AMOUNT';
    let dVal  = 0;

    if (item.discount_percent > 0) {
      dType = 'PERCENT'; dVal = Number(item.discount_percent);
    } else if (item.discount_amount > 0) {
      dType = 'AMOUNT'; dVal = Number(item.discount_amount);
    } else if (item.discount) {
      dType = normalizeDiscountType(item.discount.type);
      dVal  = Number(item.discount.value || 0);
    } else if (item.line_discount_type) {
      dType = normalizeDiscountType(item.line_discount_type);
      dVal  = Number(item.line_discount_value ?? 0);
    }

    if (!Number.isFinite(dVal) || dVal < 0) {
      throw new Error('Discount value cannot be negative.');
    }

    if (dType === 'PERCENT' && dVal > 100) {
      throw new Error('Line discount percentage cannot exceed 100%.');
    }

    // ── Stage 2: Line discount amounts ───────────────────────────────────
    let lineDiscBase;
    let lineDiscFace;

    if (dType === 'PERCENT') {
      lineDiscBase = grossBase * (dVal / 100);
      lineDiscFace = lineDiscBase * (1 + lineRate); // face impact
    } else {
      // AMOUNT = customer-visible (face) discount — uniform for INCLUSIVE, EXCLUSIVE, NONE
      lineDiscFace = dVal;
      lineDiscBase = (taxType === 'NONE' || rate === 0)
        ? lineDiscFace
        : lineDiscFace / (1 + lineRate);
    }

    // Cap line discount at gross
    if (lineDiscBase > grossBase) {
      lineDiscBase = grossBase;
      lineDiscFace = grossFace;
    }

    // ── Stage 3: After line discount ─────────────────────────────────────
    const baseAfterLineDiscount = Math.max(0, grossBase - lineDiscBase);
    // faceAfterLineDiscount is derived by stage subtraction, not base re-multiplication,
    // so stage semantics stay explicit and resilient to future tax changes.
    const faceAfterLineDiscount = Math.max(0, grossFace - lineDiscFace);

    return {
      ...item,
      // Stable identity
      clientLineId,
      item_name: item.name || item.item_name,
      quantity: qty,

      // Tax resolution
      tax_type_resolved: taxType,
      tax_rate: rate,
      is_packaged_good: !!(item.is_packaged_good || item.is_packaged),
      hsn: item.hsn || null,

      // Price stages
      unit_price:           faceUnit,
      unit_price_ex_tax_orig: baseUnit,

      // Stage 1 — Gross
      gross_base_amount: grossBase,
      gross_face_amount: grossFace,

      // Stage 2 — Line discount
      line_discount_input_type:  dType,
      line_discount_input_value: dVal,
      line_discount_base_amount: lineDiscBase,
      line_discount_face_amount: lineDiscFace,

      // Stage 3 — After line discount
      base_after_line_discount: baseAfterLineDiscount,
      face_after_line_discount: faceAfterLineDiscount,

      // Stage 4 — Allocated order discount (filled in step 2)
      order_discount_base_share: 0,
      order_discount_face_share: 0,
    };
  });

  /* --------------------------------------------------------------------------
   * STEP 2 — Order-level discount distribution
   *
   * Mirrors Java:
   *   Eligible lines = face_after_line_discount > 0
   *   PERCENT: direct per-line percentage × faceAfterLineDiscount
   *   AMOUNT:  proportional face allocation by faceAfterLineDiscount weight
   *   Residual: last eligible line absorbs remainder
   * ---------------------------------------------------------------------- */
  const eligibleItems = processedItems.filter(i => i.face_after_line_discount > 0);
  const totalFaceAfterLineDiscount = eligibleItems.reduce(
    (s, i) => s + i.face_after_line_discount,
    0
  );

  if (discVal > 0 && totalFaceAfterLineDiscount > 0) {
    if (discType === 'AMOUNT' && discVal > totalFaceAfterLineDiscount) {
      throw new Error(
        `Order discount cannot exceed the eligible total (${roundMoney(totalFaceAfterLineDiscount, dp)}).`
      );
    }

    // Round the target discount total to currency precision before allocation so
    // the last-line residual always sums to exactly the displayed discount figure.
    const totalOrderDiscFace = discType === 'PERCENT'
      ? roundMoney(totalFaceAfterLineDiscount * (discVal / 100), dp)
      : roundMoney(discVal, dp);

    let allocatedFaceSum = 0;

    eligibleItems.forEach((item, idx) => {
      const lineRate = item.tax_rate / 100;
      let itemDiscFace;

      if (idx === eligibleItems.length - 1) {
        // Last eligible absorbs the remainder (eliminates rounding drift)
        itemDiscFace = totalOrderDiscFace - allocatedFaceSum;
      } else if (discType === 'PERCENT') {
        // Direct per-line percentage
        itemDiscFace = Number(
          (item.face_after_line_discount * (discVal / 100)).toFixed(dp)
        );
        allocatedFaceSum += itemDiscFace;
      } else {
        // Proportional amount allocation by face eligible weight
        const shareRatio = item.face_after_line_discount / totalFaceAfterLineDiscount;
        itemDiscFace = Number((totalOrderDiscFace * shareRatio).toFixed(dp));
        allocatedFaceSum += itemDiscFace;
      }

      // Derive base from face — uniform for inclusive and exclusive
      const itemDiscBase = (item.tax_type_resolved === 'NONE' || lineRate === 0)
        ? itemDiscFace
        : itemDiscFace / (1 + lineRate);

      item.order_discount_base_share = itemDiscBase;
      item.order_discount_face_share = itemDiscFace;
    });
  }

  /* --------------------------------------------------------------------------
   * STEP 3 — Final aggregation
   * ---------------------------------------------------------------------- */
  let sumTaxable   = 0;
  let sumTax       = 0;
  let sumTaxAdded  = 0;
  let sumTaxIncl   = 0;
  let sumTotalInc  = 0;
  let grossFaceSum = 0;
  let sumLineDiscDisplay  = 0;
  let sumOrderDiscDisplay = 0;
  let hasPackaged = false;

  const finalItems = processedItems.map(item => {
    const rate    = item.tax_rate;
    const lineRate = rate / 100;
    const qty     = item.quantity;
    const isIncl  = item.tax_type_resolved === 'INCLUSIVE';

    const finalBase = Math.max(
      0,
      item.base_after_line_discount - item.order_discount_base_share
    );

    let taxable, tax, total;

    if (isIncl) {
      // Inclusive: derive from the final customer-visible face total
      const faceTotal = Math.max(
        0,
        item.face_after_line_discount - item.order_discount_face_share
      );
      total   = Number(faceTotal.toFixed(dp));
      taxable = rate > 0
        ? Number((total / (1 + lineRate)).toFixed(dp))
        : total;
      tax     = Number((total - taxable).toFixed(dp));
    } else {
      // Exclusive or NONE: build up from base
      taxable = Number(finalBase.toFixed(dp));
      tax     = Number((taxable * lineRate).toFixed(dp));
      total   = Number((taxable + tax).toFixed(dp));
    }

    sumTaxable  += taxable;
    sumTax      += tax;
    sumTotalInc += total;

    grossFaceSum        += item.gross_face_amount;
    sumLineDiscDisplay  += item.line_discount_face_amount;
    sumOrderDiscDisplay += item.order_discount_face_share;

    if (item.is_packaged_good) hasPackaged = true;
    if (isIncl) sumTaxIncl += tax; else sumTaxAdded += tax;

    return {
      ...item,

      // Stage 1 — rounded
      gross_line_amount:     Number(item.gross_face_amount.toFixed(dp)),
      gross_base_amount:     Number(item.gross_base_amount.toFixed(dp)),
      gross_face_amount:     Number(item.gross_face_amount.toFixed(dp)),

      // Stage 2 — rounded
      line_discount_amount:  Number(item.line_discount_base_amount.toFixed(dp)),
      line_discount_face:    Number(item.line_discount_face_amount.toFixed(dp)),

      // Stage 3 — rounded
      base_after_line_discount: Number(item.base_after_line_discount.toFixed(dp)),
      face_after_line_discount: Number(item.face_after_line_discount.toFixed(dp)),

      // Stage 4 — rounded
      order_discount_base_share: Number(item.order_discount_base_share.toFixed(dp)),
      order_discount_face_share: Number(item.order_discount_face_share.toFixed(dp)),

      // Aliases expected by existing code
      order_discount_share:      Number(item.order_discount_base_share.toFixed(dp)),
      allocated_order_discount:  Number(item.order_discount_base_share.toFixed(dp)),

      // Stage 5 — final
      taxable_amount: taxable,
      tax_amount:     tax,
      line_total:     total,

      discount_amount: Number(
        (item.line_discount_face_amount + item.order_discount_face_share).toFixed(dp)
      ),

      unit_price_ex_tax:   Number((taxable / qty).toFixed(dp + 2)),
      unit_tax_amount:     Number((tax     / qty).toFixed(dp + 2)),
      unit_price_inc_tax:  Number((total   / qty).toFixed(dp + 2)),
    };
  });

  /* --------------------------------------------------------------------------
   * STEP 4 — Round-off
   * ---------------------------------------------------------------------- */
  const roundCfg = profile?.round_off_config || {};
  let roundOffAmount = 0;

  const isCreditOrder = Boolean(
    profile?.isCredit || 
    profile?.isCreditOrder || 
    profile?.paymentMethod === 'CREDIT' || 
    profile?.payment_method === 'CREDIT' ||
    profile?.isCreditSale
  );

  const isRoundOffEnabled = !isCreditOrder && (
    roundCfg.round_off_enabled !== undefined 
      ? Boolean(roundCfg.round_off_enabled) 
      : Boolean(profile?.roundOffEnabled)
  );

  const roundOffMode = String(roundCfg.round_off_mode || profile?.roundOffMode || 'AUTOMATIC')
    .trim()
    .toUpperCase();

  if (isRoundOffEnabled) {
    if (roundOffMode === 'MANUAL' && roundCfg.round_off_manual_value !== undefined) {
      roundOffAmount = Number(roundCfg.round_off_manual_value || 0);
      if (!Number.isFinite(roundOffAmount)) {
        throw new Error('Manual round-off value must be a finite number.');
      }
    } else if (roundOffMode === 'AUTOMATIC' || roundOffMode === 'AUTO') {
      const factor = Number(roundCfg.round_off_auto_factor ?? profile?.roundOffAutoFactor ?? 1);
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new Error('Round-off factor must be greater than zero.');
      }
      const rounded = Math.round(sumTotalInc / factor) * factor;
      roundOffAmount = rounded - sumTotalInc;
    }
  }

  const finalPayable = Number((sumTotalInc + roundOffAmount).toFixed(dp));

  /* --------------------------------------------------------------------------
   * STEP 5 — Return totals
   * ---------------------------------------------------------------------- */
  const subtotalBaseBeforeDisc = processedItems.reduce(
    (s, i) => s + i.unit_price_ex_tax_orig * i.quantity,
    0
  );

  const realBaseAfterLine = processedItems.reduce(
    (s, i) => s + i.base_after_line_discount,
    0
  );

  return {
    // Gross (before any discount)
    line_subtotal:                Number(grossFaceSum.toFixed(dp)),
    gross_amount:                 Number(grossFaceSum.toFixed(dp)),
    gross_face_total:             Number(grossFaceSum.toFixed(dp)),

    // Discount display (customer-visible face amounts)
    line_discount_display_amount: Number(sumLineDiscDisplay.toFixed(dp)),
    order_discount_display_amount: Number(sumOrderDiscDisplay.toFixed(dp)),
    discount_amount:              Number((sumLineDiscDisplay + sumOrderDiscDisplay).toFixed(dp)),
    bill_discount_amount:         Number(sumOrderDiscDisplay.toFixed(dp)),
    line_discount_total:          Number(sumLineDiscDisplay.toFixed(dp)),

    // Discount base (ex-tax) totals for backend mapping
    total_line_discount_base:     Number(finalItems.reduce((s, i) => s + i.line_discount_amount, 0).toFixed(dp)),
    total_order_discount_base:    Number(finalItems.reduce((s, i) => s + i.order_discount_base_share, 0).toFixed(dp)),
    line_discount_face:           Number(finalItems.reduce((s, i) => s + i.line_discount_face, 0).toFixed(dp)),
    order_discount_face:          Number(finalItems.reduce((s, i) => s + i.order_discount_face_share, 0).toFixed(dp)),

    // Tax
    taxable_amount:               Number(sumTaxable.toFixed(dp)),
    total_tax:                    Number(sumTax.toFixed(dp)),
    total_tax_added:              Number(sumTaxAdded.toFixed(dp)),
    total_tax_included:           Number(sumTaxIncl.toFixed(dp)),
    total_inc_tax:                Number(sumTotalInc.toFixed(dp)),

    // Sub-totals
    subtotal_base_ex_tax:         Number(subtotalBaseBeforeDisc.toFixed(dp)),
    subtotal_after_line_discounts: Number(realBaseAfterLine.toFixed(dp)),

    // Final
    total_before_round_off:       Number(sumTotalInc.toFixed(dp)),
    round_off_amount:             Number(roundOffAmount.toFixed(dp)),
    grand_total:                  finalPayable,
    total_amount:                 finalPayable,

    // Flags
    has_packaged:   hasPackaged,
    is_all_packaged: processedItems.length > 0 && processedItems.every(i => i.is_packaged_good),

    order_discount_percent:
      discType === 'PERCENT'
        ? discVal
        : totalFaceAfterLineDiscount > 0
        ? (sumOrderDiscDisplay / totalFaceAfterLineDiscount) * 100
        : 0,

    processed_items: finalItems,
  };
}
