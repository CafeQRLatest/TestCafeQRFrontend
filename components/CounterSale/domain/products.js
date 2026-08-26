import { isVegProduct } from './cart';

export function filterAndSearchProducts({ products, activeCat, dietFilter, search, trendingProductIds }) {
  if (!Array.isArray(products)) return [];
  const term = String(search || '').trim().toLowerCase();
  
  return products.filter(p => {
    if (p.isActive === false || p.isactive === 'N') return false;
    
    // Exclude ingredients
    if (
      p.isIngredient === true || 
      p.is_ingredient === true || 
      String(p.isIngredient).toUpperCase() === 'Y' || 
      String(p.is_ingredient).toUpperCase() === 'Y'
    ) {
      return false;
    }

    const matchesCategory = activeCat === 'ALL' || p.categoryName === activeCat;
    const nameMatch = String(p.name || '').toLowerCase().includes(term);
    const codeMatch = String(p.productCode || '').toLowerCase().includes(term);
    const barcodeMatch = String(p.barcode || '').toLowerCase().includes(term);
    const matchesSearch = !term || nameMatch || codeMatch || barcodeMatch;
    const matchesDiet = dietFilter === 'VEG' ? isVegProduct(p) : true;
    const matchesTrending = dietFilter === 'TRENDING'
      ? (Array.isArray(trendingProductIds) && trendingProductIds.length 
          ? trendingProductIds.includes(String(p.id)) 
          : products.indexOf(p) < 12)
      : true;

    return matchesCategory && matchesSearch && matchesDiet && matchesTrending;
  });
}

export function getStandardMatches(products, search) {
  if (!Array.isArray(products)) return [];
  const term = String(search || '').trim();
  if (!term) return [];
  const normalizedTerm = term.toLowerCase();

  return products
    .filter(p => {
      if (p.isActive === false || p.isactive === 'N') return false;
      if (
        p.isIngredient === true || 
        p.is_ingredient === true || 
        String(p.isIngredient).toUpperCase() === 'Y' || 
        String(p.is_ingredient).toUpperCase() === 'Y'
      ) {
        return false;
      }
      const nameMatch = String(p.name || '').toLowerCase().includes(normalizedTerm);
      const codeMatch = String(p.productCode || '').toLowerCase().includes(normalizedTerm);
      const barcodeMatch = String(p.barcode || '').toLowerCase() === normalizedTerm;
      return nameMatch || codeMatch || barcodeMatch;
    })
    .slice(0, 12);
}

export function findProductByBarcode(products, rawBarcode) {
  if (!Array.isArray(products)) return null;
  const barcode = String(rawBarcode || '').trim().toLowerCase();
  if (!barcode) return null;

  const strippedBarcode = barcode.replace(/^0+/, '');

  return products.find(p => {
    if (p.isActive === false || p.isactive === 'N') return false;
    if (
      p.isIngredient === true || 
      p.is_ingredient === true || 
      String(p.isIngredient).toUpperCase() === 'Y' || 
      String(p.is_ingredient).toUpperCase() === 'Y'
    ) {
      return false;
    }
    const pBarcode = String(p.barcode || '').trim().toLowerCase();
    const pCode = String(p.productCode || '').trim().toLowerCase();
    if (!pBarcode && !pCode) return false;

    // 1. Direct exact match
    if (pBarcode === barcode || pCode === barcode) return true;

    // 2. Match ignoring leading zeros (EAN-13 vs UPC-A: 0123456789012 vs 123456789012)
    const strippedPBarcode = pBarcode.replace(/^0+/, '');
    if (strippedBarcode && strippedPBarcode && strippedBarcode === strippedPBarcode) return true;

    // 3. EAN-13 / UPC 12-to-13 digit prefix/checksum tolerance
    if (pBarcode && barcode) {
      if (barcode.length === 13 && pBarcode.length === 12 && (barcode.startsWith(pBarcode) || barcode.endsWith(pBarcode))) return true;
      if (barcode.length === 12 && pBarcode.length === 13 && (pBarcode.startsWith(barcode) || pBarcode.endsWith(barcode))) return true;
    }

    return false;
  }) || null;
}

export function extractUniqueCategories(products) {
  if (!Array.isArray(products)) return ['ALL'];
  const activeProducts = products.filter(p => {
    if (p.isActive === false || p.isactive === 'N') return false;
    if (
      p.isIngredient === true || 
      p.is_ingredient === true || 
      String(p.isIngredient).toUpperCase() === 'Y' || 
      String(p.is_ingredient).toUpperCase() === 'Y'
    ) {
      return false;
    }
    return true;
  });
  
  const productCats = activeProducts.map(p => p.categoryName).filter(Boolean);
  const uniqueCats = Array.from(new Set(productCats)).sort((a, b) => 
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  );
  
  return ['ALL', ...uniqueCats];
}
