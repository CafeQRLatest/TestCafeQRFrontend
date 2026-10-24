import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import * as service from './creditCustomerService';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  creditLimit: '',
  openingBalance: '',
  notes: '',
};

export default function useCreditCustomers() {
  const currencyDecimals = useCurrencyDecimals();
  const { notify } = useNotification();
  const { timezone } = useAuth();
  
  const [customers, setCustomers] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Form modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Payment states
  const [paymentCustomer, setPaymentCustomer] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [manualAllocations, setManualAllocations] = useState([]);

  // Expanded ledger states
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});
  const [paymentsByCustomer, setPaymentsByCustomer] = useState({});
  const [activeTab, setActiveTab] = useState('orders');
  const [viewingDoc, setViewingDoc] = useState(null);

  const SYM = config?.currencySymbol || '';
  const money = useCallback((value) => {
    return `${SYM}${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`;
  }, [SYM]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, customersRes] = await Promise.all([
        service.fetchConfigurations(),
        service.fetchCustomers(),
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
        await service.updateCustomer(editing.id, payload);
      } else {
        await service.createCustomer(payload);
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
      if (suspended) {
        await service.reactivateCustomer(customer.id);
      } else {
        await service.suspendCustomer(customer.id);
      }
      notify('success', suspended ? 'Customer reactivated' : 'Customer suspended');
      await load();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Status update failed');
    }
  };

  const loadOrders = async (customer, force = false) => {
    if (!customer?.id) return [];
    if (!force && ordersByCustomer[customer.id]) return ordersByCustomer[customer.id];
    try {
      const { data } = await service.fetchCustomerOrders(customer.id);
      const rows = Array.isArray(data.data) ? data.data : (data.data?.content || []);
      setOrdersByCustomer((current) => ({ ...current, [customer.id]: rows }));
      return rows;
    } catch (error) {
      notify('error', 'Failed to load customer orders');
      return [];
    }
  };

  const loadPayments = async (customer, force = false) => {
    if (!customer?.id) return [];
    if (!force && paymentsByCustomer[customer.id]) return paymentsByCustomer[customer.id];
    try {
      const { data } = await service.fetchCustomerPayments(customer.id);
      const rows = Array.isArray(data.data) ? data.data : (data.data?.content || []);
      setPaymentsByCustomer((current) => ({ ...current, [customer.id]: rows }));
      return rows;
    } catch (error) {
      notify('error', 'Failed to load customer payments');
      return [];
    }
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
        .map((order) => ({ 
          invoiceId: order.invoiceId, 
          invoiceNo: order.invoiceNo, 
          orderNo: order.orderNo, 
          amountDue: order.amountDue, 
          amount: '' 
        })));
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
      await service.recordPayment(paymentCustomer.id, {
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

  return {
    config,
    timezone,
    SYM,
    money,
    loading,
    search,
    setSearch,
    formOpen,
    setFormOpen,
    editing,
    form,
    setForm,
    saving,
    paymentCustomer,
    setPaymentCustomer,
    paymentInvoice,
    setPaymentInvoice,
    paymentAmount,
    setPaymentAmount,
    paymentMethod,
    setPaymentMethod,
    manualAllocations,
    setManualAllocations,
    expandedCustomer,
    setExpandedCustomer,
    ordersByCustomer,
    paymentsByCustomer,
    activeTab,
    setActiveTab,
    viewingDoc,
    setViewingDoc,
    load,
    filteredCustomers,
    totals,
    openForm,
    saveCustomer,
    toggleStatus,
    loadOrders,
    loadPayments,
    openPayment,
    submitPayment,
    toggleOrders,
    handleViewOrder,
    handleViewPayment,
  };
}
