require('dotenv').config();
const { connectDB } = require('./db/connection');
const Role = require('./models/Role');
const RolePermission = require('./models/RolePermission');

async function main() {
  await connectDB();
  const brokenRoles = await Role.find({ permissions: { [${'$'}size]: 0 }, isSystem: true })
    .setOptions({ skipTenantGuard: true }).lean();
  console.log('Found broken roles: ' + brokenRoles.length);
  for (const role of brokenRoles) {
    await RolePermission.deleteMany({ roleId: role._id });
    await Role.deleteOne({ _id: role._id }).setOptions({ skipTenantGuard: true });
    console.log('Deleted: ' + role.name);
  }
  console.log('Cleanup done.');
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
