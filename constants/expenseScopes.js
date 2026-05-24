/**
 * Shared scope constants for the expense domain.
 * Used by useExpenses, ExpenseForm, ExpenseFilters, and the expenses page.
 */
export const SCOPE_ALL    = 'ALL';
export const SCOPE_GLOBAL = 'GLOBAL';

/**
 * Maps ISO 4217 currency codes to their display symbols.
 * Extend as new tenants are onboarded.
 */
const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  JPY: '¥',
  CNY: '¥',
  MYR: 'RM',
  THB: '฿',
  LKR: 'Rs',
  BDT: '৳',
  NPR: 'Rs',
};

/**
 * Returns the display symbol for a given ISO 4217 currency code.
 * Falls back to the code itself so unknown currencies still display something meaningful.
 *
 * @param {string|null|undefined} currencyCode — e.g. "INR", "USD"
 * @returns {string}
 */
export function getCurrencySymbol(currencyCode) {
  if (!currencyCode) return '₹'; // INR default for existing tenants
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? currencyCode;
}
