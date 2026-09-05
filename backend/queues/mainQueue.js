const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const { getRedisConnectionOptions } = require('../utils/redisConfig');

if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
  logger.info('Redis not configured, disabling mainQueue.');
  module.exports = {
    addJob: async (name) => { 
      logger.info(`Queue disabled, skipping job: ${name}`); 
      return { id: 'dummy' }; 
    },
    queue: { client: Promise.resolve(null) }
  };
} else {
  class MainQueue {
    constructor() {
      this.queueName = 'main-tasks';
      this.queue = new Queue(this.queueName, {
        connection: getRedisConnectionOptions(),
      });


      this.queue.on('error', (err) => {
        logger.error(`Queue Error: ${this.queueName}`, err);
      });
    }

    /**
     * Add a new job to the queue
     * @param {string} name - Name of the task (e.g., 'send-email')
     * @param {Object} data - Payload for the job
     * @param {Object} options - BullMQ options (delay, priority, etc)
     */
    async addJob(name, data, options = {}) {
      try {
        const job = await this.queue.add(name, data, {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          ...options,
        });
        console.log(`Job added to ${this.queueName}: ${job.id} [${name}]`);
        return job;
      } catch (err) {
        logger.error(`Failed to add job to ${this.queueName}`, err);
        throw err;
      }
    }
  }

  module.exports = new MainQueue();
}
