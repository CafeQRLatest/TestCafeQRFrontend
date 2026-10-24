import { useState, useEffect } from 'react';
import api from '../utils/api';

// Currency display settings come from the default currency in Currency Master.
// One request is shared by every screen so the symbol and decimal places stay consistent.
let currencyPromise = null;

function loadCurrencyConfig() {
  if (!currencyPromise) {
    currencyPromise = api.get('/api/v1/configurations')
      .then(res => {
        const cfg = res.data?.data || res.data || {};
        const decimals = Number.isInteger(cfg.currencyDecimalPlaces) ? cfg.currencyDecimalPlaces : 2;
        return { symbol: cfg.currencySymbol || '', decimals };
      })
      .catch(() => {
        currencyPromise = null;
        return { symbol: '', decimals: 2 };
      });
  }
  return currencyPromise;
}

export function useCurrencyConfig() {
  const [currency, setCurrency] = useState({ symbol: '', decimals: 2 });

  useEffect(() => {
    let active = true;
    loadCurrencyConfig().then(value => {
      if (active) setCurrency(value);
    });
    return () => { active = false; };
  }, []);

  return currency;
}

export function useCurrencySymbol() {
  return useCurrencyConfig().symbol;
}

export function useCurrencyDecimals() {
  return useCurrencyConfig().decimals;
}
