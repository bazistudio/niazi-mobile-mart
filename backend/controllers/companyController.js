const Company = require('../models/Company');
const searchCache = require('../services/searchCache.service');

exports.createCompany = async (req, res) => {
  try {
    let { name, description, status } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const existing = await Company.findOne({ name, isDeleted: { $in: [true, false, null] } });
    if (existing) {
      if (existing.isDeleted) {
        existing.isDeleted = false;
        existing.deletedAt = undefined;
        existing.status = status || 'active';
        existing.isActive = true;
        existing.description = description || existing.description;
        const saved = await existing.save();
        await searchCache.invalidate('companies:search:' + req.organizationId + ':*');
        return res.status(201).json({ success: true, message: "Company restored successfully", data: saved });
      }
      return res.status(400).json({ success: false, message: 'Company with this name already exists' });
    }

    const item = new Company({
      name,
      description,
      status: status || 'active',
      isActive: true,
      createdBy: req.user ? req.user._id : undefined,
      organizationId: req.organizationId,
    });

    const saved = await item.save();

    await searchCache.invalidate('companies:search:' + req.organizationId + ':*');

    res.status(201).json({ success: true, message: "Company created successfully", data: saved });
  } catch (error) {
    console.error('Create Company Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating Company', error: error.message });
  }
};

exports.getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    // tenantIsolation auto-injects organizationId, softDelete auto-excludes deleted
    const items = await Company.find({})
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Company.countDocuments({});

    res.status(200).json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    let { name, description, status } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const itemId = req.params.id;

    const item = await Company.findOne({ _id: itemId });
    if (!item) return res.status(404).json({ success: false, message: 'Company not found' });

    if (name && name !== item.name) {
      const existing = await Company.findOne({ name, _id: { $ne: itemId } });
      if (existing) return res.status(400).json({ success: false, message: 'Company with this name already exists' });
    }

    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    if (status !== undefined) item.status = status;

    const updated = await item.save();
    await searchCache.invalidate('companies:search:' + req.organizationId + ':*');

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const itemId = req.params.id;
    const item = await Company.findOne({ _id: itemId });

    if (!item) return res.status(404).json({ success: false, message: "Company not found" });

    item.status = "inactive";
    item.isActive = false;
    item.isDeleted = true;
    await item.save();

    await searchCache.invalidate('companies:search:' + req.organizationId + ':*');
    res.status(200).json({ success: true, message: "Company deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
