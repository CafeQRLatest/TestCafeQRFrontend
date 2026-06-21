import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

/**
 * RoleGate Component
 * 
 * Protects children components/pages based on:
 * 1. Static role checks (allowedRoles) — basic role-type gating
 * 2. Dynamic menu permission checks (requiredMenu) — checks if the user's
 *    assigned menus (set by Super Admin via Roles) include the required menu.
 * 
 * Usage:
 *   <RoleGate allowedRoles={['ADMIN', 'MANAGER']} requiredMenu="Product Management">
 *     ...
 *   </RoleGate>
 * 
 * SUPER_ADMIN always bypasses the dynamic menu check to prevent lockouts.
 */
export default function RoleGate({ children, allowedRoles, requiredMenu }) {
  const { userRole, isAuthenticated, loading, assignedMenus, menusLoading } = useAuth();
  const router = useRouter();

  // Normalize role for comparison (handle both "SUPER_ADMIN" and "ROLE_SUPER_ADMIN")
  const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';

  // Check if the user has the required menu assigned to their role
  const hasMenuAccess = (() => {
    // No menu requirement specified — pass through
    if (!requiredMenu) return true;
    // Super Admins always have access (they configure the menus, so they must not be locked out)
    if (isSuperAdmin) return true;
    // If menus haven't loaded yet, we wait (handled by the loading guard below)
    if (menusLoading) return true;
    // Check if any assigned parent menu matches the required menu name
    return assignedMenus.some(m => {
      // Match by menu name (case-insensitive for robustness)
      const menuName = (m.name || '').toLowerCase();
      const required = requiredMenu.toLowerCase();
      return menuName === required;
    });
  })();

  const isWaiting = loading || (requiredMenu && menusLoading && !isSuperAdmin);

  useEffect(() => {
    if (!isWaiting) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (allowedRoles && !allowedRoles.includes(userRole)) {
        // Static role check failed
        router.push('/owner/main-menu');
      } else if (!hasMenuAccess) {
        // Dynamic menu permission check failed
        console.warn(`[RoleGate] Access denied: user role "${userRole}" does not have menu "${requiredMenu}" assigned.`);
        router.push('/owner/main-menu');
      }
    }
  }, [isWaiting, isAuthenticated, userRole, allowedRoles, hasMenuAccess, requiredMenu, router]);

  if (isWaiting) {
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

  if (!isAuthenticated || (allowedRoles && !allowedRoles.includes(userRole)) || !hasMenuAccess) {
    return null; // Don't show anything while redirecting
  }

  return children;
}
