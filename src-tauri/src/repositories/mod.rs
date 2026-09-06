pub mod branch_repository;
pub mod catalog_repository;
pub mod customer_repository;
pub mod inventory_repository;
pub mod product_repository;
pub mod sale_repository;
pub mod sqlite_user_repo;
pub mod user_repository;

pub use branch_repository::{BranchRepository, OrganizationDashboardStats};
pub use catalog_repository::SQLiteCatalogRepository;
pub use customer_repository::SQLiteCustomerRepository;
pub use inventory_repository::SQLiteInventoryRepository;
pub use product_repository::SQLiteProductRepository;
pub use sale_repository::SQLiteSaleRepository;
pub use sqlite_user_repo::SQLiteUserRepository;
pub use user_repository::InMemoryUserRepository;