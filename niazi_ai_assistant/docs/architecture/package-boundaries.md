# Package Boundaries & Dependency Flow

## 1. Monorepo Package Hierarchy

The system enforces strict acyclic dependencies progressing from abstract types up to application runtime:

```
@niazi-ai/types        (Contracts, domain types, message schemas, capability definitions)
       ↑
@niazi-ai/config       (Provider schemas, route definitions, SecretVault)
       ↑
@niazi-ai/providers    (IAIProvider interface, ProviderRegistry, Ollama & OpenAI adapters)
       ↑
@niazi-ai/core         (ModelSelector, TaskRouter, FallbackEngine, Orchestrator)
       ↑
apps/api               (Future HTTP/WebSocket gateway server)
```

## 2. Invariant Rules

- **Zero Reverse Dependencies**: `@niazi-ai/types` imports nothing from other packages.
- **No Direct Cloud SDK Dependencies**: Providers communicate via standard HTTP (`fetch`), eliminating heavy third-party vendor SDK bloat and breaking changes.
- **Isolated Tests**: Unit tests evaluate package boundaries in isolation using native Node.js test runners without requiring live external network access.

