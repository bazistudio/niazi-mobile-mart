import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { AppearancePage } from '@/pages/dashboard/shop-admin/settings/AppearancePage';
import { PrinterSettingsPage } from '@/features/settings/printer/PrinterSettingsPage';
import { RoleAccessPage } from '@/features/settings/components/RoleAccessPage';
import { BackupRestorePage } from '@/pages/dashboard/shop-admin/settings/BackupRestorePage';
import { ShopsManagementPage } from '@/pages/dashboard/organization/ShopsManagementPage';
import { 
  Settings, 
  Building2, 
  Store, 
  Users, 
  ShieldCheck, 
  Lock, 
  Bell, 
  Database, 
  HardDrive, 
  Cpu,
  Mail,
  Phone,
  MapPin,
  Save,
  Palette,
  Printer
} from 'lucide-react';

export function OrganizationSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'profile';
  const { user } = useAuthStore();

  const settingsCategories = [
    { id: 'profile', label: 'Organization Profile', icon: Building2, desc: 'Enterprise legal entity details, business identity, and headquarters contacts.' },
    { id: 'branches', label: 'Shops & Branches', icon: Store, desc: 'Create and configure physical retail branches, store locations, and operational statuses.' },
    { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme presets, color customization, dark/light mode, and UI contrast standards.' },
    { id: 'printer', label: 'Printer', icon: Printer, desc: 'Hardware-agnostic POS print engine, receipt layouts, invoice templates, and shop branding.' },
    { id: 'roles', label: 'Roles & Access', icon: ShieldCheck, desc: 'Organization-wide role templates, access matrix, and cross-branch permissions.' },
    { id: 'backup', label: 'Backup & Restore', icon: Database, desc: 'Automated SQLite database snapshots, encryption keys, and recovery points.' },
    { id: 'general', label: 'General', icon: Settings, desc: 'Enterprise localization, default date formats, and regional standards.' },
    { id: 'users', label: 'Users', icon: Users, desc: 'Enterprise user account lifecycle, session limits, and inactivity policies.' },
    { id: 'security', label: 'Security', icon: Lock, desc: 'Two-factor authentication, master password rotation, and IP allowlisting.' },
    { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'System alert routing, low-stock threshold triggers, and managerial alerts.' },
    { id: 'data', label: 'Data', icon: HardDrive, desc: 'Data retention schedules, archiving policies, and compliance export utilities.' },
    { id: 'application', label: 'Application', icon: Cpu, desc: 'Tauri native desktop runtime preferences, hardware acceleration, and logging verbosity.' },
  ];

  const currentCategory = settingsCategories.find((c) => c.id === currentTab) || settingsCategories[0];

  return (
    <OrganizationPageShell
      title="Organization Settings"
      description="Configure organization-level profile, roles & permissions, security policies, and system preferences."
      badge="Application Config"
      action={
        currentCategory.id === 'profile' ? (
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium cursor-not-allowed shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Profile</span>
          </button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Categories Sidebar */}
        <div className="bg-white dark:bg-gray-800/90 rounded-xl p-3 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col gap-1">
          {settingsCategories.map((cat) => {
            const Icon = cat.icon;
            const isActive = currentCategory.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSearchParams({ tab: cat.id })}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-sm font-semibold'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Category Detail View */}
        <div className="md:col-span-3 space-y-6">
          {/* Header Banner for Current Category */}
          <div className="bg-white dark:bg-gray-800/90 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                {React.createElement(currentCategory.icon, { className: 'w-5 h-5' })}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {currentCategory.label}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {currentCategory.desc}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              Active Section
            </span>
          </div>

          {/* TAB 1: Organization Profile */}
          {currentCategory.id === 'profile' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Summary Card */}
                <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-2xl mb-4 border border-primary/20 shadow-sm">
                    N
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Niazi Mobile Mart
                  </h3>
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

                {/* Profile Form Columns */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="w-5 h-5 text-primary" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Organization Information
                      </h4>
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

                  <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="w-5 h-5 text-primary" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Headquarters & Contact
                      </h4>
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
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Appearance */}
          {currentCategory.id === 'appearance' && (
            <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
              <AppearancePage />
            </div>
          )}

          {/* TAB 3: Printer */}
          {currentCategory.id === 'printer' && (
            <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
              <PrinterSettingsPage />
            </div>
          )}

          {/* TAB 4: Roles & Access */}
          {currentCategory.id === 'roles' && (
            <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
              <RoleAccessPage />
            </div>
          )}

          {/* TAB: Shops & Branches */}
          {(currentCategory.id === 'branches' || currentCategory.id === 'shops') && (
            <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
              <ShopsManagementPage embedded={true} />
            </div>
          )}

          {/* TAB: Backup & Restore */}
          {currentCategory.id === 'backup' && (
            <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
              <BackupRestorePage />
            </div>
          )}

          {/* OTHER TABS: Generic Category Shell */}
          {currentCategory.id !== 'profile' && 
           currentCategory.id !== 'branches' && 
           currentCategory.id !== 'shops' && 
           currentCategory.id !== 'appearance' && 
           currentCategory.id !== 'printer' && 
           currentCategory.id !== 'roles' && 
           currentCategory.id !== 'backup' && (
            <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col justify-between min-h-[380px]">
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto flex items-center justify-center text-gray-400 mb-3">
                  <Settings className="w-6 h-6" />
                </div>
                <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  {currentCategory.label} Configuration
                </h4>
                <p className="text-xs text-gray-400 dark:text-gray-500 max-w-sm mx-auto mt-1.5 leading-relaxed">
                  Settings controls for {currentCategory.label.toLowerCase()} will become active in future release phases.
                </p>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs text-gray-400">
                <span>Module status: Initialized shell</span>
                <span className="text-primary font-medium">Ready for configuration schema</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationSettingsPage;
