const express = require('express');
const router = express.Router();
const orgMemberController = require('../controllers/orgMemberController');
const auth = require('../middleware/auth');
const orgAccessMiddleware = require('../middleware/orgAccessMiddleware');
const { PERMISSIONS } = require('../config/permissions');

// Note: organizationId needs to be provided in the header or query for orgAccessMiddleware
router.get('/', 
  auth, 
  orgAccessMiddleware([PERMISSIONS.USERS_VIEW]), 
  orgMemberController.getMembers
);

router.post('/', 
  auth, 
  orgAccessMiddleware([PERMISSIONS.USERS_MANAGE]), 
  orgMemberController.addMember
);

router.put('/:memberId', 
  auth, 
  orgAccessMiddleware([PERMISSIONS.USERS_MANAGE]), 
  orgMemberController.updateMember
);

router.delete('/:memberId', 
  auth, 
  orgAccessMiddleware([PERMISSIONS.USERS_MANAGE]), 
  orgMemberController.removeMember
);

module.exports = router;

