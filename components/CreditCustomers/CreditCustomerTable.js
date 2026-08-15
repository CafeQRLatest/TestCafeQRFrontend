import React, { useState, useMemo, useEffect } from 'react';
import CreditCustomerRow from './CreditCustomerRow';
import PageSizeSelect from './PageSizeSelect';

export default function CreditCustomerTable({
  customers = [],
  expandedCustomer,
  activeTab,
  setActiveTab,
  ordersByCustomer,
  paymentsByCustomer,
  timezone,
  money,
  openPayment,
  toggleOrders,
  toggleStatus,
  openForm,
  handleViewOrder,
  handleViewPayment,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [customers.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));

  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return customers.slice(start, start + pageSize);
  }, [customers, page, pageSize]);

  const startRecord = customers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, customers.length);

  return (
    <div className="rpt-tbl-wrap">
      <table className="rpt-tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th className="r">Balance</th>
            <th className="r">Total Credit</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedCustomers.map((customer) => (
            <CreditCustomerRow
              key={customer.id}
              customer={customer}
              expandedCustomer={expandedCustomer}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              orders={ordersByCustomer[customer.id] || []}
              payments={paymentsByCustomer[customer.id] || []}
              timezone={timezone}
              money={money}
              openPayment={openPayment}
              toggleOrders={toggleOrders}
              toggleStatus={toggleStatus}
              openForm={openForm}
              handleViewOrder={handleViewOrder}
              handleViewPayment={handleViewPayment}
            />
          ))}
          {customers.length === 0 && (
            <tr>
              <td colSpan={6} className="rpt-empty">
                No credit customers found matching your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {customers.length > 0 && (
        <div className="pagination-bar">
          <PageSizeSelect
            value={pageSize}
            options={[10, 25, 50, 100]}
            onChange={setPageSize}
            label="Show per page"
          />
          <span className="pg-info">
            Showing {startRecord}–{endRecord} of {customers.length} customers (Page {page} of {totalPages})
          </span>
          <div className="pg-controls">
            <button
              type="button"
              className="pg-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="pg-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
