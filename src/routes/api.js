'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const S = require('../lib/schemas');
const { authenticate, authorize, validate } = require('../middleware/security');
const authService = require('../services/authService');
const incidents = require('../services/incidentService');
const allocations = require('../services/allocationService');
const users = require('../services/userService');
const approvals = require('../services/approvalService');
const audit = require('../services/auditService');
const { securityEvent } = require('../lib/logger');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// SR-06 / V-03: rate limits on public endpoints (keyed on req.ip; trust proxy set explicitly in app.js)
const reportLimiter = rateLimit({
  windowMs: config.reportLimit.windowMs, max: config.reportLimit.max, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => { securityEvent('RATE_LIMITED', { ip: req.ip, path: req.path }); res.status(429).json({ error: 'Too many reports, try later' }); },
});
const loginLimiter = rateLimit({ windowMs: 15 * 60000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/auth/login', loginLimiter, validate(S.login), wrap(async (req, res) => {
  res.json({ token: await authService.login(req.body, req.ip), expiresIn: 900 });
}));

router.post('/otp/request', reportLimiter, validate(S.otpRequest), (req, res) => {
  const code = incidents.requestOtp(req.body.phone);
  res.status(202).json(config.env === 'production' ? { sent: true } : { sent: true, devCode: code });
});

router.post('/incidents', reportLimiter, validate(S.report), (req, res) => res.status(201).json(incidents.report(req.body)));
router.get('/incidents/:id', authenticate, authorize('incident:read'), (req, res) => res.json(incidents.get(req.params.id, req.user)));
router.post('/incidents/:id/verify', authenticate, authorize('incident:verify'), validate(S.verify), (req, res) => res.json(incidents.verify(req.params.id, req.user, req.body)));
router.post('/incidents/:id/priority-requests', authenticate, authorize('incident:prioritise'), validate(S.priority), (req, res) => {
  const out = incidents.requestPriority(req.params.id, req.user, req.body);
  res.status(out.status === 'PENDING_APPROVAL' ? 202 : 200).json(out);
});

router.post('/approvals/:id/approve', authenticate, authorize('approval:decide'), (req, res) => res.json(approvals.approve(req.params.id, req.user)));

router.post('/resources', authenticate, authorize('resource:create'), validate(S.resource), (req, res) => res.status(201).json(allocations.addResource(req.body)));
router.post('/allocations', authenticate, authorize('allocation:create'), validate(S.allocation), (req, res) => res.status(202).json(allocations.request(req.user, req.body)));

router.patch('/users/:id', authenticate, authorize('user:update'), validate(S.profile), (req, res) => res.json(users.updateProfile(req.user, req.params.id, req.body)));
router.patch('/users/:id/role', authenticate, authorize('role:change'), validate(S.role), (req, res) => {
  const out = users.changeRole(req.user, req.params.id, req.body);
  res.status(out.status === 'PENDING_APPROVAL' ? 202 : 200).json(out);
});

router.get('/audit', authenticate, authorize('audit:read'), (req, res) => res.json(audit.list({ action: req.query.action })));
router.get('/audit/verify', authenticate, authorize('audit:read'), (req, res) => res.json(audit.verify()));

module.exports = router;
