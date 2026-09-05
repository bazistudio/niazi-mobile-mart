import { z } from 'zod';
import { logger } from '../logger';

const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  updatedAt: z.number().optional(),
  version: z.number().optional(),
}).strict();

const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  price: z.number().optional(),
  stock: z.number().optional(),
  updatedAt: z.number().optional(),
  version: z.number().optional(),
}).strict();

const OrderSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().optional().nullable(),
  total: z.number().optional(),
  status: z.string().optional(),
  items: z.string().optional(), // usually JSON stringified
  paymentMethod: z.string().optional().nullable(),
  discount: z.number().optional().nullable(),
  updatedAt: z.number().optional(),
  version: z.number().optional(),
}).strict();

export function validatePayload(entityType: string, operation: string, payload: any) {
  if (operation === 'DELETE') {
    // For DELETE, we only need an ID
    const deleteSchema = z.object({ id: z.string().min(1) }).strict();
    return deleteSchema.parse(payload);
  }

  switch (entityType) {
    case 'users':
      return UserSchema.parse(payload);
    case 'products':
      return ProductSchema.parse(payload);
    case 'orders': {
      const result = OrderSchema.safeParse(payload);
      if (!result.success) {
        logger.error('[IPC Validation Error] orders:', JSON.stringify(result.error.format(), null, 2));
        logger.error('VALIDATING ORDER PAYLOAD:', JSON.stringify(payload, null, 2));
        throw new Error("Validation failed for orders: " + result.error.message);
      }
      return result.data;
    }
    default:
      throw new Error(`[IPC Validation] Unknown entity type: ${entityType}`);
  }
}
