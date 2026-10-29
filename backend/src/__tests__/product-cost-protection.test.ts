import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { canViewProductCost, sanitizeProductCost, createProductRouter } from '../routes/product.routes';
import { RequestIdentity, NIAZI_ORGANIZATION_ID } from '../auth';
import { issueToken } from '../services/jwt.service';
import * as productRepo from '../repositories/product.repo';

describe('REL-3 / REL-4C: Product Cost Data Protection & HTTP Endpoint Tests', () => {
  const sampleProducts: productRepo.Product[] = [
    {
      id: 'prod-001',
      name: 'Sample OLED Display',
      normalized_name: 'sample oled display',
      sku: 'DISP-OLED-01',
      barcode: '8901234567890',
      category_id: 'cat-001',
      brand_id: 'brand-001',
      company_id: 'comp-001',
      quality_id: 'qual-001',
      color_id: 'color-001',
      unit_id: null,
      sale_price: 5000,
      purchase_price: 3200,
      average_cost: 3150,
      low_stock_threshold: 5,
      is_active: true,
      description: 'High quality OLED replacement panel',
      initial_quantity: 10,
      stock: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'prod-002',
      name: 'Battery for iPhone 11',
      normalized_name: 'battery for iphone 11',
      sku: 'BATT-IPH11',
      barcode: '8901234567891',
      category_id: 'cat-002',
      brand_id: 'brand-002',
      company_id: 'comp-002',
      quality_id: 'qual-002',
      color_id: 'color-002',
      unit_id: null,
      sale_price: 2500,
      purchase_price: 1400,
      average_cost: 1350,
      low_stock_threshold: 3,
      is_active: true,
      description: 'Original capacity replacement battery',
      initial_quantity: 15,
      stock: 15,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // =========================================================================
  // Section 1: Helper Unit Tests (Sanitization & Predicate)
  // =========================================================================

  it('allows Organization Admin (ADMIN) to view purchase cost', () => {
    const adminIdentity: RequestIdentity = {
      user_id: 'usr-admin',
      username: 'admin',
      role: 'ADMIN',
      organization_id: NIAZI_ORGANIZATION_ID,
      branch_id: null,
      access_profile: {
        allowed_pages: ['*'],
        allowed_actions: ['*'],
        limits: {
          max_discount_percent: 100,
          can_price_override: true,
          can_refund: true,
          can_void_sale: true,
          can_view_profit: true,
        },
      },
      authenticated_at_ms: Date.now(),
    };

    assert.strictEqual(canViewProductCost(adminIdentity), true);
    const sanitized = sanitizeProductCost(sampleProducts[0], true);
    assert.strictEqual(sanitized.purchase_price, 3200);
    assert.strictEqual(sanitized.average_cost, 3150);
  });

  it('allows Branch Admin (SHOP_ADMIN) to view purchase cost', () => {
    const shopAdminIdentity: RequestIdentity = {
      user_id: 'usr-shop-admin',
      username: 'shopadmin',
      role: 'SHOP_ADMIN',
      organization_id: NIAZI_ORGANIZATION_ID,
      branch_id: '00000000-0000-0000-0000-000000000002',
      access_profile: {
        allowed_pages: ['pos', 'inventory', 'products', 'reports'],
        allowed_actions: ['pos:sale'],
        limits: {
          max_discount_percent: 20,
          can_price_override: false,
          can_refund: true,
          can_void_sale: true,
          can_view_profit: true,
        },
      },
      authenticated_at_ms: Date.now(),
    };

    assert.strictEqual(canViewProductCost(shopAdminIdentity), true);
    const sanitized = sanitizeProductCost(sampleProducts[0], true);
    assert.strictEqual(sanitized.purchase_price, 3200);
    assert.strictEqual(sanitized.average_cost, 3150);
  });

  it('allows Accountant and Manager to view purchase cost', () => {
    const accountantIdentity: RequestIdentity = {
      user_id: 'usr-accountant',
      username: 'accountant',
      role: 'ACCOUNTANT',
      organization_id: NIAZI_ORGANIZATION_ID,
      branch_id: '00000000-0000-0000-0000-000000000002',
      access_profile: {
        allowed_pages: ['products', 'inventory', 'expenses', 'cash'],
        allowed_actions: [],
        limits: {
          max_discount_percent: 0,
          can_price_override: false,
          can_refund: false,
          can_void_sale: false,
          can_view_profit: false,
        },
      },
      authenticated_at_ms: Date.now(),
    };

    assert.strictEqual(canViewProductCost(accountantIdentity), true);
  });

  it('strictly scrubs purchase_price and average_cost for SALESMAN', () => {
    const salesmanIdentity: RequestIdentity = {
      user_id: 'usr-salesman',
      username: 'salesman1',
      role: 'SALESMAN',
      organization_id: NIAZI_ORGANIZATION_ID,
      branch_id: '00000000-0000-0000-0000-000000000002',
      access_profile: {
        allowed_pages: ['pos', 'products', 'cash'],
        allowed_actions: ['pos:sale'],
        limits: {
          max_discount_percent: 5,
          can_price_override: false,
          can_refund: false,
          can_void_sale: false,
          can_view_profit: false,
        },
      },
      authenticated_at_ms: Date.now(),
    };

    assert.strictEqual(canViewProductCost(salesmanIdentity), false);
    const sanitized = sanitizeProductCost(sampleProducts[0], false);
    assert.strictEqual(sanitized.purchase_price, 0);
    assert.strictEqual(sanitized.average_cost, 0);
    assert.strictEqual(sanitized.id, 'prod-001');
    assert.strictEqual(sanitized.name, 'Sample OLED Display');
    assert.strictEqual(sanitized.sale_price, 5000);
    assert.strictEqual(sanitized.stock, 10);
    assert.strictEqual(sanitized.sku, 'DISP-OLED-01');
  });

  it('strictly scrubs purchase_price and average_cost for CASHIER', () => {
    const cashierIdentity: RequestIdentity = {
      user_id: 'usr-cashier',
      username: 'cashier1',
      role: 'CASHIER',
      organization_id: NIAZI_ORGANIZATION_ID,
      branch_id: '00000000-0000-0000-0000-000000000002',
      access_profile: {
        allowed_pages: ['pos', 'products', 'cash'],
        allowed_actions: ['pos:sale', 'cash:open', 'cash:close'],
        limits: {
          max_discount_percent: 0,
          can_price_override: false,
          can_refund: false,
          can_void_sale: false,
          can_view_profit: false,
        },
      },
      authenticated_at_ms: Date.now(),
    };

    assert.strictEqual(canViewProductCost(cashierIdentity), false);
    const sanitized = sanitizeProductCost(sampleProducts[0], false);
    assert.strictEqual(sanitized.purchase_price, 0);
    assert.strictEqual(sanitized.average_cost, 0);
    assert.strictEqual(sanitized.sale_price, 5000);
    assert.strictEqual(sanitized.name, 'Sample OLED Display');
  });

  // =========================================================================
  // Section 2: End-to-End HTTP Route & JSON Response Serialization Tests
  // =========================================================================

  describe('HTTP Endpoint-Level Response Serialization (GET /api/products & /:id)', () => {
    let server: http.Server;
    let baseUrl: string;
    let activeTestIdentity: RequestIdentity | null = null;
    let originalListProducts: any;
    let originalGetProductById: any;
    let originalJwtPrivateKey: string | undefined;
    let originalJwtPublicKey: string | undefined;

    before(async () => {
      // Preserve original environment state and install disposable in-memory RSA-2048 key fixture
      originalJwtPrivateKey = process.env['JWT_PRIVATE_KEY'];
      originalJwtPublicKey = process.env['JWT_PUBLIC_KEY'];
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      process.env['JWT_PRIVATE_KEY'] = privateKey;
      process.env['JWT_PUBLIC_KEY'] = publicKey;

      // Mock repository calls in-memory so test runs isolated without DB dependency
      originalListProducts = productRepo.listProducts;
      originalGetProductById = productRepo.getProductById;

      (productRepo as any).listProducts = async (_pool: any, filter: any) => {
        let items = [...sampleProducts];
        if (filter.search) {
          items = items.filter(p => p.name.includes(filter.search) || p.sku.includes(filter.search));
        }
        return items;
      };

      (productRepo as any).getProductById = async (_pool: any, id: string) => {
        return sampleProducts.find(p => p.id === id) || null;
      };

      // Mock pool interface
      const mockPool: any = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('SELECT is_active, status, role FROM users')) {
            return {
              rows: [{ is_active: true, status: 'ACTIVE', role: activeTestIdentity?.role || 'STAFF' }],
            };
          }
          return { rows: [] };
        },
      };

      const app = express();
      app.use(express.json());

      // Test harness auth middleware: injects activeTestIdentity onto req.identity
      app.use((req: Request, _res: Response, next: NextFunction) => {
        if (activeTestIdentity) {
          req.identity = activeTestIdentity;
        }
        next();
      });

      // Mount the real production product router
      const router = createProductRouter(mockPool);
      app.use('/api/products', router);

      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      // Restore repository functions
      (productRepo as any).listProducts = originalListProducts;
      (productRepo as any).getProductById = originalGetProductById;

      // Restore original environment state
      if (originalJwtPrivateKey !== undefined) {
        process.env['JWT_PRIVATE_KEY'] = originalJwtPrivateKey;
      } else {
        delete process.env['JWT_PRIVATE_KEY'];
      }
      if (originalJwtPublicKey !== undefined) {
        process.env['JWT_PUBLIC_KEY'] = originalJwtPublicKey;
      } else {
        delete process.env['JWT_PUBLIC_KEY'];
      }

      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('GET /api/products serializes 0 purchase_price and 0 average_cost for SALESMAN', async () => {
      activeTestIdentity = {
        user_id: 'usr-salesman-1',
        username: 'salesman1',
        role: 'SALESMAN',
        organization_id: NIAZI_ORGANIZATION_ID,
        branch_id: '00000000-0000-0000-0000-000000000002',
        access_profile: {
          allowed_pages: ['pos', 'products', 'cash'],
          allowed_actions: ['pos:sale'],
          limits: {
            max_discount_percent: 5,
            can_price_override: false,
            can_refund: false,
            can_void_sale: false,
            can_view_profit: false,
          },
        },
        authenticated_at_ms: Date.now(),
      };

      const token = issueToken({
        userId: activeTestIdentity.user_id,
        username: activeTestIdentity.username,
        role: activeTestIdentity.role,
        accessProfile: activeTestIdentity.access_profile as any,
        branchId: activeTestIdentity.branch_id,
      });

      const res = await fetch(`${baseUrl}/api/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json() as any[];

      assert.strictEqual(Array.isArray(json), true);
      assert.strictEqual(json.length, 2);

      // Verify negative assertion: purchase_price and average_cost MUST be 0
      for (const item of json) {
        assert.strictEqual(item.purchase_price, 0, `Expected purchase_price=0 for ${item.id}`);
        assert.strictEqual(item.average_cost, 0, `Expected average_cost=0 for ${item.id}`);
        // Operational fields MUST remain intact
        assert.ok(item.sale_price > 0, `Expected sale_price > 0 for ${item.id}`);
        assert.ok(item.stock > 0, `Expected stock > 0 for ${item.id}`);
        assert.ok(item.name.length > 0, `Expected name for ${item.id}`);
        assert.ok(item.sku.length > 0, `Expected sku for ${item.id}`);
      }
    });

    it('GET /api/products/:id serializes 0 purchase_price and 0 average_cost for CASHIER', async () => {
      activeTestIdentity = {
        user_id: 'usr-cashier-1',
        username: 'cashier1',
        role: 'CASHIER',
        organization_id: NIAZI_ORGANIZATION_ID,
        branch_id: '00000000-0000-0000-0000-000000000002',
        access_profile: {
          allowed_pages: ['pos', 'products', 'cash'],
          allowed_actions: ['pos:sale', 'cash:open', 'cash:close'],
          limits: {
            max_discount_percent: 0,
            can_price_override: false,
            can_refund: false,
            can_void_sale: false,
            can_view_profit: false,
          },
        },
        authenticated_at_ms: Date.now(),
      };

      const token = issueToken({
        userId: activeTestIdentity.user_id,
        username: activeTestIdentity.username,
        role: activeTestIdentity.role,
        accessProfile: activeTestIdentity.access_profile as any,
        branchId: activeTestIdentity.branch_id,
      });

      const res = await fetch(`${baseUrl}/api/products/prod-001`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const item = await res.json() as any;

      assert.strictEqual(item.id, 'prod-001');
      assert.strictEqual(item.purchase_price, 0);
      assert.strictEqual(item.average_cost, 0);
      assert.strictEqual(item.sale_price, 5000);
      assert.strictEqual(item.name, 'Sample OLED Display');
    });

    it('GET /api/products serializes authentic purchase_price and average_cost for ADMIN', async () => {
      activeTestIdentity = {
        user_id: 'usr-admin-1',
        username: 'admin',
        role: 'ADMIN',
        organization_id: NIAZI_ORGANIZATION_ID,
        branch_id: null,
        access_profile: {
          allowed_pages: ['*'],
          allowed_actions: ['*'],
          limits: {
            max_discount_percent: 100,
            can_price_override: true,
            can_refund: true,
            can_void_sale: true,
            can_view_profit: true,
          },
        },
        authenticated_at_ms: Date.now(),
      };

      const token = issueToken({
        userId: activeTestIdentity.user_id,
        username: activeTestIdentity.username,
        role: activeTestIdentity.role,
        accessProfile: activeTestIdentity.access_profile as any,
        branchId: activeTestIdentity.branch_id,
      });

      const res = await fetch(`${baseUrl}/api/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json() as any[];

      assert.strictEqual(json.length, 2);
      assert.strictEqual(json[0].id, 'prod-001');
      assert.strictEqual(json[0].purchase_price, 3200);
      assert.strictEqual(json[0].average_cost, 3150);

      assert.strictEqual(json[1].id, 'prod-002');
      assert.strictEqual(json[1].purchase_price, 1400);
      assert.strictEqual(json[1].average_cost, 1350);
    });

    it('GET /api/products/:id serializes authentic purchase_price and average_cost for SHOP_ADMIN', async () => {
      activeTestIdentity = {
        user_id: 'usr-shop-admin-1',
        username: 'shopadmin',
        role: 'SHOP_ADMIN',
        organization_id: NIAZI_ORGANIZATION_ID,
        branch_id: '00000000-0000-0000-0000-000000000002',
        access_profile: {
          allowed_pages: ['pos', 'inventory', 'products', 'reports'],
          allowed_actions: ['pos:sale'],
          limits: {
            max_discount_percent: 20,
            can_price_override: false,
            can_refund: true,
            can_void_sale: true,
            can_view_profit: true,
          },
        },
        authenticated_at_ms: Date.now(),
      };

      const token = issueToken({
        userId: activeTestIdentity.user_id,
        username: activeTestIdentity.username,
        role: activeTestIdentity.role,
        accessProfile: activeTestIdentity.access_profile as any,
        branchId: activeTestIdentity.branch_id,
      });

      const res = await fetch(`${baseUrl}/api/products/prod-002`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const item = await res.json() as any;

      assert.strictEqual(item.id, 'prod-002');
      assert.strictEqual(item.purchase_price, 1400);
      assert.strictEqual(item.average_cost, 1350);
      assert.strictEqual(item.sale_price, 2500);
    });

    it('GET /api/products/:id returns 404 for non-existent product ID', async () => {
      activeTestIdentity = {
        user_id: 'usr-salesman-1',
        username: 'salesman1',
        role: 'SALESMAN',
        organization_id: NIAZI_ORGANIZATION_ID,
        branch_id: '00000000-0000-0000-0000-000000000002',
        access_profile: {
          allowed_pages: ['pos', 'products', 'cash'],
          allowed_actions: ['pos:sale'],
          limits: {
            max_discount_percent: 5,
            can_price_override: false,
            can_refund: false,
            can_void_sale: false,
            can_view_profit: false,
          },
        },
        authenticated_at_ms: Date.now(),
      };

      const token = issueToken({
        userId: activeTestIdentity.user_id,
        username: activeTestIdentity.username,
        role: activeTestIdentity.role,
        accessProfile: activeTestIdentity.access_profile as any,
        branchId: activeTestIdentity.branch_id,
      });

      const res = await fetch(`${baseUrl}/api/products/non-existent-uuid`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json() as any;
      assert.strictEqual(json.error, 'Product not found');
    });

    it('GET /api/products returns 403 Forbidden when identity lacks products page permission', async () => {
      activeTestIdentity = {
        user_id: 'usr-restricted-1',
        username: 'restricted_user',
        role: 'PUBLIC_USER',
        organization_id: NIAZI_ORGANIZATION_ID,
        branch_id: '00000000-0000-0000-0000-000000000002',
        access_profile: {
          allowed_pages: [], // zero allowed pages
          allowed_actions: [],
          limits: {
            max_discount_percent: 0,
            can_price_override: false,
            can_refund: false,
            can_void_sale: false,
            can_view_profit: false,
          },
        },
        authenticated_at_ms: Date.now(),
      };

      const token = issueToken({
        userId: activeTestIdentity.user_id,
        username: activeTestIdentity.username,
        role: activeTestIdentity.role,
        accessProfile: activeTestIdentity.access_profile as any,
        branchId: activeTestIdentity.branch_id,
      });

      const res = await fetch(`${baseUrl}/api/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 403);
      const json = await res.json() as any;
      assert.ok(json.error.includes("Access denied: You do not have permission to access page 'products'"));
    });
  });
});
