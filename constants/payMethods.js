export const PAY_METHODS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'CARD',          label: 'Card' },
  { value: 'UPI',           label: 'UPI' },
  { value: 'BANK',          label: 'Bank Transfer' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE',        label: 'Cheque' },
  { value: 'CHECK',         label: 'Check' },
  { value: 'ONLINE',        label: 'Online' },
  { value: 'MIXED',         label: 'Mixed' },
  { value: 'CREDIT',        label: 'Credit' }
];

export const prettyMethod = (m) => {
  if (!m) return 'Other';
  const valUpper = m.toUpperCase();
  const method = PAY_METHODS.find(p => p.value === valUpper || p.label.toUpperCase() === valUpper);
  if (method) return method.label;
  return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
};

