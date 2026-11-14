import { matchBillItem, sizeTokens, sizesCompatible, parseBillDate, toLocalInputValue } from '../billScanMatching';

const catalog = [
  { id: 'p1', name: 'Britannia Marie Gold 300g', productType: 'PRODUCT' },
  { id: 'p2', name: 'Britannia Marie Gold 120g', productType: 'PRODUCT' },
  { id: 'p3', name: 'Amul Butter 500g', productType: 'INGREDIENT', isIngredient: true },
  { id: 'p4', name: 'Toned Milk 1L', productType: 'INGREDIENT', isIngredient: true },
];

describe('sizeTokens / sizesCompatible', () => {
  it('normalises units and pack counts', () => {
    expect(sizeTokens('Marie Gold 300 gms x 20 pcs')).toEqual(['300g', '20p']);
    expect(sizeTokens('Milk 1 Ltr')).toEqual(['1l']);
  });

  it('treats different sizes as incompatible and missing sizes as compatible', () => {
    expect(sizesCompatible('Marie Gold 120g', 'Marie Gold 300g')).toBe(false);
    expect(sizesCompatible('Marie Gold 300 gm x20p', 'Marie Gold 300g')).toBe(true);
    expect(sizesCompatible('Marie Gold', 'Marie Gold 300g')).toBe(true);
  });
});

describe('matchBillItem', () => {
  it('matches an existing product by name regardless of case, spacing and punctuation', () => {
    const r = matchBillItem({ name: 'BRITANNIA marie-gold 300G' }, catalog);
    expect(r.matchedProduct?.id).toBe('p1');
    expect(r.confidence).toBe('HIGH');
  });

  it('does not book a bill line into a product of a different size', () => {
    const r = matchBillItem({ name: 'Britannia Marie Gold 200g' }, catalog);
    expect(r.matchedProduct).toBeNull();
    expect(r.confidence).toBe('NEW');
  });

  it('fuzzy matches the product with the same size', () => {
    const r = matchBillItem({ name: 'Britannia Vita Marie Gold 120g' }, catalog);
    expect(r.matchedProduct?.id).toBe('p2');
    expect(r.confidence).toBe('MEDIUM');
  });

  it('accepts the AI catalog pick only when sizes agree', () => {
    expect(matchBillItem({ name: 'Amul Butter 500 gm', matchedCatalogItem: 'Amul Butter 500g' }, catalog).matchedProduct?.id).toBe('p3');
    expect(matchBillItem({ name: 'Marie Gold 120g', matchedCatalogItem: 'Britannia Marie Gold 300g' }, catalog).matchedProduct?.id).toBe('p2');
  });

  it('ignores an AI catalog pick that is not in the catalog', () => {
    const r = matchBillItem({ name: 'Fresh Paneer 1kg', matchedCatalogItem: 'Paneer 1kg', isIngredientLikely: true }, catalog);
    expect(r.matchedProduct).toBeNull();
    expect(r.isIngredient).toBe(true);
  });

  it('does not match on a single shared generic word', () => {
    const r = matchBillItem({ name: 'Amul Cheese Slices 200g' }, catalog);
    expect(r.matchedProduct).toBeNull();
  });
});

describe('bill dates', () => {
  it('reads a calendar date as local midnight, not UTC', () => {
    const d = parseBillDate('2026-11-10');
    expect(toLocalInputValue(d)).toBe('2026-11-10T00:00');
  });

  it('returns null for unreadable dates', () => {
    expect(parseBillDate('not a date')).toBeNull();
    expect(parseBillDate('')).toBeNull();
  });
});
