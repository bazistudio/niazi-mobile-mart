import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { tauriClient } from "@/lib/tauri/tauriClient";
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export function AdminRecoveryPage() {
  const navigate = useNavigate();

  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanKey = recoveryKey.trim();
    if (!cleanKey) {
      setError("Please enter your one-time administrator recovery key.");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await tauriClient.adminRecoverAccess(cleanKey, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(
        err.message ||
          "Recovery failed. Ensure the key is correct and has not already been used."
      );
    } finally {
      setLoading(false);
    }
  };

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

      <div className="relative w-full max-w-[420px] z-10 transition-all duration-300">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-[#006970]/15 via-transparent to-[#00b4bb]/10 blur-xl opacity-75" />

        <div className="relative rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 p-7 sm:p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_16px_-2px_rgba(0,105,112,0.08),0_20px_40px_-4px_rgba(15,23,42,0.12),0_32px_64px_-8px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,1)]">
          {success ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Password Successfully Reset
              </h2>
              <p className="text-xs text-slate-600 mt-2 mb-6 leading-relaxed">
                Your administrator account has been restored. The one-time recovery key has been consumed and permanently deactivated.
              </p>
              <button
                type="button"
                onClick={() => navigate("/auth/login", { replace: true })}
                className="w-full relative group overflow-hidden bg-gradient-to-b from-[#006970] to-[#005157] text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#003d42,0_10px_20px_rgba(0,105,112,0.25)] hover:brightness-105 active:translate-y-1 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            <div>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mb-3">
                  <KeyRound className="w-6 h-6 stroke-[2.2]" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Administrator Recovery
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Offline password recovery using your one-time recovery key
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
                    One-Time Recovery Key
                  </label>
                  <input
                    type="text"
                    required
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                    placeholder="NZRCV-XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#006970] focus:ring-1 focus:ring-[#006970] transition-all font-mono tracking-wider"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter the key provided during first-time setup
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    New Administrator Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
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
                        <span>Reset Password & Invalidate Key</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center pt-3 border-t border-slate-100">
                  <Link
                    to="/auth/login"
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Sign In</span>
                  </Link>
                </div>
              </form>
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

export default AdminRecoveryPage;
