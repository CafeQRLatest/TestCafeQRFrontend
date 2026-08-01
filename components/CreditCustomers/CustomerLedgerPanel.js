import React from 'react';
import { FaWallet } from 'react-icons/fa';
import { formatTzDate } from '../../utils/timezoneUtils';

export default function CustomerLedgerPanel({
  customer,
  activeTab,
  setActiveTab,
  orders = [],
  payments = [],
  timezone,
  money,
  handleViewOrder,
  handleViewPayment,
  openPayment,
}) {
  const [orderPage, setOrderPage] = React.useState(1);
  const [paymentPage, setPaymentPage] = React.useState(1);

  React.useEffect(() => {
    setOrderPage(1);
    setPaymentPage(1);
  }, [customer?.id]);

  const pageSize = 10;
  
  const totalOrderPages = Math.ceil(orders.length / pageSize);
  const totalPaymentPages = Math.ceil(payments.length / pageSize);

  const paginatedOrders = React.useMemo(() => {
    const start = (orderPage - 1) * pageSize;
    return orders.slice(start, start + pageSize);
  }, [orders, orderPage]);

  const paginatedPayments = React.useMemo(() => {
    const start = (paymentPage - 1) * pageSize;
    return payments.slice(start, start + pageSize);
  }, [payments, paymentPage]);

  const renderPagination = (currentPage, totalPages, totalItems, onPageChange) => {
    if (totalPages <= 1) return null;
    return (
      <div className="pagination-bar" style={{ marginTop: '8px', padding: '12px 0' }}>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="pg-btn"
        >
          ← Prev
        </button>
        <span className="pg-info">
          Page {currentPage} of {totalPages} &nbsp;·&nbsp; {totalItems} records
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="pg-btn"
        >
          Next →
        </button>
      </div>
    );
  };

  return (
    <div className="expanded-row-wrapper">
      <div className="expanded-tabs">
        <button
          type="button"
          className={`expanded-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Credit Orders ({orders.length})
        </button>
        <button
          type="button"
          className={`expanded-tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Payment History ({payments.length})
        </button>
      </div>

      {activeTab === 'orders' ? (
        orders.length === 0 ? (
          <div className="ledger-empty">No credit orders recorded.</div>
        ) : (
          <div className="rpt-tbl-wrap" style={{ marginTop: '8px' }}>
            <table className="rpt-tbl" style={{ minWidth: '600px', marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Document No</th>
                  <th>Date</th>
                  <th className="r">Total Amount</th>
                  <th className="r">Amount Due</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => (
                  <tr key={order.invoiceId || order.orderId}>
                    <td>
                      <span className="rpt-mono-link" onClick={() => handleViewOrder(order)}>
                        {order.orderNo || order.invoiceNo || 'Detail'}
                      </span>
                    </td>
                    <td>
                      {formatTzDate(order.date, timezone || 'Asia/Kolkata', 'dd-MMM-yyyy hh:mm a')}
                    </td>
                    <td className="r rpt-amt">{money(order.total)}</td>
                    <td className={`r rpt-amt ${Number(order.amountDue || 0) > 0 ? 'text-danger' : 'text-success'}`}>
                      {money(order.amountDue)} due
                    </td>
                    <td>
                      <span className={`rpt-st ${String(order.status || '').toLowerCase()}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>
                      {Number(order.amountDue || 0) > 0 && (
                        <button
                          type="button"
                          className="btn-action btn-action-pay"
                          onClick={() => openPayment(customer, order)}
                          title="Pay Order"
                        >
                          <FaWallet />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination(orderPage, totalOrderPages, orders.length, setOrderPage)}
          </div>
        )
      ) : (
        payments.length === 0 ? (
          <div className="ledger-empty">No payments recorded.</div>
        ) : (
          <div className="rpt-tbl-wrap" style={{ marginTop: '8px' }}>
            <table className="rpt-tbl" style={{ minWidth: '600px', marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Reference No</th>
                  <th>Date</th>
                  <th className="r">Amount Paid</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayments.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td>
                      <span className="rpt-mono-link" onClick={() => handleViewPayment(payment, customer)}>
                        {payment.referenceNo || 'Payment'}
                      </span>
                    </td>
                    <td>
                      {formatTzDate(payment.transactionDate, timezone || 'Asia/Kolkata', 'dd-MMM-yyyy hh:mm a')}
                    </td>
                    <td className="r rpt-amt text-success">
                      -{money(payment.amount)}
                    </td>
                    <td className="text-muted">
                      {payment.paymentMethod}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination(paymentPage, totalPaymentPages, payments.length, setPaymentPage)}
          </div>
        )
      )}
    </div>
  );
}
