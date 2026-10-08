const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const store = require('../../src/lib/store');
const audit = require('../../src/services/auditService');
const auth = require('../../src/services/authService');
const users = require('../../src/services/userService');

const PW = 'Str0ng!Passw0rd#2026';

describe('authService (SR-01, SR-11)', () => {
  let coord, admin;
  beforeEach(async () => {
    store.reset(); audit._reset();
    coord = await auth.createUser({ username: 'coord', password: PW, role: 'COORDINATOR' });
    admin = await auth.createUser({ username: 'admin', password: PW, role: 'ADMIN' });
  });

  test('password is stored as bcrypt hash, never plaintext', () => {
    expect(coord.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(coord.passwordHash).not.toContain(PW);
  });

  test('staff login requires a valid TOTP', async () => {
    await expect(auth.login({ username: 'coord', password: PW }, '1.1.1.1')).rejects.toThrow('Invalid username or password');
    const token = await auth.login({ username: 'coord', password: PW, totp: authenticator.generate(coord.mfaSecret) }, '1.1.1.1');
    expect(auth.verifyToken(token)).toMatchObject({ id: coord.id, role: 'COORDINATOR' });
  });

  test('account locks after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(auth.login({ username: 'coord', password: 'wrong' }, 'ip')).rejects.toThrow();
    }
    await expect(auth.login({ username: 'coord', password: PW, totp: authenticator.generate(coord.mfaSecret) }, 'ip'))
      .rejects.toThrow('Account temporarily locked');
  });

  test('unknown user and wrong password give the same message (no enumeration)', async () => {
    await expect(auth.login({ username: 'nobody', password: 'x' }, 'ip')).rejects.toThrow('Invalid username or password');
    await expect(auth.login({ username: 'coord', password: 'x' }, 'ip')).rejects.toThrow('Invalid username or password');
  });

  test('alg=none / forged tokens are rejected (V-05, T-12)', () => {
    const forged = jwt.sign({ sub: coord.id, role: 'ADMIN', tv: 0 }, null, { algorithm: 'none' });
    expect(() => auth.verifyToken(forged)).toThrow();
    const hs = jwt.sign({ sub: coord.id, role: 'ADMIN', tv: 0, iss: 'edms' }, 'edms-secret-123', { algorithm: 'HS256' });
    expect(() => auth.verifyToken(hs)).toThrow();
  });

  test('role change revokes existing tokens (DEF-02)', () => {
    const token = auth.issueToken(coord);
    users.changeRole(admin, coord.id, { role: 'VOLUNTEER', reason: 'left the control room' });
    expect(() => auth.verifyToken(token)).toThrow('revoked');
  });
});

test('a TOTP code cannot be replayed', async () => {
  store.reset(); audit._reset();
  const u = await auth.createUser({ username: 'medic', password: PW, role: 'MEDICAL' });
  const code = authenticator.generate(u.mfaSecret);
  await auth.login({ username: 'medic', password: PW, totp: code }, 'ip');
  await expect(auth.login({ username: 'medic', password: PW, totp: code }, 'ip')).rejects.toThrow('Invalid username or password');
});
