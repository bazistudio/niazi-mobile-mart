import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '@/lib/auth/usePermissions';
import { useAuthStore } from '@/lib/auth/core/auth.store';

interface PermissionGuardProps {
  requiredPermission?: string;
  requiredPermissions?: string[];
  fallbackPath?: string;
  children?: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  requiredPermission,
  requiredPermissions,
  fallbackPath = '/dashboard',
  children,
}) => {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { hasPermission } = usePermissions();

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  let permitted = true;

  if (requiredPermission) {
    permitted = hasPermission(requiredPermission);
  } else if (requiredPermissions && requiredPermissions.length > 0) {
    permitted = requiredPermissions.every((p) => hasPermission(p));
  }

  if (!permitted) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default PermissionGuard;
