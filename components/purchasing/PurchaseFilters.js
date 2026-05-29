import React from 'react';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';

export default function PurchaseFilters({
  fromDate, setFromDate,
  toDate, setToDate,
  filterStatus, setFilterStatus,
  filterVendor, setFilterVendor,
  filterWarehouse, setFilterWarehouse,
  filterPayMethod, setFilterPayMethod,
  vendorOptions, warehouseOptions,
  styles
}) {
  return (
    <div className={styles['hist-filters']}>
      {/* Dates container */}
      <div className={styles['hist-dates']}>
        <PremiumDateTimePicker value={fromDate} onChange={setFromDate} />
        <span className={styles['h-filter-sep']}>to</span>
        <PremiumDateTimePicker value={toDate} onChange={setToDate} />
      </div>

      {/* Filter Status */}
      <NiceSelect 
        className="nice-select"
        value={filterStatus} 
        onChange={setFilterStatus} 
        options={[
          { value: 'ALL', label: 'All Status' },
          { value: 'DRAFT', label: 'Drafts' },
          { value: 'CONFIRMED', label: 'Confirmed' },
          { value: 'COMPLETED', label: 'Received' },
          { value: 'CANCELLED', label: 'Cancelled' }
        ]}
      />

      {/* Filter Vendor */}
      <NiceSelect 
        className="nice-select"
        value={filterVendor} 
        onChange={setFilterVendor} 
        options={[{ value: '', label: 'All Vendors' }, ...vendorOptions]}
      />

      {/* Filter Warehouse */}
      <NiceSelect 
        className="nice-select"
        value={filterWarehouse} 
        onChange={setFilterWarehouse} 
        options={[{ value: '', label: 'All Warehouses' }, ...warehouseOptions]}
      />

      {/* Filter Payment Method */}
      <NiceSelect 
        className="nice-select"
        value={filterPayMethod} 
        onChange={setFilterPayMethod} 
        options={[
          { value: '', label: 'All Payments' },
          { value: 'CASH', label: 'Cash' },
          { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
          { value: 'UPI', label: 'UPI / Digital' },
          { value: 'CARD', label: 'Card' },
          { value: 'CHEQUE', label: 'Cheque' }
        ]}
      />
    </div>
  );
}
