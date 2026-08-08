import React from 'react';
import { FaSearch } from 'react-icons/fa';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';

export default function PurchaseFilters({
  fromDate, setFromDate,
  toDate, setToDate,
  filterStatus, setFilterStatus,
  filterVendor, setFilterVendor,
  filterWarehouse, setFilterWarehouse,
  filterPayMethod, setFilterPayMethod,
  filterSearch, handleFilterSearchChange,
  payMethodOptions = [],
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
          { value: 'CONFIRMED', label: 'Completed' },
          { value: 'COMPLETED', label: 'Received' },
          { value: 'VOID', label: 'Voided' }
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

      {/* Filter Payment Method — dynamically from Payment Type Master */}
      <NiceSelect 
        className="nice-select"
        value={filterPayMethod} 
        onChange={setFilterPayMethod} 
        options={[
          { value: '', label: 'All Payments' },
          ...(payMethodOptions && payMethodOptions.length > 0 ? payMethodOptions : [
            { value: 'CASH', label: 'Cash' },
            { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
            { value: 'UPI', label: 'UPI / Digital' },
            { value: 'CARD', label: 'Card' },
            { value: 'CHEQUE', label: 'Cheque' },
            { value: 'CREDIT', label: 'Credit' }
          ])
        ]}
      />

      {/* Search Input on far right with icon — expands to fill remaining space */}
      <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
        <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '11px', pointerEvents: 'none' }} />
        <input
          type="text"
          className={styles['hist-search-input']}
          placeholder="Search PO No. or reference…"
          value={filterSearch || ''}
          onChange={e => handleFilterSearchChange(e.target.value)}
          style={{
            width: '100%',
            height: '32px',
            paddingLeft: '30px',
            paddingRight: '12px',
            border: '1.5px solid #e2e8f0',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#1e293b',
            background: '#f8fafc',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease'
          }}
          onFocus={e => { e.target.style.borderColor = '#f97316'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
        />
      </div>
    </div>
  );
}


