"use client";

// /components/auth/AuthHydrator.tsx
//
// Runs once on app boot (client-side) and delegates startup session
// hydration to AuthService.hydrate().

import { useEffect } from "react";
import { AuthService } from "@/lib/auth/core/auth.service";

export default function AuthHydrator() {
  useEffect(() => {
    AuthService.hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
