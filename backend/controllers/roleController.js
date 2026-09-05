const { roleService } = require('../container');

exports.getRoles = async (req, res) => {
  try {
    const organizationId = req.user.organizationId || req.organizationId || req.user.tenantId; // fallback to tenantId if that's what's used
    const roles = await roleService.getRolesByOrganization(organizationId);
    res.json(roles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getRoleById = async (req, res) => {
  try {
    const role = await roleService.getRoleById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    res.json(role);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createRole = async (req, res) => {
  try {
    const organizationId = req.user.organizationId || req.organizationId || req.user.tenantId;
    const role = await roleService.createRole({ ...req.body, organizationId });
    res.status(201).json(role);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { permissions, ...data } = req.body;
    const organizationId = req.user.organizationId || req.organizationId || req.user.tenantId;
    
    if (permissions) {
       await roleService.assignPermissionsToRole(req.params.id, permissions, organizationId);
    }
    
    const role = await roleService.getRoleById(req.params.id);
    res.json(role);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const organizationId = req.user.organizationId || req.organizationId || req.user.tenantId;
    await roleService.deleteRole(req.params.id, organizationId);
    res.json({ message: 'Role deleted' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

exports.duplicateRole = async (req, res) => {
  try {
    const organizationId = req.user.organizationId || req.organizationId || req.user.tenantId;
    const originalRole = await roleService.getRoleById(req.params.id);
    if (!originalRole) {
      return res.status(404).json({ message: 'Original role not found' });
    }
    const role = await roleService.duplicateRole(req.params.id, originalRole.name, organizationId);
    res.status(201).json(role);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};
