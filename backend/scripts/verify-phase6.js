const crypto = require("crypto");
const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const JobQueue = require('../models/JobQueue');
const BackupHistory = require('../models/BackupHistory');
const AIJob = require('../models/AIJob');
const AIHistory = require('../models/AIHistory');
const AIConfiguration = require('../models/AIConfiguration');

const { tenantContext } = require('../middleware/context/asyncContext');

async function verify() {
  console.log('Connecting to Test Database...');
  await mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro_phase6_test');
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map(m => mongoose.model(m).createIndexes()));
  console.log('✅ Database connected and cleared, indexes rebuilt.');

  const tempOwnerId = crypto.randomUUID();
  const org1 = await Organization.create({ name: 'Org 1', code: 'ORG1', ownerId: tempOwnerId });
  const org2 = await Organization.create({ name: 'Org 2', code: 'ORG2', ownerId: tempOwnerId });
  const user = await User.create({ username: 'testuser', name: 'Test User', organizationId: org1._id });

  await tenantContext.run({ organizationId: org1._id.toString() }, async () => {
    console.log('\n--- Running Phase 6 Verification ---');

    // 1. ActivityLog creation & Public ID
    const actLog = await ActivityLog.create({
      organizationId: org1._id,
      userId: user._id,
      action: "Login",
      module: "Authentication",
      ipAddress: "127.0.0.1"
    });
    if (!actLog.publicId.startsWith('ACT-')) throw new Error("ActivityLog Public ID failed");
    console.log('✅ ActivityLog creation and Public ID verified.');

    // 2. AuditLog creation
    const audLog = await AuditLog.create({
      organizationId: org1._id,
      userId: user._id,
      entityType: "Invoice",
      entityId: crypto.randomUUID(),
      action: "UPDATED",
      oldValue: { status: "Draft" },
      newValue: { status: "Issued" },
      reason: "Customer confirmed"
    });
    if (!audLog.publicId.startsWith('ADT-')) throw new Error("AuditLog Public ID failed");
    console.log('✅ AuditLog creation verified.');

    // 3. Notification read/unread
    const notif = await Notification.create({
      organizationId: org1._id,
      userId: user._id,
      type: "SYSTEM",
      title: "Welcome",
      message: "Hello World"
    });
    if (notif.isRead !== false) throw new Error("Notification should be unread");
    
    notif.isRead = true;
    notif.readAt = new Date();
    await notif.save();
    
    const readNotif = await Notification.findById(notif._id);
    if (readNotif.isRead !== true) throw new Error("Notification read state failed");
    console.log('✅ Notification read/unread verified.');

    // 4. Job queue lifecycle
    const job = await JobQueue.create({
      organizationId: org1._id,
      type: "Generate PDF",
      payload: { invoiceId: "123" }
    });
    if (job.status !== "PENDING") throw new Error("Job default status failed");
    
    job.status = "COMPLETED";
    job.completedAt = new Date();
    await job.save();
    
    const completedJob = await JobQueue.findById(job._id);
    if (completedJob.status !== "COMPLETED") throw new Error("Job lifecycle failed");
    console.log('✅ Job queue lifecycle verified.');

    // 5. Backup history creation
    const backup = await BackupHistory.create({
      organizationId: org1._id,
      backupType: "FULL",
      location: "s3://backups/db1.gz",
      size: 1024 * 1024 * 50
    });
    if (!backup.publicId.startsWith('BAK-')) throw new Error("Backup history Public ID failed");
    console.log('✅ Backup history creation verified.');

    // 6. AI placeholder creation
    const aiConf = await AIConfiguration.create({ organizationId: org1._id, enabledModels: ["gpt-4o"] });
    const aiJob = await AIJob.create({ organizationId: org1._id, taskType: "OCR", input: { file: "test.pdf" } });
    const aiHist = await AIHistory.create({ organizationId: org1._id, prompt: "Hello AI", response: "Hi", tokens: 10 });
    
    if (!aiConf.publicId || !aiJob.publicId || !aiHist.publicId) throw new Error("AI placeholders failed");
    console.log('✅ AI placeholder creation verified.');

    // 7. Soft delete behavior
    await actLog.softDelete();
    const actLogCount = await ActivityLog.countDocuments();
    if (actLogCount !== 0) throw new Error("Soft delete failed for ActivityLog");
    console.log('✅ Soft delete behavior verified on infrastructure logs.');

    // 8. Pagination
    await ActivityLog.create({ organizationId: org1._id, action: "Logout", module: "Auth" });
    await ActivityLog.create({ organizationId: org1._id, action: "View", module: "Sales" });
    const paginatedLogs = await ActivityLog.paginate({}, { page: 1, limit: 1 });
    if (paginatedLogs.data.length !== 1 || paginatedLogs.total <= 1) throw new Error("Pagination failed");
    console.log('✅ Pagination verified on logs.');
  });

  // 9. Organization isolation
  await tenantContext.run({ organizationId: org2._id.toString() }, async () => {
    const logsOrg2 = await ActivityLog.countDocuments();
    if (logsOrg2 !== 0) throw new Error("Tenant leakage in ActivityLog");
    console.log('✅ Multi-organization isolation verified.');
  });

  console.log('\n🎉 Phase 6 Verification Complete: Logs & Infrastructure Passed!');
  process.exit(0);
}

verify().catch(e => {
  console.error('❌ Verification failed', e);
  process.exit(1);
});
