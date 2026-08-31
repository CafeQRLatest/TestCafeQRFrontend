import { useState, useMemo, useCallback, useEffect } from 'react';
import { filterCustomers } from '../domain/customers';
import { fetchCustomerLoyalty, fetchLoyaltyPrograms, prefetchCustomerLoyalty } from '../../../services/loyaltyApi';
import { isLoyaltyModuleEnabled } from '../../../utils/moduleVisibility';

export default function useCustomerSelection({
  allCustomers,
  creditCustomers,
  customersEnabled,
  config,
  sym
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

  const loyaltyActive = Boolean(isLoyaltyModuleEnabled(config) || config?.loyaltyEnabled === true);

  // Fetch live loyalty points immediately when customer is selected or typed (only if loyalty is enabled)
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

  // Auto-match typed phone/name against allCustomers for instant loyalty loading
  useEffect(() => {
    if (!customersEnabled || selectedCustomerId) return;
    const cleanPhone = String(customerPhone || '').trim();
    const cleanName = String(customerName || '').trim();
    if (!cleanPhone && !cleanName) return;

    if (Array.isArray(allCustomers) && allCustomers.length > 0) {
      let match = null;
      if (cleanPhone.length >= 6) {
        match = allCustomers.find(c => c.phone && String(c.phone).trim() === cleanPhone);
      }
      if (!match && cleanName.length >= 2 && !cleanPhone) {
        match = allCustomers.find(c => c.name && String(c.name).trim().toLowerCase() === cleanName.toLowerCase());
      }
      if (match?.id) {
        setSelectedCustomerId(match.id);
        setSelectedCustomer(match);
      }
    }
  }, [customerPhone, customerName, allCustomers, selectedCustomerId, customersEnabled]);

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

  const filteredCustomers = useMemo(() => {
    return filterCustomers({
      allCustomers,
      customerName,
      customerPhone,
      customersEnabled
    });
  }, [allCustomers, customerName, customerPhone, customersEnabled]);

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
    filteredCustomers,
    selectedCreditCustomer,
    creditCustomerOptions,
    getCreditLimitWarning,
    getCustomerSelectionsList,
    clearCustomerSelection
  };
}
