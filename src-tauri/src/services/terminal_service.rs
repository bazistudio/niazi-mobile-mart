use crate::domain::terminal::{RegisterTerminalDto, Terminal};
use crate::errors::AppResult;
use crate::repositories::TerminalRepository;

pub struct TerminalService;

impl TerminalService {
    /// Resolves or initializes the unique stable terminal identity for this installation
    pub async fn get_current_terminal(repo: &TerminalRepository) -> AppResult<Terminal> {
        repo.get_or_create_current_terminal().await
    }

    /// Registers/updates a terminal record
    pub async fn register_terminal(
        repo: &TerminalRepository,
        dto: RegisterTerminalDto,
    ) -> AppResult<Terminal> {
        let mut current = repo.get_or_create_current_terminal().await?;

        current.device_name = dto.device_name;
        if let Some(b_id) = dto.branch_id {
            current.branch_id = Some(b_id);
        }
        if let Some(is_off) = dto.is_offline_terminal {
            current.is_offline_terminal = is_off;
        }

        repo.save(&current).await?;
        Ok(current)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::repositories::SQLiteTerminalRepository;

    #[tokio::test]
    async fn test_terminal_identity_persistence_and_uniqueness() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let sqlite_repo = SQLiteTerminalRepository::new(db);
        let repo = TerminalRepository::SQLite(sqlite_repo);

        // First call: generates UUID v4 terminal identity
        let t1 = TerminalService::get_current_terminal(&repo).await.unwrap();
        assert_eq!(t1.id.len(), 36, "Terminal ID must be a valid 36-char UUID");
        assert!(t1.is_active);

        // Second call: returns the EXACT SAME terminal identity (reused)
        let t2 = TerminalService::get_current_terminal(&repo).await.unwrap();
        assert_eq!(t1.id, t2.id, "Terminal ID must be reused across restarts/calls");

        // Separate second DB (simulating PC #2) generates a unique terminal ID
        let db2 = DatabaseConnection::open_in_memory().unwrap();
        let sqlite_repo2 = SQLiteTerminalRepository::new(db2);
        let repo2 = TerminalRepository::SQLite(sqlite_repo2);

        let t3 = TerminalService::get_current_terminal(&repo2).await.unwrap();
        assert_ne!(t1.id, t3.id, "Terminal A and Terminal B must have distinct unique UUIDs");
    }
}
