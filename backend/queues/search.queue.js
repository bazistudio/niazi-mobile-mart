const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const { getRedisConnectionOptions } = require('../utils/redisConfig');

/**
 * SearchQueue manages asynchronous search-related tasks.
 * Primarily used for AI-powered search indexing and log analysis.
 */
if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
  logger.info('Redis not configured, disabling SearchQueue.');
  module.exports = {
    addJob: async (type) => { 
      logger.info(`Queue disabled, skipping job: ${type}`); 
      return { id: 'dummy' }; 
    },
    queue: { client: Promise.resolve(null) }
  };
} else {
  class SearchQueue {
    constructor() {
      this.queueName = 'search-processing';
      this.queue = new Queue(this.queueName, {
        connection: getRedisConnectionOptions(),
      });


      this.queue.on('error', (err) => {
        logger.error(`Queue Error: ${this.queueName}`, err);
      });
    }

    /**
     * Add a new job to the search queue
     * @param {string} type - Type of search task (e.g., 'reindex', 'analyze-query')
     * @param {Object} data - Payload for the job
     */
    async addJob(type, data) {
      try {
        const job = await this.queue.add(type, data, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
        });
        logger.info(`Job added to ${this.queueName}: ${job.id} [${type}]`);
        return job;
      } catch (err) {
        logger.error(`Failed to add job to ${this.queueName}`, err);
        throw err;
      }
    }
  }

  module.exports = new SearchQueue();
}
