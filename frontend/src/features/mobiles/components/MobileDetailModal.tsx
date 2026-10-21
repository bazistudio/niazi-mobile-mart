'use client';

/**
 * MobileDetailModal.tsx
 *
 * Displays the complete profile of a used mobile device:
 *  A. Device summary
 *  B. Hardware identifiers & PTA
 *  C. Purchase paperwork & voucher
 *  D. Seller information (role-gated)
 *  E. Physical inspection results
 *
 * Org-Admin actions: Edit Record, Print (A4), Download PDF
 * All roles: View Details
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Smartphone,
  Hash,
  ShieldCheck,
  FileText,
  User,
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
  Copy,
  CheckCheck,
  Pencil,
  Printer,
  Download,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { mobileApi } from '../services/mobile.api';
import type { MobileFullProfile } from '../services/mobile.api';

interface MobileDetailModalProps {
  deviceId: string;
  branchId?: string;
  onClose: () => void;
  onEdit?: (deviceId: string) => void;
  onPrint?: (profile: MobileFullProfile) => void;
  onDownloadPdf?: (profile: MobileFullProfile) => void;
}

// ─── small helper: copy-to-clipboard button ────────────────────────────────
const CopyButton: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handle}
      title="Copy to clipboard"
      className="ml-1 p-0.5 text-text-muted hover:text-primary transition-colors"
    >
      {copied ? (
        <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
};

// ─── section header ─────────────────────────────────────────────────────────
const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <div>
    <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-border">
      <span className="text-primary">{icon}</span>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
    </div>
    {children}
  </div>
);

// ─── field row ───────────────────────────────────────────────────────────────
const Field: React.FC<{
  label: string;
  value?: string | number | null;
  mono?: boolean;
  copyable?: boolean;
  placeholder?: string;
}> = ({ label, value, mono, copyable, placeholder = 'Not recorded' }) => {
  const display = value !== undefined && value !== null && value !== '' ? String(value) : null;
  return (
    <div className="space-y-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex items-center">
        {display ? (
          <>
            <span
              className={`text-sm font-medium text-text-primary ${mono ? 'font-mono tracking-wide' : ''}`}
            >
              {display}
            </span>
            {copyable && <CopyButton value={display} />}
          </>
        ) : (
          <span className="text-sm text-text-muted italic">{placeholder}</span>
        )}
      </div>
    </div>
  );
};

// ─── boolean badge ───────────────────────────────────────────────────────────
const BoolBadge: React.FC<{ label: string; ok?: boolean }> = ({ label, ok }) => (
  <div
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
      ok === undefined
        ? 'bg-surface-hover border-border text-text-muted'
        : ok
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
          : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        ok === undefined ? 'bg-text-muted' : ok ? 'bg-emerald-500' : 'bg-red-500'
      }`}
    />
    {label}
  </div>
);

// ─── main modal ──────────────────────────────────────────────────────────────
export const MobileDetailModal: React.FC<MobileDetailModalProps> = ({
  deviceId,
  branchId,
  onClose,
  onEdit,
  onPrint,
  onDownloadPdf,
}) => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';

  const [profile, setProfile] = useState<MobileFullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await mobileApi.getMobileFullProfile(deviceId, branchId);
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load device details');
    } finally {
      setLoading(false);
    }
  }, [deviceId, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Trap focus / Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const ptaColor = (s?: string) => {
    if (s === 'PTA_APPROVED') return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800';
    if (s === 'PTA_BLOCKED') return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  };

  const conditionColor = (c?: string) =>
    c === 'NEW'
      ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800'
      : 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mobile device details"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-border overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight">
                {profile ? `${profile.device.brand} ${profile.device.model}` : 'Mobile Details'}
              </h2>
              {profile?.paperwork?.voucher_no && (
                <p className="text-xs text-text-muted">Sr No: {profile.paperwork.voucher_no}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile && (
              <>
                {onPrint && (
                  <button
                    type="button"
                    onClick={() => onPrint(profile)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary/10 rounded-lg border border-border transition-colors"
                    title="Print A4 receipt"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>
                )}
                {onDownloadPdf && (
                  <button
                    type="button"
                    onClick={() => onDownloadPdf(profile)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary/10 rounded-lg border border-border transition-colors"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                )}
                {isOrgAdmin && onEdit && profile.device.condition === 'USED' && (
                  <button
                    type="button"
                    onClick={() => onEdit(deviceId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                    title="Edit used mobile record"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-text-muted">Loading device details…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm text-text-secondary text-center">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          )}

          {/* Profile */}
          {!loading && !error && profile && (
            <>
              {/* ── A. Device summary ── */}
              <Section icon={<Smartphone className="w-4 h-4" />} title="Device Summary">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Brand" value={profile.device.brand} />
                  <Field label="Model" value={profile.device.model} />
                  <Field label="Storage" value={profile.device.storage} />
                  <Field label="RAM" value={profile.device.ram} />
                  <Field label="Color" value={profile.device.color} />
                  <div className="space-y-0.5">
                    <span className="text-xs text-text-muted">Condition</span>
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${conditionColor(profile.device.condition)}`}>
                        {profile.device.condition}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs text-text-muted">Status</span>
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-hover border border-border text-text-secondary">
                        {profile.device.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  {profile.branch_name && (
                    <Field label="Branch" value={`${profile.branch_name}${profile.branch_code ? ` (${profile.branch_code})` : ''}`} />
                  )}
                  {isOrgAdmin && (
                    <>
                      <Field label="Purchase Cost" value={profile.device.cost_price ? `Rs. ${parseFloat(profile.device.cost_price).toLocaleString()}` : null} />
                      {profile.device.expected_sale_price && (
                        <Field label="Expected Sale" value={`Rs. ${parseFloat(profile.device.expected_sale_price).toLocaleString()}`} />
                      )}
                    </>
                  )}
                </div>
              </Section>

              {/* ── B. Hardware identifiers & PTA ── */}
              <Section icon={<ShieldCheck className="w-4 h-4" />} title="Hardware & Compliance">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {profile.device.imeis?.map((imei) => (
                    <div key={imei.id} className="space-y-0.5">
                      <span className="text-xs text-text-muted">{imei.slot}</span>
                      <div className="flex items-center">
                        <span className="text-sm font-mono tracking-wide text-text-primary">{imei.imei}</span>
                        <CopyButton value={imei.imei} />
                      </div>
                    </div>
                  ))}
                  <Field label="Hardware Serial" value={profile.device.serial_number} mono copyable />
                  <div className="space-y-0.5">
                    <span className="text-xs text-text-muted">PTA Status</span>
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${ptaColor(profile.device.pta_status)}`}>
                        {profile.device.pta_status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* ── C. Purchase paperwork ── */}
              {profile.paperwork ? (
                <Section icon={<FileText className="w-4 h-4" />} title="Purchase Paperwork">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="Voucher / Sr No" value={profile.paperwork.voucher_no} copyable />
                    <Field label="Purchase Date" value={profile.paperwork.purchase_date} />
                    {isOrgAdmin && (
                      <Field
                        label="Purchase Price"
                        value={profile.paperwork.purchase_price ? `Rs. ${parseFloat(profile.paperwork.purchase_price).toLocaleString()}` : null}
                      />
                    )}
                    <Field label="Recorded By" value={profile.paperwork.recorded_by} />
                    <Field label="Ownership Declaration" value={profile.paperwork.seller?.ownership_declaration_acknowledged ? 'Acknowledged' : 'Not acknowledged'} />
                    <Field label="Physical Affidavit" value={profile.paperwork.seller?.physical_affidavit_acknowledged ? 'Acknowledged' : 'Not acknowledged'} />
                  </div>
                </Section>
              ) : (
                profile.device.condition === 'USED' && (
                  <Section icon={<FileText className="w-4 h-4" />} title="Purchase Paperwork">
                    <p className="text-sm text-text-muted italic">No paperwork recorded for this device.</p>
                  </Section>
                )
              )}

              {/* ── D. Seller information ── */}
              {profile.paperwork?.seller && (
                <Section icon={<User className="w-4 h-4" />} title="Seller Information">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="Seller Name" value={profile.paperwork.seller.seller_name} />
                    <Field
                      label="Father's Name"
                      value={
                        profile.paperwork.seller.father_name === '[REDACTED]'
                          ? undefined
                          : profile.paperwork.seller.father_name
                      }
                      placeholder={profile.paperwork.seller.father_name === '[REDACTED]' ? '[Restricted]' : 'Not recorded'}
                    />
                    <Field label="CNIC" value={profile.paperwork.seller.seller_cnic_masked} mono />
                    <Field
                      label="Phone"
                      value={
                        profile.paperwork.seller.seller_phone === '[REDACTED]'
                          ? undefined
                          : profile.paperwork.seller.seller_phone
                      }
                      placeholder={profile.paperwork.seller.seller_phone === '[REDACTED]' ? '[Restricted]' : 'Not recorded'}
                    />
                    <Field
                      label="Address"
                      value={
                        profile.paperwork.seller.seller_address === '[REDACTED]'
                          ? undefined
                          : profile.paperwork.seller.seller_address
                      }
                      placeholder={profile.paperwork.seller.seller_address === '[REDACTED]' ? '[Restricted]' : 'Not recorded'}
                    />
                  </div>
                  {profile.paperwork.seller.seller_id && (
                    <p className="mt-2 text-xs text-text-muted">
                      Linked to seller registry ·{' '}
                      <span className="font-mono text-xs">{profile.paperwork.seller.seller_id}</span>
                    </p>
                  )}
                </Section>
              )}

              {/* ── E. Physical inspection ── */}
              {profile.inspection ? (
                <Section icon={<ClipboardList className="w-4 h-4" />} title="Physical Inspection">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <Field label="Body Grade" value={profile.inspection.body_grade} />
                      <Field label="Screen Condition" value={profile.inspection.screen_condition?.replace(/_/g, ' ')} />
                      <Field
                        label="Battery Health"
                        value={profile.inspection.battery_health_percent != null ? `${profile.inspection.battery_health_percent}%` : null}
                      />
                    </div>

                    {/* Functional checks */}
                    <div>
                      <p className="text-xs text-text-muted mb-2">Functional Checks</p>
                      <div className="flex flex-wrap gap-2">
                        <BoolBadge label="Touch" ok={profile.inspection.touch_working ?? undefined} />
                        <BoolBadge label="Battery Backup" ok={profile.inspection.battery_backup_ok ?? undefined} />
                        <BoolBadge label="Front Camera" ok={profile.inspection.front_camera_ok ?? undefined} />
                        <BoolBadge label="Back Camera" ok={profile.inspection.back_camera_ok ?? undefined} />
                        <BoolBadge label="Speaker" ok={profile.inspection.speaker_ok ?? undefined} />
                        <BoolBadge label="Microphone" ok={profile.inspection.microphone_ok ?? undefined} />
                        <BoolBadge label="Charging Port" ok={profile.inspection.charging_port_ok ?? undefined} />
                        <BoolBadge label="Buttons" ok={profile.inspection.buttons_ok ?? undefined} />
                        <BoolBadge label="Biometrics" ok={profile.inspection.biometrics_ok ?? undefined} />
                        <BoolBadge label="Wi-Fi / BT" ok={profile.inspection.wifi_bluetooth_ok ?? undefined} />
                        <BoolBadge label="SIM / Network" ok={profile.inspection.sim_network_ok ?? undefined} />
                      </div>
                    </div>

                    {/* Accessories */}
                    <div>
                      <p className="text-xs text-text-muted mb-2">Accessories</p>
                      <div className="flex flex-wrap gap-2">
                        <BoolBadge label="Box" ok={profile.inspection.accessories_box ?? undefined} />
                        <BoolBadge label="Original Charger" ok={profile.inspection.accessories_original_charger ?? undefined} />
                        <BoolBadge label="Cable" ok={profile.inspection.accessories_cable ?? undefined} />
                        <BoolBadge label="Handsfree" ok={profile.inspection.accessories_handsfree ?? undefined} />
                      </div>
                    </div>

                    {/* Defect notes */}
                    {profile.inspection.defect_notes && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Defect Notes</p>
                        <p className="text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                          {profile.inspection.defect_notes}
                        </p>
                      </div>
                    )}
                  </div>
                </Section>
              ) : (
                profile.device.condition === 'USED' && (
                  <Section icon={<ClipboardList className="w-4 h-4" />} title="Physical Inspection">
                    <p className="text-sm text-text-muted italic">No inspection record for this device.</p>
                  </Section>
                )
              )}

              {/* Device notes */}
              {profile.device.notes && (
                <div className="p-3 bg-surface-hover/60 border border-border rounded-xl text-sm">
                  <p className="text-xs font-semibold text-text-muted mb-1">Device Notes</p>
                  <p className="text-text-secondary whitespace-pre-wrap">{profile.device.notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-border flex-shrink-0 bg-surface-hover/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
