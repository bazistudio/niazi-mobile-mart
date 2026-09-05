const RepairJob = require('../models/RepairJob');
const Counter = require('../models/Counter');
const StockMovement = require('../models/StockMovement');
const LedgerEntry = require('../models/LedgerEntry');
const Party = require('../models/Party');

async function getNextJobId(organizationId, branchId) {
  const sequenceName = `repairJobId_${organizationId}_${branchId}`;
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  // Pad with 6 zeros
  const sequenceNumber = String(counter.seq).padStart(6, '0');
  return `RP-${sequenceNumber}`;
}

exports.createRepairJob = async (jobData, userId) => {
  const { organizationId, branchId, customerId, customerModel } = jobData;
  
  const jobId = await getNextJobId(organizationId, branchId);
  
  const repairJob = new RepairJob({
    ...jobData,
    jobId,
    timeline: [{
      status: 'Received',
      user: userId,
      description: 'Repair job created',
      note: jobData.internalNotes || ''
    }]
  });

  // Handle advance payments if any are included during creation
  if (jobData.advancePayment && jobData.advancePayment.amount > 0) {
    const payment = {
      amount: jobData.advancePayment.amount,
      method: jobData.advancePayment.method,
      receivedBy: userId,
      timestamp: new Date()
    };
    
    // Create LedgerEntry for payment
    // Debit Cash/Bank, Credit Customer/Party, then internal transfer or link to Repair
    const ledgerEntry = new LedgerEntry({
      organizationId,
      branchId,
      date: new Date(),
      type: 'CR', // Credit customer
      amount: payment.amount,
      referenceType: 'REPAIR_ADVANCE',
      referenceId: repairJob._id,
      partyId: customerId,
      notes: `Advance payment for Repair Job ${jobId}`
    });
    await ledgerEntry.save();
    
    payment.ledgerEntryId = ledgerEntry._id;
    repairJob.payments.push(payment);
    
    repairJob.timeline.push({
      status: 'Payment Received',
      user: userId,
      description: `Advance payment of ${payment.amount} received via ${payment.method}`
    });
  }

  await repairJob.save();
  return repairJob;
};

exports.getRepairJobs = async ({ organizationId, branchId, filters, page = 1, limit = 10 }) => {
  const query = { organizationId, branchId, ...filters };
  
  const total = await RepairJob.countDocuments(query);
  const jobs = await RepairJob.find(query)
    .populate('customerId')
    .populate('technicianId', 'name email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
    
  return { jobs, total };
};

exports.getRepairJobById = async (id, organizationId, branchId) => {
  return await RepairJob.findOne({ _id: id, organizationId, branchId })
    .populate('customerId')
    .populate('technicianId', 'name email')
    .populate('partsUsed.productId', 'name sku currentStock cost price')
    .populate('timeline.user', 'name email');
};

exports.updateStatus = async (id, status, note, userId, organizationId, branchId) => {
  const job = await RepairJob.findOne({ _id: id, organizationId, branchId });
  if (!job) throw new Error('Repair Job not found');

  job.status = status;
  job.timeline.push({
    status: status,
    user: userId,
    description: `Status changed to ${status}`,
    note
  });

  await job.save();
  return job;
};

exports.addPart = async (id, partData, userId, organizationId, branchId) => {
  const job = await RepairJob.findOne({ _id: id, organizationId, branchId });
  if (!job) throw new Error('Repair Job not found');

  job.partsUsed.push({
    ...partData,
    addedBy: userId,
    addedAt: new Date()
  });

  job.timeline.push({
    status: 'Part Added',
    user: userId,
    description: `Added ${partData.qty}x Part ID: ${partData.productId} at price ${partData.price}`
  });

  // Deduct inventory
  const stockMovement = new StockMovement({
    tenantId: organizationId, // assuming tenantId maps to organizationId or similar
    shopId: branchId,
    productId: partData.productId,
    type: 'OUT',
    quantity: partData.qty,
    reason: 'consumed_in_repair',
    referenceModel: 'RepairJob',
    referenceId: job._id,
    notes: `Consumed for Repair Job ${job.jobId}`,
    createdBy: userId
  });
  await stockMovement.save();
  // We'd typically trigger a stock update on Product here or StockMovement hook handles it

  await job.save();
  return job;
};

exports.addPayment = async (id, paymentData, userId, organizationId, branchId) => {
  const job = await RepairJob.findOne({ _id: id, organizationId, branchId });
  if (!job) throw new Error('Repair Job not found');

  const ledgerEntry = new LedgerEntry({
    organizationId,
    branchId,
    date: new Date(),
    type: 'CR', // Credit customer account
    amount: paymentData.amount,
    referenceType: 'REPAIR_PAYMENT',
    referenceId: job._id,
    partyId: job.customerId,
    notes: `Payment for Repair Job ${job.jobId}`
  });
  await ledgerEntry.save();

  job.payments.push({
    ...paymentData,
    receivedBy: userId,
    timestamp: new Date(),
    ledgerEntryId: ledgerEntry._id
  });

  job.timeline.push({
    status: 'Payment Received',
    user: userId,
    description: `Payment of ${paymentData.amount} received via ${paymentData.method}`
  });

  await job.save();
  return job;
};
