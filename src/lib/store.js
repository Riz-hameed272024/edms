'use strict';
// In-memory repository used for the lab build and tests.
// Production uses PostgreSQL with the same shape and constraints (see db/schema.sql).
const state = {
  users: new Map(),
  incidents: new Map(),
  approvals: new Map(),
  resources: new Map(),
  allocations: new Map(),
  otps: new Map(),
  reporters: new Map(),
};

function reset() {
  Object.values(state).forEach((m) => m.clear());
}

module.exports = { state, reset };
