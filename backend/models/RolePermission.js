const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const rolePermissionSchema = new mongoose.Schema(
  {
    roleId: {
      type: String,
      ref: "Role",
      required: true,
      index: true,
    },
    permissionId: {
      type: String,
      ref: "Permission",
      required: true,
      index: true,
    }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

rolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

// RolePermission inherits tenant isolation from Role implicitly in most apps,
// but adding tenant false for now, or true if we want strict isolation on this mapping.
// Since Role isolates it, tenant: false is typical, but we'll use tenant: false 
// with publicPrefix for consistency.
applyEnterprisePlugins(rolePermissionSchema, { tenant: false, publicPrefix: "RLP" });

module.exports = mongoose.model("RolePermission", rolePermissionSchema);
