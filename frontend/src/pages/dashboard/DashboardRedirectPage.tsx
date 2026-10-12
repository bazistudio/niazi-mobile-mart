import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth/core/auth.store";
import { useOrganizationStore } from "@/store/useOrganizationStore";

// Allowed branch-dashboard path prefixes for default-page validation.
// The configured default must start with one of these to be accepted;
// anything else falls back to /dashboard/shop-admin to prevent open redirects
// or unauthorized cross-dashboard navigation.
const BRANCH_DASHBOARD_PREFIX = "/dashboard/shop-admin";

export function DashboardRedirectPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const branchDefaultPages = useOrganizationStore((s) => s.branchDefaultPages);

  useEffect(() => {
    // Wait for AuthHydrator to finish — prevents flash redirect to login
    if (!isHydrated) return;

    if (!user) {
      navigate("/auth/login", { replace: true });
      return;
    }

    switch (user.role) {
      case "SUPER_ADMIN":
      case "MULTI_ADMIN":
      case "OWNER":
      case "ADMIN":
        if ((user as any).accountType === "ORGANIZATION" || !(user as any).shopId) {
          navigate("/dashboard/organization", { replace: true });
        } else {
          navigate("/dashboard/shop-admin", { replace: true });
        }
        break;
      case "SHOP_ADMIN":
      case "MANAGER":
      case "CASHIER":
      case "STAFF":
      default: {
        // Look up the branch-specific default landing page, if one is configured.
        // branchDefaultPages is navigation convenience only — access control is
        // enforced by PermissionGuard at the route level, not here.
        const shopId = (user as any).shopId as string | undefined;
        const configured = shopId ? branchDefaultPages[shopId] : undefined;

        // Validate: the configured path must stay within the branch dashboard.
        // This prevents a misconfigured or stale value from routing outside the
        // branch context or to an org-admin-only area.
        const safePath =
          configured && configured.startsWith(BRANCH_DASHBOARD_PREFIX)
            ? configured
            : BRANCH_DASHBOARD_PREFIX;

        navigate(safePath, { replace: true });
        break;
      }
    }
  }, [navigate, user, isHydrated, branchDefaultPages]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-gray-500 text-sm animate-pulse">
        Directing to your workspace...
      </p>
    </div>
  );
}

export default DashboardRedirectPage;
