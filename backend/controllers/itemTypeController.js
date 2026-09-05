const ItemType = require('../models/ItemType');
const searchCache = require('../services/searchCache.service');

exports.createItemType = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const shopId = req.user.shopId;

    const existing = await ItemType.findOne({ tenantId: req.tenantId, name });
    if (existing) {
      return res.status(400).json({ success: false, message: 'ItemType with this name already exists' });
    }

    const item = new ItemType({
      name,
      description,
      status: status || 'ACTIVE',
      isActive: true,
      shopId,
      tenantId: req.tenantId,
      organizationId: req.tenantId,
    });

    const saved = await item.save();
    
    // Invalidate search cache
    await searchCache.invalidate('itemTypes:search:' + req.tenantId + ':*');

    res.status(201).json({ success: true, message: "ItemType created successfully", data: saved });
  } catch (error) {
    console.error('Create ItemType Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating ItemType', error: error.message });
  }
};

exports.getItemTypes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const items = await ItemType.find({
      tenantId: req.tenantId,
      $or: [{ status: "ACTIVE" }, { isActive: true }, { status: "active" }]
    })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await ItemType.countDocuments({
      tenantId: req.tenantId,
      $or: [{ status: "ACTIVE" }, { isActive: true }, { status: "active" }]
    });

    res.status(200).json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateItemType = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const itemId = req.params.id;

    const item = await ItemType.findOne({ _id: itemId, tenantId: req.tenantId });
    if (!item) return res.status(404).json({ success: false, message: 'ItemType not found' });

    if (name && name !== item.name) {
      const existing = await ItemType.findOne({ tenantId: req.tenantId, name });
      if (existing) return res.status(400).json({ success: false, message: 'ItemType with this name already exists' });
    }

    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    if (status !== undefined) item.status = status;

    const updated = await item.save();
    await searchCache.invalidate('itemTypes:search:' + req.tenantId + ':*');

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.deleteItemType = async (req, res) => {
  try {
    const itemId = req.params.id;
    const item = await ItemType.findOne({ _id: itemId, tenantId: req.tenantId });

    if (!item) return res.status(404).json({ success: false, message: "ItemType not found" });

    item.status = "INACTIVE";
    item.isActive = false;
    await item.save();

    await searchCache.invalidate('itemTypes:search:' + req.tenantId + ':*');
    res.status(200).json({ success: true, message: "ItemType deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.searchItemTypes = async (req, res) => {
  try {
    const { keyword } = req.query;
    const cacheKey = 'itemTypes:search:' + req.tenantId + ':' + (keyword || '');

    const items = await searchCache.getOrSet(cacheKey, async () => {
      return await ItemType.find({
        tenantId: req.tenantId,
        $or: [{ status: "ACTIVE" }, { isActive: true }, { status: "active" }],
        name: { $regex: keyword || '', $options: "i" },
      }).sort({ name: 1 }).limit(20);
    }, 600);

    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
