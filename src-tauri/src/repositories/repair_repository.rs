use rusqlite::Connection;
use crate::db::errors::DbResult;
use crate::domain::repair::RepairJob;

pub struct RepairRepository;

impl RepairRepository {
    pub fn create(conn: &Connection, job: &RepairJob) -> DbResult<()> {
        conn.execute(
            "INSERT INTO repair_jobs (
                id, job_number, branch_id, customer_id, customer_name_snapshot,
                device_brand, device_model, device_imei, problem_description,
                estimated_charges, final_charges, paid_amount, status, notes,
                performed_by, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            rusqlite::params![
                job.id,
                job.job_number,
                job.branch_id,
                job.customer_id,
                job.customer_name_snapshot,
                job.device_brand,
                job.device_model,
                job.device_imei,
                job.problem_description,
                job.estimated_charges,
                job.final_charges,
                job.paid_amount,
                job.status.as_str(),
                job.notes,
                job.performed_by,
                job.created_at,
                job.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> DbResult<Option<RepairJob>> {
        let mut stmt = conn.prepare("SELECT * FROM repair_jobs WHERE id = ?1")?;
        let mut iter = stmt.query_map([id], |row| {
            Ok(RepairJob {
                id: row.get("id")?,
                job_number: row.get("job_number")?,
                branch_id: row.get("branch_id")?,
                customer_id: row.get("customer_id")?,
                customer_name_snapshot: row.get("customer_name_snapshot")?,
                device_brand: row.get("device_brand")?,
                device_model: row.get("device_model")?,
                device_imei: row.get("device_imei")?,
                problem_description: row.get("problem_description")?,
                estimated_charges: row.get("estimated_charges")?,
                final_charges: row.get("final_charges")?,
                paid_amount: row.get("paid_amount")?,
                status: crate::domain::repair::RepairJobStatus::from_str(&row.get::<_, String>("status")?).unwrap(),
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

    pub fn update(conn: &Connection, job: &RepairJob) -> DbResult<()> {
        conn.execute(
            "UPDATE repair_jobs SET
                status = ?1,
                final_charges = ?2,
                paid_amount = ?3,
                notes = ?4,
                updated_at = ?5
            WHERE id = ?6",
            rusqlite::params![
                job.status.as_str(),
                job.final_charges,
                job.paid_amount,
                job.notes,
                job.updated_at,
                job.id
            ],
        )?;
        Ok(())
    }
}
