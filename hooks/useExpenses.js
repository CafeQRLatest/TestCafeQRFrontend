import { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import api from '../utils/api';
import { SCOPE_ALL, SCOPE_GLOBAL } from '../constants/expenseScopes';
import { useCurrencySymbol } from './useCurrencySymbol';

const filterReducer = (state, action) => {
  return { ...state, [action.field]: action.value };
};

export function useExpenses() {
  const { timezone, userRole, orgId } = useAuth();
  const currencySymbol = useCurrencySymbol();
  const { notify, showConfirm } = useNotification();
  
  // Stabilize notify callback reference to prevent infinite re-renders in useEffect
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const getLocalDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // High-performance IANA timezone-safe Date resolution using the Intl API
  const getBusinessNow = useCallback(() => {
    if (!timezone) return new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date()).map(p => [p.type, p.value])
      );
      return new Date(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
      );
    } catch {
      return new Date();
    }
  }, [timezone]);

  // Lazy initialize filter dates based on current timezone business time
  const [filters, dispatch] = useReducer(filterReducer, null, () => ({
    dateFrom: '',
    dateTo: '',
    category: '',
    branch: SCOPE_ALL,
    payMethod: '',
    status: 'ACTIVE'
  }));

  // Adjust dates whenever timezone initializes
  useEffect(() => {
    if (timezone && !filters.dateFrom) {
      const now = getBusinessNow();
      dispatch({ field: 'dateFrom', value: `${getLocalDate(now)}T00:00` });
      dispatch({ field: 'dateTo', value: `${getLocalDate(now)}T23:59` });
    }
  }, [timezone, getBusinessNow, filters.dateFrom]);

  // Modal visibility
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // pendingCatId: set by addCategory so ExpenseForm can auto-select a newly created category
  const [pendingCatId, setPendingCatId] = useState(null);
  const clearPendingCatId = useCallback(() => setPendingCatId(null), []);

  // Category Manager states
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catActiveFilter, setCatActiveFilter] = useState(true);

  // Data states
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formCategories, setFormCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);

  // Pagination state
  const [expPage, setExpPage] = useState(0);
  const [expTotalPages, setExpTotalPages] = useState(0);
  const [expTotalElements, setExpTotalElements] = useState(0);
  const [totalExpensesAllPages, setTotalExpensesAllPages] = useState(0);
  const [allExpensesPeriodBreakdown, setAllExpensesPeriodBreakdown] = useState({});
  const EXP_PAGE_SIZE = 10;



  const isSuperAdmin = useMemo(() => {
    const role = userRole?.toUpperCase() || '';
    return role.includes('SUPER_ADMIN') || role.includes('ADMIN');
  }, [userRole]);

  const toScopeParams = useCallback((value) => {
    if (value === SCOPE_GLOBAL) return { scope: 'GLOBAL' };
    if (!value || value === SCOPE_ALL) return { scope: 'ALL' };
    return { scope: 'BRANCH', branchId: value };
  }, []);

  const toWriteScope = useCallback((value) => {
    if (value === SCOPE_GLOBAL) return { scope: 'GLOBAL', branchId: null };
    return { scope: 'BRANCH', branchId: value || null };
  }, []);

  const toInstant = (dtLocal) => {
    if (!dtLocal) return undefined;
    try {
      return new Date(`${dtLocal}:00`).toISOString();
    } catch {
      return undefined;
    }
  };

  const loadCategoriesForScope = useCallback(async (scopeValue) => {
    const res = await api.get('/api/v1/expense-categories', { params: toScopeParams(scopeValue) });
    if (res.data.success) {
      setFormCategories(res.data.data || []);
      return res.data.data || [];
    }
    return [];
  }, [toScopeParams]);

  const loadData = useCallback(async (silent = false, pageOverride = 0) => {
    if (!filters.dateFrom) return; // Wait for dates initialization
    if (!isSuperAdmin && !orgId) return; // Wait for branch context to resolve
    if (!silent) setLoading(true);
    try {
      const expParams = {
        fromDate: toInstant(filters.dateFrom),
        toDate: toInstant(filters.dateTo),
        categoryId: filters.category || undefined,
        paymentMethod: filters.payMethod || undefined,
        status: filters.status || 'ACTIVE',
        size: EXP_PAGE_SIZE,
        page: pageOverride,
        sort: 'orderDate,desc',
        ...toScopeParams(isSuperAdmin ? filters.branch : orgId),
      };

      const [catRes, expRes, orgRes, bulkRes] = await Promise.allSettled([
        api.get('/api/v1/expense-categories', { params: toScopeParams(isSuperAdmin ? filters.branch : orgId) }),
        api.get('/api/v1/expenses', { params: expParams }),
        isSuperAdmin ? api.get('/api/v1/organizations') : Promise.resolve({ data: { success: true, data: [] } }),
        api.get('/api/v1/expenses', { params: { ...expParams, size: 5000, page: 0 } })
      ]);

      if (catRes.status === 'fulfilled' && catRes.value.data.success) {
        setCategories(catRes.value.data.data || []);
      } else if (!silent) {
        notifyRef.current('error', catRes.reason?.response?.data?.message || 'Expense categories could not be loaded');
      }

      if (expRes.status === 'fulfilled' && expRes.value.data.success) {
        const responseData = expRes.value.data.data;
        const page = Array.isArray(responseData) ? null : responseData;
        const data = page?.content ?? responseData ?? [];
        setExpenses(data);
        setExpPage(page?.number ?? pageOverride);
        setExpTotalPages(page?.totalPages ?? (data.length > 0 ? 1 : 0));
        setExpTotalElements(page?.totalElements ?? data.length);
      } else {
        throw expRes.reason || new Error('Expenses could not be loaded');
      }

      if (bulkRes.status === 'fulfilled' && bulkRes.value.data.success) {
        const resData = bulkRes.value.data.data;
        const bulkPage = Array.isArray(resData) ? null : resData;
        const bulkItems = bulkPage?.content ?? resData ?? [];

        // 1. Calculate grand total across all pages
        const grandTotal = bulkItems.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        setTotalExpensesAllPages(grandTotal);

        // 2. Calculate payment method breakdown across all pages
        const breakdown = {};
        bulkItems.forEach(r => {
          const method = (r.paymentMethod || 'OTHER').toUpperCase();
          if (method === 'MIXED') {
            const cash = parseFloat(r.cashAmount) || 0;
            const online = parseFloat(r.onlineAmount) || 0;
            breakdown['CASH'] = (breakdown['CASH'] || 0) + cash;
            breakdown['ONLINE'] = (breakdown['ONLINE'] || 0) + online;
          } else {
            breakdown[method] = (breakdown[method] || 0) + (parseFloat(r.amount) || 0);
          }
        });
        setAllExpensesPeriodBreakdown(breakdown);
      }

      if (orgRes.status === 'fulfilled' && orgRes.value.data.success) {
        setBranches(orgRes.value.data.data || []);
      }
    } catch (e) {
      console.error('Expense Load Error:', e);
      notifyRef.current('error', 'Failed to load expense data');
    } finally {
      setLoading(false);
    }
  }, [filters, isSuperAdmin, orgId, toScopeParams]);

  useEffect(() => {
    if (userRole) loadData();
  }, [userRole, loadData]);

  const totalAll = useMemo(
    () => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    [expenses]
  );

  // Opening the form — ExpenseForm owns its own field state and initializes from `editing`
  const openAdd = useCallback(() => {
    setEditing(null);
    setPendingCatId(null);
    setShowForm(true);
    const initialScope = isSuperAdmin ? (orgId || SCOPE_GLOBAL) : (orgId || '');
    loadCategoriesForScope(initialScope);
  }, [isSuperAdmin, orgId, loadCategoriesForScope]);

  const openEdit = useCallback((exp) => {
    setEditing(exp);
    setPendingCatId(null);
    setShowForm(true);
    const initialScope = (exp.scope === SCOPE_GLOBAL || !exp.orgId) ? SCOPE_GLOBAL : exp.orgId;
    loadCategoriesForScope(initialScope);
  }, [loadCategoriesForScope]);

  /**
   * handleSubmit receives the fully assembled, validated payload from ExpenseForm.
   * Idempotency key generation and API routing remain here (hook owns I/O concerns).
   */
  const handleSubmit = useCallback(async (payload) => {
    setSaving(true);
    try {
      const idempotencyKey = crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

      if (editing) {
        await api.patch(`/api/v1/expenses/${editing.id}`, payload, {
          headers: { 'Idempotency-Key': idempotencyKey }
        });
        notifyRef.current('success', 'Expense updated (old record voided)');
      } else {
        await api.post('/api/v1/expenses', payload, {
          headers: { 'Idempotency-Key': idempotencyKey }
        });
        notifyRef.current('success', 'Expense recorded successfully');
      }
      setShowForm(false);
      setEditing(null);
      await loadData(true);
    } catch (err) {
      notifyRef.current('error', err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editing, loadData]);

  const addCategory = useCallback(async (scopeValue) => {
    if (!catName.trim()) return;
    setCatSaving(true);
    try {
      const res = await api.post('/api/v1/expense-categories', {
        name: catName.trim(),
        sortOrder: 99,
        ...toWriteScope(scopeValue)
      });

      if (res.data.success) {
        const newCat = res.data.data;
        setCatName('');
        notifyRef.current('success', 'Category added');
        await loadData(true);
        // Signal ExpenseForm to auto-select the new category via pendingCatId
        if (newCat?.id) setPendingCatId(newCat.id);
        setShowCatMgr(false);
      }
    } catch (e) {
      notifyRef.current('error', 'Failed to add category');
    } finally {
      setCatSaving(false);
    }
  }, [catName, loadData, toWriteScope]);

  const toggleCatActive = useCallback((cat) => {
    const isY = cat.active === true;
    showConfirm({
      title: isY ? 'Mark Inactive?' : 'Restore Category?',
      message: `Are you sure you want to ${isY ? 'mark as inactive' : 'restore'} "${cat.name}"?`,
      type: isY ? 'error' : 'success',
      onConfirm: async () => {
        try {
          await api.put(`/api/v1/expense-categories/${cat.id}`, {
            name: cat.name,
            sortOrder: cat.sortOrder || 0,
            active: !isY
          });
          notifyRef.current('success', `Category ${isY ? 'marked inactive' : 'restored'}`);
          await loadData(true);
        } catch (e) {
          notifyRef.current('error', 'Operation failed');
        }
      }
    });
  }, [loadData, showConfirm]);

  const handleDelete = useCallback((id) => {
    showConfirm({
      title: 'Delete Expense?',
      message: 'This action will permanently remove this record from the accounts.',
      type: 'error',
      onConfirm: async () => {
        try {
          await api.delete(`/api/v1/expenses/${id}`);
          notifyRef.current('success', 'Expense record deleted');
          await loadData(true);
        } catch (e) {
          notifyRef.current('error', 'Failed to delete record');
        }
      }
    });
  }, [loadData, showConfirm]);

  // fetchPage: navigate to a specific page without resetting filters
  const fetchPage = useCallback((pageIndex) => {
    loadData(false, pageIndex);
  }, [loadData]);

  return {
    timezone,
    userRole,
    orgId,
    currencySymbol,
    filters,
    dispatch,
    expenses,
    categories,
    formCategories,
    loading,
    saving,
    catSaving,
    branches,
    isSuperAdmin,
    totalAll,
    totalExpensesAllPages,
    allExpensesPeriodBreakdown,

    // Pagination
    expPage,
    expTotalPages,
    expTotalElements,
    fetchPage,
    
    // Form visibility
    showForm,
    setShowForm,
    editing,
    setEditing,
    openAdd,
    openEdit,
    handleSubmit,
    handleDelete,
    
    // pendingCatId: when addCategory succeeds, ExpenseForm picks this up to auto-select
    pendingCatId,
    clearPendingCatId,
    
    // Category CRUD
    showCatMgr,
    setShowCatMgr,
    catName,
    setCatName,
    catActiveFilter,
    setCatActiveFilter,
    addCategory,
    toggleCatActive,
    
    // Exposed so ExpenseForm can reload categories on scope change
    loadCategoriesForScope,
    loadData
  };
}
