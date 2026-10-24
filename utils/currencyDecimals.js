import api from './api';

// Decimal places of the default currency in Currency Master, for code paths that are not React components.
export async function loadCurrencyDecimals() {
  try {
    const res = await api.get('/api/v1/configurations');
    const dp = res.data?.data?.currencyDecimalPlaces ?? res.data?.currencyDecimalPlaces;
    return Number.isInteger(dp) ? dp : 2;
  } catch {
    return 2;
  }
}
