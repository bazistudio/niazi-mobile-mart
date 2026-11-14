import React, { useState, useEffect } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { expensesApi } from '@/services/expenses.api';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import {
  X,
  Plus,
  ReceiptText,
  Store,
  Tag,
  Zap,
  Home,
  Wifi,
  Coffee,
  Flame,
  Check,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  Calculator,
  Package,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * FIX-01: Returns the current calendar date in Asia/Karachi (PKT, UTC+5).
 * Uses local date components to avoid the UTC midnight-shift that causes
 * new Date().toISOString().split('T')[0] to return yesterday between
 * 00:00–04:59 PKT (since UTC is 5 hours behind PKT).
 * Returns: YYYY-MM-DD string in Pakistan Standard Time.
 */
function getPKTDateString(): string {
  const now = new Date();
  // PKT is UTC+5; add 5 hours to UTC time to get PKT wall-clock date
  const pktOffset = 5 * 60; // minutes
  const utcMinutes = now.getTime() / 60000;
  const pktDate = new Date((utcMinutes + pktOffset) * 60000);
  const y = pktDate.getUTCFullYear();
  const m = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pktDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Preset common expense templates with icons
const QUICK_EXPENSE_PRESETS = [
  { name: 'Electricity Bill', icon: Zap, defaultDesc: 'Monthly Electricity Utility Bill' },
  { name: 'Shop Rent', icon: Home, defaultDesc: 'Monthly Shop Rent Payment' },
  { name: 'PTCL & Internet', icon: Wifi, defaultDesc: 'Internet & Landline Telephone Bill' },
  { name: 'Tea & Refreshments', icon: Coffee, defaultDesc: 'Daily Tea, Milk & Staff Refreshments' },
  { name: 'Gas Cylinder', icon: Flame, defaultDesc: 'Gas Cylinder Refill / Shop Heating' },
];

export const ExpenseCreateModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { categories, addExpense, fetchCategories, isAdding } = useExpensesStore();
  const activeShop = useOrganizationStore((s) => s.activeShop);

  // Form states
  const [categoryId, setCategoryId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH' | 'CARD' | 'OTHER'>('CASH');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  // FIX-01: PKT-safe date initialisation — not .toISOString() which returns UTC
  const [expenseDate, setExpenseDate] = useState(getPKTDateString());
  const [referenceNo, setReferenceNo] = useState('');

  // Category quick-add inline state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (categories.length > 0 && !categoryId) {
        setCategoryId(categories[0].id);
      }
      setQuantity('1');
      setUnitPrice('');
      setAmount('');
      setPaymentMethod('CASH');
      setDescription('');
      setNotes('');
      setReferenceNo('');
      // EXP-FIX-03 / FIX-01: reset to PKT business date, not UTC date
      setExpenseDate(getPKTDateString());
      setIsAddingCategory(false);
      setNewCategoryName('');
    }
  }, [isOpen, categories]);

  if (!isOpen) return null;

  // Handle Quantity change: recalculate total if unitPrice is provided
  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    const q = parseFloat(val);
    const up = parseFloat(unitPrice);
    if (!isNaN(q) && q > 0 && !isNaN(up) && up > 0) {
      setAmount(String(Math.round(q * up)));
    }
  };

  // Handle Unit Price change: recalculate total using quantity (defaults to 1 if empty)
  const handleUnitPriceChange = (val: string) => {
    setUnitPrice(val);
    const up = parseFloat(val);
    const q = parseFloat(quantity) || 1;
    if (!isNaN(up) && up > 0 && q > 0) {
      setAmount(String(Math.round(q * up)));
    } else if (val === '') {
      setAmount('');
    }
  };

  // Handle direct Total Amount change: if user types lump sum directly
  const handleTotalAmountChange = (val: string) => {
    setAmount(val);
    const tot = parseFloat(val);
    const q = parseFloat(quantity);
    if (!isNaN(tot) && tot > 0) {
      if (!isNaN(q) && q > 1) {
        setUnitPrice(String(Math.round(tot / q)));
      } else {
        setUnitPrice(val);
      }
    } else if (val === '') {
      setUnitPrice('');
    }
  };

  // Handle Preset Click: selects category if exists, or fills description
  const handlePresetClick = (preset: typeof QUICK_EXPENSE_PRESETS[0]) => {
    setDescription(preset.defaultDesc);
    const matching = categories.find(
      (c) =>
        c.name.toLowerCase().includes(preset.name.toLowerCase()) ||
        preset.name.toLowerCase().includes(c.name.toLowerCase())
    );
    if (matching) {
      setCategoryId(matching.id);
    }
  };

  // Handle Inline Category Creation
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      setIsSavingCategory(true);
      const created = await expensesApi.createCategory({
        name: newCategoryName.trim(),
        description: `Custom expense category created from quick-entry`,
      });
      await fetchCategories();
      setCategoryId(created.id);
      setNewCategoryName('');
      setIsAddingCategory(false);
      toast.success(`Category "${created.name}" created and selected!`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Math.round(parseFloat(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!categoryId) {
      toast.error('Please select an expense category');
      return;
    }

    const parsedQty = Math.max(1, Math.round(parseFloat(quantity) || 1));
    const parsedUnitPrice = unitPrice ? Math.round(parseFloat(unitPrice)) : numAmount;

    // Build description with quantity & unit breakdown when quantity > 1 or unitPrice is explicitly entered
    let finalDescription = description.trim();
    const breakdownTag =
      parsedQty > 1 || (unitPrice.trim() !== '' && parsedUnitPrice > 0)
        ? `[Qty: ${parsedQty} × Rs. ${parsedUnitPrice.toLocaleString()} = Rs. ${numAmount.toLocaleString()}]`
        : '';

    if (breakdownTag) {
      finalDescription = finalDescription
        ? `${finalDescription} ${breakdownTag}`
        : breakdownTag;
    }

    // Combine notes and reference number if provided
    let combinedNotes = notes.trim();
    if (referenceNo.trim()) {
      combinedNotes = combinedNotes
        ? `Ref #: ${referenceNo.trim()} | ${combinedNotes}`
        : `Ref #: ${referenceNo.trim()}`;
    }

    // EXP-FIX-03: Always use branch scope — no org-wide null override
    const branchId = activeShop?.id || activeShop?._id || null;

    await addExpense({
      category_id: categoryId,
      branch_id: branchId,
      amount: numAmount,
      quantity: parsedQty,
      unit_price: parsedUnitPrice,
      payment_method: paymentMethod,
      description: finalDescription || null,
      notes: combinedNotes ? combinedNotes : null,
      expense_date: expenseDate || null,
    });

    onClose();
  };

  const branchLabel = activeShop?.name || 'Active Branch';
  const parsedQtyPreview = Math.max(1, Math.round(parseFloat(quantity) || 1));
  const parsedUnitPreview = Math.round(parseFloat(unitPrice) || 0);
  const parsedTotalPreview = Math.round(parseFloat(amount) || 0);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 sm:p-6 bg-overlay backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-expense-title"
    >
      {/* Expanded +30px all around: max-w-[535px] (+60px width), max-h-[86vh] (+60px height), p-[30px] outer feel */}
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-[535px] overflow-hidden border border-border flex flex-col max-h-[86vh] animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-2xs">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="record-expense-title"
                className="text-sm font-bold text-text-primary tracking-tight"
              >
                Record Business Expense
              </h2>
              <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mt-0.5">
                Overheads, utilities & unit-quantity expenditures
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-danger hover:bg-surface-hover rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body — Expanded padding (px-6 py-5) */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-5 overflow-y-auto space-y-4 custom-scrollbar flex-1"
        >
          {/* EXP-FIX-03: Branch label (read-only, ORGANIZATION scope removed) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-hover border border-border">
            <Store className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[11px] font-bold text-text-primary truncate">{branchLabel}</span>
            <span className="ml-auto text-[10px] font-bold text-text-muted uppercase tracking-wider">Branch Expense</span>
          </div>

          {/* 2. Category Selection with "+ New Category" button */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                Expense Category *
              </label>
              {!isAddingCategory ? (
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-hover uppercase tracking-wider transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Category</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(false)}
                  className="text-[11px] font-bold text-text-muted hover:text-text-primary uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Inline Quick-Add Category Form */}
            {isAddingCategory ? (
              <div className="p-3 mb-2 bg-primary/5 border border-primary/20 rounded-xl space-y-2 animate-fade-in">
                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-primary" />
                  <span>Create new category for future use</span>
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Generator Fuel, Water Bottles"
                    className="flex-1 px-3 py-1.5 text-[11px] font-bold bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={isSavingCategory || !newCategoryName.trim()}
                    onClick={handleCreateCategory}
                    className="px-3 py-1.5 text-[11px] font-bold bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-disabled flex items-center gap-1 cursor-pointer uppercase tracking-wider"
                  >
                    {isSavingCategory ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Save</span>
                  </button>
                </div>
              </div>
            ) : (
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-[11px] font-bold text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
              >
                <option value="" disabled>
                  Select Category
                </option>
                {categories
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}

            {/* Quick-Preset Category Pills */}
            <div className="mt-2">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_EXPENSE_PRESETS.map((preset, idx) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handlePresetClick(preset)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-surface-hover hover:bg-primary/10 text-text-secondary hover:text-primary border border-border hover:border-primary/30 transition-all cursor-pointer shadow-2xs"
                    >
                      <Icon className="w-2.5 h-2.5 text-primary" />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Quantity, One-Piece Unit Price & Total Amount Calculator Section */}
          <div className="p-3.5 bg-surface-hover/60 border border-border rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-primary" />
                <span>Quantity & Unit Price Calculator</span>
              </span>
              {parsedUnitPreview > 0 && parsedTotalPreview > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold">
                  {parsedQtyPreview} × Rs. {parsedUnitPreview.toLocaleString()} = Rs.{' '}
                  {parsedTotalPreview.toLocaleString()}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Quantity */}
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                  Quantity (Qty)
                </label>
                <div className="relative">
                  <Package className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    placeholder="1"
                    className="w-full pl-7 pr-2.5 py-2 border border-border rounded-lg bg-surface text-[11px] font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
                  />
                </div>
              </div>

              {/* 1 Piece / Unit Price */}
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                  1 Piece Price (PKR)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-text-muted">
                    Rs.
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={unitPrice}
                    onChange={(e) => handleUnitPriceChange(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full pl-8 pr-2.5 py-2 border border-border rounded-lg bg-surface text-[11px] font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
                  />
                </div>
              </div>

              {/* Total Amount */}
              <div>
                <label className="block text-[11px] font-bold text-primary uppercase tracking-wider mb-1">
                  Total Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-primary">
                    Rs.
                  </span>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(e) => handleTotalAmountChange(e.target.value)}
                    placeholder="e.g. 300"
                    className="w-full pl-8 pr-2.5 py-2 border border-primary/50 rounded-lg bg-surface text-[11px] font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Payment Method Channel — EXP-FIX-04: CARD and OTHER added */}
          <div>
            <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">
              Payment Channel *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { method: 'CASH', label: 'Cash', Icon: Banknote },
                  { method: 'BANK_TRANSFER', label: 'Bank', Icon: CreditCard },
                  { method: 'EASYPAISA', label: 'EasyPaisa', Icon: Smartphone },
                  { method: 'JAZZCASH', label: 'JazzCash', Icon: Smartphone },
                  { method: 'CARD', label: 'Card', Icon: CreditCard },
                  { method: 'OTHER', label: 'Other', Icon: Banknote },
                ] as const
              ).map(({ method, label, Icon }) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === method
                      ? 'bg-primary/10 border-primary text-primary font-bold shadow-2xs'
                      : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 5. Expense Date & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                Expense Date
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-[11px] font-bold text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                Ref / Bill # <span className="text-text-muted">(Opt)</span>
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. Consumer or Bill #"
                className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-[11px] font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
              />
            </div>
          </div>

          {/* 6. Description */}
          <div>
            <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1">
              Description / Purpose <span className="text-text-muted">(Opt)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Water bottles for shop, Monthly Electricity Bill"
              className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-[11px] font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
            />
          </div>

          {/* 7. Notes */}
          <div>
            <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1">
              Remarks <span className="text-text-muted">(Opt)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Paid to vendor / Utility paid via cash drawer"
              className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-[11px] font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring resize-none shadow-2xs"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5 sticky bottom-0 bg-surface">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary bg-surface-hover rounded-xl transition-colors cursor-pointer border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || !categoryId || !amount}
              className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary-hover active:bg-primary-active rounded-xl transition-all shadow-2xs hover:shadow-xs disabled:opacity-disabled flex items-center gap-1.5 cursor-pointer"
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Record Expense</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
