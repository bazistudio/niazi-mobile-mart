const Brand = require('../models/Brand');
const searchCache = require('../services/searchCache.service');

exports.createBrand = async (req, res) => {
  try {
    let { name, description, status, brandCode: reqBrandCode } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    let brandCode = reqBrandCode;
    if (!brandCode && name) {
      brandCode = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 10) + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    const existing = await Brand.findOne({ name, isDeleted: { $in: [true, false, null] } });
    if (existing) {
      if (existing.isDeleted) {
        existing.isDeleted = false;
        existing.deletedAt = undefined;
        existing.status = status || 'active';
        existing.isActive = true;
        existing.description = description || existing.description;
        const saved = await existing.save();
        await searchCache.invalidate('brands:search:' + req.organizationId + ':*');
        return res.status(201).json({ success: true, message: "Brand restored successfully", data: saved });
      }
      return res.status(400).json({ success: false, message: 'Brand with this name already exists' });
    }

    const item = new Brand({
      name,
      brandCode,
      description,
      status: status || 'active',
      isActive: true,
      organizationId: req.organizationId,
    });

    const saved = await item.save();

    await searchCache.invalidate('brands:search:' + req.organizationId + ':*');

    res.status(201).json({ success: true, message: "Brand created successfully", data: saved });
  } catch (error) {
    console.error('Create Brand Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating Brand', error: error.message });
  }
};

exports.getBrands = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    const items = await Brand.find({ isDeleted: { $ne: true } })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Brand.countDocuments({ isDeleted: { $ne: true } });

    res.status(200).json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateBrand = async (req, res) => {
  try {
    let { name, description, status } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const itemId = req.params.id;

    const item = await Brand.findOne({ _id: itemId });
    if (!item) return res.status(404).json({ success: false, message: 'Brand not found' });

    if (name && name !== item.name) {
      const existing = await Brand.findOne({ name, _id: { $ne: itemId } });
      if (existing) return res.status(400).json({ success: false, message: 'Brand with this name already exists' });
    }

    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    if (status !== undefined) item.status = status;

    const updated = await item.save();
    await searchCache.invalidate('brands:search:' + req.organizationId + ':*');

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.deleteBrand = async (req, res) => {
  try {
    const itemId = req.params.id;
    const item = await Brand.findOne({ _id: itemId });

    if (!item) return res.status(404).json({ success: false, message: "Brand not found" });

    item.status = "inactive";
    item.isActive = false;
    item.isDeleted = true;
    await item.save();

    await searchCache.invalidate('brands:search:' + req.organizationId + ':*');
    res.status(200).json({ success: true, message: "Brand deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.searchBrands = async (req, res) => {
  try {
    const { keyword } = req.query;
    const cacheKey = 'brands:search:' + req.organizationId + ':' + (keyword || '');

    const items = await searchCache.getOrSet(cacheKey, async () => {
      return await Brand.find({
        isDeleted: { $ne: true },
        name: { $regex: keyword || '', $options: "i" },
      }).sort({ name: 1 }).limit(20);
    }, 600);

    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
