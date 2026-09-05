const express = require('express');
const router = express.Router();

const {
  createItemType,
  getItemTypes,
  updateItemType,
  deleteItemType,
  searchItemTypes,
} = require('../controllers/itemTypeController');

const requireAuth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimit.middleware');

router.post('/add', requireAuth, createItemType);
router.post('/', requireAuth, createItemType);
router.get('/', requireAuth, getItemTypes);
router.get('/search', requireAuth, searchLimiter, searchItemTypes);
router.put('/update/:id', requireAuth, updateItemType);
router.delete('/delete/:id', requireAuth, deleteItemType);

module.exports = router;
