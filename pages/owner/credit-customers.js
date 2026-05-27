import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';
import { FaBook, FaCheck, FaEye, FaPause, FaPlus, FaWallet } from 'react-icons/fa';

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
  const [customers, setCustomers] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [manualAllocations, setManualAllocations] = useState([]);
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});

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

  const loadOrders = async (customer) => {
    if (!customer?.id) return [];
    if (ordersByCustomer[customer.id]) return ordersByCustomer[customer.id];
    const { data } = await api.get(`/api/v1/credit/customers/${customer.id}/orders`);
    const rows = data.data || [];
    setOrdersByCustomer((current) => ({ ...current, [customer.id]: rows }));
    return rows;
  };

  const openPayment = async (customer) => {
    setPaymentCustomer(customer);
    setPaymentAmount('');
    setPaymentMethod('CASH');
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
        allocations,
      });
      notify('success', 'Credit payment recorded');
      setPaymentCustomer(null);
      setManualAllocations([]);
      await load();
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
    try {
      await loadOrders(customer);
    } catch (error) {
      notify('error', error.response?.data?.message || 'Failed to load orders');
    }
  };

  return (
    <DashboardLayout title="Credit Customers">
      <div className="credit-page">
        <div className="credit-head">
          <div>
            <h1>Credit Customers</h1>
            <p>Manage customer ledger balances and payments</p>
          </div>
          <button className="primary" onClick={() => openForm()}><FaPlus /> New Customer</button>
        </div>

        <div className="kpi-grid">
          <div><span>Active Customers</span><strong>{totals.active}</strong></div>
          <div><span>Total Owed</span><strong>{money(totals.owed)}</strong></div>
          <div><span>Total Credit Life</span><strong>{money(totals.lifetime)}</strong></div>
          <div><span>Allocation</span><strong>{config?.creditAllocationMode === 'MANUAL' ? 'Manual' : 'Oldest First'}</strong></div>
        </div>

        <div className="toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone..." />
          <button onClick={load}>Refresh</button>
        </div>

        {loading ? <div className="empty">Loading credit customers...</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th className="right">Balance</th><th className="right">Total Credit</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <React.Fragment key={customer.id}>
                    <tr>
                      <td><strong>{customer.name}</strong></td>
                      <td>{customer.phone || '-'}</td>
                      <td className="right amount">{money(customer.balance)}</td>
                      <td className="right">{money(customer.totalCreditExtended)}</td>
                      <td><span className={`status ${String(customer.status || '').toLowerCase()}`}>{customer.status}</span></td>
                      <td>
                        <div className="actions">
                          <button onClick={() => openPayment(customer)}><FaWallet /> Pay</button>
                          <button onClick={() => toggleOrders(customer)}><FaEye /> Orders</button>
                          <button onClick={() => toggleStatus(customer)}>
                            {String(customer.status || '').toUpperCase() === 'SUSPENDED' ? <FaCheck /> : <FaPause />}
                            {String(customer.status || '').toUpperCase() === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </button>
                          <button onClick={() => openForm(customer)}><FaBook /> Edit</button>
                        </div>
                      </td>
                    </tr>
                    {expandedCustomer === customer.id && (
                      <tr>
                        <td colSpan={6} className="orders-cell">
                          {(ordersByCustomer[customer.id] || []).length === 0 ? <div className="empty compact">No credit orders</div> : (
                            <div className="orders-grid">
                              {(ordersByCustomer[customer.id] || []).map((order) => (
                                <div key={order.invoiceId || order.orderId} className="order-row">
                                  <span>{order.orderNo || order.invoiceNo}</span>
                                  <span>{money(order.total)}</span>
                                  <span>{money(order.amountDue)} due</span>
                                  <span className={`status ${String(order.status || '').toLowerCase()}`}>{order.status}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr><td colSpan={6} className="empty compact">No credit customers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {formOpen && (
          <div className="overlay" onMouseDown={() => setFormOpen(false)}>
            <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
              <h2>{editing ? 'Edit Credit Customer' : 'New Credit Customer'}</h2>
              <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <div className="form-row">
                <label>Credit Limit<input type="number" value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} /></label>
                <label>Opening Balance<input type="number" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} /></label>
              </div>
              <label>Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
              <div className="modal-actions">
                <button onClick={() => setFormOpen(false)}>Cancel</button>
                <button className="primary" disabled={saving} onClick={saveCustomer}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {paymentCustomer && (
          <div className="overlay" onMouseDown={() => setPaymentCustomer(null)}>
            <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
              <h2>Record Payment</h2>
              <p className="muted">{paymentCustomer.name} current balance {money(paymentCustomer.balance)}</p>
              <label>Amount<input type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
              <label>Payment Method
                <NiceSelect value={paymentMethod} onChange={setPaymentMethod} options={[
                  { value: 'CASH', label: 'Cash' },
                  { value: 'UPI', label: 'UPI' },
                  { value: 'CARD', label: 'Card' },
                  { value: 'BANK', label: 'Bank' },
                  { value: 'ONLINE', label: 'Online' },
                  { value: 'CHEQUE', label: 'Cheque' },
                ]} />
              </label>
              {config?.creditAllocationMode === 'MANUAL' && manualAllocations.length > 0 && (
                <div className="manual-box">
                  <strong>Manual Allocation</strong>
                  {manualAllocations.map((row, index) => (
                    <div key={row.invoiceId} className="allocation-row">
                      <span>{row.orderNo || row.invoiceNo}<small>{money(row.amountDue)} due</small></span>
                      <input type="number" min="0" step="0.01" value={row.amount} onChange={(event) => {
                        setManualAllocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item));
                      }} />
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-actions">
                <button onClick={() => setPaymentCustomer(null)}>Cancel</button>
                <button className="primary" onClick={submitPayment}>Record Payment</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .credit-page{padding:0 20px 40px}
        .credit-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:18px}
        h1{margin:0;color:#0f172a;font-size:26px;font-weight:900}
        p{margin:6px 0 0;color:#64748b;font-size:13px;font-weight:700}
        .primary{border:0;background:#f97316;color:#fff;border-radius:12px;padding:12px 18px;font-weight:900;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
        .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px}
        .kpi-grid>div{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px}
        .kpi-grid span{display:block;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.6px}
        .kpi-grid strong{display:block;margin-top:8px;color:#0f172a;font-size:22px;font-weight:900}
        .toolbar{display:flex;gap:10px;margin-bottom:14px}
        .toolbar input{flex:1;border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;font-size:14px;font-weight:700}
        .toolbar button,.actions button,.modal-actions button{border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
        .table-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:auto}
        table{width:100%;border-collapse:collapse;min-width:920px}
        th{background:#f8fafc;color:#64748b;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.7px;padding:12px 14px}
        td{border-top:1px solid #f1f5f9;padding:13px 14px;color:#334155;font-size:13px}
        .right{text-align:right}.amount{font-weight:900;color:#0f172a}
        .status{border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;text-transform:uppercase;background:#dcfce7;color:#15803d}
        .status.suspended{background:#fee2e2;color:#b91c1c}.status.unpaid,.status.partial{background:#fff7ed;color:#c2410c}
        .actions{display:flex;gap:6px;flex-wrap:wrap}
        .empty{text-align:center;padding:56px 20px;color:#94a3b8;font-weight:800}.compact{padding:18px}
        .orders-cell{background:#f8fafc}.orders-grid{display:grid;gap:8px}.order-row{display:grid;grid-template-columns:1fr 120px 120px 100px;gap:10px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:12px}.order-row small{display:block;color:#94a3b8;font-weight:800}
        .overlay{position:fixed;inset:0;background:rgba(15,23,42,.46);z-index:1300;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal{width:min(520px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 64px rgba(15,23,42,.25);display:grid;gap:12px}
        .modal h2{margin:0 0 4px;color:#0f172a;font-size:20px;font-weight:900}.muted{margin:0;color:#64748b;font-size:13px;font-weight:800}
        label{display:grid;gap:6px;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase}
        label input,label textarea{border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;color:#0f172a;font-size:14px;font-weight:800}textarea{min-height:76px;resize:vertical}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}.modal-actions .primary{border:0}
        .manual-box{display:grid;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px}.manual-box strong{font-size:12px;color:#0f172a}.allocation-row{display:grid;grid-template-columns:1fr 120px;gap:10px;align-items:center}.allocation-row span{font-size:12px;font-weight:900;color:#334155}.allocation-row input{border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;font-weight:800}
        @media(max-width:720px){.credit-page{padding:0 6px 32px}.credit-head{align-items:flex-start;flex-direction:column}.toolbar{flex-direction:column}.form-row{grid-template-columns:1fr}.order-row{grid-template-columns:1fr}}
      `}</style>
    </DashboardLayout>
  );
}

export default function CreditCustomersPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
      <CreditCustomersContent />
    </RoleGate>
  );
}
