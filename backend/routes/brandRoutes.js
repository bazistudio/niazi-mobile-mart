const express = require('express');
const router = express.Router();

const {
  createBrand,
  getBrands,
  updateBrand,
  deleteBrand,
  searchBrands,
} = require('../controllers/brandController');

const requireAuth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimit.middleware');

router.post('/add', requireAuth, createBrand);
router.post('/', requireAuth, createBrand);
router.get('/', requireAuth, getBrands);
router.get('/search', requireAuth, searchLimiter, searchBrands);
router.put('/update/:id', requireAuth, updateBrand);
router.delete('/delete/:id', requireAuth, deleteBrand);

router.put('/:id', requireAuth, updateBrand);
router.delete('/:id', requireAuth, deleteBrand);

module.exports = router;
