import { db } from './index';
import { memoryCache } from '../cache/memoryCache';
import { v7 as uuidv7 } from 'uuid';
import { syncEngine } from '../services/syncEngine';
import { logger } from '../logger';

// Abstracted mutation that handles Cache -> DB -> Queue -> Log
export function mutateEntity(entityType: string, operation: 'CREATE' | 'UPDATE' | 'DELETE', payload: any) {
  const timestamp = Date.now();
  const opId = uuidv7();

  // Ensure version is present and incremented
  if (operation === 'CREATE') {
    payload.version = 1;
  } else if (operation === 'UPDATE') {
    // We assume the payload includes the previous version, increment it.
    payload.version = (payload.version || 1) + 1;
  }
  payload.updatedAt = timestamp;

  // Phase 1: Atomic Database Write
  const transaction = db.transaction(() => {
    // 1. Update Local DB
    if (operation === 'CREATE') {
      const cols = Object.keys(payload).join(', ');
      const placeholders = Object.keys(payload).map(k => `@${k}`).join(', ');
      const stmt = db.prepare(`INSERT INTO ${entityType} (${cols}) VALUES (${placeholders})`);
      stmt.run(payload);
    } else if (operation === 'UPDATE') {
      const updates = Object.keys(payload).filter(k => k !== 'id').map(k => `${k} = @${k}`).join(', ');
      const stmt = db.prepare(`UPDATE ${entityType} SET ${updates} WHERE id = @id`);
      stmt.run(payload);
    } else if (operation === 'DELETE') {
      const stmt = db.prepare(`DELETE FROM ${entityType} WHERE id = ?`);
      stmt.run(payload.id);
    }

    // 2. Insert into sync_queue
    const queueStmt = db.prepare(`
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

    // 3. Insert into operation_log
    const logStmt = db.prepare(`
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

    // 4. Insert into audit_log
    const auditStmt = db.prepare(`
      INSERT INTO audit_log (id, tenant_id, shop_id, user_id, action, entity, entity_id, timestamp, metadata)
      VALUES (@id, @tenant_id, @shop_id, @user_id, @action, @entity, @entity_id, @timestamp, @metadata)
    `);
    auditStmt.run({
      id: uuidv7(),
      tenant_id: payload.tenantId || payload.tenant_id || 'system',
      shop_id: payload.shopId || payload.shop_id || 'system',
      user_id: payload.userId || payload.user_id || 'system',
      action: operation,
      entity: entityType,
      entity_id: payload.id || opId,
      timestamp,
      metadata: JSON.stringify(payload)
    });
  });

  transaction();

  // Phase 2: Non-critical async operations
  if (operation === 'DELETE') {
    memoryCache.delete(entityType, payload.id);
  } else {
    memoryCache.set(entityType, payload.id, payload);
  }
  
  // Trigger sync non-blockingly
  syncEngine.triggerSync().catch(logger.error);
  
  return { success: true, opId };
}



export function queryEntity(entityType: string, id: string) {
  // Check Cache first
  const cached = memoryCache.get(entityType, id);
  if (cached) return cached;

  const stmt = db.prepare(`SELECT * FROM ${entityType} WHERE id = ?`);
  const result = stmt.get(id);

  if (result) {
    memoryCache.set(entityType, id, result);
  }
  return result;
}

export function queryAll(entityType: string) {
  const stmt = db.prepare(`SELECT * FROM ${entityType}`);
  return stmt.all();
}
