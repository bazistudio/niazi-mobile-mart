# Developer Setup Guide

## 1. Prerequisites

- **Node.js**: v20+ or v24+
- **TypeScript**: v5.5+
- **Ollama** (Optional for local AI testing): `http://localhost:11434`

## 2. Quickstart

```bash
# Navigate to workspace
cd "D:\niazi mobile mart\niazi_ai_assistant"

# Copy environment template
cp .env.example .env

# Build all packages via Project References
npm run build

# Run unit tests
npm test
```

## 3. Running with Local Ollama

1. Start Ollama: `ollama serve`
2. Pull a base model: `ollama pull llama3.2:latest`
3. Configure `OLLAMA_BASE_URL` in `.env` (defaults to `http://localhost:11434`).

