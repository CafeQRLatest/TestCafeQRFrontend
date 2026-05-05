import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

const EXEMPT_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/subscription'
]);

const isExemptRoute = (pathname) => {
  if (!pathname) return false;
  if (EXEMPT_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/menu/')) return true;
  if (pathname === '/menu/[clientId]/[orgId]/[tableId]') return true;
  return false;
};

const SubscriptionGate = ({ children }) => {
  const { isAuthenticated, isActive, loading } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const exempt = isExemptRoute(router.pathname);
  const shouldBlock = isReady && isAuthenticated && !isActive && !exempt;

  useEffect(() => {
    // Small delay to allow AuthContext state to stabilize
    if (!loading) {
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    if (shouldBlock) {
      console.log('SubscriptionGate: Redirecting to /subscription because isActive is false');
      router.replace('/subscription');
    }
  }, [router, shouldBlock]);

  if (loading || (!isReady && isAuthenticated) || shouldBlock) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div className="spinner"></div>
        <style jsx>{`
          .spinner {
            width: 40px; height: 40px;
            border: 4px solid #e2e8f0;
            border-top: 4px solid #f97316;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
};

export default SubscriptionGate;
