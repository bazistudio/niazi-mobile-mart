//! SQLite persistence for canonical parties (Phase 1.1).
//!
//! All `*_in_tx` primitives take a plain `&Connection` so they can run inside
//! `with_transaction` together with customer/supplier writes and the outbox
//! enqueue (one atomic local transaction).

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::party::{
    Party, PartyFilter, PartyRoleContact, PartyRoleKind, PartySummaryDto, PartyType,
};
use crate::errors::AppResult;

/// Sync payloads produced by `link_role_and_build_payloads_in_tx`.
#[derive(Debug, Clone, PartialEq)]
pub struct RolePartyPayloads {
    pub role_payload: String,
    pub party_payload: Option<String>,
}

/// Upper bound for one list page.
pub const MAX_PARTY_PAGE: i64 = 1000;

const SUMMARY_SELECT: &str = "SELECT p.id, p.display_name, p.company_name, p.phone, p.alternate_phone, p.email,
        p.address, p.notes, p.is_active, p.created_at, p.updated_at,
        c.id, c.customer_code, c.credit_limit, s.id, s.supplier_code,
        COALESCE((SELECT SUM(cl.debit) - SUM(cl.credit) FROM customer_ledger_entries cl WHERE cl.customer_id = c.id), 0),
        COALESCE((SELECT SUM(sl.debit) - SUM(sl.credit) FROM supplier_ledger_entries sl WHERE sl.supplier_id = s.id), 0)
     FROM parties p
     LEFT JOIN customers c ON c.party_id = p.id
     LEFT JOIN suppliers s ON s.party_id = p.id";

#[derive(Clone)]
pub struct SQLitePartyRepository {
    db: DatabaseConnection,
}

impl SQLitePartyRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    fn map_party(row: &rusqlite::Row<'_>) -> rusqlite::Result<Party> {
        let is_active: i64 = row.get(8)?;
        Ok(Party {
            id: row.get(0)?,
            display_name: row.get(1)?,
            company_name: row.get(2)?,
            phone: row.get(3)?,
            alternate_phone: row.get(4)?,
            email: row.get(5)?,
            address: row.get(6)?,
            notes: row.get(7)?,
            is_active: is_active == 1,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    }

    fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<PartySummaryDto> {
        let party = Self::map_party(row)?;
        let customer_id: Option<String> = row.get(11)?;
        let supplier_id: Option<String> = row.get(14)?;
        Ok(PartySummaryDto {
            party,
            party_type: PartyType::from_roles(customer_id.is_some(), supplier_id.is_some()),
            customer_id,
            customer_code: row.get(12)?,
            customer_credit_limit: row.get(13)?,
            supplier_id,
            supplier_code: row.get(15)?,
            customer_receivable: row.get(16)?,
            supplier_payable: row.get(17)?,
        })
    }

    // ──────────────────────────────────────────────────────────────────────
    // Transactional primitives
    // ──────────────────────────────────────────────────────────────────────

    pub fn get_party_in_tx(conn: &Connection, id: &str) -> DbResult<Option<Party>> {
        conn.query_row(
            "SELECT id, display_name, company_name, phone, alternate_phone, email, address, notes,
                    is_active, created_at, updated_at
             FROM parties WHERE id = ?1",
            params![id],
            Self::map_party,
        )
        .optional()
        .map_err(|e| DbError::QueryError(format!("Failed to query party: {e}")))
    }

    /// Plain insert; fails if the id already exists.
    pub fn insert_party_in_tx(conn: &Connection, party: &Party) -> DbResult<()> {
        conn.execute(
            "INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address,
                                  notes, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                party.id,
                party.display_name,
                party.company_name,
                party.phone,
                party.alternate_phone,
                party.email,
                party.address,
                party.notes,
                if party.is_active { 1 } else { 0 },
                party.created_at,
                party.updated_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert party: {e}")))?;
        Ok(())
    }

    /// Insert or update guarded by `updated_at` (incoming wins when >= stored).
    /// Returns `true` when the row was written.
    pub fn upsert_party_guarded_in_tx(conn: &Connection, party: &Party) -> DbResult<bool> {
        let changed = conn
            .execute(
                "INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address,
                                      notes, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT (id) DO UPDATE SET
                    display_name = excluded.display_name,
                    company_name = excluded.company_name,
                    phone = excluded.phone,
                    alternate_phone = excluded.alternate_phone,
                    email = excluded.email,
                    address = excluded.address,
                    notes = excluded.notes,
                    is_active = excluded.is_active,
                    updated_at = excluded.updated_at
                 WHERE parties.updated_at <= excluded.updated_at",
                params![
                    party.id,
                    party.display_name,
                    party.company_name,
                    party.phone,
                    party.alternate_phone,
                    party.email,
                    party.address,
                    party.notes,
                    if party.is_active { 1 } else { 0 },
                    party.created_at,
                    party.updated_at,
                ],
            )
            .map_err(|e| DbError::QueryError(format!("Failed to upsert party: {e}")))?;
        Ok(changed > 0)
    }

    /// Copies the party's contact fields to its linked customer/supplier rows
    /// (compatibility copies used by POS, purchases, search and printing).
    /// Role `updated_at` never moves backwards.
    pub fn copy_party_to_roles_in_tx(conn: &Connection, party: &Party) -> DbResult<()> {
        for table in ["customers", "suppliers"] {
            let sql = format!(
                "UPDATE {table} SET name = ?1, phone = ?2, alternate_phone = ?3, email = ?4, address = ?5,
                        is_active = ?6, updated_at = MAX(updated_at, ?7)
                 WHERE party_id = ?8"
            );
            conn.execute(
                &sql,
                params![
                    party.display_name,
                    party.phone,
                    party.alternate_phone,
                    party.email,
                    party.address,
                    if party.is_active { 1 } else { 0 },
                    party.updated_at,
                    party.id,
                ],
            )
            .map_err(|e| {
                DbError::QueryError(format!("Failed to copy party contact to {table}: {e}"))
            })?;
        }
        Ok(())
    }

    pub fn linked_role_count_in_tx(conn: &Connection, party_id: &str) -> DbResult<i64> {
        conn.query_row(
            "SELECT (SELECT COUNT(*) FROM customers WHERE party_id = ?1)
                  + (SELECT COUNT(*) FROM suppliers WHERE party_id = ?1)",
            params![party_id],
            |row| row.get(0),
        )
        .map_err(|e| DbError::QueryError(format!("Failed to count party roles: {e}")))
    }

    pub fn party_id_of_role_in_tx(
        conn: &Connection,
        kind: PartyRoleKind,
        role_id: &str,
    ) -> DbResult<Option<String>> {
        let sql = format!("SELECT party_id FROM {} WHERE id = ?1", kind.table());
        let res: Option<Option<String>> = conn
            .query_row(&sql, params![role_id], |row| row.get(0))
            .optional()
            .map_err(|e| DbError::QueryError(format!("Failed to read role party link: {e}")))?;
        Ok(res.flatten())
    }

    /// Links a role to a party only if the role is unlinked and the party has no role of this kind yet.
    pub fn link_role_in_tx(
        conn: &Connection,
        kind: PartyRoleKind,
        role_id: &str,
        party_id: &str,
    ) -> DbResult<()> {
        let table = kind.table();
        let sql = format!(
            "UPDATE {table} SET party_id = ?1
             WHERE id = ?2 AND party_id IS NULL
               AND NOT EXISTS (SELECT 1 FROM {table} o WHERE o.party_id = ?1)"
        );
        conn.execute(&sql, params![party_id, role_id])
            .map_err(|e| {
                DbError::QueryError(format!("Failed to link {table} row to party: {e}"))
            })?;
        Ok(())
    }

    /// Ensures a role row has a party:
    /// 1. if the role is unlinked: creates the party `party_id` from the role contact when it
    ///    does not exist yet, then links the role (an already-linked role keeps its party),
    /// 2. when the role's party has exactly this one role, mirrors the role contact
    ///    onto the party (guarded so an older role write never overwrites a newer party edit).
    /// Must be called after the role row was written in the same transaction.
    /// Returns the role's effective party id (`None` only if linking was refused).
    pub fn ensure_party_for_role_in_tx(
        conn: &Connection,
        contact: &PartyRoleContact,
        party_id: &str,
    ) -> DbResult<Option<String>> {
        let derived = contact.to_party(party_id);
        let sql = format!(
            "SELECT party_id FROM {} WHERE id = ?1",
            contact.kind.table()
        );
        let role_row: Option<Option<String>> = conn
            .query_row(&sql, params![contact.role_id], |row| row.get(0))
            .optional()
            .map_err(|e| DbError::QueryError(format!("Failed to read role party link: {e}")))?;
        let Some(current_link) = role_row else {
            // Role row does not exist: never create a stray party.
            return Ok(None);
        };
        // An already-linked role keeps its party (never re-pointed, never a stray party).
        if current_link.is_none() {
            conn.execute(
                "INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address,
                                      notes, is_active, created_at, updated_at)
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT (id) DO NOTHING",
                params![
                    derived.id,
                    derived.display_name,
                    derived.phone,
                    derived.alternate_phone,
                    derived.email,
                    derived.address,
                    derived.notes,
                    if derived.is_active { 1 } else { 0 },
                    derived.created_at,
                    derived.updated_at,
                ],
            )
            .map_err(|e| DbError::QueryError(format!("Failed to derive party from role: {e}")))?;

            Self::link_role_in_tx(conn, contact.kind, &contact.role_id, party_id)?;
        }

        let effective = Self::party_id_of_role_in_tx(conn, contact.kind, &contact.role_id)?;
        if let Some(ref pid) = effective {
            if Self::linked_role_count_in_tx(conn, pid)? == 1 {
                conn.execute(
                    "UPDATE parties SET display_name = ?1, phone = ?2, alternate_phone = ?3, email = ?4,
                            address = ?5, is_active = ?6, updated_at = ?7
                     WHERE id = ?8 AND updated_at <= ?7",
                    params![
                        derived.display_name,
                        derived.phone,
                        derived.alternate_phone,
                        derived.email,
                        derived.address,
                        if derived.is_active { 1 } else { 0 },
                        derived.updated_at,
                        pid,
                    ],
                )
                .map_err(|e| DbError::QueryError(format!("Failed to mirror role contact to party: {e}")))?;
            }
        }
        Ok(effective)
    }

    /// Hook used by the legacy customer/supplier write paths (same transaction as the role
    /// write and the outbox enqueue):
    /// * ensures/links the role's party (new role → party id = role id),
    /// * returns the role sync payload with `party_id` merged in,
    /// * when `emit_party_event` and the party has exactly this one role, also returns the
    ///   current party JSON for a `PARTY_UPSERTED` event (keeps other terminals' party
    ///   contact in step with a role contact edit).
    pub fn link_role_and_build_payloads_in_tx<T: serde::Serialize>(
        conn: &Connection,
        role: &T,
        contact: &PartyRoleContact,
        emit_party_event: bool,
    ) -> DbResult<RolePartyPayloads> {
        let effective = Self::ensure_party_for_role_in_tx(conn, contact, &contact.role_id)?;
        let party_id = effective.clone().unwrap_or_else(|| contact.role_id.clone());
        let role_payload = crate::domain::party::role_payload_with_party_id(role, &party_id)
            .map_err(|e| {
                DbError::ValidationError(format!("Failed to serialize role payload: {e}"))
            })?;

        let mut party_payload = None;
        if emit_party_event {
            if let Some(pid) = effective {
                if Self::linked_role_count_in_tx(conn, &pid)? == 1 {
                    if let Some(party) = Self::get_party_in_tx(conn, &pid)? {
                        party_payload = Some(serde_json::to_string(&party).map_err(|e| {
                            DbError::ValidationError(format!(
                                "Failed to serialize party payload: {e}"
                            ))
                        })?);
                    }
                }
            }
        }
        Ok(RolePartyPayloads {
            role_payload,
            party_payload,
        })
    }

    pub fn get_party_summary_in_tx(
        conn: &Connection,
        id: &str,
    ) -> DbResult<Option<PartySummaryDto>> {
        let sql = format!("{SUMMARY_SELECT} WHERE p.id = ?1");
        conn.query_row(&sql, params![id], Self::map_summary)
            .optional()
            .map_err(|e| DbError::QueryError(format!("Failed to query party summary: {e}")))
    }

    pub fn list_parties_in_tx(
        conn: &Connection,
        filter: &PartyFilter,
    ) -> DbResult<Vec<PartySummaryDto>> {
        let mut sql = format!("{SUMMARY_SELECT} WHERE 1=1");
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(active) = filter.is_active {
            sql.push_str(" AND p.is_active = ?");
            values.push(Box::new(if active { 1 } else { 0 }));
        }
        match filter.party_type {
            Some(PartyType::Customer) => sql.push_str(" AND c.id IS NOT NULL"),
            Some(PartyType::Supplier) => sql.push_str(" AND s.id IS NOT NULL"),
            Some(PartyType::Both) => sql.push_str(" AND c.id IS NOT NULL AND s.id IS NOT NULL"),
            None => {}
        }
        if let Some(search) = filter.search.as_deref() {
            let s = search.trim();
            if !s.is_empty() {
                let pattern = format!("%{s}%");
                sql.push_str(
                    " AND (p.display_name LIKE ? COLLATE NOCASE OR p.company_name LIKE ? COLLATE NOCASE
                           OR p.phone LIKE ? OR p.alternate_phone LIKE ?
                           OR c.customer_code LIKE ? COLLATE NOCASE OR s.supplier_code LIKE ? COLLATE NOCASE)",
                );
                for _ in 0..6 {
                    values.push(Box::new(pattern.clone()));
                }
            }
        }
        sql.push_str(" ORDER BY p.display_name COLLATE NOCASE ASC, p.id ASC LIMIT ? OFFSET ?");
        let limit = filter
            .limit
            .unwrap_or(MAX_PARTY_PAGE)
            .clamp(1, MAX_PARTY_PAGE);
        let offset = filter.offset.unwrap_or(0).max(0);
        values.push(Box::new(limit));
        values.push(Box::new(offset));

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| DbError::QueryError(format!("Failed to prepare party list: {e}")))?;
        let refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), Self::map_summary)
            .map_err(|e| DbError::QueryError(format!("Failed to list parties: {e}")))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| DbError::QueryError(format!("Party row error: {e}")))?);
        }
        Ok(out)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Async read APIs
    // ──────────────────────────────────────────────────────────────────────

    pub async fn list_parties(&self, filter: &PartyFilter) -> AppResult<Vec<PartySummaryDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Ok(Self::list_parties_in_tx(&guard, filter)?)
    }

    pub async fn get_party_summary(&self, id: &str) -> AppResult<Option<PartySummaryDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Ok(Self::get_party_summary_in_tx(&guard, id)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::customer::Customer;
    use crate::domain::supplier::Supplier;

    fn conn() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        c.pragma_update(None, "foreign_keys", "ON").unwrap();
        MigrationRunner::run(&mut c).unwrap();
        c
    }

    fn customer(id: &str, name: &str, updated_at: &str) -> Customer {
        Customer {
            id: id.into(),
            customer_code: format!("CUS-{}", &id[0..4]),
            name: name.into(),
            phone: "0300111222".into(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: 0,
            is_active: true,
            created_at: "2026-01-01T00:00:00+00:00".into(),
            updated_at: updated_at.into(),
        }
    }

    fn supplier(id: &str, name: &str) -> Supplier {
        Supplier {
            id: id.into(),
            supplier_code: format!("SUP-{}", &id[0..4]),
            name: name.into(),
            phone: "0300999888".into(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: 0,
            is_active: true,
            created_at: "2026-01-01T00:00:00+00:00".into(),
            updated_at: "2026-01-01T00:00:00+00:00".into(),
        }
    }

    const C1: &str = "11111111-1111-4111-8111-111111111111";
    const S1: &str = "33333333-3333-4333-8333-333333333333";

    #[test]
    fn ensure_creates_links_and_is_idempotent() {
        let c = conn();
        let cust = customer(C1, "Ali", "2026-02-01T00:00:00+00:00");
        crate::repositories::SQLiteCustomerRepository::insert_customer_in_tx(&c, &cust).unwrap();
        let contact = PartyRoleContact::from(&cust);
        assert_eq!(
            SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &contact, C1)
                .unwrap()
                .as_deref(),
            Some(C1)
        );
        assert_eq!(
            SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &contact, C1)
                .unwrap()
                .as_deref(),
            Some(C1)
        );
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM parties", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let s = SQLitePartyRepository::get_party_summary_in_tx(&c, C1)
            .unwrap()
            .unwrap();
        assert_eq!(s.party_type, Some(PartyType::Customer));
        assert_eq!(s.customer_id.as_deref(), Some(C1));
    }

    #[test]
    fn both_roles_share_party_and_single_role_mirror_stops() {
        let c = conn();
        let cust = customer(C1, "Ali", "2026-02-01T00:00:00+00:00");
        crate::repositories::SQLiteCustomerRepository::insert_customer_in_tx(&c, &cust).unwrap();
        SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &PartyRoleContact::from(&cust), C1)
            .unwrap();
        let sup = supplier(S1, "Ali Supplies");
        crate::repositories::SQLiteSupplierRepository::insert_supplier_in_tx(&c, &sup).unwrap();
        SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &PartyRoleContact::from(&sup), C1)
            .unwrap();
        let s = SQLitePartyRepository::get_party_summary_in_tx(&c, C1)
            .unwrap()
            .unwrap();
        assert_eq!(s.party_type, Some(PartyType::Both));
        assert_eq!(s.supplier_id.as_deref(), Some(S1));
        // Two roles: supplier contact did NOT overwrite the party.
        assert_eq!(s.party.display_name, "Ali");
        // A second customer can never join the same party.
        let other = customer(
            "22222222-2222-4222-8222-222222222222",
            "Other",
            "2026-02-01T00:00:00+00:00",
        );
        crate::repositories::SQLiteCustomerRepository::insert_customer_in_tx(&c, &other).unwrap();
        SQLitePartyRepository::link_role_in_tx(&c, PartyRoleKind::Customer, &other.id, C1).unwrap();
        assert_eq!(
            SQLitePartyRepository::party_id_of_role_in_tx(&c, PartyRoleKind::Customer, &other.id)
                .unwrap(),
            None
        );
    }

    #[test]
    fn guarded_upsert_and_copy_to_roles() {
        let c = conn();
        let cust = customer(C1, "Ali", "2026-02-01T00:00:00+00:00");
        crate::repositories::SQLiteCustomerRepository::insert_customer_in_tx(&c, &cust).unwrap();
        SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &PartyRoleContact::from(&cust), C1)
            .unwrap();
        let mut p = SQLitePartyRepository::get_party_in_tx(&c, C1)
            .unwrap()
            .unwrap();
        p.display_name = "Ali Traders".into();
        p.company_name = Some("Ali & Sons".into());
        p.updated_at = "2026-03-01T00:00:00+00:00".into();
        assert!(SQLitePartyRepository::upsert_party_guarded_in_tx(&c, &p).unwrap());
        SQLitePartyRepository::copy_party_to_roles_in_tx(&c, &p).unwrap();
        let name: String = c
            .query_row(
                "SELECT name FROM customers WHERE id = ?1",
                params![C1],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "Ali Traders");
        // Stale write is rejected.
        let mut stale = p.clone();
        stale.display_name = "Old".into();
        stale.updated_at = "2026-02-15T00:00:00+00:00".into();
        assert!(!SQLitePartyRepository::upsert_party_guarded_in_tx(&c, &stale).unwrap());
        // Older role write does not overwrite the newer party edit.
        SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &PartyRoleContact::from(&cust), C1)
            .unwrap();
        let now = SQLitePartyRepository::get_party_in_tx(&c, C1)
            .unwrap()
            .unwrap();
        assert_eq!(now.display_name, "Ali Traders");
        assert_eq!(now.company_name.as_deref(), Some("Ali & Sons"));
    }

    #[test]
    fn list_filters_by_type_and_search() {
        let c = conn();
        let cust = customer(C1, "Ali", "2026-02-01T00:00:00+00:00");
        crate::repositories::SQLiteCustomerRepository::insert_customer_in_tx(&c, &cust).unwrap();
        SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &PartyRoleContact::from(&cust), C1)
            .unwrap();
        let sup = supplier(S1, "Hall Road Parts");
        crate::repositories::SQLiteSupplierRepository::insert_supplier_in_tx(&c, &sup).unwrap();
        SQLitePartyRepository::ensure_party_for_role_in_tx(&c, &PartyRoleContact::from(&sup), S1)
            .unwrap();
        let all = SQLitePartyRepository::list_parties_in_tx(&c, &PartyFilter::default()).unwrap();
        assert_eq!(all.len(), 2);
        let sups = SQLitePartyRepository::list_parties_in_tx(
            &c,
            &PartyFilter {
                party_type: Some(PartyType::Supplier),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(sups.len(), 1);
        assert_eq!(sups[0].party.id, S1);
        let found = SQLitePartyRepository::list_parties_in_tx(
            &c,
            &PartyFilter {
                search: Some("hall".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(found.len(), 1);
    }
}
