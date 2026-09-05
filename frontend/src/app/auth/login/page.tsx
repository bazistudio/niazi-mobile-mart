import LoginForm from "./form"

export const metadata = {
  title: "Sign In — TijaratPro",
  description: "Sign in to your TijaratPro account",
};

export default function LoginPage() {
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

      {/* Centered Floating 3D Card Shell (Strictly maintaining max-w-sm size) */}
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
          <span className="font-medium text-slate-700">TijaratPro Enterprise Edition</span>
        </div>
      </div>
    </main>
  );
}