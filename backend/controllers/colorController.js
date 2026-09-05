const Color = require('../models/Color');
const searchCache = require('../services/searchCache.service');

exports.createColor = async (req, res) => {
  try {
    let { name, hexCode, status } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const existing = await Color.findOne({ name, isDeleted: { $in: [true, false, null] } });
    if (existing) {
      if (existing.isDeleted) {
        existing.isDeleted = false;
        existing.deletedAt = undefined;
        existing.status = status || 'active';
        existing.isActive = true;
        existing.hexCode = hexCode || existing.hexCode;
        const saved = await existing.save();
        await searchCache.invalidate('colors:search:' + req.organizationId + ':*');
        return res.status(201).json({ success: true, message: "Color restored successfully", data: saved });
      }
      return res.status(400).json({ success: false, message: 'Color with this name already exists' });
    }

    const item = new Color({
      name,
      hexCode: hexCode || '#000000',
      status: status || 'active',
      isActive: true,
      createdBy: req.user ? req.user._id : undefined,
      organizationId: req.organizationId,
    });

    const saved = await item.save();
    await searchCache.invalidate('colors:search:' + req.organizationId + ':*');
    res.status(201).json({ success: true, message: "Color created successfully", data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error creating Color', error: error.message });
  }
};

exports.getColors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    // tenantIsolation auto-injects organizationId, softDelete auto-excludes deleted
    const items = await Color.find({})
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Color.countDocuments({});

    res.status(200).json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateColor = async (req, res) => {
  try {
    let { name, hexCode, status } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const itemId = req.params.id;

    const item = await Color.findOne({ _id: itemId });
    if (!item) return res.status(404).json({ success: false, message: 'Color not found' });

    if (name && name !== item.name) {
      const existing = await Color.findOne({ name, _id: { $ne: itemId } });
      if (existing) return res.status(400).json({ success: false, message: 'Color with this name already exists' });
    }

    if (name) item.name = name;
    if (hexCode !== undefined) item.hexCode = hexCode;
    if (status !== undefined) item.status = status;

    const updated = await item.save();
    await searchCache.invalidate('colors:search:' + req.organizationId + ':*');

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.deleteColor = async (req, res) => {
  try {
    const itemId = req.params.id;
    const item = await Color.findOne({ _id: itemId });

    if (!item) return res.status(404).json({ success: false, message: "Color not found" });

    item.status = "inactive";
    item.isActive = false;
    item.isDeleted = true;
    await item.save();

    await searchCache.invalidate('colors:search:' + req.organizationId + ':*');
    res.status(200).json({ success: true, message: "Color deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
