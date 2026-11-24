// Category tab order is decided on the server (sequence, A-Z, most sold, ...).
// These helpers only preserve that order on the client - they never re-sort.

const nameOf = (c) => (typeof c === 'string' ? c : c?.name);

/** Names in the incoming (server) order, blanks and duplicates removed. */
export function keepCategoryOrder(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const n = nameOf(c);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Re-orders the categories derived from products (['ALL', ...names]) using the server order.
 * Categories missing from the server list keep their relative order at the end.
 */
export function applyCategoryOrder(extractedCats, orderedBeans) {
  const extracted = Array.isArray(extractedCats) ? extractedCats : ['ALL'];
  if (!Array.isArray(orderedBeans) || orderedBeans.length === 0) return extracted;
  const names = extracted.filter((c) => c !== 'ALL');
  const byLower = new Map(names.map((n) => [String(n).toLowerCase(), n]));
  const ordered = [];
  const used = new Set();
  for (const b of orderedBeans) {
    const key = String(nameOf(b) || '').toLowerCase();
    const match = byLower.get(key);
    if (match && !used.has(match)) {
      used.add(match);
      ordered.push(match);
    }
  }
  const rest = names.filter((n) => !used.has(n));
  return ['ALL', ...ordered, ...rest];
}
