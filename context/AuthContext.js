import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import api from '../utils/api';
import { getFrontendCookieOptions } from '../utils/cookieOptions';

const AuthContext = createContext();

const getStorageItem = (key) => {
  let val = Cookies.get(key);
  if ((val === undefined || val === null || val === '') && typeof window !== 'undefined') {
    try {
      val = window.localStorage.getItem(key) || undefined;
    } catch (e) {}
  }
  return val;
};

const setStorageItem = (key, val, options) => {
  if (val !== undefined && val !== null) {
    const valStr = typeof val === 'string' ? val : JSON.stringify(val);
    Cookies.set(key, valStr, options);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(key, valStr);
      } catch (e) {}
    }
  }
};

const removeStorageItem = (key, options) => {
  Cookies.remove(key, options);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
  }
};

export const AuthProvider = ({ children }) => {
  const [userRole, setUserRole] = useState(null);
  const [email, setEmail] = useState(null);
  const [firstName, setFirstName] = useState(null);
  const [lastName, setLastName] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionExpiryDate, setSubscriptionExpiryDate] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgName, setOrgName] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState(null);
  const [terminalId, setTerminalId] = useState(null);
  const [terminalName, setTerminalName] = useState(null);
  const [userId, setUserId] = useState(null);
  const [currency, setCurrency] = useState(null);
  const [country, setCountry] = useState(null);
  const [timezone, setTimezone] = useState(null);
  const [posType, setPosType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignedMenus, setAssignedMenus] = useState([]);
  const [menusLoading, setMenusLoading] = useState(true);
  const [canCancelOrder, setCanCancelOrder] = useState(true);
  const [canDeleteOrderItem, setCanDeleteOrderItem] = useState(true);
  const [canDecrementOrderItem, setCanDecrementOrderItem] = useState(true);
  const [activeModules, setActiveModules] = useState([]);
  const [activeModulesDetailed, setActiveModulesDetailed] = useState([]);
  const router = useRouter();

  const fetchAssignedMenus = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[AuthContext] Device offline, skipping fetchAssignedMenus');
      setMenusLoading(false);
      return;
    }
    try {
      setMenusLoading(true);
      console.log('[AuthContext] Fetching assigned menus from /api/v1/users/menus...');
      const resp = await api.get('/api/v1/users/menus');
      console.log('[AuthContext] Menus response:', resp.data?.success, 'Count:', resp.data?.data?.length);
      if (resp.data.success) {
        setAssignedMenus(resp.data.data || []);
      }
    } catch (err) {
      if (err?.message !== 'Network Error') {
        console.error("[AuthContext] Failed to fetch assigned menus:", err?.response?.status || err?.message || err);
      }
    } finally {
      setMenusLoading(false);
    }
  };

  useEffect(() => {
    try {
      console.log('[AuthContext] Starting session initialization from storage/cookies...');
      // Check for session metadata in cookies or localStorage fallback
      const storedRole = getStorageItem('userRole');
      const storedEmail = getStorageItem('userEmail');
      const storedFirstName = getStorageItem('firstName');
      const storedLastName = getStorageItem('lastName');
      const storedStatus = (getStorageItem('subscriptionStatus') || '').toUpperCase();
      const storedExpiry = getStorageItem('subscriptionExpiryDate');
      const storedOrgId = getStorageItem('orgId');
      const storedOrgName = getStorageItem('orgName');
      const storedClientId = getStorageItem('clientId');
      const storedClientName = getStorageItem('clientName');
      const storedTerminalId = getStorageItem('terminalId');
      const storedTerminalName = getStorageItem('terminalName');
      const storedUserId = getStorageItem('userId');
      const storedCurrency = getStorageItem('currency');
      const storedCountry = getStorageItem('country');
      const storedTimezone = getStorageItem('timezone');
      const storedPosType = getStorageItem('posType');
      const storedCanCancelOrder = getStorageItem('canCancelOrder');
      const storedCanDeleteOrderItem = getStorageItem('canDeleteOrderItem');
      const storedCanDecrementOrderItem = getStorageItem('canDecrementOrderItem');
      const storedModules = getStorageItem('activeModules');
      const storedModulesDetailed = getStorageItem('activeModulesDetailed');
      
      console.log('[AuthContext] Storage loaded:', { storedEmail, storedRole, storedOrgId, storedClientId, storedStatus });

      if (storedEmail) setEmail(storedEmail);
      if (storedFirstName) setFirstName(storedFirstName);
      if (storedLastName) setLastName(storedLastName);
      if (storedRole) setUserRole(storedRole);
      if (storedStatus) setSubscriptionStatus(storedStatus);
      if (storedOrgId) setOrgId(storedOrgId);
      if (storedOrgName) setOrgName(storedOrgName);
      if (storedClientId) setClientId(storedClientId);
      if (storedClientName) setClientName(storedClientName);
      if (storedTerminalId) setTerminalId(storedTerminalId);
      if (storedTerminalName) setTerminalName(storedTerminalName);
      if (storedUserId) setUserId(storedUserId);
      if (storedCurrency) setCurrency(storedCurrency);
      if (storedCountry) setCountry(storedCountry);
      if (storedTimezone) setTimezone(storedTimezone);
      if (storedPosType) setPosType(storedPosType);
      if (storedCanCancelOrder !== undefined) setCanCancelOrder(storedCanCancelOrder === 'true');
      if (storedCanDeleteOrderItem !== undefined) setCanDeleteOrderItem(storedCanDeleteOrderItem === 'true');
      if (storedCanDecrementOrderItem !== undefined) setCanDecrementOrderItem(storedCanDecrementOrderItem === 'true');
      if (storedModules) {
        try {
          setActiveModules(JSON.parse(storedModules));
        } catch (e) {
          setActiveModules([]);
        }
      }
      if (storedModulesDetailed) {
        try {
          setActiveModulesDetailed(JSON.parse(storedModulesDetailed));
        } catch (e) {
          setActiveModulesDetailed([]);
        }
      }
      
      if (storedExpiry) {
        try {
          const parsed = JSON.parse(storedExpiry);
          setSubscriptionExpiryDate(parsed);
        } catch (e) {
          setSubscriptionExpiryDate(storedExpiry);
        }
      }

      // Auto-fetch and sync latest client profile (timezone, currency, country) in the background if authenticated
      if (storedEmail) {
        const cookieOptions = getFrontendCookieOptions();
        Promise.all([
          api.get('/api/v1/clients/me', { skipAuthRedirect: true }).catch(() => null),
          storedOrgId ? api.get(`/api/v1/organizations/${storedOrgId}`, { skipAuthRedirect: true }).catch(() => null) : Promise.resolve(null)
        ]).then(([clientRes, orgRes]) => {
          const clientData = clientRes?.data?.success ? (clientRes.data.data || {}) : {};
          const orgData = orgRes?.data?.success ? (orgRes.data.data || {}) : {};
          
          const resolvedTimezone = orgData.timezone || clientData.timezone;

          if (resolvedTimezone) {
            setTimezone(resolvedTimezone);
            setStorageItem('timezone', resolvedTimezone, cookieOptions);
          }
          if (clientData.currency) {
            setCurrency(clientData.currency);
            setStorageItem('currency', clientData.currency, cookieOptions);
          }
          if (clientData.country) {
            setCountry(clientData.country);
            setStorageItem('country', clientData.country, cookieOptions);
          }
          if (clientData.posType) {
            setPosType(clientData.posType);
            setStorageItem('posType', clientData.posType, cookieOptions);
          }
        }).catch(err => console.error("[AuthContext] Profile sync error:", err));

        api.get('/api/v1/subscription/status', { skipAuthRedirect: true }).then(res => {
          if (res.data?.success) {
            const subData = res.data.data || {};
            updateSubscription(subData.status, subData.expiryDate, subData.activeModules, subData.activeModulesDetailed);
          }
        }).catch(err => console.error("[AuthContext] Subscription sync error:", err));

        // Fetch assigned menus for the logged-in user
        fetchAssignedMenus();
      } else {
        setMenusLoading(false);
      }
    } catch (err) {
      console.error("[AuthContext] Init error:", err);
    } finally {
      console.log('[AuthContext] Session init complete, setting loading = false');
      setLoading(false);
    }
  }, []);

  const login = (data) => {
    const role = data.role;
    const userEmail = data.email;
    const status = (data.subscriptionStatus || data.subscription_status || '').toUpperCase();
    let expiry = data.subscriptionExpiryDate || data.subscription_expiry_date;
    const tz = data.timezone || 'UTC+5:30 (India)';
    
    if (Array.isArray(expiry)) {
      expiry = new Date(expiry[0], expiry[1]-1, expiry[2], expiry[3]||0, expiry[4]||0).toISOString();
    }
    
    setUserRole(role);
    setEmail(userEmail);
    setFirstName(data.firstName || null);
    setLastName(data.lastName || null);
    setSubscriptionStatus(status);
    setSubscriptionExpiryDate(expiry);
    setOrgId(data.orgId || null);
    setOrgName(data.orgName || null);
    setClientId(data.clientId || null);
    setClientName(data.clientName || null);
    setTerminalId(data.terminalId || null);
    setTerminalName(data.terminalName || null);
    setUserId(data.userId || null);
    setCurrency(data.currency || null);
    setCountry(data.country || null);
    setTimezone(tz);
    
    // Explicit boolean casting for permissions
    const pCanCancelOrder = data.canCancelOrder !== undefined ? data.canCancelOrder : true;
    const pCanDeleteOrderItem = data.canDeleteOrderItem !== undefined ? data.canDeleteOrderItem : true;
    const pCanDecrementOrderItem = data.canDecrementOrderItem !== undefined ? data.canDecrementOrderItem : true;

    setCanCancelOrder(pCanCancelOrder);
    setCanDeleteOrderItem(pCanDeleteOrderItem);
    setCanDecrementOrderItem(pCanDecrementOrderItem);
    
    const cookieOptions = getFrontendCookieOptions();
    
    // Store access token and refresh token with storage fallback
    if (data.accessToken) setStorageItem('access_token', data.accessToken, cookieOptions);
    if (data.refreshToken) setStorageItem('refresh_token', data.refreshToken, cookieOptions);
    
    if (role) setStorageItem('userRole', role, cookieOptions);
    if (userEmail) setStorageItem('userEmail', userEmail, cookieOptions);
    if (data.firstName) setStorageItem('firstName', data.firstName, cookieOptions);
    if (data.lastName) setStorageItem('lastName', data.lastName, cookieOptions);
    if (status) setStorageItem('subscriptionStatus', status, cookieOptions);
    if (expiry) {
      const expiryStr = typeof expiry === 'string' ? expiry : JSON.stringify(expiry);
      setStorageItem('subscriptionExpiryDate', expiryStr, cookieOptions);
    }
    if (data.orgId) setStorageItem('orgId', data.orgId, cookieOptions);
    if (data.orgName) setStorageItem('orgName', data.orgName, cookieOptions);
    if (data.clientId) setStorageItem('clientId', data.clientId, cookieOptions);
    if (data.clientName) setStorageItem('clientName', data.clientName, cookieOptions);
    if (data.terminalId) setStorageItem('terminalId', data.terminalId, cookieOptions);
    if (data.terminalName) setStorageItem('terminalName', data.terminalName, cookieOptions);
    if (data.userId) setStorageItem('userId', data.userId, cookieOptions);
    if (data.currency) setStorageItem('currency', data.currency, cookieOptions);
    if (data.country) setStorageItem('country', data.country, cookieOptions);
    setStorageItem('timezone', tz, cookieOptions);
    
    setStorageItem('canCancelOrder', String(pCanCancelOrder), cookieOptions);
    setStorageItem('canDeleteOrderItem', String(pCanDeleteOrderItem), cookieOptions);
    setStorageItem('canDecrementOrderItem', String(pCanDecrementOrderItem), cookieOptions);

    // Fetch assigned menus immediately after login
    fetchAssignedMenus();

    // Async fetch to overwrite timezone with Branch timezone if applicable
    Promise.all([
      api.get('/api/v1/clients/me', { skipAuthRedirect: true }).catch(() => null),
      data.orgId ? api.get(`/api/v1/organizations/${data.orgId}`, { skipAuthRedirect: true }).catch(() => null) : Promise.resolve(null)
    ]).then(([clientRes, orgRes]) => {
      const clientData = clientRes?.data?.success ? (clientRes.data.data || {}) : {};
      const orgData = orgRes?.data?.success ? (orgRes.data.data || {}) : {};
      const resolvedTimezone = orgData.timezone || clientData.timezone;
      if (resolvedTimezone) {
        setTimezone(resolvedTimezone);
        setStorageItem('timezone', resolvedTimezone, cookieOptions);
      }
      if (clientData.posType) {
        setPosType(clientData.posType);
        setStorageItem('posType', clientData.posType, cookieOptions);
      }
    }).catch(() => {});
  };

  const updateSubscription = useCallback((status, expiry, activeModulesList, activeModulesDetailedList) => {
    const normalizedStatus = (status || '').toUpperCase();
    const cookieOptions = getFrontendCookieOptions();

    setSubscriptionStatus(normalizedStatus || null);
    setSubscriptionExpiryDate(expiry || null);
    
    const modules = activeModulesList || [];
    setActiveModules(modules);

    const detailedModules = activeModulesDetailedList || [];
    setActiveModulesDetailed(detailedModules);

    if (normalizedStatus) {
      setStorageItem('subscriptionStatus', normalizedStatus, cookieOptions);
    } else {
      removeStorageItem('subscriptionStatus', { path: '/' });
    }

    if (expiry) {
      const expiryStr = typeof expiry === 'string' ? expiry : JSON.stringify(expiry);
      setStorageItem('subscriptionExpiryDate', expiryStr, cookieOptions);
    } else {
      removeStorageItem('subscriptionExpiryDate', { path: '/' });
    }
    
    if (modules.length > 0) {
      setStorageItem('activeModules', JSON.stringify(modules), cookieOptions);
    } else {
      removeStorageItem('activeModules', { path: '/' });
    }

    if (detailedModules.length > 0) {
      setStorageItem('activeModulesDetailed', JSON.stringify(detailedModules), cookieOptions);
    } else {
      removeStorageItem('activeModulesDetailed', { path: '/' });
    }
  }, []);

  const logout = async () => {
    setUserRole(null);
    setEmail(null);
    setFirstName(null);
    setLastName(null);
    setSubscriptionStatus(null);
    setSubscriptionExpiryDate(null);
    setOrgId(null);
    setOrgName(null);
    setClientId(null);
    setClientName(null);
    setTerminalId(null);
    setTerminalName(null);
    setUserId(null);
    setCurrency(null);
    setCountry(null);
    setTimezone(null);
    setPosType(null);
    setAssignedMenus([]);
    
    const removeOptions = { path: '/' };
    removeStorageItem('access_token', removeOptions);
    removeStorageItem('refresh_token', removeOptions);
    removeStorageItem('userRole', removeOptions);
    removeStorageItem('userEmail', removeOptions);
    removeStorageItem('firstName', removeOptions);
    removeStorageItem('lastName', removeOptions);
    removeStorageItem('subscriptionStatus', removeOptions);
    removeStorageItem('subscriptionExpiryDate', removeOptions);
    removeStorageItem('orgId', removeOptions);
    removeStorageItem('orgName', removeOptions);
    removeStorageItem('clientId', removeOptions);
    removeStorageItem('clientName', removeOptions);
    removeStorageItem('terminalId', removeOptions);
    removeStorageItem('terminalName', removeOptions);
    removeStorageItem('userId', removeOptions);
    removeStorageItem('currency', removeOptions);
    removeStorageItem('country', removeOptions);
    removeStorageItem('timezone', removeOptions);
    removeStorageItem('posType', removeOptions);
    removeStorageItem('canCancelOrder', removeOptions);
    removeStorageItem('canDeleteOrderItem', removeOptions);
    removeStorageItem('canDecrementOrderItem', removeOptions);
    removeStorageItem('activeModulesDetailed', removeOptions);
    
    try {
      await api.post('/api/v1/auth/logout');
    } catch (err) {
      console.error("Logout backend notification failed:", err);
    } finally {
      router.push('/login');
    }
  };

  const getNormalizedDate = (val) => {
    if (!val) return null;
    try {
      if (Array.isArray(val)) {
        return new Date(val[0], val[1]-1, val[2], val[3]||0, val[4]||0);
      }
      let dateStr = String(val);
      if (dateStr.includes(' ') && !dateStr.includes('T')) {
        dateStr = dateStr.replace(' ', 'T');
      }
      const dotIndex = dateStr.indexOf('.');
      if (dotIndex !== -1) {
        const fraction = dateStr.substring(dotIndex + 1);
        if (fraction.length > 3) {
          dateStr = dateStr.substring(0, dotIndex + 4); 
        }
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    } catch (e) {
      return null;
    }
  };

  const normalizedExpiryDate = getNormalizedDate(subscriptionExpiryDate);
  const isAuthenticated = !!email;

  const isActive = (() => {
    if (!isAuthenticated) return false;
    const status = (subscriptionStatus || '').toUpperCase();
    const isTrialOrActive = status === 'TRIAL' || status === 'ACTIVE';
    const isExpired = normalizedExpiryDate && normalizedExpiryDate < new Date();
    return isTrialOrActive && !isExpired;
  })();

  const switchBranch = (newOrgId, newOrgName, newTimezone) => {
    setOrgId(newOrgId || null);
    setOrgName(newOrgName || null);
    setTimezone(newTimezone || null);
    const cookieOptions = getFrontendCookieOptions();
    if (newOrgId) {
      setStorageItem('orgId', newOrgId, cookieOptions);
    } else {
      removeStorageItem('orgId', { path: '/' });
    }
    if (newOrgName) {
      setStorageItem('orgName', newOrgName, cookieOptions);
    } else {
      removeStorageItem('orgName', { path: '/' });
    }
    if (newTimezone) {
      setStorageItem('timezone', newTimezone, cookieOptions);
    } else {
      removeStorageItem('timezone', { path: '/' });
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const hasModule = (moduleName, targetOrgId = null) => {
    if (subscriptionStatus === 'TRIAL' && isActive) {
      return true; // All-Access Free Trial
    }
    return activeModules.includes(moduleName);
  };

  return (
    <AuthContext.Provider value={{ 
      userRole,
      email,
      subscriptionStatus, 
      subscriptionExpiryDate, 
      normalizedExpiryDate,
      login, 
      updateSubscription,
      logout, 
      isAuthenticated, 
      isActive,
      orgId,
      orgName,
      switchBranch,
      clientId,
      clientName,
      terminalId,
      terminalName,
      userId,
      firstName,
      lastName,
      fullName: firstName ? `${firstName} ${lastName || ''}`.trim() : null,
      currency,
      country,
      timezone,
      posType,
      assignedMenus,
      menusLoading,
      fetchAssignedMenus,
      canCancelOrder,
      canDeleteOrderItem,
      canDecrementOrderItem,
      activeModules,
      activeModulesDetailed,
      hasModule,
      loading 
    }}>
      {loading ? (
        <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f97316', fontFamily: 'sans-serif' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid #334155', borderTopColor: '#f97316', borderRadius: '50%' }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>Loading CafeQR...</span>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

