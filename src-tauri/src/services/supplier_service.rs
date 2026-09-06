use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::transaction::with_transaction;
use crate::domain::supplier::{
    CreateSupplierDto, Supplier, SupplierDetailDto, SupplierFilter, SupplierStatementDto,
    SupplierSummaryDto, UpdateSupplierDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::SQLiteSupplierRepository;

#[derive(Clone)]
pub struct SupplierService {
    db: DatabaseConnection,
    supplier_repo: SQLiteSupplierRepository,
}

impl SupplierService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            supplier_repo: SQLiteSupplierRepository::new(db.clone()),
            db,
        }
    }

    /// Creates a new supplier with backend-generated UUID and sequential supplier code (SUP-000001)
    pub async fn create_supplier(&self, dto: CreateSupplierDto) -> AppResult<Supplier> {
        let name = dto.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation("Supplier name cannot be empty".to_string()));
        }

        let phone = dto.phone.trim();
        if phone.is_empty() {
            return Err(AppError::Validation("Supplier phone number cannot be empty".to_string()));
        }

        let credit_limit = dto.credit_limit.unwrap_or(0);
        if credit_limit < 0 {
            return Err(AppError::Validation("Credit limit cannot be negative".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        // Atomically generate supplier_code inside a transaction
        let supplier_code = with_transaction(&self.db, |tx| {
            SQLiteSupplierRepository::next_supplier_code_in_tx(tx)
        })
        .await?;

        let supplier = Supplier {
            id,
            supplier_code,
            name: name.to_string(),
            phone: phone.to_string(),
            alternate_phone: dto.alternate_phone.map(|p| p.trim().to_string()).filter(|p| !p.is_empty()),
            email: dto.email.map(|e| e.trim().to_string()).filter(|e| !e.is_empty()),
            address: dto.address.map(|a| a.trim().to_string()).filter(|a| !a.is_empty()),
            notes: dto.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
            credit_limit,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        };

        let supplier_clone = supplier.clone();
        with_transaction(&self.db, move |tx| {
            SQLiteSupplierRepository::insert_supplier_in_tx(tx, &supplier_clone)
        })
        .await?;

        Ok(supplier)
    }

    pub async fn get_supplier_by_id(&self, id: &str) -> AppResult<Option<Supplier>> {
        self.supplier_repo.get_by_id(id).await
    }

    pub async fn get_supplier_by_code(&self, code: &str) -> AppResult<Option<Supplier>> {
        self.supplier_repo.get_by_code(code).await
    }

    pub async fn list_suppliers(&self, filter: Option<SupplierFilter>) -> AppResult<Vec<SupplierSummaryDto>> {
        self.supplier_repo.list(filter).await
    }

    pub async fn search_suppliers(&self, query: &str) -> AppResult<Vec<SupplierSummaryDto>> {
        self.supplier_repo.search(query).await
    }

    pub async fn update_supplier(&self, id: &str, dto: UpdateSupplierDto) -> AppResult<Supplier> {
        if let Some(ref name) = dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Supplier name cannot be empty".to_string()));
            }
        }
        if let Some(ref phone) = dto.phone {
            if phone.trim().is_empty() {
                return Err(AppError::Validation("Supplier phone cannot be empty".to_string()));
            }
        }
        if let Some(limit) = dto.credit_limit {
            if limit < 0 {
                return Err(AppError::Validation("Credit limit cannot be negative".to_string()));
            }
        }

        self.supplier_repo.update(id, &dto).await
    }

    pub async fn deactivate_supplier(&self, id: &str) -> AppResult<()> {
        self.supplier_repo.deactivate(id).await
    }

    pub async fn get_outstanding_balance(&self, supplier_id: &str) -> AppResult<i64> {
        self.supplier_repo.get_outstanding_balance(supplier_id).await
    }

    pub async fn get_statement(&self, supplier_id: &str) -> AppResult<SupplierStatementDto> {
        self.supplier_repo.get_statement(supplier_id).await
    }

    pub async fn get_detail(&self, supplier_id: &str) -> AppResult<SupplierDetailDto> {
        self.supplier_repo.get_detail(supplier_id).await
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;

    async fn setup_test_db() -> (DatabaseConnection, SupplierService) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            guard.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut guard).unwrap();
        }
        let service = SupplierService::new(db.clone());
        (db, service)
    }

    #[tokio::test]
    async fn test_supplier_creation_and_sequential_codes() {
        let (_db, service) = setup_test_db().await;

        let s1 = service
            .create_supplier(CreateSupplierDto {
                name: "Alpha Electronics".to_string(),
                phone: "03001112233".to_string(),
                alternate_phone: None,
                email: Some("alpha@procure.com".to_string()),
                address: Some("Hall Road, Lahore".to_string()),
                notes: Some("Preferred supplier".to_string()),
                credit_limit: Some(150000),
            })
            .await
            .unwrap();

        assert_eq!(s1.supplier_code, "SUP-000001");
        assert_eq!(s1.name, "Alpha Electronics");
        assert_eq!(s1.credit_limit, 150000);
        assert!(s1.is_active);

        let s2 = service
            .create_supplier(CreateSupplierDto {
                name: "Beta Displays".to_string(),
                phone: "03004445566".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
            })
            .await
            .unwrap();

        assert_eq!(s2.supplier_code, "SUP-000002");
        assert_eq!(s2.credit_limit, 0); // 0 = unlimited credit
    }

    #[tokio::test]
    async fn test_supplier_search_update_and_deactivation() {
        let (_db, service) = setup_test_db().await;

        let sup = service
            .create_supplier(CreateSupplierDto {
                name: "Hafeez Parts Hub".to_string(),
                phone: "03219876543".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(50000),
            })
            .await
            .unwrap();

        // Search by name
        let found = service.search_suppliers("Hafeez").await.unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, sup.id);

        // Search by code
        let found_code = service.search_suppliers("SUP-000001").await.unwrap();
        assert_eq!(found_code.len(), 1);

        // Update profile
        let updated = service
            .update_supplier(
                &sup.id,
                UpdateSupplierDto {
                    name: Some("Hafeez Center Parts Mega Hub".to_string()),
                    phone: None,
                    alternate_phone: None,
                    email: None,
                    address: None,
                    notes: None,
                    credit_limit: Some(200000),
                    is_active: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.name, "Hafeez Center Parts Mega Hub");
        assert_eq!(updated.credit_limit, 200000);

        // Deactivation
        service.deactivate_supplier(&sup.id).await.unwrap();
        let deactivated = service.get_supplier_by_id(&sup.id).await.unwrap().unwrap();
        assert!(!deactivated.is_active);

        // Active filter excludes deactivated
        let active_only = service
            .list_suppliers(Some(SupplierFilter {
                is_active: Some(true),
                ..Default::default()
            }))
            .await
            .unwrap();
        assert_eq!(active_only.len(), 0);
    }
}
