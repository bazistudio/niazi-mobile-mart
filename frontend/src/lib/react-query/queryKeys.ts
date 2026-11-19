// src/lib/react-query/queryKeys.ts
//
// Niazi Mobile Mart - Domain Query Keys
// Pure, deterministic query keys for offline-first desktop ERP.
// Zero dynamic tenant/shop/user injection.

export const queryKeys = {
  organization: {
    dashboard: ['organization', 'dashboard'] as const,
    commandCenter: (
      mode: 'organization' | 'branch',
      branchId: string | null,
      startDate: string,
      endDate: string
    ) => ['organization', 'command-center', mode, branchId ?? 'ALL', startDate, endDate] as const,
    branchComparison: (startDate: string, endDate: string) =>
      ['organization', 'branch-comparison', startDate, endDate] as const,
  },
  branches: {
    all: ['branches'] as const,
    detail: (id: string) => ['branches', id] as const,
  },
  categories: {
    all: ['categories'] as const,
  },
  brands: {
    all: ['brands'] as const,
  },
  products: {
    all: ['products'] as const,
    detail: (id: string) => ['products', id] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    stockAlerts: ['inventory', 'stock-alerts'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    byBranch: (branchId?: string | null) =>
      branchId ? (['dashboard', branchId] as const) : (['dashboard', 'all'] as const),
  },
  sales: (branchId?: string | null, dateFilter?: string, startDate?: string, endDate?: string, search?: string) =>
    ['sales', branchId ?? 'all', dateFilter, startDate, endDate, search] as const,
  customers: {
    all: ['customers'] as const,
    detail: (id: string) => ['customers', id] as const,
    search: (term: string) => ['customers', 'search', term] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    detail: (id: string) => ['suppliers', id] as const,
  },
  ledger: (partyType?: string, partyId?: string, branchId?: string | null) =>
    ['ledger', partyType, partyId, branchId ?? 'all'] as const,
  orders: ['orders'] as const,
  ordersToday: ['orders', 'today'] as const,
  cash: {
    orgSummary: ['cash', 'organization-summary'] as const,
  },
  // ─── Reports Domain ───────────────────────────────────────────────────────
  // Phase 2: GET /api/v1/reports/progress is now live.
  reports: {
    progress: (
      userId: string,
      branchId?: string | null,
      startDate?: string | null,
      endDate?: string | null
    ) => ['reports', 'progress', userId, branchId ?? null, startDate ?? null, endDate ?? null] as const,
  },
  // ─── HR Domain ────────────────────────────────────────────────────────────
  // Phase 2: HR backend endpoints are now live at /api/v1/hr/*.
  hr: {
    staff: (branchId?: string | null) =>
      branchId ? (['hr', 'staff', branchId] as const) : (['hr', 'staff'] as const),
    salaryConfigs: ['hr', 'salary-configs'] as const,
    salaryConfig: (staffId: string) => ['hr', 'salary-config', staffId] as const,
    salaryConfigHistory: (staffId: string) => ['hr', 'salary-config-history', staffId] as const,
    overtimeConfigs: ['hr', 'overtime-configs'] as const,
    overtimeConfig: (staffId: string) => ['hr', 'overtime-config', staffId] as const,
    advances: (staffId?: string) =>
      staffId ? (['hr', 'advances', staffId] as const) : (['hr', 'advances'] as const),
    orgAdvances: (branchId?: string | null, status?: string | null) =>
      ['hr', 'org-advances', branchId ?? 'ALL', status ?? 'ALL'] as const,
    attendance: (staffId: string, month: number, year: number) =>
      ['hr', 'attendance', staffId, month, year] as const,
    attendanceRegister: (date: string, branchId?: string | null) =>
      ['hr', 'attendance-register', date, branchId ?? 'ALL'] as const,
    attendanceRange: (startDate: string, endDate: string, branchId?: string | null) =>
      ['hr', 'attendance-range', startDate, endDate, branchId ?? 'ALL'] as const,
    payrollPeriods: ['hr', 'payroll-periods'] as const,
    payrollRecords: (periodId: string, branchId?: string | null) =>
      branchId
        ? (['hr', 'payroll-records', periodId, branchId] as const)
        : (['hr', 'payroll-records', periodId] as const),
    payroll: (month?: number, year?: number) =>
      ['hr', 'payroll', month, year] as const,
    shiftTemplates: ['hr', 'shift-templates'] as const,
    annualSummary: (staffId: string, year: number) =>
      ['hr', 'annual-summary', staffId, year] as const,
    policies: ['hr', 'policies'] as const,
    effectivePolicy: (branchId?: string | null, date?: string) =>
      ['hr', 'policies', 'effective', branchId ?? 'DEFAULT', date ?? 'TODAY'] as const,
    policyAuditLogs: (policyId?: string, branchId?: string) =>
      ['hr', 'policies', 'audit', policyId ?? 'ALL', branchId ?? 'ALL'] as const,
  },
  // ─── Repairs Domain ───────────────────────────────────────────────────────
  // repairApi.getRepairJobs({ technician_id }) is available — used in Progress Report.
  // ─── Business Accounts Domain ─────────────────────────────────────────────
  accounts: {
    all: ['accounts'] as const,
    statement: (id: string) => ['accounts', 'statement', id] as const,
  },
  repairs: (filters?: {
    technician_id?: string;
    branch_id?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => ['repairs', filters ?? {}] as const,
};
