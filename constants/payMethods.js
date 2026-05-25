export const PAY_METHODS = [
  { value: 'CASH',   label: 'Cash' },
  { value: 'CARD',   label: 'Card' },
  { value: 'UPI',    label: 'UPI' },
  { value: 'BANK',   label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'MIXED',  label: 'Mixed' }
];

export const prettyMethod = (m) => {
  const method = PAY_METHODS.find(p => p.value === m);
  return method ? method.label : (m || 'Other');
};
