import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { buildAuthMiddleware, RequestIdentity } from '../auth';

export function buildNotificationRouter(pool: Pool): Router {
  const router = Router();
  const authenticate = buildAuthMiddleware(pool);

  router.use(authenticate);

  // GET /api/notifications — list user's recent notifications
  router.get('/', async (req: Request, res: Response) => {
    const identity = req.identity as RequestIdentity;
    try {
      const result = await pool.query(
        `SELECT id, type, title, message, reference_type, reference_id,
                is_read, created_at
         FROM notifications
         WHERE recipient_user_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [identity.user_id]
      );
      const unreadCount = result.rows.filter((r: any) => !r.is_read).length;
      res.status(200).json({ data: result.rows, unreadCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
    }
  });

  // PATCH /api/notifications/:id/read — mark one notification as read
  router.patch('/:id/read', async (req: Request, res: Response) => {
    const identity = req.identity as RequestIdentity;
    const { id } = req.params;
    try {
      await pool.query(
        `UPDATE notifications SET is_read = true
         WHERE id = $1 AND recipient_user_id = $2`,
        [id, identity.user_id]
      );
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to mark notification as read' });
    }
  });

  // POST /api/notifications/mark-all-read — mark all as read for user
  router.post('/mark-all-read', async (req: Request, res: Response) => {
    const identity = req.identity as RequestIdentity;
    try {
      await pool.query(
        `UPDATE notifications SET is_read = true
         WHERE recipient_user_id = $1 AND is_read = false`,
        [identity.user_id]
      );
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to mark all notifications as read' });
    }
  });

  return router;
}
