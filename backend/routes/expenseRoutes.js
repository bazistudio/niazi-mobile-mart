const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant.middleware');
const {
  createExpense,
  getExpenses,
  deleteExpense,
  updateExpense,
  getExpenseTrace,
  getStats
} = require('../controllers/expenseController');

router.use(requireAuth);

router.route('/')
  .post(createExpense)
  .get(getExpenses);

router.route('/stats')
  .get(getStats);

router.route('/:id')
  .put(updateExpense)
  .delete(deleteExpense);

router.route('/:id/trace')
  .get(getExpenseTrace);

module.exports = router;
