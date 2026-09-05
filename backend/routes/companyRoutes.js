const express = require('express');
const router = express.Router();

const {
  createCompany,
  getCompanies,
  updateCompany,
  deleteCompany,
} = require('../controllers/companyController');

const requireAuth = require('../middleware/auth');

router.post('/', requireAuth, createCompany);
router.get('/', requireAuth, getCompanies);
router.patch('/:id', requireAuth, updateCompany);
router.put('/:id', requireAuth, updateCompany);
router.delete('/:id', requireAuth, deleteCompany);

module.exports = router;
