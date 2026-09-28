// Party domain rules (Phase 1.1) — pure functions, no framework or bridge imports.
//
// Canonical model: one `Party` (identity + contact) with a customer role, a supplier
// role, or both. Customer/supplier records, ledgers, sales and purchases are unchanged.
// Balances are read-only here: receivable (customer ledger) and payable (supplier
// ledger) are shown side by side; a unified party ledger and opening balances are
// planned for the payments/ledger phase.

import type {
  CreatePartyDto,
  PartySummaryDto,
  PartyType,
  UpdatePartyDto,
} from '@/lib/tauri/tauriClient';

export type { PartyType };

export const PARTY_TYPES: readonly PartyType[] = ['CUSTOMER', 'SUPPLIER', 'BOTH'];

export const OPENING_BALANCE_NOT_SUPPORTED_MESSAGE =
  'Opening balances are not available yet. They will be added with the payments & ledger phase.';

export const PARTY_TYPE_CHANGE_NOT_SUPPORTED_MESSAGE =
  'Changing a party between customer, supplier and both is not supported yet.';

/** Shape produced by the Parties form (PartyFormDrawer). */
export interface PartyFormInput {
  contactPerson: string;
  phone: string;
  companyName?: string;
  email?: string;
  address?: string;
  type?: PartyType | string;
  openingBalance?: number | string;
  openingBalanceType?: string;
  creditLimit?: number | string;
}

/** View model consumed by PartiesTab, PartyProfile and LedgerDashboard. */
export interface PartyView {
  id: string;
  partyCode: string;
  name: string;
  contactPerson: string;
  companyName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  notes: string;
  type: PartyType | null;
  isActive: boolean;
  customerId: string | null;
  customerCode: string | null;
  supplierId: string | null;
  supplierCode: string | null;
  /** They owe us (customer ledger), whole PKR. */
  receivable: number;
  /** We owe them (supplier ledger), whole PKR. */
  payable: number;
  /** receivable − payable (positive = they owe us). Display only; not a ledger. */
  currentBalance: number;
  creditLimit: number;
  createdAt: string;
  updatedAt: string;
}

export class PartyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartyValidationError';
  }
}

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPartyType(value: unknown): value is PartyType {
  return typeof value === 'string' && (PARTY_TYPES as readonly string[]).includes(value);
}

function wholeRupees(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new PartyValidationError(`${field} must be a whole rupee amount`);
  }
  if (n < 0) throw new PartyValidationError(`${field} cannot be negative`);
  return n;
}

/** Same rules as `validate_create_party` / `validate_update_party` in Rust. */
export function validatePartyInput(input: PartyFormInput, mode: 'create' | 'update'): void {
  if (!trimmed(input.contactPerson)) throw new PartyValidationError('Contact person name is required');
  if (!trimmed(input.phone)) throw new PartyValidationError('Phone number is required');
  const email = trimmed(input.email);
  if (email && !EMAIL_PATTERN.test(email)) throw new PartyValidationError('Email address is not valid');
  if (mode === 'create') {
    if (!isPartyType(input.type)) throw new PartyValidationError('Choose Customer, Supplier or Both');
    if (wholeRupees(input.openingBalance, 'Opening balance') > 0) {
      throw new PartyValidationError(OPENING_BALANCE_NOT_SUPPORTED_MESSAGE);
    }
    wholeRupees(input.creditLimit, 'Credit limit');
  }
}

export function toCreatePartyDto(input: PartyFormInput): CreatePartyDto {
  validatePartyInput(input, 'create');
  const optional = (v: unknown) => trimmed(v) || null;
  const type = input.type as PartyType;
  return {
    party_type: type,
    display_name: trimmed(input.contactPerson),
    company_name: optional(input.companyName),
    phone: trimmed(input.phone),
    email: optional(input.email),
    address: optional(input.address),
    credit_limit: type === 'SUPPLIER' ? null : wholeRupees(input.creditLimit, 'Credit limit'),
  };
}

/**
 * Builds a partial update. Contact fields are always sent (an empty string clears an
 * optional field). A requested type different from the existing one is rejected.
 */
export function toUpdatePartyDto(input: PartyFormInput, existingType: PartyType | null): UpdatePartyDto {
  validatePartyInput(input, 'update');
  if (input.type !== undefined && input.type !== '' && existingType !== null && input.type !== existingType) {
    throw new PartyValidationError(PARTY_TYPE_CHANGE_NOT_SUPPORTED_MESSAGE);
  }
  return {
    display_name: trimmed(input.contactPerson),
    phone: trimmed(input.phone),
    company_name: trimmed(input.companyName),
    email: trimmed(input.email),
    address: trimmed(input.address),
  };
}

export function partyCodeOf(summary: Pick<PartySummaryDto, 'customer_code' | 'supplier_code'>): string {
  return [summary.customer_code, summary.supplier_code].filter((c): c is string => !!c).join(' / ');
}

export function toPartyView(summary: PartySummaryDto): PartyView {
  const p = summary.party;
  const receivable = summary.customer_receivable ?? 0;
  const payable = summary.supplier_payable ?? 0;
  return {
    id: p.id,
    partyCode: partyCodeOf(summary),
    name: p.display_name,
    contactPerson: p.display_name,
    companyName: p.company_name ?? '',
    phone: p.phone,
    alternatePhone: p.alternate_phone ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    notes: p.notes ?? '',
    type: summary.party_type ?? null,
    isActive: p.is_active,
    customerId: summary.customer_id ?? null,
    customerCode: summary.customer_code ?? null,
    supplierId: summary.supplier_id ?? null,
    supplierCode: summary.supplier_code ?? null,
    receivable,
    payable,
    currentBalance: receivable - payable,
    creditLimit: summary.customer_credit_limit ?? 0,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
