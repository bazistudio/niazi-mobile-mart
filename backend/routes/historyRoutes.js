const express = require('express');
const router = express.Router();
const { getHistory, getStats, getLedgerTrace } = require('../controllers/historyController');

router.get('/', getHistory);
router.get('/stats', getStats);
router.get('/trace/:id', getLedgerTrace);

module.exports = router;
