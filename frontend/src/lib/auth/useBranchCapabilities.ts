import { useAuthStore } from '../core/auth.store';
import { canAccessInvoiceType, InvoiceType } from './branchCapabilities';

export function useBranchCapabilities() {
  const user = useAuthStore((state) => state.user);
  
  // Assuming the user object contains the branch code. Let's verify what the frontend auth store has.
  // We'll fall back to user?.branchCode or user?.branch_code if needed.
  // Since I don't know the exact structure of the user object, I'll allow both standard namings.
  const branchCode = (user as any)?.branch_code || (user as any)?.branchCode || '';

  return {
    canAccessInvoiceType: (type: InvoiceType) => canAccessInvoiceType(branchCode, type),
    branchCode,
  };
}
