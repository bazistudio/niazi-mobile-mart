'use client';

import React, { useState, useCallback, useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  ArrowLeft,
  ShieldCheck,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Info,
  DollarSign,
  Layers,
  Wrench,
  Check,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  Search,
  Store,
} from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { mobileApi, transformFormDataToApiPayload } from '../services/mobile.api';
import type { SellerSearchResult } from '../services/mobile.api';
import { supplierApi } from '@/services/supplier.api';
import type { FrontendSupplier } from '@/services/supplier.api';
import type {
  MobileCondition,
  PtaStatus,
  PhysicalBodyGrade,
  ScreenCondition,
  MobileFormData,
} from '../types/mobile.types';

const INITIAL_FORM_DATA: MobileFormData = {
  condition: 'USED',
  specs: {
    brand: '',
    model: '',
    storage: '128GB',
    ram: '8GB',
    color: '',
    imei1: '',
    imei2: '',
    serialNumber: '',
    ptaStatus: 'PTA_APPROVED',
    expectedSalePrice: 0,
    costPrice: 0,
    notes: '',
  },
  paperwork: {
    voucherNo: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: 0,
    sellerName: '',
    fatherName: '',
    sellerCnic: '',
    sellerPhone: '',
    sellerAddress: '',
    sellerId: null as string | null,   // Phase 2: optional registry link
    ownershipDeclarationAcknowledged: false,
    physicalAffidavitAcknowledged: false,
  },
  inspection: {
    bodyGrade: 'GOOD',
    screenCondition: 'ORIGINAL',
    touchWorking: true,
    batteryHealthPercent: 88,
    batteryBackupOk: true,
    frontCameraOk: true,
    backCameraOk: true,
    speakerOk: true,
    microphoneOk: true,
    chargingPortOk: true,
    buttonsOk: true,
    biometricsOk: true,
    wifiBluetoothOk: true,
    simNetworkOk: true,
    accessories: {
      box: true,
      originalCharger: false,
      cable: true,
      handsfree: false,
    },
    defectNotes: '',
  },
};

const POPULAR_BRANDS = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'Vivo',
  'Oppo',
  'Realme',
  'Infinix',
  'Tecno',
  'Google',
  'OnePlus',
];

const DEFAULT_STORAGE_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'];
const DEFAULT_RAM_OPTIONS = ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB'];
const STORAGE_CUSTOM_KEY = 'niazi_custom_mobile_storage_options';
const RAM_CUSTOM_KEY = 'niazi_custom_mobile_ram_options';

export const AddMobileForm: React.FC = () => {
  const navigate = useNavigate();
  const formId = useId();
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);
  const branchId = activeShopId || activeShop?._id || activeShop?.id || undefined;

  const [formData, setFormData] = useState<MobileFormData>(INITIAL_FORM_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Real-time IMEI check state
  const [imeiCheckStatus, setImeiCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [imeiCheckMessage, setImeiCheckMessage] = useState<string | null>(null);

  // Storage and RAM state initialized with defaults + custom persisted items from localStorage
  const [storageOptions, setStorageOptions] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
      if (raw) {
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          return Array.from(new Set([...DEFAULT_STORAGE_OPTIONS, ...custom]));
        }
      }
    } catch (err) {
      console.error('Failed to load custom storage options from localStorage', err);
    }
    return DEFAULT_STORAGE_OPTIONS;
  });

  const [ramOptions, setRamOptions] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RAM_CUSTOM_KEY);
      if (raw) {
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          return Array.from(new Set([...DEFAULT_RAM_OPTIONS, ...custom]));
        }
      }
    } catch (err) {
      console.error('Failed to load custom RAM options from localStorage', err);
    }
    return DEFAULT_RAM_OPTIONS;
  });

  const [isAddingStorage, setIsAddingStorage] = useState(false);
  const [customStorageInput, setCustomStorageInput] = useState('');
  const [isAddingRam, setIsAddingRam] = useState(false);
  const [customRamInput, setCustomRamInput] = useState('');

  // Supplier selection state (NEW mobiles only)
  const [selectedSupplier, setSelectedSupplier] = useState<FrontendSupplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<FrontendSupplier[]>([]);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [isQuickAddingSupplier, setIsQuickAddingSupplier] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [supplierAddError, setSupplierAddError] = useState<string | null>(null);
  const supplierSearchRef = useRef<HTMLDivElement>(null);

  // Used-seller search state (USED mobiles only)
  const [sellerQuery, setSellerQuery] = useState('');
  const [sellerSuggestions, setSellerSuggestions] = useState<SellerSearchResult[]>([]);
  const [isSearchingSellers, setIsSearchingSellers] = useState(false);
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);
  const [isRegisteringSeller, setIsRegisteringSeller] = useState(false);
  const [registerSellerError, setRegisterSellerError] = useState<string | null>(null);
  const sellerSearchRef = useRef<HTMLDivElement>(null);

  // Save new custom internal storage spec
  const handleSaveCustomStorage = () => {
    const trimmed = customStorageInput.trim();
    if (!trimmed) return;

    const formatted = trimmed.toUpperCase().replace(/\s+/g, '');
    if (!storageOptions.includes(formatted)) {
      const updated = [...storageOptions, formatted];
      setStorageOptions(updated);

      try {
        const customOnly = updated.filter((item) => !DEFAULT_STORAGE_OPTIONS.includes(item));
        localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(customOnly));
      } catch (err) {
        console.error('Failed to persist custom storage', err);
      }
    }

    setFormData((prev) => ({
      ...prev,
      specs: { ...prev.specs, storage: formatted },
    }));

    setCustomStorageInput('');
    setIsAddingStorage(false);
  };

  // Save new custom RAM spec
  const handleSaveCustomRam = () => {
    const trimmed = customRamInput.trim();
    if (!trimmed) return;

    const formatted = trimmed.toUpperCase().replace(/\s+/g, '');
    if (!ramOptions.includes(formatted)) {
      const updated = [...ramOptions, formatted];
      setRamOptions(updated);

      try {
        const customOnly = updated.filter((item) => !DEFAULT_RAM_OPTIONS.includes(item));
        localStorage.setItem(RAM_CUSTOM_KEY, JSON.stringify(customOnly));
      } catch (err) {
        console.error('Failed to persist custom RAM', err);
      }
    }

    setFormData((prev) => ({
      ...prev,
      specs: { ...prev.specs, ram: formatted },
    }));

    setCustomRamInput('');
    setIsAddingRam(false);
  };

  // Helper to format CNIC as XXXXX-XXXXXXX-X
  const handleCnicChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 13);
    let formatted = digits;
    if (digits.length > 5 && digits.length <= 12) {
      formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    } else if (digits.length > 12) {
      formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
    }
    setFormData((prev) => ({
      ...prev,
      paperwork: {
        ...prev.paperwork,
        sellerCnic: formatted,
      },
    }));
  };

  // Helper to keep cost price synchronized between specs and paperwork
  const handleCostPriceChange = (val: number) => {
    setFormData((prev) => ({
      ...prev,
      specs: { ...prev.specs, costPrice: val },
      paperwork: { ...prev.paperwork, purchasePrice: val },
    }));
  };

  const condition = formData.condition;
  const isUsed = condition === 'USED';

  // Derived presentation values
  const cost = isUsed ? formData.paperwork.purchasePrice : formData.specs.costPrice;
  const sale = formData.specs.expectedSalePrice;
  const margin = sale > 0 && cost > 0 ? sale - cost : 0;
  const marginPercent = cost > 0 && margin !== 0 ? Math.round((margin / cost) * 100) : 0;

  // Real-time IMEI verification
  const handleImei1Change = async (val: string) => {
    setFormData((prev) => ({
      ...prev,
      specs: { ...prev.specs, imei1: val },
    }));

    if (val.length === 15) {
      setImeiCheckStatus('checking');
      setImeiCheckMessage(null);
      try {
        const res = await mobileApi.checkImeiAvailability(val);
        if (res.available) {
          setImeiCheckStatus('available');
          setImeiCheckMessage('IMEI is available for registration');
        } else {
          setImeiCheckStatus('taken');
          setImeiCheckMessage('IMEI is already registered in the system');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not check IMEI availability';
        setImeiCheckStatus('idle');
        setImeiCheckMessage(msg);
      }
    } else {
      setImeiCheckStatus('idle');
      setImeiCheckMessage(null);
    }
  };

  // Supplier search handler (debounced via useEffect)
  const handleSupplierSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSupplierResults([]);
      return;
    }
    setIsSearchingSupplier(true);
    try {
      const res = await supplierApi.searchSuppliers(query.trim());
      if (res.success && Array.isArray(res.data)) {
        setSupplierResults(res.data.filter((s) => s.is_active));
      } else {
        setSupplierResults([]);
      }
    } catch {
      setSupplierResults([]);
    } finally {
      setIsSearchingSupplier(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSupplierSearch(supplierSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [supplierSearch, handleSupplierSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (supplierSearchRef.current && !supplierSearchRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Seller search for USED mobiles
  const handleSellerSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSellerSuggestions([]);
      return;
    }
    setIsSearchingSellers(true);
    try {
      const res = await mobileApi.searchSellers(query.trim());
      if (res.success && Array.isArray(res.sellers)) {
        setSellerSuggestions(res.sellers);
      } else {
        setSellerSuggestions([]);
      }
    } catch {
      setSellerSuggestions([]);
    } finally {
      setIsSearchingSellers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSellerSearch(sellerQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [sellerQuery, handleSellerSearch]);

  // Close seller dropdown when clicking outside
  useEffect(() => {
    const handleClickOutsideSeller = (e: MouseEvent) => {
      if (sellerSearchRef.current && !sellerSearchRef.current.contains(e.target as Node)) {
        setShowSellerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideSeller);
    return () => document.removeEventListener('mousedown', handleClickOutsideSeller);
  }, []);

  const handleAutofillSeller = (s: SellerSearchResult) => {
    setFormData((prev) => ({
      ...prev,
      paperwork: {
        ...prev.paperwork,
        sellerName: s.seller_name,
        fatherName: s.father_name,
        sellerCnic: s.seller_cnic,
        sellerPhone: s.seller_phone,
        sellerAddress: s.seller_address,
        // F-02: If selected from permanent registry, link sellerId; if unlinked legacy record, keep null
        sellerId: s.seller_id ?? null,
      },
    }));
    setSellerQuery(s.seller_name);
    setShowSellerDropdown(false);
    setSellerSuggestions([]);
  };

  const handleRegisterPermanentSeller = async () => {
    setRegisterSellerError(null);
    const pw = formData.paperwork;
    if (!pw.sellerName.trim()) {
      setRegisterSellerError('Seller full name is required');
      return;
    }
    if (!pw.sellerPhone.trim()) {
      setRegisterSellerError('Seller phone is required');
      return;
    }
    if (!pw.sellerAddress.trim()) {
      setRegisterSellerError('Seller address is required');
      return;
    }
    const cleanCnic = pw.sellerCnic.trim();
    if (cleanCnic && !/^\d{5}-\d{7}-\d$/.test(cleanCnic)) {
      setRegisterSellerError('Seller CNIC must be in format XXXXX-XXXXXXX-X');
      return;
    }

    setIsRegisteringSeller(true);
    try {
      const res = await mobileApi.createSeller({
        name: pw.sellerName.trim(),
        father_name: pw.fatherName.trim() || null,
        cnic: cleanCnic || null,
        phone: pw.sellerPhone.trim(),
        address: pw.sellerAddress.trim(),
      });
      if (res.success && res.seller?.id) {
        setFormData((prev) => ({
          ...prev,
          paperwork: {
            ...prev.paperwork,
            sellerId: res.seller.id,
          },
        }));
      } else {
        setRegisterSellerError(res.error || 'Failed to register seller');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register seller in permanent registry';
      setRegisterSellerError(msg);
    } finally {
      setIsRegisteringSeller(false);
    }
  };

  const handleSelectSupplier = (supplier: FrontendSupplier) => {
    setSelectedSupplier(supplier);
    setSupplierSearch(supplier.name);
    setShowSupplierDropdown(false);
    setSupplierResults([]);
  };

  const handleClearSupplier = () => {
    setSelectedSupplier(null);
    setSupplierSearch('');
    setSupplierResults([]);
    setShowSupplierDropdown(false);
  };

  const handleQuickAddSupplier = async () => {
    const name = quickAddName.trim();
    const phone = quickAddPhone.trim();
    if (!name) {
      setSupplierAddError('Supplier name is required');
      return;
    }
    setSupplierAddError(null);
    setIsQuickAddingSupplier(true);
    try {
      const res = await supplierApi.addSupplier({ name, phone: phone || undefined });
      if (res.success && res.data) {
        setSelectedSupplier(res.data);
        setSupplierSearch(res.data.name);
        setQuickAddName('');
        setQuickAddPhone('');
        setIsQuickAddingSupplier(false);
        setShowSupplierDropdown(false);
      } else {
        setSupplierAddError(res.message || 'Failed to add supplier');
        setIsQuickAddingSupplier(false);
      }
    } catch (err: unknown) {
      setSupplierAddError(err instanceof Error ? err.message : 'Failed to add supplier');
      setIsQuickAddingSupplier(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    // Basic client validations
    if (!formData.specs.brand.trim()) {
      setSubmitError('Brand name is required');
      return;
    }
    if (!formData.specs.model.trim()) {
      setSubmitError('Model name is required');
      return;
    }
    if (!formData.specs.imei1 || formData.specs.imei1.length !== 15) {
      setSubmitError('Primary IMEI must be exactly 15 numeric digits');
      return;
    }
    if (formData.specs.imei2 && formData.specs.imei2.length !== 15) {
      setSubmitError('Secondary IMEI must be exactly 15 numeric digits when provided');
      return;
    }
    if (formData.specs.imei2 && formData.specs.imei1 === formData.specs.imei2) {
      setSubmitError('Primary and Secondary IMEIs must be different');
      return;
    }

    const costVal = isUsed ? formData.paperwork.purchasePrice : formData.specs.costPrice;
    if (!costVal || costVal <= 0) {
      setSubmitError('Purchase / Cost price must be greater than zero');
      return;
    }

    if (isUsed) {
      if (!formData.paperwork.voucherNo.trim()) {
        setSubmitError('Purchase Slip Voucher Number is required for used mobiles');
        return;
      }
      if (!formData.paperwork.sellerName.trim()) {
        setSubmitError('Seller full name is required');
        return;
      }
      if (!formData.paperwork.fatherName.trim()) {
        setSubmitError("Seller's father name is required");
        return;
      }
      if (!formData.paperwork.sellerCnic.trim() || formData.paperwork.sellerCnic.length !== 15) {
        setSubmitError('Seller CNIC must be 13 digits in format XXXXX-XXXXXXX-X');
        return;
      }
      if (!formData.paperwork.sellerPhone.trim()) {
        setSubmitError('Seller mobile number is required');
        return;
      }
      if (!formData.paperwork.sellerAddress.trim()) {
        setSubmitError('Seller physical address is required');
        return;
      }
      if (!formData.paperwork.ownershipDeclarationAcknowledged) {
        setSubmitError('You must acknowledge the Solemn Declaration of Ownership');
        return;
      }
      if (!formData.paperwork.physicalAffidavitAcknowledged) {
        setSubmitError('You must verify that physical affidavit paperwork & thumb impressions were obtained');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = transformFormDataToApiPayload(formData, branchId, selectedSupplier?.id || null);
      const res = await mobileApi.createMobile(payload);
      setSubmitSuccess(`Mobile registered successfully! Device ID: ${res.device_id.slice(0, 8)}...`);
      setTimeout(() => {
        navigate('/dashboard/shop-admin/mobiles');
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register mobile device. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-20 px-4 sm:px-6">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-4 pt-4 border-b border-border pb-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard/shop-admin/mobiles')}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Mobile Inventory</span>
        </button>

        <Badge variant="primary" size="sm">
          Live System — Serialized Inventory
        </Badge>
      </div>

      {/* Page Title & Context */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
          Add Mobile to Inventory
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Catalog a serialized mobile device. Select whether the phone is a brand new sealed unit or a used phone requiring legal purchase paperwork.
        </p>
      </div>

      {/* Error Alert Banner */}
      {submitError && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-text-primary">
            <div className="font-semibold text-danger">Registration Error</div>
            <p className="text-xs text-text-secondary mt-0.5">{submitError}</p>
          </div>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="text-xs font-semibold text-danger hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Success Alert Banner */}
      {submitSuccess && (
        <div className="p-4 bg-success/10 border border-success/20 rounded-lg flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-text-primary">
            <div className="font-semibold text-success">Saved Successfully</div>
            <p className="text-xs text-text-secondary mt-0.5">{submitSuccess}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* 1. PRIMARY CONDITION SELECTOR (NEW vs USED) */}
        <Card variant="default" padding="md" className="bg-surface border-border">
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Step 1: Select Mobile Condition
              </span>
              <h2 className="text-lg font-bold text-text-primary mt-0.5">
                Is this phone New or Used?
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
              {/* Option: Used Mobile */}
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, condition: 'USED' }))}
                className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  isUsed
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                    : 'border-border bg-surface hover:bg-surface-hover'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg shrink-0 ${
                    isUsed ? 'bg-primary text-white' : 'bg-surface-hover text-text-muted'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-primary text-base">Used Mobile</span>
                    <Badge variant="warning" size="sm">
                      Requires Urdu Paperwork
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Pre-owned phone purchased from a customer. Requires Niazi Mobile Mart purchase affidavit (Sr No., CNIC, address, thumb impression) and inspection report.
                  </p>
                </div>
              </button>

              {/* Option: New Mobile */}
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, condition: 'NEW' }))}
                className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  !isUsed
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                    : 'border-border bg-surface hover:bg-surface-hover'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg shrink-0 ${
                    !isUsed ? 'bg-primary text-white' : 'bg-surface-hover text-text-muted'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-primary text-base">New Mobile (Boxed)</span>
                    <Badge variant="success" size="sm">
                      Sealed Unit
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Brand new sealed device from distributor or company. Fast-tracked specification entry without seller purchase affidavits.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </Card>

        {/* 2. DEVICE SPECIFICATIONS (COMMON TO BOTH) */}
        <Card variant="default" padding="lg" className="bg-surface border-border">
          <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-6">
            <div className="p-1.5 bg-primary/10 rounded text-primary">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                Device Specifications
              </h2>
              <p className="text-xs text-text-muted">
                Hardware specifications, color variant, and unique serial/IMEI identifiers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Brand */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-brand`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Brand *
              </label>
              <input
                id={`${formId}-brand`}
                type="text"
                list={`${formId}-brands-list`}
                placeholder="e.g. Apple, Samsung"
                required
                value={formData.specs.brand}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    specs: { ...prev.specs, brand: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              <datalist id={`${formId}-brands-list`}>
                {POPULAR_BRANDS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-model`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Model Name *
              </label>
              <input
                id={`${formId}-model`}
                type="text"
                placeholder="e.g. iPhone 15 Pro Max"
                required
                value={formData.specs.model}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    specs: { ...prev.specs, model: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-color`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Color
              </label>
              <input
                id={`${formId}-color`}
                type="text"
                placeholder="e.g. Natural Titanium, Black"
                value={formData.specs.color}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    specs: { ...prev.specs, color: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {/* Storage (ROM) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`${formId}-storage`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Internal Storage
                </label>
                {!isAddingStorage ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingStorage(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer"
                    title="Add new storage specification"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add New</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingStorage(false);
                      setCustomStorageInput('');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>

              {isAddingStorage ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. 2TB, 4TB"
                    autoFocus
                    value={customStorageInput}
                    onChange={(e) => setCustomStorageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveCustomStorage();
                      } else if (e.key === 'Escape') {
                        setIsAddingStorage(false);
                        setCustomStorageInput('');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomStorage}
                    disabled={!customStorageInput.trim()}
                    className="px-3 py-2 bg-primary text-white text-xs font-semibold rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1 cursor-pointer"
                    title="Save & Select"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
              ) : (
                <select
                  id={`${formId}-storage`}
                  value={formData.specs.storage}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      specs: { ...prev.specs, storage: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                >
                  {storageOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* RAM */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`${formId}-ram`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  RAM
                </label>
                {!isAddingRam ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingRam(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer"
                    title="Add new RAM specification"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add New</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingRam(false);
                      setCustomRamInput('');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>

              {isAddingRam ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. 24GB, 32GB"
                    autoFocus
                    value={customRamInput}
                    onChange={(e) => setCustomRamInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveCustomRam();
                      } else if (e.key === 'Escape') {
                        setIsAddingRam(false);
                        setCustomRamInput('');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomRam}
                    disabled={!customRamInput.trim()}
                    className="px-3 py-2 bg-primary text-white text-xs font-semibold rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1 cursor-pointer"
                    title="Save & Select"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
              ) : (
                <select
                  id={`${formId}-ram`}
                  value={formData.specs.ram}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      specs: { ...prev.specs, ram: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                >
                  {ramOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* PTA Status */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-pta`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                PTA Approval Status *
              </label>
              <select
                id={`${formId}-pta`}
                value={formData.specs.ptaStatus}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    specs: { ...prev.specs, ptaStatus: e.target.value as PtaStatus },
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
              >
                <option value="PTA_APPROVED">PTA Approved (Official Tax Paid)</option>
                <option value="NON_PTA">Non-PTA (Sim not active in PK)</option>
                <option value="JV">JV (Carrier Locked)</option>
                <option value="GEVEY">Gevey Sim Compatible</option>
              </select>
            </div>

            {/* Primary IMEI 1 */}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label htmlFor={`${formId}-imei1`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Primary IMEI (IMEI 1) *
                </label>
                <div className="flex items-center gap-2">
                  {imeiCheckStatus === 'checking' && (
                    <span className="text-xs text-primary flex items-center gap-1 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking IMEI...
                    </span>
                  )}
                  {imeiCheckStatus === 'available' && (
                    <span className="text-xs text-success flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Available
                    </span>
                  )}
                  {imeiCheckStatus === 'taken' && (
                    <span className="text-xs text-danger flex items-center gap-1 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Already Registered!
                    </span>
                  )}
                  <span className="text-[11px] text-text-muted">15 numeric digits</span>
                </div>
              </div>
              <input
                id={`${formId}-imei1`}
                type="text"
                maxLength={15}
                required
                placeholder="e.g. 354892110482910"
                value={formData.specs.imei1}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 15);
                  handleImei1Change(val);
                }}
                className={`w-full px-3 py-2 text-sm font-mono bg-surface text-text-primary border rounded-md focus:outline-none focus:ring-2 ${
                  imeiCheckStatus === 'taken'
                    ? 'border-danger focus:ring-danger'
                    : imeiCheckStatus === 'available'
                    ? 'border-success focus:ring-success'
                    : 'border-border focus:ring-focus-ring'
                }`}
              />
              {imeiCheckMessage && (
                <div
                  className={`text-xs mt-0.5 ${
                    imeiCheckStatus === 'taken'
                      ? 'text-danger font-medium'
                      : imeiCheckStatus === 'available'
                      ? 'text-success'
                      : 'text-text-muted'
                  }`}
                >
                  {imeiCheckMessage}
                </div>
              )}
            </div>

            {/* Secondary IMEI 2 (Optional) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-imei2`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Secondary IMEI (eSIM / SIM 2)
              </label>
              <input
                id={`${formId}-imei2`}
                type="text"
                maxLength={15}
                placeholder="Optional second IMEI"
                value={formData.specs.imei2 || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 15);
                  setFormData((prev) => ({
                    ...prev,
                    specs: { ...prev.specs, imei2: val },
                  }))
                }}
                className="w-full px-3 py-2 text-sm font-mono bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
          </div>
        </Card>

        {/* 3. SUPPLIER SELECTION (CONDITION = NEW ONLY) */}
        {!isUsed && (
          <Card variant="default" padding="lg" className="bg-surface border-border">
            <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-6">
              <div className="p-1.5 bg-primary/10 rounded text-primary">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-primary">Supplier <span className="text-text-muted font-normal text-sm">(Optional)</span></h2>
                <p className="text-xs text-text-muted">
                  Link this purchase to an existing supplier or quickly add a new one.
                </p>
              </div>
            </div>

            <div className="relative" ref={supplierSearchRef}>
              {/* Selected supplier chip */}
              {selectedSupplier ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5 border border-primary/30 rounded-md">
                  <div className="p-1 bg-primary/10 rounded">
                    <Store className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-text-primary truncate">{selectedSupplier.name}</span>
                    {selectedSupplier.phone && (
                      <span className="text-xs text-text-muted ml-2">{selectedSupplier.phone}</span>
                    )}
                  </div>
                  <Badge variant="success" size="sm">Selected</Badge>
                  <button
                    type="button"
                    onClick={handleClearSupplier}
                    className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                    aria-label="Clear supplier"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search supplier by name…"
                      value={supplierSearch}
                      onChange={(e) => {
                        setSupplierSearch(e.target.value);
                        setShowSupplierDropdown(true);
                      }}
                      onFocus={() => { if (supplierSearch.length >= 2) setShowSupplierDropdown(true); }}
                      className="w-full pl-9 pr-9 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    />
                    {isSearchingSupplier && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
                    )}
                    {supplierSearch && !isSearchingSupplier && (
                      <button
                        type="button"
                        onClick={handleClearSupplier}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown results */}
                  {showSupplierDropdown && (supplierResults.length > 0 || (supplierSearch.trim().length >= 2 && !isSearchingSupplier)) && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                      {supplierResults.length > 0 ? (
                        supplierResults.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelectSupplier(s)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors border-b border-border last:border-b-0"
                          >
                            <div className="p-1 bg-primary/10 rounded shrink-0">
                              <Store className="w-3 h-3 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-text-primary truncate">{s.name}</div>
                              {s.phone && <div className="text-xs text-text-muted">{s.phone}</div>}
                            </div>
                            {s.supplier_code && (
                              <span className="text-xs text-text-muted font-mono shrink-0">{s.supplier_code}</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2.5 text-sm text-text-muted text-center">No suppliers found</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quick-add supplier inline panel */}
              {!selectedSupplier && (
                <div className="mt-3">
                  {!isQuickAddingSupplier ? (
                    <button
                      type="button"
                      onClick={() => setIsQuickAddingSupplier(true)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add new supplier
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2 p-3 bg-surface-hover border border-border rounded-md mt-1">
                      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">New Supplier</p>
                      {supplierAddError && (
                        <p className="text-xs text-red-500">{supplierAddError}</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Supplier name *"
                          value={quickAddName}
                          onChange={(e) => setQuickAddName(e.target.value)}
                          className="px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                        />
                        <input
                          type="text"
                          placeholder="Phone (optional)"
                          value={quickAddPhone}
                          onChange={(e) => setQuickAddPhone(e.target.value)}
                          className="px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleQuickAddSupplier}
                          disabled={isQuickAddingSupplier || !quickAddName.trim()}
                        >
                          {isQuickAddingSupplier ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Adding…</>
                          ) : (
                            <><Check className="w-3.5 h-3.5 mr-1" />Add Supplier</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setIsQuickAddingSupplier(false); setQuickAddName(''); setQuickAddPhone(''); setSupplierAddError(null); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 4. USED MOBILE PURCHASE PAPERWORK (CONDITION = USED ONLY) */}
        {isUsed && (
          <Card variant="default" padding="lg" className="bg-surface border-border">
            {/* Urdu Header Callout from Physical Slip */}
            <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-lg mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary text-white rounded-md shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <span>Used Mobile Purchase Paperwork</span>
                    <span className="text-xs font-normal text-text-muted font-urdu">
                      (فارم برائے خریداری استعمال شدہ موبائل)
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Digitized legal affidavit required for pre-owned phones (Niazi Mobile Mart, Shop # LG 02 Makkah Mobile Mall).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-semibold text-text-secondary">Sr No:</span>
                <input
                  type="text"
                  placeholder="e.g. 1001"
                  value={formData.paperwork.voucherNo}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: { ...prev.paperwork, voucherNo: e.target.value },
                    }))
                  }
                  className="w-24 px-2.5 py-1 text-xs font-bold text-primary bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>
            </div>

            {/* Seller autofill search — find a previously recorded seller */}
            <div className="relative mb-2" ref={sellerSearchRef}>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Find Previous Seller
                <span className="ml-1 text-text-muted font-normal normal-case">(optional — autofills fields below)</span>
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, CNIC, or phone…"
                  value={sellerQuery}
                  onChange={(e) => {
                    setSellerQuery(e.target.value);
                    setShowSellerDropdown(true);
                  }}
                  onFocus={() => { if (sellerQuery.length >= 2) setShowSellerDropdown(true); }}
                  className="w-full pl-9 pr-9 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                {isSearchingSellers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
                )}
                {sellerQuery && !isSearchingSellers && (
                  <button
                    type="button"
                    onClick={() => { setSellerQuery(''); setSellerSuggestions([]); setShowSellerDropdown(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary"
                    aria-label="Clear seller search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {showSellerDropdown && (sellerSuggestions.length > 0 || (sellerQuery.trim().length >= 2 && !isSearchingSellers)) && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                  {sellerSuggestions.length > 0 ? (
                    sellerSuggestions.map((s, idx) => (
                      <button
                        key={`${s.seller_cnic || s.seller_name}-${idx}`}
                        type="button"
                        onClick={() => handleAutofillSeller(s)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-surface-hover transition-colors border-b border-border last:border-b-0 cursor-pointer"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-text-primary truncate">{s.seller_name}</span>
                          <span className="text-xs text-text-muted">{s.seller_cnic} {s.seller_phone ? `· ${s.seller_phone}` : ''}</span>
                        </div>
                        {s.seller_id ? (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 ml-2">
                            Permanent
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-surface text-text-muted border border-border shrink-0 ml-2">
                            Legacy
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2.5 text-sm text-text-muted text-center">No previous sellers found</div>
                  )}
                </div>
              )}
            </div>

            {/* Permanent Seller Registry Status Banner */}
            <div className="flex items-center justify-between p-2.5 bg-surface-hover border border-border rounded-md mb-2">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                <span className="text-xs text-text-secondary">
                  Seller Registry Status:
                </span>
                {formData.paperwork.sellerId ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5" />
                    Linked to Permanent Registry
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">
                    Not linked to permanent registry
                  </span>
                )}
              </div>
              {!formData.paperwork.sellerId && (
                <button
                  type="button"
                  onClick={handleRegisterPermanentSeller}
                  disabled={isRegisteringSeller || !formData.paperwork.sellerName.trim() || !formData.paperwork.sellerPhone.trim() || !formData.paperwork.sellerAddress.trim()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:text-white hover:bg-primary border border-primary/40 rounded transition-colors disabled:opacity-disabled cursor-pointer"
                >
                  {isRegisteringSeller ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                  ) : (
                    <><Plus className="w-3 h-3" /> Save to Registry</>
                  )}
                </button>
              )}
            </div>
            {registerSellerError && (
              <p className="text-xs text-danger mb-2 font-medium">{registerSellerError}</p>
            )}

            {/* Seller Contact & Legal Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Seller Full Name */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-seller-name`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Seller Full Name *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">نام فروخت کنندہ</span>
                </div>
                <input
                  id={`${formId}-seller-name`}
                  type="text"
                  required={isUsed}
                  placeholder="Full name as on CNIC"
                  value={formData.paperwork.sellerName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: { ...prev.paperwork, sellerName: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Father's Name */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-father-name`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Father's Name (S/O) *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">ولدیت / ولد</span>
                </div>
                <input
                  id={`${formId}-father-name`}
                  type="text"
                  required={isUsed}
                  placeholder="Father's full name"
                  value={formData.paperwork.fatherName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: { ...prev.paperwork, fatherName: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Seller CNIC (13 digits formatted) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-seller-cnic`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Seller CNIC Number *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">شناختی کارڈ نمبر</span>
                </div>
                <input
                  id={`${formId}-seller-cnic`}
                  type="text"
                  required={isUsed}
                  maxLength={15}
                  placeholder="XXXXX-XXXXXXX-X"
                  value={formData.paperwork.sellerCnic}
                  onChange={(e) => handleCnicChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring tracking-wider"
                />
              </div>

              {/* Seller Phone Number */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-seller-phone`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Seller Mobile Number *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">موبائل نمبر</span>
                </div>
                <input
                  id={`${formId}-seller-phone`}
                  type="tel"
                  required={isUsed}
                  placeholder="03XX-XXXXXXX"
                  value={formData.paperwork.sellerPhone}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: { ...prev.paperwork, sellerPhone: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Purchase Date */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-purchase-date`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Purchase Date *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">تاریخ</span>
                </div>
                <input
                  id={`${formId}-purchase-date`}
                  type="date"
                  required={isUsed}
                  value={formData.paperwork.purchaseDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: { ...prev.paperwork, purchaseDate: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                />
              </div>

              {/* Agreed Purchase Price (Rs) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-purchase-price`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Agreed Purchase Price (Rs) *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">روپے میں فروخت</span>
                </div>
                <input
                  id={`${formId}-purchase-price`}
                  type="number"
                  min="0"
                  step="1000"
                  required={isUsed}
                  placeholder="0"
                  value={formData.paperwork.purchasePrice || ''}
                  onChange={(e) => handleCostPriceChange(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-semibold text-primary bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Residential Address */}
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-seller-address`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Residential Address *
                  </label>
                  <span className="text-[11px] text-text-muted font-urdu">ایڈریس</span>
                </div>
                <input
                  id={`${formId}-seller-address`}
                  type="text"
                  required={isUsed}
                  placeholder="Permanent or current residential address of the seller"
                  value={formData.paperwork.sellerAddress}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: { ...prev.paperwork, sellerAddress: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>
            </div>

            {/* Legal Declarations & Affirmations */}
            <div className="mt-6 pt-5 border-t border-border flex flex-col gap-3.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Legal Declarations & Verifications
              </span>

              {/* Solemn Ownership Declaration Checkbox */}
              <label className="flex items-start gap-3 p-3 bg-surface-hover/70 rounded-md border border-border cursor-pointer hover:bg-surface-hover transition-colors">
                <input
                  type="checkbox"
                  required={isUsed}
                  checked={formData.paperwork.ownershipDeclarationAcknowledged}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: {
                        ...prev.paperwork,
                        ownershipDeclarationAcknowledged: e.target.checked,
                      },
                    }))
                  }
                  className="mt-0.5 w-4 h-4 text-primary rounded border-border focus:ring-focus-ring cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-semibold text-text-primary">
                    Solemn Legal Ownership Declaration (حلف نامہ برائے ذاتی ملکیت)
                  </div>
                  <p className="text-text-secondary mt-0.5 font-urdu text-[13px] leading-relaxed">
                    &quot;میں حلفیہ کہتا ہوں کہ یہ موبائل میری ذاتی ملکیت ہے اور میں خرید کنندہ سے رقم وصول کر چکا ہوں۔&quot;
                  </p>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Seller affirms under oath that the device is unencumbered and not stolen or under police warrant.
                  </p>
                </div>
              </label>

              {/* Physical Paperwork & Thumb Impression Checkbox */}
              <label className="flex items-start gap-3 p-3 bg-surface-hover/70 rounded-md border border-border cursor-pointer hover:bg-surface-hover transition-colors">
                <input
                  type="checkbox"
                  required={isUsed}
                  checked={formData.paperwork.physicalAffidavitAcknowledged}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paperwork: {
                        ...prev.paperwork,
                        physicalAffidavitAcknowledged: e.target.checked,
                      },
                    }))
                  }
                  className="mt-0.5 w-4 h-4 text-primary rounded border-border focus:ring-focus-ring cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-semibold text-text-primary">
                    Physical Voucher Signed & Thumb-Printed (نشان انگوٹھا اور دستخط)
                  </div>
                  <p className="text-text-secondary mt-0.5">
                    Physical paper slip contains the seller&apos;s ink thumb impression and shopkeeper counter-signature on record.
                  </p>
                </div>
              </label>
            </div>
          </Card>
        )}

        {/* 4. USED MOBILE INSPECTION CHECKLIST (CONDITION = USED ONLY) */}
        {isUsed && (
          <Card variant="default" padding="lg" className="bg-surface border-border">
            <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-6">
              <div className="p-1.5 bg-warning/10 rounded text-warning">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-primary">
                  Diagnostic & Physical Inspection
                </h2>
                <p className="text-xs text-text-muted">
                  Technical grading of body condition, screen originality, battery health, and functional components.
                </p>
              </div>
            </div>

            {/* Body, Screen & Battery Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
              {/* Body Condition */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${formId}-body-grade`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Physical Body Condition
                </label>
                <select
                  id={`${formId}-body-grade`}
                  value={formData.inspection.bodyGrade}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      inspection: {
                        ...prev.inspection,
                        bodyGrade: e.target.value as PhysicalBodyGrade,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                >
                  <option value="PRISTINE">10/10 — Pristine / No Scratches</option>
                  <option value="GOOD">9/10 — Minor Wear / Pocket Scratches</option>
                  <option value="HEAVY_WEAR">8/10 — Noticeable Wear / Edge Scuffs</option>
                  <option value="DENTED">7/10 or below — Dents / Frame Damage</option>
                </select>
              </div>

              {/* Screen Condition */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${formId}-screen-condition`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Display / Screen
                </label>
                <select
                  id={`${formId}-screen-condition`}
                  value={formData.inspection.screenCondition}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      inspection: {
                        ...prev.inspection,
                        screenCondition: e.target.value as ScreenCondition,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                >
                  <option value="ORIGINAL">Original Company Display</option>
                  <option value="REPLACED">Replaced Screen (Non-Original / Changed)</option>
                  <option value="CRACKED">Cracked Glass / Minor Bleed</option>
                </select>
              </div>

              {/* Battery Health % */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${formId}-battery-health`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Battery Health %
                  </label>
                  <span className="text-[11px] text-text-muted">iOS / Android Health</span>
                </div>
                <div className="relative">
                  <input
                    id={`${formId}-battery-health`}
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 88"
                    value={formData.inspection.batteryHealthPercent || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        inspection: {
                          ...prev.inspection,
                          batteryHealthPercent: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Functional Checks Toggle Grid */}
            <div className="flex flex-col gap-3 mb-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Hardware & Component Pass/Fail Checks
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {[
                  { key: 'touchWorking', label: 'Touch & TrueTone' },
                  { key: 'batteryBackupOk', label: 'Battery Backup OK' },
                  { key: 'frontCameraOk', label: 'Front Camera' },
                  { key: 'backCameraOk', label: 'Rear Cameras & Lens' },
                  { key: 'speakerOk', label: 'Loudspeaker' },
                  { key: 'microphoneOk', label: 'Microphone & Earpiece' },
                  { key: 'chargingPortOk', label: 'Charging Port & Cable' },
                  { key: 'buttonsOk', label: 'Power & Volume Keys' },
                  { key: 'biometricsOk', label: 'Face ID / Fingerprint' },
                  { key: 'wifiBluetoothOk', label: 'Wi-Fi & Bluetooth' },
                  { key: 'simNetworkOk', label: 'SIM & Network Signal' },
                ].map((item) => {
                  const isChecked = (formData.inspection as any)[item.key];
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          inspection: {
                            ...prev.inspection,
                            [item.key]: !isChecked,
                          },
                        }))
                      }
                      className={`px-3 py-2 rounded-md border text-left text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? 'border-success/30 bg-success/5 text-text-primary'
                          : 'border-danger/30 bg-danger/5 text-text-secondary'
                      }`}
                    >
                      <span>{item.label}</span>
                      {isChecked ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Included Accessories Checklist */}
            <div className="flex flex-col gap-2.5 mb-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Accessories Included With Device
              </span>

              <div className="flex flex-wrap items-center gap-3">
                {[
                  { key: 'box', label: 'Original Box (ڈبہ)' },
                  { key: 'originalCharger', label: 'Original Charger (چارجر)' },
                  { key: 'cable', label: 'Charging Cable' },
                  { key: 'handsfree', label: 'Handsfree / Earphones' },
                ].map((acc) => {
                  const isSelected = (formData.inspection.accessories as any)[acc.key];
                  return (
                    <label
                      key={acc.key}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            inspection: {
                              ...prev.inspection,
                              accessories: {
                                ...prev.inspection.accessories,
                                [acc.key]: e.target.checked,
                              },
                            },
                          }))
                        }
                        className="rounded text-primary border-border focus:ring-focus-ring cursor-pointer"
                      />
                      <span>{acc.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Defect Notes */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-defect-notes`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Inspection Remarks / Defect Notes
              </label>
              <textarea
                id={`${formId}-defect-notes`}
                rows={2}
                placeholder="Any notable scratches, replaced parts, battery drainage, or technician remarks..."
                value={formData.inspection.defectNotes || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    inspection: { ...prev.inspection, defectNotes: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
          </Card>
        )}

        {/* 5. PRICING & SUMMARY PRESENTATION CARD */}
        <Card variant="default" padding="lg" className="bg-surface border-border">
          <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-6">
            <div className="p-1.5 bg-primary/10 rounded text-primary">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                Pricing & Purchase Summary
              </h2>
              <p className="text-xs text-text-muted">
                Cost considerations and estimated retail target (presentation-only calculation).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            {/* Cost / Purchase Price */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-cost-price`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Cost / Purchase Price (Rs) *
              </label>
              <input
                id={`${formId}-cost-price`}
                type="number"
                min="0"
                step="1000"
                required
                placeholder="0"
                value={isUsed ? formData.paperwork.purchasePrice || '' : formData.specs.costPrice || ''}
                onChange={(e) => handleCostPriceChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-semibold text-text-primary bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {/* Expected Sale Price */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-expected-sale-price`} className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Expected Retail Sale Price (Rs) *
              </label>
              <input
                id={`${formId}-expected-sale-price`}
                type="number"
                min="0"
                step="1000"
                required
                placeholder="0"
                value={formData.specs.expectedSalePrice || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    specs: { ...prev.specs, expectedSalePrice: Number(e.target.value) },
                  }))
                }
                className="w-full px-3 py-2 text-sm font-semibold text-primary bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
          </div>

          {/* Visual Presentation Summary Box */}
          <div className="p-4 bg-surface-hover/70 rounded-lg border border-border grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-[11px] font-semibold text-text-muted uppercase">Condition</div>
              <div className="text-sm font-bold text-text-primary mt-0.5">
                {isUsed ? 'Used (Pre-Owned)' : 'New (Boxed)'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-text-muted uppercase">Purchase Cost</div>
              <div className="text-sm font-bold text-text-secondary mt-0.5">
                Rs. {cost.toLocaleString()}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-text-muted uppercase">Target Retail</div>
              <div className="text-sm font-bold text-primary mt-0.5">
                Rs. {sale.toLocaleString()}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-text-muted uppercase">Estimated Margin</div>
              <div className={`text-sm font-bold mt-0.5 ${margin >= 0 ? 'text-success' : 'text-danger'}`}>
                Rs. {margin.toLocaleString()} ({marginPercent}%)
              </div>
            </div>
          </div>
        </Card>

        {/* 6. FORM ACTIONS */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
          <div className="text-xs text-text-muted">
            <span className="font-semibold text-text-secondary">Note:</span> Serialized mobile devices will be saved directly to inventory and tracked by unique IMEI.
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => navigate('/dashboard/shop-admin/mobiles')}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isSubmitting || imeiCheckStatus === 'taken'}
              className="w-full sm:w-auto font-semibold shadow-sm"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Mobile...</span>
                </span>
              ) : (
                'Save Mobile'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
