import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Globe, 
  FileText, 
  Sliders, 
  ShieldCheck,
  Save
} from 'lucide-react';

export function OrganizationProfilePage() {
  const { user } = useAuthStore();

  return (
    <OrganizationPageShell
      title="Organization Profile"
      description="Manage legal entity details, business identity, and primary organization contacts."
      badge="Enterprise Profile"
      action={
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium cursor-not-allowed shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Profile</span>
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Organization Summary Card */}
        <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-2xl mb-4 border border-primary/20 shadow-sm">
            N
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Niazi Mobile Mart
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Enterprise Code: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">MAIN</span>
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Organization</span>
          </div>

          <div className="w-full mt-6 pt-6 border-t border-gray-100 dark:border-gray-700/60 space-y-3 text-left text-xs">
            <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
              <span className="text-gray-400">Owner</span>
              <span className="font-medium">{user?.name || 'Administrator'}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
              <span className="text-gray-400">Account Role</span>
              <span className="font-medium">{user?.role || 'OWNER'}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
              <span className="text-gray-400">Base Currency</span>
              <span className="font-medium">PKR (₨)</span>
            </div>
          </div>
        </div>

        {/* Right Columns: Detail Sections */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section: Organization Information */}
          <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Organization Information
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1">Organization Name</label>
                <input
                  type="text"
                  defaultValue="Niazi Mobile Mart"
                  disabled
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1">Trading Code</label>
                <input
                  type="text"
                  defaultValue="MAIN"
                  disabled
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1">National Tax Number (NTN)</label>
                <input
                  type="text"
                  placeholder="e.g. 1234567-8"
                  disabled
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1">Sales Tax Reg. (STRN)</label>
                <input
                  type="text"
                  placeholder="e.g. 03-00-1234-567"
                  disabled
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section: Contact & Physical Location */}
          <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Contact & Headquarters
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1">Official Email</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>info@niazimobilemart.com</span>
                </div>
              </div>
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1">Head Office Contact</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>+92 300 0000000</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-gray-500 dark:text-gray-400 mb-1">Principal Business Address</label>
                <input
                  type="text"
                  defaultValue="Main Commercial Market, Niazi Mobile Mart Plaza"
                  disabled
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section: Business Preferences */}
          <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Business Preferences
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Configure enterprise fiscal calendar, multi-currency display standards, and brand identity attributes. Profile editing controls will activate in subsequent configuration updates.
            </p>
          </div>
        </div>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationProfilePage;
