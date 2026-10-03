/**
 * Normalizes order objects returned by the backend (both legacy and active versions)
 * into a consistent camelCase internal schema.
 */
export function normalizeOrder(order) {
  if (!order) return null;

  const orderStatus = order.orderStatus || order.order_status || 'DRAFT';
  const paymentStatus = order.paymentStatus || order.payment_status || 'PENDING';
  const grandTotal = order.grandTotal !== undefined ? order.grandTotal : (order.grand_total !== undefined ? order.grand_total : 0);
  const totalAmount = order.totalAmount !== undefined ? order.totalAmount : (order.total_amount !== undefined ? order.total_amount : 0);
  const totalTaxAmount = order.totalTaxAmount !== undefined ? order.totalTaxAmount : (order.total_tax_amount !== undefined ? order.total_tax_amount : 0);
  const totalDiscountAmount = order.totalDiscountAmount !== undefined ? order.totalDiscountAmount : (order.total_discount_amount !== undefined ? order.total_discount_amount : 0);
  const grossAmount = order.grossAmount !== undefined ? order.grossAmount : (order.gross_amount !== undefined ? order.gross_amount : 0);
  const orderDate = order.orderDate || order.order_date || order.createdAt || order.created_at;
  const tableNumber = order.tableNumber || order.table_number || null;
  const customerName = order.customerName || order.customer_name || null;
  const customerPhone = order.customerPhone || order.customer_phone || null;
  const fulfillmentType = order.fulfillmentType || order.fulfillment_type || 'TAKEAWAY';

  const normalizedLines = (order.lines || []).map(line => {
    const lineTotal = line.lineTotal !== undefined ? line.lineTotal : (line.line_total !== undefined ? line.line_total : 0);
    const unitPrice = line.unitPrice !== undefined ? line.unitPrice : (line.unit_price !== undefined ? line.unit_price : 0);
    const taxRate = line.taxRate !== undefined ? line.taxRate : (line.tax_rate !== undefined ? line.tax_rate : 0);
    const taxAmount = line.taxAmount !== undefined ? line.taxAmount : (line.tax_amount !== undefined ? line.tax_amount : 0);
    const discountAmount = line.discountAmount !== undefined ? line.discountAmount : (line.discount_amount !== undefined ? line.discount_amount : 0);

    return {
      ...line,
      productId: line.productId || line.product_id,
      variantId: line.variantId || line.variant_id,
      productName: line.productName || line.product_name,
      categoryName: line.categoryName || line.category_name,
      unitPrice,
      taxRate,
      taxAmount,
      discountAmount,
      lineTotal,
    };
  });

  return {
    ...order,
    orderStatus,
    paymentStatus,
    grandTotal,
    totalAmount,
    totalTaxAmount,
    totalDiscountAmount,
    grossAmount,
    orderDate,
    tableNumber,
    customerName,
    customerPhone,
    fulfillmentType,
    lines: normalizedLines
  };
}

/**
 * Normalizes a list of orders.
 */
export function normalizeOrders(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.map(normalizeOrder);
}
