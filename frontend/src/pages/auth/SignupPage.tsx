import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "@/lib/api/axios";
import {
  Building2,
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Layers,
  Briefcase,
  ChevronDown,
} from "lucide-react";

export function SignupPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    mobile: "",
    password: "",
    accountType: "SINGLE_SHOP",
    businessType: "RETAIL",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await axios.post("/api/v1/auth/signup", {
        ownerName: formData.ownerName,
        email: formData.email,
        mobile: formData.mobile,
        password: formData.password,
        businessName: formData.businessName,
        accountType: formData.accountType,
        businessType: formData.businessType,
      });

      setIsSuccess(true);
      setMessage({
        type: "success",
        text: "Your registration request has been submitted successfully.\n\nYour account is currently pending Super Admin review. You will be able to sign in as soon as it is approved.",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.response?.data?.message || "Signup failed. Please check your information and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="h-screen w-screen overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative flex items-center justify-center p-3 sm:p-4 bg-[#f8fafc] text-slate-900 selection:bg-[#006970]/20 selection:text-[#006970]">
      {/* 3D Ambient Mesh Grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Atmospheric 3D Lighting Orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-gradient-to-br from-[#006970]/25 to-teal-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-gradient-to-tl from-[#00b4bb]/20 to-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-teal-500/5 to-cyan-500/5 blur-2xl" />

      {/* Centered Floating 3D Card Shell */}
      <div className="relative w-full max-w-lg z-10 transition-all duration-300 my-auto">
        {/* Soft 3D Glow Underlay */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-[#006970]/15 via-transparent to-[#00b4bb]/10 blur-xl opacity-75" />

        {/* The 3D Elevated Card Body */}
        <div className="relative rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_16px_-2px_rgba(0,105,112,0.08),0_20px_40px_-4px_rgba(15,23,42,0.12),0_32px_64px_-8px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5">
          {/* 3D Header Emblem */}
          <div className="text-center mb-3.5">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#006970] to-[#00b4bb] p-[1px] shadow-[0_8px_16px_-2px_rgba(0,105,112,0.35),0_3px_6px_rgba(0,0,0,0.08)] mb-2">
              <div className="w-full h-full rounded-2xl bg-gradient-to-b from-[#006970] to-[#004f54] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                <Building2 className="w-5 h-5 text-teal-100 drop-shadow" />
              </div>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Business Registration
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Start managing your enterprise workspace with TijaratPro
            </p>
          </div>

          {/* Feedback Messages */}
          {message && (
            <div
              role="alert"
              className={`mb-3.5 p-3 rounded-xl text-xs flex items-start gap-2.5 shadow-sm whitespace-pre-wrap leading-relaxed ${
                message.type === "success"
                  ? "bg-emerald-50 border border-emerald-200/90 text-emerald-900"
                  : "bg-red-50 border border-red-200/90 text-red-700"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {isSuccess ? (
            <div className="mt-3 flex flex-col gap-3 text-center">
              <button
                type="button"
                onClick={() => navigate("/auth/login")}
                className="w-full relative group overflow-hidden bg-gradient-to-b from-[#007a82] via-[#006970] to-[#005157] text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all duration-150 shadow-[0_4px_0_#00383c,0_10px_20px_rgba(0,105,112,0.3)] hover:brightness-105 active:translate-y-1 active:shadow-[0_1px_0_#00383c,0_4px_10px_rgba(0,105,112,0.2)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30" />
                <span>Return to Sign In</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
              {/* Row 1: Business Name & Owner Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="businessName"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Business Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <input
                      id="businessName"
                      name="businessName"
                      type="text"
                      required
                      value={formData.businessName}
                      onChange={handleChange}
                      placeholder="Al Aziz Mobile Parts"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="ownerName"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Owner Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      id="ownerName"
                      name="ownerName"
                      type="text"
                      required
                      value={formData.ownerName}
                      onChange={handleChange}
                      placeholder="Bilal Ahmed"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Email & Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="email"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="mobile"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Mobile Number
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <input
                      id="mobile"
                      name="mobile"
                      type="tel"
                      required
                      value={formData.mobile}
                      onChange={handleChange}
                      placeholder="+92 312 3456789"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Account Type & Business Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="accountType"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Account Type
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <select
                      id="accountType"
                      name="accountType"
                      value={formData.accountType}
                      onChange={handleChange}
                      className="w-full pl-9 pr-8 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200 appearance-none cursor-pointer"
                    >
                      <option value="SINGLE_SHOP">Single Shop</option>
                      <option value="ORGANIZATION">Organization (Multi-Shop)</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="businessType"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Business Category
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                      <Briefcase className="w-3.5 h-3.5" />
                    </div>
                    <select
                      id="businessType"
                      name="businessType"
                      value={formData.businessType}
                      onChange={handleChange}
                      className="w-full pl-9 pr-8 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200 appearance-none cursor-pointer"
                    >
                      <option value="RETAIL">Retail</option>
                      <option value="MEDICAL">Medical</option>
                      <option value="AUTO">Auto Workshop</option>
                      <option value="WHOLESALE">Wholesale</option>
                      <option value="RESTAURANT">Restaurant</option>
                      <option value="SALON">Salon</option>
                      <option value="MANUFACTURING">Manufacturing</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 4: Password Field */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="password"
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                >
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#006970] transition-colors">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2 bg-slate-50/70 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)] focus:bg-white focus:outline-none focus:border-[#006970] focus:ring-4 focus:ring-[#006970]/10 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* 3D Tactile Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative group overflow-hidden bg-gradient-to-b from-[#007a82] via-[#006970] to-[#005157] text-white font-medium py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-all duration-150 shadow-[0_4px_0_#00383c,0_10px_20px_rgba(0,105,112,0.3)] hover:brightness-105 active:translate-y-1 active:shadow-[0_1px_0_#00383c,0_4px_10px_rgba(0,105,112,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-1"
              >
                <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30" />
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Registration…</span>
                  </>
                ) : (
                  <>
                    <span>Submit Registration</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Back to Sign In Link */}
          <div className="text-center text-[11px] text-slate-500 pt-2.5 border-t border-slate-100 mt-3">
            Already registered?{" "}
            <Link
              to="/auth/login"
              className="font-semibold text-[#006970] hover:text-[#005157] hover:underline transition-colors"
            >
              Sign in to your account
            </Link>
          </div>
        </div>

        {/* System footer badge */}
        <div className="mt-3 text-center text-[11px] text-slate-600 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-medium text-slate-700">TijaratPro Enterprise Edition</span>
        </div>
      </div>
    </main>
  );
}

export default SignupPage;
