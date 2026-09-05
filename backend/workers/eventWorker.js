const { Worker } = require('bullmq');
const invoiceService = require('../services/invoiceService');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');
const { asyncLocalStorage } = require('../middleware/requestContext');
const { invalidateCache } = require('../middleware/cache.middleware');

const { getRedisConnectionOptions } = require('../utils/redisConfig');
const connection = getRedisConnectionOptions();

/**
 * Worker that listens to the main Event Bus
 * Reacts to domain events asynchronously
 */
const eventWorker = new Worker('TijaratPro-Events', async (job) => {
  const { name, data } = job;
  
  // Re-hydrate the request context trace from the API layer
  const store = new Map();
  if (data._traceId) {
    store.set('requestId', data._traceId);
  }
  if (data.tenantId) store.set('tenantId', data.tenantId);
  if (data.userId) store.set('userId', data.userId);

  return asyncLocalStorage.run(store, async () => {
    logger.info(`Processing event job: ${name}`, { jobId: job.id, eventName: name });

  try {
    switch (name) {
      case 'ORDER_CREATED':
        // Generate invoice asynchronously
        await invoiceService.createInvoiceFromOrder(data.orderId);
        
        // Log audit
        await auditService.logAction({
          userId: data.userId,
          tenantId: data.tenantId,
          action: 'CREATE',
          resource: 'ORDER',
          resourceId: data.orderId,
          metadata: { orderNumber: data.orderNumber, totalAmount: data.totalAmount }
        });
        await invalidateCache(data.tenantId, '/api/dashboard');
        break;

      case 'ORDER_CANCELLED':
        // Handle async cancellation tasks (like sending emails or voiding invoices)
        await auditService.logAction({
          userId: data.userId,
          tenantId: data.tenantId,
          action: 'CANCEL',
          resource: 'ORDER',
          resourceId: data.orderId,
          metadata: { orderNumber: data.orderNumber, status: 'cancelled' }
        });
        await invalidateCache(data.tenantId, '/api/dashboard');
        break;
        
      default:
        logger.warn(`Unknown event name in worker: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing event job ${name}`, { error: error.message, stack: error.stack });
    throw error; // Let BullMQ retry
  }
  }); // End asyncLocalStorage.run
}, { connection });

eventWorker.on('completed', (job) => {
  logger.debug(`Job ${job.id} completed successfully`);
});

eventWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed`, { error: err.message });
});

module.exports = eventWorker;
