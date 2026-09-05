const fs = require('fs');
const path = require('path');

const entities = [
  { model: 'Brand', name: 'Brand', routeName: 'brand', controllerName: 'brandController' },
  { model: 'ItemType', name: 'ItemType', routeName: 'itemType', controllerName: 'itemTypeController' },
  { model: 'Unit', name: 'Unit', routeName: 'unit', controllerName: 'unitController' }
];

const backendPath = path.join(__dirname);

entities.forEach(entity => {
  // Controller
  const controllerCode = `const ${entity.model} = require('../models/${entity.model}');
const searchCache = require('../services/searchCache.service');

exports.create${entity.name} = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const shopId = req.user.shopId;

    const existing = await ${entity.model}.findOne({ tenantId: req.tenantId, name });
    if (existing) {
      return res.status(400).json({ success: false, message: '${entity.name} with this name already exists' });
    }

    const item = new ${entity.model}({
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
    await searchCache.invalidate('${entity.routeName}s:search:' + req.tenantId + ':*');

    res.status(201).json({ success: true, message: "${entity.name} created successfully", data: saved });
  } catch (error) {
    console.error('Create ${entity.name} Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating ${entity.name}', error: error.message });
  }
};

exports.get${entity.name}s = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const items = await ${entity.model}.find({
      tenantId: req.tenantId,
      $or: [{ status: "ACTIVE" }, { isActive: true }, { status: "active" }]
    })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await ${entity.model}.countDocuments({
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

exports.update${entity.name} = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const itemId = req.params.id;

    const item = await ${entity.model}.findOne({ _id: itemId, tenantId: req.tenantId });
    if (!item) return res.status(404).json({ success: false, message: '${entity.name} not found' });

    if (name && name !== item.name) {
      const existing = await ${entity.model}.findOne({ tenantId: req.tenantId, name });
      if (existing) return res.status(400).json({ success: false, message: '${entity.name} with this name already exists' });
    }

    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    if (status !== undefined) item.status = status;

    const updated = await item.save();
    await searchCache.invalidate('${entity.routeName}s:search:' + req.tenantId + ':*');

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.delete${entity.name} = async (req, res) => {
  try {
    const itemId = req.params.id;
    const item = await ${entity.model}.findOne({ _id: itemId, tenantId: req.tenantId });

    if (!item) return res.status(404).json({ success: false, message: "${entity.name} not found" });

    item.status = "INACTIVE";
    item.isActive = false;
    await item.save();

    await searchCache.invalidate('${entity.routeName}s:search:' + req.tenantId + ':*');
    res.status(200).json({ success: true, message: "${entity.name} deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.search${entity.name}s = async (req, res) => {
  try {
    const { keyword } = req.query;
    const cacheKey = '${entity.routeName}s:search:' + req.tenantId + ':' + (keyword || '');

    const items = await searchCache.getOrSet(cacheKey, async () => {
      return await ${entity.model}.find({
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
`;

  // Route
  const routeCode = `const express = require('express');
const router = express.Router();

const {
  create${entity.name},
  get${entity.name}s,
  update${entity.name},
  delete${entity.name},
  search${entity.name}s,
} = require('../controllers/${entity.controllerName}');

const requireAuth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimit.middleware');

router.post('/add', requireAuth, create${entity.name});
router.post('/', requireAuth, create${entity.name});
router.get('/', requireAuth, get${entity.name}s);
router.get('/search', requireAuth, searchLimiter, search${entity.name}s);
router.put('/update/:id', requireAuth, update${entity.name});
router.delete('/delete/:id', requireAuth, delete${entity.name});

module.exports = router;
`;

  fs.writeFileSync(path.join(backendPath, 'controllers', entity.controllerName + '.js'), controllerCode);
  fs.writeFileSync(path.join(backendPath, 'routes', entity.routeName + 'Routes.js'), routeCode);
  console.log('Created ' + entity.name + ' controller and routes');
});
