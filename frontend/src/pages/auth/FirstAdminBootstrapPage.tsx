import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { tauriClient } from "@/lib/tauri/tauriClient";
import {
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

export function FirstAdminBootstrapPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Success state: display one-time recovery key
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const needsBootstrap = await tauriClient.authCheckBootstrapStatus();
        if (!needsBootstrap) {
          // Administrator already exists! Bootstrap is locked.
          navigate("/auth/login", { replace: true });
        }
      } catch (err) {
        console.error("Failed to check bootstrap status:", err);
      } finally {
        setCheckingStatus(false);
      }
    }
    checkStatus();
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!formData.username.trim()) {
      setError("Username is required.");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await tauriClient.authBootstrapFirstAdmin({
        name: formData.name.trim(),
        username: formData.username.trim(),
        password: formData.password,
      });

      setRecoveryKey(response.recovery_key);
    } catch (err: any) {
      setError(
        err.message ||
          "Failed to bootstrap administrator account. Bootstrap may already be locked."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleProceedToLogin = () => {
    if (!acknowledged) return;
    navigate("/auth/login", { replace: true });
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#006970] border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium animate-pulse">
            Verifying system initialization state...
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-[#f8fafc] text-slate-900 selection:bg-[#006970]/20 selection:text-[#006970]">
      {/* 3D Ambient Mesh Grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Atmospheric Lighting Orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-gradient-to-br from-[#006970]/25 to-teal-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-gradient-to-tl from-[#00b4bb]/20 to-emerald-400/10 blur-3xl" />

      <div className="relative w-full max-w-[440px] z-10 transition-all duration-300">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-[#006970]/15 via-transparent to-[#00b4bb]/10 blur-xl opacity-75" />

        <div className="relative rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 p-7 sm:p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_16px_-2px_rgba(0,105,112,0.08),0_20px_40px_-4px_rgba(15,23,42,0.12),0_32px_64px_-8px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,1)]">
          {!recoveryKey ? (
            /* First-Run Setup Form */
            <div>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#006970] to-[#00b4bb] p-[1px] shadow-[0_8px_16px_-2px_rgba(0,105,112,0.35),0_3px_6px_rgba(0,0,0,0.08)] mb-3">
                  <div className="w-full h-full rounded-[15px] bg-gradient-to-b from-[#006970] to-[#005157] flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-white stroke-[2.2]" />
                  </div>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Initial Setup
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Create the Niazi Mobile Mart Administrator account
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200/80 flex items-start gap-2.5 text-xs text-red-700">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Administrator Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g. Muhammad Niazi"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#006970] focus:ring-1 focus:ring-[#006970] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                      @
                    </span>
                    <input
                      type="text"
                      name="username"
                      required
                      value={formData.username}
                      onChange={handleChange}
                      placeholder="admin"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#006970] focus:ring-1 focus:ring-[#006970] transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Administrator Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#006970] focus:ring-1 focus:ring-[#006970] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="confirmPassword"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#006970] focus:ring-1 focus:ring-[#006970] transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full relative group overflow-hidden bg-gradient-to-b from-[#006970] to-[#005157] text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#003d42,0_10px_20px_rgba(0,105,112,0.25)] hover:brightness-105 active:translate-y-1 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Initialize System Administrator</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Post-Bootstrap Recovery Key Display */
            <div>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mb-3">
                  <KeyRound className="w-6 h-6 stroke-[2.2]" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Save Your One-Time Recovery Key
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Niazi Mobile Mart is offline-first. This key is your only recovery mechanism.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/90 mb-4 text-xs text-amber-800 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>CRITICAL SECURITY NOTICE</span>
                </div>
                <p>
                  This recovery key is generated once and is <strong>never displayed again</strong>. It is hashed using Argon2id and cannot be recovered from the database.
                </p>
              </div>

              <div className="relative mb-5 p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="font-mono text-sm font-bold text-teal-300 tracking-wider select-all">
                  {recoveryKey}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer mb-5 select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#006970] focus:ring-[#006970]"
                />
                <span>
                  I have securely saved this recovery key in an offline vault (or printed it). I understand that if I lose my password and this key, administrator access cannot be restored.
                </span>
              </label>

              <button
                type="button"
                disabled={!acknowledged}
                onClick={handleProceedToLogin}
                className="w-full relative group overflow-hidden bg-gradient-to-b from-emerald-600 to-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#065f46,0_10px_20px_rgba(16,185,129,0.3)] hover:brightness-105 active:translate-y-1 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Complete Setup & Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 text-center text-xs text-slate-600 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-medium text-slate-700">
            Niazi Mobile Mart Desktop Edition
          </span>
        </div>
      </div>
    </main>
  );
}

export default FirstAdminBootstrapPage;
