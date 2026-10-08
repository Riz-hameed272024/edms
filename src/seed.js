'use strict';
// Seeds the first admin ONLY from environment/Secret values (no default credentials in code).
const authService = require('./services/authService');

module.exports = async function seed() {
  const pw = process.env.SEED_ADMIN_PASSWORD;
  const mfa = process.env.SEED_ADMIN_MFA_SECRET;
  if (!pw || !mfa) return;
  await authService.createUser({ username: 'admin', password: pw, role: 'ADMIN', name: 'System Admin', mfaSecret: mfa });
  process.stdout.write(JSON.stringify({ level: 'info', msg: 'Seeded initial admin account' }) + '\n');
};
