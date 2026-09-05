const { roleMatrixService } = require('../container');

exports.getRoleMatrices = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId;

    const matrices = await roleMatrixService.getRoleMatrices(tenantId, shopId);
    res.json(matrices);
  } catch (err) {
    const status = err.message === 'Role matrix not found' ? 404 : 500;
    res.status(status).json({ message: err.message });
  }
};

exports.updateRoleMatrix = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId;
    const { roleId } = req.params;
    const { permissions } = req.body;

    const matrix = await roleMatrixService.updateRoleMatrix(roleId, tenantId, shopId, permissions);
    res.json(matrix);
  } catch (err) {
    const status = err.message === 'Role matrix not found' ? 404 : 500;
    res.status(status).json({ message: err.message });
  }
};
