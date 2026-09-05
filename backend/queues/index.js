const { Queue } = require('bullmq');
const { Redis } = require('ioredis');

// Safely initialize Redis connection (fail gracefully if unavailable)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    // Retry strategy to gracefully degrade if Redis is down
    console.warn(`[BullMQ] Redis connection failed. Retry attempt ${times}...`);
    // Max delay of 2 seconds
    return Math.min(times * 50, 2000);
  }
});

connection.on('error', (err) => {
  console.error(`[BullMQ] Redis error: ${err.message}. Queues may not be functioning.`);
});

/**
 * Helper to safely create a queue with a graceful fallback.
 * @param {string} name - Queue name
 */
const createQueue = (name) => {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
    }
  });
};

module.exports = {
  connection,
  createQueue,
  
  // Export queues
  emailQueue: createQueue('email.queue'),
  pdfQueue: createQueue('pdf.queue'),
  reportQueue: createQueue('report.queue'),
  exportQueue: createQueue('export.queue'),
  notificationQueue: createQueue('notification.queue'),
  backupQueue: createQueue('backup.queue'),
  importQueue: createQueue('import.queue')
};
