import { AuthService } from "./auth.service";

// ─── Main login ─────────────────────────────────────────────────────────────

/**
 * MAIN LOGIN FUNCTION (CORE ENTRY POINT)
 * Delegates directly to the single client-side AuthService authority.
 */
export async function loginUser(identifier: string, password: string) {
  return AuthService.login(identifier, password);
}

// ─── Logout ─────────────────────────────────────────────────────────────────

/**
 * LOGOUT FUNCTION
 * Delegates directly to AuthService.logout().
 */
export function logoutUser() {
  return AuthService.logout();
}

/**
 * GET ME (fetch current user via AuthService)
 */
export async function getMeUser() {
  return AuthService.getMeUser();
}

/**
 * LOCAL SNAPSHOT / PIN LOGIN FUNCTION
 * Delegates directly to AuthService.loginWithSnapshot().
 */
export async function loginUserWithSnapshot(username: string, pin: string) {
  return AuthService.loginWithSnapshot(username, pin);
}