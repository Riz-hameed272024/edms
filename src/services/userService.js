'use strict';
// Role administration (SR-02, SR-03). AFTER version: fixes V-02 mass assignment and self-escalation.
const { state } = require('../lib/store');
const { AppError } = require('../lib/errors');
const audit = require('./auditService');
const approvals = require('./approvalService');
const { ROLES } = require('./authService');
const { securityEvent } = require('../lib/logger');

function applyRole(userId, role, actorId, reason) {
  const user = state.users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  const old = user.role;
  user.role = role;
  user.tokenVersion += 1; // revoke existing tokens (fix for DEF-02)
  audit.record(actorId, 'ROLE_CHANGED', `user:${userId}`, { old, new: role, reason });
  securityEvent('ROLE_CHANGED', { actor: actorId, user: userId, old, new: role });
  return { id: user.id, role: user.role };
}

approvals.register('ROLE_GRANT_ADMIN', {
  approverRoles: ['ADMIN'],
  execute: (p, approver) => applyRole(p.userId, 'ADMIN', approver.id, p.reason),
});

function changeRole(actor, userId, { role, reason }) {
  if (!ROLES.includes(role)) throw new AppError(400, 'Invalid role');
  if (actor.id === userId) {
    securityEvent('SELF_ROLE_CHANGE_BLOCKED', { actor: actor.id });
    throw new AppError(403, 'You cannot change your own role');
  }
  if (!state.users.has(userId)) throw new AppError(404, 'User not found');
  if (role === 'ADMIN') {
    const req = approvals.create('ROLE_GRANT_ADMIN', { userId, reason }, actor);
    return { status: 'PENDING_APPROVAL', requestId: req.id };
  }
  return { status: 'APPLIED', user: applyRole(userId, role, actor.id, reason) };
}

// Profile updates accept ONLY an allow-list of fields; `role` can never be set here.
const PROFILE_FIELDS = ['name'];
function updateProfile(actor, userId, body) {
  const user = state.users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (actor.id !== userId && actor.role !== 'ADMIN') throw new AppError(403, 'Forbidden');
  for (const f of PROFILE_FIELDS) if (body[f] !== undefined) user[f] = body[f];
  return { id: user.id, name: user.name, role: user.role };
}

module.exports = { changeRole, updateProfile };
