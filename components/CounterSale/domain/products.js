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

    const catStr = String(activeCat || 'ALL').trim().toLowerCase();
    const pCatName = String(p.categoryName || p.category?.name || '').trim().toLowerCase();
    const pCatId = String(p.categoryId || p.category?.id || '').trim().toLowerCase();
    const matchesCategory = catStr === 'all' || pCatName === catStr || pCatId === catStr;
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

const barcodeIndexCache = new WeakMap();

export function findProductByBarcode(products, rawBarcode) {
  if (!Array.isArray(products) || products.length === 0) return null;
  const barcode = String(rawBarcode || '').trim().toLowerCase();
  if (!barcode) return null;

  let index = barcodeIndexCache.get(products);
  if (!index) {
    index = new Map();
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (p.isActive === false || p.isactive === 'N') continue;
      if (
        p.isIngredient === true || 
        p.is_ingredient === true || 
        String(p.isIngredient).toUpperCase() === 'Y' || 
        String(p.is_ingredient).toUpperCase() === 'Y'
      ) {
        continue;
      }
      const pBarcode = String(p.barcode || '').trim().toLowerCase();
      const pCode = String(p.productCode || '').trim().toLowerCase();
      if (pBarcode) {
        index.set(pBarcode, p);
        const stripped = pBarcode.replace(/^0+/, '');
        if (stripped && !index.has(stripped)) index.set(stripped, p);
      }
      if (pCode && !index.has(pCode)) {
        index.set(pCode, p);
      }
    }
    barcodeIndexCache.set(products, index);
  }

  // O(1) direct lookup
  let match = index.get(barcode);
  if (match) return match;

  const stripped = barcode.replace(/^0+/, '');
  if (stripped && (match = index.get(stripped))) {
    return match;
  }

  // Fallback EAN-13 / UPC 12-to-13 tolerance if not in map
  if (barcode.length === 12 || barcode.length === 13) {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const pBarcode = String(p.barcode || '').trim().toLowerCase();
      if (barcode.length === 13 && pBarcode.length === 12 && (barcode.startsWith(pBarcode) || barcode.endsWith(pBarcode))) return p;
      if (barcode.length === 12 && pBarcode.length === 13 && (pBarcode.startsWith(barcode) || pBarcode.endsWith(barcode))) return p;
    }
  }

  return null;
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
