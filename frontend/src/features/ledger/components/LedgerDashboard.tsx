import React, { useState } from 'react';
import { 
  Search, ArrowLeft, Building2, User, Wallet, FileText, Download, 
  Printer, ArrowUpRight, ArrowDownRight, Filter, Calendar, CheckCircle2, SlidersHorizontal
} from 'lucide-react';

// --- Sample Offline Ledger Mock Data (matches user's legacy images) ---

interface PartyAccount {
  accountNo: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER';
  branchCode: string;
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
  balanceType: 'DR' | 'CR';
}

interface LedgerEntry {
  vNo: string;
  loc: string;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  balanceType: 'DR' | 'CR';
}

const SAMPLE_PARTIES: PartyAccount[] = [
  { accountNo: '401000002', name: 'ASIF SHAHZAD', type: 'CUSTOMER', branchCode: '401', openingBalance: 0, debitTotal: 497812, creditTotal: 356992, closingBalance: 140820, balanceType: 'DR' },
  { accountNo: '401000003', name: 'NASIR (MADINA MOBILE)', type: 'CUSTOMER', branchCode: '000', openingBalance: 61940, debitTotal: 340040, creditTotal: 294770, closingBalance: 45270, balanceType: 'DR' },
  { accountNo: '401000005', name: 'ZEE COMMUNICATION (SHAFQAT)', type: 'CUSTOMER', branchCode: '000', openingBalance: 17250, debitTotal: 194980, creditTotal: 170180, closingBalance: 24800, balanceType: 'DR' },
  { accountNo: '401000006', name: 'BILAL (A&C)', type: 'CUSTOMER', branchCode: '401', openingBalance: 0, debitTotal: 71469, creditTotal: 55370, closingBalance: 16099, balanceType: 'DR' },
  { accountNo: '401000007', name: 'ASIF REHMANIA MOBILE', type: 'CUSTOMER', branchCode: '401', openingBalance: 0, debitTotal: 124400, creditTotal: 96070, closingBalance: 28330, balanceType: 'DR' },
  { accountNo: '401000008', name: 'MALIK IMRAN (MALIK MOBILE)', type: 'CUSTOMER', branchCode: '401', openingBalance: 0, debitTotal: 204630, creditTotal: 152200, closingBalance: 52430, balanceType: 'DR' },
  { accountNo: '401000037', name: 'FARHAN AHMED LG-39', type: 'CUSTOMER', branchCode: '401', openingBalance: 0, debitTotal: 17000, creditTotal: 6250, closingBalance: 10750, balanceType: 'DR' },
  { accountNo: '401000041', name: 'KAMRAN MOTA BABLOO', type: 'CUSTOMER', branchCode: '401', openingBalance: 0, debitTotal: 46250, creditTotal: 23850, closingBalance: 22400, balanceType: 'DR' },
  { accountNo: '501000001', name: 'PEARL MOBILE PARTS COMPANY', type: 'SUPPLIER', branchCode: '000', openingBalance: -28550, debitTotal: 830440, creditTotal: 801890, closingBalance: 0, balanceType: 'DR' },
];

const SAMPLE_ENTRIES_NASIR: LedgerEntry[] = [
  { vNo: '—', loc: '000', date: '07/Sep/2026', particulars: 'Brought Forward Balance', debit: 0, credit: 0, balance: 61940, balanceType: 'DR' },
  { vNo: '2,640', loc: '000', date: '07/Sep/2026', particulars: 'SALE INVOICE UNIT OPPO A5S', debit: 1600, credit: 0, balance: 63540, balanceType: 'DR' },
  { vNo: '2,641', loc: '000', date: '07/Sep/2026', particulars: 'SALE INVOICE SIM TRAY OPPO A1K', debit: 200, credit: 0, balance: 63740, balanceType: 'DR' },
  { vNo: '2,670', loc: '000', date: '09/Sep/2026', particulars: 'SALE INVOICE UNIT CAMON 17', debit: 1780, credit: 0, balance: 65520, balanceType: 'DR' },
  { vNo: '357', loc: '000', date: '10/Sep/2026', particulars: 'PURCHASE X650 UNIT', debit: 0, credit: 1700, balance: 63820, balanceType: 'DR' },
  { vNo: '2,700', loc: '000', date: '11/Sep/2026', particulars: 'SALE INVOICE UNIT REDME 10C/12C', debit: 1750, credit: 0, balance: 65570, balanceType: 'DR' },
  { vNo: '362', loc: '000', date: '11/Sep/2026', particulars: 'C/R PAYMENT BY HAND NASIR', debit: 0, credit: 2000, balance: 63570, balanceType: 'DR' },
  { vNo: '2,712', loc: '000', date: '12/Sep/2026', particulars: 'SALE INVOICE X6631 UNIT 2PC / SPARK NEO8+', debit: 13500, credit: 0, balance: 77070, balanceType: 'DR' },
  { vNo: '2,718', loc: '000', date: '13/Sep/2026', particulars: 'SALE INVOICE UNIT X6531', debit: 1000, credit: 0, balance: 78070, balanceType: 'DR' },
];

const SAMPLE_ENTRIES_ZEE: LedgerEntry[] = [
  { vNo: '—', loc: '000', date: '07/Sep/2026', particulars: 'Brought Forward Balance', debit: 0, credit: 0, balance: 17250, balanceType: 'DR' },
  { vNo: '2,901', loc: '000', date: '28/Sep/2026', particulars: 'SALE INVOICE VIVO V19 UNIT / VIVO V27E OLED / REDMI A2+', debit: 13400, credit: 0, balance: 30650, balanceType: 'DR' },
  { vNo: '439', loc: '000', date: '29/Sep/2026', particulars: 'C/R BY HAND IMRAN', debit: 0, credit: 10000, balance: 20650, balanceType: 'DR' },
  { vNo: '2,908', loc: '000', date: '30/Sep/2026', particulars: 'SALE INVOICE UNIT X6531', debit: 1950, credit: 0, balance: 22600, balanceType: 'DR' },
  { vNo: '2,957', loc: '000', date: '03/Oct/2026', particulars: 'SALE INVOICE X573 UNIT S3', debit: 2200, credit: 0, balance: 24800, balanceType: 'DR' },
];

const SAMPLE_ENTRIES_PEARL: LedgerEntry[] = [
  { vNo: '—', loc: '000', date: '01/May/2026', particulars: 'Brought Forward Balance', debit: 0, credit: 28550, balance: 28550, balanceType: 'CR' },
  { vNo: '4', loc: '000', date: '12/Jun/2026', particulars: 'BALANCE NILL', debit: 28550, credit: 0, balance: 0, balanceType: 'DR' },
  { vNo: '663', loc: '000', date: '08/Jul/2026', particulars: 'GRN-I', debit: 0, credit: 126050, balance: 126050, balanceType: 'CR' },
  { vNo: '2', loc: '000', date: '14/Jul/2026', particulars: 'GRN-RY9 PRIME 2019 COPY UNIT', debit: 1650, credit: 0, balance: 124400, balanceType: 'CR' },
  { vNo: '4', loc: '000', date: '15/Jul/2026', particulars: 'GRN-RUNITS RETURN', debit: 83300, credit: 0, balance: 39250, balanceType: 'CR' },
  { vNo: '3', loc: '000', date: '11/Aug/2026', particulars: 'BANK TRF Bank', debit: 709970, credit: 0, balance: 0, balanceType: 'DR' },
];

export const LedgerDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SINGLE_PARTY' | 'RECEIVABLE_STATEMENT' | 'PAYABLE_STATEMENT'>('SINGLE_PARTY');
  const [selectedAccountNo, setSelectedAccountNo] = useState<string>('401000005');
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [fromDate, setFromDate] = useState('2026-09-07');
  const [toDate, setToDate] = useState('2026-10-07');
  const [excludeZero, setExcludeZero] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFormat, setPrintFormat] = useState<'A4' | 'A5' | 'A5_DETAIL' | 'THERMAL'>('A4');

  // Currently selected party object
  const partyObj = SAMPLE_PARTIES.find(p => p.accountNo === selectedAccountNo) || SAMPLE_PARTIES[2]!;

  // Ledger entries based on selected account
  const ledgerEntries = selectedAccountNo === '401000003' 
    ? SAMPLE_ENTRIES_NASIR 
    : selectedAccountNo === '501000001' 
      ? SAMPLE_ENTRIES_PEARL 
      : SAMPLE_ENTRIES_ZEE;

  const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
  const netBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1]!.balance : 0;
  const netBalanceType = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1]!.balanceType : 'DR';

  // Statement list filtering
  const filteredStatementParties = SAMPLE_PARTIES.filter(p => {
    if (activeTab === 'RECEIVABLE_STATEMENT' && p.type !== 'CUSTOMER') return false;
    if (activeTab === 'PAYABLE_STATEMENT' && p.type !== 'SUPPLIER') return false;
    if (excludeZero && p.closingBalance === 0) return false;
    if (selectedBranch !== 'ALL' && p.branchCode !== selectedBranch) return false;
    return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           p.accountNo.includes(searchTerm);
  });

  const statementTotalReceiving = filteredStatementParties.reduce((sum, p) => sum + p.closingBalance, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-[#006970]" />
            Business Ledger & Statements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Niazi Mobile Mart — General Ledger, Party Accounts & Receivable Statements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2 shadow-sm"
          >
            <Printer className="w-4 h-4" /> Print / Export Ledger
          </button>
        </div>
      </div>

      {/* Main View Tabs & Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
          <div className="flex bg-gray-100 dark:bg-gray-900 p-1.5 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('SINGLE_PARTY')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'SINGLE_PARTY'
                  ? 'bg-white dark:bg-gray-800 text-[#006970] shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <User className="w-4 h-4" /> Party Account Ledger
            </button>

            <button
              onClick={() => setActiveTab('RECEIVABLE_STATEMENT')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'RECEIVABLE_STATEMENT'
                  ? 'bg-white dark:bg-gray-800 text-[#006970] shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" /> Receivable Statement
            </button>

            <button
              onClick={() => setActiveTab('PAYABLE_STATEMENT')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'PAYABLE_STATEMENT'
                  ? 'bg-white dark:bg-gray-800 text-[#006970] shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" /> Payable Statement
            </button>
          </div>

          {/* Quick Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === 'SINGLE_PARTY' ? (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Select Party:</label>
                <select
                  value={selectedAccountNo}
                  onChange={(e) => setSelectedAccountNo(e.target.value)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#006970] outline-none"
                >
                  {SAMPLE_PARTIES.map((p) => (
                    <option key={p.accountNo} value={p.accountNo}>
                      {p.name} ({p.type}) — {p.accountNo}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search account name or number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#006970] outline-none w-64"
                />
              </div>
            )}
          </div>
        </div>

        {/* Date & Filter Bar (Matching legacy header toolbar) */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg font-bold text-gray-900 dark:text-white outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg font-bold text-gray-900 dark:text-white outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span>Branch:</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg font-bold text-gray-900 dark:text-white outline-none"
              >
                <option value="ALL">All Branches</option>
                <option value="000">000 - Main Branch</option>
                <option value="401">401 - Mobile Plaza</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={excludeZero}
                onChange={(e) => setExcludeZero(e.target.checked)}
                className="w-4 h-4 rounded text-[#006970] focus:ring-[#006970]"
              />
              Exclude Zero Balances
            </label>
          </div>
        </div>
      </div>

      {/* --- TAB 1: SINGLE PARTY LEDGER VIEW --- */}
      {activeTab === 'SINGLE_PARTY' && (
        <div className="space-y-6">
          {/* Party Header Banner */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 text-[10px] font-black rounded-md tracking-wider uppercase ${
                  partyObj.type === 'CUSTOMER' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                }`}>
                  {partyObj.type} LEDGER
                </span>
                <span className="text-xs font-mono font-bold text-gray-400">ACC: {partyObj.accountNo}</span>
              </div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{partyObj.name}</h2>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Company: NIAZI MOBILE | Branch Loc: {partyObj.branchCode} | Date Range: {fromDate} to {toDate}
              </p>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 min-w-[130px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Debits</p>
                <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1">
                  PKR {totalDebit.toLocaleString()}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 min-w-[130px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Credits</p>
                <p className="text-lg font-black text-green-600 dark:text-green-400 mt-1">
                  PKR ({totalCredit.toLocaleString()})
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 min-w-[140px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net Balance</p>
                <p className={`text-lg font-black mt-1 ${netBalanceType === 'DR' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  PKR {netBalance.toLocaleString()} {netBalanceType}
                </p>
              </div>
            </div>
          </div>

          {/* Classic Ledger Sheet Table (Matches Sample Images 1, 2, 5) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                Statement of Account — {partyObj.name}
              </h3>
              <span className="text-xs font-mono font-bold text-gray-500">SAP CRYSTAL REPORT COMPATIBLE</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-medium">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 w-20">V No</th>
                    <th className="py-3.5 px-4 w-16">Loc</th>
                    <th className="py-3.5 px-4 w-28">Date</th>
                    <th className="py-3.5 px-6">Particulars</th>
                    <th className="py-3.5 px-4 text-right w-28">Debit</th>
                    <th className="py-3.5 px-4 text-right w-28">Credit</th>
                    <th className="py-3.5 px-4 text-right w-32">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {ledgerEntries.map((row, idx) => (
                    <tr 
                      key={idx} 
                      className={`hover:bg-blue-50/50 dark:hover:bg-gray-700/40 transition-colors ${
                        idx === 0 ? 'bg-amber-50/40 dark:bg-amber-950/20 font-bold' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-gray-800 dark:text-gray-200">{row.vNo}</td>
                      <td className="py-3 px-4 font-mono text-gray-500">{row.loc}</td>
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.date}</td>
                      <td className="py-3 px-6 text-gray-900 dark:text-white font-semibold">{row.particulars}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 dark:text-gray-100">
                        {row.debit > 0 ? row.debit.toLocaleString() : '0'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-600 dark:text-gray-400">
                        {row.credit > 0 ? `(${row.credit.toLocaleString()})` : '0'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 dark:text-white">
                        {row.balance.toLocaleString()} {row.balanceType}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 dark:bg-gray-900 font-black text-sm text-gray-900 dark:text-white border-t-2 border-gray-300 dark:border-gray-600">
                    <td colSpan={4} className="py-4 px-6 text-right uppercase tracking-wider">
                      Net Balance
                    </td>
                    <td className="py-4 px-4 text-right text-blue-600 dark:text-blue-400 font-mono">
                      {totalDebit.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right text-green-600 dark:text-green-400 font-mono">
                      ({totalCredit.toLocaleString()})
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-amber-600 dark:text-amber-400">
                      {netBalance.toLocaleString()} {netBalanceType}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2 & 3: RECEIVABLE / PAYABLE STATEMENT SUMMARY (Matches Sample Images 3 & 4) --- */}
      {activeTab !== 'SINGLE_PARTY' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-wider">
                {activeTab === 'RECEIVABLE_STATEMENT' ? 'RECEIVABLE STATEMENT' : 'PAYABLE STATEMENT'}
              </h2>
              <p className="text-xs font-semibold text-gray-500 mt-1">
                Company: NIAZI MOBILE | Branch Filter: {selectedBranch} | Total Accounts: {filteredStatementParties.length}
              </p>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 rounded-xl text-right">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Total {activeTab === 'RECEIVABLE_STATEMENT' ? 'Receiving' : 'Payable'}
              </p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                PKR {statementTotalReceiving.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-medium">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 w-32">Account No</th>
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-4 text-right w-28">Opening</th>
                    <th className="py-3.5 px-4 text-right w-28">Debit</th>
                    <th className="py-3.5 px-4 text-right w-28">Credit</th>
                    <th className="py-3.5 px-4 text-right w-36">C Balance</th>
                    <th className="py-3.5 px-4 text-center w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {filteredStatementParties.map((party) => (
                    <tr 
                      key={party.accountNo}
                      className="hover:bg-blue-50/50 dark:hover:bg-gray-700/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-800 dark:text-gray-200">{party.accountNo}</td>
                      <td className="py-3.5 px-6 font-bold text-gray-900 dark:text-white">{party.name}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-500">
                        {party.openingBalance !== 0 ? party.openingBalance.toLocaleString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900 dark:text-gray-100">
                        {party.debitTotal.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-600 dark:text-gray-400">
                        ({party.creditTotal.toLocaleString()})
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-gray-900 dark:text-white">
                        {party.closingBalance.toLocaleString()} {party.balanceType}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedAccountNo(party.accountNo);
                            setActiveTab('SINGLE_PARTY');
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-[#006970] hover:bg-[#005258] text-white rounded-lg transition-colors"
                        >
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 dark:bg-gray-900 font-black text-sm text-gray-900 dark:text-white border-t-2 border-gray-300 dark:border-gray-600">
                    <td colSpan={5} className="py-4 px-6 text-right uppercase tracking-wider">
                      T Receiving Total:
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      PKR {statementTotalReceiving.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- PRINT / EXPORT PREVIEW MODAL --- */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl max-w-2xl w-full p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#006970]" /> Select Ledger Print Format
              </h3>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPrintFormat('A4')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  printFormat === 'A4' ? 'border-[#006970] bg-teal-50/30 dark:bg-teal-950/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="font-black text-sm text-gray-900 dark:text-white">A4 Standard Statement</div>
                <div className="text-xs text-gray-500 mt-1">Full width office report print format</div>
              </button>

              <button
                onClick={() => setPrintFormat('A5')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  printFormat === 'A5' ? 'border-[#006970] bg-teal-50/30 dark:bg-teal-950/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="font-black text-sm text-gray-900 dark:text-white">A5 Compact Ledger</div>
                <div className="text-xs text-gray-500 mt-1">Half-sheet compact ledger layout</div>
              </button>

              <button
                onClick={() => setPrintFormat('A5_DETAIL')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  printFormat === 'A5_DETAIL' ? 'border-[#006970] bg-teal-50/30 dark:bg-teal-950/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="font-black text-sm text-gray-900 dark:text-white">A5 Detail Ledger</div>
                <div className="text-xs text-gray-500 mt-1">Includes unit level item breakdown</div>
              </button>

              <button
                onClick={() => setPrintFormat('THERMAL')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  printFormat === 'THERMAL' ? 'border-[#006970] bg-teal-50/30 dark:bg-teal-950/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="font-black text-sm text-gray-900 dark:text-white">80mm Thermal Receipt</div>
                <div className="text-xs text-gray-500 mt-1">POS thermal slip printer layout</div>
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  window.print();
                  setShowPrintModal(false);
                }}
                className="px-6 py-2.5 bg-[#006970] hover:bg-[#005a60] text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2"
              >
                <Printer className="w-4 h-4" /> Print Selected Format ({printFormat})
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
