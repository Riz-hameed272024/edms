'use strict';
// Allow-list input validation (SR-09).
const Joi = require('joi');

const location = Joi.object({ lat: Joi.number().min(-90).max(90).required(), lon: Joi.number().min(-180).max(180).required() });
const phone = Joi.string().pattern(/^\+?[0-9]{10,13}$/).required();

module.exports = {
  login: Joi.object({ username: Joi.string().max(64).required(), password: Joi.string().max(128).required(), totp: Joi.string().pattern(/^[0-9]{6}$/) }),
  otpRequest: Joi.object({ phone }),
  report: Joi.object({
    type: Joi.string().valid('FLOOD', 'FIRE', 'COLLAPSE', 'MEDICAL', 'CYCLONE', 'OTHER').required(),
    description: Joi.string().trim().min(5).max(500).required(),
    location: location.required(),
    peopleAffected: Joi.number().integer().min(1).max(10000).default(1),
    phone,
    otp: Joi.string().pattern(/^[0-9]{6}$/).required(),
  }),
  verify: Joi.object({ decision: Joi.string().valid('GENUINE', 'FALSE').required(), reason: Joi.string().min(3).max(300).required() }),
  priority: Joi.object({ priority: Joi.string().valid('P1', 'P2', 'P3', 'P4').required(), reason: Joi.string().min(3).max(300).required(), version: Joi.number().integer().min(1).required() }),
  resource: Joi.object({ type: Joi.string().max(50).required(), unit: Joi.string().max(20).required(), qtyAvailable: Joi.number().integer().min(0).max(1e6).required(), warehouse: Joi.string().max(100).required() }),
  allocation: Joi.object({ resourceId: Joi.string().guid().required(), quantity: Joi.number().integer().min(1).max(100000).required(), targetType: Joi.string().valid('INCIDENT', 'SHELTER').required(), targetId: Joi.string().guid().required() }),
  role: Joi.object({ role: Joi.string().valid('ADMIN', 'COORDINATOR', 'RESCUE', 'MEDICAL', 'VOLUNTEER', 'PUBLIC').required(), reason: Joi.string().min(3).max(300).required() }),
  profile: Joi.object({ name: Joi.string().max(100) }),
};
