export type AccountProvider = 'EASYPAISA' | 'JAZZCASH' | 'BANK';

export type PaymentHoldStatus = 'CLEARED' | 'ON_HOLD';

export interface AccountTransaction {
  id: string;
  referenceNumber: string;
  branchId: string;
  branchName: string;
  provider: AccountProvider;
  accountTitle: string;
  accountNumberMasked: string;
  amount: number;
  status: PaymentHoldStatus;
  holdReason?: string;
  senderName: string;
  timestamp: string;
}

export interface BusinessAccountSummary {
  provider: AccountProvider;
  name: string;
  accountTitle: string;
  accountNumberMasked: string;
  colorScheme: {
    bg: string;
    border: string;
    text: string;
    badgeBg: string;
    badgeText: string;
  };
  totalSent: number;
  clearedAmount: number;
  onHoldAmount: number;
  onHoldCount: number;
  transactions: AccountTransaction[];
  branchBreakdown?: {
    branchId: string;
    branchName: string;
    totalSent: number;
    clearedAmount: number;
    onHoldAmount: number;
    onHoldCount: number;
  }[];
}

