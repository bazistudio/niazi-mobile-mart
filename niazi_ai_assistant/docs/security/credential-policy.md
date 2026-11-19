# Credential Security Policy

## 1. Absolute Prohibition of Plaintext Secrets

- Under no circumstances may API keys, bearer tokens, or sensitive credentials be committed to Git repositories or written to configuration files (`config.json`, etc.).
- The `.gitignore` file enforces exclusion of all `.env` files, `.key` files, and local certificates.

## 2. Secret Vault Abstraction

All credential access is mediated by the `SecretVault` and `SecretResolver` abstractions in `@niazi-ai/config`:

```typescript
const key = await SecretVault.getInstance().getSecret(config.apiKeyRef);
```

- In development, credentials are resolved from process environment variables referenced by key name (e.g., `OPENAI_COMPATIBLE_API_KEY`).
- In production, the `SecretResolver` interface can be swapped for an OS keyring, Docker secret, or encrypted cloud secret store without modifying provider adapters.
- Provider errors and logs are sanitised to prevent token leaks.

