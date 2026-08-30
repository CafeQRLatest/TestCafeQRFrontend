import React, { useState, useEffect, useMemo } from 'react';
import { FaWallet } from 'react-icons/fa';
import { formatTzDate } from '../../utils/timezoneUtils';
import PageSizeSelect from './PageSizeSelect';

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
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);

  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(10);

  useEffect(() => {
    setOrderPage(1);
    setPaymentPage(1);
  }, [customer?.id, orderPageSize, paymentPageSize]);

  const openOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      const st = String(o.status || '').toUpperCase();
      const due = Number(o.amountDue ?? 0);
      return st !== 'PAID' && (o.amountDue == null || due > 0);
    });
  }, [orders]);

  const totalOrderPages = Math.max(1, Math.ceil(openOrders.length / orderPageSize));
  const totalPaymentPages = Math.max(1, Math.ceil(payments.length / paymentPageSize));

  const paginatedOrders = useMemo(() => {
    const start = (orderPage - 1) * orderPageSize;
    return openOrders.slice(start, start + orderPageSize);
  }, [openOrders, orderPage, orderPageSize]);

  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * paymentPageSize;
    return payments.slice(start, start + paymentPageSize);
  }, [payments, paymentPage, paymentPageSize]);

  const renderPagination = (currentPage, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange) => {
    if (totalItems === 0) return null;
    const startRecord = (currentPage - 1) * pageSize + 1;
    const endRecord = Math.min(currentPage * pageSize, totalItems);

    return (
      <div className="pagination-bar" style={{ marginTop: '8px', padding: '12px 16px' }}>
        <PageSizeSelect
          value={pageSize}
          options={[5, 10, 25, 50]}
          onChange={(newSize) => {
            onPageSizeChange(newSize);
            onPageChange(1);
          }}
          label="Per page"
        />
        <span className="pg-info">
          Showing {startRecord}–{endRecord} of {totalItems} records (Page {currentPage} of {totalPages})
        </span>
        <div className="pg-controls">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="pg-btn"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="pg-btn"
          >
            Next →
          </button>
        </div>
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
          Credit Orders ({openOrders.length})
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
        openOrders.length === 0 ? (
          <div className="ledger-empty">No pending credit orders found for this customer.</div>
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
                      {formatTzDate(order.date || order.orderDate || order.createdAt, timezone || 'Asia/Kolkata')}
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
            {renderPagination(orderPage, totalOrderPages, orders.length, orderPageSize, setOrderPage, setOrderPageSize)}
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
                      {formatTzDate(payment.transactionDate || payment.paymentDate || payment.date || payment.createdAt, timezone || 'Asia/Kolkata')}
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
            {renderPagination(paymentPage, totalPaymentPages, payments.length, paymentPageSize, setPaymentPage, setPaymentPageSize)}
          </div>
        )
      )}
    </div>
  );
}
