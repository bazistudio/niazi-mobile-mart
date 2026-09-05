const { Queue } = require('bullmq');
const { getRequestId } = require('../middleware/requestContext');
const { getRedisConnectionOptions } = require('../utils/redisConfig');

let eventQueue;
let emitEvent;

const useRedis = process.env.REDIS_HOST || process.env.REDIS_URL;

if (!useRedis) {
  console.log('Redis not configured, disabling eventQueue.');
  eventQueue = { client: Promise.resolve(null), add: async () => {} };
  emitEvent = async (eventName) => {
    console.warn(`[EVENT_QUEUE_DISABLED] Skipping event: ${eventName}`);
  };
} else {
  /**
   * Main Event Bus Queue for TijaratPro ERP
   * Handles decoupling of domain events (ORDER_CREATED, etc.)
   */
  eventQueue = new Queue('TijaratPro-Events', {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  });

  /**
   * Emit an event to the background queue
   * @param {string} eventName - e.g., 'ORDER_CREATED'
   * @param {Object} payload - The event data
   */
  emitEvent = async (eventName, payload) => {
    // Propagate trace context to background worker
    const traceId = getRequestId();
    if (traceId) {
      payload._traceId = traceId;
    }
    
    await eventQueue.add(eventName, payload);
  };
}

module.exports = {
  eventQueue,
  emitEvent
};
