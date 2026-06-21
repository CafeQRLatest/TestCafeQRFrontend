import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import api from '../utils/api';
import { getFrontendCookieOptions } from '../utils/cookieOptions';

const AuthContext = createContext();

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
  const [loading, setLoading] = useState(true);
  const [assignedMenus, setAssignedMenus] = useState([]);
  const [menusLoading, setMenusLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check for session metadata in cookies 
    const storedRole = Cookies.get('userRole');
    const storedEmail = Cookies.get('userEmail');
    const storedFirstName = Cookies.get('firstName');
    const storedLastName = Cookies.get('lastName');
    const storedStatus = (Cookies.get('subscriptionStatus') || '').toUpperCase();
    const storedExpiry = Cookies.get('subscriptionExpiryDate');
    const storedOrgId = Cookies.get('orgId');
    const storedOrgName = Cookies.get('orgName');
    const storedClientId = Cookies.get('clientId');
    const storedClientName = Cookies.get('clientName');
    const storedTerminalId = Cookies.get('terminalId');
    const storedTerminalName = Cookies.get('terminalName');
    const storedUserId = Cookies.get('userId');
    const storedCurrency = Cookies.get('currency');
    const storedCountry = Cookies.get('country');
    const storedTimezone = Cookies.get('timezone');
    
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
      api.get('/api/v1/clients/me', { skipAuthRedirect: true }).then(res => {
        if (res.data.success) {
          const clientData = res.data.data || {};
          
          if (clientData.timezone) {
            setTimezone(clientData.timezone);
            Cookies.set('timezone', clientData.timezone, getFrontendCookieOptions());
          }
          if (clientData.currency) {
            setCurrency(clientData.currency);
            Cookies.set('currency', clientData.currency, getFrontendCookieOptions());
          }
          if (clientData.country) {
            setCountry(clientData.country);
            Cookies.set('country', clientData.country, getFrontendCookieOptions());
          }
        }
      }).catch(err => console.error("Client profile sync error", err));

      api.get('/api/v1/subscription/status', { skipAuthRedirect: true }).then(res => {
        if (res.data?.success) {
          const subData = res.data.data || {};
          updateSubscription(subData.status, subData.expiryDate);
        }
      }).catch(err => console.error("Subscription sync error", err));

      // Fetch assigned menus for the logged-in user (for dynamic route protection)
      fetchAssignedMenus();
    } else {
      setMenusLoading(false);
    }
    
    setLoading(false);
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
    
    // Metadata cookies (Non-HttpOnly) for frontend logic
    const cookieOptions = getFrontendCookieOptions();
    
    // Store access token for cross-domain Authorization header
    if (data.accessToken) Cookies.set('access_token', data.accessToken, cookieOptions);
    if (data.refreshToken) Cookies.set('refresh_token', data.refreshToken, cookieOptions);
    
    if (role) Cookies.set('userRole', role, cookieOptions);
    if (userEmail) Cookies.set('userEmail', userEmail, cookieOptions);
    if (data.firstName) Cookies.set('firstName', data.firstName, cookieOptions);
    if (data.lastName) Cookies.set('lastName', data.lastName, cookieOptions);
    if (status) Cookies.set('subscriptionStatus', status, cookieOptions);
    if (expiry) {
      const expiryStr = typeof expiry === 'string' ? expiry : JSON.stringify(expiry);
      Cookies.set('subscriptionExpiryDate', expiryStr, cookieOptions);
    }
    if (data.orgId) Cookies.set('orgId', data.orgId, cookieOptions);
    if (data.orgName) Cookies.set('orgName', data.orgName, cookieOptions);
    if (data.clientId) Cookies.set('clientId', data.clientId, cookieOptions);
    if (data.clientName) Cookies.set('clientName', data.clientName, cookieOptions);
    if (data.terminalId) Cookies.set('terminalId', data.terminalId, cookieOptions);
    if (data.terminalName) Cookies.set('terminalName', data.terminalName, cookieOptions);
    if (data.userId) Cookies.set('userId', data.userId, cookieOptions);
    if (data.currency) Cookies.set('currency', data.currency, cookieOptions);
    if (data.country) Cookies.set('country', data.country, cookieOptions);
    Cookies.set('timezone', tz, cookieOptions);

    // Fetch assigned menus immediately after login
    fetchAssignedMenus();
  };

  const updateSubscription = useCallback((status, expiry) => {
    const normalizedStatus = (status || '').toUpperCase();
    const cookieOptions = getFrontendCookieOptions();

    setSubscriptionStatus(normalizedStatus || null);
    setSubscriptionExpiryDate(expiry || null);

    if (normalizedStatus) {
      Cookies.set('subscriptionStatus', normalizedStatus, cookieOptions);
    } else {
      Cookies.remove('subscriptionStatus', { path: '/' });
    }

    if (expiry) {
      const expiryStr = typeof expiry === 'string' ? expiry : JSON.stringify(expiry);
      Cookies.set('subscriptionExpiryDate', expiryStr, cookieOptions);
    } else {
      Cookies.remove('subscriptionExpiryDate', { path: '/' });
    }
  }, []);

  const fetchAssignedMenus = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setMenusLoading(false);
      return;
    }
    try {
      setMenusLoading(true);
      const resp = await api.get('/api/v1/users/menus');
      if (resp.data.success) {
        setAssignedMenus(resp.data.data || []);
      }
    } catch (err) {
      if (err?.message !== 'Network Error') {
        console.error("Failed to fetch assigned menus:", err);
      }
    } finally {
      setMenusLoading(false);
    }
  };

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
    setAssignedMenus([]);
    
    const removeOptions = { path: '/' };
    Cookies.remove('access_token', removeOptions);
    Cookies.remove('refresh_token', removeOptions);
    Cookies.remove('userRole', removeOptions);
    Cookies.remove('userEmail', removeOptions);
    Cookies.remove('firstName', removeOptions);
    Cookies.remove('lastName', removeOptions);
    Cookies.remove('subscriptionStatus', removeOptions);
    Cookies.remove('subscriptionExpiryDate', removeOptions);
    Cookies.remove('orgId', removeOptions);
    Cookies.remove('orgName', removeOptions);
    Cookies.remove('clientId', removeOptions);
    Cookies.remove('clientName', removeOptions);
    Cookies.remove('terminalId', removeOptions);
    Cookies.remove('terminalName', removeOptions);
    Cookies.remove('userId', removeOptions);
    Cookies.remove('currency', removeOptions);
    Cookies.remove('country', removeOptions);
    Cookies.remove('timezone', removeOptions);
    
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

  const switchBranch = (newOrgId, newOrgName) => {
    setOrgId(newOrgId || null);
    setOrgName(newOrgName || null);
    const cookieOptions = getFrontendCookieOptions();
    if (newOrgId) {
      Cookies.set('orgId', newOrgId, cookieOptions);
    } else {
      Cookies.remove('orgId', { path: '/' });
    }
    if (newOrgName) {
      Cookies.set('orgName', newOrgName, cookieOptions);
    } else {
      Cookies.remove('orgName', { path: '/' });
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
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
      assignedMenus,
      menusLoading,
      fetchAssignedMenus,
      loading 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
