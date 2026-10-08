'use strict';
// Separation-of-duties module (Phase 8 refinement): shared by priority changes,
// resource allocations and ADMIN role grants. Approver must differ from requester (SR-03/04/05).
const crypto = require('crypto');
const { state } = require('../lib/store');
const { AppError } = require('../lib/errors');
const audit = require('./auditService');
const { securityEvent } = require('../lib/logger');

const handlers = {};
const EXPIRY_MS = 2 * 60 * 60 * 1000;

function register(type, { approverRoles, execute }) {
  handlers[type] = { approverRoles, execute };
}

function create(type, payload, requester) {
  if (!handlers[type]) throw new AppError(400, 'Unknown approval type');
  const req = { id: crypto.randomUUID(), type, payload, requestedBy: requester.id, status: 'PENDING', createdAt: Date.now() };
  state.approvals.set(req.id, req);
  audit.record(requester.id, 'APPROVAL_REQUESTED', `${type}:${req.id}`, { payload });
  return req;
}

function approve(id, approver) {
  const req = state.approvals.get(id);
  if (!req) throw new AppError(404, 'Request not found');
  if (req.status !== 'PENDING') throw new AppError(409, 'Request already decided');
  if (Date.now() - req.createdAt > EXPIRY_MS) { req.status = 'EXPIRED'; throw new AppError(409, 'Request expired'); }
  const h = handlers[req.type];
  if (!h.approverRoles.includes(approver.role)) throw new AppError(403, 'Forbidden');
  if (req.requestedBy === approver.id) {
    securityEvent('SELF_APPROVAL_BLOCKED', { user: approver.id, request: id, type: req.type });
    audit.record(approver.id, 'SELF_APPROVAL_BLOCKED', `${req.type}:${id}`);
    throw new AppError(403, 'You cannot approve your own request');
  }
  const result = h.execute(req.payload, approver, req);
  req.status = 'APPROVED';
  req.approvedBy = approver.id;
  audit.record(approver.id, 'APPROVAL_GRANTED', `${req.type}:${id}`, { requestedBy: req.requestedBy });
  return { request: req, result };
}

module.exports = { register, create, approve };
