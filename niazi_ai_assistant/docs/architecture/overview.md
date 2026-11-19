# Niazi AI Assistant — Architectural Overview

## 1. Vision & Core Philosophy

Niazi AI Assistant is an independent, modular AI orchestration platform.
Its primary architectural guarantee is **Vendor Sovereignty**: the platform is not permanently tethered to any single AI provider, cloud vendor, or specific model.

- **Niazi AI owns**: Orchestration, task routing, system instructions, session memory, tool policies, security, and the user interface.
- **AI Providers supply**: Pure compute and model reasoning capabilities (local inference or cloud APIs) behind standardized TypeScript contracts.

## 2. Decoupled 9-Layer Architecture

```
08. Interface Layer (Web, Desktop, Voice)
        │
07. Security & Governance Layer (RBAC, Rate Limits, Secret Vault)
        │
01. Core Orchestration Layer (Task Router, Model Selector, Fallback Engine)
        │
05. Context & Memory Layer (Session State, Semantic RAG)
        │
02. Multi-AI Provider Gateway (Unified Interface, Ollama, OpenAI-Compatible)
        │
03. Dynamic Configuration Layer (Schemas, Route Rules, Secret References)
        │
06. Extensible Tool Layer (Read-Only Repo Analyzer, POS Connector [Phase 6])
        │
09. Monitoring & Telemetry Layer (Audit Events, Token & Latency Metrics)
```

## 3. Strict Boundary Guarantees

1. **POS Decoupling**: The assistant maintains its own independent package hierarchy, build system, and lifecycle. POS databases and core transaction code are never directly queried or written to by the AI runtime.
2. **Deterministic Fallbacks**: Tasks are routed using declared capabilities and requirements; fallback routes trigger only on verifiable, retryable network or availability errors.

