import React, { useMemo } from 'react';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';
import { PAY_METHODS } from '../../constants/payMethods';
import { SCOPE_ALL, SCOPE_GLOBAL } from '../../constants/expenseScopes';
import styles from './Expenses.module.css';

export default function ExpenseFilters({
  filters,
  dispatch,
  categories,
  branches,
  isSuperAdmin,
  paymentTypes = []
}) {
  const branchFilterOptions = [
    { value: SCOPE_ALL,    label: 'All Branches' },
    { value: SCOPE_GLOBAL, label: 'Organization' },
    ...branches.map(b => ({ value: b.id, label: b.name }))
  ];

  const paymentOptions = useMemo(() => {
    if (!paymentTypes || paymentTypes.length === 0) {
      return [
        { value: '', label: 'All Payments' },
        ...PAY_METHODS
      ];
    }
    const activeTypes = paymentTypes
      .filter(pt => (pt.isActive ?? pt.isactive ?? 'Y') === 'Y')
      .map(pt => ({
        value: (pt.displayName || pt.name || '').toUpperCase(),
        label: pt.displayName || pt.name
      }));
    return [
      { value: '', label: 'All Payments' },
      ...activeTypes
    ];
  }, [paymentTypes]);

  return (
    <div className={styles['exp-filter-bar']}>
      <div className={styles['exp-dates']}>
        <PremiumDateTimePicker
          value={filters.dateFrom}
          onChange={val => dispatch({ field: 'dateFrom', value: val })}
        />
        <span className={styles['date-sep']}>→</span>
        <PremiumDateTimePicker
          value={filters.dateTo}
          onChange={val => dispatch({ field: 'dateTo', value: val })}
        />
      </div>

      <NiceSelect
        value={filters.status}
        onChange={val => dispatch({ field: 'status', value: val })}
        options={[
          { value: 'ACTIVE', label: 'Completed' },
          { value: 'VOID',   label: 'Voided' }
        ]}
        placeholder="All Status"
      />

      <NiceSelect
        options={[
          { value: '', label: 'All Categories' },
          ...categories.map(c => ({ value: c.id, label: c.name }))
        ]}
        value={filters.category}
        onChange={val => dispatch({ field: 'category', value: val })}
      />

      <NiceSelect
        options={paymentOptions}
        value={filters.payMethod}
        onChange={val => dispatch({ field: 'payMethod', value: val })}
      />

      {isSuperAdmin && (
        <NiceSelect
          options={branchFilterOptions}
          value={filters.branch}
          onChange={val => dispatch({ field: 'branch', value: val })}
        />
      )}
    </div>
  );
}
