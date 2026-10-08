'use strict';
// Chain of Responsibility: authenticate -> authorize(permission) -> validate(schema) -> handler
const authService = require('../services/authService');
const { securityEvent } = require('../lib/logger');

// Central policy table, deny by default (SR-02). Refactoring R1.
const POLICY = Object.freeze({
  'incident:read': ['COORDINATOR', 'ADMIN', 'RESCUE', 'MEDICAL', 'VOLUNTEER'],
  'incident:verify': ['COORDINATOR'],
  'incident:prioritise': ['COORDINATOR'],
  'approval:decide': ['COORDINATOR', 'ADMIN'],
  'allocation:create': ['COORDINATOR'],
  'resource:create': ['COORDINATOR', 'ADMIN'],
  'role:change': ['ADMIN'],
  'user:update': ['ADMIN', 'COORDINATOR', 'RESCUE', 'MEDICAL', 'VOLUNTEER', 'PUBLIC'],
  'audit:read': ['ADMIN'],
});

function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = authService.verifyToken(token);
    return next();
  } catch {
    securityEvent('TOKEN_REJECTED', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(permission) {
  return (req, res, next) => {
    const allowed = Object.prototype.hasOwnProperty.call(POLICY, permission) ? POLICY[permission] : [];
    if (req.user && allowed.includes(req.user.role)) return next();
    securityEvent('AUTHZ_DENIED', { user: req.user && req.user.id, permission, path: req.path });
    return res.status(403).json({ error: 'Forbidden' });
  };
}

function validate(schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ error: 'Validation failed', details: error.details.map((d) => d.message) });
    req.body = value;
    return next();
  };
}

module.exports = { authenticate, authorize, validate, POLICY };
