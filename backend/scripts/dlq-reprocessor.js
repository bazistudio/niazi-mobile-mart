const { eventQueue } = require('../queues/eventQueue');
const logger = require('../utils/logger');

async function reprocessDLQ() {
  console.log('🔄 Starting Dead Letter Queue (DLQ) Reprocessor...');
  try {
    const failedJobs = await eventQueue.getFailed();
    if (failedJobs.length === 0) {
      console.log('✅ No failed jobs in the DLQ.');
      process.exit(0);
    }

    console.log(`Found ${failedJobs.length} failed jobs. Attempting to retry...`);
    let successCount = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        console.log(`Re-queued Job ${job.id} (${job.name})`);
        successCount++;
      } catch (err) {
        console.error(`Failed to retry Job ${job.id}:`, err.message);
      }
    }

    console.log(`\n✅ Successfully re-queued ${successCount}/${failedJobs.length} jobs.`);
  } catch (error) {
    console.error('❌ Error reprocessing DLQ:', error);
  } finally {
    process.exit(0);
  }
}

reprocessDLQ();
