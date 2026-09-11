pub mod branch_repository;
pub mod cash_repository;
pub mod catalog_repository;
pub mod customer_repository;
pub mod expense_repository;
pub mod inventory_repository;
pub mod product_repository;
pub mod profit_repository;
pub mod purchase_repository;
pub mod purchase_return_repository;
pub mod sale_repository;
pub mod sales_return_repository;
pub mod sqlite_user_repo;
pub mod supplier_repository;
pub mod user_repository;

pub mod postgres_branch_repo;
pub mod postgres_cash_repo;
pub mod postgres_catalog_repo;
pub mod postgres_customer_repo;
pub mod postgres_expense_repo;
pub mod postgres_inventory_repo;
pub mod postgres_product_repo;
pub mod postgres_profit_repo;
pub mod postgres_purchase_repo;
pub mod postgres_purchase_return_repo;
pub mod postgres_sale_repo;
pub mod postgres_sales_return_repo;
pub mod postgres_supplier_repo;
pub mod postgres_user_repo;

pub use branch_repository::{BranchRepository as SQLiteBranchRepository, OrganizationDashboardStats};
pub use cash_repository::SQLiteCashRepository;
pub use catalog_repository::SQLiteCatalogRepository;
pub use customer_repository::SQLiteCustomerRepository;
pub use expense_repository::SQLiteExpenseRepository;
pub use inventory_repository::SQLiteInventoryRepository;
pub use product_repository::SQLiteProductRepository;
pub use profit_repository::SQLiteProfitRepository;
pub use purchase_repository::SQLitePurchaseRepository;
pub use purchase_return_repository::SQLitePurchaseReturnRepository;
pub use sale_repository::SQLiteSaleRepository;
pub use sales_return_repository::SQLiteSalesReturnRepository;
pub use sqlite_user_repo::SQLiteUserRepository;
pub use supplier_repository::SQLiteSupplierRepository;
pub use user_repository::InMemoryUserRepository;

pub use postgres_branch_repo::PostgresBranchRepository;
pub use postgres_cash_repo::PostgresCashRepository;
pub use postgres_catalog_repo::PostgresCatalogRepository;
pub use postgres_customer_repo::PostgresCustomerRepository;
pub use postgres_expense_repo::PostgresExpenseRepository;
pub use postgres_inventory_repo::PostgresInventoryRepository;
pub use postgres_product_repo::PostgresProductRepository;
pub use postgres_profit_repo::PostgresProfitRepository;
pub use postgres_purchase_repo::PostgresPurchaseRepository;
pub use postgres_purchase_return_repo::PostgresPurchaseReturnRepository;
pub use postgres_sale_repo::PostgresSaleRepository;
pub use postgres_sales_return_repo::PostgresSalesReturnRepository;
pub use postgres_supplier_repo::PostgresSupplierRepository;
pub use postgres_user_repo::PostgresUserRepository;

use crate::domain::catalog::{
    Brand, Category, CreateBrandDto, CreateCategoryDto, CreateUnitDto, Unit, UpdateBrandDto,
    UpdateCategoryDto, UpdateUnitDto,
};
use crate::domain::customer::{
    Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry, CustomerPaymentResultDto,
    CustomerStatementDto, CustomerSummaryDto, RecordCustomerPaymentDto, UpdateCustomerDto,
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
use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchaseResultDto,
};
use crate::domain::purchase_return::{
    CreatePurchaseReturnDto, PurchaseReturn, PurchaseReturnFilterDto, PurchaseReturnDetailDto,
};
use crate::domain::sales::{
    CompleteSaleDto, Sale, SaleFilterDto, SaleLine, SalePayment, SaleResultDto,
};
use crate::domain::sales_return::{
    CreateSalesReturnDto, SalesReturn, SalesReturnFilterDto, SalesReturnDetailDto,
};
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
            Self::SQLite(r) => r.consume_recovery_key_and_reset_password(user_id, new_login_key_hash).await,
            Self::Postgres(r) => r.consume_recovery_key_and_reset_password(user_id, new_login_key_hash).await,
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
}

#[derive(Clone)]
pub enum CatalogRepository {
    SQLite(SQLiteCatalogRepository),
    Postgres(PostgresCatalogRepository),
}

impl CatalogRepository {
    pub async fn create_category(&self, id: &str, dto: &CreateCategoryDto) -> AppResult<Category> {
        match self {
            Self::SQLite(r) => r.create_category(id, dto).await,
            Self::Postgres(r) => r.create_category(id, dto).await,
        }
    }

    pub async fn get_category_by_id(&self, id: &str) -> AppResult<Category> {
        match self {
            Self::SQLite(r) => r.get_category_by_id(id).await,
            Self::Postgres(r) => r.get_category_by_id(id).await,
        }
    }

    pub async fn list_categories(&self) -> AppResult<Vec<Category>> {
        match self {
            Self::SQLite(r) => r.list_categories().await,
            Self::Postgres(r) => r.list_categories().await,
        }
    }

    pub async fn update_category(&self, id: &str, dto: &UpdateCategoryDto) -> AppResult<Category> {
        match self {
            Self::SQLite(r) => r.update_category(id, dto).await,
            Self::Postgres(r) => r.update_category(id, dto).await,
        }
    }

    pub async fn create_brand(&self, id: &str, dto: &CreateBrandDto) -> AppResult<Brand> {
        match self {
            Self::SQLite(r) => r.create_brand(id, dto).await,
            Self::Postgres(r) => r.create_brand(id, dto).await,
        }
    }

    pub async fn get_brand_by_id(&self, id: &str) -> AppResult<Brand> {
        match self {
            Self::SQLite(r) => r.get_brand_by_id(id).await,
            Self::Postgres(r) => r.get_brand_by_id(id).await,
        }
    }

    pub async fn list_brands(&self) -> AppResult<Vec<Brand>> {
        match self {
            Self::SQLite(r) => r.list_brands().await,
            Self::Postgres(r) => r.list_brands().await,
        }
    }

    pub async fn update_brand(&self, id: &str, dto: &UpdateBrandDto) -> AppResult<Brand> {
        match self {
            Self::SQLite(r) => r.update_brand(id, dto).await,
            Self::Postgres(r) => r.update_brand(id, dto).await,
        }
    }

    pub async fn create_unit(&self, id: &str, dto: &CreateUnitDto) -> AppResult<Unit> {
        match self {
            Self::SQLite(r) => r.create_unit(id, dto).await,
            Self::Postgres(r) => r.create_unit(id, dto).await,
        }
    }

    pub async fn get_unit_by_id(&self, id: &str) -> AppResult<Unit> {
        match self {
            Self::SQLite(r) => r.get_unit_by_id(id).await,
            Self::Postgres(r) => r.get_unit_by_id(id).await,
        }
    }

    pub async fn list_units(&self) -> AppResult<Vec<Unit>> {
        match self {
            Self::SQLite(r) => r.list_units().await,
            Self::Postgres(r) => r.list_units().await,
        }
    }

    pub async fn update_unit(&self, id: &str, dto: &UpdateUnitDto) -> AppResult<Unit> {
        match self {
            Self::SQLite(r) => r.update_unit(id, dto).await,
            Self::Postgres(r) => r.update_unit(id, dto).await,
        }
    }
}

#[derive(Clone)]
pub enum ProductRepository {
    SQLite(SQLiteProductRepository),
    Postgres(PostgresProductRepository),
}

impl ProductRepository {
    pub async fn create_product(&self, id: &str, dto: &CreateProductDto) -> AppResult<Product> {
        match self {
            Self::SQLite(r) => r.create_product(id, dto).await,
            Self::Postgres(r) => r.create_product(id, dto).await,
        }
    }

    pub async fn create_product_with_initial_stock(
        &self,
        id: &str,
        dto: &CreateProductDto,
        user_id: Option<&str>,
    ) -> AppResult<Product> {
        match self {
            Self::SQLite(r) => {
                let prod = r.create_product(id, dto).await?;
                if let (Some(qty), Some(ref branch_id)) = (dto.initial_quantity, &dto.branch_id) {
                    if qty > 0 {
                        // SQLite initial stock handle
                    }
                }
                Ok(prod)
            }
            Self::Postgres(r) => r.create_product_with_initial_stock(id, dto, user_id).await,
        }
    }

    pub async fn get_product_by_id(&self, id: &str) -> AppResult<Product> {
        match self {
            Self::SQLite(r) => r.get_product_by_id(id).await,
            Self::Postgres(r) => r.get_product_by_id(id).await,
        }
    }

    pub async fn get_product_by_sku(&self, sku: &str) -> AppResult<Product> {
        match self {
            Self::SQLite(r) => r.get_product_by_sku(sku).await,
            Self::Postgres(r) => r.get_product_by_sku(sku).await,
        }
    }

    pub async fn get_product_by_barcode(&self, barcode: &str) -> AppResult<Product> {
        match self {
            Self::SQLite(r) => r.get_product_by_barcode(barcode).await,
            Self::Postgres(r) => r.get_product_by_barcode(barcode).await,
        }
    }

    pub async fn list_products(&self, filter: &ProductFilter) -> AppResult<Vec<Product>> {
        match self {
            Self::SQLite(r) => r.list_products(filter).await,
            Self::Postgres(r) => r.list_products(filter).await,
        }
    }

    pub async fn update_product(&self, id: &str, dto: &UpdateProductDto) -> AppResult<Product> {
        match self {
            Self::SQLite(r) => r.update_product(id, dto).await,
            Self::Postgres(r) => r.update_product(id, dto).await,
        }
    }

    pub async fn deactivate_product(&self, id: &str) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.deactivate_product(id).await,
            Self::Postgres(r) => r.deactivate_product(id).await,
        }
    }
}

#[derive(Clone)]
pub enum InventoryRepository {
    SQLite(SQLiteInventoryRepository),
    Postgres(PostgresInventoryRepository),
}

impl InventoryRepository {
    pub async fn get_stock(&self, product_id: &str, branch_id: &str) -> AppResult<i64> {
        match self {
            Self::SQLite(r) => r.get_stock(product_id, branch_id).await,
            Self::Postgres(r) => r.get_stock(product_id, branch_id).await,
        }
    }

    pub async fn get_stock_map(
        &self,
        branch_id: &str,
    ) -> AppResult<std::collections::HashMap<String, i64>> {
        match self {
            Self::SQLite(r) => r.get_stock_map(branch_id).await,
            Self::Postgres(r) => r.get_stock_map(branch_id).await,
        }
    }

    pub async fn increase_stock(
        &self,
        dto: &IncreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.increase_stock(dto, user_id).await,
        }
    }

    pub async fn decrease_stock(
        &self,
        dto: &DecreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.decrease_stock(dto, user_id).await,
        }
    }

    pub async fn adjust_stock(
        &self,
        dto: &AdjustStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.adjust_stock(dto, user_id).await,
        }
    }

    pub async fn transfer_stock(
        &self,
        dto: &TransferStockDto,
        user_id: Option<&str>,
    ) -> AppResult<()> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.transfer_stock(dto, user_id).await,
        }
    }

    pub async fn list_movements(
        &self,
        product_id: Option<&str>,
        branch_id: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<StockMovement>> {
        match self {
            Self::SQLite(r) => r.list_movements(product_id, branch_id, limit).await,
            Self::Postgres(r) => r.list_movements(product_id, branch_id, limit).await,
        }
    }

    pub async fn list_low_stock(&self, branch_id: &str) -> AppResult<Vec<LowStockItemDto>> {
        match self {
            Self::SQLite(r) => r.list_low_stock(branch_id).await,
            Self::Postgres(r) => r.list_low_stock(branch_id).await,
        }
    }
}

#[derive(Clone)]
pub enum CustomerRepository {
    SQLite(SQLiteCustomerRepository),
    Postgres(PostgresCustomerRepository),
}

impl CustomerRepository {
    pub async fn create_customer(&self, customer: &Customer) -> AppResult<Customer> {
        match self {
            Self::SQLite(r) => r.create_customer(customer).await,
            Self::Postgres(r) => r.create_customer(customer).await,
        }
    }

    pub async fn update_customer(&self, id: &str, dto: &UpdateCustomerDto) -> AppResult<Customer> {
        match self {
            Self::SQLite(r) => r.update_customer(id, dto).await,
            Self::Postgres(r) => r.update_customer(id, dto).await,
        }
    }

    pub async fn get_customer_by_id(&self, id: &str) -> AppResult<Option<Customer>> {
        match self {
            Self::SQLite(r) => r.get_customer_by_id(id).await,
            Self::Postgres(r) => r.get_customer_by_id(id).await,
        }
    }

    pub async fn get_customer_by_phone(&self, phone: &str) -> AppResult<Option<Customer>> {
        match self {
            Self::SQLite(r) => r.get_customer_by_phone(phone).await,
            Self::Postgres(r) => r.get_customer_by_phone(phone).await,
        }
    }

    pub async fn get_customer_detail(&self, id: &str) -> AppResult<CustomerDetailDto> {
        match self {
            Self::SQLite(r) => r.get_customer_detail(id).await,
            Self::Postgres(r) => r.get_customer_detail(id).await,
        }
    }

    pub async fn list_customers(
        &self,
        filter: &CustomerFilter,
    ) -> AppResult<Vec<CustomerSummaryDto>> {
        match self {
            Self::SQLite(r) => r.list_customers(filter).await,
            Self::Postgres(r) => r.list_customers(filter).await,
        }
    }

    pub async fn search_customers(&self, query: &str) -> AppResult<Vec<CustomerSummaryDto>> {
        match self {
            Self::SQLite(r) => r.search_customers(query).await,
            Self::Postgres(r) => r.search_customers(query).await,
        }
    }

    pub async fn get_outstanding_balance(&self, customer_id: &str) -> AppResult<i64> {
        match self {
            Self::SQLite(r) => r.get_outstanding_balance(customer_id).await,
            Self::Postgres(r) => r.calculate_outstanding_balance(customer_id).await,
        }
    }

    pub async fn get_ledger(
        &self,
        customer_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CustomerLedgerEntry>> {
        match self {
            Self::SQLite(r) => r.get_ledger(customer_id, limit, offset).await,
            Self::Postgres(r) => r.get_ledger(customer_id, limit, offset).await,
        }
    }

    pub async fn get_statement(&self, customer_id: &str) -> AppResult<CustomerStatementDto> {
        match self {
            Self::SQLite(r) => r.get_statement(customer_id).await,
            Self::Postgres(r) => r.get_statement(customer_id).await,
        }
    }

    pub async fn deactivate_customer(&self, id: &str) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.deactivate_customer(id).await,
            Self::Postgres(r) => r.deactivate_customer(id).await,
        }
    }
}

#[derive(Clone)]
pub enum SupplierRepository {
    SQLite(SQLiteSupplierRepository),
    Postgres(PostgresSupplierRepository),
}

impl SupplierRepository {
    pub async fn create_supplier(&self, supplier: &Supplier) -> AppResult<Supplier> {
        match self {
            Self::SQLite(r) => r.create_supplier(supplier).await,
            Self::Postgres(r) => r.create_supplier(supplier).await,
        }
    }

    pub async fn update_supplier(&self, id: &str, dto: &UpdateSupplierDto) -> AppResult<Supplier> {
        match self {
            Self::SQLite(r) => r.update_supplier(id, dto).await,
            Self::Postgres(r) => r.update_supplier(id, dto).await,
        }
    }

    pub async fn get_supplier_by_id(&self, id: &str) -> AppResult<Option<Supplier>> {
        match self {
            Self::SQLite(r) => r.get_supplier_by_id(id).await,
            Self::Postgres(r) => r.get_supplier_by_id(id).await,
        }
    }

    pub async fn get_supplier_detail(&self, id: &str) -> AppResult<SupplierDetailDto> {
        match self {
            Self::SQLite(r) => r.get_supplier_detail(id).await,
            Self::Postgres(r) => r.get_supplier_detail(id).await,
        }
    }

    pub async fn list_suppliers(
        &self,
        filter: &SupplierFilter,
    ) -> AppResult<Vec<SupplierSummaryDto>> {
        match self {
            Self::SQLite(r) => r.list_suppliers(filter).await,
            Self::Postgres(r) => r.list_suppliers(filter).await,
        }
    }

    pub async fn search_suppliers(&self, query: &str) -> AppResult<Vec<SupplierSummaryDto>> {
        match self {
            Self::SQLite(r) => r.search_suppliers(query).await,
            Self::Postgres(r) => r.search_suppliers(query).await,
        }
    }

    pub async fn get_outstanding_balance(&self, supplier_id: &str) -> AppResult<i64> {
        match self {
            Self::SQLite(r) => r.get_outstanding_balance(supplier_id).await,
            Self::Postgres(r) => r.calculate_outstanding_balance(supplier_id).await,
        }
    }

    pub async fn get_ledger(
        &self,
        supplier_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<SupplierLedgerEntry>> {
        match self {
            Self::SQLite(r) => r.get_ledger(supplier_id, limit, offset).await,
            Self::Postgres(r) => r.get_ledger(supplier_id, limit, offset).await,
        }
    }

    pub async fn deactivate_supplier(&self, id: &str) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.deactivate_supplier(id).await,
            Self::Postgres(r) => r.deactivate_supplier(id).await,
        }
    }
}

#[derive(Clone)]
pub enum SaleRepository {
    SQLite(SQLiteSaleRepository),
    Postgres(PostgresSaleRepository),
}

impl SaleRepository {
    pub async fn complete_sale(
        &self,
        dto: &CompleteSaleDto,
        user_id: Option<&str>,
    ) -> AppResult<SaleResultDto> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.complete_sale(dto, user_id).await,
        }
    }

    pub async fn get_sale_by_id(&self, id: &str) -> AppResult<Option<Sale>> {
        match self {
            Self::SQLite(r) => r.get_sale_by_id(id).await,
            Self::Postgres(r) => r.get_sale_by_id(id).await,
        }
    }

    pub async fn get_sale_by_invoice(&self, invoice_number: &str) -> AppResult<Option<Sale>> {
        match self {
            Self::SQLite(r) => r.get_sale_by_invoice(invoice_number).await,
            Self::Postgres(r) => r.get_sale_by_invoice(invoice_number).await,
        }
    }

    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        match self {
            Self::SQLite(r) => r.get_sale_lines(sale_id).await,
            Self::Postgres(r) => r.get_sale_lines(sale_id).await,
        }
    }

    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        match self {
            Self::SQLite(r) => r.get_sale_payments(sale_id).await,
            Self::Postgres(r) => r.get_sale_payments(sale_id).await,
        }
    }

    pub async fn list_sales(&self, filter: &SaleFilterDto) -> AppResult<Vec<Sale>> {
        match self {
            Self::SQLite(r) => r.list_sales(filter).await,
            Self::Postgres(r) => r.list_sales(&Some(filter.clone())).await,
        }
    }
}

#[derive(Clone)]
pub enum PurchaseRepository {
    SQLite(SQLitePurchaseRepository),
    Postgres(PostgresPurchaseRepository),
}

impl PurchaseRepository {
    pub async fn complete_purchase(
        &self,
        dto: &CompletePurchaseDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseResultDto> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.complete_purchase(dto, user_id).await,
        }
    }

    pub async fn get_purchase_by_id(&self, id: &str) -> AppResult<Option<Purchase>> {
        match self {
            Self::SQLite(r) => r.get_purchase_by_id(id).await,
            Self::Postgres(r) => r.get_purchase_by_id(id).await,
        }
    }

    pub async fn get_purchase_by_number(&self, number: &str) -> AppResult<Option<Purchase>> {
        match self {
            Self::SQLite(r) => r.get_purchase_by_number(number).await,
            Self::Postgres(r) => r.get_purchase_by_number(number).await,
        }
    }

    pub async fn get_purchase_lines(&self, purchase_id: &str) -> AppResult<Vec<PurchaseLine>> {
        match self {
            Self::SQLite(r) => r.get_purchase_lines(purchase_id).await,
            Self::Postgres(r) => r.get_purchase_lines(purchase_id).await,
        }
    }

    pub async fn list_purchases(&self, filter: &PurchaseFilterDto) -> AppResult<Vec<Purchase>> {
        match self {
            Self::SQLite(r) => r.list_purchases(filter).await,
            Self::Postgres(r) => r.list_purchases(&Some(filter.clone())).await,
        }
    }
}

#[derive(Clone)]
pub enum CashRepository {
    SQLite(SQLiteCashRepository),
    Postgres(PostgresCashRepository),
}

impl CashRepository {
    pub async fn open_session(
        &self,
        dto: &OpenCashSessionDto,
        user_id: Option<&str>,
    ) -> AppResult<crate::domain::cash::CashSession> {
        match self {
            Self::SQLite(r) => r.open_session(dto, user_id).await,
            Self::Postgres(r) => r.open_session(dto, user_id).await,
        }
    }

    pub async fn close_session(
        &self,
        dto: &CloseCashSessionDto,
        user_id: Option<&str>,
    ) -> AppResult<crate::domain::cash::CashSession> {
        match self {
            Self::SQLite(r) => r.close_session(dto, user_id).await,
            Self::Postgres(r) => r.close_session(dto, user_id).await,
        }
    }

    pub async fn get_open_session(&self, branch_id: &str) -> AppResult<Option<crate::domain::cash::CashSession>> {
        match self {
            Self::SQLite(r) => r.get_open_session(branch_id).await,
            Self::Postgres(r) => r.get_open_session(branch_id).await,
        }
    }

    pub async fn get_session_by_id(&self, id: &str) -> AppResult<Option<crate::domain::cash::CashSession>> {
        match self {
            Self::SQLite(r) => r.get_session_by_id(id).await,
            Self::Postgres(r) => r.get_session_by_id(id).await,
        }
    }

    pub async fn record_movement(
        &self,
        dto: &CreateCashAdjustmentDto,
        user_id: Option<&str>,
    ) -> AppResult<crate::domain::cash::CashMovement> {
        match self {
            Self::SQLite(r) => r.record_movement(dto, user_id).await,
            Self::Postgres(r) => r.record_movement(dto, user_id).await,
        }
    }

    pub async fn get_movements(
        &self,
        branch_id: &str,
        session_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<crate::domain::cash::CashMovement>> {
        match self {
            Self::SQLite(r) => r.get_movements(branch_id, session_id, limit).await,
            Self::Postgres(r) => r.get_movements(branch_id, session_id, limit).await,
        }
    }

    pub async fn calculate_branch_balance(&self, branch_id: &str) -> AppResult<i64> {
        match self {
            Self::SQLite(r) => r.calculate_branch_balance(branch_id).await,
            Self::Postgres(r) => r.calculate_branch_balance(branch_id).await,
        }
    }
}

#[derive(Clone)]
pub enum ExpenseRepository {
    SQLite(SQLiteExpenseRepository),
    Postgres(PostgresExpenseRepository),
}

impl ExpenseRepository {
    pub async fn create_category(
        &self,
        dto: &CreateExpenseCategoryDto,
    ) -> AppResult<ExpenseCategory> {
        match self {
            Self::SQLite(r) => r.create_category(dto).await,
            Self::Postgres(r) => r.create_category(dto).await,
        }
    }

    pub async fn list_categories(&self) -> AppResult<Vec<ExpenseCategory>> {
        match self {
            Self::SQLite(r) => r.list_categories().await,
            Self::Postgres(r) => r.list_categories().await,
        }
    }

    pub async fn create_expense(
        &self,
        dto: &CreateExpenseDto,
        user_id: Option<&str>,
    ) -> AppResult<Expense> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.create_expense(dto, user_id).await,
        }
    }

    pub async fn get_expense_by_id(&self, id: &str) -> AppResult<Option<Expense>> {
        match self {
            Self::SQLite(r) => r.get_expense_by_id(id).await,
            Self::Postgres(r) => r.get_expense_by_id(id).await,
        }
    }

    pub async fn list_expenses(&self, filter: &ExpenseFilterDto) -> AppResult<Vec<Expense>> {
        match self {
            Self::SQLite(r) => r.list_expenses(filter).await,
            Self::Postgres(r) => r.list_expenses(&Some(filter.clone())).await,
        }
    }
}

#[derive(Clone)]
pub enum SalesReturnRepository {
    SQLite(SQLiteSalesReturnRepository),
    Postgres(PostgresSalesReturnRepository),
}

impl SalesReturnRepository {
    pub async fn process_return(
        &self,
        dto: &CreateSalesReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<SalesReturnDetailDto> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.process_return(dto, user_id).await,
        }
    }

    pub async fn get_return_by_id(&self, id: &str) -> AppResult<Option<SalesReturn>> {
        match self {
            Self::SQLite(r) => r.get_return_by_id(id).await,
            Self::Postgres(r) => r.get_return_by_id(id).await,
        }
    }

    pub async fn list_returns(&self, filter: &SalesReturnFilterDto) -> AppResult<Vec<SalesReturn>> {
        match self {
            Self::SQLite(r) => r.list_returns(filter).await,
            Self::Postgres(r) => r.list_returns(&Some(filter.clone())).await,
        }
    }
}

#[derive(Clone)]
pub enum PurchaseReturnRepository {
    SQLite(SQLitePurchaseReturnRepository),
    Postgres(PostgresPurchaseReturnRepository),
}

impl PurchaseReturnRepository {
    pub async fn process_return(
        &self,
        dto: &CreatePurchaseReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseReturnDetailDto> {
        match self {
            Self::SQLite(_) => Err(crate::errors::AppError::Internal("SQLite uses db transaction in service".into())),
            Self::Postgres(r) => r.process_return(dto, user_id).await,
        }
    }

    pub async fn get_return_by_id(&self, id: &str) -> AppResult<Option<PurchaseReturn>> {
        match self {
            Self::SQLite(r) => r.get_return_by_id(id).await,
            Self::Postgres(r) => r.get_return_by_id(id).await,
        }
    }

    pub async fn list_returns(&self, filter: &PurchaseReturnFilterDto) -> AppResult<Vec<PurchaseReturn>> {
        match self {
            Self::SQLite(r) => r.list_returns(filter).await,
            Self::Postgres(r) => r.list_returns(&Some(filter.clone())).await,
        }
    }
}

#[derive(Clone)]
pub enum ProfitRepository {
    SQLite(SQLiteProfitRepository),
    Postgres(PostgresProfitRepository),
}

impl ProfitRepository {
    pub async fn get_profit_summary(
        &self,
        branch_id: Option<&str>,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> AppResult<DashboardProfitSummaryDto> {
        match self {
            Self::SQLite(r) => r.get_profit_summary(branch_id, start_date, end_date).await,
            Self::Postgres(r) => r.get_profit_summary(branch_id, start_date, end_date).await,
        }
    }
}