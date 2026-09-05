require("dotenv").config();
const http = require("http");
const express = require("express");

// Global error catchers to prevent silent crashes on Cloud Run
process.on("uncaughtException", (err) => {
  console.error("CRITICAL: Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL: Unhandled Rejection:", reason);
  // Do not process.exit(1) here to prevent a single background cron/socket error from restarting the whole production container.
});

// =========================
// 1. IMPORTS (TOP ONLY)
// =========================
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const compression = require("compression");

// DB + cron (async but NOT blocking listen)
const { connectDB } = require("./db");
const initCron = require("./utils/cron");
const socketManager = require("./sockets/socketManager");
const metricsService = require("./monitoring/metrics.service");
const logger = require("./utils/logger"); // if used later

// Middlewares
const errorHandler = require("./middleware/errorHandler");
const notFound = require("./middleware/notFound");
const tenantMiddleware = require("./middleware/tenant.middleware");
const requireAuth = require("./middleware/auth");
const { apiLimiter } = require("./middleware/rateLimiter");

// Routes
const authRoutes = require("./routes/authRoutes");
const otpRoutes = require("./routes/otpRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const brandRoutes = require("./routes/brandRoutes");
const companyRoutes = require("./routes/companyRoutes");
const colorRoutes = require("./routes/colorRoutes");
const qualityRoutes = require("./routes/qualityRoutes");
const itemTypeRoutes = require("./routes/itemTypeRoutes");
const unitRoutes = require("./routes/unitRoutes");
const customerRoutes = require("./routes/customerRoutes");
const orderRoutes = require("./routes/orderRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const shopRoutes = require("./routes/shop.routes");
const monitoringRoutes = require("./routes/monitoringRoutes");
const historyRoutes = require("./routes/historyRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const importRoutes = require("./routes/importRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const partyRoutes = require("./routes/party.routes");
const repairRoutes = require("./routes/repair.routes");
const adminRoutes = require("./routes/admin.routes");
const settingsRoutes = require("./routes/settingsRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const orgMemberRoutes = require("./routes/orgMemberRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const themeRoutes = require("./routes/theme.routes");
const updateRoutes = require("./routes/updateRoutes");

require("./workers"); // Load background workers

// =========================
// 2. APP INIT
// =========================
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;

app.set("trust proxy", 1);

// =========================
// 3. GLOBAL MIDDLEWARE
// =========================
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-device-id", "idempotency-key", "x-organization-id", "x-shop-id", "x-request-id", "x-tenant-id"]
}));
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(compression());
app.use(express.json());
app.use(cookieParser());

const { requestContextMiddleware } = require("./middleware/requestContext");
const requestLogger = require("./middleware/requestLogger");

app.use(requestContextMiddleware);
app.use(requestLogger);

// Metrics & Rate Limiting
app.use(metricsService.getMiddleware());
app.use("/api/v1", apiLimiter);

// =========================
// 4. HEALTH CHECK (IMPORTANT FOR CLOUD RUN)
// =========================
const mongoose = require("mongoose");

function getHealth(req, res) {
  const connected = mongoose.connection.readyState === 1;

  if (!connected) {
    return res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      service: "Niazi Mobile Mart API",
      env: process.env.NODE_ENV
    });
  }

  return res.status(200).json({
    status: "ok",
    database: "connected",
    service: "Niazi Mobile Mart API",
    env: process.env.NODE_ENV
  });
}

app.get("/", getHealth);
app.get("/health", getHealth);

// =========================
// 5. API ROUTES (LOAD ALL BEFORE LISTEN)
// =========================

// Public / Auth routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth", otpRoutes);
app.use("/api/v1/updates", updateRoutes);


// Protected global middleware
app.use(requireAuth);
app.use(tenantMiddleware);

// Protected routes
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/brands", brandRoutes);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/colors", colorRoutes);
app.use("/api/v1/qualities", qualityRoutes);
app.use("/api/v1/item-types", itemTypeRoutes);
app.use("/api/v1/units", unitRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/invoices", invoiceRoutes);
app.use("/api/v1/import", importRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/shops", shopRoutes);
app.use("/api/v1/monitoring", monitoringRoutes);
app.use("/api/v1/history", historyRoutes);
app.use("/api/v1/expenses", expenseRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/ledger", ledgerRoutes);
app.use("/api/v1/suppliers", supplierRoutes);
app.use("/api/v1/parties", partyRoutes);
app.use("/api/v1/repairs", repairRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/search", require("./routes/searchRoutes"));
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/organization-members", orgMemberRoutes);
app.use("/api/v1/theme", themeRoutes);
app.use("/api/v1/audit-logs", auditLogRoutes);

const queueRoutes = require("./routes/queueRoutes");

// =========================
// 6. 404 HANDLER (LAST ROUTE)
// =========================
app.use("/api/v1/queue", queueRoutes);
app.use(notFound);

// =========================
// 7. ERROR HANDLER (LAST MIDDLEWARE)
// =========================
app.use(errorHandler);

// =========================
// 8. BOOTSTRAP SERVICES (NON-BLOCKING)
// =========================
async function bootstrap() {
  try {
    await connectDB();
    
    // Auto-bootstrap V4 Database (Idempotent)
    const bootstrapDatabase = require('./db/bootstrap');
    await bootstrapDatabase();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`[BOOT] Server listening on ${PORT}`);
    });

    socketManager.init(server);
    console.log("[BOOT] Sockets initialized");

    initCron();
    console.log("[BOOT] Cron jobs started");

  } catch (err) {
    console.error("[FATAL BOOT ERROR]", err);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = app;