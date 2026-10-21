import React, { useState, useEffect } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { expensesApi } from '@/services/expenses.api';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import {
  X,
  Plus,
  ReceiptText,
  Building2,
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
  Calendar,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
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
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'ONLINE'>('CASH');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNo, setReferenceNo] = useState('');
  const [expenseScope, setExpenseScope] = useState<'BRANCH' | 'ORGANIZATION'>('BRANCH');

  // Category quick-add inline state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (categories.length > 0 && !categoryId) {
        setCategoryId(categories[0].id);
      }
      setAmount('');
      setPaymentMethod('CASH');
      setDescription('');
      setNotes('');
      setReferenceNo('');
      setExpenseScope('BRANCH');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setIsAddingCategory(false);
      setNewCategoryName('');
    }
  }, [isOpen, categories]);

  if (!isOpen) return null;

  // Handle Preset Click: selects category if exists, or fills description
  const handlePresetClick = (preset: typeof QUICK_EXPENSE_PRESETS[0]) => {
    setDescription(preset.defaultDesc);
    // Try to find matching category by name (case-insensitive)
    const matching = categories.find(
      (c) => c.name.toLowerCase().includes(preset.name.toLowerCase()) ||
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
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!categoryId) {
      toast.error('Please select an expense category');
      return;
    }

    // Combine notes and reference number if provided
    let combinedNotes = notes.trim();
    if (referenceNo.trim()) {
      combinedNotes = combinedNotes
        ? `Ref #: ${referenceNo.trim()} | ${combinedNotes}`
        : `Ref #: ${referenceNo.trim()}`;
    }

    await addExpense({
      category_id: categoryId,
      amount: numAmount,
      payment_method: paymentMethod,
      description: description.trim() ? description.trim() : null,
      notes: combinedNotes ? combinedNotes : null,
      expense_date: expenseDate ? new Date(expenseDate).toISOString() : null,
    });

    onClose();
  };

  const branchLabel = activeShop?.name || 'Active Branch';

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-3 sm:p-4 bg-overlay backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-expense-title"
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-[475px] overflow-hidden border border-border flex flex-col max-h-[75vh] animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div>
              <h2 id="record-expense-title" className="text-sm font-bold text-text-primary tracking-tight">
                Record Business Expense
              </h2>
              <p className="text-[11px] text-text-secondary leading-none">
                Overheads, utilities & daily expenditures
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-danger hover:bg-surface-hover rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3.5 custom-scrollbar flex-1">
          {/* 1. Branch / Scope Segmented Pills */}
          <div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface-hover rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setExpenseScope('BRANCH')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  expenseScope === 'BRANCH'
                    ? 'bg-surface text-primary shadow-xs border border-border/80'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Store className="w-3.5 h-3.5 text-primary" />
                <span className="truncate">{branchLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => setExpenseScope('ORGANIZATION')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  expenseScope === 'ORGANIZATION'
                    ? 'bg-surface text-primary shadow-xs border border-border/80'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span>Organization-Wide</span>
              </button>
            </div>
          </div>

          {/* 2. Category Selection with "+ New Category" button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                Expense Category *
              </label>
              {!isAddingCategory ? (
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Category</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(false)}
                  className="text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Inline Quick-Add Category Form */}
            {isAddingCategory ? (
              <div className="p-2 mb-2 bg-primary/5 border border-primary/20 rounded-lg space-y-1.5 animate-fade-in">
                <p className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                  <Tag className="w-3 h-3 text-primary" />
                  <span>Create new category for future use</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Generator Fuel, Water"
                    className="flex-1 px-2.5 py-1 text-xs bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={isSavingCategory || !newCategoryName.trim()}
                    onClick={handleCreateCategory}
                    className="px-2.5 py-1 text-xs font-semibold bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-disabled flex items-center gap-1 cursor-pointer"
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
                className="w-full px-2.5 py-1.5 border border-border rounded-lg bg-surface text-xs text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
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
            <div className="mt-1.5">
              <div className="flex flex-wrap gap-1">
                {QUICK_EXPENSE_PRESETS.map((preset, idx) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handlePresetClick(preset)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-surface-hover hover:bg-primary/10 text-text-secondary hover:text-primary border border-border hover:border-primary/30 transition-all cursor-pointer shadow-2xs"
                    >
                      <Icon className="w-2.5 h-2.5 text-primary" />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Amount & Payment Method Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Amount */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Amount (PKR) *
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                  Rs.
                </span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-2.5 py-1.5 border border-border rounded-lg bg-surface text-sm font-bold text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
                />
              </div>
            </div>

            {/* Payment Method Cards */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Payment Channel *
              </label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`flex flex-col items-center justify-center py-1 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                    paymentMethod === 'CASH'
                      ? 'bg-primary/10 border-primary text-primary font-bold shadow-2xs'
                      : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <Banknote className="w-3 h-3 mb-0.5" />
                  <span className="text-[10px]">Cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('BANK')}
                  className={`flex flex-col items-center justify-center py-1 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                    paymentMethod === 'BANK'
                      ? 'bg-primary/10 border-primary text-primary font-bold shadow-2xs'
                      : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <CreditCard className="w-3 h-3 mb-0.5" />
                  <span className="text-[10px]">Bank</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('ONLINE')}
                  className={`flex flex-col items-center justify-center py-1 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                    paymentMethod === 'ONLINE'
                      ? 'bg-primary/10 border-primary text-primary font-bold shadow-2xs'
                      : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <Smartphone className="w-3 h-3 mb-0.5" />
                  <span className="text-[10px]">Online</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Expense Date & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Expense Date
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-2.5 py-1 border border-border rounded-lg bg-surface text-xs text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Ref / Bill # <span className="text-text-muted font-normal">(Opt)</span>
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. Consumer or Bill #"
                className="w-full px-2.5 py-1 border border-border rounded-lg bg-surface text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
              />
            </div>
          </div>

          {/* 5. Description */}
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
              Description / Purpose
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Electricity bill for October, Monthly Shop Rent"
              className="w-full px-2.5 py-1 border border-border rounded-lg bg-surface text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring shadow-2xs"
            />
          </div>

          {/* 6. Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
              Remarks <span className="text-text-muted font-normal">(Opt)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Paid to landlord / Utility paid via cash drawer"
              className="w-full px-2.5 py-1 border border-border rounded-lg bg-surface text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring resize-none shadow-2xs"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-border flex items-center justify-end gap-2 sticky bottom-0 bg-surface">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-hover rounded-lg transition-colors cursor-pointer border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || !categoryId || !amount}
              className="px-4 py-1.5 text-xs font-bold text-white bg-primary hover:bg-primary-hover active:bg-primary-active rounded-lg transition-all shadow-2xs hover:shadow-xs disabled:opacity-disabled flex items-center gap-1.5 cursor-pointer"
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

