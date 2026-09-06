import React, { useState, useEffect } from 'react';
import { Building2, Globe, Bell, Info, AlertTriangle, Save } from 'lucide-react';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingsInput } from '@/features/settings/components/SettingsInput';
import { SettingsSelect } from '@/features/settings/components/SettingsSelect';
import { SettingsToggle } from '@/features/settings/components/SettingsToggle';
import { Button } from '@/components/ui/Button';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import toast from 'react-hot-toast';

const defaultSettings = {
  business: {
    logoUrl: '',
    name: 'Niazi Mobile Mart',
    type: 'Retail Shop',
    phone: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    country: 'Pakistan',
  },
  preferences: {
    currency: 'PKR',
    decimalPlaces: '2',
    numberFormat: '1,000.00',
    dateFormat: 'DD-MM-YYYY',
    timeFormat: '12 Hour',
    language: 'English',
    lowStockAlertEnabled: true,
    lowStockThreshold: '10',
    autoLogoutDuration: '30 Minutes',
  },
  notifications: {
    lowStock: true,
    outOfStock: true,
    newSale: false,
    paymentReceived: true,
    customerDue: true,
  },
};

export const GeneralSettingsPage: React.FC = () => {
  const activeShop = useOrganizationStore(state => state.activeShop);
  const activeOrganization = useOrganizationStore(state => state.activeOrganization);
  const user = useAuthStore(state => state.user);

  const [settings, setSettings] = useState(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const systemInfo = {
    shopId: activeShop?._id || user?.shopId || 'N/A',
    organizationId: activeOrganization?._id || user?.organizationId || 'N/A',
    currentPlan: 'Pro Plan',
    subscriptionStatus: 'Active',
    createdDate: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A',
    softwareVersion: 'v2.1.4',
  };

  useEffect(() => {
    let isMounted = true;
    const loadSettings = () => {
      try {
        setIsLoading(true);
        const saved = typeof window !== 'undefined' ? localStorage.getItem('niazi_desktop_settings') : null;
        if (isMounted && saved) {
          const data = JSON.parse(saved);
          setSettings(prev => ({
            ...prev,
            business: {
              ...prev.business,
              ...data.business,
            },
            preferences: {
              ...prev.preferences,
              ...data.preferences,
            }
          }));
        }
      } catch (err: any) {
        console.error('Failed to load shop settings from local storage:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadSettings();
    return () => { isMounted = false; };
  }, [activeShop]);

  // Danger Zone states (UI only)
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showClearDemoDialog, setShowClearDemoDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const updateBusiness = (field: keyof typeof settings.business, value: string) => {
    setSettings(prev => ({ ...prev, business: { ...prev.business, [field]: value } }));
    setHasChanges(true);
  };

  const updatePreference = (field: keyof typeof settings.preferences, value: string | boolean) => {
    setSettings(prev => ({ ...prev, preferences: { ...prev.preferences, [field]: value } }));
    setHasChanges(true);
  };

  const updateNotification = (field: keyof typeof settings.notifications, value: boolean) => {
    setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, [field]: value } }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('niazi_desktop_settings', JSON.stringify({
          business: settings.business,
          preferences: settings.preferences,
        }));
      }
      setHasChanges(false);
      toast.success('Settings saved locally');
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-primary)', opacity: 0.12 }}
          >
            <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">General Settings</h1>
            <p className="text-sm text-text-muted">
              Configure your business details and application preferences
            </p>
          </div>
        </div>

        {hasChanges && (
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {/* Section 1: Business Information */}
      <SettingsCard
        title="Business Information"
        description="Basic identity of your shop"
        icon={<Building2 className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <SettingsInput
            label="Business Name"
            description="The registered name of your business"
            value={settings.business.name}
            onChange={(v) => updateBusiness('name', v)}
          />
          <SettingsInput
            label="Business Type"
            value={settings.business.type}
            onChange={(v) => updateBusiness('type', v)}
          />
          <SettingsInput
            label="Phone Number"
            value={settings.business.phone}
            onChange={(v) => updateBusiness('phone', v)}
          />
          <SettingsInput
            label="WhatsApp Number"
            value={settings.business.whatsapp}
            onChange={(v) => updateBusiness('whatsapp', v)}
          />
          <SettingsInput
            label="Email"
            type="email"
            value={settings.business.email}
            onChange={(v) => updateBusiness('email', v)}
          />
          <SettingsInput
            label="Address"
            value={settings.business.address}
            onChange={(v) => updateBusiness('address', v)}
          />
          <SettingsInput
            label="City"
            value={settings.business.city}
            onChange={(v) => updateBusiness('city', v)}
          />
          <SettingsInput
            label="Country"
            value={settings.business.country}
            onChange={(v) => updateBusiness('country', v)}
          />
        </div>
      </SettingsCard>

      {/* Section 2: Regional & System Preferences */}
      <SettingsCard
        title="Regional & System Preferences"
        description="Shop-level application behavior"
        icon={<Globe className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <SettingsSelect
            label="Currency"
            description="Permanent system currency (Pakistani Rupee - PKR)"
            value="PKR"
            disabled={true}
            onChange={() => {}}
            options={[{ value: 'PKR', label: 'PKR - Pakistani Rupee (Rs) [Locked]' }]}
          />
          <SettingsSelect
            label="Number Format"
            value={settings.preferences.numberFormat}
            onChange={(v) => updatePreference('numberFormat', v)}
            options={[{ value: '1,000.00', label: '1,000.00' }, { value: '1.000,00', label: '1.000,00' }]}
          />
          <SettingsSelect
            label="Date Format"
            value={settings.preferences.dateFormat}
            onChange={(v) => updatePreference('dateFormat', v)}
            options={[{ value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' }, { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY' }]}
          />
          <SettingsSelect
            label="Time Format"
            value={settings.preferences.timeFormat}
            onChange={(v) => updatePreference('timeFormat', v)}
            options={[{ value: '12 Hour', label: '12 Hour' }, { value: '24 Hour', label: '24 Hour' }]}
          />
          <SettingsSelect
            label="Language"
            value={settings.preferences.language}
            onChange={(v) => updatePreference('language', v)}
            options={[{ value: 'English', label: 'English' }, { value: 'Urdu', label: 'Urdu' }]}
          />
          <div className="border-t border-border pt-4">
            <SettingsToggle
              label="Enable Low Stock Alerts"
              description="Show warnings when inventory falls below threshold"
              checked={settings.preferences.lowStockAlertEnabled}
              onChange={(v) => updatePreference('lowStockAlertEnabled', v)}
            />
          </div>
          <SettingsInput
            label="Low Stock Threshold"
            type="number"
            value={settings.preferences.lowStockThreshold}
            onChange={(v) => updatePreference('lowStockThreshold', v)}
          />
          <div className="border-t border-border pt-4">
            <SettingsSelect
              label="Auto Logout Duration"
              description="Automatically end sessions after inactivity"
              value={settings.preferences.autoLogoutDuration}
              onChange={(v) => updatePreference('autoLogoutDuration', v)}
              options={[{ value: '15 Minutes', label: '15 Minutes' }, { value: '30 Minutes', label: '30 Minutes' }, { value: '1 Hour', label: '1 Hour' }]}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Section 3: Notification Preferences */}
      <SettingsCard
        title="Notification Preferences"
        description="Control system alerts and messages"
        icon={<Bell className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-text-primary mb-2">Inventory Alerts</h4>
          <SettingsToggle
            label="Low Stock Notifications"
            checked={settings.notifications.lowStock}
            onChange={(v) => updateNotification('lowStock', v)}
          />
          <SettingsToggle
            label="Out of Stock Notifications"
            checked={settings.notifications.outOfStock}
            onChange={(v) => updateNotification('outOfStock', v)}
          />
          
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Sales Notifications</h4>
            <SettingsToggle
              label="New Sale Notification"
              checked={settings.notifications.newSale}
              onChange={(v) => updateNotification('newSale', v)}
            />
            <SettingsToggle
              label="Payment Received Notification"
              checked={settings.notifications.paymentReceived}
              onChange={(v) => updateNotification('paymentReceived', v)}
            />
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Customer Notifications</h4>
            <SettingsToggle
              label="Due Payment Reminders"
              checked={settings.notifications.customerDue}
              onChange={(v) => updateNotification('customerDue', v)}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Section 4: System Information */}
      <SettingsCard
        title="Data & System Information"
        description="Read-only system diagnostics"
        icon={<Info className="w-5 h-5" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
          <div>
            <label className="text-xs text-text-muted">Shop ID</label>
            <p className="text-sm font-medium">{systemInfo.shopId}</p>
          </div>
          <div>
            <label className="text-xs text-text-muted">Organization ID</label>
            <p className="text-sm font-medium">{systemInfo.organizationId}</p>
          </div>
          <div>
            <label className="text-xs text-text-muted">Current Plan</label>
            <p className="text-sm font-medium">{systemInfo.currentPlan}</p>
          </div>
          <div>
            <label className="text-xs text-text-muted">Subscription Status</label>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success border border-success/20">
              {systemInfo.subscriptionStatus}
            </span>
          </div>
          <div>
            <label className="text-xs text-text-muted">Account Created</label>
            <p className="text-sm font-medium">{systemInfo.createdDate}</p>
          </div>
          <div>
            <label className="text-xs text-text-muted">Software Version</label>
            <p className="text-sm font-medium text-text-secondary">{systemInfo.softwareVersion}</p>
          </div>
        </div>
      </SettingsCard>

      {/* Section 5: Danger Zone */}
      <div className="border border-danger/30 bg-danger/5 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-danger w-6 h-6" />
          <div>
            <h3 className="text-lg font-semibold text-danger">Danger Zone</h3>
            <p className="text-sm text-text-muted">Destructive actions that affect your entire organization.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-border rounded-lg bg-surface">
            <div>
              <h4 className="font-medium text-sm">Reset Preferences</h4>
              <p className="text-xs text-text-muted">Restores language, formats, and notifications to default. Does not delete data.</p>
            </div>
            <Button variant="outline" className="mt-3 sm:mt-0" onClick={() => setShowResetDialog(true)}>Reset</Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-border rounded-lg bg-surface">
            <div>
              <h4 className="font-medium text-sm">Clear Demo Data</h4>
              <p className="text-xs text-text-muted">Removes sample products and sales. Recommended before going live.</p>
            </div>
            <Button variant="outline" className="mt-3 sm:mt-0 text-warning border-warning/50 hover:bg-warning/10" onClick={() => setShowClearDemoDialog(true)}>Clear Demo Data</Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-border rounded-lg bg-surface">
            <div>
              <h4 className="font-medium text-sm">Deactivate Shop</h4>
              <p className="text-xs text-text-muted">Temporarily blocks login for all employees. Owner can reactivate later.</p>
            </div>
            <Button variant="outline" className="mt-3 sm:mt-0 text-danger border-danger/50 hover:bg-danger/10" onClick={() => setShowDeactivateDialog(true)}>Deactivate</Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-danger/30 rounded-lg bg-danger/5">
            <div>
              <h4 className="font-medium text-sm text-danger">Delete Organization</h4>
              <p className="text-xs text-text-muted">Permanently deletes all branches, users, and business data. Cannot be undone.</p>
            </div>
            <Button variant="outline" className="mt-3 sm:mt-0 text-white bg-danger hover:bg-danger/90 border-danger" onClick={() => setShowDeleteDialog(true)}>Delete Organization</Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialogs (UI only placeholders) */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface p-6 rounded-xl max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold mb-2">Reset Preferences?</h3>
            <p className="text-sm text-text-muted mb-6">This will reset your language, date formats, and notifications to default. No business data will be lost.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
              <Button onClick={() => setShowResetDialog(false)}>Confirm Reset</Button>
            </div>
          </div>
        </div>
      )}

      {showClearDemoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface p-6 rounded-xl max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold text-warning mb-2">Clear Demo Data?</h3>
            <p className="text-sm text-text-muted mb-4">Are you sure you want to delete all demo products, customers, and sales? This action cannot be undone.</p>
            <div className="mb-6">
              <input type="password" placeholder="Enter PIN to confirm" className="w-full p-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowClearDemoDialog(false)}>Cancel</Button>
              <Button className="bg-warning text-white hover:bg-warning/90 border-warning" onClick={() => setShowClearDemoDialog(false)}>Clear Data</Button>
            </div>
          </div>
        </div>
      )}

      {showDeactivateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface p-6 rounded-xl max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold text-danger mb-2">Deactivate Shop?</h3>
            <p className="text-sm text-text-muted mb-6">This will block all employee logins. Only the owner can recover the account.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>Cancel</Button>
              <Button className="bg-danger text-white hover:bg-danger/90 border-danger" onClick={() => setShowDeactivateDialog(false)}>Deactivate</Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface p-6 rounded-xl max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold text-danger mb-2">Delete Organization?</h3>
            <p className="text-sm text-text-muted mb-4">This will permanently delete all your branches, employees, and data. This action is irreversible.</p>
            <div className="mb-4">
              <label className="text-xs font-semibold mb-1 block">Type organization name to confirm:</label>
              <input type="text" placeholder="Niazi Mobile Mart Main Branch" className="w-full p-2 border border-border rounded-md text-sm mb-3" />
              <input type="password" placeholder="Admin Password" className="w-full p-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button className="bg-danger text-white hover:bg-danger/90 border-danger" onClick={() => setShowDeleteDialog(false)}>Permanently Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
