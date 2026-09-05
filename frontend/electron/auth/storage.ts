import { safeStorage } from 'electron';
import Store from 'electron-store';
import { logger } from '../logger';

const store = new Store({
  name: 'auth-tokens'
});

export function setToken(key: string, token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    store.set(key, encrypted.toString('base64'));
  } else {
    // Fallback if safeStorage is unavailable (rare, but happens on some Linux without keyring)
    store.set(key, Buffer.from(token, 'utf-8').toString('base64'));
  }
}

export function getToken(key: string): string | null {
  const data = store.get(key) as string | undefined;
  if (!data) return null;

  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(data, 'base64'));
    } else {
      return Buffer.from(data, 'base64').toString('utf-8');
    }
  } catch (err) {
    logger.error('[safeStorage] Failed to decrypt token', err);
    return null;
  }
}

export function clearToken(key: string): void {
  store.delete(key);
}
