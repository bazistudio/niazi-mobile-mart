const express = require('express');
const router = express.Router();

const {
  addCustomer,
  getCustomers,
  searchCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerDetail,
} = require('../controllers/customerController');

const requireAuth = require('../middleware/auth');

router.post('/', requireAuth, addCustomer);

router.get('/search', requireAuth, searchCustomers);

router.get('/', requireAuth, getCustomers);

router.put('/:id', requireAuth, updateCustomer);

router.get('/:id/detail', requireAuth, getCustomerDetail);

router.delete('/:id', requireAuth, deleteCustomer);

module.exports = router;
