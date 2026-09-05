const express = require('express');
const router = express.Router();

const {
  createUnit,
  getUnits,
  updateUnit,
  deleteUnit,
  searchUnits,
} = require('../controllers/unitController');

const requireAuth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimit.middleware');

router.post('/add', requireAuth, createUnit);
router.post('/', requireAuth, createUnit);
router.get('/', requireAuth, getUnits);
router.get('/search', requireAuth, searchLimiter, searchUnits);
router.put('/update/:id', requireAuth, updateUnit);
router.delete('/delete/:id', requireAuth, deleteUnit);

module.exports = router;
