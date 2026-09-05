const { organizationService } = require('../container');
// We require the other services directly from container if they exist, or for now, we'll assume they will be added.
// Note: organizationLimitService and organizationDashboardService should be added to container too.
const { organizationLimitService, organizationDashboardService } = require('../container');

exports.create = async (req, res) => {
  try {
    const org = await organizationService.createOrganization(req.body, req.user.id);
    res.status(201).json({ success: true, data: org });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create organization', error: error.message });
  }
};

exports.getMyOrganizations = async (req, res) => {
  try {
    const organizations = await organizationService.getMyOrganizations(req.user.id);
    res.status(200).json({ success: true, data: organizations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch organizations', error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const org = await organizationService.getOrganizationDetails(req.params.id);
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found' });
    res.status(200).json({ success: true, data: org });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch organization', error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const org = await organizationService.updateOrganization(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data: org });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update organization', error: error.message });
  }
};

exports.getLimits = async (req, res) => {
  try {
    const data = await organizationLimitService.getEffectiveLimits(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch organization limits', error: error.message });
  }
};

exports.updateLimits = async (req, res) => {
  try {
    const orgId = req.params.id;
    await organizationService.updateLimits(orgId, req.body, req.user.id);
    
    const data = await organizationLimitService.getEffectiveLimits(orgId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update organization limits', error: error.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const data = await organizationDashboardService.getDashboard(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load organization dashboard', error: error.message });
  }
};

// createShop was moved to shop.controller.js
