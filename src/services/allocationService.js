'use strict';
// Resource allocation with separation of duties (SR-04). Fixes V-06.
const crypto = require('crypto');
const { state } = require('../lib/store');
const { AppError } = require('../lib/errors');
const audit = require('./auditService');
const approvals = require('./approvalService');

function addResource({ type, unit, qtyAvailable, warehouse }) {
  const r = { id: crypto.randomUUID(), type, unit, qtyAvailable, warehouse };
  state.resources.set(r.id, r);
  return r;
}

function reserve(allocation, approver) {
  const res = state.resources.get(allocation.resourceId);
  // single-threaded event loop = atomic check-and-set here; in PostgreSQL: SELECT ... FOR UPDATE
  if (res.qtyAvailable < allocation.quantity) throw new AppError(409, 'Insufficient stock');
  res.qtyAvailable -= allocation.quantity;
  allocation.status = 'APPROVED';
  allocation.approvedBy = approver.id;
  audit.record(approver.id, 'ALLOCATION_APPROVED', `allocation:${allocation.id}`, { quantity: allocation.quantity, stockAfter: res.qtyAvailable });
  return { id: allocation.id, status: allocation.status, stockAfter: res.qtyAvailable };
}

approvals.register('ALLOCATION', {
  approverRoles: ['COORDINATOR'],
  execute: (p, approver) => reserve(state.allocations.get(p.allocationId), approver),
});

function request(actor, { resourceId, quantity, targetType, targetId }) {
  const res = state.resources.get(resourceId);
  if (!res) throw new AppError(404, 'Resource not found');
  if (quantity > res.qtyAvailable) throw new AppError(409, 'Insufficient stock');
  if (targetType === 'INCIDENT') {
    const inc = state.incidents.get(targetId);
    if (!inc || inc.status !== 'VERIFIED') throw new AppError(409, 'Target incident must be verified');
  }
  const allocation = { id: crypto.randomUUID(), resourceId, quantity, targetType, targetId, requestedBy: actor.id, status: 'REQUESTED' };
  state.allocations.set(allocation.id, allocation);
  const req = approvals.create('ALLOCATION', { allocationId: allocation.id }, actor);
  allocation.approvalId = req.id;
  return { id: allocation.id, status: allocation.status, approvalId: req.id };
}

module.exports = { addResource, request };
