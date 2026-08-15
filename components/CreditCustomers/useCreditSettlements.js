import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import * as service from './creditCustomerService';
import { isFeatureEnabled } from '../../utils/moduleVisibility';

const emptyCustomerForm = {
  name: '',
  phone: '',
  email: '',
  creditLimit: '',
  openingBalance: '',
  notes: '',
};

const emptyVendorForm = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  creditLimit: '',
  openingBalance: '',
};

export default function useCreditSettlements() {
  const { notify } = useNotification();
  const { timezone, userRole, orgId, hasModule } = useAuth();

  // Mode: 'customers' or 'vendors'
  const [mode, setMode] = useState('customers');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const purchaseEnabled = isFeatureEnabled(config, 'purchaseEnabled') && (userRole === 'OWNER' || hasModule('INVENTORY'));

  useEffect(() => {
    if (config && !purchaseEnabled && mode === 'vendors') {
      setMode('customers');
    }
  }, [config, purchaseEnabled, mode]);

  // ── CUSTOMERS STATE ────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Customer Payments
  const [paymentCustomer, setPaymentCustomer] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [manualAllocations, setManualAllocations] = useState([]);

  // Expanded Customer Ledger
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});
  const [paymentsByCustomer, setPaymentsByCustomer] = useState({});

  // ── VENDORS STATE ──────────────────────────────────────────────────────────
  const [vendors, setVendors] = useState([]);
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);
  const [savingVendor, setSavingVendor] = useState(false);

  // Vendor Payments
  const [paymentVendor, setPaymentVendor] = useState(null);
  const [vendorPaymentOrder, setVendorPaymentOrder] = useState(null);
  const [vendorPaymentAmount, setVendorPaymentAmount] = useState('');
  const [vendorPaymentMethod, setVendorPaymentMethod] = useState('CASH');
  const [vendorPaymentNotes, setVendorPaymentNotes] = useState('');
  const [vendorManualAllocations, setVendorManualAllocations] = useState([]);

  // Expanded Vendor Ledger
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [ordersByVendor, setOrdersByVendor] = useState({});
  const [paymentsByVendor, setPaymentsByVendor] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('vendor_payments_history');
        return saved ? JSON.parse(saved) : {};
      } catch { return {}; }
    }
    return {};
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && paymentsByVendor && Object.keys(paymentsByVendor).length > 0) {
      try {
        localStorage.setItem('vendor_payments_history', JSON.stringify(paymentsByVendor));
      } catch {}
    }
  }, [paymentsByVendor]);

  // Common UI State
  const [activeTab, setActiveTab] = useState('orders');
  const [viewingDoc, setViewingDoc] = useState(null);

  const SYM = config?.currencySymbol || '₹';
  const money = useCallback((value) => {
    return `${SYM}${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [SYM]);

  const [sequences, setSequences] = useState([]);

  // Sequence Number Helper
  const getNextSequence = useCallback((docType) => {
    const seq = sequences.find((s) => s.documentType === docType);
    const year = new Date().getFullYear();
    const branchCode = config?.branchCode || 'KKD';

    if (seq) {
      const defaultPfx = docType === 'OUTBOUND_PAYMENT' ? 'PAY-{YYYY}-' : 'REC-{YYYY}-';
      const defaultSfx = '-{BRANCH_CODE}';

      const pfx = (seq.prefix || defaultPfx)
        .replace(/{YYYY}/gi, year)
        .replace(/{BRANCH_CODE}/gi, branchCode);

      const sfx = (seq.suffix || defaultSfx)
        .replace(/{YYYY}/gi, year)
        .replace(/{BRANCH_CODE}/gi, branchCode);

      const nextNum = (seq.nextNumber == null || isNaN(seq.nextNumber)) ? 1 : Number(seq.nextNumber);
      const padLen = (seq.paddingLength == null || isNaN(seq.paddingLength)) ? 7 : Number(seq.paddingLength);

      const formattedNumber = `${pfx}${String(nextNum).padStart(padLen, '0')}${sfx}`;
      return { formattedNumber, sequenceObj: seq };
    }

    const defaultPrefix = docType === 'OUTBOUND_PAYMENT' ? `PAY-${year}-` : `REC-${year}-`;
    const formattedNumber = `${defaultPrefix}${String(Date.now()).slice(-7)}-${branchCode}`;
    return { formattedNumber, sequenceObj: null };
  }, [sequences, config]);

  const advanceSequence = async (seqObj) => {
    if (!seqObj?.id) return;
    try {
      const nextNum = Number(seqObj.nextNumber || 1) + 1;
      await api.put(`/api/v1/settings/sequences/${seqObj.id}`, {
        ...seqObj,
        nextNumber: nextNum,
      }).catch(() => {});
    } catch {}
  };

  // Load All Master Data
  // NOTE: ordersByVendor and paymentsByVendor are used as refs to avoid stale closures.
  const ordersByVendorRef = React.useRef(ordersByVendor);
  const paymentsByVendorRef = React.useRef(paymentsByVendor);
  React.useEffect(() => { ordersByVendorRef.current = ordersByVendor; }, [ordersByVendor]);
  React.useEffect(() => { paymentsByVendorRef.current = paymentsByVendor; }, [paymentsByVendor]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const currentOrgId = orgId || (typeof window !== 'undefined' ? (require('js-cookie').default.get('orgId') || '') : '');
      const isSuperAdmin = userRole === 'SUPER_ADMIN';
      const params = currentOrgId ? { orgId: currentOrgId } : {};

      const [configRes, customersRes, vendorsRes, sequencesRes] = await Promise.all([
        service.fetchConfigurations(),
        service.fetchCustomers().catch(() => ({ data: { data: [] } })),
        api.get('/api/v1/credit/partners', { params: { ...params, partnerType: 'VENDOR' } }).catch(() => ({ data: { data: [] } })),
        api.get('/api/v1/settings/sequences').catch(() => ({ data: { data: [] } })),
      ]);

      setConfig(configRes.data?.data || null);
      setCustomers(customersRes.data?.data || []);
      setSequences(sequencesRes.data?.data || []);

      const rawVendors = vendorsRes.data?.success ? vendorsRes.data.data || [] : (Array.isArray(vendorsRes.data?.data) ? vendorsRes.data.data : []);
      const filteredVendors = rawVendors.filter((v) => {
        if (!currentOrgId || isSuperAdmin) return true;
        const vOrg = String(v.organizationId || v.organization_id || v.orgId || v.org_id || '');
        return !vOrg || String(vOrg) === String(currentOrgId);
      });

      // CreditBPartnerDto directly includes backend-calculated `balance`
      const computedVendors = filteredVendors.map((v) => ({
        ...v,
        balance: Number(v.balance ?? 0),
      }));

      setVendors(computedVendors);
    } catch (error) {
      notify('error', error.response?.data?.message || 'Failed to load credit settlements data');
    } finally {
      setLoading(false);
    }
  }, [notify, orgId, userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── CUSTOMERS LOGIC ────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) => (
      String(c.name || '').toLowerCase().includes(term) ||
      String(c.phone || '').toLowerCase().includes(term)
    ));
  }, [customers, search]);

  const customerTotals = useMemo(() => ({
    active: customers.filter((c) => String(c.status || '').toUpperCase() === 'ACTIVE').length,
    owed: customers.reduce((sum, c) => sum + Number(c.balance || 0), 0),
    lifetime: customers.reduce((sum, c) => sum + Number(c.totalCreditExtended || 0), 0),
  }), [customers]);

  const openCustomerForm = (customer = null) => {
    setEditingCustomer(customer);
    setCustomerForm(customer ? {
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      creditLimit: customer.creditLimit ?? '',
      openingBalance: customer.openingBalance ?? '',
      notes: customer.notes || '',
    } : emptyCustomerForm);
    setCustomerFormOpen(true);
  };

  const saveCustomer = async () => {
    setSavingCustomer(true);
    try {
      const payload = {
        ...customerForm,
        creditLimit: Number(customerForm.creditLimit || 0),
        openingBalance: Number(customerForm.openingBalance || 0),
      };
      if (editingCustomer) {
        await service.updateCustomer(editingCustomer.id, payload);
      } else {
        await service.createCustomer(payload);
      }
      notify('success', editingCustomer ? 'Credit customer updated' : 'Credit customer created');
      setCustomerFormOpen(false);
      setEditingCustomer(null);
      await loadData();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Save failed');
    } finally {
      setSavingCustomer(false);
    }
  };

  const toggleCustomerStatus = async (customer) => {
    const suspended = String(customer.status || '').toUpperCase() === 'SUSPENDED';
    try {
      if (suspended) {
        await service.reactivateCustomer(customer.id);
      } else {
        await service.suspendCustomer(customer.id);
      }
      notify('success', suspended ? 'Customer reactivated' : 'Customer suspended');
      await loadData();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Status update failed');
    }
  };

  const loadCustomerOrders = async (customer, force = false, page = 0, size = 50) => {
    if (!customer?.id) return [];
    if (!force && ordersByCustomer[customer.id]) return ordersByCustomer[customer.id];
    try {
      const { data } = await service.fetchCustomerOrders(customer.id, page, size, 'CUSTOMER');
      const rows = Array.isArray(data.data) ? data.data : (data.data?.content || []);
      const unpaidRows = rows.filter((o) => {
        const st = String(o.status || '').toUpperCase();
        const due = Number(o.amountDue ?? 0);
        return st !== 'PAID' && (o.amountDue == null || due > 0);
      });
      setOrdersByCustomer((current) => ({ ...current, [customer.id]: unpaidRows }));
      return unpaidRows;
    } catch {
      notify('error', 'Failed to load customer orders');
      return [];
    }
  };

  const loadCustomerPayments = async (customer, force = false, page = 0, size = 50) => {
    if (!customer?.id) return [];
    if (!force && paymentsByCustomer[customer.id]) return paymentsByCustomer[customer.id];
    try {
      const { data } = await service.fetchCustomerPayments(customer.id, page, size, 'CUSTOMER');
      const rows = Array.isArray(data.data) ? data.data : (data.data?.content || []);
      setPaymentsByCustomer((current) => ({ ...current, [customer.id]: rows }));
      return rows;
    } catch {
      notify('error', 'Failed to load customer payments');
      return [];
    }
  };

  const openCustomerPayment = async (customer, invoice = null) => {
    setPaymentCustomer(customer);
    setPaymentInvoice(invoice);
    setPaymentAmount(invoice ? String(invoice.amountDue || '') : '');
    setPaymentMethod('CASH');
    if (invoice) {
      setManualAllocations([]);
      return;
    }
    try {
      const orders = await loadCustomerOrders(customer);
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

  const submitCustomerPayment = async () => {
    if (!paymentCustomer) return;
    const amount = Number(paymentAmount || 0);
    if (amount <= 0) return notify('error', 'Enter a payment amount');

    if (paymentInvoice) {
      // Direct invoice/order payment — validate against the invoice due amount only
      const invoiceDue = Number(paymentInvoice.amountDue || paymentInvoice.total || paymentInvoice.grandTotal || 0);
      if (invoiceDue > 0 && amount > invoiceDue + 0.01) {
        return notify('error', `Amount exceeds invoice due of ${money(invoiceDue)}`);
      }
    } else {
      // Bulk settlement — validate against customer overall balance
      const customerBalance = Number(paymentCustomer.balance || paymentCustomer.totalCreditExtended || 0);
      const maxPayable = customerBalance > 0 ? customerBalance : 0;
      if (maxPayable === 0) return notify('error', 'This customer has no outstanding balance');
      if (amount > maxPayable) return notify('error', `Amount exceeds outstanding due of ${money(maxPayable)}`);
    }

    const allocationMode = config?.creditAllocationMode || 'OLDEST_FIRST';
    const allocations = allocationMode === 'MANUAL'
      ? manualAllocations
          .map((row) => ({ invoiceId: row.invoiceId, amount: Number(row.amount || 0) }))
          .filter((row) => row.invoiceId && row.amount > 0)
      : [];

    // Snapshot customer before clearing state
    const paidCustomer = paymentCustomer;
    const paidInvoice = paymentInvoice;

    try {
      await service.recordPayment(paidCustomer.id, {
        amount,
        paymentMethod,
        allocationMode,
        invoiceId: paidInvoice ? paidInvoice.invoiceId : null,
        allocations,
      });

      // ── Optimistic immediate UI update ──────────────────────────────────────
      // Update the specific order in ordersByCustomer instantly so the status
      // badge and amountDue change without requiring a page refresh.
      setOrdersByCustomer((current) => {
        const custOrders = current[paidCustomer.id] || [];
        const updatedOrders = custOrders.map((order) => {
          let newAmountDue = Number(order.amountDue || 0);
          let allocated = 0;

          if (paidInvoice) {
            // Direct single-invoice payment
            const matches =
              order.invoiceId === paidInvoice.invoiceId ||
              order.orderNo === paidInvoice.orderNo ||
              order.invoiceNo === paidInvoice.invoiceNo;
            if (matches) {
              allocated = Math.min(amount, newAmountDue);
            }
          } else if (allocationMode === 'MANUAL' && allocations.length > 0) {
            // Manual allocation
            const alloc = allocations.find((a) => a.invoiceId === order.invoiceId);
            if (alloc) allocated = Number(alloc.amount || 0);
          } else {
            // FIFO — will be recalculated when orders reload; skip optimistic here
            allocated = 0;
          }

          if (allocated > 0) {
            newAmountDue = Math.max(0, newAmountDue - allocated);
            const newStatus = newAmountDue <= 0.01 ? 'paid' : 'partial';
            return { ...order, amountDue: newAmountDue, status: newStatus };
          }
          return order;
        });
        return { ...current, [paidCustomer.id]: updatedOrders };
      });

      // Immediately reduce customer balance in customers list
      setCustomers((current) => current.map((c) => {
        if (c.id !== paidCustomer.id) return c;
        const newBalance = Math.max(0, Number(c.balance || 0) - amount);
        return { ...c, balance: newBalance };
      }));

      notify('success', 'Customer payment recorded successfully');
      setPaymentCustomer(null);
      setPaymentInvoice(null);
      setPaymentAmount('');
      setManualAllocations([]);

      // Force reload orders + payments from backend to confirm truth
      await Promise.all([
        loadCustomerOrders(paidCustomer, true),
        loadCustomerPayments(paidCustomer, true),
      ]);
      // Then full data refresh for balance sync
      await loadData();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Payment recording failed');
    }
  };

  const toggleCustomerOrders = async (customer) => {
    const isCurrent = expandedCustomer?.id === customer.id || expandedCustomer === customer.id;
    if (isCurrent) {
      setExpandedCustomer(null);
      return;
    }
    setExpandedCustomer(customer);
    setActiveTab('orders');
    await Promise.all([
      loadCustomerOrders(customer, true),
      loadCustomerPayments(customer, true),
    ]);
  };

  // ── VENDORS LOGIC ──────────────────────────────────────────────────────────
  const filteredVendors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter((v) => (
      String(v.name || '').toLowerCase().includes(term) ||
      String(v.contactPerson || '').toLowerCase().includes(term) ||
      String(v.phone || '').toLowerCase().includes(term) ||
      String(v.gstin || '').toLowerCase().includes(term)
    ));
  }, [vendors, search]);

  const vendorTotals = useMemo(() => ({
    active: vendors.filter((v) => String(v.isactive || v.status || 'Y').toUpperCase() !== 'N').length,
    owed: vendors.reduce((sum, v) => sum + Number(v.balance ?? 0), 0),
    lifetime: vendors.reduce((sum, v) => sum + Number(v.creditLimit || v.openingBalance || 0), 0),
  }), [vendors]);

  const openVendorForm = (vendor = null) => {
    setEditingVendor(vendor);
    setVendorForm(vendor ? {
      name: vendor.name || '',
      contactPerson: vendor.contactPerson || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      gstin: vendor.gstin || '',
      creditLimit: vendor.creditLimit ?? '',
      openingBalance: vendor.openingBalance ?? '',
    } : emptyVendorForm);
    setVendorFormOpen(true);
  };

  const saveVendor = async () => {
    setSavingVendor(true);
    try {
      const payload = {
        ...vendorForm,
        creditLimit: Number(vendorForm.creditLimit || 0),
        openingBalance: Number(vendorForm.openingBalance || 0),
      };
      if (editingVendor) {
        await api.put(`/api/v1/purchasing/vendors/${editingVendor.id}`, payload);
      } else {
        await api.post('/api/v1/purchasing/vendors', payload);
      }
      notify('success', editingVendor ? 'Vendor updated successfully' : 'Vendor created successfully');
      setVendorFormOpen(false);
      setEditingVendor(null);
      await loadData();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Failed to save vendor');
    } finally {
      setSavingVendor(false);
    }
  };

  const toggleVendorStatus = async (vendor) => {
    const isSuspended = String(vendor.isactive || vendor.status || 'Y').toUpperCase() === 'N';
    try {
      await api.put(`/api/v1/purchasing/vendors/${vendor.id}`, {
        ...vendor,
        isactive: isSuspended ? 'Y' : 'N',
      });
      notify('success', isSuspended ? 'Vendor reactivated' : 'Vendor suspended');
      await loadData();
    } catch (error) {
      notify('error', error.response?.data?.message || 'Status update failed');
    }
  };

  const loadVendorOrders = async (vendor, force = false) => {
    if (!vendor?.id) return [];
    if (!force && ordersByVendor[vendor.id]) return ordersByVendor[vendor.id];
    try {
      // Use credit endpoint to get vendor bills (invoices) with accurate amountDue/amountPaid
      const { data } = await api.get(`/api/v1/credit/partners/${vendor.id}/orders`, {
        params: { partnerType: 'VENDOR', page: 0, size: 100 }
      });
      const rows = Array.isArray(data.data)
        ? data.data
        : (data.data?.content || []);
      const unpaidRows = rows.filter((o) => {
        const st = String(o.status || o.paymentStatus || '').toUpperCase();
        const due = Number(o.amountDue ?? 0);
        return st !== 'PAID' && (o.amountDue == null || due > 0);
      });
      setOrdersByVendor((current) => ({ ...current, [vendor.id]: unpaidRows }));
      return unpaidRows;
    } catch (err) {
      // Credit endpoint failed – fall back to raw purchase orders list
      console.warn('Credit orders endpoint failed, falling back to purchase orders:', err?.response?.data?.message || err?.message);
      try {
        const { data } = await api.get('/api/v1/purchase/orders', { params: { vendorId: vendor.id, size: 200 } });
        const rows = Array.isArray(data.data) ? data.data : (data.data?.content || []);
        const receivedOrders = rows.filter((o) => {
          const st = String(o.orderStatus || o.order_status || '').toUpperCase();
          return st === 'COMPLETED' || st === 'RECEIVED';
        });
        setOrdersByVendor((current) => ({ ...current, [vendor.id]: receivedOrders }));
        return receivedOrders;
      } catch {
        setOrdersByVendor((current) => ({ ...current, [vendor.id]: [] }));
        return [];
      }
    }
  };

  const loadVendorPayments = async (vendor, force = false, page = 0, size = 50) => {
    if (!vendor?.id) return [];
    if (!force && paymentsByVendor[vendor.id]) return paymentsByVendor[vendor.id];
    try {
      const { data } = await api.get(`/api/v1/credit/partners/${vendor.id}/payments`, {
        params: { partnerType: 'VENDOR', page, size }
      });
      const rows = Array.isArray(data.data) ? data.data : (data.data?.content || []);
      setPaymentsByVendor((current) => ({ ...current, [vendor.id]: rows }));
      return rows;
    } catch {
      notify('error', 'Failed to load vendor settlements history');
      return [];
    }
  };

  const openVendorPayment = async (vendor, order = null) => {
    setPaymentVendor(vendor);
    setVendorPaymentOrder(order);
    // When settling a specific order, prefill with REMAINING DUE from credit bill (amountDue)
    const due = order ? Math.max(0, Number(order.amountDue ?? 0)) : 0;
    setVendorPaymentAmount(order ? String(due) : '');
    setVendorPaymentMethod('CASH');
    setVendorPaymentNotes('');

    if (order) {
      setVendorManualAllocations([]);
      return;
    }

    try {
      const orders = await loadVendorOrders(vendor, true);
      const unpaidOrders = orders.filter((o) => {
        const st = String(o.status || '').toUpperCase();
        return st !== 'PAID' && Number(o.amountDue ?? 0) > 0;
      });
      setVendorManualAllocations(unpaidOrders.map((o) => ({
        invoiceId: o.invoiceId,
        orderId: o.orderId,
        poNumber: o.orderNo || o.invoiceNo,
        totalAmount: Number(o.total ?? 0),
        amountPaid: Number(o.amountPaid ?? 0),
        amountDue: Number(o.amountDue ?? 0),
        amount: ''
      })));
    } catch {
      setVendorManualAllocations([]);
    }
  };

  const submitVendorPayment = async () => {
    if (!paymentVendor) return;
    const amount = Number(vendorPaymentAmount || 0);
    if (amount <= 0) return notify('error', 'Enter a valid payment amount');

    // For direct order settlement, validate amount does not exceed invoice amountDue
    if (vendorPaymentOrder) {
      const due = Math.max(0, Number(vendorPaymentOrder.amountDue ?? 0));
      if (due > 0 && amount > due + 0.01) {
        return notify('error', `Amount ₹${amount} exceeds remaining due of ₹${due.toFixed(2)}`);
      }
    }

    try {
      setSavingVendor(true);

      // Resolve invoiceId to link the credit payment to a specific vendor bill
      const invoiceId = vendorPaymentOrder?.invoiceId ?? null;

      // Call credit payment API — backend handles allocation & invoice amountDue reduction
      await api.post(`/api/v1/credit/partners/${paymentVendor.id}/payments`, {
        amount,
        paymentMethod: vendorPaymentMethod,
        description: vendorPaymentNotes || null,
        invoiceId,
        partnerType: 'VENDOR',
      });

      notify('success', `Vendor payment of ${money(amount)} settled successfully!`);
      setPaymentVendor(null);
      setVendorPaymentOrder(null);
      setVendorPaymentAmount('');
      setVendorPaymentNotes('');
      setVendorManualAllocations([]);
      // Reload fresh data from backend (vendor balance, orders, payments all recalculated)
      await loadData();
      if (expandedVendor?.id) {
        await Promise.all([
          loadVendorOrders({ id: expandedVendor.id }, true),
          loadVendorPayments({ id: expandedVendor.id }, true),
        ]);
      }
    } catch (error) {
      notify('error', error.response?.data?.message || 'Vendor settlement failed');
    } finally {
      setSavingVendor(false);
    }
  };

  const toggleVendorOrders = async (vendor) => {
    if (expandedVendor?.id === vendor.id) {
      setExpandedVendor(null);
      return;
    }
    setExpandedVendor(vendor);
    setActiveTab('orders');
    await Promise.all([
      loadVendorOrders(vendor, true),
      loadVendorPayments(vendor, true),
    ]);
  };

  // Document Viewer Handlers
  const handleViewOrder = (order) => setViewingDoc({ order, type: 'order' });
  const handleViewPayment = (pay) => setViewingDoc({ order: pay, type: 'payment' });

  return {
    mode,
    setMode,
    purchaseEnabled,
    config,
    timezone,
    SYM,
    money,
    loading,
    search,
    setSearch,
    activeTab,
    setActiveTab,
    viewingDoc,
    setViewingDoc,
    handleViewOrder,
    handleViewPayment,

    // Customer Exports
    customers: filteredCustomers,
    customerTotals,
    customerFormOpen,
    setCustomerFormOpen,
    editingCustomer,
    customerForm,
    setCustomerForm,
    savingCustomer,
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
    ordersByCustomer,
    paymentsByCustomer,
    openCustomerForm,
    saveCustomer,
    toggleCustomerStatus,
    openCustomerPayment,
    submitCustomerPayment,
    toggleCustomerOrders,

    // Vendor Exports
    vendors: filteredVendors,
    vendorTotals,
    vendorFormOpen,
    setVendorFormOpen,
    editingVendor,
    vendorForm,
    setVendorForm,
    savingVendor,
    paymentVendor,
    setPaymentVendor,
    vendorPaymentOrder,
    setVendorPaymentOrder,
    vendorPaymentAmount,
    setVendorPaymentAmount,
    vendorPaymentMethod,
    setVendorPaymentMethod,
    vendorPaymentNotes,
    setVendorPaymentNotes,
    vendorManualAllocations,
    setVendorManualAllocations,
    expandedVendor,
    ordersByVendor,
    paymentsByVendor,
    openVendorForm,
    saveVendor,
    toggleVendorStatus,
    openVendorPayment,
    submitVendorPayment,
    toggleVendorOrders,
  };
}
