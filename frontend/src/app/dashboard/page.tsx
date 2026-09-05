'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/core/auth.store";

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    // Wait for AuthHydrator to finish — prevents flash redirect to login
    if (!isHydrated) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    switch (user.role) {
      case "SUPER_ADMIN":
      case "MULTI_ADMIN":
      case "OWNER":
        if ((user as any).accountType === "ORGANIZATION" || !(user as any).shopId) {
          router.replace("/dashboard/organization");
        } else {
          router.replace("/dashboard/shop-admin");
        }
        break;
      case "SHOP_ADMIN":
      case "ADMIN":
      case "MANAGER":
      case "CASHIER":
      case "STAFF":
      default:
        router.replace("/dashboard/shop-admin");
        break;
    }
  }, [router, user, isHydrated]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm animate-pulse">
        DashboardPage is redirecting... (role: {user?.role})
      </p>
    </div>
  );
}