const express = require('express');
const router = express.Router();
const { recordPayment, recordPayout, getPartyLedger } = require('../controllers/ledgerController');

router.post('/payment', recordPayment);
router.post('/payout', recordPayout);
router.get('/:partyId', getPartyLedger);

module.exports = router;
