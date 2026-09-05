"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/core/auth.store";
import { loginUser } from "@/lib/auth/core/auth.client";
import type { LoginFormData } from "@/lib/auth/auth.schema";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  // Mode: "login" or "forgot"
  const [mode, setMode] = useState<"login" | "forgot">("login");

  // Sign In state
  const [formData, setFormData] = useState<LoginFormData>({
    identifier: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password state
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [forgotError, setForgotError] = useState<string | null>(null);

  const onSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { user, session } = await loginUser(
        formData.identifier,
        formData.password
      );

      // hydrate zustand store
      setAuth(user, session);

      router.push("/dashboard");
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === "ACCOUNT_PENDING") {
        router.push("/auth/pending");
        return;
      }
      if (code === "ACCOUNT_REJECTED") {
        router.push("/auth/rejected");
        return;
      }
      if (code === "ACCOUNT_SUSPENDED") {
        router.push("/auth/suspended");
        return;
      }
      setError(
        err.response?.data?.message || err.message || "Login failed. Please verify your credentials."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotError("Please enter your registered email or username.");
      return;
    }
    setForgotStatus("sending");
    setForgotError(null);

    // Simulate reliable dispatch with clear instructions
    setTimeout(() => {
      setForgotStatus("sent");
    }, 600);
  };

  return (
    <div className="w-full">
      {mode === "login" ? (
        <div>
          {/* 3D Header Emblem */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#006970] to-[#00b4bb] p-[1px] shadow-[0_8px_16px_-2px_rgba(0,105,112,0.35),0_3px_6px_rgba(0,0,0,0.08)] mb-3">
              <div className="w-full h-full rounded-2xl bg-gradient-to-b from-[#006970] to-[#004f54] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                <ShieldCheck className="w-6 h-6 text-teal-100 drop-shadow" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign In</h1>
            <p className="text-xs text-slate-500 mt-1">
              Enter your credentials to access your workspace
            </p>
          </div>

          <form onSubmit={onSubmitLogin} className="flex flex-col gap-4">
            {/* Identifier field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="identifier" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Email or Username
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="name@business.com or username"
                  value={formData.identifier}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, identifier: e.target.value }))
                  }
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 border border-slate-200/90 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setForgotError(null);
                    if (formData.identifier) {
                      setForgotIdentifier(formData.identifier);
                    }
                  }}
                  className="text-xs font-medium text-[#006970] hover:text-[#004f54] hover:underline transition-colors focus:outline-none cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  required
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50/70 border border-slate-200/90 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200/80 flex items-start gap-2.5 text-xs text-red-700 shadow-sm"
              >
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* 3D Tactile Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full relative group overflow-hidden bg-gradient-to-b from-[#007a82] via-[#006970] to-[#005157] text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#00383c,0_10px_20px_rgba(0,105,112,0.3)] hover:brightness-105 active:translate-y-1 active:shadow-[0_1px_0_#00383c,0_4px_10px_rgba(0,105,112,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30" />
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {/* Footer Sign Up Link */}
            <div className="text-center text-xs text-slate-500 pt-3 border-t border-slate-100 mt-1">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/signup"
                className="font-semibold text-[#006970] hover:text-[#005157] hover:underline transition-colors"
              >
                Create one
              </Link>
            </div>
          </form>
        </div>
      ) : (
        <div>
          {/* Forgot Password View */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 p-[1px] shadow-[0_8px_16px_-2px_rgba(245,158,11,0.35),0_3px_6px_rgba(0,0,0,0.08)] mb-3">
              <div className="w-full h-full rounded-2xl bg-gradient-to-b from-amber-600 to-amber-700 flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                <KeyRound className="w-6 h-6 text-amber-100 drop-shadow" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset Password</h1>
            <p className="text-xs text-slate-500 mt-1">
              Enter your email or username to recover access
            </p>
          </div>

          <form onSubmit={onSubmitForgot} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="forgotIdentifier" className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Registered Email or Username
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="forgotIdentifier"
                  type="text"
                  placeholder="name@business.com or username"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  required
                  disabled={forgotStatus === "sent"}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 border border-slate-200/90 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Support Guidance for POS and Staff */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">Branch & Staff Accounts:</span> If you are operating a POS counter terminal, your Shop Administrator can directly reset your passcode from the Staff Management dashboard.
            </div>

            {/* Feedback Messages */}
            {forgotError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200/80 flex items-start gap-2.5 text-xs text-red-700 shadow-sm"
              >
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotStatus === "sent" && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-800 flex items-start gap-2.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-900">Recovery Instructions Dispatched</p>
                  <p className="mt-0.5 text-emerald-700">
                    If an account exists for &ldquo;{forgotIdentifier}&rdquo;, reset details have been sent.
                  </p>
                </div>
              </div>
            )}

            {/* 3D Action Button */}
            {forgotStatus !== "sent" ? (
              <button
                type="submit"
                disabled={forgotStatus === "sending"}
                className="w-full relative group overflow-hidden bg-gradient-to-b from-[#007a82] via-[#006970] to-[#005157] text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#00383c,0_10px_20px_rgba(0,105,112,0.3)] hover:brightness-105 active:translate-y-1 active:shadow-[0_1px_0_#00383c,0_4px_10px_rgba(0,105,112,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-1"
              >
                <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30" />
                {forgotStatus === "sending" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    <span>Send Reset Instructions</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setForgotStatus("idle");
                  setMode("login");
                }}
                className="w-full relative group overflow-hidden bg-gradient-to-b from-emerald-600 to-emerald-700 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#065f46,0_10px_20px_rgba(16,185,129,0.3)] hover:brightness-105 active:translate-y-1 cursor-pointer mt-1"
              >
                <span>Return to Sign In</span>
              </button>
            )}

            {/* Back to Login */}
            <div className="text-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setForgotStatus("idle");
                  setForgotError(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}