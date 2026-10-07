use tauri::State;

use crate::domain::profit::{
    DailyProfitabilityDto, DashboardProfitSummaryDto, PeriodProfitabilityDto, ProductProfitabilityDto,
    SaleProfitabilityDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn profit_get_period(
    state: State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    branch_id: Option<String>,
) -> AppResult<PeriodProfitabilityDto> {
    AuthService::require_permission(&state, Some("reports"), None).await?;
    let target_branch = if let Some(ref bid) = branch_id {
        Some(AuthService::require_branch_access(&state, Some(bid)).await?)
    } else {
        let authorized_branch = AuthService::require_branch_access(&state, None).await?;
        let session = state.get_session().await;
        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
        };
        if !is_org_admin {
            Some(authorized_branch)
        } else {
            None
        }
    };
    state
        .profit_service
        .get_period_profitability(start_date, end_date, target_branch)
        .await
}

#[tauri::command]
pub async fn profit_get_daily(
    state: State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    branch_id: Option<String>,
) -> AppResult<Vec<DailyProfitabilityDto>> {
    AuthService::require_permission(&state, Some("reports"), None).await?;
    let target_branch = if let Some(ref bid) = branch_id {
        Some(AuthService::require_branch_access(&state, Some(bid)).await?)
    } else {
        let authorized_branch = AuthService::require_branch_access(&state, None).await?;
        let session = state.get_session().await;
        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
        };
        if !is_org_admin {
            Some(authorized_branch)
        } else {
            None
        }
    };
    state
        .profit_service
        .get_daily_profitability(start_date, end_date, target_branch)
        .await
}

#[tauri::command]
pub async fn profit_get_product(
    state: State<'_, AppState>,
    product_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    branch_id: Option<String>,
) -> AppResult<Vec<ProductProfitabilityDto>> {
    AuthService::require_permission(&state, Some("reports"), None).await?;
    let target_branch = if let Some(ref bid) = branch_id {
        Some(AuthService::require_branch_access(&state, Some(bid)).await?)
    } else {
        let authorized_branch = AuthService::require_branch_access(&state, None).await?;
        let session = state.get_session().await;
        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
        };
        if !is_org_admin {
            Some(authorized_branch)
        } else {
            None
        }
    };
    state
        .profit_service
        .get_product_profitability(product_id, start_date, end_date, target_branch)
        .await
}

#[tauri::command]
pub async fn profit_get_sale(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Option<SaleProfitabilityDto>> {
    AuthService::require_permission(&state, Some("reports"), None).await?;
    let sale = state.sale_service.get_sale_by_id(&sale_id).await?;
    if let Some(ref s) = sale {
        AuthService::require_branch_access(&state, Some(&s.branch_id)).await?;
    }
    state.profit_service.get_sale_profitability(&sale_id).await
}

#[tauri::command]
pub async fn profit_get_dashboard_summary(
    state: State<'_, AppState>,
    branch_id: Option<String>,
) -> AppResult<DashboardProfitSummaryDto> {
    // Both shop_admin and staff can view dashboard KPIs
    AuthService::require_permission(&state, None, None).await?;
    let target_branch = if let Some(ref bid) = branch_id {
        Some(AuthService::require_branch_access(&state, Some(bid)).await?)
    } else {
        let authorized_branch = AuthService::require_branch_access(&state, None).await?;
        let session = state.get_session().await;
        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
        };
        if !is_org_admin {
            Some(authorized_branch)
        } else {
            None
        }
    };
    state
        .profit_service
        .get_dashboard_profit_summary(target_branch)
        .await
}
