const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

const worker = new Worker(
  'main-tasks',
  async (job) => {
    console.log(`Processing job: ${job.name} (ID: ${job.id})`);
    
    try {
      switch (job.name) {
        case 'send-email':
          await handleSendEmail(job.data);
          break;
        case 'create-tenant':
          await handleCreateTenant(job.data);
          break;
        case 'generate-invoice':
          await handleGenerateInvoice(job.data);
          break;
        case 'sync-data':
          await handleSyncData(job.data);
          break;
        case 'log-audit':
          await handleLogAudit(job.data);
          break;
        case 'backup-db':
          await handleBackupDB(job.data);
          break;
        default:
          console.warn(`No handler for job: ${job.name}`);
      }
      
      console.log(`Job completed: ${job.name}`);
    } catch (error) {
      logger.error(`Job failed: ${job.name}`, error);
      throw error; // Let BullMQ handle retries
    }
  },
  {
    connection: require('../utils/redisConfig').getRedisConnectionOptions(),
    concurrency: 5,
  }

);

worker.on('completed', (job) => {
  // logger.info(`${job.name} has completed!`);
});

worker.on('failed', (job, err) => {
  logger.error(`${job.id} has failed with ${err.message}`);
});

// Handlers
async function handleSendEmail(data) {
  console.log(`[QUEUE] Sending email to ${data.email}...`);
  // Real email logic (e.g. NodeMailer) would go here
  await new Promise(r => setTimeout(r, 1000)); // Simulate work
}

async function handleCreateTenant(data) {
  console.log(`[QUEUE] Creating tenant for ${data.userId}...`);
  // Real tenant creation logic
  await new Promise(r => setTimeout(r, 2000)); // Simulate work
}

async function handleGenerateInvoice(data) {
  console.log(`[QUEUE] Generating invoice for Order ${data.orderId}...`);
  await new Promise(r => setTimeout(r, 1500));
}

async function handleSyncData(data) {
  console.log(`[QUEUE] Syncing data for ${data.userId}...`);
  await new Promise(r => setTimeout(r, 1000));
}

async function handleLogAudit(data) {
  try {
    console.log(`[QUEUE] Persisting audit log for ${data.action} on ${data.resource}...`);
    await AuditLog.create(data);
  } catch (error) {
    logger.error("Failed to persist audit log:", error);
    throw error;
  }
}

async function handleBackupDB(data) {
  try {
    const { type } = data;
    console.log(`[QUEUE] Starting database backup (${type || 'manual'})...`);
    
    // In a real scenario, we would run:
    // exec('mongodump --uri="mongodb://..." --archive="backup.gz" --gzip')
    // and then upload to S3.
    
    await new Promise(r => setTimeout(r, 3000)); // Simulate backup time
    
    console.log(`[QUEUE] Backup (${type}) completed successfully.`);
  } catch (error) {
    logger.error("Backup failed:", error);
    throw error;
  }
}

module.exports = worker;
