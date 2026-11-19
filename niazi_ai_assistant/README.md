# Niazi AI Assistant

Niazi AI Assistant is an independent, modular AI orchestration platform designed by Bazi Studio / Niazi Mobile Mart.

The system decouples core intelligence, business context, memory, tools, and user interaction from any single AI vendor or model. External AI providers supply replaceable model capabilities behind standardized TypeScript interfaces.

## Architectural Layers (Phase 1 Scope)

- **`packages/ai-types`**: Strongly typed domain models, requests, responses, model capabilities, and contracts.
- **`packages/ai-config`**: Configuration schemas, validation, task routing rules, and secure credential reference management.
- **`packages/ai-providers`**: Pluggable provider gateway featuring local **Ollama** and generic **OpenAI-Compatible** HTTP adapters with standardized error normalization.
- **`packages/ai-core`**: Model selection, deterministic task-based routing, and failover engine.

## Preserved Assets

The `agent_concepts/` directory houses visual concept artwork and avatar renders representing the specialized multi-agent identity system (Nexus, Cipher, Oracle, Vanguard, and domain agents).

## Security Guarantee

- **Zero Plaintext Secrets**: API keys are referenced through environment variables or secure vault identifiers; never hardcoded or output in logs.
- **Strict Isolation**: No runtime or build dependencies on Niazi Mobile Mart POS.

