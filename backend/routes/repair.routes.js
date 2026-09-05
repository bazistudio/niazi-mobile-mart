const express = require('express');
const router = express.Router();
const repairController = require('../controllers/repair.controller');
const protect = require('../middleware/auth');

router.use(protect);

router.post('/', repairController.createRepairJob);
router.get('/', repairController.getRepairJobs);
router.get('/:id', repairController.getRepairJobById);
router.patch('/:id/status', repairController.updateStatus);
router.post('/:id/parts', repairController.addPart);
router.post('/:id/payments', repairController.addPayment);

module.exports = router;
