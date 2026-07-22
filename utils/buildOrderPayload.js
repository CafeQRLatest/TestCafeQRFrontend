import { isKnownOffline } from './networkState';
import { roundMoney } from './orderCalculations';

/**
 * Builds standard order JSON payload to be sent to the backend POS API.
 *
 * NOTE: The backend ignores submitted monetary totals and recalculates
 * authoritatively via OrderCalculationService. roundMoney() is used here
 * purely for display-consistency in logging and optimistic UI updates.
 */
export function buildOrderPayload({
  orderType = 'SALE',
  orgId,
  parsedDate,
  initialTable,
  effectiveOrderMode,
  paymentPayload,
  isCreditSale,
  selectedCreditCustomerId,
  isCreditFinal,
  isOfflineFinal,
  isSettleDirect,
  customersEnabled,
  primaryCustomer,
  customerSelections = [],
  totals,
  discountType,
  discountValue,
  processedLines = [],
  plannedPrintKind,
  localPrintWillHandleOrder,
  dp = 2,
  terminalId
}) {
  const knownOffline = isKnownOffline();
  
  return {
    orderType,
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
      amountPaid: roundMoney(paymentPayload.amountPaid, dp),
      roundOffAmount: roundMoney(paymentPayload.roundOffAmount || 0, dp),
      ...(paymentPayload.paymentMethod === 'MIXED' ? {
        paymentSplits: paymentPayload.paymentSplits,
      } : {}),
    } : {}),
    
    ...(customersEnabled ? {
      customerId: primaryCustomer?.id || null,
      customerIds: customerSelections && customerSelections.length > 0 ? customerSelections : null,
    } : {}),
    
    // Backend recalculates authoritatively; these are advisory hints only.
    grandTotal: isSettleDirect
      ? roundMoney(paymentPayload.amountPaid || totals.total_inc_tax, dp)
      : roundMoney(totals.total_inc_tax, dp),
    totalTaxAmount:      roundMoney(totals.total_tax, dp),
    totalDiscountAmount: roundMoney(totals.discount_amount || 0, dp),
    totalAmount:         roundMoney(totals.total_inc_tax, dp),
    
    grossAmount:         roundMoney(totals.gross_face_total || 0, dp),
    orderDiscountType: (String(discountType || '').toLowerCase() === 'percentage' || String(discountType || '').toLowerCase() === 'percent') ? 'PERCENT' : 'AMOUNT',
    orderDiscountValue: roundMoney(discountValue || 0, dp),
    discountSource: 'MANUAL',
    
    ...(!knownOffline && localPrintWillHandleOrder && localPrintWillHandleOrder(plannedPrintKind)
      ? { skipAutoPrintKinds: [plannedPrintKind === 'kot' ? 'KOT' : 'BILL'] }
      : {}),
      
    lines: processedLines
  };
}
