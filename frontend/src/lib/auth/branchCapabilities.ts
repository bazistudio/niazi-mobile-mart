export enum InvoiceType {
  NormalSale = 1,
  RepairFinished = 2,
  RepairBooking = 3,
  UsedMobile = 4,
}

/**
 * Evaluates if a given branch code is authorized to access the specified invoice type.
 * 
 * Branch Matrix:
 * MAIN / BRANCH1: Type 1, Type 2, Type 3 allowed. Type 4 denied.
 * REPAIR / BRANCH2: Type 1 denied. Type 2, Type 3 allowed. Type 4 denied.
 * BRANCH3: Type 1 allowed. Type 2, Type 3 denied. Type 4 allowed.
 * BRANCH4: Type 1 allowed. Type 2, Type 3 denied. Type 4 allowed.
 * Unknown: DENY ALL
 */
export function canAccessInvoiceType(branchCode: string | null | undefined, type: InvoiceType): boolean {
  if (!branchCode) return false;

  const normalized = branchCode.trim().toUpperCase();

  switch (normalized) {
    case 'MAIN':
    case 'BRANCH1':
    case 'BRANCH_1':
    case 'BRANCH 1':
      return [InvoiceType.NormalSale, InvoiceType.RepairFinished, InvoiceType.RepairBooking].includes(type);

    case 'REPAIR':
    case 'BRANCH2':
    case 'BRANCH_2':
    case 'BRANCH 2':
      return [InvoiceType.RepairFinished, InvoiceType.RepairBooking].includes(type);

    case 'BRANCH3':
    case 'BRANCH_3':
    case 'BRANCH 3':
      return [InvoiceType.NormalSale, InvoiceType.UsedMobile].includes(type);

    case 'BRANCH4':
    case 'BRANCH_4':
    case 'BRANCH 4':
      return [InvoiceType.NormalSale, InvoiceType.UsedMobile].includes(type);

    default:
      return false;
  }
}
