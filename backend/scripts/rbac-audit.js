const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');

function scanRoutes() {
  console.log('🛡️ Starting RBAC (Role-Based Access Control) Static Audit...\n');
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

  let insecureCount = 0;
  let totalWriteRoutes = 0;

  files.forEach(file => {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Simple regex to catch router.post, router.put, router.patch, router.delete
    const routeRegex = /router\.(post|put|patch|delete)\(["']([^"']+)["']/g;
    
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      totalWriteRoutes++;
      const method = match[1].toUpperCase();
      const routePath = match[2];
      
      // Find the exact line
      const line = lines.find(l => l.includes(match[0]));
      
      // Check if role() or superAdmin is used, or if auth is omitted
      // We also check if the whole file has router.use(auth) or router.use(requireAuth)
      const fileHasGlobalAuth = content.includes('router.use(auth)') || content.includes('router.use(requireAuth)');
      const fileHasGlobalRole = content.includes('router.use(role') || content.includes('router.use(superAdmin)');
      
      const lineHasAuth = line.includes('auth') || line.includes('requireAuth');
      const lineHasRole = line.includes('role(') || line.includes('superAdmin') || line.includes('requireSuperAdmin');

      const isAuthSecure = fileHasGlobalAuth || lineHasAuth;
      const isRoleSecure = fileHasGlobalRole || lineHasRole;

      if (!isRoleSecure) {
        // Exclude public routes like auth/login
        if (file.includes('auth') || file.includes('otp')) continue;
        
        console.warn(`⚠️ INSECURE ROUTE FOUND in ${file}:`);
        console.warn(`   ${method} ${routePath}`);
        console.warn(`   Missing explicit role enforcement!`);
        insecureCount++;
      }
    }
  });

  console.log('\n📊 Audit Summary:');
  console.log(`Total Write Routes Scanned: ${totalWriteRoutes}`);
  
  if (insecureCount === 0) {
    console.log('✅ ALL WRITE ROUTES SECURED. RBAC enforcement is tight.');
    process.exit(0);
  } else {
    console.error(`❌ FOUND ${insecureCount} ROUTES MISSING ROLE ENFORCEMENT.`);
    process.exit(1);
  }
}

scanRoutes();
