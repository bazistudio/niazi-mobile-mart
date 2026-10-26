'use client';

/**
 * EditMobileModal.tsx
 *
 * Organization-Admin-only edit form for a USED mobile device record.
 * Landscape, no-scroll, single-viewport layout — all fields visible at once.
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
  Plus,
  Check,
  Pencil,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { mobileApi } from '../services/mobile.api';
import type { MobileFullProfile, PatchMobilePayload, PatchPaperworkPayload, PatchImeiPayload } from '../services/mobile.api';
import { brandService } from '@/features/inventory/services/brand.service';
import type { ProductBrand } from '@/features/inventory/types';

interface EditMobileModalProps {
  deviceId: string;
  branchId?: string;
  onClose: () => void;
  onSaved: () => void;
}

// ─── tiny shared primitives ───────────────────────────────────────────────────
const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors placeholder:text-text-muted';
const selectCls =
  'w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';

const Lbl: React.FC<{ text: string; required?: boolean; hint?: string }> = ({ text, required, hint }) => (
  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-0.5">
    {text}{required && <span className="text-red-500 ml-0.5">*</span>}
    {hint && <span className="normal-case font-normal text-text-muted ml-1">({hint})</span>}
  </label>
);

const SectionHead: React.FC<{ title: string; icon?: React.ReactNode }> = ({ title, icon }) => (
  <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-border">
    {icon && <span className="text-primary">{icon}</span>}
    <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{title}</p>
  </div>
);

const ChkBox: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-1.5 cursor-pointer group py-0.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-3.5 h-3.5 rounded accent-primary flex-shrink-0"
    />
    <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors leading-tight">{label}</span>
  </label>
);

// ─── main component ───────────────────────────────────────────────────────────
export const EditMobileModal: React.FC<EditMobileModalProps> = ({
  deviceId,
  branchId,
  onClose,
  onSaved,
}) => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (!isOrgAdmin) onClose();
  }, [isOrgAdmin, onClose]);

  const [profile, setProfile] = useState<MobileFullProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── form state ───────────────────────────────────────────────────────────
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
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [bodyGrade, setBodyGrade] = useState('');
  const [screenCondition, setScreenCondition] = useState('');
  const [batteryHealth, setBatteryHealth] = useState('');
  const [touchWorking, setTouchWorking] = useState(true);
  const [batteryBackupOk, setBatteryBackupOk] = useState(true);
  const [frontCameraOk, setFrontCameraOk] = useState(true);
  const [backCameraOk, setBackCameraOk] = useState(true);
  const [accessoriesBox, setAccessoriesBox] = useState(false);
  const [accessoriesOriginalCharger, setAccessoriesOriginalCharger] = useState(false);
  const [accessoriesCable, setAccessoriesCable] = useState(false);
  const [accessoriesHandsfree, setAccessoriesHandsfree] = useState(false);
  const [defectNotes, setDefectNotes] = useState('');

  // ── Seller identity state (editable, USED-device paperwork) ─────────────
  const [sellerName, setSellerName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [sellerCnic, setSellerCnic] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');

  // ── IMEI inline-edit state ──────────────────────────────────────────────
  // editingImeiId: the `id` (UUID) of the imei row currently being edited, or null
  const [editingImeiId, setEditingImeiId] = useState<string | null>(null);
  const [imeiDraft, setImeiDraft] = useState('');
  const [imeiSaving, setImeiSaving] = useState(false);
  const [imeiError, setImeiError] = useState<string | null>(null);

  // Brand management
  const [brandsList, setBrandsList] = useState<ProductBrand[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [customBrandInput, setCustomBrandInput] = useState('');
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [editingBrandName, setEditingBrandName] = useState('');

  useEffect(() => {
    let active = true;
    const fetchBrands = async () => {
      try {
        const brands = await brandService.getBrands();
        if (active && Array.isArray(brands) && brands.length > 0) {
          setBrandsList(brands);
          const names = brands.map((b) => b.name.trim()).filter(Boolean);
          setBrandOptions((prev) => Array.from(new Set([...names, ...prev])));
        }
      } catch (err) {
        console.warn('Failed to load brands in EditMobileModal:', err);
      }
    };
    void fetchBrands();
    return () => { active = false; };
  }, []);

  const handleSaveCustomBrand = async () => {
    const trimmed = customBrandInput.trim();
    if (!trimmed || isSavingBrand) return;
    setIsSavingBrand(true); setBrandError(null);
    try {
      const created = await brandService.createBrand({ name: trimmed });
      const createdName = created?.name?.trim() || trimmed;
      setBrandsList((prev) => [...prev.filter((b) => b.id !== created.id), created]);
      setBrandOptions((prev) => Array.from(new Set([createdName, ...prev])));
      setBrand(createdName);
      setCustomBrandInput(''); setIsAddingBrand(false);
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Failed to create brand.');
    } finally { setIsSavingBrand(false); }
  };

  const handleUpdateBrand = async () => {
    const newName = editingBrandName.trim();
    const currentName = brand.trim();
    if (!newName || !currentName || isSavingBrand) return;
    setIsSavingBrand(true); setBrandError(null);
    try {
      const existingBrand = brandsList.find((b) => b.name.toLowerCase() === currentName.toLowerCase());
      if (existingBrand) {
        await brandService.updateBrand(existingBrand.id, { name: newName });
        setBrandsList((prev) => prev.map((b) => (b.id === existingBrand.id ? { ...b, name: newName } : b)));
      } else {
        const created = await brandService.createBrand({ name: newName });
        setBrandsList((prev) => [...prev, created]);
      }
      setBrandOptions((prev) =>
        Array.from(new Set(prev.map((b) => (b.toLowerCase() === currentName.toLowerCase() ? newName : b))))
      );
      setBrand(newName); setIsEditingBrand(false); setEditingBrandName('');
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Failed to update brand.');
    } finally { setIsSavingBrand(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const data = await mobileApi.getMobileFullProfile(deviceId, branchId);
      const p = data.profile;
      setProfile(p);
      setBrand(p.device.brand); setModel(p.device.model); setStorage(p.device.storage);
      setRam(p.device.ram ?? ''); setColor(p.device.color ?? '');
      setSerialNumber(p.device.serial_number ?? '');
      setPtaStatus(p.device.pta_status); setStatus(p.device.status);
      setExpectedSalePrice(p.device.expected_sale_price ? parseFloat(p.device.expected_sale_price).toString() : '');
      setNotes(p.device.notes ?? '');
      if (p.paperwork) {
        setPurchaseDate(p.paperwork.purchase_date ?? '');
        setPurchasePrice(p.paperwork.purchase_price ? parseFloat(p.paperwork.purchase_price).toString() : '');
        // Seller identity — pre-fill from paperwork record
        setSellerName(p.paperwork.seller?.seller_name ?? '');
        setFatherName(p.paperwork.seller?.father_name ?? '');
        setSellerCnic(p.paperwork.seller?.seller_cnic ?? p.paperwork.seller?.seller_cnic_masked ?? '');
        setSellerPhone(p.paperwork.seller?.seller_phone ?? '');
        setSellerAddress(p.paperwork.seller?.seller_address ?? '');
      }
      if (p.inspection) {
        setBodyGrade(p.inspection.body_grade ?? '');
        setScreenCondition(p.inspection.screen_condition ?? '');
        setBatteryHealth(p.inspection.battery_health_percent != null ? String(p.inspection.battery_health_percent) : '');
        setTouchWorking(p.inspection.touch_working ?? true);
        setBatteryBackupOk(p.inspection.battery_backup_ok ?? true);
        setFrontCameraOk(p.inspection.front_camera_ok ?? true);
        setBackCameraOk(p.inspection.back_camera_ok ?? true);
        setAccessoriesBox(p.inspection.accessories_box ?? false);
        setAccessoriesOriginalCharger(p.inspection.accessories_original_charger ?? false);
        setAccessoriesCable(p.inspection.accessories_cable ?? false);
        setAccessoriesHandsfree(p.inspection.accessories_handsfree ?? false);
        setDefectNotes(p.inspection.defect_notes ?? '');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load device');
    } finally { setLoading(false); }
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
    if (!brand.trim() || !model.trim() || !storage.trim()) {
      setSaveError('Brand, Model, and Storage are required.');
      return;
    }
    // Seller field validation
    const origSeller = profile.paperwork?.seller;
    const sellerChanged = isUsed && origSeller && (
      sellerName.trim()    !== (origSeller.seller_name ?? '') ||
      fatherName.trim()    !== (origSeller.father_name ?? '') ||
      sellerPhone.trim()   !== (origSeller.seller_phone ?? '') ||
      sellerAddress.trim() !== (origSeller.seller_address ?? '')
    );
    const cnicChanged = isUsed && origSeller && sellerCnic.trim() !== '' &&
      sellerCnic.replace(/\D/g, '').length === 13;

    if (isUsed && origSeller) {
      if (!sellerName.trim()) { setSaveError('Seller name is required.'); return; }
      if (!fatherName.trim()) { setSaveError("Father's name is required."); return; }
      if (!sellerPhone.trim()) { setSaveError('Seller phone is required.'); return; }
      if (!sellerAddress.trim()) { setSaveError('Seller address is required.'); return; }
      if (sellerCnic.trim()) {
        const digits = sellerCnic.replace(/\D/g, '');
        if (digits.length !== 13) { setSaveError('CNIC must be 13 digits (XXXXX-XXXXXXX-X).'); return; }
      }
    }

    setSaving(true); setSaveError(null);
    try {
      const payload: PatchMobilePayload = {
        branch_id: profile.device.branch_id,
        brand: brand.trim(), model: model.trim(), storage: storage.trim(),
        ram: ram.trim() || null, color: color.trim() || null,
        serial_number: serialNumber.trim() || null,
        pta_status: ptaStatus,
        // Only send status if user actually changed it — prevents 400 when device is SOLD
        ...(status !== profile.device.status ? { status: status as 'IN_STOCK' | 'INSPECTION' } : {}),
        expected_sale_price: expectedSalePrice ? parseFloat(expectedSalePrice) : null,
        notes: notes.trim() || null,
        ...(profile.device.condition === 'USED' && purchaseDate ? { purchase_date: purchaseDate } : {}),
        ...(profile.device.condition === 'USED' && purchasePrice ? { purchase_price: parseFloat(purchasePrice) } : {}),
        ...(bodyGrade ? { body_grade: bodyGrade } : {}),
        ...(screenCondition ? { screen_condition: screenCondition } : {}),
        ...(batteryHealth !== '' ? { battery_health_percent: batteryHealth ? parseFloat(batteryHealth) : null } : {}),
        ...(profile.device.condition === 'USED' ? {
          touch_working: touchWorking, battery_backup_ok: batteryBackupOk,
          front_camera_ok: frontCameraOk, back_camera_ok: backCameraOk,
          accessories_box: accessoriesBox, accessories_original_charger: accessoriesOriginalCharger,
          accessories_cable: accessoriesCable, accessories_handsfree: accessoriesHandsfree,
        } : {}),
        defect_notes: defectNotes.trim() || null,
      };
      await mobileApi.patchMobile(deviceId, payload);

      // Patch seller identity if device is USED and has paperwork
      if (isUsed && profile.paperwork && (sellerChanged || cnicChanged)) {
        const pwPayload: PatchPaperworkPayload = {
          branch_id: profile.device.branch_id,
          ...(sellerName.trim() ? { seller_name: sellerName.trim() } : {}),
          ...(fatherName.trim() ? { father_name: fatherName.trim() } : {}),
          ...(sellerPhone.trim() ? { seller_phone: sellerPhone.trim() } : {}),
          ...(sellerAddress.trim() ? { seller_address: sellerAddress.trim() } : {}),
          ...(cnicChanged ? { seller_cnic: sellerCnic.replace(/[^0-9]/g, '').replace(/(\d{5})(\d{7})(\d{1})/, '$1-$2-$3') } : {}),
        };
        await mobileApi.patchPaperwork(deviceId, pwPayload);
      }

      onSaved(); onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(
        msg.includes('403') || msg.toLowerCase().includes('forbidden')
          ? 'You do not have permission to edit this record.'
          : msg
      );
    } finally { setSaving(false); }
  };

  if (!isOrgAdmin) return null;

  const isUsed = profile?.device.condition === 'USED';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit mobile device"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-neutral-900/70 backdrop-blur-sm p-2"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Landscape container: wider, no-scroll, viewport-filling ── */}
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
              <h2 className="text-sm font-bold text-text-primary leading-tight">Edit Mobile Record</h2>
              <p className="text-[10px] text-text-muted">Organization Admin · {isUsed ? 'USED' : 'NEW'} device · All changes are logged</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
            <p className="text-xs text-text-muted">Loading record…</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-xs text-text-secondary text-center">{loadError}</p>
            <button type="button" onClick={() => void load()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
              Retry
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="flex flex-col flex-1 overflow-hidden">

            {/* ── Three-column content area ── */}
            <div className="flex flex-1 overflow-hidden">

              {/* ══════════════════════════════════════════
                  COL 1 — Device Specifications  (30%)
              ══════════════════════════════════════════ */}
              <div className="flex flex-col gap-2.5 p-5 overflow-hidden border-r border-border" style={{ width: '30%' }}>
                <SectionHead title="Device Specifications" />

                {/* Brand */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <Lbl text="Brand" required />
                    <div className="flex items-center gap-2">
                      {brand && !isEditingBrand && (
                        <button type="button"
                          onClick={() => { setIsEditingBrand(true); setEditingBrandName(brand); setBrandError(null); }}
                          className="inline-flex items-center gap-0.5 text-[10px] text-text-muted hover:text-primary transition-colors cursor-pointer">
                          <Pencil className="w-2.5 h-2.5" /><span>Edit</span>
                        </button>
                      )}
                      {!isAddingBrand ? (
                        <button type="button"
                          onClick={() => { setIsAddingBrand(true); setIsEditingBrand(false); setBrandError(null); }}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer">
                          <Plus className="w-2.5 h-2.5" /><span>Add</span>
                        </button>
                      ) : (
                        <button type="button"
                          onClick={() => { setIsAddingBrand(false); setCustomBrandInput(''); setBrandError(null); }}
                          className="inline-flex items-center gap-0.5 text-[10px] text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                          <X className="w-2.5 h-2.5" /><span>Cancel</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditingBrand ? (
                    <div className="flex gap-1">
                      <input type="text" placeholder="Updated brand name" autoFocus disabled={isSavingBrand}
                        value={editingBrandName} onChange={(e) => setEditingBrandName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleUpdateBrand(); } else if (e.key === 'Escape') { setIsEditingBrand(false); setEditingBrandName(''); setBrandError(null); } }}
                        className={inputCls} />
                      <button type="button" onClick={() => void handleUpdateBrand()}
                        disabled={!editingBrandName.trim() || isSavingBrand}
                        className="px-2 py-1 bg-primary text-white text-[10px] font-semibold rounded-md hover:bg-primary-hover disabled:opacity-50 shrink-0 flex items-center gap-0.5 cursor-pointer">
                        {isSavingBrand ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button type="button"
                        onClick={() => { setIsEditingBrand(false); setEditingBrandName(''); setBrandError(null); }}
                        className="px-2 py-1 text-[10px] text-text-muted hover:text-text-primary border border-border rounded-md hover:bg-surface-hover cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : isAddingBrand ? (
                    <div className="flex gap-1">
                      <input type="text" placeholder="e.g. Itel, Infinix" autoFocus disabled={isSavingBrand}
                        value={customBrandInput} onChange={(e) => setCustomBrandInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSaveCustomBrand(); } else if (e.key === 'Escape') { setIsAddingBrand(false); setCustomBrandInput(''); setBrandError(null); } }}
                        className={inputCls} />
                      <button type="button" onClick={() => void handleSaveCustomBrand()}
                        disabled={!customBrandInput.trim() || isSavingBrand}
                        className="px-2 py-1 bg-primary text-white text-[10px] font-semibold rounded-md hover:bg-primary-hover disabled:opacity-50 shrink-0 flex items-center gap-0.5 cursor-pointer">
                        {isSavingBrand ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>{isSavingBrand ? '…' : 'Save'}</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <input type="text" list="edit-mobile-brands-list" value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className={inputCls} placeholder="e.g. Samsung" required />
                      <datalist id="edit-mobile-brands-list">
                        {brandOptions.map((b) => <option key={b} value={b} />)}
                      </datalist>
                    </>
                  )}
                  {brandError && <p className="text-[10px] text-red-500 mt-0.5">{brandError}</p>}
                </div>

                {/* Model */}
                <div>
                  <Lbl text="Model" required />
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
                    className={inputCls} placeholder="e.g. Galaxy A55" required />
                </div>

                {/* Storage + RAM */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Lbl text="Storage" required />
                    <input type="text" value={storage} onChange={(e) => setStorage(e.target.value)}
                      className={inputCls} placeholder="128GB" required />
                  </div>
                  <div>
                    <Lbl text="RAM" />
                    <input type="text" value={ram} onChange={(e) => setRam(e.target.value)}
                      className={inputCls} placeholder="8GB" />
                  </div>
                </div>

                {/* Color + HW Serial */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Lbl text="Color" />
                    <input type="text" value={color} onChange={(e) => setColor(e.target.value)}
                      className={inputCls} placeholder="e.g. Blue" />
                  </div>
                  <div>
                    <Lbl text="HW Serial" />
                    <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)}
                      className={inputCls} placeholder="Optional" />
                  </div>
                </div>

                {/* PTA + Inv Status */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Lbl text="PTA Status" />
                    <select value={ptaStatus} onChange={(e) => setPtaStatus(e.target.value)} className={selectCls}>
                      <option value="PTA_APPROVED">PTA Approved</option>
                      <option value="NON_PTA">Non-PTA</option>
                      <option value="JV">JV</option>
                      <option value="GEVEY">Gevey</option>
                    </select>
                  </div>
                  <div>
                    <Lbl text="Inv. Status" />
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={selectCls}
                      disabled={profile?.device.status === 'SOLD'}
                    >
                      {profile?.device.status === 'SOLD' && (
                        <option value="SOLD">Sold</option>
                      )}
                      <option value="IN_STOCK">In Stock</option>
                      <option value="INSPECTION">Inspection</option>
                    </select>
                    {profile?.device.status === 'SOLD' && (
                      <p className="text-[9px] text-text-muted mt-0.5">Status locked — assigned during sale</p>
                    )}
                  </div>
                </div>

                {/* Expected Sale Price */}
                <div>
                  <Lbl text="Expected Sale Price (Rs.)" />
                  <input type="number" min="0" step="1" value={expectedSalePrice}
                    onChange={(e) => setExpectedSalePrice(e.target.value)}
                    className={inputCls} placeholder="Optional" />
                </div>

                {/* Device Notes — flex-1 fills remaining space */}
                <div className="flex flex-col flex-1 min-h-0">
                  <Lbl text="Device Notes" />
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                    className={`${inputCls} resize-none flex-1`}
                    style={{ minHeight: '4rem' }}
                    placeholder="Optional internal notes" />
                </div>
              </div>

              {/* ══════════════════════════════════════════
                  COL 2 — Physical Inspection  (38%)
              ══════════════════════════════════════════ */}
              <div className="flex flex-col gap-2.5 p-5 overflow-hidden border-r border-border" style={{ width: '38%' }}>
                <SectionHead title="Physical Inspection" />

                {/* Body Grade + Screen + Battery % */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <Lbl text="Body Grade" />
                    <select value={bodyGrade} onChange={(e) => setBodyGrade(e.target.value)} className={selectCls}>
                      <option value="">— unchanged —</option>
                      <option value="PRISTINE">Pristine</option>
                      <option value="GOOD">Good</option>
                      <option value="HEAVY_WEAR">Heavy Wear</option>
                      <option value="DENTED">Dented</option>
                    </select>
                  </div>
                  <div>
                    <Lbl text="Screen" />
                    <select value={screenCondition} onChange={(e) => setScreenCondition(e.target.value)} className={selectCls}>
                      <option value="">— unchanged —</option>
                      <option value="ORIGINAL">Original</option>
                      <option value="REPLACED">Replaced</option>
                      <option value="CRACKED">Cracked</option>
                    </select>
                  </div>
                  <div>
                    <Lbl text="Battery %" />
                    <input type="number" min="1" max="100" step="1" value={batteryHealth}
                      onChange={(e) => setBatteryHealth(e.target.value)}
                      className={inputCls} placeholder="e.g. 85" />
                  </div>
                </div>

                {/* Functional Checks */}
                <div className="bg-surface-hover/40 rounded-xl p-3 border border-border/60">
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Functional Checks</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <ChkBox label="Touch Screen OK" checked={touchWorking} onChange={setTouchWorking} />
                    <ChkBox label="Battery Backup OK" checked={batteryBackupOk} onChange={setBatteryBackupOk} />
                    <ChkBox label="Front Camera OK" checked={frontCameraOk} onChange={setFrontCameraOk} />
                    <ChkBox label="Back Camera OK" checked={backCameraOk} onChange={setBackCameraOk} />
                  </div>
                </div>

                {/* Accessories */}
                <div className="bg-surface-hover/40 rounded-xl p-3 border border-border/60">
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Accessories Included</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <ChkBox label="Original Box" checked={accessoriesBox} onChange={setAccessoriesBox} />
                    <ChkBox label="Original Charger" checked={accessoriesOriginalCharger} onChange={setAccessoriesOriginalCharger} />
                    <ChkBox label="Cable" checked={accessoriesCable} onChange={setAccessoriesCable} />
                    <ChkBox label="Handsfree" checked={accessoriesHandsfree} onChange={setAccessoriesHandsfree} />
                  </div>
                </div>

                {/* Defect Notes — flex-1 fills remaining space */}
                <div className="flex flex-col flex-1 min-h-0">
                  <Lbl text="Defect / Cosmetic Notes" />
                  <textarea value={defectNotes} onChange={(e) => setDefectNotes(e.target.value)}
                    className={`${inputCls} resize-none flex-1`}
                    style={{ minHeight: '5rem' }}
                    placeholder="Describe any defects, scratches, or issues in detail…" />
                </div>
              </div>

              {/* ══════════════════════════════════════════
                  COL 3 — Paperwork + Identity  (flex-1 = 32%)
              ══════════════════════════════════════════ */}
              <div className="flex flex-col gap-2.5 p-5 flex-1 overflow-hidden">

                {/* Purchase Paperwork (USED only) */}
                {isUsed && profile?.paperwork && (
                  <>
                    <SectionHead title="Purchase Paperwork" />
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <Lbl text="Purchase Date" />
                        <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)}
                          className={inputCls} />
                      </div>
                      <div>
                        <Lbl text="Purchase Price (Rs.)" hint="paid" />
                        <input type="number" min="0" step="1" value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          className={inputCls} placeholder="Optional" />
                      </div>
                    </div>
                  </>
                )}

                {/* Seller Information — editable for USED devices */}
                {isUsed && profile?.paperwork && (
                  <>
                    <SectionHead title="Seller Information" />

                    {/* Seller Name + Father Name */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <Lbl text="Seller Name" required />
                        <input
                          type="text"
                          value={sellerName}
                          onChange={(e) => setSellerName(e.target.value)}
                          className={inputCls}
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <Lbl text="Father Name" required />
                        <input
                          type="text"
                          value={fatherName}
                          onChange={(e) => setFatherName(e.target.value)}
                          className={inputCls}
                          placeholder="Father's full name"
                        />
                      </div>
                    </div>

                    {/* CNIC + Phone */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <Lbl text="CNIC" hint="XXXXX-XXXXXXX-X" />
                        <input
                          type="text"
                          value={sellerCnic}
                          onChange={(e) => {
                            // Auto-format as user types: XXXXX-XXXXXXX-X
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 13);
                            let fmt = raw;
                            if (raw.length > 5) fmt = raw.slice(0, 5) + '-' + raw.slice(5);
                            if (raw.length > 12) fmt = raw.slice(0, 5) + '-' + raw.slice(5, 12) + '-' + raw.slice(12);
                            setSellerCnic(fmt);
                          }}
                          className={inputCls}
                          placeholder="35201-1234567-8"
                          maxLength={15}
                        />
                      </div>
                      <div>
                        <Lbl text="Mobile No" required />
                        <input
                          type="tel"
                          value={sellerPhone}
                          onChange={(e) => setSellerPhone(e.target.value)}
                          className={inputCls}
                          placeholder="03XX-XXXXXXX"
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <Lbl text="Seller Address" required />
                      <input
                        type="text"
                        value={sellerAddress}
                        onChange={(e) => setSellerAddress(e.target.value)}
                        className={inputCls}
                        placeholder="Street / Area / City"
                      />
                    </div>
                  </>
                )}

                {/* Device Identity — IMEIs editable by Org Admin; Voucher No immutable */}
                <SectionHead title="Device Identity" />
                <div className="bg-surface-hover/50 rounded-xl border border-border/60 overflow-hidden">
                  {profile && (
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr className="border-b border-border/40">
                          <td className="px-3 py-2 text-text-muted font-medium w-[38%]">Condition</td>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              profile.device.condition === 'USED'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                            }`}>
                              {profile.device.condition}
                            </span>
                          </td>
                        </tr>

                        {/* IMEI rows — each shows pencil to open inline editor */}
                        {(['IMEI1', 'IMEI2'] as const).map((slot) => {
                          const imeiRow = profile.device.imeis?.find(i => i.slot === slot);
                          if (!imeiRow) return null;
                          const isEditing = editingImeiId === imeiRow.id;
                          return (
                            <tr key={slot} className="border-b border-border/40">
                              <td className="px-3 py-2 text-text-muted font-medium align-middle">
                                {slot === 'IMEI1' ? 'IMEI 1' : 'IMEI 2'}
                              </td>
                              <td className="px-3 py-1.5">
                                {isEditing ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex gap-1 items-center">
                                      <input
                                        type="text"
                                        value={imeiDraft}
                                        onChange={(e) => {
                                          setImeiDraft(e.target.value.replace(/\D/g, '').slice(0, 15));
                                          setImeiError(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') {
                                            setEditingImeiId(null);
                                            setImeiDraft('');
                                            setImeiError(null);
                                          }
                                        }}
                                        disabled={imeiSaving}
                                        maxLength={15}
                                        autoFocus
                                        className="flex-1 px-2 py-1 text-[11px] font-mono bg-surface border border-primary/50 rounded focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                                        placeholder="15 digits"
                                      />
                                      {/* Save button */}
                                      <button
                                        type="button"
                                        disabled={imeiSaving || imeiDraft.length !== 15}
                                        onClick={async () => {
                                          if (!profile || imeiSaving) return;
                                          if (imeiDraft === imeiRow.imei) {
                                            setEditingImeiId(null);
                                            setImeiDraft('');
                                            return;
                                          }
                                          setImeiSaving(true);
                                          setImeiError(null);
                                          try {
                                            const payload: PatchImeiPayload = {
                                              branch_id: profile.device.branch_id,
                                              imei_id: imeiRow.id,
                                              new_imei: imeiDraft,
                                            };
                                            await mobileApi.patchImei(deviceId, payload);
                                            // Reload profile so table reflects new IMEI
                                            await load();
                                            setEditingImeiId(null);
                                            setImeiDraft('');
                                          } catch (err) {
                                            const msg = err instanceof Error ? err.message : 'Failed to update IMEI';
                                            setImeiError(
                                              msg.includes('409') || msg.toLowerCase().includes('already registered')
                                                ? 'This IMEI is already registered in the organization.'
                                                : msg
                                            );
                                          } finally {
                                            setImeiSaving(false);
                                          }
                                        }}
                                        className="p-1 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40 flex-shrink-0"
                                        aria-label="Save IMEI"
                                      >
                                        {imeiSaving
                                          ? <Loader2 className="w-3 h-3 animate-spin" />
                                          : <Check className="w-3 h-3" />}
                                      </button>
                                      {/* Cancel button */}
                                      <button
                                        type="button"
                                        disabled={imeiSaving}
                                        onClick={() => { setEditingImeiId(null); setImeiDraft(''); setImeiError(null); }}
                                        className="p-1 text-text-muted hover:text-text-primary border border-border rounded hover:bg-surface-hover disabled:opacity-40 flex-shrink-0"
                                        aria-label="Cancel IMEI edit"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                    {imeiError && (
                                      <p className="text-[10px] text-red-500 leading-tight">{imeiError}</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 group">
                                    <span className="font-mono text-text-primary text-[10px]">{imeiRow.imei}</span>
                                    {/* Pencil — only shown if no other IMEI row is currently being edited */}
                                    {editingImeiId === null && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingImeiId(imeiRow.id);
                                          setImeiDraft(imeiRow.imei);
                                          setImeiError(null);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-primary transition-opacity rounded"
                                        aria-label={`Edit ${slot}`}
                                        title={`Correct ${slot} number`}
                                      >
                                        <Pencil className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Voucher No — permanently immutable */}
                        {profile.paperwork?.voucher_no && (
                          <tr>
                            <td className="px-3 py-2 text-text-muted font-medium">
                              Voucher No
                              <span className="block text-[9px] text-text-muted/70 font-normal leading-tight">immutable</span>
                            </td>
                            <td className="px-3 py-2 text-text-primary font-semibold">
                              {profile.paperwork.voucher_no}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Spacer pushes error to bottom */}
                <div className="flex-1" />

                {/* Save Error */}
                {saveError && (
                  <div className="flex items-start gap-1.5 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700 dark:text-red-400 text-[11px]">{saveError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-border bg-surface-hover/30 flex-shrink-0 rounded-b-2xl">
              <p className="text-[10px] text-text-muted">
                Fields marked <span className="text-red-500">*</span> are required
              </p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={onClose} disabled={saving}
                  className="px-4 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-1.5 px-6 py-2 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm">
                  {saving ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                  ) : (
                    <><Save className="w-3.5 h-3.5" />Save Changes</>
                  )}
                </button>
              </div>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};
