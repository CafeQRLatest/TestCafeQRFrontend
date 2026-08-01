import React, { useState, useMemo } from 'react';
import { FaBook, FaCheck, FaEye, FaPause, FaWallet, FaFileAlt } from 'react-icons/fa';

export default function CreditVendorTable({
  vendors = [],
  expandedVendor,
  activeTab,
  setActiveTab,
  ordersByVendor = {},
  paymentsByVendor = {},
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

  // Pagination for main vendors table
  const totalPages = Math.ceil(vendors.length / pageSize);
  const paginatedVendors = useMemo(() => {
    const start = (page - 1) * pageSize;
    return vendors.slice(start, start + pageSize);
  }, [vendors, page]);

  // Sub-pagination states for expanded vendor ledger lists
  const [vendorOrderPages, setVendorOrderPages] = useState({});
  const [vendorPaymentPages, setVendorPaymentPages] = useState({});

  const getOrderPage = (vendorId) => vendorOrderPages[vendorId] || 1;
  const getPaymentPage = (vendorId) => vendorPaymentPages[vendorId] || 1;

  const setOrderPage = (vendorId, newPage) => {
    setVendorOrderPages(prev => ({ ...prev, [vendorId]: newPage }));
  };

  const setPaymentPage = (vendorId, newPage) => {
    setVendorPaymentPages(prev => ({ ...prev, [vendorId]: newPage }));
  };

  // Helper to render clear Order & Payment status
  const renderOrderStatus = (order) => {
    const pStatus = String(order.paymentStatus || order.payment_status || '').toUpperCase();
    const oStatus = String(order.orderStatus || order.order_status || '').toUpperCase();

    if (pStatus === 'PAID') {
      return <span className="rpt-st paid" style={{ fontSize: '10px' }}>PAID</span>;
    }
    if (pStatus === 'PARTIAL' || pStatus === 'PARTIALLY_PAID') {
      return <span className="rpt-st partial" style={{ fontSize: '10px' }}>PARTIALLY PAID</span>;
    }
    if (oStatus === 'COMPLETED' || oStatus === 'RECEIVED') {
      return <span className="rpt-st billed" style={{ fontSize: '10px' }}>RECEIVED (UNPAID)</span>;
    }
    if (oStatus === 'CONFIRMED') {
      return <span className="rpt-st draft" style={{ fontSize: '10px' }}>CONFIRMED</span>;
    }
    if (oStatus === 'CANCELLED') {
      return <span className="rpt-st suspended" style={{ fontSize: '10px' }}>CANCELLED</span>;
    }
    return <span className="rpt-st billed" style={{ fontSize: '10px' }}>{oStatus || 'UNPAID'}</span>;
  };

  return (
    <div className="rpt-tbl-wrap">
      <table className="rpt-tbl">
        <thead>
          <tr>
            <th>Vendor / Supplier</th>
            <th>Phone</th>
            <th className="r">Balance Owed</th>
            <th className="r">Credit Limit</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedVendors.map((vendor) => {
            const isExpanded = expandedVendor?.id === vendor.id;
            const balance = Number(vendor.balance ?? vendor.openingBalance ?? 0);
            const limit = Number(vendor.creditLimit || 0);
            const isSuspended = String(vendor.isactive || vendor.status || 'Y').toUpperCase() === 'N' || String(vendor.status).toUpperCase() === 'SUSPENDED';

            const vendorOrders = ordersByVendor[vendor.id] || [];
            const vendorPayments = paymentsByVendor[vendor.id] || [];

            const currentOrderPage = getOrderPage(vendor.id);
            const totalOrderPages = Math.ceil(vendorOrders.length / pageSize);
            const paginatedOrders = vendorOrders.slice((currentOrderPage - 1) * pageSize, currentOrderPage * pageSize);

            const currentPaymentPage = getPaymentPage(vendor.id);
            const totalPaymentPages = Math.ceil(vendorPayments.length / pageSize);
            const paginatedPayments = vendorPayments.slice((currentPaymentPage - 1) * pageSize, currentPaymentPage * pageSize);

            return (
              <React.Fragment key={vendor.id}>
                <tr className={isExpanded ? 'active-row' : ''}>
                  <td className="font-bold">
                    <div style={{ fontWeight: '700', color: '#0f172a' }}>{vendor.name}</div>
                    {vendor.contactPerson && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 'normal' }}>
                        Contact: {vendor.contactPerson}
                      </div>
                    )}
                    {vendor.gstin && (
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px', fontWeight: 'normal' }}>
                        GSTIN: {vendor.gstin}
                      </div>
                    )}
                  </td>
                  <td>{vendor.phone || '-'}</td>
                  <td className={`r rpt-amt ${balance > 0 ? 'text-danger' : 'text-success'}`}>
                    {money(balance)}
                  </td>
                  <td className="r rpt-amt text-muted">
                    {limit > 0 ? money(limit) : '—'}
                  </td>
                  <td>
                    <span className={`rpt-st ${isSuspended ? 'suspended' : 'active'}`}>
                      {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td>
                    <div className="btn-group">
                      <button 
                        className="btn-action btn-action-pay"
                        title="Settle Vendor Payment"
                        onClick={() => openPayment(vendor, null)}
                      >
                        <FaWallet />
                      </button>
                      <button 
                        className="btn-action btn-action-orders"
                        title={isExpanded ? 'Hide Orders' : 'View Ledger / Orders'}
                        onClick={() => toggleOrders(vendor)}
                      >
                        <FaEye />
                      </button>
                      <button 
                        className={`btn-action btn-action-status ${isSuspended ? 'reactivate' : 'suspend'}`}
                        title={isSuspended ? 'Reactivate Vendor' : 'Suspend Vendor'}
                        onClick={() => toggleStatus(vendor)}
                      >
                        {isSuspended ? <FaCheck /> : <FaPause />}
                      </button>
                      <button 
                        className="btn-action btn-action-edit"
                        title="Edit Vendor Details"
                        onClick={() => openForm(vendor)}
                      >
                        <FaBook />
                      </button>
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="expanded-row-cell">
                      <div className="ledger-container" style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', margin: '8px 0' }}>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                          <button 
                            type="button"
                            className={`rpt-modal-btn ${activeTab === 'orders' ? 'rpt-modal-btn-primary' : 'rpt-modal-btn-secondary'}`}
                            style={{ padding: '6px 14px', fontSize: '12px' }}
                            onClick={() => setActiveTab('orders')}
                          >
                            <FaFileAlt style={{ marginRight: '6px' }} /> Purchase Orders & Bills ({vendorOrders.length})
                          </button>
                          <button 
                            type="button"
                            className={`rpt-modal-btn ${activeTab === 'payments' ? 'rpt-modal-btn-primary' : 'rpt-modal-btn-secondary'}`}
                            style={{ padding: '6px 14px', fontSize: '12px' }}
                            onClick={() => setActiveTab('payments')}
                          >
                            <FaWallet style={{ marginRight: '6px' }} /> Settlements History ({vendorPayments.length})
                          </button>
                        </div>

                        {activeTab === 'orders' ? (
                          <div>
                            {vendorOrders.length === 0 ? (
                              <div style={{ color: '#94a3b8', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
                                No purchase orders or bills found for this vendor.
                              </div>
                            ) : (
                              <>
                                <table className="rpt-tbl" style={{ fontSize: '12px' }}>
                                  <thead>
                                    <tr>
                                      <th>PO Number</th>
                                      <th>Date</th>
                                      <th>Status</th>
                                      <th className="r">Total Amount</th>
                                      <th className="r">Amount Paid</th>
                                      <th className="r">Remaining Due</th>
                                      <th className="r">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {paginatedOrders.map((order) => {
                                      const orderTotal = Number(order.totalAmount || order.total_amount || 0);
                                      const orderPaid = Number(order.amountPaid || order.amount_paid || 0);
                                      const orderDue = Math.max(0, orderTotal - orderPaid);
                                      return (
                                      <tr key={order.id}>
                                        <td className="font-bold">
                                          <span 
                                            className="rpt-mono-link" 
                                            onClick={() => handleViewOrder(order)}
                                            style={{ 
                                              cursor: 'pointer', 
                                              color: '#f97316', 
                                              fontWeight: '700',
                                              textDecoration: 'underline'
                                            }}
                                            title="Click to view purchase order document details"
                                          >
                                            {order.poNumber || order.orderNo || `PO-${order.id.slice(0, 8)}`}
                                          </span>
                                        </td>
                                        <td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}</td>
                                        <td>
                                          {renderOrderStatus(order)}
                                        </td>
                                        <td className="r rpt-amt">{money(orderTotal)}</td>
                                        <td className="r rpt-amt text-success">{orderPaid > 0 ? money(orderPaid) : '—'}</td>
                                        <td className={`r rpt-amt ${orderDue > 0 ? 'text-danger' : 'text-success'}`}>
                                          {orderDue > 0 ? money(orderDue) : '✓ Paid'}
                                        </td>
                                         <td className="r">
                                           {String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID' ? (
                                             <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                               <FaCheck /> Paid
                                             </span>
                                           ) : (
                                             <button
                                               type="button"
                                               className="btn-action btn-action-pay"
                                               onClick={() => openPayment(vendor, order)}
                                               title="Settle Order Bill"
                                             >
                                               <FaWallet />
                                             </button>
                                           )}
                                         </td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>

                                {/* Standard Sub-Pagination Bar for Expanded Vendor Orders */}
                                {totalOrderPages > 1 && (
                                  <div className="pagination-bar" style={{ marginTop: '8px', padding: '12px 0' }}>
                                    <button
                                      type="button"
                                      className="pg-btn"
                                      onClick={() => setOrderPage(vendor.id, Math.max(1, currentOrderPage - 1))}
                                      disabled={currentOrderPage === 1}
                                    >
                                      ← Prev
                                    </button>
                                    <span className="pg-info">
                                      Page {currentOrderPage} of {totalOrderPages} &nbsp;·&nbsp; {vendorOrders.length} orders
                                    </span>
                                    <button
                                      type="button"
                                      className="pg-btn"
                                      onClick={() => setOrderPage(vendor.id, Math.min(totalOrderPages, currentOrderPage + 1))}
                                      disabled={currentOrderPage === totalOrderPages}
                                    >
                                      Next →
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div>
                            {vendorPayments.length === 0 ? (
                              <div style={{ color: '#94a3b8', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
                                No payment settlements recorded for this vendor yet.
                              </div>
                            ) : (
                              <>
                                <table className="rpt-tbl" style={{ fontSize: '12px' }}>
                                  <thead>
                                    <tr>
                                      <th>Ref / Receipt</th>
                                      <th>Date</th>
                                      <th>Method</th>
                                      <th className="r">Amount Paid</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {paginatedPayments.map((pay, idx) => (
                                      <tr key={pay.id || idx}>
                                         <td className="font-bold">
                                           <span 
                                             className="rpt-mono-link" 
                                             onClick={() => handleViewPayment && handleViewPayment(pay)}
                                             style={{ 
                                               cursor: 'pointer', 
                                               color: '#f97316', 
                                               fontWeight: '700',
                                               textDecoration: 'underline'
                                             }}
                                             title="Click to view payment receipt details"
                                           >
                                             {pay.referenceNo || pay.receiptNo || pay.id || 'VPAY-DETAIL'}
                                           </span>
                                         </td>
                                        <td>{pay.createdAt ? new Date(pay.createdAt).toLocaleDateString() : '—'}</td>
                                        <td><strong>{pay.paymentMethod || 'CASH'}</strong></td>
                                        <td className="r rpt-amt text-success">
                                          {money(pay.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>

                                {/* Standard Sub-Pagination Bar for Expanded Vendor Payments */}
                                {totalPaymentPages > 1 && (
                                  <div className="pagination-bar" style={{ marginTop: '8px', padding: '12px 0' }}>
                                    <button
                                      type="button"
                                      className="pg-btn"
                                      onClick={() => setPaymentPage(vendor.id, Math.max(1, currentPaymentPage - 1))}
                                      disabled={currentPaymentPage === 1}
                                    >
                                      ← Prev
                                    </button>
                                    <span className="pg-info">
                                      Page {currentPaymentPage} of {totalPaymentPages} &nbsp;·&nbsp; {vendorPayments.length} settlements
                                    </span>
                                    <button
                                      type="button"
                                      className="pg-btn"
                                      onClick={() => setPaymentPage(vendor.id, Math.min(totalPaymentPages, currentPaymentPage + 1))}
                                      disabled={currentPaymentPage === totalPaymentPages}
                                    >
                                      Next →
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {vendors.length === 0 && (
            <tr>
              <td colSpan={6} className="rpt-empty" style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>
                No credit vendors found matching your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Main Vendor Table Pagination Bar */}
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
            Page {page} of {totalPages} &nbsp;·&nbsp; {vendors.length} records
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
