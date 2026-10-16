# Niazi Mobile Mart — Authorization Cleanup Archive

## Purpose

This archive documents the legacy, inherited, and redundant administrator role logic in the Niazi Mobile Mart codebase.

Niazi Mobile Mart was originally derived from TijaratPro (a multi-tenant, multi-store architecture) and inherited various role representations (`SUPER_ADMIN`, `OWNER`, `MULTI_ADMIN`, `SHOPADMIN`, `BRANCH_ADMIN`, etc.). As a private, single-organization enterprise application, Niazi Mobile Mart is simplifying its security architecture to a clean, canonical **two-administrator model**:

1. **`ADMIN` (Organization Admin)**: Holds organization-wide administrative authority across all branches, independent of whether an admin's home `branch_id` is assigned or NULL.
2. **`SHOP_ADMIN` (Branch Admin)**: Restricted strictly to explicitly assigned/authorized branch operations.

**IMPORTANT SAFETY NOTICE:**
This documentation archive is strictly informational. **No runtime code, route guards, permission matrices, database records, migrations, or account configurations have been deleted or altered in this phase.**

---

## Documents in this Archive

1. **[`legacy-admin-role-inventory.md`](./legacy-admin-role-inventory.md)**:
   Comprehensive inventory of all legacy admin strings, compatibility aliases, and conditional expressions across the backend, frontend, and desktop Tauri layers.

2. **[`authorization-reference.md`](./authorization-reference.md)**:
   Forensic documentation of how the application currently evaluates Organization Admin vs. Branch Admin privileges, how permission profiles are constructed, and how frontend and backend enforcement intersect.

3. **[`future-cleanup-plan.md`](./future-cleanup-plan.md)**:
   A staged, safety-first execution plan for retiring legacy aliases once all live test and production accounts are verified.

4. **[`legacy-admin-blocking-recovery.md`](./legacy-admin-blocking-recovery.md)**:
   Complete recovery guide, runtime blocking audit record, diagnostic procedures, and rollback instructions for the temporary legacy admin role block release.

---

## Target Two-Admin Authorization Model

```
                          ┌─────────────────────────────┐
                          │            ADMIN            │
                          │   (Organization Admin)      │
                          │                             │
                          │  • Full org-wide authority  │
                          │  • Branch selector access   │
                          │  • All catalog & inventory  │
                          │  • All ledgers & reports    │
                          └──────────────┬──────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │                                           │
     ┌─────────────▼─────────────┐               ┌─────────────▼─────────────┐
     │        SHOP_ADMIN         │               │     OPERATIONAL ROLES     │
     │      (Branch Admin)       │               │                           │
     │                           │               │  • CASHIER                │
     │  • Strictly scoped to     │               │  • SALESMAN               │
     │    assigned branch(es)    │               │  • MANAGER                │
     │  • Branch POS & inventory │               │  • ACCOUNTANT             │
     │  • Cash register & closing│               │  • REPAIR_MECHANIC        │
     │  • No cross-branch leaks  │               │                           │
     └───────────────────────────┘               └───────────────────────────┘
```
