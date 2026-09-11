use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::cash::{
    CashMovement, CashMovementDirection, CashMovementType, CashSession, CloseSessionDto,
    OpenSessionDto, RecordCashMovementDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresCashRepository {
    pool: PgPool,
}

impl PostgresCashRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn open_session(
        &self,
        dto: &OpenSessionDto,
        user_id: Option<&str>,
    ) -> AppResult<CashSession> {
        let existing = self.get_open_session(&dto.branch_id).await?;
        if existing.is_some() {
            return Err(AppError::Conflict(format!(
                "An open cash session already exists for branch '{}'",
                dto.branch_id
            )));
        }

        let now = Utc::now().to_rfc3339();
        let business_date = Utc::now().format("%Y-%m-%d").to_string();
        let session_id = Uuid::new_v4().to_string();

        let session = CashSession {
            id: session_id.clone(),
            branch_id: dto.branch_id.clone(),
            business_date,
            opening_cash: dto.opening_cash,
            expected_closing_cash: None,
            actual_closing_cash: None,
            cash_variance: None,
            status: "OPEN".to_string(),
            opened_at: now.clone(),
            closed_at: None,
            opened_by: user_id.map(|s| s.to_string()),
            closed_by: None,
            notes: dto.notes.clone(),
        };

        sqlx::query(
            "INSERT INTO cash_sessions (
                id, branch_id, business_date, opening_cash, status, opened_at, opened_by, notes
             ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7)"
        )
        .bind(&session.id)
        .bind(&session.branch_id)
        .bind(&session.business_date)
        .bind(session.opening_cash)
        .bind(&session.opened_at)
        .bind(session.opened_by.as_deref())
        .bind(session.notes.as_deref())
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to open cash session: {e}")))?;

        Ok(session)
    }

    pub async fn close_session(
        &self,
        dto: &CloseSessionDto,
        user_id: Option<&str>,
    ) -> AppResult<CashSession> {
        let open_session = self
            .get_session_by_id(&dto.session_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Session '{}' not found", dto.session_id)))?;

        if open_session.status != "OPEN" {
            return Err(AppError::Validation("Cash session is already closed".to_string()));
        }

        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;

        // Calculate expected closing cash: opening_cash + IN movements - OUT movements
        let in_total: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE session_id = $1 AND direction = 'IN'",
        )
        .bind(&dto.session_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let out_total: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE session_id = $1 AND direction = 'OUT'",
        )
        .bind(&dto.session_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let expected = open_session.opening_cash + in_total.0 - out_total.0;
        let variance = dto.actual_closing_cash - expected;
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "UPDATE cash_sessions
             SET expected_closing_cash = $1, actual_closing_cash = $2, cash_variance = $3,
                 status = 'CLOSED', closed_at = $4, closed_by = $5, notes = COALESCE($6, notes)
             WHERE id = $7"
        )
        .bind(expected)
        .bind(dto.actual_closing_cash)
        .bind(variance)
        .bind(&now)
        .bind(user_id)
        .bind(dto.notes.as_deref())
        .bind(&dto.session_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;

        Ok(CashSession {
            id: open_session.id,
            branch_id: open_session.branch_id,
            business_date: open_session.business_date,
            opening_cash: open_session.opening_cash,
            expected_closing_cash: Some(expected),
            actual_closing_cash: Some(dto.actual_closing_cash),
            cash_variance: Some(variance),
            status: "CLOSED".to_string(),
            opened_at: open_session.opened_at,
            closed_at: Some(now),
            opened_by: open_session.opened_by,
            closed_by: user_id.map(|s| s.to_string()),
            notes: dto.notes.or(open_session.notes),
        })
    }

    pub async fn get_open_session(&self, branch_id: &str) -> AppResult<Option<CashSession>> {
        let sql = "SELECT id, branch_id, business_date, opening_cash, expected_closing_cash, actual_closing_cash, cash_variance, status, opened_at, closed_at, opened_by, closed_by, notes FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1";
        let row_opt = sqlx::query(sql)
            .bind(branch_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query open cash session: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_session_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_session_by_id(&self, id: &str) -> AppResult<Option<CashSession>> {
        let sql = "SELECT id, branch_id, business_date, opening_cash, expected_closing_cash, actual_closing_cash, cash_variance, status, opened_at, closed_at, opened_by, closed_by, notes FROM cash_sessions WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query cash session: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_session_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn record_movement(
        &self,
        dto: &RecordCashMovementDto,
        user_id: Option<&str>,
    ) -> AppResult<CashMovement> {
        let open_session_id = self
            .get_open_session(&dto.branch_id)
            .await?
            .map(|s| s.id);

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let movement = CashMovement {
            id: id.clone(),
            session_id: open_session_id.clone(),
            branch_id: dto.branch_id.clone(),
            movement_type: dto.movement_type,
            direction: dto.direction,
            amount: dto.amount,
            reference_id: dto.reference_id.clone(),
            reference_number: dto.reference_number.clone(),
            payment_method: dto.payment_method.clone().unwrap_or_else(|| "CASH".to_string()),
            description: dto.description.clone(),
            performed_by: user_id.map(|s| s.to_string()),
            created_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO cash_movements (
                id, session_id, branch_id, movement_type, direction, amount,
                reference_id, reference_number, payment_method, description, performed_by, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"
        )
        .bind(&movement.id)
        .bind(movement.session_id.as_deref())
        .bind(&movement.branch_id)
        .bind(movement.movement_type.as_str())
        .bind(movement.direction.as_str())
        .bind(movement.amount)
        .bind(movement.reference_id.as_deref())
        .bind(movement.reference_number.as_deref())
        .bind(&movement.payment_method)
        .bind(&movement.description)
        .bind(movement.performed_by.as_deref())
        .bind(&movement.created_at)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to record cash movement: {e}")))?;

        Ok(movement)
    }

    pub async fn get_movements(
        &self,
        branch_id: &str,
        session_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<CashMovement>> {
        let mut query = String::from("SELECT id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at FROM cash_movements WHERE branch_id = $1");
        let mut param_index = 2;

        if session_id.is_some() {
            query.push_str(&format!(" AND session_id = ${param_index}"));
            param_index += 1;
        }

        query.push_str(" ORDER BY created_at DESC, id DESC");

        let lim = limit.unwrap_or(100);
        query.push_str(&format!(" LIMIT {lim}"));

        let mut q = sqlx::query(&query).bind(branch_id);

        if let Some(sid) = session_id {
            q = q.bind(sid);
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query cash movements: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::map_movement_row(&row)?);
        }

        Ok(list)
    }

    pub async fn calculate_branch_balance(&self, branch_id: &str) -> AppResult<i64> {
        let in_amount: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE branch_id = $1 AND direction = 'IN'",
        )
        .bind(branch_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let out_amount: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE branch_id = $1 AND direction = 'OUT'",
        )
        .bind(branch_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(in_amount.0 - out_amount.0)
    }

    fn map_session_row(row: &sqlx::postgres::PgRow) -> AppResult<CashSession> {
        Ok(CashSession {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            branch_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            business_date: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            opening_cash: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            expected_closing_cash: row.try_get(4).unwrap_or(None),
            actual_closing_cash: row.try_get(5).unwrap_or(None),
            cash_variance: row.try_get(6).unwrap_or(None),
            status: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
            opened_at: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            closed_at: row.try_get(9).unwrap_or(None),
            opened_by: row.try_get(10).unwrap_or(None),
            closed_by: row.try_get(11).unwrap_or(None),
            notes: row.try_get(12).unwrap_or(None),
        })
    }

    fn map_movement_row(row: &sqlx::postgres::PgRow) -> AppResult<CashMovement> {
        let mtype_str: String = row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?;
        let dir_str: String = row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?;

        let movement_type = CashMovementType::from_str(&mtype_str)
            .unwrap_or(CashMovementType::CashAdjustment);
        let direction = CashMovementDirection::from_str(&dir_str)
            .unwrap_or(CashMovementDirection::In);

        Ok(CashMovement {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            session_id: row.try_get(1).unwrap_or(None),
            branch_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            movement_type,
            direction,
            amount: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
            reference_id: row.try_get(6).unwrap_or(None),
            reference_number: row.try_get(7).unwrap_or(None),
            payment_method: row.try_get(8).unwrap_or_else(|_| "CASH".to_string()),
            description: row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?,
            performed_by: row.try_get(10).unwrap_or(None),
            created_at: row.try_get(11).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
