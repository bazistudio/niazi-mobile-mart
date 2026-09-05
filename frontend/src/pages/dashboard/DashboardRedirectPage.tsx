import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth/core/auth.store";

export function DashboardRedirectPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

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
        if ((user as any).accountType === "ORGANIZATION" || !(user as any).shopId) {
          navigate("/dashboard/organization", { replace: true });
        } else {
          navigate("/dashboard/shop-admin", { replace: true });
        }
        break;
      case "SHOP_ADMIN":
      case "ADMIN":
      case "MANAGER":
      case "CASHIER":
      case "STAFF":
      default:
        navigate("/dashboard/shop-admin", { replace: true });
        break;
    }
  }, [navigate, user, isHydrated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-gray-500 text-sm animate-pulse">
        Directing to your workspace...
      </p>
    </div>
  );
}

export default DashboardRedirectPage;
