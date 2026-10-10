/**
 * Product HTTP route handlers.
 * Mirrors Axum product handlers in src-tauri/src/bin/server.rs.
 *
 * Registered routes (exact HTTP contract preserved):
 *   GET    /api/products          → listProducts       (auth: products page)
 *   GET    /api/products/:id      → getProductById     (auth: products page)
 *   POST   /api/products          → createProduct      (auth: products page + product:create action)
 *   PUT    /api/products/:id      → updateProduct      (auth: products OR inventory page)
 *   DELETE /api/products/:id      → deactivateProduct  (auth: products OR inventory page)
 *   POST   /api/v1/products       → same as POST /api/products
 *   PUT    /api/v1/products/:id   → same as PUT /api/products/:id
 *   DELETE /api/v1/products/:id   → same as DELETE /api/products/:id
 */

import express, { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, isAdmin, RequestIdentity } from '../auth';
import {
  createProduct,
  createProductWithInitialStock,
  listProducts,
  getProductById,
  updateProduct,
  deactivateProduct,
  RepoError,
  ProductListFilter,
  CreateProductDto,
  UpdateProductDto,
} from '../repositories/product.repo';
import { importOpeningStock, ImportOpeningStockDto } from '../repositories/opening_stock.repo';

// ─── Error Response Helper ────────────────────────────────────────────────────

function isDbConnectionError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as any).message || String(err);
  const code = (err as any).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated')
  );
}

export { authorizePermission };

export function sendError(_req: Request, res: Response, err: unknown): void {
  console.error('[product.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof RepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

// ─── Price Validation ─────────────────────────────────────────────────────────

/**
 * Validates product prices on create.
 * Mirrors validateProductPrices() in frontend/src/core/domain/product.ts and
 * the create-time price validation implied by the Rust service.
 */
function validateCreatePrices(salePrice: number, purchasePrice: number): string | null {
  if (salePrice < 0) return 'Sale price cannot be negative';
  if (purchasePrice < 0) return 'Purchase price cannot be negative';
  if (salePrice < purchasePrice) return 'Sale price cannot be less than purchase price';
  return null;
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export function createProductRouter(pool: Pool): Router {
  const router = express.Router();

  // Apply JWT authentication middleware to all product routes
  router.use(authMiddleware);

  // ── GET /api/products ──────────────────────────────────────────────────────
  // Auth: products page permission
  // Returns: 200 + Product[] (JSON array)
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'products', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const filter: ProductListFilter = {
        search: (req.query['search'] as string) || null,
        category_id: (req.query['category_id'] as string) || null,
        brand_id: (req.query['brand_id'] as string) || null,
        company_id: (req.query['company_id'] as string) || null,
        quality_id: (req.query['quality_id'] as string) || null,
        color_id: (req.query['color_id'] as string) || null,
        is_active:
          req.query['is_active'] !== undefined
            ? req.query['is_active'] === 'true' || req.query['is_active'] === '1'
            : null,
      };

      const products = await listProducts(pool, filter);
      res.status(200).json(products);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/products/:id ─────────────────────────────────────────────────
  // Auth: products page permission
  // Returns: 200 + Product | 404 on not-found
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'products', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const product = await getProductById(pool, id);
      if (!product) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      res.status(200).json(product);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/products ────────────────────────────────────────────────────
  // Auth: products page + product:create action
  // Returns: 201 + Product on success
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'products', 'product:create');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CreateProductDto;

      // Price validation before hitting the DB
      const priceErr = validateCreatePrices(dto.sale_price ?? 0, dto.purchase_price ?? 0);
      if (priceErr) {
        res.status(400).json({ error: priceErr });
        return;
      }

      const id = uuidv4();
      const initialQty = Number(
        dto.initial_quantity ??
        (dto as any).initialQuantity ??
        (dto as any).quantity ??
        0
      );
      const rawBranch = String(
        dto.branch_id ??
        (dto as any).branchId ??
        (dto as any).initial_branch_id ??
        identity.branch_id ??
        ''
      ).trim();
      const branchId = rawBranch.length === 36 ? rawBranch : '00000000-0000-0000-0000-000000000002';

      // Always spread resolved branchId and initial_quantity so createProduct/createProductWithInitialStock receive normalized values.
      const dtoWithBranch = {
        ...dto,
        branch_id: branchId,
        initial_quantity: initialQty > 0 ? initialQty : null,
      };

      let product;
      if (initialQty > 0 && branchId) {
        product = await createProductWithInitialStock(
          pool,
          id,
          dtoWithBranch,
          identity.user_id
        );
      } else {
        product = await createProduct(pool, id, dtoWithBranch);
      }

      res.status(201).json(product);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── PUT /api/products/:id ─────────────────────────────────────────────────
  // Auth: products OR inventory page permission
  // Returns: 200 + Product on success
  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const productsOk = authorizePermission(identity, 'products', null);
    const inventoryOk = authorizePermission(identity, 'inventory', null);
    if (productsOk !== null && inventoryOk !== null) {
      res.status(403).json({ error: productsOk });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const dto = req.body as UpdateProductDto;
      const product = await updateProduct(pool, id, dto);
      res.status(200).json(product);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── DELETE /api/products/:id ──────────────────────────────────────────────
  // Auth: products OR inventory page permission
  // Returns: 200 + { message: "Product deactivated" } | 404
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const productsOk = authorizePermission(identity, 'products', null);
    const inventoryOk = authorizePermission(identity, 'inventory', null);
    if (productsOk !== null && inventoryOk !== null) {
      res.status(403).json({ error: productsOk });
      return;
    }

    try {
      const id = req.params['id'] as string;
      await deactivateProduct(pool, id);
      res.status(200).json({ message: 'Product deactivated' });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /opening-stock ───────────────────────────────────────────────────
  router.post('/opening-stock', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    if (!isAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Opening stock import requires Admin or ShopAdmin permissions' });
      return;
    }

    try {
      const dto = req.body as ImportOpeningStockDto;
      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }
      const result = await importOpeningStock(pool, dto, identity.user_id);
      res.status(201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
