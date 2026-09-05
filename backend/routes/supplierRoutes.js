const express = require('express');
const router = express.Router();
const {
  addSupplier,
  getSuppliers,
  searchSuppliers,
  updateSupplier,
  deleteSupplier,
  getSupplierDetail,
} = require('../controllers/supplierController');

// All routes are protected by auth and tenantMiddleware (in server.js)
router.post('/', addSupplier);
router.get('/', getSuppliers);
router.get('/search', searchSuppliers);
router.patch('/:id', updateSupplier);
router.get('/:id/detail', getSupplierDetail);
router.delete('/:id', deleteSupplier);

module.exports = router;
