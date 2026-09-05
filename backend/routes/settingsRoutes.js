const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissionMiddleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { getStaff, createStaff, updateStaff } = require('../controllers/staffController');
const { getRoleMatrices, updateRoleMatrix } = require('../controllers/roleMatrixController');
const roleController = require('../controllers/roleController');
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.use(requireAuth);

// --- GENERAL SETTINGS ---
router.route('/')
  .get(checkPermission('MANAGE_SETTINGS'), getSettings)
  .put(checkPermission('MANAGE_SETTINGS'), updateSettings);

// --- STAFF MANAGEMENT ---
router.route('/staff')
  .get(checkPermission('MANAGE_USERS'), getStaff)
  .post(checkPermission('MANAGE_USERS'), createStaff);

router.route('/staff/:id')
  .put(checkPermission('MANAGE_USERS'), updateStaff);

// --- ROLE MATRIX MANAGEMENT (LEGACY) ---
router.route('/legacy-roles')
  .get(checkPermission('MANAGE_SETTINGS'), getRoleMatrices);

router.route('/legacy-roles/:roleId')
  .put(checkPermission('MANAGE_SETTINGS'), updateRoleMatrix);

// --- NEW ROLE & ACCESS SYSTEM ---
router.route('/roles')
  .get(checkPermission('MANAGE_SETTINGS'), roleController.getRoles)
  .post(checkPermission('MANAGE_SETTINGS'), roleController.createRole);

router.route('/roles/:id')
  .get(checkPermission('MANAGE_SETTINGS'), roleController.getRoleById)
  .put(checkPermission('MANAGE_SETTINGS'), roleController.updateRole)
  .delete(checkPermission('MANAGE_SETTINGS'), roleController.deleteRole);

router.route('/roles/:id/duplicate')
  .post(checkPermission('MANAGE_SETTINGS'), roleController.duplicateRole);

module.exports = router;
