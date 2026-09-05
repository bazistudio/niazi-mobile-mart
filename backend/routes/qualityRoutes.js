const express = require('express');
const router = express.Router();

const {
  createQuality,
  getQualities,
  updateQuality,
  deleteQuality,
} = require('../controllers/qualityController');

const requireAuth = require('../middleware/auth');

router.post('/', requireAuth, createQuality);
router.get('/', requireAuth, getQualities);
router.patch('/:id', requireAuth, updateQuality);
router.put('/:id', requireAuth, updateQuality);
router.delete('/:id', requireAuth, deleteQuality);

module.exports = router;
