use std::sync::Arc;
use tokio::sync::RwLock;

/// Application session context for active multi-shop/tenant state
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionContext {
    pub user_id: Option<String>,
    pub organization_id: Option<String>,
    pub shop_id: Option<String>,
}

/// Global thread-safe application state managed by Tauri runtime
#[derive(Clone)]
pub struct AppState {
    pub app_version: String,
    pub session: Arc<RwLock<SessionContext>>,
    pub is_initialized: Arc<RwLock<bool>>,
}

impl AppState {
    pub fn new(app_version: impl Into<String>) -> Self {
        Self {
            app_version: app_version.into(),
            session: Arc::new(RwLock::new(SessionContext::default())),
            is_initialized: Arc::new(RwLock::new(true)),
        }
    }

    pub async fn get_session(&self) -> SessionContext {
        self.session.read().await.clone()
    }

    pub async fn set_session(&self, context: SessionContext) {
        let mut session = self.session.write().await;
        *session = context;
    }

    pub async fn clear_session(&self) {
        let mut session = self.session.write().await;
        *session = SessionContext::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_app_state_session_lifecycle() {
        let state = AppState::new("5.0.3");
        assert_eq!(state.app_version, "5.0.3");

        let initial_session = state.get_session().await;
        assert_eq!(initial_session, SessionContext::default());

        let new_context = SessionContext {
            user_id: Some("usr_123".to_string()),
            organization_id: Some("org_456".to_string()),
            shop_id: Some("shop_789".to_string()),
        };

        state.set_session(new_context.clone()).await;
        let active_session = state.get_session().await;
        assert_eq!(active_session, new_context);

        state.clear_session().await;
        let cleared_session = state.get_session().await;
        assert_eq!(cleared_session, SessionContext::default());
    }
}
