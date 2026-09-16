import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth/core/auth.store';

interface RoleGuardProps {
  allowedRoles: string[];
  fallbackPath?: string;
  children?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  fallbackPath = '/dashboard',
  children,
}) => {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const userRole = user?.role ? String(user.role).toUpperCase() : '';
  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

  // Admin, SuperAdmin, and Org Owner bypass checks
  const hasAccess =
    userRole === 'ADMIN' ||
    userRole === 'SUPER_ADMIN' ||
    userRole === 'MULTI_ADMIN' ||
    userRole === 'OWNER' ||
    normalizedAllowed.includes(userRole);

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RoleGuard;
