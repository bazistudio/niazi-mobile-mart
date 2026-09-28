//! PostgreSQL persistence for canonical parties (Phase 1.1).
//!
//! Mirrors `SQLitePartyRepository` so the central projection applies exactly the
//! same identity, linking and last-writer rules as every desktop.

use sqlx::{PgPool, Row};

use crate::domain::party::{Party, PartyFilter, PartyRoleContact, PartySummaryDto, PartyType};
use crate::errors::{AppError, AppResult};
use crate::repositories::party_repository::MAX_PARTY_PAGE;

type PgTx<'a> = sqlx::Transaction<'a, sqlx::Postgres>;

// Supplier balance follows the existing PostgreSQL supplier repository convention
// (SUM(credit) - SUM(debit)); see Phase 1.1 report finding on the SQLite/PostgreSQL
// supplier ledger sign divergence.
const SUMMARY_SELECT: &str = "SELECT p.id, p.display_name, p.company_name, p.phone, p.alternate_phone, p.email,
        p.address, p.notes, p.is_active, p.created_at, p.updated_at,
        c.id AS customer_id, c.customer_code, c.credit_limit AS customer_credit_limit,
        s.id AS supplier_id, s.supplier_code,
        COALESCE((SELECT SUM(cl.debit) - SUM(cl.credit) FROM customer_ledger_entries cl WHERE cl.customer_id = c.id), 0)::BIGINT AS customer_receivable,
        COALESCE((SELECT SUM(sl.credit) - SUM(sl.debit) FROM supplier_ledger_entries sl WHERE sl.supplier_id = s.id), 0)::BIGINT AS supplier_payable
     FROM parties p
     LEFT JOIN customers c ON c.party_id = p.id
     LEFT JOIN suppliers s ON s.party_id = p.id";

fn db_err(context: &str, e: sqlx::Error) -> AppError {
    AppError::Database(format!("{context}: {e}"))
}

#[derive(Clone)]
pub struct PostgresPartyRepository {
    pool: PgPool,
}

impl PostgresPartyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    fn map_party(row: &sqlx::postgres::PgRow) -> AppResult<Party> {
        let is_active: i32 = row.try_get("is_active").map_err(|e| db_err("party.is_active", e))?;
        Ok(Party {
            id: row.try_get("id").map_err(|e| db_err("party.id", e))?,
            display_name: row.try_get("display_name").map_err(|e| db_err("party.display_name", e))?,
            company_name: row.try_get("company_name").map_err(|e| db_err("party.company_name", e))?,
            phone: row.try_get("phone").map_err(|e| db_err("party.phone", e))?,
            alternate_phone: row.try_get("alternate_phone").map_err(|e| db_err("party.alternate_phone", e))?,
            email: row.try_get("email").map_err(|e| db_err("party.email", e))?,
            address: row.try_get("address").map_err(|e| db_err("party.address", e))?,
            notes: row.try_get("notes").map_err(|e| db_err("party.notes", e))?,
            is_active: is_active == 1,
            created_at: row.try_get("created_at").map_err(|e| db_err("party.created_at", e))?,
            updated_at: row.try_get("updated_at").map_err(|e| db_err("party.updated_at", e))?,
        })
    }

    fn map_summary(row: &sqlx::postgres::PgRow) -> AppResult<PartySummaryDto> {
        let party = Self::map_party(row)?;
        let customer_id: Option<String> = row.try_get("customer_id").map_err(|e| db_err("customer_id", e))?;
        let supplier_id: Option<String> = row.try_get("supplier_id").map_err(|e| db_err("supplier_id", e))?;
        Ok(PartySummaryDto {
            party,
            party_type: PartyType::from_roles(customer_id.is_some(), supplier_id.is_some()),
            customer_id,
            customer_code: row.try_get("customer_code").map_err(|e| db_err("customer_code", e))?,
            customer_credit_limit: row.try_get("customer_credit_limit").map_err(|e| db_err("customer_credit_limit", e))?,
            supplier_id,
            supplier_code: row.try_get("supplier_code").map_err(|e| db_err("supplier_code", e))?,
            customer_receivable: row.try_get("customer_receivable").map_err(|e| db_err("customer_receivable", e))?,
            supplier_payable: row.try_get("supplier_payable").map_err(|e| db_err("supplier_payable", e))?,
        })
    }

    // ──────────────────────────────────────────────────────────────────────
    // Central projection primitives (inside the sync push transaction)
    // ──────────────────────────────────────────────────────────────────────

    pub async fn get_party_tx(tx: &mut PgTx<'_>, id: &str) -> AppResult<Option<Party>> {
        let row = sqlx::query(
            "SELECT id, display_name, company_name, phone, alternate_phone, email, address, notes,
                    is_active, created_at, updated_at
             FROM parties WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| db_err("Failed to query party", e))?;
        row.as_ref().map(Self::map_party).transpose()
    }

    /// Insert or update guarded by `updated_at` (incoming wins when >= stored).
    pub async fn upsert_party_guarded_tx(tx: &mut PgTx<'_>, party: &Party) -> AppResult<bool> {
        let res = sqlx::query(
            "INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address,
                                  notes, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                company_name = EXCLUDED.company_name,
                phone = EXCLUDED.phone,
                alternate_phone = EXCLUDED.alternate_phone,
                email = EXCLUDED.email,
                address = EXCLUDED.address,
                notes = EXCLUDED.notes,
                is_active = EXCLUDED.is_active,
                updated_at = EXCLUDED.updated_at
             WHERE parties.updated_at <= EXCLUDED.updated_at",
        )
        .bind(&party.id)
        .bind(&party.display_name)
        .bind(&party.company_name)
        .bind(&party.phone)
        .bind(&party.alternate_phone)
        .bind(&party.email)
        .bind(&party.address)
        .bind(&party.notes)
        .bind(if party.is_active { 1i32 } else { 0i32 })
        .bind(&party.created_at)
        .bind(&party.updated_at)
        .execute(&mut **tx)
        .await
        .map_err(|e| db_err("Failed to upsert party centrally", e))?;
        Ok(res.rows_affected() > 0)
    }

    /// Copies party contact fields to linked customer/supplier rows (role updated_at never moves back).
    pub async fn copy_party_to_roles_tx(tx: &mut PgTx<'_>, party: &Party) -> AppResult<()> {
        for table in ["customers", "suppliers"] {
            let sql = format!(
                "UPDATE {table} SET name = $1, phone = $2, alternate_phone = $3, email = $4, address = $5,
                        is_active = $6, updated_at = GREATEST(updated_at, $7)
                 WHERE party_id = $8"
            );
            sqlx::query(&sql)
                .bind(&party.display_name)
                .bind(&party.phone)
                .bind(&party.alternate_phone)
                .bind(&party.email)
                .bind(&party.address)
                .bind(if party.is_active { 1i32 } else { 0i32 })
                .bind(&party.updated_at)
                .bind(&party.id)
                .execute(&mut **tx)
                .await
                .map_err(|e| db_err(&format!("Failed to copy party contact to {table}"), e))?;
        }
        Ok(())
    }

    /// Same contract as `SQLitePartyRepository::ensure_party_for_role_in_tx`.
    pub async fn ensure_party_for_role_tx(
        tx: &mut PgTx<'_>,
        contact: &PartyRoleContact,
        party_id: &str,
    ) -> AppResult<Option<String>> {
        let derived = contact.to_party(party_id);
        let table = contact.kind.table();
        let role_row: Option<Option<String>> = sqlx::query_scalar::<_, Option<String>>(&format!(
            "SELECT party_id FROM {table} WHERE id = $1"
        ))
        .bind(&contact.role_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| db_err("Failed to read role party link", e))?;
        let Some(current) = role_row else {
            // Role row does not exist (e.g. UPDATED for an unknown role): never create a stray party.
            return Ok(None);
        };

        // An already-linked role keeps its party (never re-pointed, never a stray party).
        if current.is_none() {
            sqlx::query(
                "INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address,
                                      notes, is_active, created_at, updated_at)
                 VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (id) DO NOTHING",
            )
            .bind(&derived.id)
            .bind(&derived.display_name)
            .bind(&derived.phone)
            .bind(&derived.alternate_phone)
            .bind(&derived.email)
            .bind(&derived.address)
            .bind(&derived.notes)
            .bind(if derived.is_active { 1i32 } else { 0i32 })
            .bind(&derived.created_at)
            .bind(&derived.updated_at)
            .execute(&mut **tx)
            .await
            .map_err(|e| db_err("Failed to derive party from role centrally", e))?;

            let link_sql = format!(
                "UPDATE {table} SET party_id = $1
                 WHERE id = $2 AND party_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM {table} o WHERE o.party_id = $1)"
            );
            sqlx::query(&link_sql)
                .bind(party_id)
                .bind(&contact.role_id)
                .execute(&mut **tx)
                .await
                .map_err(|e| db_err(&format!("Failed to link {table} row to party"), e))?;
        }

        let effective: Option<String> = sqlx::query_scalar::<_, Option<String>>(&format!(
            "SELECT party_id FROM {table} WHERE id = $1"
        ))
        .bind(&contact.role_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| db_err("Failed to read role party link", e))?
        .flatten();

        if let Some(ref pid) = effective {
            sqlx::query(
                "UPDATE parties SET display_name = $1, phone = $2, alternate_phone = $3, email = $4,
                        address = $5, is_active = $6, updated_at = $7
                 WHERE id = $8 AND updated_at <= $7
                   AND (SELECT COUNT(*) FROM customers WHERE party_id = $8)
                     + (SELECT COUNT(*) FROM suppliers WHERE party_id = $8) = 1",
            )
            .bind(&derived.display_name)
            .bind(&derived.phone)
            .bind(&derived.alternate_phone)
            .bind(&derived.email)
            .bind(&derived.address)
            .bind(if derived.is_active { 1i32 } else { 0i32 })
            .bind(&derived.updated_at)
            .bind(pid)
            .execute(&mut **tx)
            .await
            .map_err(|e| db_err("Failed to mirror role contact to party centrally", e))?;
        }
        Ok(effective)
    }

    /// Links a role created through the legacy REST path (outside the sync pipeline).
    pub async fn ensure_party_for_role(&self, contact: &PartyRoleContact, party_id: &str) -> AppResult<Option<String>> {
        let mut tx = self.pool.begin().await.map_err(|e| db_err("Failed to begin party transaction", e))?;
        let effective = Self::ensure_party_for_role_tx(&mut tx, contact, party_id).await?;
        tx.commit().await.map_err(|e| db_err("Failed to commit party transaction", e))?;
        Ok(effective)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Read APIs (server REST)
    // ──────────────────────────────────────────────────────────────────────

    pub async fn get_party_summary(&self, id: &str) -> AppResult<Option<PartySummaryDto>> {
        let sql = format!("{SUMMARY_SELECT} WHERE p.id = $1");
        let row = sqlx::query(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| db_err("Failed to query party summary", e))?;
        row.as_ref().map(Self::map_summary).transpose()
    }

    pub async fn list_parties(&self, filter: &PartyFilter) -> AppResult<Vec<PartySummaryDto>> {
        let mut sql = format!("{SUMMARY_SELECT} WHERE 1=1");
        let mut n = 0usize;
        let mut next = || {
            n += 1;
            format!("${n}")
        };

        let active_param = filter.is_active.map(|a| if a { 1i32 } else { 0i32 });
        if active_param.is_some() {
            sql.push_str(&format!(" AND p.is_active = {}", next()));
        }
        match filter.party_type {
            Some(PartyType::Customer) => sql.push_str(" AND c.id IS NOT NULL"),
            Some(PartyType::Supplier) => sql.push_str(" AND s.id IS NOT NULL"),
            Some(PartyType::Both) => sql.push_str(" AND c.id IS NOT NULL AND s.id IS NOT NULL"),
            None => {}
        }
        let pattern = filter
            .search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{s}%"));
        if pattern.is_some() {
            let ph = next();
            sql.push_str(&format!(
                " AND (p.display_name ILIKE {ph} OR p.company_name ILIKE {ph} OR p.phone ILIKE {ph}
                       OR p.alternate_phone ILIKE {ph} OR c.customer_code ILIKE {ph} OR s.supplier_code ILIKE {ph})"
            ));
        }
        let limit_ph = next();
        let offset_ph = next();
        sql.push_str(&format!(
            " ORDER BY lower(p.display_name) ASC, p.id ASC LIMIT {limit_ph} OFFSET {offset_ph}"
        ));

        let mut q = sqlx::query(&sql);
        if let Some(a) = active_param {
            q = q.bind(a);
        }
        if let Some(ref p) = pattern {
            q = q.bind(p.clone());
        }
        q = q
            .bind(filter.limit.unwrap_or(MAX_PARTY_PAGE).clamp(1, MAX_PARTY_PAGE))
            .bind(filter.offset.unwrap_or(0).max(0));

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| db_err("Failed to list parties", e))?;
        rows.iter().map(Self::map_summary).collect()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn role_tables_are_static() {
        use crate::domain::party::PartyRoleKind;
        assert_eq!(PartyRoleKind::Customer.table(), "customers");
        assert_eq!(PartyRoleKind::Supplier.table(), "suppliers");
    }
}
