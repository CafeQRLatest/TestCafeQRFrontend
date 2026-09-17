export function cartKeyFor(item) {
  if (!item) return '';
  return String(item.cartKey || `${item.productId || item.id}:${item.variantId || 'base'}`);
}

export function hasExtendedOptions(product) {
  return Boolean(product?.hasVariants) || Number(product?.variantCount || 0) > 0 || Boolean(product?.hasUpsells);
}

export function isNonVegProduct(product) {
  if (!product) return false;
  if (product.isVeg === false || product.is_veg === false) return true;
  const type = String(product?.productType || product?.product_type || product?.foodType || '').toUpperCase();
  if (type === 'NON_VEG' || type === 'NON-VEG' || type === 'EGG') return true;
  return type.includes('NON') || type.includes('MEAT') || type.includes('CHICKEN') || type.includes('FISH') || type.includes('BEEF') || type.includes('MUTTON') || type.includes('PORK');
}

export function isVegProduct(product) {
  if (!product) return false;
  if (product.isVeg === true || product.is_veg === true) return true;
  if (isNonVegProduct(product)) return false;
  const type = String(product?.productType || product?.product_type || product?.foodType || '').toUpperCase();
  return type.includes('VEG') || type.includes('VEGETARIAN');
}

export function withoutDiscounts(item) {
  return {
    ...item,
    discount_percent: 0,
    discount_amount: 0,
    discount: null,
  };
}

export function productCartLines(cart, product) {
  const productId = String(product?.id || product?.productId || '');
  if (!productId || !Array.isArray(cart)) return [];
  return cart.filter((item) => String(item.productId || item.id) === productId);
}

export function productCartQuantity(cart, product) {
  return productCartLines(cart, product).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

export function baseProductCartLine(cart, product) {
  return productCartLines(cart, product).find((item) => !item.variantId);
}

export function variantQuantityMap(cart, product) {
  return productCartLines(cart, product).reduce((acc, item) => {
    if (item.variantId) {
      acc[String(item.variantId)] = Number(item.qty || 0);
    }
    return acc;
  }, {});
}
