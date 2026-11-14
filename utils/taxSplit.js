/**
 * Tax split helper — breaks a bill's tax into the named components configured
 * per tax rule in Tax Settings (e.g. "CGST 9%" + "SGST 9%" for an 18% rule).
 *
 * Nothing here is country-specific: component names and percentages come only
 * from the tenant's configuration. When splitting is off, or a rule has no
 * valid components, that rate is shown as one line using the global tax label.
 *
 * Lines are matched to a rule by rate value (lines store the rate, not the rule id).
 */

const EPS = 0.0001;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const roundTo = (v, dp) => {
  const f = Math.pow(10, dp);
  return Math.round((v + Number.EPSILON) * f) / f;
};

/** "2.50" → "2.5", "9" → "9" */
export const formatRate = (rate) => String(Number(toNum(rate).toFixed(4)));

/**
 * Normalises the configured tax rules. Accepts the API shape (camelCase objects),
 * legacy flat numbers, or JSON strings.
 */
export function normalizeTaxRates(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((r, i) => {
      if (r == null) return null;
      if (typeof r !== 'object') {
        return { id: `tr-${i}`, name: '', value: toNum(r), components: [] };
      }
      const components = Array.isArray(r.components)
        ? r.components
            .filter(c => c && String(c.name || '').trim() !== '')
            .map(c => ({ name: String(c.name).trim(), value: toNum(c.value) }))
        : [];
      return { id: r.id, name: r.name || '', value: toNum(r.value), components };
    })
    .filter(Boolean);
}

/** Components are usable only when they exist and add up to the rule's rate. */
export function hasValidComponents(rule) {
  if (!rule || !Array.isArray(rule.components) || rule.components.length === 0) return false;
  const sum = rule.components.reduce((s, c) => s + toNum(c.value), 0);
  return Math.abs(sum - toNum(rule.value)) < EPS && rule.components.every(c => toNum(c.value) > 0);
}

/** Returns a list of human-readable problems with configured components (empty = OK). */
export function validateTaxRateComponents(rates) {
  const problems = [];
  normalizeTaxRates(rates).forEach(rule => {
    if (rule.components.length === 0) return;
    const sum = rule.components.reduce((s, c) => s + c.value, 0);
    if (Math.abs(sum - rule.value) >= EPS) {
      problems.push(`${rule.name || `${formatRate(rule.value)}%`}: components add up to ${formatRate(sum)}%, rule is ${formatRate(rule.value)}%`);
    }
    const names = rule.components.map(c => c.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      problems.push(`${rule.name || `${formatRate(rule.value)}%`}: component names must be unique`);
    }
    if (rule.components.some(c => c.value <= 0)) {
      problems.push(`${rule.name || `${formatRate(rule.value)}%`}: every component needs a percentage above 0`);
    }
  });
  return problems;
}

export function findRuleForRate(rates, rate) {
  return normalizeTaxRates(rates).find(r => Math.abs(r.value - toNum(rate)) < EPS) || null;
}

const lineRate = (l) => toNum(l?.taxRate ?? l?.tax_rate ?? l?.taxSnapshotRate ?? l?.tax_snapshot_rate);
const lineTax = (l) => toNum(l?.taxAmount ?? l?.tax_amount);
const lineTaxable = (l) => toNum(l?.taxableAmount ?? l?.taxable_amount);

/**
 * Splits `tax` across components proportionally to their share of `rate`.
 * Rounds each component and gives the rounding remainder to the last one,
 * so the parts always add back to the exact tax amount.
 */
function splitAmount(tax, rate, components, dp) {
  let allocated = 0;
  return components.map((c, idx) => {
    const amount = idx === components.length - 1
      ? roundTo(tax - allocated, dp)
      : roundTo(rate > 0 ? (tax * c.value) / rate : 0, dp);
    allocated += amount;
    return { name: c.name, rate: c.value, amount };
  });
}

/**
 * Builds the tax breakdown for a bill.
 *
 * @param {object} p
 * @param {Array}  p.lines        order/invoice lines (taxRate, taxAmount, taxableAmount; camel or snake case)
 * @param {number} p.totalTax     bill-level total tax (used when lines carry no tax detail)
 * @param {Array}  p.taxRates     configured tax rules (with optional `components`)
 * @param {boolean} p.splitEnabled tax split switch from Tax Settings
 * @param {string} p.taxLabel     global tax label (e.g. "GST", "VAT")
 * @param {number} [p.decimals=2] currency decimal places
 * @returns {{ groups: Array<{rate:number|null, taxable:number, tax:number, components:Array}>,
 *             summaryLines: Array<{label:string, name:string, rate:number|null, amount:number}>,
 *             isSplit: boolean }}
 */
export function buildTaxBreakdown({ lines = [], totalTax = 0, taxRates = [], splitEnabled = false, taxLabel = 'Tax', decimals = 2 } = {}) {
  const dp = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
  const label = String(taxLabel || 'Tax').trim() || 'Tax';
  const rules = normalizeTaxRates(taxRates);

  // 1. Group line tax by rate.
  const byRate = new Map();
  (Array.isArray(lines) ? lines : []).forEach(l => {
    const tax = lineTax(l);
    const rate = lineRate(l);
    if (tax === 0 && rate === 0) return;
    const key = rate.toFixed(4);
    const g = byRate.get(key) || { rate, taxable: 0, tax: 0 };
    g.taxable += lineTaxable(l);
    g.tax += tax;
    byRate.set(key, g);
  });

  let groups = [...byRate.values()]
    .filter(g => Math.abs(g.tax) > EPS)
    .sort((a, b) => a.rate - b.rate)
    .map(g => ({ rate: g.rate > 0 ? g.rate : null, taxable: roundTo(g.taxable, dp), tax: roundTo(g.tax, dp) }));

  // 2. Fallback: lines carry no tax detail — one group for the bill total.
  const total = toNum(totalTax);
  if (groups.length === 0 && Math.abs(total) > EPS) {
    const rates = [...new Set((lines || []).map(lineRate).filter(r => r > 0).map(r => r.toFixed(4)))];
    groups = [{ rate: rates.length === 1 ? Number(rates[0]) : null, taxable: 0, tax: roundTo(total, dp) }];
  }

  // 3. Attach components.
  let isSplit = false;
  groups = groups.map(g => {
    const rule = splitEnabled && g.rate != null ? rules.find(r => Math.abs(r.value - g.rate) < EPS) : null;
    if (rule && hasValidComponents(rule)) {
      isSplit = true;
      return { ...g, components: splitAmount(g.tax, g.rate, rule.components, dp) };
    }
    return { ...g, components: [] };
  });

  // 4. Summary lines: same-named components at the same % are merged across rates.
  const summary = new Map();
  groups.forEach(g => {
    const parts = g.components.length > 0
      ? g.components
      : [{ name: label, rate: g.rate, amount: g.tax }];
    parts.forEach(p => {
      const key = `${p.name}|${p.rate == null ? '' : toNum(p.rate).toFixed(4)}`;
      const s = summary.get(key) || { name: p.name, rate: p.rate, amount: 0 };
      s.amount = roundTo(s.amount + p.amount, dp);
      summary.set(key, s);
    });
  });
  const summaryLines = [...summary.values()].map(s => ({
    ...s,
    label: s.rate != null ? `${s.name} ${formatRate(s.rate)}%` : s.name,
  }));

  return { groups, summaryLines, isSplit };
}

/** Column headers for a tax summary table / export: one per distinct component name, in config order. */
export function componentColumns(groups) {
  const names = [];
  (groups || []).forEach(g => (g.components || []).forEach(c => {
    if (!names.includes(c.name)) names.push(c.name);
  }));
  return names;
}

/**
 * Splits rate-wise report rows ({ taxRate, taxableAmount, totalTax }) into the components
 * configured in Tax Settings. `config` is the API configuration (camelCase) or the
 * settings-page shape (snake_case). Each row gains `components: [{name, rate, amount}]`.
 */
export function splitTaxReportRows(rows, config, decimals = 2) {
  const taxRates = config?.taxRates || config?.tax_rates || [];
  const splitEnabled = (config?.taxSplitEnabled ?? config?.tax_split_enabled) === true;
  return (Array.isArray(rows) ? rows : []).map(r => {
    const { groups } = buildTaxBreakdown({
      lines: [{ taxRate: r.taxRate, taxAmount: r.totalTax, taxableAmount: r.taxableAmount }],
      taxRates, splitEnabled, decimals,
    });
    return { ...r, components: groups[0]?.components || [] };
  });
}
