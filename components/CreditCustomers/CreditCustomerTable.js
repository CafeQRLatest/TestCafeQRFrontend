import React, { useState, useMemo } from 'react';
import CreditCustomerRow from './CreditCustomerRow';

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
  const pageSize = 10;

  const totalPages = Math.ceil(customers.length / pageSize);

  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return customers.slice(start, start + pageSize);
  }, [customers, page]);

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

      {totalPages > 1 && (
        <div className="pagination-bar">
          <button
            type="button"
            className="pg-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className="pg-info">
            Page {page} of {totalPages} &nbsp;·&nbsp; {customers.length} records
          </span>
          <button
            type="button"
            className="pg-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
