import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCreatePartyDto, toUpdatePartyDto, toPartyView, validatePartyInput, PartyValidationError,
  OPENING_BALANCE_NOT_SUPPORTED_MESSAGE, PARTY_TYPE_CHANGE_NOT_SUPPORTED_MESSAGE, partyCodeOf,
} from './party.domain.ts';
import { createPartyService, PartyPermissionError, PARTY_PERMISSIONS } from './party.service.ts';

const summary = (over: any = {}) => ({
  party: { id: '11111111-1111-4111-8111-111111111111', display_name: 'Ali Traders', company_name: 'Ali & Sons',
    phone: '0300', alternate_phone: null, email: null, address: 'Hall Road', notes: null, is_active: true,
    created_at: 't0', updated_at: 't1' },
  party_type: 'BOTH', customer_id: '11111111-1111-4111-8111-111111111111', customer_code: 'CUS-000001',
  customer_credit_limit: 5000, supplier_id: '33333333-3333-4333-8333-333333333333', supplier_code: 'SUP-000001',
  customer_receivable: 1200, supplier_payable: 3000, ...over,
});

test('create DTO: trims, nulls empties, credit limit only for customer roles', () => {
  const dto = toCreatePartyDto({ contactPerson: ' Ali ', phone: ' 0300 ', companyName: '', email: 'a@x.pk', address: ' ', type: 'BOTH', creditLimit: '5000' });
  assert.deepEqual(dto, { party_type: 'BOTH', display_name: 'Ali', company_name: null, phone: '0300', email: 'a@x.pk', address: null, credit_limit: 5000 });
  assert.equal(toCreatePartyDto({ contactPerson: 'S', phone: '1', type: 'SUPPLIER' }).credit_limit, null);
});

test('create validation', () => {
  assert.throws(() => toCreatePartyDto({ contactPerson: ' ', phone: '1', type: 'CUSTOMER' }), PartyValidationError);
  assert.throws(() => toCreatePartyDto({ contactPerson: 'A', phone: '', type: 'CUSTOMER' }), PartyValidationError);
  assert.throws(() => toCreatePartyDto({ contactPerson: 'A', phone: '1', type: 'VENDOR' }), PartyValidationError);
  assert.throws(() => toCreatePartyDto({ contactPerson: 'A', phone: '1', type: 'CUSTOMER', email: 'nope' }), PartyValidationError);
  assert.throws(() => toCreatePartyDto({ contactPerson: 'A', phone: '1', type: 'CUSTOMER', creditLimit: 10.5 }), /whole rupee/);
  assert.throws(() => toCreatePartyDto({ contactPerson: 'A', phone: '1', type: 'CUSTOMER', creditLimit: -1 }), /negative/);
  assert.throws(() => toCreatePartyDto({ contactPerson: 'A', phone: '1', type: 'CUSTOMER', openingBalance: 500 }), new RegExp(OPENING_BALANCE_NOT_SUPPORTED_MESSAGE.slice(0, 20)));
  assert.doesNotThrow(() => validatePartyInput({ contactPerson: 'A', phone: '1', type: 'CUSTOMER', openingBalance: 0 }, 'create'));
});

test('update DTO: sends contact fields, rejects type change', () => {
  assert.deepEqual(toUpdatePartyDto({ contactPerson: 'B', phone: '2', companyName: '', email: '', address: 'X', type: 'BOTH' }, 'BOTH'),
    { display_name: 'B', phone: '2', company_name: '', email: '', address: 'X' });
  assert.throws(() => toUpdatePartyDto({ contactPerson: 'B', phone: '2', type: 'CUSTOMER' }, 'BOTH'), new RegExp(PARTY_TYPE_CHANGE_NOT_SUPPORTED_MESSAGE.slice(0, 20)));
});

test('view model: side-by-side balances and combined display balance', () => {
  const v = toPartyView(summary() as any);
  assert.equal(v.partyCode, 'CUS-000001 / SUP-000001');
  assert.equal(v.contactPerson, 'Ali Traders');
  assert.equal(v.receivable, 1200);
  assert.equal(v.payable, 3000);
  assert.equal(v.currentBalance, -1800);
  assert.equal(v.creditLimit, 5000);
  assert.equal(v.type, 'BOTH');
  assert.equal(partyCodeOf({ customer_code: null, supplier_code: 'SUP-1' }), 'SUP-1');
});

function repo() {
  const calls: any[] = [];
  return {
    calls,
    list: async (f: any) => { calls.push(['list', f]); return [summary()]; },
    get: async (id: string) => { calls.push(['get', id]); return summary(); },
    create: async (dto: any) => { calls.push(['create', dto]); return summary(); },
    update: async (id: string, dto: any) => { calls.push(['update', id, dto]); return summary(); },
  };
}

test('service enforces parties.view / parties.manage (fail closed)', async () => {
  const r = repo();
  const viewOnly = createPartyService(r as any, (p) => p === PARTY_PERMISSIONS.VIEW);
  assert.equal((await viewOnly.list()).length, 1);
  await assert.rejects(viewOnly.create({ contactPerson: 'A', phone: '1', type: 'CUSTOMER' }), PartyPermissionError);
  await assert.rejects(viewOnly.update('x', { contactPerson: 'A', phone: '1' }), PartyPermissionError);
  await assert.rejects(viewOnly.setActive('x', false), PartyPermissionError);
  const none = createPartyService(r as any, () => false);
  await assert.rejects(none.list(), PartyPermissionError);
  await assert.rejects(none.get('x'), PartyPermissionError);
  assert.equal(r.calls.filter((c) => c[0] !== 'list').length, 0, 'no repository call without permission');
});

test('service maps list query and delegates writes', async () => {
  const r = repo();
  const svc = createPartyService(r as any, () => true);
  await svc.list({ search: '  ali ', type: 'SUPPLIER', isActive: true, limit: 50, offset: 0 });
  assert.deepEqual(r.calls[0], ['list', { search: 'ali', party_type: 'SUPPLIER', is_active: true, limit: 50, offset: 0 }]);
  await svc.update(' 11111111-1111-4111-8111-111111111111 ', { contactPerson: 'N', phone: '9', type: 'BOTH' });
  assert.deepEqual(r.calls.at(-1), ['update', '11111111-1111-4111-8111-111111111111', { display_name: 'N', phone: '9', company_name: '', email: '', address: '' }]);
  await svc.setActive('abc', false);
  assert.deepEqual(r.calls.at(-1), ['update', 'abc', { is_active: false }]);
  await assert.rejects(svc.get('  '), PartyValidationError);
});
