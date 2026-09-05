'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Loader2, RefreshCw, FlaskConical, Database, GitBranch, Clock
} from 'lucide-react';
import { consistencyCheckerService, ConsistencyReport } from '../services/consistency-checker.service';
import { importBoundaryGuard, ImportStressTestResult } from '../boundaries/import-boundary.guard';
import { domainBoundaryEnforcer, BoundaryViolation } from '../boundaries/domain-boundary.enforcer';
import { transactionLedger, TransactionRecord } from '../services/transaction-integrity.service';

type ActiveTab = 'consistency' | 'stress-test' | 'boundaries' | 'transactions';

export const AuditPanel = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('consistency');

  // Phase 5C state
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyReport | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyError, setConsistencyError] = useState('');

  // Phase 5A state
  const [stressResults, setStressResults] = useState<ImportStressTestResult[]>([]);
  const [stressLoading, setStressLoading] = useState(false);

  // Phase 5B state
  const [violations, setViolations] = useState<BoundaryViolation[]>([]);

  // Transaction ledger state
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  const runConsistencyAudit = async () => {
    setConsistencyLoading(true);
    setConsistencyError('');
    try {
      const report = await consistencyCheckerService.runAudit();
      setConsistencyReport(report);
    } catch (err: any) {
      setConsistencyError(err.message || 'Audit failed. Is the backend running?');
    } finally {
      setConsistencyLoading(false);
    }
  };

  const runStressTests = async () => {
    setStressLoading(true);
    try {
      const results = await importBoundaryGuard.runStressTests();
      setStressResults(results);
    } finally {
      setStressLoading(false);
    }
  };

  const loadBoundaryData = () => {
    setViolations(domainBoundaryEnforcer.getViolations());
    setTransactions(transactionLedger.getRecent(20));
  };

  // Phase 6: Live stream audit data
  useEffect(() => {
    if (activeTab === 'boundaries' || activeTab === 'transactions') {
      loadBoundaryData(); // initial load
      const interval = setInterval(loadBoundaryData, 1000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'consistency', label: 'Data Consistency', icon: <Database className="w-4 h-4" /> },
    { id: 'stress-test', label: 'Stress Tests', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'boundaries', label: 'Boundary Violations', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'transactions', label: 'Transaction Log', icon: <Clock className="w-4 h-4" /> },
  ];

  const severityIcon = (sev: string) => {
    if (sev === 'error') return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    if (sev === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#006970]" />
            Phase 5 — ERP Audit Panel
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Dev-only: Business validation, boundary stress testing, and data consistency auditing.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            <ShieldAlert className="w-3.5 h-3.5" />
            Development Mode Only — Not visible in production
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'boundaries' || tab.id === 'transactions') loadBoundaryData(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Data Consistency ── */}
      {activeTab === 'consistency' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Phase 5C: Scans all products for orphan records, duplicate SKUs/names, price anomalies, and stock mismatches.</p>
            <button
              onClick={runConsistencyAudit}
              disabled={consistencyLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#006970] text-white rounded-xl hover:bg-[#005a60] disabled:opacity-50 text-sm font-medium"
            >
              {consistencyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Run Audit
            </button>
          </div>

          {consistencyError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              {consistencyError}
            </div>
          )}

          {consistencyReport && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Products Scanned', value: consistencyReport.totalProductsScanned, color: 'text-gray-900 dark:text-white' },
                  { label: 'Clean', value: consistencyReport.passCount, color: 'text-emerald-600' },
                  { label: 'Warnings', value: consistencyReport.warnCount, color: 'text-amber-600' },
                  { label: 'Errors', value: consistencyReport.errorCount, color: 'text-red-600' },
                ].map(stat => (
                  <div key={stat.label} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="text-xs text-gray-500 mb-1">{stat.label}</div>
                    <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className={`flex items-center gap-3 p-4 rounded-xl border ${consistencyReport.isHealthy ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/30' : 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-800/30'}`}>
                {consistencyReport.isHealthy ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                <span className={`font-medium text-sm ${consistencyReport.isHealthy ? 'text-emerald-700' : 'text-red-700'}`}>
                  {consistencyReport.isHealthy
                    ? 'Database is consistent — no critical errors found.'
                    : `${consistencyReport.errorCount} critical error(s) require immediate attention.`}
                </span>
              </div>

              {consistencyReport.issues.length > 0 ? (
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-900 dark:text-white">
                    Issues Found ({consistencyReport.issues.length})
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {consistencyReport.issues.map((issue, idx) => (
                      <div key={idx} className="flex items-start gap-3 px-4 py-3">
                        {severityIcon(issue.severity)}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-gray-500 mb-0.5">{issue.type}</div>
                          <div className="text-sm text-gray-700 dark:text-gray-300">{issue.details}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-emerald-600 font-medium">
                  ✅ No issues found. All {consistencyReport.totalProductsScanned} products are clean.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Stress Tests ── */}
      {activeTab === 'stress-test' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Phase 5A: Verifies import pipeline handles duplicate SKUs, malformed data, partial batches, and edge cases correctly.</p>
            <button
              onClick={runStressTests}
              disabled={stressLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#006970] text-white rounded-xl hover:bg-[#005a60] disabled:opacity-50 text-sm font-medium"
            >
              {stressLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
              Run All Tests
            </button>
          </div>

          {stressResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {stressResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${result.passed ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/30' : 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-800/30'}`}
                >
                  {result.passed
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    : <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900 dark:text-white">{result.scenario}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{result.reason}</div>
                    <div className="text-xs text-gray-400 mt-1">{result.durationMs}ms</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${result.passed ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'}`}>
                    {result.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
              <div className="text-xs text-gray-500 text-right mt-1">
                {stressResults.filter(r => r.passed).length}/{stressResults.length} tests passed
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Boundary Violations ── */}
      {activeTab === 'boundaries' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Phase 5B: Runtime boundary violations captured since page load. Violations indicate a domain isolation breach.</p>
          {violations.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-12 rounded-xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800/30">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">No boundary violations detected. Domain isolation is intact.</span>
            </div>
          ) : (
            <div className="rounded-xl border border-red-100 dark:border-red-800/30 bg-white dark:bg-gray-900 overflow-hidden">
              {violations.map((v, idx) => (
                <div key={idx} className="flex items-start gap-3 px-4 py-3 border-b border-red-50 dark:border-red-900/20 last:border-0">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-red-700">{v.rule}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{v.caller} → {v.callee}</div>
                    <div className="text-xs text-gray-400">{v.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Transaction Log ── */}
      {activeTab === 'transactions' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Phase 5A: Transaction audit trail for cross-domain operations (create product → initialize stock → emit events).</p>
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">No transactions recorded yet. Perform an import or stock adjustment to generate transaction records.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {transactions.map((txn) => (
                <div key={txn.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <div>
                      <span className="text-xs font-mono text-gray-500">{txn.id}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      txn.status === 'success' ? 'text-emerald-700 bg-emerald-100' :
                      txn.status === 'partial_failure' ? 'text-amber-700 bg-amber-100' :
                      txn.status === 'failed' ? 'text-red-700 bg-red-100' :
                      'text-blue-700 bg-blue-100'
                    }`}>
                      {txn.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    {txn.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {step.error
                          ? <XCircle className="w-3 h-3 text-red-500" />
                          : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        <span className="font-mono text-gray-600 dark:text-gray-400">{step.step}</span>
                        {step.error && <span className="text-red-500">— {step.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
