use rusqlite::Connection;
use crate::db::errors::DbResult;
use crate::domain::used_mobile::UsedMobileTransaction;

pub struct UsedMobileRepository;

impl UsedMobileRepository {
    pub fn create(conn: &Connection, tx: &UsedMobileTransaction) -> DbResult<()> {
        conn.execute(
            "INSERT INTO used_mobile_transactions (
                id, transaction_number, branch_id, transaction_type, customer_id,
                seller_name_snapshot, seller_cnic, seller_mobile, device_brand,
                device_model, device_imei_1, device_imei_2, device_condition,
                transaction_amount, payment_status, status, notes,
                performed_by, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            rusqlite::params![
                tx.id,
                tx.transaction_number,
                tx.branch_id,
                tx.transaction_type.as_str(),
                tx.customer_id,
                tx.seller_name_snapshot,
                tx.seller_cnic,
                tx.seller_mobile,
                tx.device_brand,
                tx.device_model,
                tx.device_imei_1,
                tx.device_imei_2,
                tx.device_condition,
                tx.transaction_amount,
                tx.payment_status.as_str(),
                tx.status.as_str(),
                tx.notes,
                tx.performed_by,
                tx.created_at,
                tx.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> DbResult<Option<UsedMobileTransaction>> {
        let mut stmt = conn.prepare("SELECT * FROM used_mobile_transactions WHERE id = ?1")?;
        let mut iter = stmt.query_map([id], |row| {
            Ok(UsedMobileTransaction {
                id: row.get("id")?,
                transaction_number: row.get("transaction_number")?,
                branch_id: row.get("branch_id")?,
                transaction_type: crate::domain::used_mobile::UsedMobileTransactionType::from_str(&row.get::<_, String>("transaction_type")?).unwrap(),
                customer_id: row.get("customer_id")?,
                seller_name_snapshot: row.get("seller_name_snapshot")?,
                seller_cnic: row.get("seller_cnic")?,
                seller_mobile: row.get("seller_mobile")?,
                device_brand: row.get("device_brand")?,
                device_model: row.get("device_model")?,
                device_imei_1: row.get("device_imei_1")?,
                device_imei_2: row.get("device_imei_2")?,
                device_condition: row.get("device_condition")?,
                transaction_amount: row.get("transaction_amount")?,
                payment_status: crate::domain::used_mobile::UsedMobilePaymentStatus::from_str(&row.get::<_, String>("payment_status")?).unwrap(),
                status: crate::domain::used_mobile::UsedMobileStatus::from_str(&row.get::<_, String>("status")?).unwrap(),
                notes: row.get("notes")?,
                performed_by: row.get("performed_by")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn update(conn: &Connection, tx: &UsedMobileTransaction) -> DbResult<()> {
        conn.execute(
            "UPDATE used_mobile_transactions SET
                payment_status = ?1,
                status = ?2,
                notes = ?3,
                updated_at = ?4
            WHERE id = ?5",
            rusqlite::params![
                tx.payment_status.as_str(),
                tx.status.as_str(),
                tx.notes,
                tx.updated_at,
                tx.id
            ],
        )?;
        Ok(())
    }
}
