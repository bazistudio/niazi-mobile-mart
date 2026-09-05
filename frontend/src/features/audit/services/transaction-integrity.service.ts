// src/features/audit/services/transaction-integrity.service.ts
//
// Phase 5A: Transaction Integrity Testing
// Records every cross-domain operation as a "transaction step" and verifies
// the expected sequence completed without silent failures.

export type TransactionStep =
  | 'PRODUCT_CREATED'
  | 'STOCK_INITIALIZED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_RESTOCKED'
  | 'STOCK_EVENT_EMITTED'
  | 'IMPORT_PARSED'
  | 'IMPORT_VALIDATED'
  | 'IMPORT_COMMITTED'
  | 'SALES_METRICS_READ';

export interface TransactionRecord {
  id: string;
  startedAt: string;
  completedAt?: string;
  steps: { step: TransactionStep; timestamp: string; payload?: any; error?: string }[];
  status: 'running' | 'success' | 'partial_failure' | 'failed';
}

class TransactionLedger {
  private transactions: Map<string, TransactionRecord> = new Map();
  private isDev = process.env.NODE_ENV === 'development';

  begin(id: string): string {
    if (!this.isDev) return id;
    const record: TransactionRecord = {
      id,
      startedAt: new Date().toISOString(),
      steps: [],
      status: 'running',
    };
    this.transactions.set(id, record);
    console.log(`[TXN] Started: ${id}`);
    return id;
  }

  record(txnId: string, step: TransactionStep, payload?: any, error?: string): void {
    if (!this.isDev) return;
    const txn = this.transactions.get(txnId);
    if (!txn) return;
    const entry = { step, timestamp: new Date().toISOString(), payload, error };
    txn.steps.push(entry);
    if (error) {
      console.warn(`[TXN] ${txnId} → ${step} FAILED: ${error}`);
    } else {
      console.log(`[TXN] ${txnId} → ${step} OK`, payload ?? '');
    }
  }

  complete(txnId: string): TransactionRecord | null {
    if (!this.isDev) return null;
    const txn = this.transactions.get(txnId);
    if (!txn) return null;
    const hasErrors = txn.steps.some(s => !!s.error);
    txn.status = hasErrors ? 'partial_failure' : 'success';
    txn.completedAt = new Date().toISOString();
    console.log(`[TXN] Completed: ${txnId} → ${txn.status.toUpperCase()}`, txn);
    return txn;
  }

  fail(txnId: string, reason: string): TransactionRecord | null {
    if (!this.isDev) return null;
    const txn = this.transactions.get(txnId);
    if (!txn) return null;
    txn.status = 'failed';
    txn.completedAt = new Date().toISOString();
    console.error(`[TXN] FAILED: ${txnId} → ${reason}`);
    return txn;
  }

  getAll(): TransactionRecord[] {
    return Array.from(this.transactions.values());
  }

  getRecent(n = 20): TransactionRecord[] {
    return this.getAll()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, n);
  }

  clear(): void {
    this.transactions.clear();
  }
}

export const transactionLedger = new TransactionLedger();

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generateTxnId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
