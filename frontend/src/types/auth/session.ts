import { AuthUser } from "./auth";

export interface AuthSession {
  expiresAt: number;
  deviceId: string;
  user: AuthUser;
}