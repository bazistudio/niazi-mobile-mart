const express = require('express');
const router = express.Router();
const { getNotifications } = require('../controllers/notificationController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, getNotifications);

module.exports = router;
