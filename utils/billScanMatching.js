// Matching rules for the AI purchase bill scanner: which existing product a scanned bill line belongs to.

export const cleanStr = (val, fb = '') => String(val ?? fb).trim();
export const normalizeKey = (val) => cleanStr(val).toLowerCase().replace(/[^a-z0-9]/g, '');

export const isIngredientProduct = (p) =>
  p?.isIngredient === true || String(p?.productType).toUpperCase() === 'INGREDIENT';

// Pack size, weight, volume and count tokens ("300g", "1l", "x20", "72p"). Different sizes are different SKUs.
const SIZE_UNIT_ALIASES = [
  [/^(gms|gm|grams?)$/, 'g'],
  [/^(kgs|kilos?)$/, 'kg'],
  [/^(ltrs?|litres?|liters?)$/, 'l'],
  [/^(pcs|pc|pkts?|packs?|nos?)$/, 'p'],
];

export const sizeTokens = (name) => {
  const text = cleanStr(name).toLowerCase();
  const tokens = [];
  const re = /(\d+(?:\.\d+)?)\s*(kgs?|kilos?|gms?|grams?|g|ml|ltrs?|litres?|liters?|l|pcs|pc|pkts?|packs?|nos?|p)\b|x\s*(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[3]) {
      tokens.push(`${Number(m[3])}p`);
      continue;
    }
    let unit = m[2];
    for (const [pattern, canonical] of SIZE_UNIT_ALIASES) {
      if (pattern.test(unit)) { unit = canonical; break; }
    }
    tokens.push(`${Number(m[1])}${unit}`);
  }
  return [...new Set(tokens)];
};

// True when the names do not state conflicting sizes. A name without any size cannot conflict.
export const sizesCompatible = (a, b) => {
  const sa = sizeTokens(a);
  const sb = sizeTokens(b);
  if (!sa.length || !sb.length) return true;
  const [shorter, longer] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  return shorter.every(t => longer.includes(t));
};

const wordsOf = (name) => cleanStr(name).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !/^\d/.test(t));

/**
 * Finds the existing product for a scanned bill line.
 * Returns { matchedProduct, isIngredient, confidence } where confidence is HIGH, MEDIUM or NEW.
 */
export const matchBillItem = (extractedItem, productsList = []) => {
  const fullName = cleanStr(extractedItem?.name || extractedItem?.rawName);
  const billNameKey = normalizeKey(fullName);
  const catalogCandidateKey = normalizeKey(extractedItem?.matchedCatalogItem);
  const named = productsList.filter(p => cleanStr(p?.name));

  // 1. AI picked a catalog item: accept it only if it exists and its size does not conflict with the bill line
  if (catalogCandidateKey) {
    const direct = named.find(p => normalizeKey(p.name) === catalogCandidateKey);
    if (direct && sizesCompatible(fullName, direct.name)) {
      return { matchedProduct: direct, isIngredient: isIngredientProduct(direct), confidence: 'HIGH' };
    }
  }

  // 2. Exact name match (ignoring case, spaces and punctuation)
  if (billNameKey) {
    const exact = named.find(p => normalizeKey(p.name) === billNameKey);
    if (exact) {
      return { matchedProduct: exact, isIngredient: isIngredientProduct(exact), confidence: 'HIGH' };
    }
  }

  // 3. Fuzzy match. Never match across conflicting pack sizes, and require most words to agree,
  //    so "Marie Gold 120g" is not booked into "Marie Gold 300g".
  const tokens = wordsOf(fullName);
  let bestMatch = null;
  let bestScore = 0;

  for (const p of named) {
    if (!sizesCompatible(fullName, p.name)) continue;

    const pNameKey = normalizeKey(p.name);
    if (billNameKey && pNameKey.length >= 6 && billNameKey.includes(pNameKey)) {
      return { matchedProduct: p, isIngredient: isIngredientProduct(p), confidence: 'MEDIUM' };
    }

    const pTokens = wordsOf(p.name);
    if (!pTokens.length || !tokens.length) continue;
    const overlap = tokens.filter(t => pTokens.some(pt => pt === t || (pt.length > 4 && t.includes(pt))));
    const ratio = overlap.length / Math.min(tokens.length, pTokens.length);
    if (overlap.length >= 2 && ratio >= 0.6 && overlap.length > bestScore) {
      bestScore = overlap.length;
      bestMatch = p;
    }
  }

  if (bestMatch) {
    return { matchedProduct: bestMatch, isIngredient: isIngredientProduct(bestMatch), confidence: 'MEDIUM' };
  }

  // 4. No match: a new item, using the AI's ingredient guess
  return {
    matchedProduct: null,
    isIngredient: Boolean(extractedItem?.isIngredientLikely),
    confidence: 'NEW',
  };
};

// Local "YYYY-MM-DDTHH:mm" for the date-time picker (toISOString would shift it to UTC).
export const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Bill dates like "2026-11-10" are calendar dates; read them as local, not UTC midnight.
export const parseBillDate = (raw) => {
  const text = cleanStr(raw);
  if (!text) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(text);
  return isNaN(d.getTime()) ? null : d;
};

// Units that mean the same thing. Each group lists the spellings that can appear on a bill.
const UOM_GROUPS = [
  ['kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']],
  ['g', ['g', 'gm', 'gms', 'gr', 'gram', 'grams']],
  ['l', ['l', 'ltr', 'ltrs', 'lt', 'litre', 'litres', 'liter', 'liters']],
  ['ml', ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters']],
  ['pcs', ['pc', 'pcs', 'pce', 'pces', 'piece', 'pieces', 'no', 'nos', 'nr', 'each', 'ea', 'unit', 'units']],
  ['pkt', ['pkt', 'pkts', 'pk', 'pack', 'packs', 'packet', 'packets']],
  ['box', ['box', 'boxes', 'bx', 'cb']],
  ['carton', ['ctn', 'ctns', 'carton', 'cartons']],
  ['dozen', ['doz', 'dozen', 'dozens']],
  ['bag', ['bag', 'bags', 'sack', 'sacks']],
  ['tin', ['tin', 'tins']],
  ['can', ['can', 'cans']],
  ['bottle', ['bottle', 'bottles', 'btl', 'btls']],
];

// Letters only, lowercase: "Kgs." -> "kgs", "Pkt (500g)" -> "pktg".
const uomKey = (val) => cleanStr(val).toLowerCase().replace(/[^a-z]/g, '');

/**
 * Maps a unit label from the bill to a UOM from Product Management.
 * uoms: [{ name, shortName, uomPrecision }] (active UOMs for the branch).
 * Returns { uom, matched, invoiceUnit } where uom is the matched UOM record or null.
 */
export const resolveBillUom = (rawLabel, uoms = []) => {
  const invoiceUnit = cleanStr(rawLabel);
  const key = uomKey(invoiceUnit);
  if (!key || !uoms.length) {
    return { uom: null, matched: false, invoiceUnit };
  }

  // 1. The bill uses the exact name or short name of a configured UOM
  const exact = uoms.find(u => uomKey(u.name) === key || uomKey(u.shortName) === key);
  if (exact) {
    return { uom: exact, matched: true, invoiceUnit };
  }

  // 2. A known alias of a configured UOM (e.g. "KGS" -> "Kg", "PKT" -> "Packet")
  const group = UOM_GROUPS.find(([, spellings]) => spellings.includes(key));
  if (group) {
    const [canonical, spellings] = group;
    const byAlias = uoms.find(u => spellings.includes(uomKey(u.name)) || spellings.includes(uomKey(u.shortName))
      || uomKey(u.name) === canonical || uomKey(u.shortName) === canonical);
    if (byAlias) {
      return { uom: byAlias, matched: true, invoiceUnit };
    }
  }

  // 3. No configured UOM fits: the user must pick one
  return { uom: null, matched: false, invoiceUnit };
};
