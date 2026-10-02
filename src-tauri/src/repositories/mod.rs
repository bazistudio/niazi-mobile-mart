pub mod branch_repository;
pub mod customer_repository;
pub mod party_repository;
pub mod sqlite_user_repo;
pub mod supplier_repository;
pub mod sync_queue_repository;
pub mod terminal_repository;
pub mod user_repository;

pub mod postgres_branch_repo;
pub mod postgres_cash_repo;
pub mod postgres_catalog_repo;
pub mod postgres_customer_repo;
pub mod postgres_expense_repo;
pub mod postgres_inventory_repo;
pub mod postgres_party_repo;
pub mod postgres_product_repo;
pub mod postgres_profit_repo;
pub mod postgres_purchase_repo;
pub mod postgres_purchase_return_repo;
pub mod postgres_sale_repo;
pub mod postgres_sales_return_repo;
pub mod postgres_supplier_repo;
pub mod postgres_user_repo;

pub mod postgres_change_log_repo;
pub mod sqlite_sync_cursor_repo;

pub use postgres_change_log_repo::PostgresChangeLogRepository;
pub use sqlite_sync_cursor_repo::SQLiteSyncCursorRepository;
pub use sync_queue_repository::{PostgresSyncAuditRepository, SQLiteSyncQueueRepository};
pub use terminal_repository::{
    PostgresTerminalRepository, SQLiteTerminalRepository, TerminalRepository,
};

pub use branch_repository::{
    BranchRepository as SQLiteBranchRepository, OrganizationDashboardStats,
};
pub use customer_repository::SQLiteCustomerRepository;
pub use party_repository::SQLitePartyRepository;
pub use sqlite_user_repo::SQLiteUserRepository;
pub use supplier_repository::SQLiteSupplierRepository;
pub use user_repository::InMemoryUserRepository;

pub use postgres_branch_repo::PostgresBranchRepository;
pub use postgres_cash_repo::PostgresCashRepository;
pub use postgres_catalog_repo::PostgresCatalogRepository;
pub use postgres_customer_repo::PostgresCustomerRepository;
pub use postgres_expense_repo::PostgresExpenseRepository;
pub use postgres_inventory_repo::PostgresInventoryRepository;
pub use postgres_party_repo::PostgresPartyRepository;
pub use postgres_product_repo::PostgresProductRepository;
pub use postgres_profit_repo::PostgresProfitRepository;
pub use postgres_purchase_repo::PostgresPurchaseRepository;
pub use postgres_purchase_return_repo::PostgresPurchaseReturnRepository;
pub use postgres_sale_repo::PostgresSaleRepository;
pub use postgres_sales_return_repo::PostgresSalesReturnRepository;
pub use postgres_supplier_repo::PostgresSupplierRepository;
pub use postgres_user_repo::PostgresUserRepository;

use crate::domain::cash::{CloseCashSessionDto, CreateCashAdjustmentDto, OpenCashSessionDto};
use crate::domain::catalog::{
    Brand, Category, Color, Company, CreateBrandDto, CreateCategoryDto, CreateColorDto,
    CreateCompanyDto, CreateQualityDto, CreateUnitDto, Quality, Unit, UpdateBrandDto,
    UpdateCategoryDto, UpdateColorDto, UpdateCompanyDto, UpdateQualityDto, UpdateUnitDto,
};
use crate::domain::customer::{
    Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry, CustomerStatementDto,
    CustomerSummaryDto, UpdateCustomerDto,
};
use crate::domain::expense::{
    CreateExpenseCategoryDto, CreateExpenseDto, Expense, ExpenseCategory, ExpenseFilterDto,
};
use crate::domain::inventory::{
    AdjustStockDto, DecreaseStockDto, IncreaseStockDto, LowStockItemDto, StockMovement,
    TransferStockDto,
};
use crate::domain::organization::Branch;
use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::domain::profit::DashboardProfitSummaryDto;
use crate::domain::purchase_return::{CreatePurchaseReturnDto, PurchaseReturnDetailDto};
use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchaseResultDto,
};
use crate::domain::sales::{
    CompleteSaleDto, Sale, SaleFilterDto, SaleLine, SalePayment, SaleResultDto,
};
use crate::domain::sales_return::{CreateSalesReturnDto, SalesReturnDetailDto};
use crate::domain::supplier::{
    Supplier, SupplierDetailDto, SupplierFilter, SupplierLedgerEntry, SupplierSummaryDto,
    UpdateSupplierDto,
};
use crate::domain::user::User;
use crate::errors::AppResult;

// ── Unified Repository Enums satisfying the dual persistence boundary ────────

#[derive(Clone)]
pub enum UserRepository {
    SQLite(SQLiteUserRepository),
    Postgres(PostgresUserRepository),
}

impl UserRepository {
    pub async fn has_any_users(&self) -> AppResult<bool> {
        match self {
            Self::SQLite(r) => r.has_any_users().await,
            Self::Postgres(r) => r.has_any_users().await,
        }
    }

    pub async fn count_active_admins(&self) -> AppResult<i64> {
        match self {
            Self::SQLite(r) => r.count_active_admins().await,
            Self::Postgres(r) => r.count_active_admins().await,
        }
    }

    pub async fn is_organization_initialized(&self) -> AppResult<bool> {
        match self {
            Self::SQLite(r) => r.is_organization_initialized().await,
            Self::Postgres(r) => r.is_organization_initialized().await,
        }
    }

    pub async fn mark_organization_initialized(&self) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.mark_organization_initialized().await,
            Self::Postgres(r) => r.mark_organization_initialized().await,
        }
    }

    pub async fn bootstrap_first_admin(&self, admin_user: User) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.bootstrap_first_admin(admin_user).await,
            Self::Postgres(r) => r.bootstrap_first_admin(admin_user).await,
        }
    }

    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<User>> {
        match self {
            Self::SQLite(r) => r.find_by_id(id).await,
            Self::Postgres(r) => r.find_by_id(id).await,
        }
    }

    pub async fn find_by_username(&self, username: &str) -> AppResult<Option<User>> {
        match self {
            Self::SQLite(r) => r.find_by_username(username).await,
            Self::Postgres(r) => r.find_by_username(username).await,
        }
    }

    pub async fn save(&self, user: User) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.save(user).await,
            Self::Postgres(r) => r.save(user).await,
        }
    }

    pub async fn consume_recovery_key_and_reset_password(
        &self,
        user_id: &str,
        new_login_key_hash: &str,
    ) -> AppResult<()> {
        match self {
            Self::SQLite(r) => {
                r.consume_recovery_key_and_reset_password(user_id, new_login_key_hash)
                    .await
            }
            Self::Postgres(r) => {
                r.consume_recovery_key_and_reset_password(user_id, new_login_key_hash)
                    .await
            }
        }
    }

    pub async fn list_all(&self) -> AppResult<Vec<User>> {
        match self {
            Self::SQLite(r) => r.list_all().await,
            Self::Postgres(r) => r.list_all().await,
        }
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.delete(id).await,
            Self::Postgres(r) => r.delete(id).await,
        }
    }
}

#[derive(Clone)]
pub enum BranchRepository {
    SQLite(SQLiteBranchRepository),
    Postgres(PostgresBranchRepository),
}

impl BranchRepository {
    pub async fn list_branches(&self) -> AppResult<Vec<Branch>> {
        match self {
            Self::SQLite(r) => r.list_branches().await,
            Self::Postgres(r) => r.list_branches().await,
        }
    }

    pub async fn get_branch_by_id(&self, id: &str) -> AppResult<Option<Branch>> {
        match self {
            Self::SQLite(r) => r.get_branch_by_id(id).await,
            Self::Postgres(r) => r.get_branch_by_id(id).await,
        }
    }

    pub async fn get_main_branch(&self) -> AppResult<Option<Branch>> {
        match self {
            Self::SQLite(r) => r.get_main_branch().await,
            Self::Postgres(r) => r.get_main_branch().await,
        }
    }

    pub async fn get_dashboard_stats(&self) -> AppResult<OrganizationDashboardStats> {
        match self {
            Self::SQLite(r) => r.get_dashboard_stats().await,
            Self::Postgres(r) => r.get_dashboard_stats().await,
        }
    }

    pub async fn get_dashboard_balances(
        &self,
    ) -> AppResult<crate::domain::organization::DashboardBalancesDto> {
        match self {
            Self::SQLite(r) => r.get_dashboard_balances().await,
            Self::Postgres(r) => r.get_dashboard_balances().await,
        }
    }
}

// ── Postgres-only business repository structs ────────────────────────────────

#[derive(Clone)]
pub struct CatalogRepository(PostgresCatalogRepository);

impl CatalogRepository {
    pub fn new(repo: PostgresCatalogRepository) -> Self {
        Self(repo)
    }

    pub async fn create_category(&self, id: &str, dto: &CreateCategoryDto) -> AppResult<Category> {
        self.0.create_category(id, dto).await
    }

    pub async fn get_category_by_id(&self, id: &str) -> AppResult<Category> {
        self.0.get_category_by_id(id).await
    }

    pub async fn list_categories(&self) -> AppResult<Vec<Category>> {
        self.0.list_categories().await
    }

    pub async fn update_category(&self, id: &str, dto: &UpdateCategoryDto) -> AppResult<Category> {
        self.0.update_category(id, dto).await
    }

    pub async fn create_brand(&self, id: &str, dto: &CreateBrandDto) -> AppResult<Brand> {
        self.0.create_brand(id, dto).await
    }

    pub async fn get_brand_by_id(&self, id: &str) -> AppResult<Brand> {
        self.0.get_brand_by_id(id).await
    }

    pub async fn list_brands(&self) -> AppResult<Vec<Brand>> {
        self.0.list_brands().await
    }

    pub async fn update_brand(&self, id: &str, dto: &UpdateBrandDto) -> AppResult<Brand> {
        self.0.update_brand(id, dto).await
    }

    pub async fn create_unit(&self, id: &str, dto: &CreateUnitDto) -> AppResult<Unit> {
        self.0.create_unit(id, dto).await
    }

    pub async fn get_unit_by_id(&self, id: &str) -> AppResult<Unit> {
        self.0.get_unit_by_id(id).await
    }

    pub async fn list_units(&self) -> AppResult<Vec<Unit>> {
        self.0.list_units().await
    }

    pub async fn update_unit(&self, id: &str, dto: &UpdateUnitDto) -> AppResult<Unit> {
        self.0.update_unit(id, dto).await
    }

    pub async fn create_company(&self, id: &str, dto: &CreateCompanyDto) -> AppResult<Company> {
        self.0.create_company(id, dto).await
    }

    pub async fn get_company_by_id(&self, id: &str) -> AppResult<Company> {
        self.0.get_company_by_id(id).await
    }

    pub async fn list_companies(&self) -> AppResult<Vec<Company>> {
        self.0.list_companies().await
    }

    pub async fn update_company(&self, id: &str, dto: &UpdateCompanyDto) -> AppResult<Company> {
        self.0.update_company(id, dto).await
    }

    pub async fn create_quality(&self, id: &str, dto: &CreateQualityDto) -> AppResult<Quality> {
        self.0.create_quality(id, dto).await
    }

    pub async fn get_quality_by_id(&self, id: &str) -> AppResult<Quality> {
        self.0.get_quality_by_id(id).await
    }

    pub async fn list_qualities(&self) -> AppResult<Vec<Quality>> {
        self.0.list_qualities().await
    }

    pub async fn update_quality(&self, id: &str, dto: &UpdateQualityDto) -> AppResult<Quality> {
        self.0.update_quality(id, dto).await
    }

    pub async fn create_color(&self, id: &str, dto: &CreateColorDto) -> AppResult<Color> {
        self.0.create_color(id, dto).await
    }

    pub async fn get_color_by_id(&self, id: &str) -> AppResult<Color> {
        self.0.get_color_by_id(id).await
    }

    pub async fn list_colors(&self) -> AppResult<Vec<Color>> {
        self.0.list_colors().await
    }

    pub async fn update_color(&self, id: &str, dto: &UpdateColorDto) -> AppResult<Color> {
        self.0.update_color(id, dto).await
    }
}

#[derive(Clone)]
pub struct ProductRepository(PostgresProductRepository);

impl ProductRepository {
    pub fn new(repo: PostgresProductRepository) -> Self {
        Self(repo)
    }

    pub async fn create_product(&self, id: &str, dto: &CreateProductDto) -> AppResult<Product> {
        self.0.create_product(id, dto).await
    }

    pub async fn create_product_with_initial_stock(
        &self,
        id: &str,
        dto: &CreateProductDto,
        user_id: Option<&str>,
    ) -> AppResult<Product> {
        self.0.create_product_with_initial_stock(id, dto, user_id).await
    }

    pub async fn get_product_by_id(&self, id: &str) -> AppResult<Product> {
        self.0.get_product_by_id(id).await
    }

    pub async fn get_product_by_sku(&self, sku: &str) -> AppResult<Product> {
        self.0.get_product_by_sku(sku).await
    }

    pub async fn get_product_by_barcode(&self, barcode: &str) -> AppResult<Product> {
        self.0.get_product_by_barcode(barcode).await
    }

    pub async fn list_products(&self, filter: &ProductFilter) -> AppResult<Vec<Product>> {
        self.0.list_products(filter).await
    }

    pub async fn update_product(&self, id: &str, dto: &UpdateProductDto) -> AppResult<Product> {
        self.0.update_product(id, dto).await
    }

    pub async fn deactivate_product(&self, id: &str) -> AppResult<()> {
        self.0.deactivate_product(id).await
    }
}

#[derive(Clone)]
pub struct InventoryRepository(PostgresInventoryRepository);

impl InventoryRepository {
    pub fn new(repo: PostgresInventoryRepository) -> Self {
        Self(repo)
    }

    pub async fn get_stock(&self, product_id: &str, branch_id: &str) -> AppResult<i64> {
        self.0.get_stock(product_id, branch_id).await
    }

    pub async fn get_stock_map(
        &self,
        branch_id: &str,
    ) -> AppResult<std::collections::HashMap<String, i64>> {
        self.0.get_stock_map(branch_id).await
    }

    pub async fn increase_stock(
        &self,
        dto: &IncreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        self.0.increase_stock(dto, user_id).await
    }

    pub async fn decrease_stock(
        &self,
        dto: &DecreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        self.0.decrease_stock(dto, user_id).await
    }

    pub async fn adjust_stock(
        &self,
        dto: &AdjustStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        self.0.adjust_stock(dto, user_id).await
    }

    pub async fn transfer_stock(
        &self,
        dto: &TransferStockDto,
        user_id: Option<&str>,
    ) -> AppResult<()> {
        self.0.transfer_stock(dto, user_id).await
    }

    pub async fn list_movements(
        &self,
        product_id: Option<&str>,
        branch_id: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<StockMovement>> {
        self.0.list_movements(product_id, branch_id, limit).await
    }

    pub async fn list_low_stock(&self, branch_id: &str) -> AppResult<Vec<LowStockItemDto>> {
        self.0.list_low_stock(branch_id).await
    }
}

#[derive(Clone)]
pub struct CustomerRepository(PostgresCustomerRepository);

impl CustomerRepository {
    pub fn new(repo: PostgresCustomerRepository) -> Self {
        Self(repo)
    }

    pub async fn create_customer(&self, customer: &Customer) -> AppResult<Customer> {
        self.0.create_customer(customer).await
    }

    pub async fn update_customer(&self, id: &str, dto: &UpdateCustomerDto) -> AppResult<Customer> {
        self.0.update_customer(id, dto).await
    }

    pub async fn get_customer_by_id(&self, id: &str) -> AppResult<Option<Customer>> {
        self.0.get_customer_by_id(id).await
    }

    pub async fn get_customer_by_phone(&self, phone: &str) -> AppResult<Option<Customer>> {
        self.0.get_customer_by_phone(phone).await
    }

    pub async fn get_customer_detail(&self, id: &str) -> AppResult<CustomerDetailDto> {
        self.0.get_customer_detail(id).await
    }

    pub async fn list_customers(
        &self,
        filter: &CustomerFilter,
    ) -> AppResult<Vec<CustomerSummaryDto>> {
        self.0.list_customers(filter).await
    }

    pub async fn search_customers(&self, query: &str) -> AppResult<Vec<CustomerSummaryDto>> {
        self.0.search_customers(query).await
    }

    pub async fn get_outstanding_balance(&self, customer_id: &str) -> AppResult<i64> {
        self.0.calculate_outstanding_balance(customer_id).await
    }

    pub async fn get_ledger(
        &self,
        customer_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CustomerLedgerEntry>> {
        self.0.get_ledger(customer_id, limit, offset).await
    }

    pub async fn get_statement(&self, customer_id: &str) -> AppResult<CustomerStatementDto> {
        self.0.get_statement(customer_id).await
    }

    pub async fn deactivate_customer(&self, id: &str) -> AppResult<()> {
        self.0.deactivate_customer(id).await
    }
}

#[derive(Clone)]
pub struct SupplierRepository(PostgresSupplierRepository);

impl SupplierRepository {
    pub fn new(repo: PostgresSupplierRepository) -> Self {
        Self(repo)
    }

    pub async fn create_supplier(&self, supplier: &Supplier) -> AppResult<Supplier> {
        self.0.create_supplier(supplier).await
    }

    pub async fn update(&self, id: &str, dto: &UpdateSupplierDto) -> AppResult<Supplier> {
        self.0.update_supplier(id, dto).await
    }

    pub async fn get_supplier_by_id(&self, id: &str) -> AppResult<Option<Supplier>> {
        self.0.get_supplier_by_id(id).await
    }

    pub async fn get_detail(&self, id: &str) -> AppResult<SupplierDetailDto> {
        self.0.get_supplier_detail(id).await
    }

    pub async fn list(&self, filter: Option<SupplierFilter>) -> AppResult<Vec<SupplierSummaryDto>> {
        self.0.list_suppliers(&filter.unwrap_or_default()).await
    }

    pub async fn search(&self, query: &str) -> AppResult<Vec<SupplierSummaryDto>> {
        self.0.search_suppliers(query).await
    }

    pub async fn get_outstanding_balance(&self, supplier_id: &str) -> AppResult<i64> {
        self.0.calculate_outstanding_balance(supplier_id).await
    }

    pub async fn get_ledger(
        &self,
        supplier_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<SupplierLedgerEntry>> {
        self.0.get_ledger(supplier_id, limit, offset).await
    }

    pub async fn get_statement(
        &self,
        _supplier_id: &str,
    ) -> AppResult<crate::domain::supplier::SupplierStatementDto> {
        Err(crate::errors::AppError::Internal(
            "Postgres supplier statement not implemented".into(),
        ))
    }

    pub async fn deactivate(&self, id: &str) -> AppResult<()> {
        self.0.deactivate_supplier(id).await
    }
}

#[derive(Clone)]
pub struct SaleRepository(PostgresSaleRepository);

impl SaleRepository {
    pub fn new(repo: PostgresSaleRepository) -> Self {
        Self(repo)
    }

    pub async fn complete_sale(
        &self,
        dto: &CompleteSaleDto,
        user_id: Option<&str>,
    ) -> AppResult<SaleResultDto> {
        self.0.complete_sale(dto, user_id).await
    }

    pub async fn get_sale_by_id(&self, id: &str) -> AppResult<Option<Sale>> {
        self.0.get_sale_by_id(id).await
    }

    pub async fn get_sale_by_invoice(&self, invoice_number: &str) -> AppResult<Option<Sale>> {
        self.0.get_sale_by_invoice(invoice_number).await
    }

    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        self.0.get_sale_lines(sale_id).await
    }

    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        self.0.get_sale_payments(sale_id).await
    }

    pub async fn list_sales(&self, filter: &SaleFilterDto) -> AppResult<Vec<Sale>> {
        self.0.list_sales(&Some(filter.clone())).await
    }
}

#[derive(Clone)]
pub struct PurchaseRepository(PostgresPurchaseRepository);

impl PurchaseRepository {
    pub fn new(repo: PostgresPurchaseRepository) -> Self {
        Self(repo)
    }

    pub async fn complete_purchase(
        &self,
        dto: &CompletePurchaseDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseResultDto> {
        self.0.complete_purchase(dto, user_id).await
    }

    pub async fn get_by_id(&self, id: &str) -> AppResult<Option<Purchase>> {
        self.0.get_purchase_by_id(id).await
    }

    pub async fn get_by_number(&self, number: &str) -> AppResult<Option<Purchase>> {
        self.0.get_purchase_by_number(number).await
    }

    pub async fn get_lines(&self, purchase_id: &str) -> AppResult<Vec<PurchaseLine>> {
        self.0.get_purchase_lines(purchase_id).await
    }

    pub async fn list(&self, filter: Option<PurchaseFilterDto>) -> AppResult<Vec<Purchase>> {
        self.0.list_purchases(&filter).await
    }
}

#[derive(Clone)]
pub struct CashRepository(PostgresCashRepository);

impl CashRepository {
    pub fn new(repo: PostgresCashRepository) -> Self {
        Self(repo)
    }

    pub async fn open_session(
        &self,
        dto: &OpenCashSessionDto,
        user_id: Option<&str>,
    ) -> AppResult<crate::domain::cash::CashSession> {
        self.0.open_session(dto, user_id).await
    }

    pub async fn close_session(
        &self,
        dto: &CloseCashSessionDto,
        user_id: Option<&str>,
    ) -> AppResult<crate::domain::cash::CashSession> {
        self.0.close_session(dto, user_id).await
    }

    pub async fn get_open_session(
        &self,
        branch_id: &str,
    ) -> AppResult<Option<crate::domain::cash::CashSession>> {
        self.0.get_open_session(branch_id).await
    }

    pub async fn get_session_by_id(
        &self,
        id: &str,
    ) -> AppResult<Option<crate::domain::cash::CashSession>> {
        self.0.get_session_by_id(id).await
    }

    pub async fn record_movement(
        &self,
        dto: &CreateCashAdjustmentDto,
        user_id: Option<&str>,
    ) -> AppResult<crate::domain::cash::CashMovement> {
        self.0.record_movement(dto, user_id).await
    }

    pub async fn get_movements(
        &self,
        branch_id: &str,
        session_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<crate::domain::cash::CashMovement>> {
        self.0.get_movements(branch_id, session_id, limit).await
    }

    pub async fn calculate_branch_balance(&self, branch_id: &str) -> AppResult<i64> {
        self.0.calculate_branch_balance(branch_id).await
    }
}

#[derive(Clone)]
pub struct ExpenseRepository(PostgresExpenseRepository);

impl ExpenseRepository {
    pub fn new(repo: PostgresExpenseRepository) -> Self {
        Self(repo)
    }

    pub async fn create_category(
        &self,
        dto: &CreateExpenseCategoryDto,
    ) -> AppResult<ExpenseCategory> {
        self.0.create_category(dto).await
    }

    pub async fn list_categories(&self) -> AppResult<Vec<ExpenseCategory>> {
        self.0.list_categories().await
    }

    pub async fn create_expense(
        &self,
        dto: &CreateExpenseDto,
        user_id: Option<&str>,
    ) -> AppResult<Expense> {
        self.0.create_expense(dto, user_id).await
    }

    pub async fn get_expense_by_id(&self, id: &str) -> AppResult<Option<Expense>> {
        self.0.get_expense_by_id(id).await
    }

    pub async fn list_expenses(&self, filter: &ExpenseFilterDto) -> AppResult<Vec<Expense>> {
        self.0.list_expenses(&Some(filter.clone())).await
    }
}

#[derive(Clone)]
pub struct SalesReturnRepository(PostgresSalesReturnRepository);

impl SalesReturnRepository {
    pub fn new(repo: PostgresSalesReturnRepository) -> Self {
        Self(repo)
    }

    pub async fn process_return(
        &self,
        dto: &CreateSalesReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<SalesReturnDetailDto> {
        self.0.process_return(dto, user_id).await
    }

    pub async fn get_by_id(&self, _id: &str) -> AppResult<Option<SalesReturnDetailDto>> {
        Err(crate::errors::AppError::Internal(
            "Postgres get_by_id not implemented".into(),
        ))
    }

    pub async fn list_sales_returns(
        &self,
        _branch_id: Option<&str>,
        _limit: Option<i64>,
    ) -> AppResult<Vec<SalesReturnDetailDto>> {
        Err(crate::errors::AppError::Internal(
            "Postgres list_sales_returns not implemented".into(),
        ))
    }
}

#[derive(Clone)]
pub struct PurchaseReturnRepository(PostgresPurchaseReturnRepository);

impl PurchaseReturnRepository {
    pub fn new(repo: PostgresPurchaseReturnRepository) -> Self {
        Self(repo)
    }

    pub async fn process_return(
        &self,
        dto: &CreatePurchaseReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseReturnDetailDto> {
        self.0.process_return(dto, user_id).await
    }

    pub async fn get_by_id(&self, _id: &str) -> AppResult<Option<PurchaseReturnDetailDto>> {
        Err(crate::errors::AppError::Internal(
            "Postgres get_by_id not implemented".into(),
        ))
    }

    pub async fn list_purchase_returns(
        &self,
        _branch_id: Option<&str>,
        _limit: Option<i64>,
    ) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        Err(crate::errors::AppError::Internal(
            "Postgres list_purchase_returns not implemented".into(),
        ))
    }
}

#[derive(Clone)]
pub struct ProfitRepository(PostgresProfitRepository);

impl ProfitRepository {
    pub fn new(repo: PostgresProfitRepository) -> Self {
        Self(repo)
    }

    pub async fn get_profit_summary(
        &self,
        branch_id: Option<&str>,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> AppResult<DashboardProfitSummaryDto> {
        self.0.get_profit_summary(branch_id, start_date, end_date).await
    }
}
