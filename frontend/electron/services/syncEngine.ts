import { db } from '../db/index';
import { api } from './api';
import { syncLogger } from './logger';
import { memoryCache } from '../cache/memoryCache';

class SyncEngine {
  private isOnline = true;
  private isSyncing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    // Do NOT auto-start here — main.ts must call start() after initDb()
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

  setOnlineStatus(status: boolean) {
    this.isOnline = status;
    if (this.isOnline) {
      this.triggerSync();
    }
  }

  startPolling() {
    this.timer = setInterval(() => {
      this.triggerSync();
    }, 30000); // 30 seconds fallback
  }

  // Event-driven trigger
  async triggerSync() {
    if (!this.isOnline) return;
    
    // Mutex to prevent duplicate sync execution
    if (this.isSyncing) {
      syncLogger.info('Sync already running, skipping trigger.');
      return;
    }
    
    this.isSyncing = true;
    try {
      await this.processQueue();
    } catch (error) {
      syncLogger.error('Sync failed', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async processQueue() {
    const queueStmt = db.prepare(`SELECT * FROM sync_queue ORDER BY timestamp ASC LIMIT 50`);
    const pendingItems = queueStmt.all() as any[];

    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      const payload = JSON.parse(item.payload);
      
      try {
        const result = await api.syncEntity(item.entity_type, item.operation, payload);
        
        // 5. Server reconciliation response (Server must return canonical object)
        if (result.success && result.data) {
          const canonicalData = result.data; // Server's source of truth

          // If operation was not DELETE, update local DB and Cache with canonical data
          if (item.operation !== 'DELETE') {
             const updates = Object.keys(canonicalData).filter(k => k !== 'id').map(k => `${k} = @${k}`).join(', ');
             const stmt = db.prepare(`UPDATE ${item.entity_type} SET ${updates} WHERE id = @id`);
             stmt.run(canonicalData);
             memoryCache.set(item.entity_type, canonicalData.id, canonicalData);
          }

          this.markSynced(item.id);
        } else if (result.conflict && result.serverData) {
          this.resolveConflict(item.entity_type, payload, result.serverData);
          this.markSynced(item.id); // Conflict resolved, remove from queue
        }
      } catch (error: any) {
        syncLogger.error(`Failed to sync item ${item.id}`, error);
        // Exponential backoff or max retries can be tracked in operation_log
        this.markFailed(item.id);
      }
    }
  }

  private markSynced(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(id);
      db.prepare(`UPDATE operation_log SET status = 'synced' WHERE id = ?`).run(id);
    });
    transaction();
    syncLogger.info(`Successfully synced item`, { id });
  }

  private markFailed(id: string) {
    db.prepare(`UPDATE operation_log SET status = 'failed' WHERE id = ?`).run(id);
  }

  private resolveConflict(entityType: string, localData: any, serverData: any) {
    // 4. Strong Conflict Resolution (version + timestamp check)
    // Server wins if its version is strictly greater, or if versions match but it's newer
    const serverWins = serverData.version > localData.version || 
      (serverData.version === localData.version && serverData.updatedAt > localData.updatedAt);

    if (serverWins) {
      syncLogger.info('Conflict resolved: Server wins', { entityType, id: localData.id });
      
      // Update local DB to match canonical server state
      const updates = Object.keys(serverData).filter(k => k !== 'id').map(k => `${k} = @${k}`).join(', ');
      const stmt = db.prepare(`UPDATE ${entityType} SET ${updates} WHERE id = @id`);
      stmt.run(serverData);
      
      // Update Cache safely
      memoryCache.set(entityType, serverData.id, serverData);
    } else {
      syncLogger.info('Conflict resolved: Local wins', { entityType, id: localData.id });
      // In a full implementation, we might requeue the local item as an UPDATE
    }
  }
}

export const syncEngine = new SyncEngine();
