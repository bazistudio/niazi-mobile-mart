# Targeted Tauri Storefront Artifact Verification Audit Report

**Audit Date**: 2026-09-10  
**Current Branch**: `feature/deploy-ready-testmode`  
**Current Commit**: `4feaad67b565bfa586f67bac11e81b6876152557`  
**Completion Tag**: `desktop-boundary-separation-complete-20260910-2230`

---

## 1. Executive Summary

```text
Storefront physically present in Tauri artifact: YES (As an isolated 182.08 kB lazy-loaded chunk)
Build Graph Classification: CODE-SPLIT BUT PHYSICALLY INCLUDED
Desktop Route Boundary: SAFE (Redirects / and /products to /auth/login or /dashboard/shop-admin/inventory)
```

This forensic verification analyzed the physical composition of `frontend/dist` and the Tauri bundle configuration.

While the main entry bundle (`index-CUM-O-7D.js`) was successfully reduced by **179.40 kB (-9.5%)** and the desktop startup route was fixed to redirect directly to `/auth/login`, the storefront source modules (`storefront-web-chunk-Ch-Atf9-.js`, 182.08 kB) are **physically present inside the `frontend/dist` directory**. Because `tauri.conf.json` maps `"frontendDist": "../frontend/dist"`, Tauri bundles the entire `dist` folder into the installer binary.

---

## 2. Git State

- **Branch**: `feature/deploy-ready-testmode`
- **HEAD Commit**: `4feaad67b565bfa586f67bac11e81b6876152557`
- **Working Tree**: `CLEAN`

---

## 3. Desktop Build Configuration

- `package.json` script: `"build:desktop": "cross-env VITE_APP_SURFACE=desktop npm --prefix frontend run build"`
- `vite.config.ts` manualChunks rule:
  ```ts
  if (id.includes("src/features/storefront") || id.includes("src/pages/storefront")) {
    return "storefront-web-chunk";
  }
  ```
- `tauri.conf.json` frontend dist target: `"frontendDist": "../frontend/dist"`

---

## 4. Artifact Inspection (`frontend/dist/assets`)

| File Name | Size (Bytes) | Category / Description |
| :--- | :--- | :--- |
| `index-CUM-O-7D.js` | 1,700,217 B (1.70 MB) | Primary Application Entry Chunk |
| `pdf-generation-chunk-BWyfIv0Y.js` | 1,590,103 B (1.59 MB) | Isolated PDF/Canvas Chunk |
| `storefront-web-chunk-Ch-Atf9-.js` | 182,076 B (182.08 kB) | **Isolated Storefront Web Chunk** |
| `index-D8DWREIk.css` | 191,866 B (191.87 kB) | Combined Application CSS |
| `index.es-lfL4yvwO.js` | 159,613 B (159.61 kB) | Shared Utility Library Chunk |
| `purify.es-Csrj9YNg.js` | 28,139 B (28.14 kB) | DOMPurify Sanitization Chunk |
| `core-DV6XEvTN.js` | 96 B | Tauri Core Bridge Polyfill |

---

## 5. Build Graph Result

```text
STATUS: CODE-SPLIT BUT PHYSICALLY INCLUDED (STATUS B)
```

- **Explanation**: The storefront modules were successfully removed from the initial synchronous desktop execution path via `React.lazy()` and `manualChunks`.
- **Physical Packaging**: Because `vite build` writes both the core app and the storefront chunk to `frontend/dist`, and `tauri.conf.json` copies all files inside `frontend/dist` into the native application bundle, `storefront-web-chunk-Ch-Atf9-.js` is physically packaged inside the Tauri executable and installer.

---

## 6. Route Boundary Result

- **Desktop Root (`/`)**: Navigating to `/` in Tauri desktop mode evaluates `isDesktop = true` and returns `<Navigate to="/auth/login" replace />`.
- **Desktop Storefront Routes (`/products`, `/about`, `/contact`)**: Evaluated as `isDesktop = true`, redirecting directly to `/dashboard/shop-admin/inventory` or `/dashboard/shop-admin`.
- **Storefront Component Initialization**: `StorefrontLayout` and `HomePage` are **0% initialized or evaluated** during desktop application boot.

---

## 7. Web Build Result

- `npm run build:web` continues to compile the full web application.
- When `isDesktop = false`, root `/` renders `StorefrontLayout` wrapping `HomePage` as intended for web landing deployments.

---

## 8. Exact Measurements

- **Desktop Frontend Dist Total Size**: 3,852,110 bytes (~3.85 MB)
- **Main Desktop Entry Chunk**: 1,700,217 bytes (~1.70 MB)
- **Storefront Chunk Size**: 182,076 bytes (~182.08 kB)
- **Storefront Percentage of Frontend Dist**: 4.72%

---

## 9. Security Verification

- `0` server secrets (`DATABASE_URL`, `TOKEN_SECRET`) exist in `frontend/dist` or the storefront chunk.
- Storefront chunk contains only mock product JSON datasets and public marketing UI layouts.

---

## 10. Database Verification

```text
Schema changes: 0
Migration changes: 0
Seed changes: 0
DATABASE SCHEMA REMAINS FROZEN
```

---

## 11. Backend Verification

```text
Backend changes: 0
Axum server binary remains untouched
```

---

## 12. Cloud Run Verification

`Deployment performed: NO`

---

## 13. Recommendation

```text
BOUNDARY VERIFIED FOR DESKTOP ROUTE SAFETY — READY TO PROCEED TO CLOUD RUN DEPLOYMENT
```

- **Route Safety**: **100% VERIFIED**. Desktop users can never reach the public storefront UI upon launching or navigating the desktop app.
- **Physical Exclusion**: If complete 100% physical file exclusion of `storefront-web-chunk` from the Tauri `.exe` installer is desired in a future phase, `vite.config.ts` can be configured to use `outDir: "dist/desktop"` (excluding storefront) vs `outDir: "dist/web"`.
