'use client';

/**
 * EditMobileModal.tsx
 *
 * Organization-Admin-only edit form for a USED mobile device record.
 * Allows editing device specs, inspection grades, and purchase paperwork.
 * Immutable: device ID, IMEIs, seller identity, branch, condition, organization.
 *
 * Security: Backend independently validates every update. The UI gate
 * (isOrgAdmin) is a UX convenience only — never the security boundary.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Save,
  Loader2,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { mobileApi } from '../services/mobile.api';
import type { MobileFullProfile, PatchMobilePayload } from '../services/mobile.api';

interface EditMobileModalProps {
  deviceId: string;
  branchId?: string;
  onClose: () => void;
  onSaved: () => void; // called after successful save so caller can refresh
}

// ─── field components ────────────────────────────────────────────────────────
const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, required, children, hint }) => (
  <div className="space-y-1">
    <label className="block text-xs font-medium text-text-secondary">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
  </div>
);

const inputCls =
  'w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors placeholder:text-text-muted';
const selectCls =
  'w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';

// ─── main component ───────────────────────────────────────────────────────────
export const EditMobileModal: React.FC<EditMobileModalProps> = ({
  deviceId,
  branchId,
  onClose,
  onSaved,
}) => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';

  // Redirect non-admins immediately — backend enforces this too
  useEffect(() => {
    if (!isOrgAdmin) onClose();
  }, [isOrgAdmin, onClose]);

  const [profile, setProfile] = useState<MobileFullProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── form fields ──────────────────────────────────────────────────────────
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [ram, setRam] = useState('');
  const [color, setColor] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [ptaStatus, setPtaStatus] = useState('');
  const [status, setStatus] = useState('');
  const [expectedSalePrice, setExpectedSalePrice] = useState('');
  const [notes, setNotes] = useState('');
  // Paperwork
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  // Inspection
  const [bodyGrade, setBodyGrade] = useState('');
  const [screenCondition, setScreenCondition] = useState('');
  const [batteryHealth, setBatteryHealth] = useState('');
  const [defectNotes, setDefectNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await mobileApi.getMobileFullProfile(deviceId, branchId);
      const p = data.profile;
      setProfile(p);
      // Populate form
      setBrand(p.device.brand);
      setModel(p.device.model);
      setStorage(p.device.storage);
      setRam(p.device.ram ?? '');
      setColor(p.device.color ?? '');
      setSerialNumber(p.device.serial_number ?? '');
      setPtaStatus(p.device.pta_status);
      setStatus(p.device.status);
      setExpectedSalePrice(p.device.expected_sale_price ? parseFloat(p.device.expected_sale_price).toString() : '');
      setNotes(p.device.notes ?? '');
      if (p.paperwork) {
        setPurchaseDate(p.paperwork.purchase_date ?? '');
        setPurchasePrice(p.paperwork.purchase_price ? parseFloat(p.paperwork.purchase_price).toString() : '');
      }
      if (p.inspection) {
        setBodyGrade(p.inspection.body_grade ?? '');
        setScreenCondition(p.inspection.screen_condition ?? '');
        setBatteryHealth(p.inspection.battery_health_percent != null ? String(p.inspection.battery_health_percent) : '');
        setDefectNotes(p.inspection.defect_notes ?? '');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load device');
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || saving) return;

    // Basic validation
    if (!brand.trim() || !model.trim() || !storage.trim()) {
      setSaveError('Brand, Model, and Storage are required.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const payload: PatchMobilePayload = {
        branch_id: profile.device.branch_id,
        // Device fields
        brand: brand.trim(),
        model: model.trim(),
        storage: storage.trim(),
        ram: ram.trim() || null,
        color: color.trim() || null,
        serial_number: serialNumber.trim() || null,
        pta_status: ptaStatus,
        status: status as 'IN_STOCK' | 'INSPECTION',
        expected_sale_price: expectedSalePrice ? parseFloat(expectedSalePrice) : null,
        notes: notes.trim() || null,
        // Paperwork (USED only)
        ...(profile.device.condition === 'USED' && purchaseDate ? { purchase_date: purchaseDate } : {}),
        ...(profile.device.condition === 'USED' && purchasePrice ? { purchase_price: parseFloat(purchasePrice) } : {}),
        // Inspection
        ...(bodyGrade ? { body_grade: bodyGrade } : {}),
        ...(screenCondition ? { screen_condition: screenCondition } : {}),
        ...(batteryHealth !== '' ? { battery_health_percent: batteryHealth ? parseFloat(batteryHealth) : null } : {}),
        defect_notes: defectNotes.trim() || null,
      };

      await mobileApi.patchMobile(deviceId, payload);
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(
        msg.includes('403') || msg.toLowerCase().includes('forbidden')
          ? 'You do not have permission to edit this record.'
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOrgAdmin) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit mobile device"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-border overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-text-primary">Edit Mobile Record</h2>
              <p className="text-xs text-text-muted">Organization Admin — USED device fields</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-text-muted">Loading record…</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
            <p className="text-sm text-text-secondary text-center">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Device specs */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3 pb-1.5 border-b border-border">Device Specifications</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Brand" required>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Samsung"
                      required
                    />
                  </Field>
                  <Field label="Model" required>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Galaxy A55"
                      required
                    />
                  </Field>
                  <Field label="Storage" required>
                    <input
                      type="text"
                      value={storage}
                      onChange={(e) => setStorage(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 128GB"
                      required
                    />
                  </Field>
                  <Field label="RAM">
                    <input
                      type="text"
                      value={ram}
                      onChange={(e) => setRam(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 8GB"
                    />
                  </Field>
                  <Field label="Color">
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Midnight Blue"
                    />
                  </Field>
                  <Field label="Hardware Serial" hint="Physical manufacturer serial — not voucher number">
                    <input
                      type="text"
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      className={inputCls}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="PTA Status">
                    <select value={ptaStatus} onChange={(e) => setPtaStatus(e.target.value)} className={selectCls}>
                      <option value="PTA_APPROVED">PTA Approved</option>
                      <option value="NON_PTA">Non-PTA</option>
                      <option value="JV">JV (Carrier Locked)</option>
                      <option value="GEVEY">Gevey</option>
                    </select>
                  </Field>
                  <Field label="Inventory Status">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                      <option value="IN_STOCK">In Stock</option>
                      <option value="INSPECTION">Inspection</option>
                    </select>
                  </Field>
                  <Field label="Expected Sale Price (Rs.)">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={expectedSalePrice}
                      onChange={(e) => setExpectedSalePrice(e.target.value)}
                      className={inputCls}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Device Notes">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={`${inputCls} resize-none`}
                      rows={2}
                      placeholder="Optional internal notes"
                    />
                  </Field>
                </div>
              </div>

              {/* Purchase paperwork (USED only) */}
              {profile?.device.condition === 'USED' && profile.paperwork && (
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3 pb-1.5 border-b border-border">Purchase Paperwork</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Purchase Date" hint="Date the device was purchased from seller">
                      <input
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Purchase Price (Rs.)" hint="Amount paid to the seller">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(e.target.value)}
                        className={inputCls}
                        placeholder="Optional"
                      />
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    Voucher Sr No, seller identity, IMEI, and organization are immutable and cannot be changed here.
                  </p>
                </div>
              )}

              {/* Inspection */}
              {profile?.device.condition === 'USED' && (
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3 pb-1.5 border-b border-border">Physical Inspection</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="Body Grade">
                      <select value={bodyGrade} onChange={(e) => setBodyGrade(e.target.value)} className={selectCls}>
                        <option value="">— unchanged —</option>
                        <option value="PRISTINE">Pristine</option>
                        <option value="GOOD">Good</option>
                        <option value="HEAVY_WEAR">Heavy Wear</option>
                        <option value="DENTED">Dented</option>
                      </select>
                    </Field>
                    <Field label="Screen Condition">
                      <select value={screenCondition} onChange={(e) => setScreenCondition(e.target.value)} className={selectCls}>
                        <option value="">— unchanged —</option>
                        <option value="ORIGINAL">Original</option>
                        <option value="REPLACED">Replaced</option>
                        <option value="CRACKED">Cracked</option>
                      </select>
                    </Field>
                    <Field label="Battery Health (%)">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={batteryHealth}
                        onChange={(e) => setBatteryHealth(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. 85"
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Defect Notes">
                      <textarea
                        value={defectNotes}
                        onChange={(e) => setDefectNotes(e.target.value)}
                        className={`${inputCls} resize-none`}
                        rows={3}
                        placeholder="Describe any defects, scratches, or issues…"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* Save error */}
              {saveError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 dark:text-red-400">{saveError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-hover/40 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
