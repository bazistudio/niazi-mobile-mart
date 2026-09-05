# 🏪 TijaratPro ERP

Offline-first, multi-tenant ERP & POS system built for modern retail businesses.

Built with **Next.js + Electron + TypeScript**, TijaratPro is designed to handle:
- Multi-shop management
- Role-based access control
- Offline-first POS operations
- Real-time inventory sync
- Scalable SaaS architecture

---

## 🚀 Tech Stack

- Next.js (App Router)
- Electron (Desktop POS)
- TypeScript
- Zustand (State Management)
- Axios (API Layer)
- TailwindCSS
- PostgreSQL / MongoDB (planned backend)
- Offline-first architecture

---

## 🧠 Core Features

### 🔐 Authentication System
- JWT + Refresh Token support
- Device binding (Electron security)
- Role-based access control:
  - SUPER_ADMIN
  - MULTI_ADMIN
  - SHOP_ADMIN
  - STAFF

---

### 🏪 Multi-Shop System
- Organization → Shops → Staff hierarchy
- Shop-scoped data isolation
- Multi-tenant architecture

---

### 💻 Desktop POS (Electron)
- Offline-first sales system
- Local cache database support
- Sync when online

---

### 🔄 Sync Engine (Planned)
- Background sync queue
- Conflict resolution
- Event-based updates

---

## 📁 Architecture
