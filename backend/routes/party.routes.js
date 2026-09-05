const express = require('express');
const router = express.Router();
const {
  addParty,
  getParties,
  getPartyDetail,
  updateParty,
  deleteParty,
  getPartyLedger,
} = require('../controllers/party.controller');

// All routes are protected by auth and tenantMiddleware (in server.js)
router.post('/', addParty);
router.get('/', getParties);
router.get('/:id', getPartyDetail);
router.patch('/:id', updateParty);
router.delete('/:id', deleteParty);
router.get('/:id/ledger', getPartyLedger);

module.exports = router;
