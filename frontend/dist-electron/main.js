"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/logger.ts
var import_electron_log, import_electron, import_path, import_fs, isDev, logPath, logger;
var init_logger = __esm({
  "electron/logger.ts"() {
    "use strict";
    import_electron_log = __toESM(require("electron-log"));
    import_electron = require("electron");
    import_path = __toESM(require("path"));
    import_fs = __toESM(require("fs"));
    isDev = !import_electron.app.isPackaged;
    import_electron_log.default.transports.file.level = isDev ? "debug" : "info";
    import_electron_log.default.transports.console.level = isDev ? "debug" : false;
    import_electron_log.default.transports.file.maxSize = 1048576;
    logPath = import_path.default.join(import_electron.app.getPath("userData"), "logs", "main.log");
    try {
      import_fs.default.mkdirSync(import_path.default.dirname(logPath), { recursive: true });
    } catch (e) {
    }
    import_electron_log.default.transports.file.resolvePathFn = () => logPath;
    logger = import_electron_log.default;
  }
});

// electron/db/schema.ts
function initializeSchema(db3) {
  db3.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      updatedAt INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);
  db3.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);
  db3.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customerId TEXT,
      total REAL NOT NULL,
      status TEXT NOT NULL,
      items TEXT NOT NULL,
      paymentMethod TEXT,
      discount REAL,
      updatedAt INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);
  const newColumns = [
    "customerId TEXT",
    "items TEXT",
    "paymentMethod TEXT",
    "discount REAL"
  ];
  for (const col of newColumns) {
    try {
      db3.exec(`ALTER TABLE orders ADD COLUMN ${col};`);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes("duplicate column name")) {
        logger.warn(`[DB] Migration warn: Could not add ${col} to orders:`, err);
      }
    }
  }
  db3.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY, -- Same as operation_log ID for tracing
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
      payload TEXT NOT NULL, -- JSON
      timestamp INTEGER NOT NULL
    );
  `);
  db3.exec(`
    CREATE TABLE IF NOT EXISTS operation_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      status TEXT NOT NULL -- 'pending', 'synced', 'failed'
    );
  `);
  db3.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      shop_id TEXT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT
    );
  `);
}
var init_schema = __esm({
  "electron/db/schema.ts"() {
    "use strict";
    init_logger();
  }
});

// electron/services/config.ts
var import_electron_store3, defaultConfig, configStore;
var init_config = __esm({
  "electron/services/config.ts"() {
    "use strict";
    import_electron_store3 = __toESM(require("electron-store"));
    defaultConfig = {
      backupPath: "",
      lastBackupDate: "",
      autoBackupEnabled: true
    };
    configStore = new import_electron_store3.default({
      name: "tijarat-config",
      defaults: defaultConfig
    });
  }
});

// electron/notifications.ts
function showNotification(title, body) {
  if (import_electron5.Notification.isSupported()) {
    const notification = new import_electron5.Notification({
      title,
      body
    });
    notification.on("click", () => {
      logger.info(`[Notification] User clicked notification: ${title}`);
    });
    notification.show();
  } else {
    logger.warn(`[Notification] Unsupported on this system. (Title: ${title}, Body: ${body})`);
  }
}
function setupNotifications() {
  if (!import_electron5.ipcMain.listenerCount("app:notify")) {
    import_electron5.ipcMain.handle("app:notify", (_, title, body) => {
      showNotification(title, body);
    });
  }
}
var import_electron5;
var init_notifications = __esm({
  "electron/notifications.ts"() {
    "use strict";
    import_electron5 = require("electron");
    init_logger();
  }
});

// electron/services/backupManager.ts
async function createBackup() {
  try {
    const backupPath = configStore.get("backupPath");
    if (!backupPath) {
      return { success: false, message: "Backup path not configured" };
    }
    if (!import_fs2.default.existsSync(backupPath)) {
      import_fs2.default.mkdirSync(backupPath, { recursive: true });
    }
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupFileName = `tijarat_backup_${dateStr}.db.gz`;
    const destinationFile = import_path3.default.join(backupPath, backupFileName);
    const tempDbPath = import_path3.default.join(import_electron6.app.getPath("temp"), `temp_backup_${dateStr}.db`);
    await getDb().backup(tempDbPath);
    const source = import_fs2.default.createReadStream(tempDbPath);
    const destination = import_fs2.default.createWriteStream(destinationFile);
    const gzip = import_zlib.default.createGzip();
    await (0, import_promises.pipeline)(source, gzip, destination);
    import_fs2.default.unlinkSync(tempDbPath);
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    configStore.set("lastBackupDate", todayStr);
    cleanupOldBackups(backupPath);
    logger.info(`[BackupManager] Backup completed successfully: ${destinationFile}`);
    showNotification("Backup Complete", "Your database has been safely backed up.");
    return { success: true, message: "Backup completed successfully", backupFile: destinationFile };
  } catch (error) {
    logger.error("[BackupManager] Backup failed:", error);
    return { success: false, message: error.message || "Backup failed" };
  }
}
function cleanupOldBackups(backupPath) {
  try {
    const files = import_fs2.default.readdirSync(backupPath).filter((f) => f.startsWith("tijarat_backup_") && f.endsWith(".db.gz")).map((f) => ({ name: f, time: import_fs2.default.statSync(import_path3.default.join(backupPath, f)).mtime.getTime() })).sort((a, b) => b.time - a.time);
    if (files.length > 30) {
      const toDelete = files.slice(30);
      for (const file of toDelete) {
        import_fs2.default.unlinkSync(import_path3.default.join(backupPath, file.name));
      }
    }
  } catch (err) {
    logger.error("[BackupManager] Failed to cleanup old backups:", err);
  }
}
function openBackupFolder() {
  const backupPath = configStore.get("backupPath");
  if (backupPath && import_fs2.default.existsSync(backupPath)) {
    import_electron6.shell.openPath(backupPath);
  } else {
    logger.warn("[BackupManager] Backup folder not found or not configured.");
  }
}
async function restoreDatabase(backupFilePath) {
  try {
    if (!import_fs2.default.existsSync(backupFilePath)) {
      return { success: false, message: "Backup file does not exist" };
    }
    const userDataPath = import_electron6.app.getPath("userData");
    const currentDbPath = import_path3.default.join(userDataPath, "tijarat_local.db");
    const preRestorePath = import_path3.default.join(userDataPath, "tijarat_local.db.pre-restore");
    const extractedTempPath = import_path3.default.join(import_electron6.app.getPath("temp"), `restore_temp_${Date.now()}.db`);
    const source = import_fs2.default.createReadStream(backupFilePath);
    const destination = import_fs2.default.createWriteStream(extractedTempPath);
    const gunzip = import_zlib.default.createGunzip();
    await (0, import_promises.pipeline)(source, gunzip, destination);
    const stat = import_fs2.default.statSync(extractedTempPath);
    if (stat.size === 0) {
      import_fs2.default.unlinkSync(extractedTempPath);
      throw new Error("Extracted database is empty or corrupted.");
    }
    closeDb();
    if (import_fs2.default.existsSync(currentDbPath)) {
      if (import_fs2.default.existsSync(preRestorePath)) import_fs2.default.unlinkSync(preRestorePath);
      import_fs2.default.renameSync(currentDbPath, preRestorePath);
    }
    try {
      import_fs2.default.copyFileSync(extractedTempPath, currentDbPath);
      import_fs2.default.unlinkSync(extractedTempPath);
      setTimeout(() => {
        import_electron6.app.relaunch();
        import_electron6.app.exit(0);
      }, 1e3);
      return { success: true, message: "Restore successful. Restarting application..." };
    } catch (restoreError) {
      logger.error("[BackupManager] Failed to copy restored DB, attempting rollback...", restoreError);
      if (import_fs2.default.existsSync(preRestorePath)) {
        import_fs2.default.renameSync(preRestorePath, currentDbPath);
      }
      return { success: false, message: "Restore failed, rolled back to previous state. " + restoreError.message };
    }
  } catch (error) {
    logger.error("[BackupManager] Restore sequence failed:", error);
    return { success: false, message: error.message || "Restore sequence failed" };
  }
}
function createStartupSnapshot(dbPath) {
  if (import_fs2.default.existsSync(dbPath)) {
    try {
      const backupDir = import_path3.default.join(import_electron6.app.getPath("userData"), "backups");
      if (!import_fs2.default.existsSync(backupDir)) {
        import_fs2.default.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const backupPath = import_path3.default.join(backupDir, `tijarat_local_${timestamp}.db.backup`);
      import_fs2.default.copyFileSync(dbPath, backupPath);
      logger.info(`[BackupManager] Startup snapshot created at ${backupPath}`);
      const backups = import_fs2.default.readdirSync(backupDir).filter((f) => f.startsWith("tijarat_local_") && f.endsWith(".db.backup")).sort();
      if (backups.length > 5) {
        for (let i = 0; i < backups.length - 5; i++) {
          import_fs2.default.unlinkSync(import_path3.default.join(backupDir, backups[i]));
        }
      }
    } catch (err) {
      logger.error("[BackupManager] Failed to create database startup snapshot:", err);
    }
  }
}
function initBackupScheduler() {
  checkAndRunBackup();
  setInterval(() => {
    checkAndRunBackup();
  }, 60 * 60 * 1e3);
}
async function checkAndRunBackup() {
  const autoBackupEnabled = configStore.get("autoBackupEnabled");
  const backupPath = configStore.get("backupPath");
  if (!autoBackupEnabled || !backupPath) return;
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const lastBackupDate = configStore.get("lastBackupDate");
  if (lastBackupDate === todayStr) return;
  try {
    const stmt = getDb().prepare(`SELECT MAX(timestamp) as lastActivity FROM operation_log`);
    const result = stmt.get();
    if (!result || !result.lastActivity) return;
    if (import_electron6.net.isOnline()) {
      logger.info("[BackupManager] Conditions met, triggering auto-backup...");
      await createBackup();
    }
  } catch (err) {
    logger.error("[BackupManager] Scheduler failed to check DB:", err);
  }
}
function getBackupStatus() {
  return {
    backupPath: configStore.get("backupPath"),
    lastBackupDate: configStore.get("lastBackupDate"),
    autoBackupEnabled: configStore.get("autoBackupEnabled")
  };
}
var import_fs2, import_path3, import_zlib, import_promises, import_electron6;
var init_backupManager = __esm({
  "electron/services/backupManager.ts"() {
    "use strict";
    import_fs2 = __toESM(require("fs"));
    import_path3 = __toESM(require("path"));
    import_zlib = __toESM(require("zlib"));
    import_promises = require("stream/promises");
    init_db();
    init_config();
    import_electron6 = require("electron");
    init_logger();
    init_notifications();
  }
});

// electron/db/index.ts
function getDb() {
  if (!_db) {
    throw new Error("[DB] Database not initialized. Call initDb() first inside app.whenReady().");
  }
  return _db;
}
function closeDb() {
  if (_db && !dbClosed) {
    try {
      _db.close();
      _db = null;
      dbClosed = true;
    } catch (err) {
      logger.error("Failed to close database safely:", err);
    }
  }
}
function initDb() {
  if (_db) return;
  const dbPath = import_path4.default.join(import_electron7.app.getPath("userData"), "tijarat_local.db");
  createStartupSnapshot(dbPath);
  _db = new import_better_sqlite3.default(dbPath, {
    // Remove verbose in production — swap with syncLogger
  });
  dbClosed = false;
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initializeSchema(_db);
}
var import_better_sqlite3, import_path4, import_electron7, _db, dbClosed, db2;
var init_db = __esm({
  "electron/db/index.ts"() {
    "use strict";
    import_better_sqlite3 = __toESM(require("better-sqlite3"));
    import_path4 = __toESM(require("path"));
    import_electron7 = require("electron");
    init_schema();
    init_logger();
    init_backupManager();
    _db = null;
    dbClosed = false;
    db2 = new Proxy({}, {
      get(_target, prop) {
        return getDb()[prop];
      }
    });
  }
});

// electron/cache/memoryCache.ts
var MemoryCache, memoryCache;
var init_memoryCache = __esm({
  "electron/cache/memoryCache.ts"() {
    "use strict";
    MemoryCache = class {
      constructor() {
        this.cache = /* @__PURE__ */ new Map();
      }
      // Generate composite keys like "users:123"
      getKey(entityType, id) {
        return `${entityType}:${id}`;
      }
      get(entityType, id) {
        return this.cache.get(this.getKey(entityType, id));
      }
      set(entityType, id, data) {
        const key = this.getKey(entityType, id);
        const existing = this.cache.get(key);
        if (!existing || data.version >= existing.version) {
          this.cache.set(key, data);
        }
      }
      delete(entityType, id) {
        this.cache.delete(this.getKey(entityType, id));
      }
      clear() {
        this.cache.clear();
      }
    };
    memoryCache = new MemoryCache();
  }
});

// electron/services/api.ts
var import_axios, API_BASE_URL, apiClient, api;
var init_api = __esm({
  "electron/services/api.ts"() {
    "use strict";
    import_axios = __toESM(require("axios"));
    API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000/api/v1";
    apiClient = import_axios.default.create({
      baseURL: API_BASE_URL,
      timeout: 5e3
    });
    api = {
      // Resolves conflicts by checking server.updatedAt > local.updatedAt
      syncEntity: async (entityType, operation, payload) => {
        const endpoint = `/${entityType}`;
        try {
          let response;
          if (operation === "CREATE") {
            response = await apiClient.post(endpoint, payload);
          } else if (operation === "UPDATE") {
            response = await apiClient.put(`${endpoint}/${payload.id}`, payload);
          } else if (operation === "DELETE") {
            response = await apiClient.delete(`${endpoint}/${payload.id}`);
          }
          return { success: true, data: response?.data };
        } catch (error) {
          if (error.response && error.response.status === 409) {
            return { success: false, conflict: true, serverData: error.response.data.serverEntity };
          }
          throw error;
        }
      }
    };
  }
});

// electron/services/logger.ts
function getLogPath() {
  if (!syncLogPath) {
    const logDir = import_path5.default.join(import_electron8.app.getPath("userData"), "logs");
    if (!import_fs3.default.existsSync(logDir)) {
      import_fs3.default.mkdirSync(logDir, { recursive: true });
    }
    syncLogPath = import_path5.default.join(logDir, "sync.log");
  }
  return syncLogPath;
}
var import_fs3, import_path5, import_electron8, syncLogPath, syncLogger;
var init_logger2 = __esm({
  "electron/services/logger.ts"() {
    "use strict";
    import_fs3 = __toESM(require("fs"));
    import_path5 = __toESM(require("path"));
    import_electron8 = require("electron");
    syncLogPath = null;
    syncLogger = {
      info: (message, meta = {}) => {
        const entry = `[INFO] ${(/* @__PURE__ */ new Date()).toISOString()} - ${message} - ${JSON.stringify(meta)}
`;
        import_fs3.default.appendFileSync(getLogPath(), entry);
      },
      error: (message, error) => {
        const entry = `[ERROR] ${(/* @__PURE__ */ new Date()).toISOString()} - ${message} - ${error?.message || error}
`;
        import_fs3.default.appendFileSync(getLogPath(), entry);
      }
    };
  }
});

// electron/services/syncEngine.ts
var SyncEngine, syncEngine;
var init_syncEngine = __esm({
  "electron/services/syncEngine.ts"() {
    "use strict";
    init_db();
    init_api();
    init_logger2();
    init_memoryCache();
    SyncEngine = class {
      constructor() {
        this.isOnline = true;
        this.isSyncing = false;
        this.timer = null;
      }
      // Called explicitly from main.ts after app.whenReady() and initDb()
      start() {
        this.startPolling();
      }
      stop() {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }
      setOnlineStatus(status) {
        this.isOnline = status;
        if (this.isOnline) {
          this.triggerSync();
        }
      }
      startPolling() {
        this.timer = setInterval(() => {
          this.triggerSync();
        }, 3e4);
      }
      // Event-driven trigger
      async triggerSync() {
        if (!this.isOnline) return;
        if (this.isSyncing) {
          syncLogger.info("Sync already running, skipping trigger.");
          return;
        }
        this.isSyncing = true;
        try {
          await this.processQueue();
        } catch (error) {
          syncLogger.error("Sync failed", error);
        } finally {
          this.isSyncing = false;
        }
      }
      async processQueue() {
        const queueStmt = db2.prepare(`SELECT * FROM sync_queue ORDER BY timestamp ASC LIMIT 50`);
        const pendingItems = queueStmt.all();
        if (pendingItems.length === 0) return;
        for (const item of pendingItems) {
          const payload = JSON.parse(item.payload);
          try {
            const result = await api.syncEntity(item.entity_type, item.operation, payload);
            if (result.success && result.data) {
              const canonicalData = result.data;
              if (item.operation !== "DELETE") {
                const updates = Object.keys(canonicalData).filter((k) => k !== "id").map((k) => `${k} = @${k}`).join(", ");
                const stmt = db2.prepare(`UPDATE ${item.entity_type} SET ${updates} WHERE id = @id`);
                stmt.run(canonicalData);
                memoryCache.set(item.entity_type, canonicalData.id, canonicalData);
              }
              this.markSynced(item.id);
            } else if (result.conflict && result.serverData) {
              this.resolveConflict(item.entity_type, payload, result.serverData);
              this.markSynced(item.id);
            }
          } catch (error) {
            syncLogger.error(`Failed to sync item ${item.id}`, error);
            this.markFailed(item.id);
          }
        }
      }
      markSynced(id) {
        const transaction = db2.transaction(() => {
          db2.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(id);
          db2.prepare(`UPDATE operation_log SET status = 'synced' WHERE id = ?`).run(id);
        });
        transaction();
        syncLogger.info(`Successfully synced item`, { id });
      }
      markFailed(id) {
        db2.prepare(`UPDATE operation_log SET status = 'failed' WHERE id = ?`).run(id);
      }
      resolveConflict(entityType, localData, serverData) {
        const serverWins = serverData.version > localData.version || serverData.version === localData.version && serverData.updatedAt > localData.updatedAt;
        if (serverWins) {
          syncLogger.info("Conflict resolved: Server wins", { entityType, id: localData.id });
          const updates = Object.keys(serverData).filter((k) => k !== "id").map((k) => `${k} = @${k}`).join(", ");
          const stmt = db2.prepare(`UPDATE ${entityType} SET ${updates} WHERE id = @id`);
          stmt.run(serverData);
          memoryCache.set(entityType, serverData.id, serverData);
        } else {
          syncLogger.info("Conflict resolved: Local wins", { entityType, id: localData.id });
        }
      }
    };
    syncEngine = new SyncEngine();
  }
});

// electron/updater.ts
var updater_exports = {};
__export(updater_exports, {
  setupUpdater: () => setupUpdater
});
function performGracefulQuitAndInstall() {
  import_electron14.app.removeAllListeners("window-all-closed");
  const windows = import_electron14.BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.close();
    }
  });
  try {
    syncEngine.stop();
    closeDb();
  } catch (err) {
    logger.error("Error shutting down resources for auto-update:", err);
  }
  import_electron_updater2.autoUpdater.quitAndInstall(false, true);
}
function setupUpdater(mainWindow2) {
  import_electron_updater2.autoUpdater.logger = logger;
  import_electron_updater2.autoUpdater.autoDownload = true;
  import_electron_updater2.autoUpdater.autoInstallOnAppQuit = true;
  import_electron_updater2.autoUpdater.setFeedURL({
    provider: "generic",
    url: "https://tijaratpro-api-598374253827.asia-south1.run.app/api/v1/updates"
  });
  if (!isUpdaterInitialized) {
    isUpdaterInitialized = true;
    import_electron_updater2.autoUpdater.on("checking-for-update", () => {
      logger.info("Updater: Checking for updates...");
      currentStatus = "checking";
      lastError = null;
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("updater:status", "checking");
      }
    });
    import_electron_updater2.autoUpdater.on("update-available", (info) => {
      logger.info(`Updater: Update available: version ${info.version}`);
      currentStatus = "downloading";
      currentVersion = info.version;
      lastError = null;
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("updater:available", info);
      }
    });
    import_electron_updater2.autoUpdater.on("update-not-available", () => {
      logger.info("Updater: App is up to date.");
      isCheckingOrDownloading = false;
      currentStatus = "up-to-date";
      lastError = null;
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("updater:status", "up-to-date");
      }
    });
    import_electron_updater2.autoUpdater.on("error", (err) => {
      isCheckingOrDownloading = false;
      currentStatus = "error";
      lastError = err.message || "Update check failed";
      logger.error(`Updater Error (App version: ${import_electron14.app.getVersion()}): ${err.message}`);
      if (err.stack) {
        logger.error(`Updater Stack Trace: ${err.stack}`);
      }
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("updater:error", lastError);
      }
    });
    import_electron_updater2.autoUpdater.on("download-progress", (progressObj) => {
      currentStatus = "downloading";
      currentProgress = progressObj;
      const percent = Math.round(progressObj.percent);
      logger.info(`Updater: Downloading update... ${percent}%`);
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("updater:progress", progressObj);
      }
    });
    import_electron_updater2.autoUpdater.on("update-downloaded", (info) => {
      isCheckingOrDownloading = false;
      currentStatus = "downloaded";
      currentVersion = info.version;
      logger.info(`Updater: Update downloaded: version ${info.version}`);
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("updater:downloaded", info);
      }
      import_electron14.dialog.showMessageBox(mainWindow2, {
        type: "info",
        title: "TijaratPro Update Ready",
        message: `A new version (${info.version}) of TijaratPro has been downloaded and is ready to install.`,
        buttons: ["Install Now", "Later"],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) {
          performGracefulQuitAndInstall();
        }
      });
    });
  }
  if (import_electron14.ipcMain.listenerCount("updater:check") > 0) {
    import_electron14.ipcMain.removeHandler("updater:check");
  }
  import_electron14.ipcMain.handle("updater:check", async () => {
    logger.info("Updater: Manual update check requested via IPC");
    if (isCheckingOrDownloading) {
      logger.info("Updater: Update check or download already in progress. Re-using active task.");
      return { status: currentStatus, inProgress: true };
    }
    try {
      isCheckingOrDownloading = true;
      currentStatus = "checking";
      lastError = null;
      return await import_electron_updater2.autoUpdater.checkForUpdatesAndNotify();
    } catch (err) {
      isCheckingOrDownloading = false;
      currentStatus = "error";
      lastError = err.message;
      return { status: "error", error: err.message };
    }
  });
  if (import_electron14.ipcMain.listenerCount("updater:getState") > 0) {
    import_electron14.ipcMain.removeHandler("updater:getState");
  }
  import_electron14.ipcMain.handle("updater:getState", () => {
    return {
      status: currentStatus,
      progress: currentProgress,
      version: currentVersion,
      currentAppVersion: import_electron14.app.getVersion(),
      error: lastError,
      isCheckingOrDownloading
    };
  });
  if (import_electron14.ipcMain.listenerCount("updater:install") > 0) {
    import_electron14.ipcMain.removeHandler("updater:install");
  }
  import_electron14.ipcMain.handle("updater:install", () => {
    logger.info("Updater: Manual update installation requested via IPC");
    performGracefulQuitAndInstall();
  });
}
var import_electron_updater2, import_electron14, isUpdaterInitialized, isCheckingOrDownloading, currentStatus, currentProgress, currentVersion, lastError;
var init_updater = __esm({
  "electron/updater.ts"() {
    "use strict";
    import_electron_updater2 = require("electron-updater");
    import_electron14 = require("electron");
    init_logger();
    init_syncEngine();
    init_db();
    isUpdaterInitialized = false;
    isCheckingOrDownloading = false;
    currentStatus = "idle";
    currentProgress = null;
    currentVersion = null;
    lastError = null;
  }
});

// electron/main.ts
var import_electron15 = require("electron");
var import_path10 = __toESM(require("path"));
var import_url = require("url");
var import_fs4 = __toESM(require("fs"));

// electron/window.ts
var import_electron3 = require("electron");
var import_path2 = __toESM(require("path"));
var import_electron_store2 = __toESM(require("electron-store"));

// electron/services/settingsManager.ts
var import_electron_store = __toESM(require("electron-store"));
var import_electron2 = require("electron");
init_logger();
var defaultSettings = {
  settingsVersion: 1,
  minimizeToTray: false,
  closeToTray: false,
  autoUpdate: true,
  theme: "system",
  language: "en"
};
var migrations = {
  "1.0.0": (store3) => {
    store3.set("settingsVersion", 1);
  }
  // Future versions:
  // '2.0.0': (store: Store<AppSettings>) => {
  //    store.set('settingsVersion', 2);
  //    if (!store.has('newSetting')) store.set('newSetting', true);
  // }
};
var settingsStore;
function initSettings() {
  try {
    settingsStore = new import_electron_store.default({
      name: "tijarat-settings",
      defaults: defaultSettings,
      projectVersion: "1.0.0",
      // Used by electron-store for migrations
      migrations
    });
    logger.info(`[SettingsManager] Initialized. Version: ${settingsStore.get("settingsVersion")}`);
  } catch (err) {
    logger.error("[SettingsManager] Failed to initialize settings store:", err);
    settingsStore = new import_electron_store.default({ defaults: defaultSettings });
  }
  if (!import_electron2.ipcMain.listenerCount("settings:get")) {
    import_electron2.ipcMain.handle("settings:get", () => {
      return settingsStore.store;
    });
  }
  if (!import_electron2.ipcMain.listenerCount("settings:update")) {
    import_electron2.ipcMain.handle("settings:update", (_, newSettings) => {
      try {
        for (const [key, value] of Object.entries(newSettings)) {
          settingsStore.set(key, value);
        }
        logger.info("[SettingsManager] Settings updated:", newSettings);
        return { success: true, settings: settingsStore.store };
      } catch (err) {
        logger.error("[SettingsManager] Failed to update settings:", err);
        return { success: false, error: err.message };
      }
    });
  }
}
function getSetting(key) {
  if (!settingsStore) initSettings();
  return settingsStore.get(key);
}

// electron/window.ts
var store = new import_electron_store2.default({
  name: "window-state",
  defaults: {
    width: 1024,
    height: 768,
    isMaximized: false,
    isFullScreen: false
  }
});
function getInitialWindowState() {
  const savedState = store.store;
  const minWidth = 1024;
  const minHeight = 680;
  let { width, height, x, y, isMaximized, isFullScreen } = savedState;
  if (!width || width < minWidth) width = minWidth;
  if (!height || height < minHeight) height = minHeight;
  if (x !== void 0 && y !== void 0) {
    const displays = import_electron3.screen.getAllDisplays();
    const isVisible = displays.some((display) => {
      const bounds = display.bounds;
      return x + width > bounds.x + 100 && x < bounds.x + bounds.width - 100 && y + height > bounds.y + 100 && y < bounds.y + bounds.height - 100;
    });
    if (!isVisible) {
      const { width: sw, height: sh } = import_electron3.screen.getPrimaryDisplay().workAreaSize;
      width = Math.round(sw * 0.85);
      height = Math.round(sh * 0.9);
      x = void 0;
      y = void 0;
    }
  } else {
    const { width: sw, height: sh } = import_electron3.screen.getPrimaryDisplay().workAreaSize;
    width = Math.round(sw * 0.85);
    height = Math.round(sh * 0.9);
  }
  return { width, height, x, y, isMaximized, isFullScreen };
}
function createWindow() {
  const state = getInitialWindowState();
  const win = new import_electron3.BrowserWindow({
    // ── Size & position ──────────────────────────────────────────────────
    width: state.width,
    height: state.height,
    useContentSize: true,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 680,
    center: state.x === void 0 && state.y === void 0,
    // ── Appearance ───────────────────────────────────────────────────────
    title: "Tijarat Pro \u2013 Admin",
    backgroundColor: "#0a0a0a",
    // matches your dark theme bg
    show: false,
    // avoid flicker; show after ready
    frame: false,
    // fully frameless on Windows/Linux
    titleBarStyle: "hidden",
    // clean, frameless-style look
    trafficLightPosition: { x: 16, y: 16 },
    // macOS traffic lights inset
    icon: import_path2.default.join(__dirname, "../build/icon.png"),
    autoHideMenuBar: true,
    // ── Security ─────────────────────────────────────────────────────────
    webPreferences: {
      // Point to the compiled preload script
      preload: import_path2.default.join(__dirname, "preload.js"),
      // Security hardening
      contextIsolation: true,
      // renderer cannot access Node APIs
      nodeIntegration: false,
      // no Node in renderer
      sandbox: true,
      // OS-level sandbox
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !import_electron3.app.isPackaged,
      // Disable features the admin panel doesn't need
      spellcheck: false
    }
  });
  win.once("ready-to-show", () => {
    win.show();
    if (state.isFullScreen) {
      win.setFullScreen(true);
    } else if (state.isMaximized) {
      win.maximize();
    }
  });
  let saveTimeout = null;
  const saveState = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!win.isDestroyed()) {
        const isFullScreen = win.isFullScreen();
        const isMaximized = win.isMaximized();
        if (isFullScreen) {
          store.set("isFullScreen", true);
        } else if (isMaximized) {
          store.set("isMaximized", true);
          store.set("isFullScreen", false);
        } else {
          const bounds = win.getBounds();
          store.set("isMaximized", false);
          store.set("isFullScreen", false);
          store.set("width", bounds.width);
          store.set("height", bounds.height);
          store.set("x", bounds.x);
          store.set("y", bounds.y);
        }
      }
    }, 500);
  };
  win.on("resize", saveState);
  win.on("move", saveState);
  win.on("maximize", saveState);
  win.on("unmaximize", saveState);
  win.on("enter-full-screen", saveState);
  win.on("leave-full-screen", saveState);
  let isQuitting = false;
  import_electron3.app.on("before-quit", () => {
    isQuitting = true;
  });
  win.on("close", (event) => {
    if (!isQuitting && getSetting("closeToTray")) {
      event.preventDefault();
      win.hide();
      return;
    }
    if (saveTimeout) clearTimeout(saveTimeout);
    if (!win.isDestroyed()) {
      const isFullScreen = win.isFullScreen();
      const isMaximized = win.isMaximized();
      if (isFullScreen) {
        store.set("isFullScreen", true);
      } else if (isMaximized) {
        store.set("isMaximized", true);
        store.set("isFullScreen", false);
      } else {
        const bounds = win.getBounds();
        store.set("isMaximized", false);
        store.set("isFullScreen", false);
        store.set("width", bounds.width);
        store.set("height", bounds.height);
        store.set("x", bounds.x);
        store.set("y", bounds.y);
      }
    }
  });
  win.on("minimize", (event) => {
    if (getSetting("minimizeToTray")) {
      event.preventDefault();
      win.hide();
    }
  });
  return win;
}

// electron/security.ts
var import_electron4 = require("electron");
init_logger();
var isDev2 = !import_electron4.app.isPackaged;
var CSP = isDev2 ? [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https:",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'self'"
].join("; ") : [
  "default-src 'self' app:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Next.js App Router static exports require unsafe-inline/eval for static bundle evaluation & hydration
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: app:",
  "connect-src 'self' app: http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https:",
  "media-src 'self' app:",
  "object-src 'none'",
  "frame-src 'none'"
].join("; ");
var ALLOWED_PERMISSIONS = /* @__PURE__ */ new Set([
  "clipboard-read",
  "clipboard-write",
  "notifications"
]);
function setupSecurity() {
  import_electron4.app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
      const allowed = navigationUrl.startsWith("http://localhost:3000") || navigationUrl.startsWith("http://127.0.0.1:3000") || navigationUrl.startsWith("file://") || navigationUrl.startsWith("app://");
      if (!allowed) {
        logger.warn(`[security] Blocked navigation to: ${navigationUrl}`);
        event.preventDefault();
        import_electron4.shell.openExternal(navigationUrl);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      logger.warn(`[security] Blocked window.open for: ${url}`);
      import_electron4.shell.openExternal(url);
      return { action: "deny" };
    });
  });
  import_electron4.app.whenReady().then(() => {
    const ses = import_electron4.session.defaultSession;
    ses.webRequest.onHeadersReceived((details, callback) => {
      if (isDev2) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [CSP]
        }
      });
    });
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      const granted = ALLOWED_PERMISSIONS.has(permission);
      if (!granted) {
        logger.warn(`[security] Permission denied: ${permission}`);
      }
      callback(granted);
    });
    ses.setPermissionCheckHandler((_webContents, permission) => {
      return ALLOWED_PERMISSIONS.has(permission);
    });
  });
}

// electron/main.ts
init_db();

// electron/ipc/handlers.ts
var import_electron10 = require("electron");
var import_path6 = __toESM(require("path"));

// electron/db/queries.ts
init_db();
init_memoryCache();
var import_uuid = require("uuid");
init_syncEngine();
init_logger();
function mutateEntity(entityType, operation, payload) {
  const timestamp = Date.now();
  const opId = (0, import_uuid.v7)();
  if (operation === "CREATE") {
    payload.version = 1;
  } else if (operation === "UPDATE") {
    payload.version = (payload.version || 1) + 1;
  }
  payload.updatedAt = timestamp;
  const transaction = db2.transaction(() => {
    if (operation === "CREATE") {
      const cols = Object.keys(payload).join(", ");
      const placeholders = Object.keys(payload).map((k) => `@${k}`).join(", ");
      const stmt = db2.prepare(`INSERT INTO ${entityType} (${cols}) VALUES (${placeholders})`);
      stmt.run(payload);
    } else if (operation === "UPDATE") {
      const updates = Object.keys(payload).filter((k) => k !== "id").map((k) => `${k} = @${k}`).join(", ");
      const stmt = db2.prepare(`UPDATE ${entityType} SET ${updates} WHERE id = @id`);
      stmt.run(payload);
    } else if (operation === "DELETE") {
      const stmt = db2.prepare(`DELETE FROM ${entityType} WHERE id = ?`);
      stmt.run(payload.id);
    }
    const queueStmt = db2.prepare(`
      INSERT INTO sync_queue (id, entity_type, operation, payload, timestamp) 
      VALUES (@id, @entity_type, @operation, @payload, @timestamp)
    `);
    queueStmt.run({
      id: opId,
      entity_type: entityType,
      operation,
      payload: JSON.stringify(payload),
      timestamp
    });
    const logStmt = db2.prepare(`
      INSERT INTO operation_log (id, entity_type, operation, payload, timestamp, status)
      VALUES (@id, @entity_type, @operation, @payload, @timestamp, 'pending')
    `);
    logStmt.run({
      id: opId,
      entity_type: entityType,
      operation,
      payload: JSON.stringify(payload),
      timestamp
    });
    const auditStmt = db2.prepare(`
      INSERT INTO audit_log (id, tenant_id, shop_id, user_id, action, entity, entity_id, timestamp, metadata)
      VALUES (@id, @tenant_id, @shop_id, @user_id, @action, @entity, @entity_id, @timestamp, @metadata)
    `);
    auditStmt.run({
      id: (0, import_uuid.v7)(),
      tenant_id: payload.tenantId || payload.tenant_id || "system",
      shop_id: payload.shopId || payload.shop_id || "system",
      user_id: payload.userId || payload.user_id || "system",
      action: operation,
      entity: entityType,
      entity_id: payload.id || opId,
      timestamp,
      metadata: JSON.stringify(payload)
    });
  });
  transaction();
  if (operation === "DELETE") {
    memoryCache.delete(entityType, payload.id);
  } else {
    memoryCache.set(entityType, payload.id, payload);
  }
  syncEngine.triggerSync().catch(logger.error);
  return { success: true, opId };
}
function queryEntity(entityType, id) {
  const cached = memoryCache.get(entityType, id);
  if (cached) return cached;
  const stmt = db2.prepare(`SELECT * FROM ${entityType} WHERE id = ?`);
  const result = stmt.get(id);
  if (result) {
    memoryCache.set(entityType, id, result);
  }
  return result;
}
function queryAll(entityType) {
  const stmt = db2.prepare(`SELECT * FROM ${entityType}`);
  return stmt.all();
}

// electron/auth/storage.ts
var import_electron9 = require("electron");
var import_electron_store4 = __toESM(require("electron-store"));
init_logger();
var store2 = new import_electron_store4.default({
  name: "auth-tokens"
});
function setToken(key, token) {
  if (import_electron9.safeStorage.isEncryptionAvailable()) {
    const encrypted = import_electron9.safeStorage.encryptString(token);
    store2.set(key, encrypted.toString("base64"));
  } else {
    store2.set(key, Buffer.from(token, "utf-8").toString("base64"));
  }
}
function getToken(key) {
  const data = store2.get(key);
  if (!data) return null;
  try {
    if (import_electron9.safeStorage.isEncryptionAvailable()) {
      return import_electron9.safeStorage.decryptString(Buffer.from(data, "base64"));
    } else {
      return Buffer.from(data, "base64").toString("utf-8");
    }
  } catch (err) {
    logger.error("[safeStorage] Failed to decrypt token", err);
    return null;
  }
}
function clearToken(key) {
  store2.delete(key);
}

// electron/ipc/handlers.ts
init_backupManager();
init_config();

// electron/ipc/validation.ts
var import_zod = require("zod");
init_logger();
var UserSchema = import_zod.z.object({
  id: import_zod.z.string().min(1),
  name: import_zod.z.string().min(1).optional(),
  email: import_zod.z.string().email().optional(),
  updatedAt: import_zod.z.number().optional(),
  version: import_zod.z.number().optional()
}).strict();
var ProductSchema = import_zod.z.object({
  id: import_zod.z.string().min(1),
  name: import_zod.z.string().min(1).optional(),
  price: import_zod.z.number().optional(),
  stock: import_zod.z.number().optional(),
  updatedAt: import_zod.z.number().optional(),
  version: import_zod.z.number().optional()
}).strict();
var OrderSchema = import_zod.z.object({
  id: import_zod.z.string().min(1),
  customerId: import_zod.z.string().optional().nullable(),
  total: import_zod.z.number().optional(),
  status: import_zod.z.string().optional(),
  items: import_zod.z.string().optional(),
  // usually JSON stringified
  paymentMethod: import_zod.z.string().optional().nullable(),
  discount: import_zod.z.number().optional().nullable(),
  updatedAt: import_zod.z.number().optional(),
  version: import_zod.z.number().optional()
}).strict();
function validatePayload(entityType, operation, payload) {
  if (operation === "DELETE") {
    const deleteSchema = import_zod.z.object({ id: import_zod.z.string().min(1) }).strict();
    return deleteSchema.parse(payload);
  }
  switch (entityType) {
    case "users":
      return UserSchema.parse(payload);
    case "products":
      return ProductSchema.parse(payload);
    case "orders": {
      const result = OrderSchema.safeParse(payload);
      if (!result.success) {
        logger.error("[IPC Validation Error] orders:", JSON.stringify(result.error.format(), null, 2));
        logger.error("VALIDATING ORDER PAYLOAD:", JSON.stringify(payload, null, 2));
        throw new Error("Validation failed for orders: " + result.error.message);
      }
      return result.data;
    }
    default:
      throw new Error(`[IPC Validation] Unknown entity type: ${entityType}`);
  }
}

// electron/ipc/handlers.ts
init_logger();
function handleIpc(channel, handler) {
  import_electron10.ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      logger.error(`[IPC Error] Channel: ${channel}`, {
        message: error.message,
        stack: error.stack,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      throw error;
    }
  });
}
function setupIpcHandlers() {
  handleIpc("db:mutate", (_event, entityType, operation, payload) => {
    let validatedPayload;
    try {
      validatedPayload = validatePayload(entityType, operation, payload);
    } catch (err) {
      throw new Error(`[IPC Security] Invalid payload for ${entityType} ${operation}`);
    }
    try {
      return mutateEntity(entityType, operation, validatedPayload);
    } catch (err) {
      throw new Error(`Database mutation failed: ${err.message}`);
    }
  });
  handleIpc("db:query", (_event, entityType, id) => {
    return queryEntity(entityType, id);
  });
  handleIpc("db:queryAll", (_event, entityType) => {
    return queryAll(entityType);
  });
  handleIpc("auth:setToken", (_event, key, token) => {
    setToken(key, token);
  });
  handleIpc("auth:getToken", (_event, key) => {
    return getToken(key);
  });
  handleIpc("auth:clearToken", (_event, key) => {
    clearToken(key);
  });
  handleIpc("db:backup", async () => {
    return createBackup();
  });
  handleIpc("db:restore", async (_event, backupFilePath) => {
    return restoreDatabase(backupFilePath);
  });
  handleIpc("db:get-backup-status", () => {
    return getBackupStatus();
  });
  handleIpc("db:set-backup-path", (_event, backupPath) => {
    configStore.set("backupPath", backupPath);
    return { success: true };
  });
  handleIpc("db:open-backup-folder", () => {
    openBackupFolder();
  });
  handleIpc("app:minimize", () => {
    const win = import_electron10.BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });
  handleIpc("app:maximize", () => {
    const win = import_electron10.BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  handleIpc("app:close", () => {
    const win = import_electron10.BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });
  handleIpc("app:relaunch", () => {
    import_electron10.app.relaunch();
    import_electron10.app.exit(0);
  });
  handleIpc("app:openLogs", () => {
    import_electron10.shell.openPath(import_path6.default.join(import_electron10.app.getPath("userData"), "logs"));
  });
  handleIpc("app:getSystemInfo", () => {
    return {
      appVersion: import_electron10.app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : process.memoryUsage()
    };
  });
}

// electron/main.ts
init_syncEngine();

// electron/crashHandler.ts
var import_electron11 = require("electron");
var import_path7 = __toESM(require("path"));
var import_electron_store5 = __toESM(require("electron-store"));
init_logger();
init_db();
var crashStore = new import_electron_store5.default({ name: "crash-state", defaults: { startupCrashes: 0, gpuCrashes: 0 } });
var isDev3 = !import_electron11.app.isPackaged;
var shuttingDown = false;
var appReadyForUse = false;
function setAppReadyForUse(ready) {
  appReadyForUse = ready;
}
function setupCrashHandler() {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    gracefulShutdown("Uncaught Exception", error);
  });
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    gracefulShutdown("Unhandled Rejection", reason);
  });
  import_electron11.app.on("render-process-gone", (event, webContents, details) => {
    logger.error(`Render process gone. Reason: ${details.reason}, Exit code: ${details.exitCode}`);
    if (details.reason === "crashed" || details.reason === "oom") {
      const win = import_electron11.BrowserWindow.fromWebContents(webContents);
      if (win && !win.isDestroyed()) {
        logger.info("Attempting to load error.html in crashed renderer...");
        win.loadFile(import_path7.default.join(__dirname, "../electron/error.html")).catch((err) => {
          gracefulShutdown(`Renderer Process Crashed (${details.reason})`, err);
        });
      } else {
        gracefulShutdown(`Renderer Process Crashed (${details.reason})`);
      }
    }
  });
  import_electron11.app.on("child-process-gone", (event, details) => {
    logger.error(`Child process gone. Type: ${details.type}, Reason: ${details.reason}, Name: ${details.name}`);
    if (details.type === "GPU" && details.reason === "crashed") {
      logger.error("GPU process crashed! This might indicate a graphics driver issue.");
      const gpuCrashes = crashStore.get("gpuCrashes") + 1;
      crashStore.set("gpuCrashes", gpuCrashes);
    }
  });
}
function gracefulShutdown(reason, error) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Initiating graceful shutdown due to: ${reason}`);
  try {
    logger.info("Closing database connections safely...");
    closeDb();
  } catch (err) {
    logger.error("Error while closing database during shutdown:", err);
  }
  if (!isDev3) {
    const isStartup = !appReadyForUse;
    if (isStartup) {
      const crashes = crashStore.get("startupCrashes") + 1;
      crashStore.set("startupCrashes", crashes);
      if (crashes >= 3) {
        logger.warn("Safe Mode activated due to repeated startup crashes.");
      }
    }
    const logPath2 = import_path7.default.join(import_electron11.app.getPath("userData"), "logs", "main.log");
    const response = import_electron11.dialog.showMessageBoxSync({
      type: "error",
      title: "Unexpected Error",
      message: "TijaratPro encountered an unexpected error.",
      detail: "The application needs to close safely.\n\nPlease restart the application.\n\nIf the issue continues, contact support and send the log file.",
      buttons: ["Restart App", "Copy Error Details", "Open Logs Folder", "View Logs", "Exit"],
      defaultId: 0,
      cancelId: 4,
      noLink: true
    });
    if (response === 1) {
      const details = [
        `App Version: ${import_electron11.app.getVersion()}`,
        `Electron Version: ${process.versions.electron}`,
        `Node Version: ${process.versions.node}`,
        `OS: ${process.platform} ${process.arch}`,
        `Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}`,
        `Log Path: ${logPath2}`,
        `
Reason: ${reason}`
      ];
      if (error) {
        if (error.name) details.push(`Error Name: ${error.name}`);
        if (error.message) details.push(`Message: ${error.message}`);
        if (error.stack) details.push(`Stack Trace:
${error.stack}`);
        else {
          try {
            details.push(`Error Obj: ${JSON.stringify(error, null, 2)}`);
          } catch {
            details.push(`Error Obj: ${String(error)}`);
          }
        }
      }
      import_electron11.clipboard.writeText(details.join("\n"));
    } else if (response === 2) {
      import_electron11.shell.showItemInFolder(logPath2);
    } else if (response === 3) {
      import_electron11.shell.openPath(logPath2);
    }
    if (response === 0) {
      import_electron11.app.relaunch();
      import_electron11.app.exit(0);
    }
  }
  logger.info("Closing browser windows...");
  const windows = import_electron11.BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  });
  try {
    if (logger.transports?.file?.getFile()?.clear) {
    }
  } catch (err) {
  }
  logger.info("Exiting application...");
  import_electron11.app.exit(0);
}

// electron/main.ts
init_logger();

// electron/splash.ts
var import_electron12 = require("electron");
var import_path8 = __toESM(require("path"));
var splashHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      background-color: #0a0a0a; 
      color: #fff; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      margin: 0; 
      user-select: none; 
      overflow: hidden; 
      -webkit-app-region: drag;
    }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px; }
    p { font-size: 14px; color: #888; margin-top: 16px; transition: opacity 0.2s; }
    .spinner { 
      width: 36px; height: 36px; 
      border: 3px solid rgba(255,255,255,0.1); 
      border-radius: 50%; 
      border-top-color: #0070f3; 
      animation: spin 1s ease-in-out infinite; 
      margin-bottom: 20px; 
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h1>Tijarat Pro</h1>
  <p id="status">Starting...</p>
</body>
</html>
`;
function createSplashWindow() {
  const win = new import_electron12.BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0a",
    alwaysOnTop: true,
    show: false,
    center: true,
    resizable: false,
    icon: import_path8.default.join(__dirname, "../build/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(splashHtml);
  win.loadURL(dataUri);
  win.once("ready-to-show", () => {
    win.show();
  });
  return win;
}
function updateSplashStatus(win, status) {
  if (win && !win.isDestroyed()) {
    win.webContents.executeJavaScript(`
      document.getElementById('status').innerText = ${JSON.stringify(status)};
    `).catch(() => {
    });
  }
}

// electron/tray.ts
var import_electron13 = require("electron");
var import_path9 = __toESM(require("path"));
init_logger();
var import_electron_updater = require("electron-updater");
var tray = null;
function setupTray(mainWindow2) {
  if (tray) return;
  const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconPath = import_electron13.app.isPackaged ? import_path9.default.join(process.resourcesPath, "app.asar", "build", iconName) : import_path9.default.join(__dirname, "../build", iconName);
  try {
    tray = new import_electron13.Tray(iconPath);
    tray.setToolTip("TijaratPro");
    const contextMenu = import_electron13.Menu.buildFromTemplate([
      {
        label: "Show TijaratPro",
        click: () => {
          if (mainWindow2.isMinimized()) mainWindow2.restore();
          if (!mainWindow2.isVisible()) mainWindow2.show();
          mainWindow2.focus();
        }
      },
      {
        label: "Hide TijaratPro",
        click: () => {
          mainWindow2.hide();
        }
      },
      { type: "separator" },
      {
        label: "Check for Updates",
        click: () => {
          if (mainWindow2 && !mainWindow2.isDestroyed()) {
            if (mainWindow2.isMinimized()) mainWindow2.restore();
            if (!mainWindow2.isVisible()) mainWindow2.show();
            mainWindow2.focus();
            mainWindow2.webContents.send("updater:open-modal");
          }
          import_electron_updater.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            logger.error(`Tray update check failed: ${err}`);
          });
        }
      },
      {
        label: "Open Logs Folder",
        click: () => {
          import_electron13.shell.openPath(import_path9.default.join(import_electron13.app.getPath("userData"), "logs"));
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          import_electron13.app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (mainWindow2.isVisible()) {
        mainWindow2.hide();
      } else {
        if (mainWindow2.isMinimized()) mainWindow2.restore();
        mainWindow2.show();
        mainWindow2.focus();
      }
    });
    logger.info("[Tray] System tray initialized.");
  } catch (error) {
    logger.error("[Tray] Failed to initialize tray:", error);
  }
}
function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

// electron/main.ts
init_notifications();
init_backupManager();
var import_electron_store6 = __toESM(require("electron-store"));
import_electron15.protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);
var isDev4 = !import_electron15.app.isPackaged;
var NEXT_DEV_URL = "http://127.0.0.1:3000";
var mainWindow = null;
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    import_electron15.app.setAsDefaultProtocolClient("tijaratpro", process.execPath, [import_path10.default.resolve(process.argv[1])]);
  }
} else {
  import_electron15.app.setAsDefaultProtocolClient("tijaratpro");
}
var gotTheLock = import_electron15.app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.info("Another instance is already running. Quitting this instance.");
  import_electron15.app.quit();
} else {
  import_electron15.app.on("second-instance", (event, commandLine, workingDirectory) => {
    logger.info("Second instance launched. Focusing existing window.");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const url = commandLine.find((arg) => arg.startsWith("tijaratpro://"));
      if (url) {
        logger.info(`Received deep link: ${url}`);
        mainWindow.webContents.send("app:deep-link", url);
      }
      const filePath = commandLine.find((arg) => arg.endsWith(".tijarat") || arg.endsWith(".tpbackup"));
      if (filePath) {
        logger.info(`Received file to open: ${filePath}`);
        mainWindow.webContents.send("app:open-file", filePath);
      }
    }
  });
}
import_electron15.app.on("open-url", (event, url) => {
  event.preventDefault();
  logger.info(`Received deep link (macOS): ${url}`);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send("app:deep-link", url);
  } else {
    import_electron15.app.once("ready", () => {
    });
  }
});
import_electron15.app.on("open-file", (event, filePath) => {
  event.preventDefault();
  logger.info(`Received file to open (macOS): ${filePath}`);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send("app:open-file", filePath);
  }
});
var crashStore2 = new import_electron_store6.default({ name: "crash-state", defaults: { startupCrashes: 0, gpuCrashes: 0 } });
if (crashStore2.get("gpuCrashes") >= 3) {
  import_electron15.app.disableHardwareAcceleration();
}
import_electron15.app.whenReady().then(async () => {
  const startupStart = performance.now();
  import_electron15.protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let decodedPath = decodeURIComponent(url.pathname);
    if (decodedPath === "/" || decodedPath === "") {
      decodedPath = "/index.html";
    }
    const outDir = import_path10.default.normalize(import_path10.default.join(__dirname, "../out"));
    let targetPath = import_path10.default.normalize(import_path10.default.join(outDir, decodedPath));
    if (!targetPath.startsWith(outDir)) {
      logger.warn(`[protocol] Blocked path traversal attempt: ${targetPath}`);
      return new Response("Access Denied", { status: 403 });
    }
    if (!import_fs4.default.existsSync(targetPath)) {
      if (import_fs4.default.existsSync(`${targetPath}.html`)) {
        targetPath = `${targetPath}.html`;
      } else if (import_fs4.default.existsSync(import_path10.default.join(targetPath, "index.html"))) {
        targetPath = import_path10.default.join(targetPath, "index.html");
      } else {
        targetPath = import_path10.default.join(outDir, "index.html");
      }
    }
    return import_electron15.net.fetch((0, import_url.pathToFileURL)(targetPath).toString());
  });
  const sysMem = process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : null;
  const cpus = require("os").cpus();
  const displays = import_electron15.screen.getAllDisplays();
  const primaryDisplay = import_electron15.screen.getPrimaryDisplay();
  const gpuStatus = import_electron15.app.getGPUFeatureStatus();
  logger.info(`GPU Status (2D Canvas): ${gpuStatus["2d_canvas"]}, (WebGL): ${gpuStatus.webgl}`);
  logger.info(`
--- Electron Health Report ---
Version: ${import_electron15.app.getVersion()}
Electron: ${process.versions.electron}
Node: ${process.versions.node}
OS: ${process.platform} ${process.arch}
CPU: ${cpus.length > 0 ? cpus[0].model : "Unknown"} (${cpus.length} cores)
RAM: ${sysMem ? `${Math.round(sysMem.total / 1024)}MB Total, ${Math.round(sysMem.free / 1024)}MB Free` : "Unknown"}
GPU: 2D Canvas=${gpuStatus["2d_canvas"]}, WebGL=${gpuStatus.webgl}
Locale: ${import_electron15.app.getLocale()}
Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
Displays: ${displays.length} connected
Resolution: ${primaryDisplay.size.width}x${primaryDisplay.size.height} (Primary)
Scale Factor: ${primaryDisplay.scaleFactor}
SQLite Path: ${import_path10.default.join(import_electron15.app.getPath("userData"), "tijarat_local.db")}
------------------------------
`);
  setupCrashHandler();
  initSettings();
  setupNotifications();
  if (!isDev4) {
    import_electron15.Menu.setApplicationMenu(null);
  }
  setupSecurity();
  const splash = createSplashWindow();
  updateSplashStatus(splash, "Preparing workspace...");
  let startupTimeout = null;
  if (!isDev4) {
    startupTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) return;
      const response = import_electron15.dialog.showMessageBoxSync({
        type: "warning",
        title: "Startup Taking Too Long",
        message: "TijaratPro is taking longer than expected to start.",
        detail: "Would you like to continue waiting or restart the application?",
        buttons: ["Continue Waiting", "Restart Application", "Exit"],
        defaultId: 0,
        cancelId: 2
      });
      if (response === 1) {
        import_electron15.app.relaunch();
        import_electron15.app.exit(0);
      } else if (response === 2) {
        import_electron15.app.quit();
      }
    }, 3e4);
  }
  updateSplashStatus(splash, "Loading local database...");
  initDb();
  setupIpcHandlers();
  updateSplashStatus(splash, "Starting services...");
  syncEngine.start();
  mainWindow = createWindow();
  logger.info("Main window created");
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logger.error(`[renderer] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      logger.warn(`[renderer console] ${message} (${sourceId}:${line})`);
    }
  });
  if (isDev4) {
    let loaded = false;
    for (let i = 0; i < 30; i++) {
      try {
        await mainWindow.loadURL(NEXT_DEV_URL);
        loaded = true;
        break;
      } catch (err) {
        updateSplashStatus(splash, `Waiting for Next.js... (${i + 1}/30)`);
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
    if (!loaded) {
      logger.error("[electron] Failed to connect to Next.js dev server.");
    }
    if (process.env.OPEN_DEVTOOLS !== "false") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    updateSplashStatus(splash, "Loading TijaratPro...");
    let loadRetries = 0;
    const maxRetries = 2;
    const loadDashboard = async () => {
      try {
        await mainWindow.loadURL("app://localhost");
      } catch (err) {
        logger.error(`Failed to load app://localhost: ${err}`);
        if (loadRetries < maxRetries) {
          loadRetries++;
          logger.info(`Retrying load (${loadRetries}/${maxRetries})...`);
          setTimeout(loadDashboard, 1e3);
        } else {
          import_electron15.dialog.showErrorBox(
            "Application Load Error",
            "TijaratPro failed to load the dashboard. Please restart the application."
          );
          import_electron15.app.quit();
        }
      }
    };
    loadDashboard();
    if (!isDev4) {
      const { setupUpdater: setupUpdater2 } = (init_updater(), __toCommonJS(updater_exports));
      setupUpdater2(mainWindow);
      const { autoUpdater: autoUpdater3 } = require("electron-updater");
      setTimeout(() => {
        autoUpdater3.checkForUpdatesAndNotify().catch((err) => {
          logger.error(`Automatic update check failed: ${err}`);
        });
      }, 3e3);
    }
    if (process.env.OPEN_DEVTOOLS === "true") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      mainWindow.webContents.on("devtools-opened", () => {
        mainWindow?.webContents.closeDevTools();
      });
      mainWindow.webContents.on("before-input-event", (event, input) => {
        const isF12 = input.key === "F12";
        const isInspect = input.control && input.shift && input.key.toLowerCase() === "i";
        const isMacInspect = input.meta && input.alt && input.key.toLowerCase() === "i";
        const isF5 = input.key === "F5";
        const isCtrlR = (input.control || input.meta) && input.key.toLowerCase() === "r";
        if (isF12 || isInspect || isMacInspect || isF5 || isCtrlR) {
          event.preventDefault();
        }
      });
    }
  }
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    logger.error(`Render process gone: ${details.reason}`);
    const response = import_electron15.dialog.showMessageBoxSync(mainWindow, {
      type: "error",
      title: "Application Crash",
      message: "The application renderer process has crashed.",
      buttons: ["Restart", "Quit"]
    });
    if (response === 0) {
      import_electron15.app.relaunch();
      import_electron15.app.quit();
    } else {
      import_electron15.app.quit();
    }
  });
  mainWindow.webContents.on("unresponsive", () => {
    logger.error("Render process is unresponsive");
  });
  mainWindow.once("ready-to-show", () => {
    if (startupTimeout) clearTimeout(startupTimeout);
    mainWindow.setOpacity(0);
    mainWindow.show();
    const FADE_DURATION = 200;
    const FADE_INTERVAL = 20;
    const FADE_STEP = FADE_INTERVAL / FADE_DURATION;
    let splashOpacity = 1;
    let mainOpacity = 0;
    import_electron15.app.once("before-quit", () => {
      if (startupTimeout) clearTimeout(startupTimeout);
      if (fadeInterval) clearInterval(fadeInterval);
      destroyTray();
    });
    const fadeInterval = setInterval(() => {
      splashOpacity -= FADE_STEP;
      mainOpacity += FADE_STEP;
      if (!splash.isDestroyed()) splash.setOpacity(Math.max(0, splashOpacity));
      if (!mainWindow.isDestroyed()) mainWindow.setOpacity(Math.min(1, mainOpacity));
      if (splashOpacity <= 0) {
        clearInterval(fadeInterval);
        if (!splash.isDestroyed()) splash.destroy();
        if (!mainWindow.isDestroyed()) {
          mainWindow.setOpacity(1);
          logger.info(`Startup completed in ${Math.round(performance.now() - startupStart)} ms`);
          crashStore2.set("startupCrashes", 0);
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              crashStore2.set("gpuCrashes", 0);
              logger.info("GPU stability threshold reached. Crash counter reset.");
            }
          }, 5 * 60 * 1e3);
          setAppReadyForUse(true);
          setupTray(mainWindow);
          setTimeout(() => {
            initBackupScheduler();
          }, 5e3);
        }
      }
    }, FADE_INTERVAL);
  });
  import_electron15.app.on("activate", () => {
    if (import_electron15.BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});
import_electron15.app.on("window-all-closed", () => {
  logger.info("All windows closed.");
  if (process.platform !== "darwin") {
    import_electron15.app.quit();
  }
});
import_electron15.app.on("before-quit", () => {
  logger.info("App before-quit fired.");
});
import_electron15.app.on("will-quit", () => {
  logger.info("App will-quit fired.");
});
import_electron15.app.on("quit", () => {
  logger.info("App quit fired.");
});
import_electron15.ipcMain.handle("app:getInfo", () => ({
  version: import_electron15.app.getVersion(),
  name: import_electron15.app.getName(),
  isDev: isDev4,
  platform: process.platform
}));
import_electron15.ipcMain.handle("app:quit", () => {
  import_electron15.app.quit();
});
import_electron15.ipcMain.handle("app:openExternal", (_event, url) => {
  const safeUrl = new URL(url);
  if (safeUrl.protocol === "https:" || safeUrl.protocol === "http:") {
    import_electron15.shell.openExternal(url);
  }
});
//# sourceMappingURL=main.js.map