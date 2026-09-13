import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { fetchCustomerLoyalty, fetchLoyaltyPrograms, prefetchCustomerLoyalty } from '../../../services/loyaltyApi';
import { isLoyaltyModuleEnabled } from '../../../utils/moduleVisibility';
import { searchPosCustomers } from '../services/posSaleApi';

/**
 * High-Performance POS Customer Selection Hook (V2)
 * 
 * Performance & Architecture:
 * - NO initial download of thousands of customer records into client memory.
 * - On-demand, debounced server search via /api/v1/pos/sale/customers?q=... (sub-5ms index scan).
 * - Automatic loyalty resolution on selection or exact match.
 * - Same exact interface as CounterSale's useCustomerSelection for 100% component compatibility.
 */
export default function usePosCustomerSelection({
  creditCustomers = [],
  customersEnabled = true,
  config,
  sym = '₹'
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAge, setCustomerAge] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);

  // On-demand search results
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const loyaltyActive = Boolean(isLoyaltyModuleEnabled(config) || config?.loyaltyEnabled === true);

  // Fetch live loyalty points immediately when customer is selected
  useEffect(() => {
    if (!loyaltyActive || !selectedCustomerId) return;
    let active = true;

    fetchCustomerLoyalty(selectedCustomerId, true)
      .then(loyData => {
        if (!active || !loyData) return;
        setSelectedCustomer(prev => {
          if (!prev) return { id: selectedCustomerId, name: customerName, phone: customerPhone, loyaltyPoints: loyData.currentPoints, customerLoyalty: loyData };
          return { ...prev, loyaltyPoints: loyData.currentPoints, customerLoyalty: loyData };
        });
      })
      .catch(() => {});

    fetchLoyaltyPrograms().catch(() => {});

    return () => { active = false; };
  }, [selectedCustomerId, loyaltyActive]);

  // On-demand debounced search when user types in name or phone
  useEffect(() => {
    if (!customersEnabled || selectedCustomerId) {
      setSearchResults([]);
      return;
    }

    const cleanPhone = String(customerPhone || '').trim();
    const cleanName = String(customerName || '').trim();
    const query = cleanPhone || cleanName;

    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearching(true);
      try {
        const results = await searchPosCustomers(query, 20, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setSearchResults(results || []);

          // Auto-select if exact 10-digit phone match found
          if (cleanPhone.length >= 10 && results && results.length === 1) {
            const exactMatch = results[0];
            if (exactMatch && String(exactMatch.phone).trim() === cleanPhone) {
              setSelectedCustomerId(exactMatch.id);
              setSelectedCustomer(exactMatch);
              setShowCustomerDropdown(false);
            }
          }
        }
      } catch (err) {
        if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
          console.warn('Customer on-demand search failed', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 150);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [customerPhone, customerName, selectedCustomerId, customersEnabled]);

  const toggleCreditSale = useCallback(() => {
    setIsCreditSale(prev => {
      const next = !prev;
      if (next) {
        setSelectedCustomerId(null);
        setSelectedCustomer(null);
        setSelectedCustomers([]);
        setShowCustomerDropdown(false);
      } else {
        setSelectedCreditCustomerId('');
      }
      return next;
    });
  }, []);

  const selectCustomer = useCallback((cust) => {
    if (!customersEnabled) return;

    if (cust?.id) {
      prefetchCustomerLoyalty(cust.id);
    }
    setSelectedCustomer(cust);

    if (config?.allowMultipleCustomersPerOrder) {
      setSelectedCustomers(prev => {
        if (!prev.find(c => c.id === cust.id)) {
          return [...prev, cust];
        }
        return prev;
      });
      setCustomerPhone('');
      setCustomerName('');
    } else {
      setSelectedCustomerId(cust.id);
      setCustomerPhone(cust.phone || '');
      setCustomerName(cust.name || '');
    }
    setShowCustomerDropdown(false);
    setSearchResults([]);
  }, [customersEnabled, config]);

  const removeCustomer = useCallback((id) => {
    if (!customersEnabled) return;

    if (id === selectedCustomerId) {
      setSelectedCustomerId(null);
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
    } else {
      setSelectedCustomers(prev => prev.filter(c => c.id !== id));
    }
    setSearchResults([]);
  }, [customersEnabled, selectedCustomerId]);

  const handleCustomerKeyDown = useCallback((e) => {
    if (!customersEnabled) return;
    if (e.key === 'Enter') {
      setShowCustomerDropdown(false);
    }
  }, [customersEnabled]);

  const clearCustomerSelection = useCallback(() => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAge('');
    setSelectedCustomerId(null);
    setSelectedCustomer(null);
    setSelectedCustomers([]);
    setShowCustomerDropdown(false);
    setSearchResults([]);
    setSelectedCreditCustomerId('');
    setIsCreditSale(false);
    setShowNewCreditCustomer(false);
  }, []);

  const handleCreditCustomerCreated = useCallback((customer, setCreditCustomers, onCreditCustomerCreated) => {
    if (!customer?.id) return;
    if (typeof setCreditCustomers === 'function') {
      setCreditCustomers(current => {
        const next = [customer, ...current.filter(item => String(item.id) !== String(customer.id))];
        return next.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
      });
    }
    setSelectedCreditCustomerId(customer.id);
    if (typeof onCreditCustomerCreated === 'function') {
      onCreditCustomerCreated(customer);
    }
  }, []);

  const selectedCreditCustomer = useMemo(() => {
    if (!Array.isArray(creditCustomers)) return null;
    return creditCustomers.find(c => String(c.id) === String(selectedCreditCustomerId)) || null;
  }, [creditCustomers, selectedCreditCustomerId]);

  const creditCustomerOptions = useMemo(() => {
    if (!Array.isArray(creditCustomers)) return [];
    const dp = config?.currencyDecimalPlaces ?? 2;
    return creditCustomers.map(customer => ({
      value: customer.id,
      label: `${customer.name || 'Credit Customer'}${customer.phone ? ` (${customer.phone})` : ''} - ${sym}${Number(customer.balance || 0).toFixed(dp)}`,
    }));
  }, [creditCustomers, config, sym]);

  const getCreditLimitWarning = useCallback((totalIncTax) => {
    if (!selectedCreditCustomer) return '';
    const limit = Number(selectedCreditCustomer.creditLimit || 0);
    const dp = config?.currencyDecimalPlaces ?? 2;
    if (limit <= 0) return '';
    const projected = Number(selectedCreditCustomer.balance || 0) + Number(totalIncTax || 0);
    if (projected > limit) {
      return `Credit limit warning: projected balance ${sym}${projected.toFixed(dp)} exceeds ${sym}${limit.toFixed(dp)}.`;
    }
    return '';
  }, [selectedCreditCustomer, config, sym]);

  const getCustomerSelectionsList = useCallback(() => {
    if (!customersEnabled) return [];

    const selections = [];
    const seen = new Set();
    
    const addSelection = (customer) => {
      if (!customer) return;
      const name = String(customer.name || '').trim();
      const phone = String(customer.phone || '').trim();
      const id = customer.id || null;
      if (!id && !name && !phone) return;
      const key = id ? `id:${id}` : phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      selections.push({ id, name: name || null, phone: phone || null });
    };

    if (config?.allowMultipleCustomersPerOrder) {
      selectedCustomers.forEach(addSelection);
      addSelection({ name: customerName, phone: customerPhone });
    } else if (selectedCustomerId) {
      addSelection({ id: selectedCustomerId, name: customerName, phone: customerPhone });
    } else {
      addSelection({ name: customerName, phone: customerPhone });
    }

    return selections;
  }, [customersEnabled, config, selectedCustomers, customerName, customerPhone, selectedCustomerId]);

  return {
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerAge,
    setCustomerAge,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    setSelectedCustomer,
    selectedCustomers,
    setSelectedCustomers,
    showCustomerDropdown,
    setShowCustomerDropdown,
    selectedCreditCustomerId,
    setSelectedCreditCustomerId,
    isCreditSale,
    setIsCreditSale,
    showNewCreditCustomer,
    setShowNewCreditCustomer,
    toggleCreditSale,
    selectCustomer,
    removeCustomer,
    handleCustomerKeyDown,
    handleCreditCustomerCreated,
    filteredCustomers: searchResults, // On-demand fast results!
    searching,
    selectedCreditCustomer,
    creditCustomerOptions,
    getCreditLimitWarning,
    getCustomerSelectionsList,
    clearCustomerSelection
  };
}
