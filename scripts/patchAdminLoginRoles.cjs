const fs = require('fs');

const files = [
  'src/controllers/auth.ts',
  'dist/controllers/auth.js',
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  let text = fs.readFileSync(file, 'utf8');
  const updated = text
    .replaceAll("const allowedRoles = ['head', 'superadmin', 'admin', 'platform_admin'];", "const allowedRoles = ['head', 'super_admin', 'superadmin', 'admin', 'platform_admin'];")
    .replaceAll('const allowedRoles = ["head", "superadmin", "admin", "platform_admin"];', 'const allowedRoles = ["head", "super_admin", "superadmin", "admin", "platform_admin"];');

  if (updated !== text) {
    fs.writeFileSync(file, updated);
    console.log(`[patchAdminLoginRoles] patched ${file}`);
  }
}
