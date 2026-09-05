const express = require('express');
const router = express.Router();

const {
  createColor,
  getColors,
  updateColor,
  deleteColor,
} = require('../controllers/colorController');

const requireAuth = require('../middleware/auth');

router.post('/', requireAuth, createColor);
router.get('/', requireAuth, getColors);
router.patch('/:id', requireAuth, updateColor);
router.put('/:id', requireAuth, updateColor);
router.delete('/:id', requireAuth, deleteColor);

module.exports = router;
