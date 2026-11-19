import React, { useState } from 'react';
import { X, Building2, Smartphone, Landmark, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, AccountType, CreateAccountPayload } from '@/services/accounts.api';
import { queryKeys } from '@/lib/react-query/queryKeys';

interface RegisterAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCOUNT_TYPES: { value: AccountType; label: string; placeholder: string }[] = [
  { value: 'JAZZCASH',  label: 'JazzCash',  placeholder: '03001234567' },
  { value: 'EASYPAISA', label: 'Easypaisa', placeholder: '03451234567' },
  { value: 'BANK',      label: 'Bank',       placeholder: 'Account number' },
];

const fmtPkr = (val: string): string => {
  const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return '';
  return n.toLocaleString();
};

const parsePkr = (val: string): number => {
  const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
};

export const RegisterAccountModal: React.FC<RegisterAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();

  const [accountType, setAccountType] = useState<AccountType>('JAZZCASH');
  const [name, setName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [openingBalanceDisplay, setOpeningBalanceDisplay] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (payload: CreateAccountPayload) => accountsApi.createAccount(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      handleClose();
    },
  });

  const handleClose = () => {
    setAccountType('JAZZCASH');
    setName('');
    setHolderName('');
    setAccountNumber('');
    setIban('');
    setBankName('');
    setOpeningBalanceDisplay('');
    setOpeningNote('');
    setFieldErrors({});
    mutation.reset();
    onClose();
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors['name'] = 'Account title is required.';
    if (!holderName.trim()) errors['holderName'] = 'Account holder name is required.';
    if (!accountNumber.trim()) errors['accountNumber'] = 'Account number is required.';
    if (accountType === 'JAZZCASH' || accountType === 'EASYPAISA') {
      const digits = accountNumber.replace(/\D/g, '');
      if (digits.length < 10) errors['accountNumber'] = 'Enter a valid mobile number (e.g. 03001234567).';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateAccountPayload = {
      name:                 name.trim(),
      account_type:         accountType,
      account_holder_name:  holderName.trim(),
      account_number:       accountNumber.trim(),
      iban:                 iban.trim() || null,
      bank_name:            bankName.trim() || null,
      opening_balance:      parsePkr(openingBalanceDisplay),
      opening_balance_note: openingNote.trim() || null,
    };
    mutation.mutate(payload);
  };

  const isBank = accountType === 'BANK';
  const selectedType = ACCOUNT_TYPES.find((t) => t.value === accountType)!;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Register Business Account
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Organization-owned account — opening balance recorded once
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 flex flex-col gap-5">

          {/* Account Type */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2 uppercase tracking-wider">
              Account Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const Icon = t.value === 'BANK' ? Landmark : Smartphone;
                const isActive = accountType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => { setAccountType(t.value); setAccountNumber(''); setFieldErrors({}); }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-blue-300 dark:hover:border-blue-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account Title */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Account Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. Niazi Mobile Mart — ${selectedType.label}`}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {fieldErrors['name'] && (
              <p className="text-xs text-rose-500 mt-1">{fieldErrors['name']}</p>
            )}
          </div>

          {/* Account Holder Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Account Holder Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="e.g. Muhammad Niazi"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {fieldErrors['holderName'] && (
              <p className="text-xs text-rose-500 mt-1">{fieldErrors['holderName']}</p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {isBank ? 'Bank Account Number' : `${selectedType.label} Number`} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={selectedType.placeholder}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {fieldErrors['accountNumber'] && (
              <p className="text-xs text-rose-500 mt-1">{fieldErrors['accountNumber']}</p>
            )}
          </div>

          {/* IBAN & Bank Name (bank only) */}
          {isBank && (
            <>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  IBAN <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="e.g. PK36HABB0000114488702801"
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Bank Name <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. HBL Islamic, Meezan Bank"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Opening Balance */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Opening Balance <span className="text-neutral-400 font-normal">(PKR, leave 0 if unknown)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 pointer-events-none">
                PKR
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={openingBalanceDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setOpeningBalanceDisplay(raw ? fmtPkr(raw) : '');
                }}
                placeholder="0"
                className="w-full pl-12 pr-3 py-2 text-sm font-mono bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Recorded once. Future corrections require an adjustment workflow.
            </p>
          </div>

          {/* Opening Balance Note */}
          {parsePkr(openingBalanceDisplay) > 0 && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Opening Balance Note <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
                placeholder="e.g. Balance as of October 2024 account statement"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* API error */}
          {mutation.isError && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-400">
                {(mutation.error as Error)?.message || 'Failed to register account. Please try again.'}
              </p>
            </div>
          )}

          {/* POS sync notice */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Note:</strong> Opening balance recorded. POS digital-payment synchronization is not yet implemented.
              Existing JazzCash, Easypaisa and bank POS collections are not reflected in this balance.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Registering…' : 'Register Account'}
          </button>
        </div>
      </div>
    </div>
  );
};
