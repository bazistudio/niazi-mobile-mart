//! Canonical Party identity (Phase 1.1).
//!
//! A `Party` is the single identity/contact record for anyone the shop trades
//! with. `customers` and `suppliers` remain ROLE tables (codes, credit limits,
//! ledgers, sales/purchase references) linked through `party_id`.
//!
//! Identity rules (identical in SQLite and PostgreSQL):
//! * Legacy rows are backfilled with `party.id = role.id` (deterministic, no
//!   coordination between PCs, never merged automatically).
//! * A party created through the Parties flow uses its first role's id as the
//!   party id; a BOTH party's supplier role gets its own UUID.
//! * A party linked to exactly ONE role mirrors that role's contact fields when
//!   the role is created/updated. A party linked to two roles is only changed
//!   through `PARTY_UPSERTED` (the Parties flow), which copies contact fields
//!   down to both roles.
//! * `PARTY_UPSERTED` is applied only when `incoming.updated_at >= stored.updated_at`.

use serde::{Deserialize, Serialize};

use crate::domain::customer::Customer;
use crate::domain::supplier::Supplier;

/// Sync event type for party create/update.
pub const PARTY_UPSERTED_EVENT: &str = "PARTY_UPSERTED";
/// change_log entity type for parties.
pub const PARTY_ENTITY_TYPE: &str = "PARTY";
/// `updated_at` written by the deterministic backfill (migration SQLite 021 / PostgreSQL 007).
pub const BACKFILL_UPDATED_AT: &str = "1970-01-01T00:00:00+00:00";
/// JSON key merged into CUSTOMER_* / SUPPLIER_* sync payloads.
pub const PARTY_ID_PAYLOAD_KEY: &str = "party_id";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PartyType {
    Customer,
    Supplier,
    Both,
}

impl PartyType {
    pub fn from_roles(has_customer: bool, has_supplier: bool) -> Option<Self> {
        match (has_customer, has_supplier) {
            (true, true) => Some(PartyType::Both),
            (true, false) => Some(PartyType::Customer),
            (false, true) => Some(PartyType::Supplier),
            (false, false) => None,
        }
    }

    pub fn includes_customer(&self) -> bool {
        matches!(self, PartyType::Customer | PartyType::Both)
    }

    pub fn includes_supplier(&self) -> bool {
        matches!(self, PartyType::Supplier | PartyType::Both)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            PartyType::Customer => "CUSTOMER",
            PartyType::Supplier => "SUPPLIER",
            PartyType::Both => "BOTH",
        }
    }
}

/// Canonical party record (table `parties`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Party {
    pub id: String,
    pub display_name: String,
    pub company_name: Option<String>,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Party with its linked roles and read-only balances (whole PKR).
/// `customer_receivable` = customer ledger SUM(debit) - SUM(credit).
/// `supplier_payable` follows each backend's existing supplier balance convention.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PartySummaryDto {
    pub party: Party,
    /// `None` when no role is linked (e.g. a party that arrived before its role).
    pub party_type: Option<PartyType>,
    pub customer_id: Option<String>,
    pub customer_code: Option<String>,
    pub customer_credit_limit: Option<i64>,
    pub supplier_id: Option<String>,
    pub supplier_code: Option<String>,
    pub customer_receivable: i64,
    pub supplier_payable: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreatePartyDto {
    pub party_type: PartyType,
    pub display_name: String,
    pub company_name: Option<String>,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    /// Applied to the customer role only (0 = unlimited by Niazi policy).
    pub credit_limit: Option<i64>,
}

/// Partial update. For optional text fields `Some("")` clears the value.
/// Party type changes (adding/removing roles) are NOT supported in this phase.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct UpdatePartyDto {
    pub display_name: Option<String>,
    pub company_name: Option<String>,
    pub phone: Option<String>,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct PartyFilter {
    pub search: Option<String>,
    /// CUSTOMER = has a customer role (includes BOTH); SUPPLIER likewise; BOTH = both roles.
    pub party_type: Option<PartyType>,
    pub is_active: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Which role table a contact came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PartyRoleKind {
    Customer,
    Supplier,
}

impl PartyRoleKind {
    pub fn table(&self) -> &'static str {
        match self {
            PartyRoleKind::Customer => "customers",
            PartyRoleKind::Supplier => "suppliers",
        }
    }
}

/// Role contact fields used to derive/mirror a party.
#[derive(Debug, Clone, PartialEq)]
pub struct PartyRoleContact {
    pub kind: PartyRoleKind,
    pub role_id: String,
    pub role_code: String,
    pub name: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl PartyRoleContact {
    /// Display name used for the party: role name, or the role code if the name is blank
    /// (same rule as the migration backfill).
    pub fn display_name(&self) -> String {
        let trimmed = self.name.trim();
        if trimmed.is_empty() {
            self.role_code.clone()
        } else {
            trimmed.to_string()
        }
    }

    /// A new party derived from this role (company name unknown at role level).
    pub fn to_party(&self, party_id: &str) -> Party {
        Party {
            id: party_id.to_string(),
            display_name: self.display_name(),
            company_name: None,
            phone: self.phone.trim().to_string(),
            alternate_phone: self.alternate_phone.clone(),
            email: self.email.clone(),
            address: self.address.clone(),
            notes: self.notes.clone(),
            is_active: self.is_active,
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}

impl From<&Customer> for PartyRoleContact {
    fn from(c: &Customer) -> Self {
        Self {
            kind: PartyRoleKind::Customer,
            role_id: c.id.clone(),
            role_code: c.customer_code.clone(),
            name: c.name.clone(),
            phone: c.phone.clone(),
            alternate_phone: c.alternate_phone.clone(),
            email: c.email.clone(),
            address: c.address.clone(),
            notes: c.notes.clone(),
            is_active: c.is_active,
            created_at: c.created_at.clone(),
            updated_at: c.updated_at.clone(),
        }
    }
}

impl From<&Supplier> for PartyRoleContact {
    fn from(s: &Supplier) -> Self {
        Self {
            kind: PartyRoleKind::Supplier,
            role_id: s.id.clone(),
            role_code: s.supplier_code.clone(),
            name: s.name.clone(),
            phone: s.phone.clone(),
            alternate_phone: s.alternate_phone.clone(),
            email: s.email.clone(),
            address: s.address.clone(),
            notes: s.notes.clone(),
            is_active: s.is_active,
            created_at: s.created_at.clone(),
            updated_at: s.updated_at.clone(),
        }
    }
}

/// Trims; empty becomes `None`.
pub fn normalize_optional(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn looks_like_email(value: &str) -> bool {
    let v = value.trim();
    match v.split_once('@') {
        Some((local, domain)) => !local.is_empty() && domain.contains('.') && !v.contains(' '),
        None => false,
    }
}

pub fn validate_create_party(dto: &CreatePartyDto) -> Result<(), String> {
    if dto.display_name.trim().is_empty() {
        return Err("Party name cannot be empty".to_string());
    }
    if dto.phone.trim().is_empty() {
        return Err("Party phone number cannot be empty".to_string());
    }
    if let Some(limit) = dto.credit_limit {
        if limit < 0 {
            return Err("Credit limit cannot be negative".to_string());
        }
    }
    if let Some(email) = dto.email.as_deref() {
        if !email.trim().is_empty() && !looks_like_email(email) {
            return Err("Party email address is not valid".to_string());
        }
    }
    Ok(())
}

pub fn validate_update_party(dto: &UpdatePartyDto) -> Result<(), String> {
    if let Some(name) = dto.display_name.as_deref() {
        if name.trim().is_empty() {
            return Err("Party name cannot be empty".to_string());
        }
    }
    if let Some(phone) = dto.phone.as_deref() {
        if phone.trim().is_empty() {
            return Err("Party phone number cannot be empty".to_string());
        }
    }
    if let Some(email) = dto.email.as_deref() {
        if !email.trim().is_empty() && !looks_like_email(email) {
            return Err("Party email address is not valid".to_string());
        }
    }
    Ok(())
}

/// Builds the new party from a new id and a validated create DTO.
pub fn build_party(id: &str, dto: &CreatePartyDto, now: &str) -> Party {
    Party {
        id: id.to_string(),
        display_name: dto.display_name.trim().to_string(),
        company_name: normalize_optional(dto.company_name.clone()),
        phone: dto.phone.trim().to_string(),
        alternate_phone: normalize_optional(dto.alternate_phone.clone()),
        email: normalize_optional(dto.email.clone()),
        address: normalize_optional(dto.address.clone()),
        notes: normalize_optional(dto.notes.clone()),
        is_active: true,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    }
}

/// Applies a validated partial update; `updated_at` becomes `now`.
pub fn apply_party_update(existing: &Party, dto: &UpdatePartyDto, now: &str) -> Party {
    let pick = |incoming: &Option<String>, current: &Option<String>| -> Option<String> {
        match incoming {
            Some(v) => normalize_optional(Some(v.clone())),
            None => current.clone(),
        }
    };
    Party {
        id: existing.id.clone(),
        display_name: dto
            .display_name
            .as_deref()
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| existing.display_name.clone()),
        company_name: pick(&dto.company_name, &existing.company_name),
        phone: dto
            .phone
            .as_deref()
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| existing.phone.clone()),
        alternate_phone: pick(&dto.alternate_phone, &existing.alternate_phone),
        email: pick(&dto.email, &existing.email),
        address: pick(&dto.address, &existing.address),
        notes: pick(&dto.notes, &existing.notes),
        is_active: dto.is_active.unwrap_or(existing.is_active),
        created_at: existing.created_at.clone(),
        updated_at: now.to_string(),
    }
}

/// Last-writer guard shared by SQLite and PostgreSQL (RFC3339 text comparison).
pub fn incoming_wins(incoming_updated_at: &str, stored_updated_at: &str) -> bool {
    incoming_updated_at >= stored_updated_at
}

/// Returns the payload JSON with `party_id` merged in (role payloads stay backward compatible:
/// older readers ignore the extra key).
pub fn payload_with_party_id(payload_json: &str, party_id: &str) -> Result<String, serde_json::Error> {
    let mut value: serde_json::Value = serde_json::from_str(payload_json)?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            PARTY_ID_PAYLOAD_KEY.to_string(),
            serde_json::Value::String(party_id.to_string()),
        );
    }
    serde_json::to_string(&value)
}

/// Serializes a role record and merges `party_id`.
pub fn role_payload_with_party_id<T: Serialize>(role: &T, party_id: &str) -> Result<String, serde_json::Error> {
    let mut value = serde_json::to_value(role)?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            PARTY_ID_PAYLOAD_KEY.to_string(),
            serde_json::Value::String(party_id.to_string()),
        );
    }
    serde_json::to_string(&value)
}

/// Reads `party_id` from a role payload; falls back to the role id (legacy payloads and
/// change_log entries written before Phase 1.1 follow the backfill rule party.id = role.id).
pub fn party_id_from_payload(payload_json: &str, role_id: &str) -> String {
    serde_json::from_str::<serde_json::Value>(payload_json)
        .ok()
        .and_then(|v| {
            v.get(PARTY_ID_PAYLOAD_KEY)
                .and_then(|p| p.as_str())
                .map(|s| s.trim().to_string())
        })
        .filter(|s| s.len() == 36)
        .unwrap_or_else(|| role_id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn customer() -> Customer {
        Customer {
            id: "11111111-1111-4111-8111-111111111111".into(),
            customer_code: "CUS-000001".into(),
            name: " Ali Traders ".into(),
            phone: "0300111222".into(),
            alternate_phone: None,
            email: Some("ali@x.pk".into()),
            address: Some("Hall Road".into()),
            notes: None,
            credit_limit: 5000,
            is_active: true,
            created_at: "2026-01-01T00:00:00+00:00".into(),
            updated_at: "2026-02-01T00:00:00+00:00".into(),
        }
    }

    #[test]
    fn party_type_from_roles() {
        assert_eq!(PartyType::from_roles(true, true), Some(PartyType::Both));
        assert_eq!(PartyType::from_roles(true, false), Some(PartyType::Customer));
        assert_eq!(PartyType::from_roles(false, true), Some(PartyType::Supplier));
        assert_eq!(PartyType::from_roles(false, false), None);
        assert!(PartyType::Both.includes_customer() && PartyType::Both.includes_supplier());
        assert!(!PartyType::Customer.includes_supplier());
    }

    #[test]
    fn party_type_serializes_uppercase() {
        assert_eq!(serde_json::to_string(&PartyType::Both).unwrap(), "\"BOTH\"");
        let t: PartyType = serde_json::from_str("\"SUPPLIER\"").unwrap();
        assert_eq!(t, PartyType::Supplier);
    }

    #[test]
    fn role_contact_derives_party_with_same_identity() {
        let c = customer();
        let contact = PartyRoleContact::from(&c);
        let p = contact.to_party(&c.id);
        assert_eq!(p.id, c.id);
        assert_eq!(p.display_name, "Ali Traders");
        assert_eq!(p.phone, c.phone);
        assert_eq!(p.email, c.email);
        assert_eq!(p.company_name, None);
        assert_eq!(p.updated_at, c.updated_at);
    }

    #[test]
    fn blank_role_name_falls_back_to_code() {
        let mut c = customer();
        c.name = "   ".into();
        assert_eq!(PartyRoleContact::from(&c).display_name(), "CUS-000001");
    }

    #[test]
    fn validation_rules() {
        let mut dto = CreatePartyDto {
            party_type: PartyType::Both,
            display_name: "Ali".into(),
            company_name: None,
            phone: "0300".into(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: Some(0),
        };
        assert!(validate_create_party(&dto).is_ok());
        dto.display_name = "  ".into();
        assert!(validate_create_party(&dto).is_err());
        dto.display_name = "Ali".into();
        dto.phone = "".into();
        assert!(validate_create_party(&dto).is_err());
        dto.phone = "0300".into();
        dto.credit_limit = Some(-1);
        assert!(validate_create_party(&dto).is_err());
        dto.credit_limit = None;
        dto.email = Some("not-an-email".into());
        assert!(validate_create_party(&dto).is_err());
        dto.email = Some("".into());
        assert!(validate_create_party(&dto).is_ok());

        assert!(validate_update_party(&UpdatePartyDto::default()).is_ok());
        assert!(validate_update_party(&UpdatePartyDto { display_name: Some(" ".into()), ..Default::default() }).is_err());
        assert!(validate_update_party(&UpdatePartyDto { phone: Some("".into()), ..Default::default() }).is_err());
    }

    #[test]
    fn update_merges_and_clears() {
        let base = PartyRoleContact::from(&customer()).to_party("11111111-1111-4111-8111-111111111111");
        let dto = UpdatePartyDto {
            company_name: Some(" Ali & Sons ".into()),
            email: Some("".into()),
            is_active: Some(false),
            ..Default::default()
        };
        let p = apply_party_update(&base, &dto, "2026-09-28T00:00:00+00:00");
        assert_eq!(p.company_name.as_deref(), Some("Ali & Sons"));
        assert_eq!(p.email, None);
        assert_eq!(p.display_name, base.display_name);
        assert!(!p.is_active);
        assert_eq!(p.created_at, base.created_at);
        assert_eq!(p.updated_at, "2026-09-28T00:00:00+00:00");
    }

    #[test]
    fn updated_at_guard() {
        assert!(incoming_wins("2026-09-28T00:00:00+00:00", BACKFILL_UPDATED_AT));
        assert!(incoming_wins("2026-09-28T00:00:00+00:00", "2026-09-28T00:00:00+00:00"));
        assert!(!incoming_wins("2026-09-27T00:00:00+00:00", "2026-09-28T00:00:00+00:00"));
    }

    #[test]
    fn payload_party_id_round_trip() {
        let c = customer();
        let payload = role_payload_with_party_id(&c, "22222222-2222-4222-8222-222222222222").unwrap();
        // Existing readers still parse the role struct.
        let parsed: Customer = serde_json::from_str(&payload).unwrap();
        assert_eq!(parsed, c);
        assert_eq!(party_id_from_payload(&payload, &c.id), "22222222-2222-4222-8222-222222222222");
        // Legacy payload without party_id -> role id.
        let legacy = serde_json::to_string(&c).unwrap();
        assert_eq!(party_id_from_payload(&legacy, &c.id), c.id);
        // Malformed party_id -> role id.
        let bad = payload_with_party_id(&legacy, "short").unwrap();
        assert_eq!(party_id_from_payload(&bad, &c.id), c.id);
    }
}
