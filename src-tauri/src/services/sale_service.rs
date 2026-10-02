use chrono::{FixedOffset, Utc};
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::customer::{CustomerLedgerEntry, CustomerLedgerEntryType};
use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::domain::sales::{
    normalize_payment_method, CompleteSaleDto, PaymentStatus, Sale, SaleFilterDto, SaleLine,
    SalePayment, SaleResultDto, SaleStatus,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    BranchRepository, CustomerRepository, PostgresBranchRepository, PostgresCustomerRepository,
    PostgresProductRepository, PostgresSaleRepository, ProductRepository, SQLiteCashRepository,
    SQLiteCustomerRepository, SQLiteInventoryRepository, SQLiteProductRepository,
    SQLiteSaleRepository, SaleRepository,
};

#[derive(Clone)]
pub struct SaleService {
    db: Option<DatabaseConnection>,
    sale_repo: SaleRepository,
    customer_repo: CustomerRepository,
    product_repo: ProductRepository,
    branch_repo: BranchRepository,
}

impl SaleService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self::new_sqlite(db)
    }

    pub fn new_sqlite(db: DatabaseConnection) -> Self {
        Self {
            sale_repo: SaleRepository::SQLite(SQLiteSaleRepository::new(db.clone())),
            customer_repo: CustomerRepository::SQLite(SQLiteCustomerRepository::new(db.clone())),
            product_repo: ProductRepository::SQLite(SQLiteProductRepository::new(db.clone())),
            branch_repo: BranchRepository::SQLite(crate::repositories::SQLiteBranchRepository::new(db.clone())),
            db: Some(db),
        }
    }

    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            sale_repo: SaleRepository::Postgres(PostgresSaleRepository::new(pool.clone())),
            customer_repo: CustomerRepository::Postgres(PostgresCustomerRepository::new(pool.clone())),
            product_repo: ProductRepository::Postgres(PostgresProductRepository::new(pool.clone())),
            branch_repo: BranchRepository::Postgres(PostgresBranchRepository::new(pool)),
            db: None,
        }
    }

    /// Completes a retail sale
    pub async fn complete_sale(
        &self,
        user_id: Option<&str>,
        dto: CompleteSaleDto,
    ) -> AppResult<SaleResultDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation("Cannot complete sale with empty cart".to_string()));
        }

        if let SaleRepository::Postgres(pg_repo) = &self.sale_repo {
            return pg_repo.complete_sale(&dto, user_id).await;
        }

        // 1. Resolve Branch ID and Branch Code
        // branch_code is used in invoice number generation (B07 collision fix).
        let (branch_id, branch_code) = {
            let raw_bid = dto.branch_id.as_deref().map(str::trim).filter(|s| !s.is_empty());
            match raw_bid {
                Some(bid) => {
                    // Branch ID provided — look it up to get the code
                    let code = match self.branch_repo.get_branch_by_id(bid).await? {
                        Some(b) => b.code,
                        None => {
                            // Supplied branch_id is unknown — fall back to MAIN code
                            crate::domain::organization::DEFAULT_MAIN_BRANCH_CODE.to_string()
                        }
                    };
                    (bid.to_string(), code)
                }
                None => match self.branch_repo.get_main_branch().await? {
                    Some(b) => (b.id.clone(), b.code.clone()),
                    None => (
                        DEFAULT_MAIN_BRANCH_ID.to_string(),
                        crate::domain::organization::DEFAULT_MAIN_BRANCH_CODE.to_string(),
                    ),
                },
            }
        };

        // 2. Validate Customer if provided
        let mut customer_opt = None;
        if let Some(ref cid) = dto.customer_id {
            let cid_trim = cid.trim();
            if !cid_trim.is_empty() && cid_trim != "walk-in" {
                let customer = self.customer_repo.get_customer_by_id(cid_trim).await?
                    .ok_or_else(|| AppError::NotFound(format!("Customer '{cid_trim}' not found")))?;

                if !customer.is_active {
                    return Err(AppError::Validation(format!(
                        "Customer '{}' is inactive. Cannot complete sale.",
                        customer.name
                    )));
                }
                customer_opt = Some(customer);
            }
        }

        // 3. Resolve Product details & Authoritative Pricing
        struct PreparedLine {
            product_id: String,
            product_name: String,
            sku: String,
            unit_price: i64,
            cost_price: i64,
            quantity: i64,
            discount: i64,
            line_total: i64,
        }

        let mut prepared_lines = Vec::with_capacity(dto.items.len());

        for item in &dto.items {
            if item.quantity <= 0 {
                return Err(AppError::Validation("Item quantity must be greater than 0".to_string()));
            }

            let product = self.product_repo.get_product_by_id(&item.product_id).await?;
            if !product.is_active {
                return Err(AppError::Validation(format!(
                    "Product '{}' is inactive. Cannot complete sale.",
                    product.name
                )));
            }

            let unit_price = product.sale_price;
            let cost_price = if product.average_cost > 0 {
                product.average_cost
            } else {
                product.purchase_price
            };
            let line_disc = item.discount.unwrap_or(0).max(0);
            let subtotal = unit_price * item.quantity;
            let line_total = subtotal.saturating_sub(line_disc);

            prepared_lines.push(PreparedLine {
                product_id: product.id,
                product_name: product.name,
                sku: product.sku,
                unit_price,
                cost_price,
                quantity: item.quantity,
                discount: line_disc,
                line_total,
            });
        }

        // 4. Calculate Authoritative Totals & Payments
        let subtotal: i64 = prepared_lines.iter().map(|l| l.line_total).sum();
        let invoice_discount = dto.discount.unwrap_or(0).max(0);
        let total_amount = subtotal.saturating_sub(invoice_discount);

        #[derive(Clone)]
        struct TenderInput {
            method: String,
            amount: i64,
            reference_number: Option<String>,
            notes: Option<String>,
        }

        let mut tender_inputs = Vec::new();

        if let Some(ref payments_vec) = dto.payments {
            if !payments_vec.is_empty() {
                for p in payments_vec {
                    let normalized = normalize_payment_method(&p.method);
                    if normalized != "CREDIT" && p.amount > 0 {
                        tender_inputs.push(TenderInput {
                            method: normalized,
                            amount: p.amount,
                            reference_number: p.reference_number.clone(),
                            notes: p.notes.clone(),
                        });
                    }
                }
            }
        }

        if tender_inputs.is_empty() {
            let legacy_amount = dto.paid_amount.unwrap_or(total_amount).max(0);
            let legacy_method = normalize_payment_method(dto.payment_method.as_deref().unwrap_or("CASH"));
            if legacy_method != "CREDIT" && legacy_amount > 0 {
                tender_inputs.push(TenderInput {
                    method: legacy_method,
                    amount: legacy_amount,
                    reference_number: None,
                    notes: dto.notes.clone(),
                });
            }
        }

        let total_tendered: i64 = tender_inputs.iter().map(|t| t.amount).sum();

        let (recorded_paid, change_amount, credit_amount, payment_status) = if total_tendered >= total_amount {
            let change = total_tendered - total_amount;
            (total_amount, change, 0, PaymentStatus::Paid)
        } else {
            let credit = total_amount - total_tendered;
            let status = if total_tendered > 0 {
                PaymentStatus::PartiallyPaid
            } else {
                PaymentStatus::Unpaid
            };
            (total_tendered, 0, credit, status)
        };

        // 5. Enforce credit sale constraint: Credit sales MUST have a registered active customer
        if credit_amount > 0 && customer_opt.is_none() {
            return Err(AppError::Validation(
                "Credit sales require a registered active customer. Walk-in customers cannot make credit purchases.".to_string(),
            ));
        }

        let customer_id = customer_opt.as_ref().map(|c| c.id.clone());
        let customer_name_snapshot = customer_opt.as_ref().map(|c| c.name.clone());
        let customer_credit_limit = customer_opt.as_ref().map(|c| c.credit_limit).unwrap_or(0);

        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());
        let notes_cloned = dto.notes.clone();

        let terminal_repo = crate::repositories::SQLiteTerminalRepository::new(self.db.as_ref().unwrap().clone());
        let current_terminal = terminal_repo.get_or_create_current_terminal().await?;
        let terminal_id = current_terminal.id.clone();
        let terminal_code = current_terminal.code.clone();

        // Compute billing month in Asia/Karachi timezone (UTC+05:00, no DST).
        // The format is YYYYMM (e.g. "202509").
        let billing_month = {
            let karachi_offset = FixedOffset::east_opt(5 * 3600).expect("UTC+5 is valid");
            let now_karachi = Utc::now().with_timezone(&karachi_offset);
            now_karachi.format("%Y%m").to_string()
        };

        // 6. Execute Atomic SQLite Checkout Transaction
        let db = self.db.as_ref().expect("SQLite database connection required");
        let result = with_transaction(db, move |tx| {
            // A. Validate stock availability for all lines
            for line in &prepared_lines {
                let current_stock = SQLiteInventoryRepository::get_stock_in_tx(tx, &line.product_id, &branch_id)?;
                if current_stock < line.quantity {
                    return Err(DbError::ConstraintViolation(format!(
                        "Insufficient stock for product '{}': available {}, requested {}",
                        line.product_name, current_stock, line.quantity
                    )));
                }
            }

            // B. Generate unique invoice number (B07: terminal-scoped monthly)
            let invoice_number = SQLiteSaleRepository::next_invoice_number_in_tx(
                tx,
                &terminal_id,
                &branch_code,
                &terminal_code,
                &billing_month,
            )?;
            let sale_id = Uuid::new_v4().to_string();

            // C. Handle Customer Credit & Ledger Entry if credit_amount > 0
            let mut customer_balance_after = None;
            let mut final_customer_ledger_entry = None;
            if credit_amount > 0 {
                let cid = customer_id.as_ref().unwrap();
                let current_outstanding = SQLiteCustomerRepository::calculate_outstanding_balance_in_tx(tx, cid)?;

                // Enforce credit limit if configured (> 0)
                if customer_credit_limit > 0 {
                    let potential_outstanding = current_outstanding + credit_amount;
                    if potential_outstanding > customer_credit_limit {
                        return Err(DbError::ConstraintViolation(format!(
                            "Credit limit exceeded: current outstanding Rs {}, new credit Rs {}, credit limit Rs {}",
                            current_outstanding, credit_amount, customer_credit_limit
                        )));
                    }
                }

                let new_balance = current_outstanding + credit_amount;
                customer_balance_after = Some(new_balance);

                let ledger_entry = CustomerLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    customer_id: cid.clone(),
                    reference_id: Some(sale_id.clone()),
                    reference_number: Some(invoice_number.clone()),
                    entry_type: CustomerLedgerEntryType::Sale,
                    debit: credit_amount,
                    credit: 0,
                    balance_after: new_balance,
                    description: format!("Credit Sale Invoice {}", invoice_number),
                    performed_by: uid.clone(),
                    created_at: now.clone(),
                };

                SQLiteCustomerRepository::insert_ledger_entry_in_tx(tx, &ledger_entry)?;
                final_customer_ledger_entry = Some(ledger_entry);
            }

            // D. Deduct stock and create stock movements
            let mut final_stock_movements = Vec::with_capacity(prepared_lines.len());
            for line in &prepared_lines {
                let prev_stock = SQLiteInventoryRepository::get_stock_in_tx(tx, &line.product_id, &branch_id)?;
                let resulting_stock = prev_stock - line.quantity;

                SQLiteInventoryRepository::set_stock_in_tx(
                    tx,
                    &line.product_id,
                    &branch_id,
                    resulting_stock,
                    &now,
                )?;

                let movement = StockMovement {
                    id: Uuid::new_v4().to_string(),
                    product_id: line.product_id.clone(),
                    branch_id: branch_id.clone(),
                    movement_type: StockMovementType::Out,
                    quantity: line.quantity,
                    previous_stock: prev_stock,
                    resulting_stock,
                    reason: Some(format!("Sale {}", invoice_number)),
                    performed_by: uid.clone(),
                    reference_id: Some(sale_id.clone()),
                    created_at: now.clone(),
                };

                SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;
                final_stock_movements.push(movement);
            }

            // E. Insert Sale Header
            let sale = Sale {
                id: sale_id.clone(),
                invoice_number: invoice_number.clone(),
                branch_id: branch_id.clone(),
                customer_id: customer_id.clone(),
                customer_name_snapshot: customer_name_snapshot.clone(),
                subtotal,
                discount: invoice_discount,
                tax_amount: 0,
                total_amount,
                paid_amount: recorded_paid,
                change_amount,
                payment_status,
                sale_status: SaleStatus::Completed,
                performed_by: uid.clone(),
                notes: notes_cloned,
                created_at: now.clone(),
                updated_at: now.clone(),
            };

            SQLiteSaleRepository::insert_sale_in_tx(tx, &sale)?;

            // F. Insert Sale Lines
            let mut sale_lines = Vec::with_capacity(prepared_lines.len());
            for line in prepared_lines {
                let sale_line = SaleLine {
                    id: Uuid::new_v4().to_string(),
                    sale_id: sale_id.clone(),
                    product_id: line.product_id,
                    product_name_snapshot: line.product_name,
                    sku_snapshot: line.sku,
                    unit_price: line.unit_price,
                    cost_price_snapshot: line.cost_price,
                    quantity: line.quantity,
                    discount: line.discount,
                    line_total: line.line_total,
                    created_at: now.clone(),
                };

                SQLiteSaleRepository::insert_sale_line_in_tx(tx, &sale_line)?;
                sale_lines.push(sale_line);
            }

            // G. Insert Sale Payments (Clamped to total_amount)
            let mut sale_payments = Vec::new();
            let mut remaining_allocation = total_amount;

            for tender in tender_inputs {
                if remaining_allocation == 0 {
                    break;
                }
                let allocated = tender.amount.min(remaining_allocation);
                if allocated > 0 {
                    let payment = SalePayment {
                        id: Uuid::new_v4().to_string(),
                        sale_id: sale_id.clone(),
                        amount: allocated,
                        payment_method: tender.method,
                        reference_number: tender.reference_number,
                        notes: tender.notes,
                        created_at: now.clone(),
                    };

                    SQLiteSaleRepository::insert_sale_payment_in_tx(tx, &payment)?;
                    sale_payments.push(payment);
                    remaining_allocation -= allocated;
                }
            }

            // Record authoritative Cash Movement for the allocated CASH portion
            let allocated_cash: i64 = sale_payments
                .iter()
                .filter(|p| p.payment_method == "CASH")
                .map(|p| p.amount)
                .sum();

            let mut final_cash_movement = None;
            if allocated_cash > 0 {
                let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &branch_id)?;
                let cash_movement = CashMovement {
                    id: Uuid::new_v4().to_string(),
                    session_id: open_session_id,
                    branch_id: branch_id.clone(),
                    movement_type: CashMovementType::SalePayment,
                    direction: CashMovementDirection::In,
                    amount: allocated_cash,
                    reference_id: Some(sale_id.clone()),
                    reference_number: Some(invoice_number.clone()),
                    payment_method: "CASH".to_string(),
                    description: format!("Cash Sale {}", invoice_number),
                    performed_by: uid.clone(),
                    performed_by_name: None,
                    created_at: now.clone(),
                };
                SQLiteCashRepository::insert_movement_in_tx(tx, &cash_movement)?;
                final_cash_movement = Some(cash_movement);
            }

            let cogs: i64 = sale_lines.iter().map(|l| l.quantity * l.cost_price_snapshot).sum();
            let gross_profit = sale.total_amount - cogs;
            let gross_margin = crate::domain::profit::calculate_gross_margin(gross_profit, sale.total_amount);

            Ok(SaleResultDto {
                sale,
                lines: sale_lines,
                payments: sale_payments,
                credit_amount,
                customer_balance_after,
                cogs,
                gross_profit,
                gross_margin,
            })
        })
        .await?;

        Ok(result)
    }

    /// Fetches sale by ID
    pub async fn get_sale_by_id(&self, id: &str) -> AppResult<Option<Sale>> {
        self.sale_repo.get_sale_by_id(id).await
    }

    /// Fetches sale by invoice number
    pub async fn get_sale_by_invoice(&self, invoice_number: &str) -> AppResult<Option<Sale>> {
        self.sale_repo.get_sale_by_invoice(invoice_number).await
    }

    /// Lists sales with filters
    pub async fn list_sales(&self, filter: SaleFilterDto) -> AppResult<Vec<Sale>> {
        self.sale_repo.list_sales(&filter).await
    }

    /// Fetches sale lines
    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        self.sale_repo.get_sale_lines(sale_id).await
    }

    /// Fetches sale payments
    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        self.sale_repo.get_sale_payments(sale_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::customer::{CreateCustomerDto, RecordCustomerPaymentDto};
    use crate::domain::product::CreateProductDto;
    use crate::domain::sales::SaleItemDto;
    use crate::services::customer_service::CustomerService;
    use crate::services::inventory_service::InventoryService;
    use crate::services::product_service::ProductService;

    async fn setup_test_environment() -> (DatabaseConnection, SaleService, CustomerService, ProductService, InventoryService) {
        let db = DatabaseConnection::open_in_memory().expect("in-memory db");
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            guard.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut guard).expect("migrations");
            guard.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('99999999-9999-9999-9999-999999999999', 'Cashier User', 'cashier_user', 'hash', 'CASHIER', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![],
            ).unwrap();
        }

        let sale_service = SaleService::new(db.clone());
        let customer_service = CustomerService::new(db.clone());
        let product_service = ProductService::new(db.clone());
        let inventory_service = InventoryService::new(db.clone());

        (db, sale_service, customer_service, product_service, inventory_service)
    }

    async fn seed_test_catalog_and_stock(
        db: &DatabaseConnection,
        product_service: &ProductService,
    ) -> String {
        // Seed category and unit
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            guard.execute(
                "INSERT INTO categories (id, name, code, is_active, created_at, updated_at)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Accessories', 'ACC', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
                 VALUES ('22222222-2222-2222-2222-222222222222', 'Piece', 'pcs', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        // Create product: 20W Charger (purchase 500, sale 1000) with 20 initial stock
        let prod = product_service
            .create_product(
                CreateProductDto {
                    name: "20W Fast Charger".to_string(),
                    sku: "SKU-CHG-20W".to_string(),
                    barcode: Some("1234567890123".to_string()),
                    category_id: "11111111-1111-1111-1111-111111111111".to_string(),
                    brand_id: None,
                    unit_id: Some("22222222-2222-2222-2222-222222222222".to_string()),
                    company_id: None,
                    quality_id: None,
                    color_id: None,
                    purchase_price: 500,
                    average_cost: None,
                    sale_price: 1000,
                    low_stock_threshold: Some(5),
                    description: None,
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    initial_quantity: Some(20),
                },
                None,
            )
            .await
            .unwrap();

        prod.id
    }

    #[tokio::test]
    async fn test_walkin_cash_sale_full_flow() {
        let (db, sale_service, _, product_service, inventory_service) = setup_test_environment().await;
        let product_id = seed_test_catalog_and_stock(&db, &product_service).await;

        // Walk-in customer buys 2 chargers for Rs 2,000 cash
        let sale_res = sale_service
            .complete_sale(
                Some("99999999-9999-9999-9999-999999999999"),
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None, // Walk-in
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 2,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(2000),
                    payment_method: Some("CASH".to_string()),
                    payments: None,
                    notes: Some("Walk-in retail customer".to_string()),
                },
            )
            .await
            .expect("walk-in cash sale must succeed");

        // B07: new invoices use terminal-scoped monthly format BRANCH-TERMINAL-YYYYMM-NNNNNN
        // The billing month is dynamic (Asia/Karachi time), so we assert on structure.
        let inv = &sale_res.sale.invoice_number;
        let parts: Vec<&str> = inv.splitn(4, '-').collect();
        assert_eq!(parts.len(), 4, "B07 invoice must have 4 dash-separated parts: {inv}");
        assert_eq!(parts[0], "MAIN", "Branch code must be MAIN: {inv}");
        assert_eq!(parts[1], "T1", "Terminal code must be T1: {inv}");
        assert_eq!(parts[2].len(), 6, "Billing month must be 6 digits (YYYYMM): {inv}");
        assert!(parts[2].parse::<u32>().is_ok(), "Billing month must be numeric: {inv}");
        assert_eq!(parts[3], "000001", "First invoice sequence must be 000001: {inv}");
        assert_eq!(sale_res.sale.customer_id, None);
        assert_eq!(sale_res.sale.customer_name_snapshot, None);
        assert_eq!(sale_res.sale.total_amount, 2000);
        assert_eq!(sale_res.sale.paid_amount, 2000);
        assert_eq!(sale_res.sale.payment_status, PaymentStatus::Paid);
        assert_eq!(sale_res.credit_amount, 0);

        // Verify stock deducted from 20 to 18
        let stock = inventory_service
            .get_stock(&product_id, DEFAULT_MAIN_BRANCH_ID)
            .await
            .unwrap();
        assert_eq!(stock, 18);

        // Verify no customer ledger entries exist
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let ledger_count: i64 = guard
                .query_row("SELECT count(*) FROM customer_ledger_entries", [], |r| r.get(0))
                .unwrap();
            assert_eq!(ledger_count, 0, "Walk-in cash sale must produce zero customer ledger entries");
        }
    }

    #[tokio::test]
    async fn test_registered_customer_cash_sale() {
        let (db, sale_service, customer_service, product_service, inventory_service) = setup_test_environment().await;
        let product_id = seed_test_catalog_and_stock(&db, &product_service).await;

        let customer = customer_service
            .create_customer(CreateCustomerDto {
                name: "Zahid Qureshi".to_string(),
                phone: "03009988776".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(10000),
            })
            .await
            .unwrap();

        // Customer buys 1 charger (Rs 1,000) fully paid in cash
        let sale_res = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 1,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(1000),
                    payment_method: Some("CASH".to_string()),
                    payments: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(sale_res.sale.customer_id, Some(customer.id.clone()));
        assert_eq!(sale_res.sale.customer_name_snapshot, Some("Zahid Qureshi".to_string()));
        assert_eq!(sale_res.sale.payment_status, PaymentStatus::Paid);
        assert_eq!(sale_res.credit_amount, 0);

        // Stock decreased 20 -> 19
        let stock = inventory_service
            .get_stock(&product_id, DEFAULT_MAIN_BRANCH_ID)
            .await
            .unwrap();
        assert_eq!(stock, 19);

        // Outstanding balance remains 0 and no receivable ledger entry
        let balance = customer_service.get_balance(&customer.id).await.unwrap();
        assert_eq!(balance, 0);
    }

    #[tokio::test]
    async fn test_credit_sale_and_credit_limit_enforcement() {
        let (db, sale_service, customer_service, product_service, inventory_service) = setup_test_environment().await;
        let product_id = seed_test_catalog_and_stock(&db, &product_service).await;

        // Customer with credit limit of Rs 10,000
        let customer = customer_service
            .create_customer(CreateCustomerDto {
                name: "Tariq Mehmood".to_string(),
                phone: "03331122334".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(10000),
            })
            .await
            .unwrap();

        // 1. Credit sale: 10 chargers = 10,000. Paid 4,000, Credit 6,000
        let sale_res = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 10,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(4000),
                    payment_method: Some("CASH".to_string()),
                    payments: None,
                    notes: Some("Partial payment on credit".to_string()),
                },
            )
            .await
            .expect("credit sale within limit must succeed");

        assert_eq!(sale_res.sale.total_amount, 10000);
        assert_eq!(sale_res.sale.paid_amount, 4000);
        assert_eq!(sale_res.credit_amount, 6000);
        assert_eq!(sale_res.sale.payment_status, PaymentStatus::PartiallyPaid);
        assert_eq!(sale_res.customer_balance_after, Some(6000));

        // Stock decreased from 20 to 10
        let stock = inventory_service
            .get_stock(&product_id, DEFAULT_MAIN_BRANCH_ID)
            .await
            .unwrap();
        assert_eq!(stock, 10);

        // Customer outstanding is now 6,000
        let bal1 = customer_service.get_balance(&customer.id).await.unwrap();
        assert_eq!(bal1, 6000);

        // 2. Second credit sale exceeding limit:
        // Current balance: 6,000. Customer buys 5 chargers = 5,000 with 0 payment (credit: 5,000)
        // Potential balance: 6,000 + 5,000 = 11,000 > 10,000 limit -> REJECT!
        let exceed_err = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 5,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    payments: None,
                    notes: None,
                },
            )
            .await;

        assert!(exceed_err.is_err(), "Sale exceeding credit limit must be rejected");

        // Verify complete rollback: stock is STILL 10, balance is STILL 6,000
        let stock_after_rollback = inventory_service
            .get_stock(&product_id, DEFAULT_MAIN_BRANCH_ID)
            .await
            .unwrap();
        assert_eq!(stock_after_rollback, 10);

        let bal_after_rollback = customer_service.get_balance(&customer.id).await.unwrap();
        assert_eq!(bal_after_rollback, 6000);

        // 3. Reject credit sale for walk-in customer
        let walkin_credit_err = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 1,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(500), // 500 paid for 1,000 item -> 500 credit
                    payment_method: None,
                    payments: None,
                    notes: None,
                },
            )
            .await;
        assert!(walkin_credit_err.is_err(), "Credit sale for walk-in customer must be rejected");

        // 4. Reject sale with insufficient stock
        let stock_err = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 50, // Only 10 in stock
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(50000),
                    payment_method: Some("CASH".to_string()),
                    payments: None,
                    notes: None,
                },
            )
            .await;
        assert!(stock_err.is_err(), "Sale with insufficient stock must be rejected");
    }

    #[tokio::test]
    async fn test_customer_payment_allocation_across_multiple_sales() {
        let (db, sale_service, customer_service, product_service, _) = setup_test_environment().await;
        let product_id = seed_test_catalog_and_stock(&db, &product_service).await;

        let customer = customer_service
            .create_customer(CreateCustomerDto {
                name: "Farhan Ali".to_string(),
                phone: "03112233445".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(50000),
            })
            .await
            .unwrap();

        // Create Sale 1: INV-000001 for Rs 5,000 (0 paid, 5,000 credit)
        let s1 = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 5,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    payments: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Create Sale 2: INV-000002 for Rs 3,000 (0 paid, 3,000 credit)
        let s2 = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: product_id.clone(),
                        quantity: 3,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    payments: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Customer total outstanding: 5,000 + 3,000 = 8,000
        let total_bal = customer_service.get_balance(&customer.id).await.unwrap();
        assert_eq!(total_bal, 8000);

        // Customer pays Rs 6,000
        // Expected FIFO allocation (Section 13 & 18):
        // INV-000001 receives 5,000 -> fully PAID
        // INV-000002 receives 1,000 -> PARTIALLY_PAID (remaining 2,000)
        let pay_res = customer_service
            .record_customer_payment(
                None,
                RecordCustomerPaymentDto {
                    customer_id: customer.id.clone(),
                    amount: 6000,
                    payment_method: "CASH".to_string(),
                    reference_number: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(pay_res.amount_paid, 6000);
        assert_eq!(pay_res.new_balance, 2000);
        assert_eq!(pay_res.allocated_sales.len(), 2);

        assert_eq!(pay_res.allocated_sales[0].sale_id, s1.sale.id);
        assert_eq!(pay_res.allocated_sales[0].amount_allocated, 5000);
        assert_eq!(pay_res.allocated_sales[0].payment_status, "PAID");

        assert_eq!(pay_res.allocated_sales[1].sale_id, s2.sale.id);
        assert_eq!(pay_res.allocated_sales[1].amount_allocated, 1000);
        assert_eq!(pay_res.allocated_sales[1].payment_status, "PARTIALLY_PAID");

        // Verify sales in DB
        let s1_updated = sale_service.get_sale_by_id(&s1.sale.id).await.unwrap().unwrap();
        assert_eq!(s1_updated.paid_amount, 5000);
        assert_eq!(s1_updated.payment_status, PaymentStatus::Paid);

        let s2_updated = sale_service.get_sale_by_id(&s2.sale.id).await.unwrap().unwrap();
        assert_eq!(s2_updated.paid_amount, 1000);
        assert_eq!(s2_updated.payment_status, PaymentStatus::PartiallyPaid);

        // Verify remaining customer balance is exactly 2,000
        let final_bal = customer_service.get_balance(&customer.id).await.unwrap();
        assert_eq!(final_bal, 2000);
    }

    #[tokio::test]
    async fn test_target_3_multi_payment_contract_and_accounting() {
        let (db, sale_service, customer_service, product_service, _) = setup_test_environment().await;
        let product_id = seed_test_catalog_and_stock(&db, &product_service).await;

        let customer = customer_service
            .create_customer(CreateCustomerDto {
                name: "Customer Target3".to_string(),
                phone: "03000003333".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(500000),
            })
            .await
            .unwrap();

        // 1. Single cash (Total 1000, CASH 1000)
        let s1 = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    payments: Some(vec![
                        crate::domain::sales::SalePaymentInputDto { method: "cash".to_string(), amount: 1000, reference_number: None, notes: None }
                    ]),
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s1.payments.len(), 1);
        assert_eq!(s1.payments[0].payment_method, "CASH");
        assert_eq!(s1.payments[0].amount, 1000);
        assert_eq!(s1.sale.paid_amount, 1000);
        assert_eq!(s1.sale.change_amount, 0);
        assert_eq!(s1.credit_amount, 0);

        // Verify CashMovement for s1 is 1000
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let cash_mv_amt: i64 = guard
                .query_row("SELECT amount FROM cash_movements WHERE reference_id = ?1", rusqlite::params![s1.sale.id], |r| r.get(0))
                .unwrap();
            assert_eq!(cash_mv_amt, 1000);
        }

        // 2. Single card (Total 1000, CARD 1000)
        let s2 = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    payments: Some(vec![
                        crate::domain::sales::SalePaymentInputDto { method: "card".to_string(), amount: 1000, reference_number: Some("REF123".to_string()), notes: None }
                    ]),
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s2.payments.len(), 1);
        assert_eq!(s2.payments[0].payment_method, "CARD");
        assert_eq!(s2.payments[0].amount, 1000);
        assert_eq!(s2.payments[0].reference_number, Some("REF123".to_string()));

        // Verify NO cash movement for card
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let count: i64 = guard
                .query_row("SELECT count(*) FROM cash_movements WHERE reference_id = ?1", rusqlite::params![s2.sale.id], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 0);
        }

        // 3. Normalization tests (Bank, EasyPaisa, JazzCash)
        let s_norm = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 3, discount: None }], // 3000 total
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    payments: Some(vec![
                        crate::domain::sales::SalePaymentInputDto { method: "bank".to_string(), amount: 1000, reference_number: None, notes: None },
                        crate::domain::sales::SalePaymentInputDto { method: "easypaisa".to_string(), amount: 1000, reference_number: None, notes: None },
                        crate::domain::sales::SalePaymentInputDto { method: "jazzcash".to_string(), amount: 1000, reference_number: None, notes: None },
                    ]),
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s_norm.payments.len(), 3);
        assert_eq!(s_norm.payments[0].payment_method, "BANK_TRANSFER");
        assert_eq!(s_norm.payments[1].payment_method, "EASYPAISA");
        assert_eq!(s_norm.payments[2].payment_method, "JAZZCASH");

        // 4. Cash + Credit (Total 2000: CASH 800, CREDIT 1200)
        let s_cash_credit = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 2, discount: None }], // 2000 total
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    payments: Some(vec![
                        crate::domain::sales::SalePaymentInputDto { method: "cash".to_string(), amount: 800, reference_number: None, notes: None }
                    ]),
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s_cash_credit.payments.len(), 1);
        assert_eq!(s_cash_credit.payments[0].payment_method, "CASH");
        assert_eq!(s_cash_credit.payments[0].amount, 800);
        assert_eq!(s_cash_credit.sale.paid_amount, 800);
        assert_eq!(s_cash_credit.credit_amount, 1200);
        assert_eq!(s_cash_credit.sale.payment_status, PaymentStatus::PartiallyPaid);

        // Customer ledger must record debit = 1200
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let debit: i64 = guard
                .query_row("SELECT debit FROM customer_ledger_entries WHERE reference_id = ?1", rusqlite::params![s_cash_credit.sale.id], |r| r.get(0))
                .unwrap();
            assert_eq!(debit, 1200);
        }

        // 5. Cash + Bank (Total 2000: CASH 800, BANK 1200)
        let s_cash_bank = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 2, discount: None }], // 2000 total
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    payments: Some(vec![
                        crate::domain::sales::SalePaymentInputDto { method: "cash".to_string(), amount: 800, reference_number: None, notes: None },
                        crate::domain::sales::SalePaymentInputDto { method: "bank".to_string(), amount: 1200, reference_number: None, notes: None },
                    ]),
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s_cash_bank.payments.len(), 2);
        assert_eq!(s_cash_bank.payments[0].payment_method, "CASH");
        assert_eq!(s_cash_bank.payments[0].amount, 800);
        assert_eq!(s_cash_bank.payments[1].payment_method, "BANK_TRANSFER");
        assert_eq!(s_cash_bank.payments[1].amount, 1200);

        // CashMovement must equal CASH portion = 800
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let cash_mv_amt: i64 = guard
                .query_row("SELECT amount FROM cash_movements WHERE reference_id = ?1", rusqlite::params![s_cash_bank.sale.id], |r| r.get(0))
                .unwrap();
            assert_eq!(cash_mv_amt, 800);
        }

        // 6. Overpayment/Change (Total 1000, Tenders CASH 1500 -> SalePayment CASH 1000, Change 500, CashMovement 1000)
        let s_overpay = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 1, discount: None }], // 1000 total
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    payments: Some(vec![
                        crate::domain::sales::SalePaymentInputDto { method: "cash".to_string(), amount: 1500, reference_number: None, notes: None }
                    ]),
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s_overpay.payments.len(), 1);
        assert_eq!(s_overpay.payments[0].payment_method, "CASH");
        assert_eq!(s_overpay.payments[0].amount, 1000); // Clamped to total_amount!
        assert_eq!(s_overpay.sale.paid_amount, 1000);
        assert_eq!(s_overpay.sale.change_amount, 500);

        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let cash_mv_amt: i64 = guard
                .query_row("SELECT amount FROM cash_movements WHERE reference_id = ?1", rusqlite::params![s_overpay.sale.id], |r| r.get(0))
                .unwrap();
            assert_eq!(cash_mv_amt, 1000); // Capped at sale allocation 1000!
        }

        // 7. Payment UUID uniqueness
        assert!(!s_overpay.payments[0].id.is_empty());

        // 8. Legacy flat DTO fallback & Empty payments fallback
        let s_legacy = sale_service
            .complete_sale(
                None,
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: product_id.clone(), quantity: 1, discount: None }], // 1000 total
                    discount: None,
                    paid_amount: Some(1000),
                    payment_method: Some("card".to_string()),
                    payments: None,
                    notes: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(s_legacy.payments.len(), 1);
        assert_eq!(s_legacy.payments[0].payment_method, "CARD");
        assert_eq!(s_legacy.payments[0].amount, 1000);
    }
}
