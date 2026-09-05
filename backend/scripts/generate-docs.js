const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '../../tijaratpro');
const docsDir = path.join(rootDir, 'docs');

const docStructure = {
  'architecture/SYSTEM_ARCHITECTURE.md': `# System Architecture\n\nTijaratPro is a multi-tenant Enterprise Resource Planning (ERP) system designed for retail, POS, inventory, and accounting.\n\n## Backend Layers\n1. **API Layer**: Express.js REST API handling requests and responses.\n2. **Middleware**: JWT authentication, Tenant Isolation (AsyncLocalStorage), and Role-Based Access Control.\n3. **Service Layer**: Business logic (e.g., \`BusinessTransactionService\`, \`ConfigurationService\`).\n4. **Data Access Layer**: Mongoose models with enterprise plugins.\n5. **Database**: MongoDB with replica sets for ACID transactions.\n\n## Request Lifecycle\nClient -> API Gateway/LB -> Express Middleware (Auth, Tenant) -> Controller -> Service -> Model -> MongoDB.\n\n## Plugin Architecture\nTijaratPro heavily utilizes Mongoose plugins for DRY principles, specifically \`applyEnterprisePlugins.js\` which automatically injects \`uuid\`, \`publicId\`, soft-delete flags, audit trails, and pagination into all models.`,
  'architecture/DATABASE_ARCHITECTURE.md': `# Database Architecture\n\nReference the \`ARCHITECTURE_FREEZE.md\` for rules regarding changes to the database.\n\nThe database is built to handle millions of documents efficiently while strictly partitioning data between organizations.\n\n## Core Concepts\n- **Organizations and Branches**: Multi-tenancy isolation.\n- **Master Data**: Products, Parties, Warehouses, etc.\n- **Transactions**: Orders, Invoices, Payments, Stock Movements, Ledger Entries.\n- **Infrastructure**: ActivityLogs, AuditLogs, JobQueues, Notifications.`,
  'architecture/MULTI_TENANCY.md': `# Multi-Tenancy Architecture\n\n## Tenant Isolation\nTijaratPro uses a single-database, pooled-tenant model.\nIsolation is strictly enforced at the database level using Mongoose pre-hooks via the \`tenantIsolation\` plugin.\n\n\`AsyncLocalStorage\` is used to pass the \`organizationId\` from the authentication token directly into the data layer without having to pass it through every function argument manually.`,
  'architecture/AUTHENTICATION.md': `# Authentication Architecture\n\n## Overview\nAuthentication in TijaratPro is split into two primary methods:\n1. **Global Owners/Admins**: Email + Password login.\n2. **Daily Staff (POS/Warehouse)**: Organization Code + Username + PIN login.\n\nAll authenticated sessions generate a short-lived JWT and a refresh token tied to a \`UserSession\` document that can be remotely revoked.`,
  'architecture/TRANSACTION_FLOW.md': `# Transaction Flow\n\n## ACID Transactions\nBecause TijaratPro handles financial ledgers and physical stock, all business transactions (Sales, Purchases, Returns) strictly enforce MongoDB ACID transactions.\n\n## Idempotency\nTo prevent double-charging or duplicate order creation during network timeouts, APIs use an \`Idempotency-Key\` header validated against the \`IdempotencyRecord\` collection.`,
  'architecture/STORAGE_ARCHITECTURE.md': `# Storage Architecture\n\n## Media Library\nBinary files are never stored in MongoDB.\nMongoDB only stores metadata within the \`MediaLibrary\` collection (e.g. dimensions, SHA-256 checksum, MIME types).\n\nThe \`StorageService\` abstracts physical storage, allowing swap-out to AWS S3, Google Cloud Storage, or Local File System via environment variables.`,
  'architecture/DEPENDENCY_MAP.md': `# Dependency Map\n\n## Core Technologies\n- **Node.js** & **Express**\n- **MongoDB** & **Mongoose**\n- **jsonwebtoken** & **bcrypt**\n- **migrate-mongo**\n- **winston** (Logging)\n- **bull** (Job Queueing - Planned)`,

  'database/DATABASE_STANDARDS.md': `# Database Standards\n\n## Naming\n- Collections: \`camelCase\` plural.\n- Models: \`PascalCase\` singular.\n- Public IDs: 3-letter prefix (e.g. \`INV-\`, \`PRD-\`) followed by random hex.\n\n## Soft Deletes\nNever delete data directly. Set \`isDeleted: true\` using the \`.softDelete()\` method on the document.`,
  'database/ARCHITECTURE_FREEZE.md': fs.existsSync(path.join(docsDir, 'database/ARCHITECTURE_FREEZE.md')) ? fs.readFileSync(path.join(docsDir, 'database/ARCHITECTURE_FREEZE.md'), 'utf-8') : '', // Retain existing
  'database/MIGRATION_GUIDE.md': `# Migration Guide\n\nRefer to Phase 8 documentation for running \`scripts/migration-runner.js\`.\n\n## Creating Migrations\nMigrations must export \`up(db, client, session)\` and \`down(db, client, session)\` functions.\nUse \`npx migrate-mongo create <name>\` to scaffold, then wrap inside our enterprise runner.`,
  'database/ENTITY_RELATIONSHIPS.md': `# Entity Relationships\n\n## Double-Entry Ledger\n\`LedgerEntry\` documents are tied to a \`Party\`, a \`systemAccountId\`, and a \`transactionId\` (e.g. Invoice or Payment ID).\nBalances are computed dynamically by summing Debits and Credits rather than storing static balances.`,
  'database/INDEXING_GUIDE.md': `# Indexing Guide\n\n## Rule of Thumb\nEvery query that scans more than 100 documents requires a compound index.\n\nMust always include \`organizationId\` as the first key in compound indexes.`,

  'api/API_STANDARDS.md': `# API Standards\n\n## URL Structure\n\`/api/v1/:resource\`\n\n## Responses\nAll responses follow a standard envelope:\n\`\`\`json\n{\n  "success": true,\n  "data": {},\n  "meta": { "page": 1, "total": 100 }\n}\n\`\`\``,
  'api/AUTH_API.md': `# Auth API\n\n## \`POST /api/v1/auth/login/pin\`\nBody:\n- \`organizationCode\`\n- \`username\`\n- \`pin\`\n\nResponse:\n- \`accessToken\`\n- \`refreshToken\``,
  'api/PRODUCTS_API.md': `# Products API\n\nStandard CRUD endpoints scoped dynamically by the user's \`organizationId\` extracted from their JWT token.`,
  'api/ORDERS_API.md': `# Orders API\n\nOrders heavily rely on Idempotency keys to prevent duplicate insertions.`,
  'api/PAYMENTS_API.md': `# Payments API\n\nPayments trigger corresponding \`LedgerEntry\` creations in a MongoDB transaction.`,
  'api/ERROR_CODES.md': `# Error Codes\n\n- \`400\`: Bad Request\n- \`401\`: Unauthorized\n- \`403\`: Forbidden (Missing Permission)\n- \`404\`: Not Found\n- \`409\`: Conflict (Optimistic Concurrency or Duplicate Key)`,

  'development/CODING_STANDARDS.md': `# Coding Standards\n\n1. Use modern ES6+ syntax.\n2. Do not use \`console.log\` in production business logic; use \`ActivityLog\` or standard loggers.\n3. Keep controllers thin; place all logic inside Services.`,
  'development/PLUGIN_GUIDE.md': `# Plugin Guide\n\nAll models must use \`applyEnterprisePlugins(schema, { tenant: true, publicPrefix: "XYZ" })\` to ensure global standards apply uniformly.`,
  'development/SERVICE_LAYER.md': `# Service Layer\n\nServices are stateless classes or singletons that orchestrate complex business flows across multiple Mongoose models.`,
  'development/TESTING_GUIDE.md': `# Testing Guide\n\nUse \`jest\` for unit testing and \`supertest\` for integration testing.\nAlways mock the database or use \`mongodb-memory-server\` for isolated tests.`,
  'development/DEPLOYMENT.md': `# Deployment Guide\n\n## Environment Variables\nRequired:\n- \`MONGODB_URI\`\n- \`JWT_SECRET\`\n- \`STORAGE_PROVIDER\`\n\n## Running\n\`npm run start\``,
  'development/CONTRIBUTING.md': `# Contributing\n\nEnsure all code passes linting and includes appropriate tests before submitting a Pull Request.`,

  'security/SECURITY_GUIDE.md': `# Security Guide\n\n## General\n- Never expose internal \`_id\` in URLs where possible; prefer \`publicId\`.\n- Never log passwords or PINs.\n- Use bcrypt for password hashing.`,
  'security/JWT_FLOW.md': `# JWT Lifecycle\n\nTokens expire after 1 hour. A \`UserSession\` allows refreshing tokens remotely or terminating sessions across devices.`,
  'security/PERMISSIONS.md': `# Permissions\n\nUsers belong to \`Roles\`, which are associated with \`Permissions\` (e.g. \`INVOICE_CREATE\`, \`REPORT_VIEW\`). The API middleware validates these statically.`,
  'security/AUDIT_LOGGING.md': `# Audit Logging\n\nChanges to sensitive documents immediately trigger an \`AuditLog\` capture tracking the \`oldValue\`, \`newValue\`, and the modifying \`userId\`.`,
};

const readmeContent = `# TijaratPro ERP System

TijaratPro is a modern, highly-scalable, multi-tenant Enterprise Resource Planning system built on Node.js and MongoDB.

## Features
- **Strict Multi-Tenancy**: Zero data leakage between organizations via advanced \`AsyncLocalStorage\` context binding.
- **Enterprise Architecture**: Built-in support for audit logs, soft deletes, optimistic concurrency, and idempotency.
- **Master Data Management**: Centralized management of Products, Parties, Warehouses, Taxes, and Units.
- **Financial Ledgers**: Double-entry accounting system with strict transactional integrity.
- **Media Library**: Metadata-driven external file storage abstraction.
- **Migration Engine**: Database versioning and rollback capability built directly into the deployment cycle.

## Documentation
Please refer to the [\`/docs\`](./docs) directory for extensive architectural, database, and API guides.

## Quick Start
1. Ensure MongoDB 6.0+ is running with replica sets enabled.
2. Configure \`.env\` variables.
3. Run \`npm install\`.
4. Run \`npm run start\`.
`;

function createDocs() {
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(docStructure)) {
    const fullPath = path.join(docsDir, relativePath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (content) {
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`Created: ${relativePath}`);
    }
  }

  // Write README
  fs.writeFileSync(path.join(rootDir, 'README.md'), readmeContent, 'utf-8');
  console.log(`Updated: README.md`);
}

createDocs();
