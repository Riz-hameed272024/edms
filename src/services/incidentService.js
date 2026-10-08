'use strict';
// Incident intake, verification and priority control (SR-05, SR-06, SR-07).
const crypto = require('crypto');
const { state } = require('../lib/store');
const { AppError } = require('../lib/errors');
const { toCoarse, distanceMeters } = require('../lib/geo');
const audit = require('./auditService');
const approvals = require('./approvalService');
const { securityEvent } = require('../lib/logger');

const DUP_RADIUS_M = 500, DUP_WINDOW_MS = 60 * 60 * 1000;

function requestOtp(phone) {
  const code = String(crypto.randomInt(100000, 1000000));
  state.otps.set(phone, { code, expires: Date.now() + 5 * 60000, tries: 0 });
  return code; // in production sent by SMS via the Notification Gateway, never returned
}

function checkOtp(phone, code) {
  const rec = state.otps.get(phone);
  if (!rec || rec.expires < Date.now() || rec.tries >= 3) return false;
  rec.tries += 1;
  if (rec.code !== code) return false;
  state.otps.delete(phone);
  return true;
}

function reporterOf(phone) {
  if (!state.reporters.has(phone)) state.reporters.set(phone, { phone, reputation: 50, falseReports: 0, blockedUntil: 0 });
  return state.reporters.get(phone);
}

function report({ type, description, location, peopleAffected, phone, otp }) {
  const reporter = reporterOf(phone);
  if (reporter.blockedUntil > Date.now()) throw new AppError(429, 'Reporting temporarily blocked for this number');
  if (!checkOtp(phone, otp)) {
    securityEvent('OTP_FAILED', { phone: phone.slice(-4) });
    throw new AppError(401, 'Phone verification failed');
  }
  const now = Date.now();
  const similar = [...state.incidents.values()].filter((i) =>
    i.type === type && now - i.createdAt < DUP_WINDOW_MS && distanceMeters(i.location, location) <= DUP_RADIUS_M);
  const incident = {
    id: crypto.randomUUID(), ref: `EDMS-${String(state.incidents.size + 1).padStart(5, '0')}`,
    type, description, location, peopleAffected, reporterPhone: phone,
    status: 'REPORTED', priority: null, version: 1, history: [], createdAt: now,
    similarCount: similar.length,
  };
  state.incidents.set(incident.id, incident);
  audit.record(`phone:${phone.slice(-4)}`, 'INCIDENT_REPORTED', `incident:${incident.id}`, { type });
  return { id: incident.id, ref: incident.ref, status: incident.status, similarReports: similar.length };
}

// Role-based serializer (fix for V-01 / T-07): exact location only for trusted roles.
function view(incident, viewer) {
  const trusted = ['COORDINATOR', 'ADMIN'].includes(viewer.role) ||
    (incident.assignedTeam && incident.assignedTeam.includes(viewer.id));
  return {
    id: incident.id, ref: incident.ref, type: incident.type, status: incident.status,
    priority: incident.priority, version: incident.version, peopleAffected: incident.peopleAffected,
    location: trusted ? incident.location : toCoarse(incident.location),
    description: trusted ? incident.description : undefined,
  };
}

function get(id, viewer) {
  const inc = state.incidents.get(id);
  if (!inc) throw new AppError(404, 'Incident not found');
  return view(inc, viewer);
}

function verify(id, actor, { decision, reason }) {
  const inc = state.incidents.get(id);
  if (!inc) throw new AppError(404, 'Incident not found');
  if (inc.status !== 'REPORTED') throw new AppError(409, 'Incident already processed');
  inc.status = decision === 'GENUINE' ? 'VERIFIED' : 'FALSE';
  inc.verifiedBy = actor.id;
  inc.version += 1;
  if (decision === 'FALSE') {
    const r = reporterOf(inc.reporterPhone);
    r.falseReports += 1;
    r.reputation = Math.max(0, r.reputation - 20);
    if (r.falseReports >= 3) r.blockedUntil = Date.now() + 24 * 3600 * 1000;
  }
  audit.record(actor.id, 'INCIDENT_VERIFIED', `incident:${id}`, { decision, reason });
  return view(inc, actor);
}

function applyPriority(id, newPriority, actorId, reason) {
  const inc = state.incidents.get(id);
  const old = inc.priority;
  inc.priority = newPriority;
  inc.version += 1;
  inc.history.push({ old, new: newPriority, actor: actorId, reason, ts: new Date().toISOString() });
  audit.record(actorId, 'PRIORITY_CHANGED', `incident:${id}`, { old, new: newPriority, reason });
  return { id, priority: newPriority, version: inc.version };
}

approvals.register('PRIORITY_CHANGE', {
  approverRoles: ['COORDINATOR'],
  execute: (p, approver) => applyPriority(p.incidentId, p.priority, approver.id, `${p.reason} (approved)`),
});

function requestPriority(id, actor, { priority, reason, version }) {
  const inc = state.incidents.get(id);
  if (!inc) throw new AppError(404, 'Incident not found');
  if (inc.status !== 'VERIFIED') throw new AppError(409, 'Only verified incidents can be prioritised');
  if (version !== inc.version) throw new AppError(409, 'Incident was updated by another user; reload');
  if (priority === 'P1' || inc.priority === 'P1') {
    const req = approvals.create('PRIORITY_CHANGE', { incidentId: id, priority, reason }, actor);
    return { status: 'PENDING_APPROVAL', requestId: req.id };
  }
  return { status: 'APPLIED', ...applyPriority(id, priority, actor.id, reason) };
}

module.exports = { requestOtp, report, get, verify, requestPriority };
