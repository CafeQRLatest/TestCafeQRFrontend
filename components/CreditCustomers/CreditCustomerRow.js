import React from 'react';
import { FaBook, FaCheck, FaEye, FaPause, FaWallet } from 'react-icons/fa';
import CustomerLedgerPanel from './CustomerLedgerPanel';

const CreditCustomerRow = React.memo(function CreditCustomerRow({
  customer,
  expandedCustomer,
  activeTab,
  setActiveTab,
  orders = [],
  payments = [],
  timezone,
  money,
  openPayment,
  toggleOrders,
  toggleStatus,
  openForm,
  handleViewOrder,
  handleViewPayment,
}) {
  const isSuspended = String(customer.status || '').toUpperCase() === 'SUSPENDED';
  const isDebt = Number(customer.balance || 0) > 0;
  const isExpanded = expandedCustomer?.id === customer.id || expandedCustomer === customer.id;

  return (
    <>
      <tr className={isExpanded ? 'active-row' : ''}>
        <td className="font-bold">{customer.name}</td>
        <td>{customer.phone || '-'}</td>
        <td className={`r rpt-amt ${isDebt ? 'text-danger' : 'text-success'}`}>
          {money(customer.balance)}
        </td>
        <td className="r rpt-amt text-muted">{money(customer.totalCreditExtended)}</td>
        <td>
          <span className={`rpt-st ${String(customer.status || '').toLowerCase()}`}>
            {customer.status}
          </span>
        </td>
        <td>
          <div className="btn-group">
            <button className="btn-action btn-action-pay" onClick={() => openPayment(customer)} title="Pay">
              <FaWallet />
            </button>
            <button className="btn-action btn-action-orders" onClick={() => toggleOrders(customer)} title={isExpanded ? 'Hide Orders' : 'Orders'}>
              <FaEye />
            </button>
            <button className={`btn-action btn-action-status ${isSuspended ? 'reactivate' : 'suspend'}`} onClick={() => toggleStatus(customer)} title={isSuspended ? 'Reactivate' : 'Suspend'}>
              {isSuspended ? <FaCheck /> : <FaPause />}
            </button>
            <button className="btn-action btn-action-edit" onClick={() => openForm(customer)} title="Edit">
              <FaBook />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="expanded-row-cell">
            <CustomerLedgerPanel
              customer={customer}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              orders={orders}
              payments={payments}
              timezone={timezone}
              money={money}
              handleViewOrder={handleViewOrder}
              handleViewPayment={handleViewPayment}
              openPayment={openPayment}
            />
          </td>
        </tr>
      )}
    </>
  );
});

export default CreditCustomerRow;
