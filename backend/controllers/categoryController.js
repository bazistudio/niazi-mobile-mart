const Category = require('../models/Category');
const searchCache = require('../services/searchCache.service');


// @desc    Create a new category
// @route   POST /api/categories
// @access  Private
exports.createCategory = async (req, res) => {
  try {
    let { name, description, status } = req.body;
    // Format name to Title Case to prevent duplicates
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    let { categoryCode } = req.body;
    const shopId = req.user.shopId;

    if (!categoryCode && name) {
      categoryCode = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 10) + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    // Check if category name already exists for this org and is active
    const existingCategory = await Category.findOne({ 
      organizationId: req.organizationId, 
      name, 
      status: { $ne: 'inactive' },
      isDeleted: { $ne: true } 
    });
    if (existingCategory) {
      return res.status(400).json({ success: false, message: 'Category with this name already exists' });
    }

    const category = new Category({
      name,
      categoryCode,
      description,
      status: status || 'ACTIVE',
      shopId,
      organizationId: req.organizationId,
    });

    const savedCategory = await category.save();

    await searchCache.invalidate(`categories:search:${req.organizationId}:*`);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: savedCategory,
    });
  } catch (error) {
    console.error('Create Category Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating category', error: error.message });
  }
};

// @desc    Get all categories for logged-in shop
// @route   GET /api/categories
// @access  Private
exports.getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    const query = {
      organizationId: req.organizationId,
      status: { $in: ['ACTIVE', 'active'] },
    };

    const categories = await Category.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Category.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      data: categories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get Categories Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching categories', error: error.message });
  }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private
exports.updateCategory = async (req, res) => {
  try {
    let { name, description, status } = req.body;
    if (name) {
      name = name.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const categoryId = req.params.id;

    const category = await Category.findOne({ _id: categoryId, organizationId: req.organizationId });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ 
        organizationId: req.organizationId, 
        name, 
        status: { $ne: 'inactive' },
        isDeleted: { $ne: true } 
      });
      if (existingCategory) {
        return res.status(400).json({ success: false, message: 'Category with this name already exists' });
      }
    }

    category.name = name || category.name;
    category.description = description !== undefined ? description : category.description;
    category.status = status || category.status;

    const updatedCategory = await category.save();

    await searchCache.invalidate(`categories:search:${req.organizationId}:*`);

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });
  } catch (error) {
    console.error('Update Category Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating category', error: error.message });
  }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private
exports.deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findOne({
      _id: categoryId,
      organizationId: req.organizationId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    category.status = "inactive";
    category.isDeleted = true;
    await category.save();

    await searchCache.invalidate(`categories:search:${req.organizationId}:*`);

    res.status(200).json({
      success: true,
      message: "Category deactivated",
    });
  } catch (error) {
    console.error('Delete Category Error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting category', error: error.message });
  }
};

// @desc    Search active categories by keyword
// @route   GET /api/categories/search
// @access  Private
exports.searchCategories = async (req, res) => {
  try {
    const { keyword } = req.query;

    const cacheKey = `categories:search:${req.organizationId}:${keyword || ''}`;

    const categories = await searchCache.getOrSet(cacheKey, async () => {
      return await Category.find({
        organizationId: req.organizationId,
        status: { $in: ['ACTIVE', 'active'] },
        name: {
          $regex: keyword,
          $options: "i",
        },
      }).sort({ createdAt: -1 });
    }, 600);

    res.json({
      success: true,
      data: categories,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
