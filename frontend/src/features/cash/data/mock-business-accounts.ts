import { BusinessAccountSummary, AccountTransaction } from '../types/business-accounts.types';

// Sample branch payments matching user's exact examples:
// Branch Alfa: JazzCash 2500, 260, 480 (Total 3240) | Bank 4800, 8450, 9000 (Total 22250) | EasyPaisa 1800, 450
// Branch Beta: JazzCash 6500 | Bank 14200 | EasyPaisa 3100
// Main Branch: JazzCash 8200 | Bank 31000 | EasyPaisa 9400
export const MOCK_BRANCH_TRANSACTIONS: AccountTransaction[] = [
  // Branch Alfa
  {
    id: 'tx-alfa-jc-1',
    referenceNumber: 'JC-ALF-9021',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'JAZZCASH',
    accountTitle: 'Niazi Mobile Mart - Merchant',
    accountNumberMasked: '0300-****481',
    amount: 2500,
    status: 'CLEARED',
    senderName: 'Muhammad Tariq',
    timestamp: '10:14 AM',
  },
  {
    id: 'tx-alfa-jc-2',
    referenceNumber: 'JC-ALF-9022',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'JAZZCASH',
    accountTitle: 'Niazi Mobile Mart - Merchant',
    accountNumberMasked: '0300-****481',
    amount: 260,
    status: 'CLEARED',
    senderName: 'Kamran Ali',
    timestamp: '10:28 AM',
  },
  {
    id: 'tx-alfa-jc-3',
    referenceNumber: 'JC-ALF-9023',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'JAZZCASH',
    accountTitle: 'Niazi Mobile Mart - Merchant',
    accountNumberMasked: '0300-****481',
    amount: 480,
    status: 'ON_HOLD',
    holdReason: 'Awaiting Bank/Wallet SMS Confirmation',
    senderName: 'Rashid Mehmood',
    timestamp: '11:05 AM',
  },
  {
    id: 'tx-alfa-bk-1',
    referenceNumber: 'HBL-ALF-4011',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'BANK',
    accountTitle: 'Niazi Mobile Mart Main Business A/C',
    accountNumberMasked: '0234-********1920',
    amount: 4800,
    status: 'CLEARED',
    senderName: 'Shahid Khan (Wholesale)',
    timestamp: '09:45 AM',
  },
  {
    id: 'tx-alfa-bk-2',
    referenceNumber: 'HBL-ALF-4012',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'BANK',
    accountTitle: 'Niazi Mobile Mart Main Business A/C',
    accountNumberMasked: '0234-********1920',
    amount: 8450,
    status: 'CLEARED',
    senderName: 'Hamza Malik',
    timestamp: '10:52 AM',
  },
  {
    id: 'tx-alfa-bk-3',
    referenceNumber: 'HBL-ALF-4013',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'BANK',
    accountTitle: 'Niazi Mobile Mart Main Business A/C',
    accountNumberMasked: '0234-********1920',
    amount: 9000,
    status: 'ON_HOLD',
    holdReason: 'Interbank IBFT Transfer Verification Pending',
    senderName: 'Farhan POS Repair',
    timestamp: '11:18 AM',
  },
  {
    id: 'tx-alfa-ep-1',
    referenceNumber: 'EP-ALF-301',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'EASYPAISA',
    accountTitle: 'Niazi Mobile Mart - Retail',
    accountNumberMasked: '0345-****890',
    amount: 1800,
    status: 'CLEARED',
    senderName: 'Naveed Akhtar',
    timestamp: '10:12 AM',
  },
  {
    id: 'tx-alfa-ep-2',
    referenceNumber: 'EP-ALF-302',
    branchId: 'branch_alfa',
    branchName: 'branch alfa',
    provider: 'EASYPAISA',
    accountTitle: 'Niazi Mobile Mart - Retail',
    accountNumberMasked: '0345-****890',
    amount: 450,
    status: 'ON_HOLD',
    holdReason: 'Customer Screenshot Submitted — Float Uncredited',
    senderName: 'Zubair Bilal',
    timestamp: '11:02 AM',
  },

  // Branch Beta
  {
    id: 'tx-beta-jc-1',
    referenceNumber: 'JC-BET-501',
    branchId: 'branch_beta',
    branchName: 'branch beta',
    provider: 'JAZZCASH',
    accountTitle: 'Niazi Mobile Mart - Merchant',
    accountNumberMasked: '0300-****481',
    amount: 6500,
    status: 'CLEARED',
    senderName: 'Customer Walk-in Beta',
    timestamp: '10:30 AM',
  },
  {
    id: 'tx-beta-bk-1',
    referenceNumber: 'HBL-BET-502',
    branchId: 'branch_beta',
    branchName: 'branch beta',
    provider: 'BANK',
    accountTitle: 'Niazi Mobile Mart Main Business A/C',
    accountNumberMasked: '0234-********1920',
    amount: 14200,
    status: 'CLEARED',
    senderName: 'Wholesale Invoice 892',
    timestamp: '11:00 AM',
  },
  {
    id: 'tx-beta-ep-1',
    referenceNumber: 'EP-BET-503',
    branchId: 'branch_beta',
    branchName: 'branch beta',
    provider: 'EASYPAISA',
    accountTitle: 'Niazi Mobile Mart - Retail',
    accountNumberMasked: '0345-****890',
    amount: 3100,
    status: 'CLEARED',
    senderName: 'Shop Beta Cashier',
    timestamp: '09:20 AM',
  },

  // Main Branch
  {
    id: 'tx-main-jc-1',
    referenceNumber: 'JC-MAIN-701',
    branchId: '00000000-0000-0000-0000-000000000002',
    branchName: 'Main Branch',
    provider: 'JAZZCASH',
    accountTitle: 'Niazi Mobile Mart - Merchant',
    accountNumberMasked: '0300-****481',
    amount: 8200,
    status: 'CLEARED',
    senderName: 'Main Mobile Counter',
    timestamp: '09:10 AM',
  },
  {
    id: 'tx-main-bk-1',
    referenceNumber: 'HBL-MAIN-702',
    branchId: '00000000-0000-0000-0000-000000000002',
    branchName: 'Main Branch',
    provider: 'BANK',
    accountTitle: 'Niazi Mobile Mart Main Business A/C',
    accountNumberMasked: '0234-********1920',
    amount: 31000,
    status: 'CLEARED',
    senderName: 'Bulk Accessories Settlement',
    timestamp: '10:40 AM',
  },
  {
    id: 'tx-main-ep-1',
    referenceNumber: 'EP-MAIN-703',
    branchId: '00000000-0000-0000-0000-000000000002',
    branchName: 'Main Branch',
    provider: 'EASYPAISA',
    accountTitle: 'Niazi Mobile Mart - Retail',
    accountNumberMasked: '0345-****890',
    amount: 9400,
    status: 'CLEARED',
    senderName: 'Retail Customer Direct',
    timestamp: '10:55 AM',
  },
];

/**
 * Computes business account summaries tailored either to a single selected branch
 * or aggregated across all branches with per-branch breakdown for admin overview.
 */
export function getBusinessAccountsSummary(
  currentBranchId?: string | null,
  currentBranchName?: string | null
): BusinessAccountSummary[] {
  const isAllBranches = !currentBranchId;

  // Filter transactions for specific branch if not in all-branches mode
  const relevantTransactions = isAllBranches
    ? MOCK_BRANCH_TRANSACTIONS
    : MOCK_BRANCH_TRANSACTIONS.filter((tx) => {
        if (currentBranchId === tx.branchId) return true;
        if (currentBranchName && tx.branchName.toLowerCase().includes(currentBranchName.toLowerCase())) {
          return true;
        }
        return false;
      });

  const providers: {
    provider: BusinessAccountSummary['provider'];
    name: string;
    accountTitle: string;
    accountNumberMasked: string;
    colorScheme: BusinessAccountSummary['colorScheme'];
  }[] = [
    {
      provider: 'EASYPAISA',
      name: 'EasyPaisa',
      accountTitle: 'Niazi Mobile Mart - Retail',
      accountNumberMasked: '0345-****890',
      colorScheme: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        border: 'border-emerald-200 dark:border-emerald-800',
        text: 'text-emerald-700 dark:text-emerald-300',
        badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60',
        badgeText: 'text-emerald-800 dark:text-emerald-200',
      },
    },
    {
      provider: 'JAZZCASH',
      name: 'JazzCash',
      accountTitle: 'Niazi Mobile Mart - Merchant',
      accountNumberMasked: '0300-****481',
      colorScheme: {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        border: 'border-amber-200 dark:border-amber-800',
        text: 'text-amber-700 dark:text-amber-300',
        badgeBg: 'bg-amber-100 dark:bg-amber-900/60',
        badgeText: 'text-amber-800 dark:text-amber-200',
      },
    },
    {
      provider: 'BANK',
      name: 'Bank Accounts',
      accountTitle: 'Niazi Mobile Mart - HBL Islamic',
      accountNumberMasked: '0234-********1920',
      colorScheme: {
        bg: 'bg-blue-50 dark:bg-blue-950/40',
        border: 'border-blue-200 dark:border-blue-800',
        text: 'text-blue-700 dark:text-blue-300',
        badgeBg: 'bg-blue-100 dark:bg-blue-900/60',
        badgeText: 'text-blue-800 dark:text-blue-200',
      },
    },
  ];

  return providers.map((p) => {
    const txs = relevantTransactions.filter((t) => t.provider === p.provider);
    const totalSent = txs.reduce((acc, t) => acc + t.amount, 0);
    const clearedAmount = txs
      .filter((t) => t.status === 'CLEARED')
      .reduce((acc, t) => acc + t.amount, 0);
    const onHoldTxs = txs.filter((t) => t.status === 'ON_HOLD');
    const onHoldAmount = onHoldTxs.reduce((acc, t) => acc + t.amount, 0);

    // Multi-branch breakdown for Admin
    let branchBreakdown: BusinessAccountSummary['branchBreakdown'] | undefined = undefined;
    if (isAllBranches) {
      const branchMap = new Map<
        string,
        { branchName: string; total: number; cleared: number; onHold: number; onHoldCount: number }
      >();
      for (const t of MOCK_BRANCH_TRANSACTIONS.filter((item) => item.provider === p.provider)) {
        const cur = branchMap.get(t.branchId) || {
          branchName: t.branchName,
          total: 0,
          cleared: 0,
          onHold: 0,
          onHoldCount: 0,
        };
        cur.total += t.amount;
        if (t.status === 'CLEARED') cur.cleared += t.amount;
        if (t.status === 'ON_HOLD') {
          cur.onHold += t.amount;
          cur.onHoldCount += 1;
        }
        branchMap.set(t.branchId, cur);
      }
      branchBreakdown = Array.from(branchMap.entries()).map(([branchId, stats]) => ({
        branchId,
        branchName: stats.branchName,
        totalSent: stats.total,
        clearedAmount: stats.cleared,
        onHoldAmount: stats.onHold,
        onHoldCount: stats.onHoldCount,
      }));
    }

    return {
      provider: p.provider,
      name: p.name,
      accountTitle: p.accountTitle,
      accountNumberMasked: p.accountNumberMasked,
      colorScheme: p.colorScheme,
      totalSent,
      clearedAmount,
      onHoldAmount,
      onHoldCount: onHoldTxs.length,
      transactions: txs,
      branchBreakdown,
    };
  });
}

