const express = require('express');
const router = express.Router();

const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  searchCategories,
} = require('../controllers/categoryController');

// Import authentication middleware (ensure this file/function exists in your middleware folder)
const requireAuth = require('../middleware/auth');

// Note: Ensure this router is mounted in server.js similarly to this:
// const categoryRoutes = require('./routes/categoryRoutes');
// app.use('/api/categories', categoryRoutes);

router.post('/add', requireAuth, createCategory);
router.post('/', requireAuth, createCategory);
router.get('/my-categories', requireAuth, getCategories);
router.get('/', requireAuth, getCategories);
const { searchLimiter } = require('../middleware/rateLimit.middleware');

router.get('/search', requireAuth, searchLimiter, searchCategories);

router.put('/update/:id', requireAuth, updateCategory);
router.delete('/delete/:id', requireAuth, deleteCategory);

router.put('/:id', requireAuth, updateCategory);
router.delete('/:id', requireAuth, deleteCategory);

module.exports = router;
