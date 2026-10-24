import React, { useState, useEffect, useMemo } from 'react';
import { FaWallet, FaFileExcel, FaFilePdf } from 'react-icons/fa';
import { formatTzDate } from '../../utils/timezoneUtils';
import { useNotification } from '../../context/NotificationContext';
import PageSizeSelect from './PageSizeSelect';
import { exportCreditOrdersToExcel, exportCreditOrdersToPdf } from './creditOrdersExport';

export default function CustomerLedgerPanel({
  customer,
  activeTab,
  setActiveTab,
  orders = [],
  payments = [],
  timezone,
  money,
  currencySymbol = '',
  handleViewOrder,
  handleViewPayment,
  openPayment,
}) {
  const { notify } = useNotification() || {};
  const [exporting, setExporting] = useState(false);
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

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await exportCreditOrdersToExcel({
        customer,
        orders: openOrders,
        timezone,
        currencySymbol,
        notify,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportCreditOrdersToPdf({
        customer,
        orders: openOrders,
        timezone,
        currencySymbol,
        notify,
      });
    } finally {
      setExporting(false);
    }
  };

  const renderPagination = (currentPage, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange, showExports = false) => {
    if (totalItems === 0) return null;
    const startRecord = (currentPage - 1) * pageSize + 1;
    const endRecord = Math.min(currentPage * pageSize, totalItems);

    return (
      <div
        className="pagination-bar ledger-footer-bar"
        style={{
          marginTop: '10px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#ffffff',
          borderRadius: '0 0 10px 10px',
          borderTop: '1px solid #f1f5f9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <PageSizeSelect
            value={pageSize}
            options={[5, 10, 25, 50]}
            onChange={(newSize) => {
              onPageSizeChange(newSize);
              onPageChange(1);
            }}
            label="Per page"
          />

          {showExports && openOrders.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="ledger-export-btn ledger-export-btn-excel"
                onClick={handleExportExcel}
                disabled={exporting}
                title="Export all credit orders to Excel (.xlsx)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: '1px solid #10b981',
                  background: '#ecfdf5',
                  color: '#065f46',
                  cursor: exporting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(16, 185, 129, 0.12)',
                  fontFamily: 'inherit',
                  lineHeight: '1.2',
                }}
              >
                <FaFileExcel style={{ color: '#10b981', fontSize: '14px' }} />
                <span>{exporting ? 'Exporting...' : 'Excel'}</span>
              </button>

              <button
                type="button"
                className="ledger-export-btn ledger-export-btn-pdf"
                onClick={handleExportPdf}
                disabled={exporting}
                title="Export all credit orders to PDF (.pdf)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: '1px solid #ef4444',
                  background: '#fef2f2',
                  color: '#991b1b',
                  cursor: exporting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(239, 68, 68, 0.12)',
                  fontFamily: 'inherit',
                  lineHeight: '1.2',
                }}
              >
                <FaFilePdf style={{ color: '#ef4444', fontSize: '14px' }} />
                <span>{exporting ? 'Exporting...' : 'PDF'}</span>
              </button>
            </div>
          )}
        </div>

        <span className="pg-info" style={{ color: '#64748b', fontSize: '12.5px', fontWeight: '500' }}>
          Showing {startRecord}–{endRecord} of {totalItems} records (Page {currentPage} of {totalPages})
        </span>

        <div className="pg-controls" style={{ display: 'flex', gap: '6px' }}>
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
            {renderPagination(orderPage, totalOrderPages, openOrders.length, orderPageSize, setOrderPage, setOrderPageSize, true)}
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
