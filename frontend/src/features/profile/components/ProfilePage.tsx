'use client';

import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Shield, 
  Store, 
  Building2, 
  KeyRound, 
  LogOut, 
  Mail, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Lock, 
  RefreshCw,
  BadgeCheck,
  Smartphone
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { usePermissions } from '@/lib/auth/usePermissions';
// settingsApi omitted - PIN management handled via Shop Admin settings
import toast from 'react-hot-toast';

export const ProfilePage: React.FC = () => {
  const user = useAuthStore(state => state.user);
  const logoutAsync = useAuthStore(state => state.logoutAsync);
  const activeShop = useOrganizationStore(state => state.activeShop);
  const activeOrganization = useOrganizationStore(state => state.activeOrganization);
  const { hasPermission, role } = usePermissions();

  const [isResettingPin, setIsResettingPin] = useState(false);
  const [newPinResult, setNewPinResult] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
        <RefreshCw className="w-6 h-6 animate-spin mb-2 text-[#006970]" />
        <p className="text-sm">Loading user profile...</p>
      </div>
    );
  }

  const displayName = user.name || 'Shop Administrator';
  const email = user.email || 'No email provided';
  const userRole = user.role || role || 'STAFF';
  const status = user.status || 'active';
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';

  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

  const handleResetPin = () => {
    toast('Terminal PIN management is configured in Shop Administration settings.', { icon: 'ℹ️' });
  };

  const handleCopyPin = () => {
    if (newPinResult) {
      navigator.clipboard.writeText(newPinResult);
      toast.success('PIN copied to clipboard');
    }
  };

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logoutAsync();
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#006970] via-[#007f87] to-[#008f97] dark:from-[#004d52] dark:to-[#006970] rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-60 h-60 bg-white/10 rounded-full blur-2xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-md text-white font-black text-2xl flex items-center justify-center shadow-inner border border-white/30">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">{displayName}</h1>
                <BadgeCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <p className="text-white/80 text-sm font-medium flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5" /> {email}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-sm border border-white/20 uppercase tracking-wider">
                  {userRole.replace('_', ' ')}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 uppercase tracking-wider">
                  {status}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold rounded-xl border border-white/20 transition-all text-sm disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Account Details & Context */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Identity & Workspace Context */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" /> Account Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-sm">
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <span className="text-xs text-neutral-400 block mb-1">Full Name</span>
                <span className="font-bold text-neutral-900 dark:text-white">{displayName}</span>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <span className="text-xs text-neutral-400 block mb-1">Email Address</span>
                <span className="font-bold text-neutral-900 dark:text-white truncate block">{email}</span>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <span className="text-xs text-neutral-400 block mb-1">Assigned Role</span>
                <span className="font-bold text-[#006970] dark:text-[#00B4BB]">{userRole}</span>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <span className="text-xs text-neutral-400 block mb-1">Member Since</span>
                <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" /> {memberSince}
                </span>
              </div>
            </div>
          </div>

          {/* Shop Context */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <Store className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" /> Shop & Tenant Context
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-sm">
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <span className="text-xs text-neutral-400 block mb-1">Active Shop Context</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {activeShop?.name || user.shopId || 'Default POS Outlet'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <span className="text-xs text-neutral-400 block mb-1">Organization Scope</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {activeOrganization?.name || user.organizationId || 'Niazi Mobile Mart'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Security & PIN */}
        <div className="space-y-6">
          
          {/* Terminal PIN Security Information */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" /> Terminal Security PIN
            </h2>

            <p className="text-xs text-neutral-500 leading-relaxed">
              Your 4-to-6 digit security PIN is used for rapid terminal unlocking on the POS workspace (Ctrl + Shift + L).
            </p>

            <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300 font-semibold">
                <BadgeCheck className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" /> PIN Status: Active & Secured
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Terminal PIN credentials are authenticated against your shop staff profile. To change your PIN, contact your Shop Administrator or update staff permissions in Settings.
              </p>
            </div>
          </div>

          {/* Session Overview */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" /> Active Session
            </h2>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Device Platform</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">Web Browser / POS Shell</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Auth Method</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">JWT Bearer Cookie</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-neutral-500">Security State</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
