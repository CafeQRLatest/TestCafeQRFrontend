export function filterCustomers({ allCustomers, customerName, customerPhone, customersEnabled }) {
  if (!customersEnabled || !Array.isArray(allCustomers)) return [];
  
  const lowerName = String(customerName || '').trim().toLowerCase();
  const phoneVal = String(customerPhone || '').trim();
  
  if (!lowerName && !phoneVal) return [];

  return allCustomers.filter(c => {
    const matchesPhone = phoneVal.length > 0 ? (c.phone && String(c.phone).includes(phoneVal)) : false;
    const matchesName = lowerName.length > 0 ? (c.name && String(c.name).toLowerCase().includes(lowerName)) : false;
    return matchesPhone || matchesName;
  }).slice(0, 8);
}
