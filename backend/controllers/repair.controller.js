const repairService = require('../services/repair.service');

exports.createRepairJob = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const userId = req.user._id;

    const jobData = {
      ...req.body,
      organizationId: tenantId,
      branchId: shopId
    };

    const repairJob = await repairService.createRepairJob(jobData, userId);

    res.status(201).json({
      success: true,
      message: 'Repair job created successfully',
      data: repairJob
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRepairJobs = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.priority) filters.priority = req.query.priority;
    if (req.query.customerId) filters.customerId = req.query.customerId;
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      filters.$or = [
        { jobId: searchRegex },
        { 'device.imei': searchRegex },
        { 'device.model': searchRegex }
      ];
    }

    const { jobs, total } = await repairService.getRepairJobs({
      organizationId: tenantId,
      branchId: shopId,
      filters,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRepairJobById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;

    const job = await repairService.getRepairJobById(req.params.id, tenantId, shopId);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Repair job not found' });
    }

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const userId = req.user._id;
    const { status, note } = req.body;

    const job = await repairService.updateStatus(req.params.id, status, note, userId, tenantId, shopId);

    res.status(200).json({ success: true, message: `Status updated to ${status}`, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addPart = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const userId = req.user._id;

    const job = await repairService.addPart(req.params.id, req.body, userId, tenantId, shopId);

    res.status(200).json({ success: true, message: 'Part added successfully', data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const userId = req.user._id;

    const job = await repairService.addPayment(req.params.id, req.body, userId, tenantId, shopId);

    res.status(200).json({ success: true, message: 'Payment recorded successfully', data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
