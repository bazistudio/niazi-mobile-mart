import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  Cloud,
  Clock,
  Download,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Archive,
  RefreshCw,
  Upload,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { KpiCard } from '@/features/settings/components/KpiCard';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingsToggle } from '@/features/settings/components/SettingsToggle';
import { SettingsSelect } from '@/features/settings/components/SettingsSelect';
import { ComingSoonBadge } from '@/features/settings/components/ComingSoonBadge';

const SUMMARY_CARDS = [
  {
    label: 'Last Backup',
    value: 'Today, 02:30 AM',
    icon: <Clock />,
    variant: 'success' as const,
  },
  {
    label: 'Next Scheduled',
    value: 'Tomorrow, 02:30 AM',
    icon: <RefreshCw />,
    variant: 'info' as const,
  },
  {
    label: 'Backup Size',
    value: '256 MB',
    icon: <HardDrive />,
    variant: 'default' as const,
  },
  {
    label: 'Restore Points',
    value: '12',
    icon: <RotateCcw />,
    variant: 'warning' as const,
  },
];

const BACKUP_RETENTION = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '365 days' },
];

const BACKUP_HISTORY = [
  {
    date: '31 Jul 2026, 02:30 AM',
    type: 'Full',
    size: '256 MB',
    status: 'success' as const,
  },
  {
    date: '30 Jul 2026, 02:30 AM',
    type: 'Full',
    size: '251 MB',
    status: 'success' as const,
  },
  {
    date: '29 Jul 2026, 02:30 AM',
    type: 'Full',
    size: '248 MB',
    status: 'success' as const,
  },
  {
    date: '28 Jul 2026, 02:30 AM',
    type: 'Incremental',
    size: '12 MB',
    status: 'success' as const,
  },
  {
    date: '27 Jul 2026, 02:30 AM',
    type: 'Full',
    size: '245 MB',
    status: 'failed' as const,
  },
  {
    date: '26 Jul 2026, 02:30 AM',
    type: 'Incremental',
    size: '15 MB',
    status: 'success' as const,
  },
  {
    date: '25 Jul 2026, 02:30 AM',
    type: 'Full',
    size: '240 MB',
    status: 'success' as const,
  },
  {
    date: '24 Jul 2026, 02:30 AM',
    type: 'Incremental',
    size: '10 MB',
    status: 'success' as const,
  },
];

const STORAGE_OPTIONS = [
  {
    name: 'Local Storage',
    description: 'Store backups on this device',
    icon: <HardDrive className="w-5 h-5" />,
    enabled: true,
    comingSoon: false,
  },
  {
    name: 'Cloud Storage',
    description: 'Store backups in the cloud',
    icon: <Cloud className="w-5 h-5" />,
    enabled: true,
    comingSoon: false,
  },
  {
    name: 'Google Drive',
    description: 'Backup to Google Drive',
    icon: <Upload className="w-5 h-5" />,
    enabled: false,
    comingSoon: true,
  },
  {
    name: 'Dropbox',
    description: 'Backup to Dropbox',
    icon: <Upload className="w-5 h-5" />,
    enabled: false,
    comingSoon: true,
  },
  {
    name: 'OneDrive',
    description: 'Backup to Microsoft OneDrive',
    icon: <Upload className="w-5 h-5" />,
    enabled: false,
    comingSoon: true,
  },
];

export const BackupRestorePage: React.FC = () => {
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState('daily');
  const [backupRetention, setBackupRetention] = useState('30');
  const [compression, setCompression] = useState(true);
  const [encryption, setEncryption] = useState(true);

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-primary)', opacity: 0.12 }}
          >
            <Database className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[--color-text-primary]">Backup & Restore</h1>
            <p className="text-sm text-[--color-text-muted]">
              Manage database backups, restore points, and storage destinations
            </p>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SUMMARY_CARDS.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            variant={card.variant}
          />
        ))}
      </div>

      {/* Backup Settings */}
      <SettingsCard
        title="Backup Settings"
        description="Configure automatic backup schedule and preferences"
        icon={<Archive className="w-5 h-5" />}
      >
        <SettingsToggle
          label="Automatic Backup"
          description="Enable scheduled automatic backups"
          checked={autoBackup}
          onChange={setAutoBackup}
        />

        {autoBackup && (
          <>
            <div className="border-t border-[--color-border]" />

            <div className="space-y-3">
              <p className="text-sm font-medium text-[--color-text-primary]">Backup Frequency</p>
              <div className="flex gap-2">
                {['daily', 'weekly', 'monthly'].map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setBackupFrequency(freq)}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-xl border transition-all duration-fast ${
                      backupFrequency === freq
                        ? 'border-[--color-primary] bg-[--color-primary]/5 text-[--color-primary]'
                        : 'border-[--color-border] text-[--color-text-secondary] hover:border-[--color-primary] hover:text-[--color-text-primary]'
                    }`}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[--color-border]" />

            <SettingsSelect
              label="Backup Retention"
              description="How long to keep backup files"
              value={backupRetention}
              onChange={setBackupRetention}
              options={BACKUP_RETENTION}
            />
          </>
        )}

        <div className="border-t border-[--color-border]" />

        <SettingsToggle
          label="Compression"
          description="Compress backup files to save storage space"
          checked={compression}
          onChange={setCompression}
        />

        <div className="border-t border-[--color-border]" />

        <SettingsToggle
          label="Encryption"
          description="Encrypt backup files for security"
          checked={encryption}
          onChange={setEncryption}
        />
      </SettingsCard>

      {/* Storage */}
      <SettingsCard
        title="Storage"
        description="Configure backup storage destinations"
        icon={<HardDrive className="w-5 h-5" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STORAGE_OPTIONS.map((option) => (
            <div
              key={option.name}
              className={`p-4 rounded-xl border ${
                option.enabled
                  ? 'border-[--color-primary] bg-[--color-primary]/5'
                  : 'border-[--color-border] opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: option.enabled ? 'var(--color-primary)' : 'var(--color-border)',
                      opacity: 0.1,
                    }}
                  >
                    <div
                      style={{
                        color: option.enabled ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      }}
                      className="w-4 h-4"
                    >
                      {option.icon}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[--color-text-primary]">
                      {option.name}
                    </p>
                    <p className="text-xs text-[--color-text-muted] mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>
                {option.comingSoon && <ComingSoonBadge />}
                {option.enabled && !option.comingSoon && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-success)', opacity: 0.15 }}
                  >
                    <CheckCircle2
                      className="w-3.5 h-3.5"
                      style={{ color: 'var(--color-success)' }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      {/* Backup History */}
      <SettingsCard
        title="Backup History"
        description="Recent backup operations and their status"
        icon={<Clock className="w-5 h-5" />}
      >
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[--color-border]">
                <th className="px-6 py-3 text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-border]">
              {BACKUP_HISTORY.map((backup, index) => (
                <tr
                  key={index}
                  className="hover:bg-[--color-surface-hover] transition-colors"
                >
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className="text-sm font-medium text-[--color-text-primary]">
                      {backup.date}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        backup.type === 'Full'
                          ? 'bg-[--color-primary]/10 text-[--color-primary]'
                          : 'bg-[--color-info]/10 text-[--color-info]'
                      }`}
                    >
                      {backup.type}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-sm text-[--color-text-secondary]">
                    {backup.size}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    {backup.status === 'success' ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[--color-success]" />
                        <span className="text-sm font-medium text-[--color-success]">Success</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="w-4 h-4 text-[--color-danger]" />
                        <span className="text-sm font-medium text-[--color-danger]">Failed</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled
                        className="p-2 rounded-lg text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-surface-hover] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled
                        className="p-2 rounded-lg text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-surface-hover] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Restore"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled
                        className="p-2 rounded-lg text-[--color-text-muted] hover:text-[--color-danger] hover:bg-[--color-danger]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {/* Danger Zone */}
      <div className="rounded-2xl border-2 border-[--color-danger]/20 p-6 bg-[--color-surface]">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-danger)', opacity: 0.12 }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-danger)' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[--color-text-primary]">Danger Zone</h2>
            <p className="text-sm text-[--color-text-muted]">
              Irreversible actions — proceed with caution
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {[
            {
              label: 'Restore Database',
              description: 'Restore the database from a previous backup point',
              icon: <RotateCcw className="w-4 h-4" />,
            },
            {
              label: 'Factory Reset',
              description: 'Reset all settings and data to factory defaults',
              icon: <RefreshCw className="w-4 h-4" />,
            },
            {
              label: 'Delete All Data',
              description: 'Permanently delete all business data from the system',
              icon: <Trash2 className="w-4 h-4" />,
            },
          ].map((action) => (
            <div
              key={action.label}
              className="flex items-center justify-between gap-4 p-4 rounded-xl border border-[--color-danger]/10 bg-[--color-danger]/5"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-danger)', opacity: 0.1 }}
                >
                  <div style={{ color: 'var(--color-danger)' }} className="w-4 h-4">
                    {action.icon}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[--color-text-primary]">
                    {action.label}
                  </p>
                  <p className="text-xs text-[--color-text-muted] mt-0.5">
                    {action.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="px-4 py-2 text-sm font-semibold rounded-xl border-2 border-[--color-danger]/30 text-[--color-danger] opacity-50 cursor-not-allowed transition-colors"
              >
                {action.label === 'Restore Database'
                  ? 'Restore'
                  : action.label === 'Factory Reset'
                  ? 'Reset'
                  : 'Delete All'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
