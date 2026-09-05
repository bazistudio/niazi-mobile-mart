const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const auth = require('../middleware/auth');
const orgAccessMiddleware = require('../middleware/orgAccessMiddleware');
const { PERMISSIONS } = require('../config/permissions');

router.post('/', auth, organizationController.create);
router.get('/my', auth, organizationController.getMyOrganizations);

// Org specific routes
router.get('/:id/dashboard',
  auth,
  orgAccessMiddleware([PERMISSIONS.ORG_VIEW]),
  organizationController.dashboard
);

router.get('/:id', 
  auth, 
  orgAccessMiddleware([PERMISSIONS.ORG_VIEW]), 
  organizationController.getById
);

router.put('/:id', 
  auth, 
  orgAccessMiddleware([PERMISSIONS.ORG_SETTINGS_MANAGE]), 
  organizationController.update
);

module.exports = router;
