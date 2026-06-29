import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { getCurrencySymbol } from '../constants/expenseScopes';

export function useCurrencySymbol() {
  const { currency } = useAuth();
  const [symbol, setSymbol] = useState(getCurrencySymbol(currency) || '₹');

  useEffect(() => {
    // Primary: use /api/v1/configurations which has full server-side fallback logic
    api.get('/api/v1/configurations')
      .then(res => {
        const sym = res.data?.data?.currencySymbol || res.data?.currencySymbol;
        if (sym) {
          setSymbol(sym);
          return;
        }
        // Secondary fallback: fetch currencies list and find default
        return api.get('/api/v1/purchasing/currencies').then(r => {
          const list = r.data?.data || r.data || [];
          const def = Array.isArray(list) ? list.find(c => c.isDefault === true) : null;
          if (def?.symbol) setSymbol(def.symbol);
        });
      })
      .catch(() => {
        // Last resort: currencies list
        api.get('/api/v1/purchasing/currencies')
          .then(res => {
            const list = res.data?.data || res.data || [];
            const def = Array.isArray(list) ? list.find(c => c.isDefault === true) : null;
            if (def?.symbol) setSymbol(def.symbol);
          })
          .catch(() => {});
      });
  }, [currency]);

  return symbol;
}
