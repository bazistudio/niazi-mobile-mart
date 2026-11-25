'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, X, Eye, EyeOff, Lock, Trash2, Hash } from 'lucide-react';
import { InventoryProduct } from '@/features/inventory/types';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { settingsApi } from '@/features/settings/services/settings.api';
import toast from 'react-hot-toast';

export interface ProductDeleteDialogProps {
  product: InventoryProduct;
  onClose: () => void;
}

export function ProductDeleteDialog({ product, onClose }: ProductDeleteDialogProps) {
  const { deleteProduct, isDeleting } = useProducts({ page: 1, limit: 10 }, { enabled: false });
  const [credTab, setCredTab] = useState<'password' | 'pin'>('password');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (credTab === 'pin') {
      if (!adminPin.trim() || !/^\d{4}$/.test(adminPin.trim())) {
        setErrorMsg('Please enter your 4-digit administrator PIN.');
        return;
      }
    } else {
      if (!adminPassword.trim()) {
        setErrorMsg('Admin Password is required to authorize deletion.');
        return;
      }
    }

    setIsVerifying(true);
    try {
      // Verify credential before deletion
      await settingsApi.verifyAdminCredential(
        credTab === 'pin' ? { admin_pin: adminPin.trim() } : { admin_password: adminPassword.trim() }
      );
    } catch (err: unknown) {
      setIsVerifying(false);
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('LOCKED_OUT') || msg.includes('locked')) {
        setErrorMsg('Too many failed attempts. PIN entry locked for 5 minutes.');
      } else if (msg.includes('NO_PIN_CONFIGURED')) {
        setErrorMsg('No PIN is configured on this admin account. Use password instead.');
      } else {
        setErrorMsg(credTab === 'pin' ? 'Incorrect administrator PIN.' : 'Incorrect administrator password.');
      }
      return;
    }
    setIsVerifying(false);

    try {
      const credential = credTab === 'pin'
        ? { admin_pin: adminPin.trim() }
        : { admin_password: adminPassword.trim() };
      await deleteProduct({ id: product.id, credential });
      toast.success(`Product "${product.name}" permanently deleted from stock.`);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to delete product', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to delete product.';
      toast.error(errMsg);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800 p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <form onSubmit={handleConfirmDelete} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Delete Product Entry
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Hard delete row from stock directory
              </p>
            </div>
          </div>

          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-800 dark:text-red-300 space-y-1">
            <p className="font-semibold">⚠️ Hard Deletion Warning</p>
            <p>
              Are you sure you want to delete <span className="font-bold underline">{product.name}</span> (SKU: {product.sku || 'N/A'})?
              This action will permanently purge this specific entry and its stock ({product.stock} units) from your inventory.
            </p>
          </div>

          {/* Admin Credential Security Gate */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-red-500" />
              Admin Authorization
            </label>

            {/* Credential tab switcher */}
            <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              <button
                type="button"
                onClick={() => { setCredTab('password'); setErrorMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${ credTab === 'password' ? 'bg-red-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200' }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => { setCredTab('pin'); setErrorMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${ credTab === 'pin' ? 'bg-red-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200' }`}
              >
                <Hash className="w-3.5 h-3.5" /> PIN
              </button>
            </div>

            {credTab === 'password' ? (
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Enter Admin Password..."
                  className={`block w-full pr-10 pl-3 py-2 text-sm border rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                    errorMsg ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
                  }`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={adminPin}
                onChange={(e) => {
                  setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="••••"
                className={`block w-full px-3 py-2 text-sm border rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-center tracking-[0.5em] focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                  errorMsg ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
                }`}
                autoFocus
              />
            )}
            {errorMsg && <p className="mt-1.5 text-xs text-red-500 font-medium">{errorMsg}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting || isVerifying || (credTab === 'password' ? !adminPassword.trim() : adminPin.length !== 4)}
              className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {isDeleting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4" /> Hard Delete</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProductDeleteDialog;
