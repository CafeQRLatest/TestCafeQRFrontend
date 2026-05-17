import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

/**
 * RoleGate Component
 * 
 * Protects children components/pages based on allowed roles.
 * Usage: <RoleGate allowedRoles={['ADMIN', 'MANAGER']}> ... </RoleGate>
 */
export default function RoleGate({ children, allowedRoles }) {
  const { userRole, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (allowedRoles && !allowedRoles.includes(userRole)) {
        router.push('/owner/main-menu');
      }
    }
  }, [loading, isAuthenticated, userRole, allowedRoles, router]);

  if (loading) {
    return (
      <div className="gate-loading">
        <style jsx>{`
          .gate-loading {
            min-height: 100dvh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f1f5f9;
            font-family: 'Plus Jakarta Sans', sans-serif;
            color: #64748b;
          }
        `}</style>
        <p>Verifying permissions...</p>
      </div>
    );
  }

  if (!isAuthenticated || (allowedRoles && !allowedRoles.includes(userRole))) {
    return null; // Don't show anything while redirecting
  }

  return children;
}
