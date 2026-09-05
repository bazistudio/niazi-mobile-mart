import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("tp_token")?.value;

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isProtectedPage = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/sale") || request.nextUrl.pathname === "/sale";

  // 🚫 No token → block protected pages
  if (isProtectedPage && !token) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // 🚫 Logged in → prevent going back to login
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/sale/:path*", "/dashboard", "/sale"],
};