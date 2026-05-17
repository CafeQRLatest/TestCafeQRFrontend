import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import api from '../utils/api';

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

    // Auto-fetch timezone and other missing details if authenticated
    if (storedEmail && !storedTimezone) {
      api.get('/api/v1/clients/me', { skipAuthRedirect: true }).then(res => {
        if (res.data.success) {
          const tz = res.data.data.timezone || 'UTC+5:30 (India)';
          setTimezone(tz);
          Cookies.set('timezone', tz, { expires: 7, secure: true, sameSite: 'strict', path: '/' });
        }
      }).catch(err => console.error("Tz fetch error", err));
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
    const cookieOptions = { expires: 7, secure: true, sameSite: 'strict', path: '/' };
    
    // Store access token for cross-domain Authorization header
    // HttpOnly cookies don't work cross-domain (vercel.app -> onrender.com)
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
  };

  const updateSubscription = useCallback((status, expiry) => {
    const normalizedStatus = (status || '').toUpperCase();
    const cookieOptions = { expires: 7, secure: true, sameSite: 'strict', path: '/' };

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

  const logout = async () => {
    // Clear local state immediately for better UX
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
    
    // Clear cookies with explicit path
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
      loading 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
