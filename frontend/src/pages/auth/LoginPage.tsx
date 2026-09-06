import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();

  const from = (location.state as any)?.from?.pathname || "/dashboard";

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

  // Check if system requires initial administrator bootstrap
  useEffect(() => {
    async function checkBootstrap() {
      try {
        const needsBootstrap = await tauriClient.authCheckBootstrapStatus();
        if (needsBootstrap) {
          navigate("/auth/bootstrap", { replace: true });
        }
      } catch (err) {
        console.error("Bootstrap check error:", err);
      }
    }
    checkBootstrap();
  }, [navigate]);

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

      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      const code = err.response?.data?.code;
      if (code === "ACCOUNT_PENDING" || msg.includes("pending approval") || msg.includes("pending")) {
        navigate("/auth/pending");
        return;
      }
      if (code === "ACCOUNT_REJECTED" || msg.includes("rejected")) {
        navigate("/auth/rejected");
        return;
      }
      if (code === "ACCOUNT_SUSPENDED" || msg.includes("disabled") || msg.includes("suspended")) {
        navigate("/auth/suspended");
        return;
      }
      setError(
        err.response?.data?.message || err.message || "Login failed. Please verify your credentials."
      );
    } finally {
      setIsLoading(false);
    }
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
                to="/auth/signup"
                className="font-semibold text-[#006970] hover:text-[#005157] hover:underline transition-colors"
              >
                Create one
              </Link>
            </div>
          </form>
        </div>
      ) : (
        <div>
          {/* Forgot Password / Offline Recovery View */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 p-[1px] shadow-[0_8px_16px_-2px_rgba(245,158,11,0.35),0_3px_6px_rgba(0,0,0,0.08)] mb-3">
              <div className="w-full h-full rounded-2xl bg-gradient-to-b from-amber-600 to-amber-700 flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                <KeyRound className="w-6 h-6 text-amber-100 drop-shadow" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account Recovery</h1>
            <p className="text-xs text-slate-500 mt-1">
              Offline-first authentication recovery options
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Staff Guidance */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 text-xs text-slate-600 space-y-2">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <span>Staff & Cashier Accounts</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                Niazi Mobile Mart operates completely offline without external cloud dependencies. If you forgot your password or PIN, your system administrator can generate a temporary login key for you in the Workforce Management panel.
              </p>
            </div>

            {/* Administrator One-Time Key Action */}
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs space-y-2.5">
              <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Administrator Emergency Recovery</span>
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                System administrators can reset their access using the secret one-time recovery key generated during initial setup.
              </p>
              <Link
                to="/auth/recover-admin"
                className="w-full mt-1 relative group overflow-hidden bg-gradient-to-b from-amber-600 to-amber-700 text-white font-medium py-2.5 px-4 rounded-xl text-xs transition-all duration-150 shadow-[0_3px_0_#92400e,0_8px_16px_rgba(245,158,11,0.25)] hover:brightness-105 active:translate-y-1 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Enter One-Time Recovery Key</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Back to Login */}
            <div className="text-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMode("login")}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LoginPage() {
  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-[#f8fafc] text-slate-900 selection:bg-[#006970]/20 selection:text-[#006970]">
      {/* 3D Ambient Mesh Grid */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.035]" 
        style={{
          backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Atmospheric 3D Lighting Orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-gradient-to-br from-[#006970]/25 to-teal-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-gradient-to-tl from-[#00b4bb]/20 to-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-teal-500/5 to-cyan-500/5 blur-2xl" />

      {/* Centered Floating 3D Card Shell */}
      <div className="relative w-full max-w-[390px] z-10 transition-all duration-300">
        {/* Soft 3D Glow Underlay */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-[#006970]/15 via-transparent to-[#00b4bb]/10 blur-xl opacity-75" />

        {/* The 3D Elevated Card Body */}
        <div className="relative rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 p-7 sm:p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_16px_-2px_rgba(0,105,112,0.08),0_20px_40px_-4px_rgba(15,23,42,0.12),0_32px_64px_-8px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5">
          <LoginForm />
        </div>
        
        {/* System footer badge */}
        <div className="mt-5 text-center text-xs text-slate-600 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-medium text-slate-700">Niazi Mobile Mart Desktop Edition</span>
        </div>
      </div>
    </main>
  );
}

export default LoginPage;
