'use strict';
// Authentication (SR-01, SR-11): bcrypt, TOTP MFA for staff, lockout, short-lived RS256 JWT.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const config = require('../config');
const { state } = require('../lib/store');
const { AppError } = require('../lib/errors');
const audit = require('./auditService');
const { securityEvent } = require('../lib/logger');

const ROLES = ['ADMIN', 'COORDINATOR', 'RESCUE', 'MEDICAL', 'VOLUNTEER', 'PUBLIC'];
const MFA_ROLES = new Set(['ADMIN', 'COORDINATOR', 'RESCUE', 'MEDICAL']);
const GENERIC = 'Invalid username or password';
// Accept the previous/next 30 s step for clock drift; reject replay of an already used code.
authenticator.options = { window: 1 };

async function createUser({ username, password, role, name, mfaSecret }) {
  if (!ROLES.includes(role)) throw new AppError(400, 'Invalid role');
  const user = {
    id: crypto.randomUUID(), username, name: name || username, role,
    passwordHash: await bcrypt.hash(password, 12),
    mfaSecret: MFA_ROLES.has(role) ? (mfaSecret || authenticator.generateSecret()) : null,
    failedLogins: 0, lockedUntil: 0, tokenVersion: 0, status: 'ACTIVE',
  };
  state.users.set(user.id, user);
  return user;
}

function findByUsername(username) {
  for (const u of state.users.values()) if (u.username === username) return u;
  return null;
}

async function login({ username, password, totp }, ip) {
  const user = findByUsername(username);
  if (!user) {
    await bcrypt.compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Fd0Tq0b9KfQ1aTqvq0yQnO0iGJm9e2'); // equal timing
    securityEvent('LOGIN_FAILED', { username, ip, reason: 'unknown_user' });
    throw new AppError(401, GENERIC);
  }
  if (user.lockedUntil > Date.now()) {
    securityEvent('LOGIN_LOCKED', { user: user.id, ip });
    throw new AppError(423, 'Account temporarily locked. Try again later.');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  const mfaOk = !user.mfaSecret || (typeof totp === 'string' && totp !== user.lastTotp && authenticator.check(totp, user.mfaSecret));
  if (!ok || !mfaOk) {
    user.failedLogins += 1;
    if (user.failedLogins >= config.lockout.maxFailures) {
      user.lockedUntil = Date.now() + config.lockout.lockMinutes * 60000;
      audit.record(user.id, 'ACCOUNT_LOCKED', `user:${user.id}`, { ip });
    }
    securityEvent('LOGIN_FAILED', { user: user.id, ip, reason: ok ? 'mfa' : 'password' });
    throw new AppError(401, GENERIC);
  }
  user.failedLogins = 0;
  if (user.mfaSecret) user.lastTotp = totp;
  audit.record(user.id, 'LOGIN_SUCCESS', `user:${user.id}`, { ip });
  return issueToken(user);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, config.jwt.privateKey, {
    algorithm: config.jwt.algorithm, expiresIn: config.jwt.expiresIn, issuer: config.jwt.issuer,
  });
}

// Policy Decision Point input: verify signature with a pinned algorithm, then load the
// CURRENT role from the store so a stolen or stale token cannot keep old privileges.
function verifyToken(token) {
  const claims = jwt.verify(token, config.jwt.publicKey, { algorithms: ['RS256'], issuer: config.jwt.issuer });
  const user = state.users.get(claims.sub);
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== claims.tv) throw new Error('revoked');
  return { id: user.id, role: user.role, username: user.username };
}

module.exports = { createUser, login, verifyToken, issueToken, ROLES, MFA_ROLES, findByUsername };
