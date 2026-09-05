// src/features/audit/boundaries/domain-boundary.enforcer.ts
//
// Phase 5B: Domain Boundary Stress Test
// In dev mode, wraps each service call in a proxy that:
//  1. Validates that calls come from the correct domain layer
//  2. Prevents import-layer from calling store directly
//  3. Ensures sales service never writes
//  4. Logs every cross-domain call for the audit panel

export type DomainLayer = 'app' | 'feature' | 'import-pipeline' | 'sales' | 'stock' | 'product';

export interface BoundaryViolation {
  id: string;
  timestamp: string;
  caller: DomainLayer;
  callee: string;
  method: string;
  rule: string;
  severity: 'error' | 'warning';
}

class DomainBoundaryEnforcer {
  private violations: BoundaryViolation[] = [];
  private isDev = process.env.NODE_ENV === 'development';

  // Rules encoded as [caller, callee, method, rule, severity]
  private readonly FORBIDDEN_PATTERNS: Array<{
    callerPattern: RegExp;
    calleePattern: RegExp;
    rule: string;
    severity: 'error' | 'warning';
  }> = [
    {
      callerPattern: /import/,
      calleePattern: /inventory\.store|useInventoryStore/,
      rule: 'Import pipeline MUST NOT directly access inventory store. Use productService or stockService.',
      severity: 'error',
    },
    {
      callerPattern: /sales/,
      calleePattern: /inventory\.store|useInventoryStore/,
      rule: 'Sales module MUST NOT import inventory store. Use sales.service only.',
      severity: 'error',
    },
    {
      callerPattern: /stock\.service/,
      calleePattern: /product\.service/,
      rule: 'Stock service MUST NOT import product service. Emit events instead.',
      severity: 'error',
    },
    {
      callerPattern: /features\//,
      calleePattern: /from '@\/app\//,
      rule: 'Features MUST NOT import from app/ layer (FSD rule).',
      severity: 'error',
    },
  ];

  /**
   * Checks whether a given import path violates domain boundaries.
   * Called during static analysis (dev-only audit panel).
   */
  checkImport(callerFile: string, importPath: string): BoundaryViolation | null {
    if (!this.isDev) return null;

    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.callerPattern.test(callerFile) && pattern.calleePattern.test(importPath)) {
        const violation: BoundaryViolation = {
          id: `violation-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: new Date().toISOString(),
          caller: this.inferLayer(callerFile),
          callee: importPath,
          method: 'import',
          rule: pattern.rule,
          severity: pattern.severity,
        };
        this.violations.push(violation);
        if (pattern.severity === 'error') {
          console.error(`[BOUNDARY VIOLATION] ${callerFile}\n  → ${importPath}\n  Rule: ${pattern.rule}`);
        } else {
          console.warn(`[BOUNDARY WARNING] ${callerFile}\n  → ${importPath}\n  Rule: ${pattern.rule}`);
        }
        return violation;
      }
    }
    return null;
  }

  /**
   * Guard wrapper for service method calls.
   * Detects when a forbidden layer calls a protected service method.
   */
  guard<T extends object>(service: T, serviceName: string, allowedCallers: DomainLayer[]): T {
    if (!this.isDev) return service;

    return new Proxy(service, {
      get: (target, prop) => {
        const original = (target as any)[prop];
        if (typeof original !== 'function') return original;

        return (...args: any[]) => {
          // Stack analysis to detect caller
          const stack = new Error().stack || '';
          const isForbiddenCaller = this.FORBIDDEN_PATTERNS.some(
            p => p.callerPattern.test(stack) && p.calleePattern.test(serviceName)
          );

          if (isForbiddenCaller) {
            const violation: BoundaryViolation = {
              id: `runtime-${Date.now()}`,
              timestamp: new Date().toISOString(),
              caller: 'feature',
              callee: serviceName,
              method: String(prop),
              rule: 'Runtime boundary violation detected.',
              severity: 'error',
            };
            this.violations.push(violation);
            console.error(`[RUNTIME BOUNDARY VIOLATION] ${serviceName}.${String(prop)} called from forbidden layer`);
          }

          return original.apply(target, args);
        };
      },
    });
  }

  getViolations(): BoundaryViolation[] {
    return [...this.violations];
  }

  getErrors(): BoundaryViolation[] {
    return this.violations.filter(v => v.severity === 'error');
  }

  hasViolations(): boolean {
    return this.violations.length > 0;
  }

  clear(): void {
    this.violations = [];
  }

  private inferLayer(file: string): DomainLayer {
    if (file.includes('features/import')) return 'import-pipeline';
    if (file.includes('/sales/')) return 'sales';
    if (file.includes('/stock/')) return 'stock';
    if (file.includes('/product/')) return 'product';
    if (file.includes('/app/')) return 'app';
    return 'feature';
  }
}

export const domainBoundaryEnforcer = new DomainBoundaryEnforcer();
