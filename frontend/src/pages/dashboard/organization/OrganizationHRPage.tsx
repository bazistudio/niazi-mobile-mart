/**
 * OrganizationHRPage — HR Management Prototype
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  PROTOTYPE / MOCK DATA — NOT CONNECTED TO ANY BACKEND           ║
 * ║  All data displayed here is fabricated for UI demonstration only.   ║
 * ║  No real staff records, attendance, salary, or leave data is shown. ║
 * ║  No writes are made to any database or backend service.             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Scope constraints (must not be removed):
 *  - No new database tables or migrations
 *  - No new HR backend endpoints or services
 *  - No production attendance recording
 *  - No real check-in/check-out writes
 *  - No payroll calculations used for actual payments
 *  - No real salary payment or deduction transactions
 *  - No production staff data seeding
 *  - No new HR permissions invented independently of the existing authorization model
 */

import React, { useState, useMemo } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import {
  Users,
  DollarSign,
  Calendar,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Building2,
  TrendingUp,
  AlertCircle,
  Coffee,
  Umbrella,
  Star,
  Plus,
  CreditCard,
  Banknote,
  History,
} from 'lucide-react';

// ─── MOCK DATA BANNER ─────────────────────────────────────────────────────────

const MockBanner: React.FC = () => (
  <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl text-amber-800 dark:text-amber-300">
    <AlertCircle className="w-4 h-4 shrink-0" />
    <p className="text-xs font-semibold">
      PROTOTYPE — All data below is fabricated for UI demonstration. No real records are shown or written.
    </p>
  </div>
);

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// All values are fictional and exist only to illustrate the interface layout.

const MOCK_BRANCHES = ['Main Branch', 'Gulberg Branch', 'DHA Branch'] as const;

interface MockStaffRecord {
  id: string;
  name: string;
  role: string;
  branch: string;
  status: 'Present' | 'Absent' | 'Late' | 'On Leave';
  checkIn: string;
  checkOut: string;
  hoursToday: number;
}

const MOCK_STAFF: MockStaffRecord[] = [
  { id: 's1', name: 'Ahmed Raza', role: 'SHOP_ADMIN', branch: 'Main Branch', status: 'Present', checkIn: '09:02', checkOut: '—', hoursToday: 6.5 },
  { id: 's2', name: 'Bilal Hussain', role: 'MANAGER', branch: 'Main Branch', status: 'Present', checkIn: '08:55', checkOut: '—', hoursToday: 6.8 },
  { id: 's3', name: 'Sana Tariq', role: 'CASHIER', branch: 'Gulberg Branch', status: 'Late', checkIn: '10:45', checkOut: '—', hoursToday: 4.9 },
  { id: 's4', name: 'Khalid Mehmood', role: 'TECHNICIAN', branch: 'DHA Branch', status: 'Absent', checkIn: '—', checkOut: '—', hoursToday: 0 },
  { id: 's5', name: 'Fatima Shah', role: 'CASHIER', branch: 'Main Branch', status: 'On Leave', checkIn: '—', checkOut: '—', hoursToday: 0 },
  { id: 's6', name: 'Usman Ali', role: 'TECHNICIAN', branch: 'Gulberg Branch', status: 'Present', checkIn: '09:10', checkOut: '—', hoursToday: 6.3 },
];

interface MockSalaryRecord {
  id: string;
  name: string;
  role: string;
  branch: string;
  baseSalary: number;
  daysWorked: number;
  totalDays: number;
  deductions: number;
  bonus: number;
  advanceDeducted?: number;
  remainingAdvance?: number;
  netPayable: number;
  status: 'Paid' | 'Pending' | 'Partial';
}

export type DisbursementMethod = 'Cash' | 'Bank Transfer';

export interface StaffAdvanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  branch: string;
  amount: number;
  date: string;
  disbursementMethod: DisbursementMethod;
  notes: string;
  createdAt: string;
}

const STORAGE_KEY_ADVANCES = 'nmm_prototype_staff_advances_v1';

const INITIAL_MOCK_ADVANCES: StaffAdvanceRecord[] = [
  {
    id: 'adv-1',
    staffId: 's1',
    staffName: 'Ahmed Raza',
    branch: 'Main Branch',
    amount: 10000,
    date: '2026-10-15',
    disbursementMethod: 'Cash',
    notes: 'Advance taken for family medical emergency',
    createdAt: '2026-10-15T10:00:00Z',
  },
  {
    id: 'adv-2',
    staffId: 's3',
    staffName: 'Sana Tariq',
    branch: 'Gulberg Branch',
    amount: 5000,
    date: '2026-10-20',
    disbursementMethod: 'Bank Transfer',
    notes: 'Advance for travel expenses',
    createdAt: '2026-10-20T14:30:00Z',
  },
];

const loadStoredAdvances = (): StaffAdvanceRecord[] => {
  if (typeof window === 'undefined') return INITIAL_MOCK_ADVANCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADVANCES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_ADVANCES, JSON.stringify(INITIAL_MOCK_ADVANCES));
      return INITIAL_MOCK_ADVANCES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item: any) => ({
        id: String(item.id || `adv-${Date.now()}`),
        staffId: String(item.staffId || ''),
        staffName: String(item.staffName || ''),
        branch: String(item.branch || ''),
        amount: Number(item.amount) || 0,
        date: String(item.date || new Date().toISOString().split('T')[0]),
        disbursementMethod: item.disbursementMethod === 'Bank Transfer' ? 'Bank Transfer' : 'Cash',
        notes: String(item.notes || ''),
        createdAt: String(item.createdAt || new Date().toISOString()),
      }));
    }
    return INITIAL_MOCK_ADVANCES;
  } catch (err) {
    console.error('Failed to load prototype advances from localStorage:', err);
    return INITIAL_MOCK_ADVANCES;
  }
};

const saveStoredAdvances = (records: StaffAdvanceRecord[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ADVANCES, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to persist prototype advances to localStorage:', err);
  }
};

const MOCK_SALARIES: MockSalaryRecord[] = [
  { id: 'sal1', name: 'Ahmed Raza', role: 'SHOP_ADMIN', branch: 'Main Branch', baseSalary: 45000, daysWorked: 24, totalDays: 26, deductions: 3462, bonus: 5000, netPayable: 46538, status: 'Pending' },
  { id: 'sal2', name: 'Bilal Hussain', role: 'MANAGER', branch: 'Main Branch', baseSalary: 38000, daysWorked: 25, totalDays: 26, deductions: 1462, bonus: 2000, netPayable: 38538, status: 'Pending' },
  { id: 'sal3', name: 'Sana Tariq', role: 'CASHIER', branch: 'Gulberg Branch', baseSalary: 28000, daysWorked: 22, totalDays: 26, deductions: 4308, bonus: 0, netPayable: 23692, status: 'Partial' },
  { id: 'sal4', name: 'Khalid Mehmood', role: 'TECHNICIAN', branch: 'DHA Branch', baseSalary: 32000, daysWorked: 20, totalDays: 26, deductions: 7385, bonus: 0, netPayable: 24615, status: 'Paid' },
  { id: 'sal5', name: 'Fatima Shah', role: 'CASHIER', branch: 'Main Branch', baseSalary: 28000, daysWorked: 23, totalDays: 26, deductions: 3231, bonus: 1000, netPayable: 25769, status: 'Pending' },
  { id: 'sal6', name: 'Usman Ali', role: 'TECHNICIAN', branch: 'Gulberg Branch', baseSalary: 30000, daysWorked: 25, totalDays: 26, deductions: 1154, bonus: 1500, netPayable: 30346, status: 'Paid' },
];

interface MockLeavePolicy {
  id: string;
  type: string;
  icon: React.ElementType;
  daysAllowed: number;
  description: string;
  color: string;
}

const MOCK_LEAVE_POLICIES: MockLeavePolicy[] = [
  { id: 'lp1', type: 'Casual Leave', icon: Coffee, daysAllowed: 12, description: 'For personal or family needs, short-notice allowed.', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'lp2', type: 'Sick Leave', icon: AlertCircle, daysAllowed: 10, description: 'Medical emergencies; doctor note required after 2 days.', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
  { id: 'lp3', type: 'Annual Leave', icon: Umbrella, daysAllowed: 14, description: 'Planned vacations; minimum 1-week notice required.', color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { id: 'lp4', type: 'Performance Bonus Leave', icon: Star, daysAllowed: 3, description: 'Extra leave awarded on exceeding quarterly targets.', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
];

const MOCK_ATTENDANCE_RULES = [
  { label: 'Work Hours / Day', value: '9 hours', note: 'Standard shift' },
  { label: 'Late Threshold', value: '15 minutes', note: 'After this counts as late' },
  { label: 'Late Deduction', value: '1/26 of salary', note: 'Per late occurrence (≥3)' },
  { label: 'Absent Deduction', value: '1/26 of salary', note: 'Per absent day' },
  { label: 'Weekend Policy', value: 'Sunday Off', note: 'Saturday half-day optional' },
  { label: 'Overtime Rate', value: '1.5× hourly', note: 'Beyond 9 hrs with manager approval' },
];

// ─── STATUS BADGE ──────────────────────────────────────────────────────────────

const AttendanceStatusBadge: React.FC<{ status: MockStaffRecord['status'] }> = ({ status }) => {
  const styles: Record<MockStaffRecord['status'], string> = {
    Present: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    Late: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    Absent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    'On Leave': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  };
  const icons: Record<MockStaffRecord['status'], React.ElementType> = {
    Present: CheckCircle2,
    Late: Clock,
    Absent: XCircle,
    'On Leave': Calendar,
  };
  const Icon = icons[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

const SalaryStatusBadge: React.FC<{ status: MockSalaryRecord['status'] }> = ({ status }) => {
  const styles: Record<MockSalaryRecord['status'], string> = {
    Paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    Pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    Partial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
};

// ─── REVIEW MODAL ─────────────────────────────────────────────────────────────

interface StaffReviewModalProps {
  record: MockSalaryRecord | null;
  onClose: () => void;
}

const StaffReviewModal: React.FC<StaffReviewModalProps> = ({ record, onClose }) => {
  if (!record) return null;

  const attendanceRecord = MOCK_STAFF.find(s => s.name === record.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{record.name}</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{record.role}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{record.branch}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mock data notice inside modal */}
        <div className="mx-6 mt-4 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Mock data — no real records</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Attendance Summary */}
          {attendanceRecord && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Today's Attendance</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                  <AttendanceStatusBadge status={attendanceRecord.status} />
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Check In</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{attendanceRecord.checkIn}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hours</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{attendanceRecord.hoursToday > 0 ? `${attendanceRecord.hoursToday}h` : '—'}</p>
                </div>
              </div>
            </section>
          )}

          {/* Salary Breakdown */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">October 2026 Salary (Mock)</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">Base Salary</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Rs {record.baseSalary.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">Days Worked</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{record.daysWorked} / {record.totalDays}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">Deductions</span>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">- Rs {record.deductions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">Bonus</span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+ Rs {record.bonus.toLocaleString()}</span>
              </div>
              {(record.advanceDeducted !== undefined && record.advanceDeducted > 0) && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-900/10 px-2 rounded-lg">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Advance Deducted</span>
                    <span className="text-xs text-amber-600/80 dark:text-amber-400/80">Auto-deducted from owner advances</span>
                  </div>
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    - Rs {record.advanceDeducted.toLocaleString()}
                  </span>
                </div>
              )}
              {record.remainingAdvance !== undefined && record.remainingAdvance > 0 && (
                <div className="flex justify-between items-center py-1.5 px-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Carried-Forward Advance Balance:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">Rs {record.remainingAdvance.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-bold text-gray-900 dark:text-white">Net Payable</span>
                <span className="text-base font-black text-gray-900 dark:text-white">Rs {record.netPayable.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* Status + prototype notice */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Payment Status:</span>
              <SalaryStatusBadge status={record.status} />
            </div>
            <span className="text-xs text-gray-400 italic">No real transaction</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50/50 dark:bg-gray-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
          <button
            disabled
            title="Prototype: no backend — action disabled"
            className="px-4 py-2 rounded-lg bg-primary/40 text-white text-sm font-medium cursor-not-allowed"
          >
            Mark as Paid (Prototype)
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── TAB: STAFF / ATTENDANCE ──────────────────────────────────────────────────

const StaffAttendanceTab: React.FC = () => {
  const [branchFilter, setBranchFilter] = useState<string>('All Branches');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = branchFilter === 'All Branches'
    ? MOCK_STAFF
    : MOCK_STAFF.filter(s => s.branch === branchFilter);

  const summary = {
    present: MOCK_STAFF.filter(s => s.status === 'Present').length,
    absent: MOCK_STAFF.filter(s => s.status === 'Absent').length,
    late: MOCK_STAFF.filter(s => s.status === 'Late').length,
    onLeave: MOCK_STAFF.filter(s => s.status === 'On Leave').length,
  };

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Present', value: summary.present, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Absent', value: summary.absent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Late', value: summary.late, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'On Leave', value: summary.onLeave, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4 border border-white/50 dark:border-gray-800/50`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
            <p className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">of {MOCK_STAFF.length} staff</p>
          </div>
        ))}
      </div>

      {/* Branch filter */}
      <div className="flex items-center gap-3">
        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="flex flex-wrap gap-2">
          {['All Branches', ...MOCK_BRANCHES].map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                branchFilter === b
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-primary/40'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50/80 dark:bg-gray-800/80">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Staff Member</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Branch</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Check In</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hours Today</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800/50">
              {filtered.map(staff => (
                <React.Fragment key={staff.id}>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {staff.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{staff.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{staff.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{staff.branch}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap"><AttendanceStatusBadge status={staff.status} /></td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">{staff.checkIn}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium tabular-nums">
                      {staff.hoursToday > 0 ? `${staff.hoursToday}h` : '—'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => setExpandedId(prev => prev === staff.id ? null : staff.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {expandedId === staff.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === staff.id && (
                    <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="flex flex-wrap gap-6 text-sm">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Check Out</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{staff.checkOut}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Total Hours</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{staff.hoursToday > 0 ? `${staff.hoursToday}h` : 'Not tracked'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠ Prototype — no real attendance data</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── TAB: SALARY ──────────────────────────────────────────────────────────────

const SalaryTab: React.FC = () => {
  const [branchFilter, setBranchFilter] = useState<string>('All Branches');
  const [reviewRecord, setReviewRecord] = useState<MockSalaryRecord | null>(null);
  const [advances, setAdvances] = useState<StaffAdvanceRecord[]>(() => loadStoredAdvances());
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState<boolean>(false);
  const [showLedger, setShowLedger] = useState<boolean>(false);

  // Advance Form State
  const [selectedStaffId, setSelectedStaffId] = useState<string>(MOCK_STAFF[0]?.id || '');
  const [advanceAmount, setAdvanceAmount] = useState<string>('');
  const [advanceDate, setAdvanceDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [disbursementMethod, setDisbursementMethod] = useState<DisbursementMethod>('Cash');
  const [advanceNotes, setAdvanceNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Synchronize state with persistent storage safely
  const handleAddAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(advanceAmount);
    if (!selectedStaffId) {
      setFormError('Please select a valid staff member.');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid positive advance amount.');
      return;
    }
    if (!advanceDate) {
      setFormError('Please select a valid date.');
      return;
    }

    const staffObj = MOCK_STAFF.find(s => s.id === selectedStaffId);
    if (!staffObj) {
      setFormError('Selected staff member was not found.');
      return;
    }

    const newAdvance: StaffAdvanceRecord = {
      id: `adv-${Date.now()}`,
      staffId: staffObj.id,
      staffName: staffObj.name,
      branch: staffObj.branch,
      amount: Math.round(amountNum * 100) / 100,
      date: advanceDate,
      disbursementMethod,
      notes: advanceNotes.trim() || 'Staff cash advance from owner',
      createdAt: new Date().toISOString(),
    };

    const updated = [newAdvance, ...advances];
    setAdvances(updated);
    saveStoredAdvances(updated);

    // Reset form
    setAdvanceAmount('');
    setAdvanceNotes('');
    setFormError(null);
    setIsAdvanceModalOpen(false);
  };

  // Compute calculated salaries with auto-deduction logic
  const calculatedSalaries: MockSalaryRecord[] = useMemo(() => {
    return MOCK_SALARIES.map(sal => {
      // Find matching staff in advances (by exact name or staffId)
      const matchingStaff = MOCK_STAFF.find(s => s.name === sal.name);
      const staffAdvances = advances.filter(
        a => (matchingStaff && a.staffId === matchingStaff.id) || a.staffName.toLowerCase() === sal.name.toLowerCase()
      );

      const totalAdvance = staffAdvances.reduce((sum, a) => sum + a.amount, 0);

      // Target formula:
      // Net Before Advance = Base Salary - Existing Salary Deductions + Bonus
      const netBeforeAdvance = Math.max(0, sal.baseSalary - sal.deductions + sal.bonus);

      // Advance Deduction = Capped at eligible outstanding advance balance and available net
      const advanceDeduction = Math.min(totalAdvance, netBeforeAdvance);

      // Remaining advance balance carry-forward
      const remainingAdvance = Math.max(0, totalAdvance - advanceDeduction);

      // Net Payable = Net Before Advance - Advance Deduction
      const netPayable = Math.max(0, netBeforeAdvance - advanceDeduction);

      return {
        ...sal,
        advanceDeducted: Math.round(advanceDeduction * 100) / 100,
        remainingAdvance: Math.round(remainingAdvance * 100) / 100,
        netPayable: Math.round(netPayable * 100) / 100,
      };
    });
  }, [advances]);

  const filtered = branchFilter === 'All Branches'
    ? calculatedSalaries
    : calculatedSalaries.filter(s => s.branch === branchFilter);

  const filteredAdvances = branchFilter === 'All Branches'
    ? advances
    : advances.filter(a => a.branch === branchFilter);

  const totalPayroll = filtered.reduce((s, r) => s + r.netPayable, 0);
  const totalPayable = filtered.reduce((sum, s) => sum + (s.status !== 'Paid' ? s.netPayable : 0), 0);
  const totalPaid = filtered.reduce((sum, s) => sum + (s.status === 'Paid' ? s.netPayable : 0), 0);
  const totalAdvancesActive = filteredAdvances.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Net Payroll (Oct 2026)</p>
              <p className="text-lg font-black text-gray-900 dark:text-white tabular-nums">
                Rs {totalPayroll.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Pending Payout</p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums">
                Rs {totalPayable.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Disbursed</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                Rs {totalPaid.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800/60 p-4 shadow-sm bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Total Advances Issued</p>
              <p className="text-lg font-black text-amber-700 dark:text-amber-400 tabular-nums">
                Rs {totalAdvancesActive.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar: Branch Filter & Advance Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Branch filter */}
        <div className="flex items-center gap-3">
          <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex flex-wrap gap-2">
            {['All Branches', ...MOCK_BRANCHES].map(b => (
              <button
                key={b}
                onClick={() => setBranchFilter(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  branchFilter === b
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-primary/40'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons for Advance Ledger & Record Advance */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLedger(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              showLedger
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            {showLedger ? 'Hide Advance Ledger' : `Advance Ledger (${filteredAdvances.length})`}
          </button>

          <button
            onClick={() => {
              setFormError(null);
              setIsAdvanceModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Record Advance
          </button>
        </div>
      </div>

      {/* Advance Ledger Section (Collapsible / Toggleable) */}
      {showLedger && (
        <div className="bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Staff Advance Ledger (Owner Advances)</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-medium">
                Local Prototype
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-deducted during October 2026 salary calculation preview
            </p>
          </div>

          {filteredAdvances.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">No staff advances recorded for this branch.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800 text-xs">
                  <thead className="bg-gray-50/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Staff Name</th>
                      <th className="px-4 py-2.5 text-left">Branch</th>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Method</th>
                      <th className="px-4 py-2.5 text-left">Notes</th>
                      <th className="px-4 py-2.5 text-right">Advance Amount</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {filteredAdvances.map(adv => (
                      <tr key={adv.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          {adv.staffName}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {adv.branch}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {adv.date}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {adv.disbursementMethod === 'Cash' ? (
                              <Banknote className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <CreditCard className="w-3 h-3 text-blue-500" />
                            )}
                            {adv.disbursementMethod}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {adv.notes || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400 tabular-nums whitespace-nowrap">
                          Rs {adv.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            Auto-Eligible
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Salary Table with Advance Deductions */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50/80 dark:bg-gray-800/80">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Staff Member</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Branch</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Base</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Deductions</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bonus</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-50/40 dark:bg-amber-950/20">
                  Advance Deducted
                </th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Payable</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800/50">
              {filtered.map(sal => (
                <tr key={sal.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {sal.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{sal.name}</p>
                          {(sal.advanceDeducted !== undefined && sal.advanceDeducted > 0) && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              Advance
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{sal.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{sal.branch}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white tabular-nums">
                    {sal.baseSalary.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-medium text-red-600 dark:text-red-400 tabular-nums">
                    -{sal.deductions.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +{sal.bonus.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-bold text-amber-600 dark:text-amber-400 tabular-nums bg-amber-50/20 dark:bg-amber-950/10">
                    {sal.advanceDeducted && sal.advanceDeducted > 0 ? (
                      `-Rs ${sal.advanceDeducted.toLocaleString()}`
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600 font-normal">Rs 0</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-black text-gray-900 dark:text-white tabular-nums">
                    Rs {sal.netPayable.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-center">
                    <SalaryStatusBadge status={sal.status} />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right">
                    <button
                      onClick={() => setReviewRecord(sal)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors border border-primary/20 hover:border-primary/40"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Salary Review Modal with Advance Breakdown */}
      <StaffReviewModal record={reviewRecord} onClose={() => setReviewRecord(null)} />

      {/* Modal: Record Staff Advance */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
            onClick={() => setIsAdvanceModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Record Staff Advance</h3>
              </div>
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prototype notice inside dialog */}
            <div className="mx-6 mt-4 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Prototype — saved locally in browser. Deducts from salary preview.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddAdvance} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 font-medium">
                  {formError}
                </div>
              )}

              {/* Staff Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Staff Member *
                </label>
                <select
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                >
                  {MOCK_STAFF.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role} — {s.branch})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Advance Amount (Rs) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 tabular-nums"
                  required
                />
              </div>

              {/* Date & Payment Method */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    Advance Date *
                  </label>
                  <input
                    type="date"
                    value={advanceDate}
                    onChange={e => setAdvanceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    Disbursement Method *
                  </label>
                  <select
                    value={disbursementMethod}
                    onChange={e => setDisbursementMethod(e.target.value as DisbursementMethod)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="Cash">Cash (Owner/Register)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>

              {/* Notes / Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Notes / Reason
                </label>
                <textarea
                  rows={2}
                  value={advanceNotes}
                  onChange={e => setAdvanceNotes(e.target.value)}
                  placeholder="e.g. Advance taken from owner for personal expense"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-bold shadow-sm transition-colors"
                >
                  Save Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── TAB: ATTENDANCE RULES & LEAVES ───────────────────────────────────────────

const AttendanceRulesTab: React.FC = () => (
  <div className="space-y-6">
    {/* Attendance rules */}
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          Attendance Rules
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Organization-wide policy — applies to all branches</p>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
        {MOCK_ATTENDANCE_RULES.map(rule => (
          <div key={rule.label} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{rule.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rule.note}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary text-sm font-bold">
                {rule.value}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-800/30">
        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">⚠ Prototype — these rules are not enforced by any backend system</p>
      </div>
    </div>

    {/* Leave policies */}
    <div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-primary" />
        Leave Policies
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MOCK_LEAVE_POLICIES.map(policy => {
          const Icon = policy.icon;
          return (
            <div key={policy.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${policy.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{policy.type}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0">
                      {policy.daysAllowed} days/yr
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{policy.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 font-medium">⚠ Prototype — leave balances and requests are not tracked in any backend</p>
    </div>
  </div>
);

// ─── TAB DEFINITIONS ──────────────────────────────────────────────────────────

type TabId = 'staff' | 'salary' | 'rules';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'staff', label: 'Staff & Attendance', icon: Users },
  { id: 'salary', label: 'Salary', icon: DollarSign },
  { id: 'rules', label: 'Attendance Rules & Leaves', icon: Calendar },
];

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export const OrganizationHRPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('staff');

  return (
    <OrganizationPageShell
      title="HR Management"
      description="Staff attendance overview, salary management, and HR policy configuration."
      badge="Prototype"
    >
      <MockBanner />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'staff' && <StaffAttendanceTab />}
      {activeTab === 'salary' && <SalaryTab />}
      {activeTab === 'rules' && <AttendanceRulesTab />}
    </OrganizationPageShell>
  );
};

export default OrganizationHRPage;
