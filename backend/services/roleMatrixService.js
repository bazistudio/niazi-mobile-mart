class RoleMatrixService {
  constructor(roleMatrixRepository) {
    this.roleMatrixRepository = roleMatrixRepository;
  }

  async getRoleMatrices(tenantId, shopId) {
    return await this.roleMatrixRepository.findMany({ tenantId, shopId });
  }

  async updateRoleMatrix(roleId, tenantId, shopId, permissions) {
    const matrix = await this.roleMatrixRepository.findOne({ _id: roleId, shopId, tenantId });
    if (!matrix) throw new Error("Role matrix not found");
    
    matrix.permissions = permissions;
    return await this.roleMatrixRepository.updateById(matrix._id, matrix);
  }
}

module.exports = RoleMatrixService;
