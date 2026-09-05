const { eventQueue } = require('../queues/eventQueue');
const logger = require('../utils/logger');

/**
 * Controller to inspect and manage the Dead Letter Queue (DLQ)
 * Ensures no silent failures exist in background processes.
 */
exports.getFailedJobs = async (req, res) => {
  try {
    const failedJobs = await eventQueue.getFailed();
    const formatted = failedJobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade
    }));
    
    res.json({ success: true, count: formatted.length, jobs: formatted });
  } catch (error) {
    logger.error('Failed to fetch DLQ', { error: error.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.retryJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await eventQueue.getJob(id);
    
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    
    if (await job.isFailed()) {
      await job.retry();
      logger.info(`Admin manually retried job ${id}`);
      return res.json({ success: true, message: `Job ${id} queued for retry` });
    }
    
    res.status(400).json({ success: false, message: 'Job is not in a failed state' });
  } catch (error) {
    logger.error(`Failed to retry job ${req.params.id}`, { error: error.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
