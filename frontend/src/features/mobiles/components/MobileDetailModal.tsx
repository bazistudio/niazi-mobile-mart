'use client';

/**
 * MobileDetailModal.tsx
 *
 * Displays the complete profile of a used mobile device.
 * Landscape, no-scroll, single-viewport layout — mirrors EditMobileModal.tsx.
 * Three columns: Device Specifications | Physical Inspection | Paperwork & Identity
 *
 * Read-only: no form, no inputs, no mutation handlers.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Smartphone,
  ClipboardList,
  FileText,
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

// ─── copy-to-clipboard button ─────────────────────────────────────────────────
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

// ─── section header (matches EditMobileModal SectionHead style) ───────────────
const SectionHead: React.FC<{ title: string; icon?: React.ReactNode }> = ({ title, icon }) => (
  <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-border">
    {icon && <span className="text-primary">{icon}</span>}
    <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{title}</p>
  </div>
);

// ─── read-only label ──────────────────────────────────────────────────────────
const Lbl: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-0.5">{text}</p>
);

// ─── field: label + value read-only ──────────────────────────────────────────
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
      <Lbl text={label} />
      <div className="flex items-center">
        {display ? (
          <>
            <span
              className={`text-xs font-medium text-text-primary ${mono ? 'font-mono tracking-wide' : ''}`}
            >
              {display}
            </span>
            {copyable && <CopyButton value={display} />}
          </>
        ) : (
          <span className="text-xs text-text-muted italic">{placeholder}</span>
        )}
      </div>
    </div>
  );
};

// ─── boolean badge ────────────────────────────────────────────────────────────
const BoolBadge: React.FC<{ label: string; ok?: boolean }> = ({ label, ok }) => (
  <div
    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border ${
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

// ─── main modal ───────────────────────────────────────────────────────────────
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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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

  const isUsed = profile?.device.condition === 'USED';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mobile device details"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-neutral-900/70 backdrop-blur-sm p-2"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Landscape container: matches EditMobileModal dimensions ── */}
      <div
        className="bg-surface rounded-2xl shadow-2xl border border-border flex flex-col w-full"
        style={{ maxWidth: 'min(95vw, 1400px)', height: 'min(96vh, 700px)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0 bg-surface-hover/30 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary leading-tight">
                {profile ? `${profile.device.brand} ${profile.device.model}` : 'Mobile Details'}
              </h2>
              <p className="text-[10px] text-text-muted">
                {isUsed ? 'USED' : profile ? 'NEW' : ''} device
                {profile?.branch_name ? ` · ${profile.branch_name}` : ''}
                {profile?.paperwork?.voucher_no ? ` · Sr No: ${profile.paperwork.voucher_no}` : ''}
              </p>
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
                {isOrgAdmin && onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(deviceId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                    title="Edit mobile record"
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
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
            <p className="text-xs text-text-muted">Loading device details…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-xs text-text-secondary text-center">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : profile ? (

          /* ── Three-column content area (no overflow-y-auto) ── */
          <div className="flex flex-1 overflow-hidden">

            {/* ═══════════════════════════════════════
                COL 1 — Device Specifications  (30%)
            ═══════════════════════════════════════ */}
            <div className="flex flex-col gap-2.5 p-5 overflow-hidden border-r border-border" style={{ width: '30%' }}>
              <SectionHead title="Device Specifications" icon={<Smartphone className="w-3.5 h-3.5" />} />

              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <Field label="Brand" value={profile.device.brand} />
                <Field label="Model" value={profile.device.model} />
                <Field label="Storage" value={profile.device.storage} />
                <Field label="RAM" value={profile.device.ram} />
                <Field label="Color" value={profile.device.color} />
                <Field label="HW Serial" value={profile.device.serial_number} mono />
              </div>

              {/* Status badges row */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div className="space-y-0.5">
                  <Lbl text="Condition" />
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${conditionColor(profile.device.condition)}`}>
                    {profile.device.condition}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <Lbl text="Inv. Status" />
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-hover border border-border text-text-secondary">
                    {profile.device.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/* PTA status */}
              <div className="space-y-0.5">
                <Lbl text="PTA Status" />
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ptaColor(profile.device.pta_status)}`}>
                  {profile.device.pta_status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Pricing — org admin only */}
              {isOrgAdmin && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <Field
                    label="Purchase Cost"
                    value={profile.device.cost_price ? `Rs. ${parseFloat(profile.device.cost_price).toLocaleString()}` : null}
                  />
                  <Field
                    label="Expected Sale"
                    value={profile.device.expected_sale_price ? `Rs. ${parseFloat(profile.device.expected_sale_price).toLocaleString()}` : null}
                  />
                </div>
              )}

              {/* Device Identity — IMEIs + Voucher */}
              <SectionHead title="Device Identity" />
              <div className="bg-surface-hover/50 rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-[11px]">
                  <tbody>
                    <tr className="border-b border-border/40">
                      <td className="px-3 py-2 text-text-muted font-medium w-[38%]">Branch</td>
                      <td className="px-3 py-2 font-semibold text-text-primary">
                        {profile.branch_name ?? '—'}{profile.branch_code ? ` (${profile.branch_code})` : ''}
                      </td>
                    </tr>
                    {profile.device.imeis?.map((imei) => (
                      <tr key={imei.id} className="border-b border-border/40">
                        <td className="px-3 py-2 text-text-muted font-medium">{imei.slot}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-text-primary text-[10px]">{imei.imei}</span>
                            <CopyButton value={imei.imei} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {profile.paperwork?.voucher_no && (
                      <tr>
                        <td className="px-3 py-2 text-text-muted font-medium">
                          Voucher No
                          <span className="block text-[9px] text-text-muted/70 font-normal leading-tight">immutable</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span className="text-text-primary font-semibold text-[10px]">{profile.paperwork.voucher_no}</span>
                            <CopyButton value={profile.paperwork.voucher_no} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Device notes */}
              {profile.device.notes && (
                <div className="p-3 bg-surface-hover/60 border border-border rounded-xl">
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Device Notes</p>
                  <p className="text-[11px] text-text-secondary whitespace-pre-wrap">{profile.device.notes}</p>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════
                COL 2 — Physical Inspection  (38%)
            ═══════════════════════════════════════ */}
            <div className="flex flex-col gap-2.5 p-5 overflow-hidden border-r border-border" style={{ width: '38%' }}>
              <SectionHead title="Physical Inspection" icon={<ClipboardList className="w-3.5 h-3.5" />} />

              {profile.inspection ? (
                <>
                  {/* Body Grade + Screen + Battery */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <Field label="Body Grade" value={profile.inspection.body_grade} />
                    <Field label="Screen" value={profile.inspection.screen_condition?.replace(/_/g, ' ')} />
                    <Field
                      label="Battery %"
                      value={profile.inspection.battery_health_percent != null ? `${profile.inspection.battery_health_percent}%` : null}
                    />
                  </div>

                  {/* Functional Checks */}
                  <div className="bg-surface-hover/40 rounded-xl p-3 border border-border/60">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Functional Checks</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <BoolBadge label="Touch Screen" ok={profile.inspection.touch_working ?? undefined} />
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
                  <div className="bg-surface-hover/40 rounded-xl p-3 border border-border/60">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Accessories Included</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <BoolBadge label="Original Box" ok={profile.inspection.accessories_box ?? undefined} />
                      <BoolBadge label="Original Charger" ok={profile.inspection.accessories_original_charger ?? undefined} />
                      <BoolBadge label="Cable" ok={profile.inspection.accessories_cable ?? undefined} />
                      <BoolBadge label="Handsfree" ok={profile.inspection.accessories_handsfree ?? undefined} />
                    </div>
                  </div>

                  {/* Defect Notes — fills remaining column height */}
                  <div className="flex flex-col flex-1 min-h-0">
                    <Lbl text="Defect / Cosmetic Notes" />
                    {profile.inspection.defect_notes ? (
                      <div
                        className="flex-1 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl overflow-y-auto"
                        style={{ minHeight: '4rem' }}
                      >
                        <p className="text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                          {profile.inspection.defect_notes}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-text-muted italic mt-1">No defect notes recorded.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-text-muted italic mt-1">
                  {isUsed ? 'No inspection record for this device.' : 'Inspection not applicable for NEW devices.'}
                </p>
              )}
            </div>

            {/* ═══════════════════════════════════════
                COL 3 — Paperwork & Identity  (32%)
            ═══════════════════════════════════════ */}
            <div className="flex flex-col gap-2.5 p-5 flex-1 overflow-hidden">
              <SectionHead title="Purchase Paperwork" icon={<FileText className="w-3.5 h-3.5" />} />

              {profile.paperwork ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <Field label="Purchase Date" value={profile.paperwork.purchase_date} />
                    {isOrgAdmin && (
                      <Field
                        label="Purchase Price"
                        value={
                          profile.paperwork.purchase_price
                            ? `Rs. ${parseFloat(profile.paperwork.purchase_price).toLocaleString()}`
                            : null
                        }
                      />
                    )}
                    <Field label="Recorded By" value={profile.paperwork.recorded_by} />
                    <Field
                      label="Ownership Declaration"
                      value={
                        profile.paperwork.seller?.ownership_declaration_acknowledged
                          ? 'Acknowledged'
                          : 'Not acknowledged'
                      }
                    />
                    <Field
                      label="Physical Affidavit"
                      value={
                        profile.paperwork.seller?.physical_affidavit_acknowledged
                          ? 'Acknowledged'
                          : 'Not acknowledged'
                      }
                    />
                  </div>

                  {/* Seller Information */}
                  {profile.paperwork.seller && (
                    <>
                      <SectionHead title="Seller Information" />
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <Field label="Seller Name" value={profile.paperwork.seller.seller_name} />
                        <Field
                          label="Father's Name"
                          value={
                            profile.paperwork.seller.father_name === '[REDACTED]'
                              ? undefined
                              : profile.paperwork.seller.father_name
                          }
                          placeholder={
                            profile.paperwork.seller.father_name === '[REDACTED]'
                              ? '[Restricted]'
                              : 'Not recorded'
                          }
                        />
                        <Field label="CNIC" value={profile.paperwork.seller.seller_cnic_masked} mono />
                        <Field
                          label="Mobile No"
                          value={
                            profile.paperwork.seller.seller_phone === '[REDACTED]'
                              ? undefined
                              : profile.paperwork.seller.seller_phone
                          }
                          placeholder={
                            profile.paperwork.seller.seller_phone === '[REDACTED]'
                              ? '[Restricted]'
                              : 'Not recorded'
                          }
                        />
                        <div className="col-span-2">
                          <Field
                            label="Seller Address"
                            value={
                              profile.paperwork.seller.seller_address === '[REDACTED]'
                                ? undefined
                                : profile.paperwork.seller.seller_address
                            }
                            placeholder={
                              profile.paperwork.seller.seller_address === '[REDACTED]'
                                ? '[Restricted]'
                                : 'Not recorded'
                            }
                          />
                        </div>
                      </div>
                      {profile.paperwork.seller.seller_id && (
                        <p className="text-[10px] text-text-muted">
                          Linked to seller registry ·{' '}
                          <span className="font-mono text-[10px]">{profile.paperwork.seller.seller_id}</span>
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-text-muted italic">
                  {isUsed
                    ? 'No paperwork recorded for this device.'
                    : 'Paperwork not applicable for NEW devices.'}
                </p>
              )}

              {/* Spacer */}
              <div className="flex-1" />
            </div>

          </div>

        ) : null}

        {/* ── Footer ── */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-border flex-shrink-0 bg-surface-hover/30 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
