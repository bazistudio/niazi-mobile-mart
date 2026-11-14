import React, { useState } from 'react';
import { Expense } from '../types/expenses.types';
import { UpdateExpenseDto } from '@/lib/tauri/tauriClient';
import { useExpensesStore } from '../store/expenses.store';
import { X, Calendar, Clock, Hash, Tag, CreditCard, User, Building2, FileText, Ban, Edit2, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';


// ── PKT formatting helpers (Asia/Karachi, UTC+5) ─────────────────────────────
function formatPKTDate(isoTs: string): string {
  const pktOffsetMs = 5 * 60 * 60 * 1000;
  const pktDate = new Date(new Date(isoTs).getTime() + pktOffsetMs);
  const y = pktDate.getUTCFullYear();
  const m = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pktDate.getUTCDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function formatPKTTime(isoTs: string): string {
  const pktOffsetMs = 5 * 60 * 60 * 1000;
  const pktDate = new Date(new Date(isoTs).getTime() + pktOffsetMs);
  const h = String(pktDate.getUTCHours()).padStart(2, '0');
  const min = String(pktDate.getUTCMinutes()).padStart(2, '0');
  return `${h}:${min} PKT`;
}

interface Props {
  expense: Expense | null;
  onClose: () => void;
  onCancel: (id: string) => void;
}

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'CARD', 'OTHER'] as const;

export const ExpenseDetailModal: React.FC<Props> = ({ expense, onClose, onCancel }) => {
  const { updateExpense, isLoading } = useExpensesStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = () => {
    if (!expense) return;
    setEditAmount(String(expense.amount));
    // Pre-fill qty/unit_price from stored values; use '' for unit_price if null (lump-sum)
    const storedQty = expense.quantity && expense.quantity > 0 ? expense.quantity : 1;
    setEditQuantity(String(storedQty));
    setEditUnitPrice(expense.unit_price != null ? String(expense.unit_price) : '');
    setEditPaymentMethod(expense.payment_method);
    setEditDescription(expense.description || '');
    setEditNotes(expense.notes || '');
    setEditDate(expense.expense_date ? expense.expense_date.split('T')[0] : '');
    setIsEditing(true);
  };

  // Mirror the invariant from ExpenseCreateModal: amount = Math.round(qty × unitPrice)
  const handleEditQuantityChange = (val: string) => {
    setEditQuantity(val);
    const q = parseFloat(val);
    const up = parseFloat(editUnitPrice);
    if (!isNaN(q) && q > 0 && !isNaN(up) && up > 0) {
      setEditAmount(String(Math.round(q * up)));
    }
  };

  const handleEditUnitPriceChange = (val: string) => {
    setEditUnitPrice(val);
    const up = parseFloat(val);
    const q = parseFloat(editQuantity) || 1;
    if (!isNaN(up) && up > 0 && q > 0) {
      setEditAmount(String(Math.round(q * up)));
    } else if (val === '') {
      // unit_price cleared → keep current amount as lump sum
    }
  };

  const handleEditTotalAmountChange = (val: string) => {
    setEditAmount(val);
    const tot = parseFloat(val);
    const q = parseFloat(editQuantity);
    if (!isNaN(tot) && tot > 0) {
      if (!isNaN(q) && q > 1) {
        setEditUnitPrice(String(Math.round(tot / q)));
      } else {
        setEditUnitPrice(val); // qty=1: unit_price = total
      }
    } else if (val === '') {
      setEditUnitPrice('');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;
    const numAmount = Math.round(parseFloat(editAmount));
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const numQty = Math.max(1, Math.round(parseFloat(editQuantity) || 1));
    const numUnitPrice = editUnitPrice !== '' ? Math.round(parseFloat(editUnitPrice)) : null;
    // Enforce invariant: if both qty and unit_price are set, amount must equal qty × unit_price
    if (numUnitPrice !== null && numUnitPrice > 0) {
      const expected = Math.round(numQty * numUnitPrice);
      if (expected !== numAmount) {
        toast.error(`Amount (${numAmount}) must equal Qty (${numQty}) × Unit Price (${numUnitPrice}) = ${expected}`);
        return;
      }
    }
    try {
      setIsSaving(true);
      const dto: UpdateExpenseDto = {
        amount: numAmount,
        quantity: numQty,
        unit_price: numUnitPrice,
        payment_method: editPaymentMethod || undefined,
        description: editDescription.trim() || undefined,
        notes: editNotes.trim() || undefined,
        expense_date: editDate || undefined,
      };
      await updateExpense(expense.id, dto);
      setIsEditing(false);
      onClose();
    } catch {
      // updateExpense already shows toast
    } finally {
      setIsSaving(false);
    }
  };

  if (!expense) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Hash className="w-5 h-5 text-blue-600" />
              {expense.expense_number}
            </h2>
            <p className="text-xs text-neutral-400">Expense Details</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Total Amount</span>
              <div className="text-2xl font-black text-neutral-900 dark:text-white">
                PKR {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              {expense.quantity && expense.quantity > 1 && expense.unit_price && (
                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  Qty: {expense.quantity} × PKR {expense.unit_price.toLocaleString()} per unit
                </div>
              )}
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                expense.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
              }`}
            >
              {expense.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" /> Category
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {expense.category_name || 'Operational Expense'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> Payment Method
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {expense.payment_method}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Date
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {new Date(expense.expense_date).toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Performed By
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {expense.performed_by_name || expense.performed_by || 'System / Admin'}
              </p>
            </div>
          </div>

          {/* FEATURE-01: Audit trail — creation metadata */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-700/50">
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
              Creation Record
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-0.5">
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Created Date
                </span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs">
                  {expense.created_at ? formatPKTDate(expense.created_at) : '—'}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Created Time
                </span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs">
                  {expense.created_at ? formatPKTTime(expense.created_at) : '—'}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <User className="w-3 h-3" /> Created By
                </span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs">
                  {expense.performed_by_name
                    ? `${expense.performed_by_name}${expense.performed_by_role ? ` (${expense.performed_by_role})` : ''}`
                    : 'Historical / Creator unavailable'}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Branch
                </span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs">
                  {expense.branch_name || expense.branch_id || '—'}
                </p>
              </div>
            </div>
          </div>

          {expense.description && (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-sm">
              <span className="text-xs font-semibold text-neutral-500 block mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Description
              </span>
              <p className="text-neutral-800 dark:text-neutral-200">{expense.description}</p>
            </div>
          )}

          {expense.notes && (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-sm">
              <span className="text-xs font-semibold text-neutral-500 block mb-1">Notes</span>
              <p className="text-neutral-600 dark:text-neutral-400">{expense.notes}</p>
            </div>
          )}

          {/* EXP-FIX-05: Inline edit form */}
          {isEditing && expense.status === 'COMPLETED' && (
            <form onSubmit={handleUpdate} className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3 animate-fade-in">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Edit Expense
              </p>
              {/* DEFECT-02 FIX: qty/unit_price/amount calculator — mirrors ExpenseCreateModal invariant */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editQuantity}
                    onChange={(e) => handleEditQuantityChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Unit Price (PKR)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editUnitPrice}
                    onChange={(e) => handleEditUnitPriceChange(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1 text-blue-600 font-semibold">Total Amount *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={editAmount}
                    onChange={(e) => handleEditTotalAmountChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-700 rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Payment Method</label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Expense description"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional remarks"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save Changes
                </button>
              </div>
            </form>
          )}

          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
            {expense.status === 'COMPLETED' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCancel(expense.id)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  <Ban className="w-4 h-4" /> Cancel
                </button>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                )}
              </div>
            ) : (
              <span className="text-xs text-neutral-400 italic">Expense is already cancelled</span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
