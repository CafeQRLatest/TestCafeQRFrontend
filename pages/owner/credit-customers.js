import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { formatTzDate } from '../../utils/timezoneUtils';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { FaBook, FaCheck, FaEye, FaPause, FaWallet, FaUsers } from 'react-icons/fa';

const SYM = '₹';
const money = (value) => `${SYM}${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  creditLimit: '',
  openingBalance: '',
  notes: '',
};

function CreditCustomersContent() {
  const { notify } = useNotification();
  const { timezone } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [manualAllocations, setManualAllocations] = useState([]);
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});
  const [paymentsByCustomer, setPaymentsByCustomer] = useState({});
  const [activeTab, setActiveTab] = useState('orders');
  const [viewingDoc, setViewingDoc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, customersRes] = await Promise.all([
        api.get('/api/v1/configurations'),
        api.get('/api/v1/credit/customers'),
      ]);
      setConfig(configRes.data?.data || null);
      setCustomers(customersRes.data?.data || []);
    } catch (error) {
      notify('error', error.response?.data?.message || 'Failed to load credit customers');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => (
      String(customer.name || '').toLowerCase().includes(term) ||
      String(customer.phone || '').toLowerCase().includes(term)
    ));
  }, [customers, search]);

  const totals = useMemo(() => ({
    active: customers.filter((customer) => String(customer.status || '').toUpperCase() === 'ACTIVE').length,
    owed: customers.reduce((sum, customer) => sum + Number(customer.balance || 0), 0),
    lifetime: customers.reduce((sum, customer) => sum + Number(customer.totalCreditExtended || 0), 0),
  }), [customers]);

  const openForm = (customer = null) => {
    setEditing(customer);
    setForm(customer ? {
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      creditLimit: customer.creditLimit ?? '',
      openingBalance: customer.openingBalance ?? '',
      notes: customer.notes || '',
    } : emptyForm);
    setFormOpen(true);
  };

  const saveCustomer = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        creditLimit: Number(form.creditLimit || 0),
        openingBalance: Number(form.openingBalance || 0),
      };
      if (editing) {
        await api.put(`/api/v1/credit/customers/${editing.id}`, payload);
      } else {
        await api.post('/api/v1/credit/customers', payload);
      }
      notify('success', editing ? 'Credit customer updated' : 'Credit customer created');
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (customer) => {
    const suspended = String(customer.status || '').toUpperCase() === 'SUSPENDED';
    try {
      await api.post(`/api/v1/credit/customers/${customer.id}/${suspended ? 'reactivate' : 'suspend'}`);
      notify('success', suspended ? 'Customer reactivated' : 'Customer suspended');
      await load();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Status update failed');
    }
  };

  const loadOrders = async (customer, force = false) => {
    if (!customer?.id) return [];
    if (!force && ordersByCustomer[customer.id]) return ordersByCustomer[customer.id];
    const { data } = await api.get(`/api/v1/credit/customers/${customer.id}/orders`);
    const rows = data.data || [];
    setOrdersByCustomer((current) => ({ ...current, [customer.id]: rows }));
    return rows;
  };

  const loadPayments = async (customer, force = false) => {
    if (!customer?.id) return [];
    if (!force && paymentsByCustomer[customer.id]) return paymentsByCustomer[customer.id];
    const { data } = await api.get(`/api/v1/credit/customers/${customer.id}/payments`);
    const rows = data.data || [];
    setPaymentsByCustomer((current) => ({ ...current, [customer.id]: rows }));
    return rows;
  };

  const openPayment = async (customer, invoice = null) => {
    setPaymentCustomer(customer);
    setPaymentInvoice(invoice);
    setPaymentAmount(invoice ? String(invoice.amountDue || '') : '');
    setPaymentMethod('CASH');
    if (invoice) {
      setManualAllocations([]);
      return;
    }
    try {
      const orders = await loadOrders(customer);
      setManualAllocations(orders
        .filter((order) => Number(order.amountDue || 0) > 0)
        .map((order) => ({ invoiceId: order.invoiceId, invoiceNo: order.invoiceNo, orderNo: order.orderNo, amountDue: order.amountDue, amount: '' })));
    } catch {
      setManualAllocations([]);
    }
  };

  const submitPayment = async () => {
    if (!paymentCustomer) return;
    const amount = Number(paymentAmount || 0);
    if (amount <= 0) {
      notify('error', 'Enter a payment amount');
      return;
    }
    const customerBalance = Number(paymentCustomer.balance || 0);
    const maxPayable = customerBalance > 0 ? customerBalance : 0;
    if (maxPayable === 0) {
      notify('error', 'This customer has no outstanding balance to pay');
      return;
    }
    if (amount > maxPayable) {
      notify('error', `Amount exceeds the outstanding due of ${money(maxPayable)}`);
      return;
    }
    const allocationMode = config?.creditAllocationMode || 'OLDEST_FIRST';
    const allocations = allocationMode === 'MANUAL'
      ? manualAllocations
          .map((row) => ({ invoiceId: row.invoiceId, amount: Number(row.amount || 0) }))
          .filter((row) => row.invoiceId && row.amount > 0)
      : [];
    try {
      await api.post(`/api/v1/credit/customers/${paymentCustomer.id}/payments`, {
        amount,
        paymentMethod,
        allocationMode,
        invoiceId: paymentInvoice ? paymentInvoice.invoiceId : null,
        allocations,
      });
      notify('success', 'Credit payment recorded');
      const custId = paymentCustomer.id;
      setPaymentCustomer(null);
      setPaymentInvoice(null);
      setManualAllocations([]);
      await load();
      await Promise.all([
        loadOrders({ id: custId }, true),
        loadPayments({ id: custId }, true),
      ]);
    } catch (error) {
      notify('error', error.response?.data?.message || 'Payment failed');
    }
  };

  const toggleOrders = async (customer) => {
    if (expandedCustomer === customer.id) {
      setExpandedCustomer(null);
      return;
    }
    setExpandedCustomer(customer.id);
    setActiveTab('orders');
    try {
      await Promise.all([
        loadOrders(customer),
        loadPayments(customer),
      ]);
    } catch (error) {
      notify('error', error.response?.data?.message || 'Failed to load details');
    }
  };

  const handleViewOrder = async (orderItem) => {
    const orderId = orderItem.orderId || orderItem.id || orderItem.invoiceId;
    if (!orderId) {
      notify('error', 'No order/invoice ID linked to this transaction');
      return;
    }
    const type = orderItem.invoiceId ? 'invoice' : 'order';
    try {
      const { data } = await api.get(`/api/v1/orders/${orderId}`);
      if (data?.data) {
        setViewingDoc({ order: data.data, type });
      } else {
        setViewingDoc({ order: orderItem, type });
      }
    } catch (err) {
      console.warn('Failed to load order details:', err);
      setViewingDoc({ order: orderItem, type });
    }
  };

  const handleViewPayment = (payment) => {
    if (!payment) return;
    setViewingDoc({
      order: {
        ...payment,
        amount: payment.amount,
        grandTotal: payment.amount,
        totalAmount: payment.amount,
      },
      type: 'payment',
    });
  };

  return (
    <DashboardLayout title="Credit Customers" hideTitle={true}>
      <div className="rpt-page credit-page">
        <div className="credit-head">
          <div className="credit-title-area">
            <h1>Credit Customers</h1>
            <p className="subtitle">Manage customer ledger balances and payments</p>
          </div>
          <button className="primary" onClick={() => openForm()}>
            New Customer
          </button>
        </div>

        <div className="rpt-kpi-grid">
          <div className="rpt-kpi" style={{ borderLeft: '4px solid #3b82f6' }}>
            <div className="rpt-kpi-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><FaUsers /></div>
            <div className="rpt-kpi-data">
              <span className="rpt-kpi-label">Active Customers</span>
              <span className="rpt-kpi-val">{totals.active}</span>
            </div>
          </div>
          <div className="rpt-kpi" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="rpt-kpi-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FaWallet /></div>
            <div className="rpt-kpi-data">
              <span className="rpt-kpi-label">Total Owed</span>
              <span className={`rpt-kpi-val ${Number(totals.owed || 0) < 0 ? 'text-danger' : ''}`}>
                {money(totals.owed)}
              </span>
            </div>
          </div>
          <div className="rpt-kpi" style={{ borderLeft: '4px solid #0f766e' }}>
            <div className="rpt-kpi-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}><FaBook /></div>
            <div className="rpt-kpi-data">
              <span className="rpt-kpi-label">Total Credit Life</span>
              <span className="rpt-kpi-val">{money(totals.lifetime)}</span>
            </div>
          </div>
          <div className="rpt-kpi" style={{ borderLeft: '4px solid #f97316' }}>
            <div className="rpt-kpi-icon" style={{ background: '#fff7ed', color: '#f97316' }}><FaCheck /></div>
            <div className="rpt-kpi-data">
              <span className="rpt-kpi-label">Allocation Mode</span>
              <span className="rpt-kpi-val">{config?.creditAllocationMode === 'MANUAL' ? 'Manual' : 'Oldest First'}</span>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search-wrapper">
            <input 
              className="search-input"
              value={search} 
              onChange={(event) => setSearch(event.target.value)} 
              placeholder="Search by name or phone..." 
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>&times;</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rpt-loading">
            <div className="spinner" />
            <span>Loading credit customers data...</span>
          </div>
        ) : (
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
                {filteredCustomers.map((customer) => {
                  const isSuspended = String(customer.status || '').toUpperCase() === 'SUSPENDED';
                  const isDebt = Number(customer.balance || 0) > 0;
                  return (
                    <React.Fragment key={customer.id}>
                      <tr className={expandedCustomer === customer.id ? 'active-row' : ''}>
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
                            <button className="btn-action btn-action-orders" onClick={() => toggleOrders(customer)} title={expandedCustomer === customer.id ? 'Hide Orders' : 'Orders'}>
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
                      {expandedCustomer === customer.id && (
                        <tr>
                          <td colSpan={6} className="expanded-row-cell">
                            <div className="expanded-tabs">
                              <button 
                                className={`expanded-tab ${activeTab === 'orders' ? 'active' : ''}`}
                                onClick={() => setActiveTab('orders')}
                              >
                                Credit Orders ({(ordersByCustomer[customer.id] || []).length})
                              </button>
                              <button 
                                className={`expanded-tab ${activeTab === 'payments' ? 'active' : ''}`}
                                onClick={() => setActiveTab('payments')}
                              >
                                Payment History ({(paymentsByCustomer[customer.id] || []).length})
                              </button>
                            </div>

                            {activeTab === 'orders' ? (
                              (ordersByCustomer[customer.id] || []).length === 0 ? (
                                <div className="ledger-empty">No credit orders recorded.</div>
                              ) : (
                                <div className="rpt-tbl-wrap" style={{ marginTop: '8px' }}>
                                  <table className="rpt-tbl" style={{ minWidth: '600px' }}>
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
                                      {(ordersByCustomer[customer.id] || []).map((order) => (
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
                                                className="btn-action btn-action-pay"
                                                onClick={() => openPayment(customer, order)}
                                                title="Full Pay Order"
                                              >
                                                <FaWallet />
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )
                            ) : (
                              (paymentsByCustomer[customer.id] || []).length === 0 ? (
                                <div className="ledger-empty">No payments recorded.</div>
                              ) : (
                                <div className="rpt-tbl-wrap" style={{ marginTop: '8px' }}>
                                  <table className="rpt-tbl" style={{ minWidth: '600px' }}>
                                    <thead>
                                      <tr>
                                        <th>Reference No</th>
                                        <th>Date</th>
                                        <th className="r">Amount Paid</th>
                                        <th>Method</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(paymentsByCustomer[customer.id] || []).map((payment) => (
                                        <tr key={payment.paymentId}>
                                          <td>
                                            <span className="rpt-mono-link" onClick={() => handleViewPayment(payment)}>
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
                                </div>
                              )
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="rpt-empty">
                      No credit customers found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {formOpen && (
          <div className="rpt-modal-overlay" onMouseDown={() => setFormOpen(false)}>
            <div className="rpt-modal" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '540px' }}>
              <h2 className="modal-title">{editing ? 'Edit Credit Customer' : 'Create New Credit Customer'}</h2>
              <div className="modal-form">
                <div className="form-group">
                  <label>Full Name</label>
                  <input 
                    className="form-input"
                    value={form.name} 
                    onChange={(event) => setForm({ ...form, name: event.target.value })} 
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input 
                    className="form-input"
                    value={form.phone} 
                    onChange={(event) => setForm({ ...form, phone: event.target.value })} 
                    placeholder="e.g. 9876543210"
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    className="form-input"
                    type="email"
                    value={form.email} 
                    onChange={(event) => setForm({ ...form, email: event.target.value })} 
                    placeholder="e.g. john@example.com"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Credit Limit ({SYM})</label>
                    <input 
                      className="form-input"
                      type="number" 
                      value={form.creditLimit} 
                      onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} 
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Opening Balance ({SYM})</label>
                    <input 
                      className="form-input"
                      type="number" 
                      value={form.openingBalance} 
                      onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} 
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes / Comments</label>
                  <textarea 
                    className="form-input"
                    value={form.notes} 
                    onChange={(event) => setForm({ ...form, notes: event.target.value })} 
                    placeholder="Add optional notes about the customer..."
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button className="rpt-modal-btn rpt-modal-btn-outline" onClick={() => setFormOpen(false)}>Cancel</button>
                <button className="primary" disabled={saving} onClick={saveCustomer}>
                  {saving ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </div>
          </div>
        )}        {paymentCustomer && (
          <div className="rpt-modal-overlay" onMouseDown={() => { setPaymentCustomer(null); setPaymentInvoice(null); }}>
            <div className="rpt-modal" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '540px' }}>
              <h2 className="modal-title">
                {paymentInvoice 
                  ? `Full Pay for Order ${paymentInvoice.orderNo || paymentInvoice.invoiceNo}` 
                  : 'Record Customer Payment'}
              </h2>
              
              <div className="payment-summary-banner">
                <div className="summary-item">
                  <span className="label">Customer</span>
                  <span className="value">{paymentCustomer.name}</span>
                </div>
                {paymentInvoice ? (
                  <div className="summary-item">
                    <span className="label">Order Due</span>
                    <span className="value balance rpt-amt text-danger">
                      {money(paymentInvoice.amountDue)}
                    </span>
                  </div>
                ) : (
                  <div className="summary-item">
                    <span className="label">Current Balance</span>
                    <span className={`value balance rpt-amt ${Number(paymentCustomer.balance || 0) > 0 ? 'debt text-danger' : 'text-success'}`}>
                      {money(paymentCustomer.balance)}
                    </span>
                  </div>
                )}
              </div>

              <div className="modal-form">
                <div className="form-group">
                  <label>Payment Amount ({SYM})</label>
                  <input 
                    className="form-input"
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={paymentAmount} 
                    onChange={(event) => setPaymentAmount(event.target.value)} 
                    placeholder="0.00"
                    disabled={!!paymentInvoice}
                    autoFocus={!paymentInvoice}
                  />
                  {paymentInvoice ? (
                    <span className="form-hint">Direct payment for this order/invoice.</span>
                  ) : (() => {
                    const customerBalance = Number(paymentCustomer.balance || 0);
                    const maxPayable = customerBalance > 0 ? customerBalance : 0;
                    return maxPayable > 0
                      ? <span className="form-hint">Max payable: <strong>{money(maxPayable)}</strong></span>
                      : <span className="form-hint text-success">No outstanding balance for this customer.</span>;
                  })()}
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <NiceSelect 
                    value={paymentMethod} 
                    onChange={setPaymentMethod} 
                    options={[
                      { value: 'CASH', label: 'Cash' },
                      { value: 'UPI', label: 'UPI / QR Code' },
                      { value: 'CARD', label: 'Card Payment' },
                      { value: 'BANK', label: 'Bank Transfer' },
                      { value: 'ONLINE', label: 'Online' },
                      { value: 'CHEQUE', label: 'Cheque' },
                    ]} 
                  />
                </div>
              </div>

              {config?.creditAllocationMode === 'MANUAL' && manualAllocations.length > 0 && (
                <div className="manual-box">
                  <strong>Invoice Allocation Settings</strong>
                  <div className="allocation-list">
                    {manualAllocations.map((row, index) => (
                      <div key={row.invoiceId} className="allocation-row">
                        <span>
                          {row.orderNo || row.invoiceNo}
                          <small className="text-danger"> ({money(row.amountDue)} due)</small>
                        </span>
                        <input 
                          className="form-input"
                          type="number" 
                          min="0" 
                          step="0.01" 
                          value={row.amount} 
                          onChange={(event) => {
                            setManualAllocations((current) => 
                              current.map((item, itemIndex) => 
                                itemIndex === index ? { ...item, amount: event.target.value } : item
                              )
                            );
                          }} 
                          placeholder="0.00"
                          style={{ width: '100px', padding: '6px 10px', background: '#ffffff' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="modal-actions">
                <button className="rpt-modal-btn rpt-modal-btn-outline" onClick={() => { setPaymentCustomer(null); setPaymentInvoice(null); }}>Cancel</button>
                <button className="primary" onClick={submitPayment}>Record Payment</button>
              </div>
            </div>
          </div>
        )}

        {viewingDoc && (
          <DocumentViewerPopup
            order={viewingDoc.order}
            docType={viewingDoc.type}
            vendors={[]}
            warehouses={[]}
            timezone={timezone || 'Asia/Kolkata'}
            currencySymbol={SYM}
            formatTzDate={formatTzDate}
            onClose={() => setViewingDoc(null)}
            onViewLinked={(order, type) => setViewingDoc({ order, type })}
            STATUS_CFG={{
              DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
              BILLED:    { label: 'Billed',    color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
              COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
              PAID:      { label: 'Paid',      color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
              CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
            }}
          />
        )}
      </div>

      <style jsx>{`
        .credit-page {
          padding: 0 20px 40px;
          color: #334155;
          font-family: 'Inter', sans-serif;
        }
        .credit-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 24px;
        }
        h1, h2, h3, .modal-title {
          font-family: 'Outfit', sans-serif;
        }
        h1 {
          margin: 0;
          color: #0f172a;
          font-size: 26px;
          font-weight: 900;
        }
        .primary, .refresh-btn, .search-input, .form-input, .rpt-modal-btn, .allocation-row input {
          font-family: 'Inter', sans-serif;
        }
        .subtitle {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 13px;
          font-weight: 700;
        }
        .primary {
          border: 0;
          background: #f97316;
          color: #fff;
          border-radius: 12px;
          padding: 12px 18px;
          font-weight: 900;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(249,115,22,.25);
        }
        .primary:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 16px rgba(249,115,22,.35);
          background: #ea580c;
        }
        .primary:active {
          transform: translateY(0);
        }

        /* Reports-matching KPI Grid */
        .rpt-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .rpt-kpi {
          background: #ffffff;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          padding: 16px;
          display: grid;
          grid-template-areas: "label icon" "value icon";
          grid-template-columns: 1fr auto;
          grid-template-rows: auto auto;
          align-items: center;
          gap: 6px 12px;
          transition: all 0.3s ease;
          min-height: 90px;
          box-sizing: border-box;
        }
        .rpt-kpi:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(0,0,0,.03);
        }
        .rpt-kpi-icon {
          grid-area: icon;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .rpt-kpi-data {
          display: contents;
        }
        .rpt-kpi-label {
          grid-area: label;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: .5px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .rpt-kpi-val {
          grid-area: value;
          font-size: 20px;
          font-weight: 800;
          color: #1e293b;
          line-height: 1.1;
          word-break: break-word;
          font-family: 'Outfit', sans-serif;
        }
        .rpt-kpi-val.text-danger {
          color: #dc2626;
        }

        /* Toolbar Search & Refresh */
        .toolbar {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          align-items: center;
        }
        .search-wrapper {
          position: relative;
          flex: 1;
          max-width: 320px;
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          padding: 0 14px;
          height: 42px;
          transition: all 0.2s ease;
        }
        .search-wrapper:focus-within {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
          background: #ffffff;
        }
        .search-icon {
          color: #94a3b8;
          font-size: 14px;
          margin-right: 10px;
          flex-shrink: 0;
        }
        .search-input {
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 500;
          color: #0f172a;
          width: 100%;
          outline: none;
          height: 100%;
          font-family: 'Inter', sans-serif;
        }
        .search-input::placeholder {
          color: #94a3b8;
        }
        .search-clear {
          border: none;
          background: transparent;
          font-size: 18px;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          transition: color 0.15s ease;
        }
        .search-clear:hover {
          color: #ef4444;
        }
        .refresh-btn {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          border-radius: 12px;
          padding: 11px 20px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        .refresh-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .refresh-btn:active {
          transform: scale(0.98);
        }

        /* Reports-matching Table CSS */
        .rpt-tbl-wrap {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: auto;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .rpt-tbl {
          width: 100%;
          border-collapse: collapse;
          min-width: 600px;
        }
        .rpt-tbl th {
          background: #fff;
          padding: 8px 16px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: .05em;
          border-bottom: 2px solid #FF7A00; /* Signature reports table line! */
          font-family: 'Inter', sans-serif;
        }
        .rpt-tbl td {
          padding: 8px 16px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
          color: #475569;
          vertical-align: middle;
          white-space: nowrap;
          transition: background-color 0.15s ease;
          font-family: 'Inter', sans-serif;
        }
        .rpt-tbl tbody tr:hover td {
          background: #fffbf5; /* Signature reports hover styling! */
        }
        .rpt-tbl tbody tr.active-row td {
          background-color: #f8fafc;
        }
        .r {
          text-align: right;
        }
        .rpt-amt {
          font-weight: 800;
          color: #1e293b;
        }
        .text-danger {
          color: #dc2626;
        }
        .text-success {
          color: #166534;
        }
        .text-muted {
          color: #64748b;
        }
        .font-bold {
          font-weight: 700;
        }

        /* Reports status pills */
        .rpt-st {
          font-size: 9px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          display: inline-block;
        }
        .rpt-st.active, .rpt-st.completed, .rpt-st.paid {
          background: #ecfdf5;
          color: #10b981;
        }
        .rpt-st.suspended, .rpt-st.cancelled, .rpt-st.void, .rpt-st.voided {
          background: #fef2f2;
          color: #ef4444;
        }
        .rpt-st.draft, .rpt-st.pending, .rpt-st.unpaid, .rpt-st.billed {
          background: #fff7ed;
          color: #f97316;
        }
        .rpt-st.partial {
          background: #fffbeb;
          color: #d97706;
        }

        /* Beautiful Action Buttons Group (With Icons only) */
        .btn-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .btn-action {
          width: 32px;
          height: 32px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          background: #ffffff;
          color: #475569;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          padding: 0;
        }
        .btn-action:hover {
          transform: translateY(-1px);
        }
        .btn-action:active {
          transform: translateY(0);
        }
        .btn-action-pay {
          background: #f0fdf4;
          border-color: #bbf7d0;
          color: #166534;
        }
        .btn-action-pay:hover {
          background: #dcfce7;
          border-color: #86efac;
          box-shadow: 0 4px 6px -1px rgba(22, 101, 52, 0.05);
        }
        .btn-action-orders {
          background: #eff6ff;
          border-color: #bfdbfe;
          color: #1e40af;
        }
        .btn-action-orders:hover {
          background: #dbeafe;
          border-color: #93c5fd;
          box-shadow: 0 4px 6px -1px rgba(30, 64, 175, 0.05);
        }
        .btn-action-status.suspend {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #9f1239;
        }
        .btn-action-status.suspend:hover {
          background: #ffe4e6;
          border-color: #fda4af;
          box-shadow: 0 4px 6px -1px rgba(159, 18, 57, 0.05);
        }
        .btn-action-status.reactivate {
          background: #ecfdf5;
          border-color: #a7f3d0;
          color: #065f46;
        }
        .btn-action-status.reactivate:hover {
          background: #d1fae5;
          border-color: #6ee7b7;
          box-shadow: 0 4px 6px -1px rgba(6, 95, 70, 0.05);
        }
        .btn-action-edit {
          background: #f8fafc;
          border-color: #e2e8f0;
          color: #334155;
        }
        .btn-action-edit:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #0f172a;
        }

        /* Super minimal expanded ledger item rows */
         .expanded-row-cell {
          background: #f8fafc;
          padding: 12px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .expanded-tabs {
          display: flex;
          gap: 16px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 12px;
          padding-bottom: 2px;
        }
        .expanded-tab {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #64748b;
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          font-weight: 700;
          padding: 6px 4px 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .expanded-tab:hover {
          color: #0f172a;
        }
        .expanded-tab.active {
          color: #f97316;
          border-bottom-color: #f97316;
        }

        .ledger-empty {
          color: #94a3b8;
          font-size: 13px;
          padding: 8px 12px;
          text-align: center;
        }
        
        /* Reports monospace document link styling */
        .rpt-mono-link {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 600;
          color: #f97316;
          background: #fff7ed;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-block;
        }
        .rpt-mono-link:hover {
          background: #ffedd5;
          color: #ea580c;
        }

        /* Reports matching loading states */
        .rpt-loading {
          text-align: center;
          padding: 60px 20px;
          color: #94a3b8;
          font-weight: 700;
          font-size: 14px;
        }
        .spinner {
          width: 28px;
          height: 28px;
          border: 3px solid #e2e8f0;
          border-top-color: #f97316;
          border-radius: 50%;
          margin: 0 auto 12px;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Reports matching empty states */
        .rpt-empty {
          text-align: center;
          padding: 60px 20px;
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 600;
        }

        /* Reports matching Modals & Overlays */
        .rpt-modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(15,23,42,0.4);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 12px;
          animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .rpt-modal {
          background: white;
          padding: 24px;
          border-radius: 16px;
          width: 100%;
          box-shadow: 0 12px 24px -10px rgba(0,0,0,0.15);
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          display: grid;
          gap: 16px;
        }
        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .modal-title {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.01em;
          border-bottom: 1.5px solid #f1f5f9;
          padding-bottom: 10px;
        }
        .modal-form {
          display: grid;
          gap: 14px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .form-hint {
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          margin-top: 4px;
        }
        .form-hint.text-success {
          color: #059669;
        }
        .rpt-modal label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          display: block;
          margin-bottom: 4px;
        }
        .form-input {
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          padding: 11px 14px;
          color: #1e293b;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.15s ease;
          background: #f8fafc;
        }
        .form-input:focus {
          outline: none;
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
          background: #ffffff;
        }
        textarea.form-input {
          min-height: 80px;
          resize: vertical;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
          border-top: 1px solid #f1f5f9;
          padding-top: 16px;
        }
        .rpt-modal-btn {
          height: 38px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          padding: 0 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .rpt-modal-btn-outline {
          background: #fff;
          border: 1.5px solid #e2e8f0;
          color: #64748b;
        }
        .rpt-modal-btn-outline:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        /* Payment summary block */
        .payment-summary-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .summary-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .summary-item .label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .summary-item .value {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .summary-item .value.balance.debt {
          color: #dc2626;
        }

        /* Manual Allocation styling */
        .manual-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .manual-box strong {
          font-size: 12px;
          color: #475569;
        }
        .allocation-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 150px;
          overflow-y: auto;
        }
        .allocation-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #f1f5f9;
        }
        .allocation-row span {
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .credit-page {
            padding: 0 4px 32px;
          }
          .credit-head {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .primary {
            width: 100%;
            justify-content: center;
          }
          .rpt-kpi-grid {
            grid-template-columns: 1fr;
          }
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .search-wrapper {
            max-width: none !important;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
          .ledger-row-minimal {
            grid-template-columns: 1fr;
            gap: 6px;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}

export default function CreditCustomersPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Credit Customers">
      <ModuleGate>
        <CreditCustomersContent />
      </ModuleGate>
    </RoleGate>
  );
}
