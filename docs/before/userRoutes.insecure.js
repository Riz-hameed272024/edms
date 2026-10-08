// BEFORE (Sprint 1 draft PR, NOT USED) - kept as refactoring evidence for Phase 12.
// Weaknesses: V-05 hard-coded HS256 secret, no algorithm pinning, role trusted from token;
// V-02 mass assignment lets any user set `role`; V-06 approver == requester allowed;
// V-04 SQL built by string concatenation; V-07 stack trace returned to client.
const jwt = require('jsonwebtoken');
const SECRET = 'edms-secret-123';                       // V-05 hard-coded secret

function auth(req, res, next) {
  try {
    req.user = jwt.verify(req.headers.authorization.split(' ')[1], SECRET); // no algorithms option
    next();
  } catch (e) { res.status(500).send(e.stack); }       // V-07 leaks internals
}

app.patch('/api/users/:id', auth, (req, res) => {
  const user = db.users[req.params.id];
  Object.assign(user, req.body);                        // V-02 role can be overwritten
  res.json(user);                                       // also leaks passwordHash
});

app.post('/api/allocations/:id/approve', auth, (req, res) => {
  if (req.user.role !== 'COORDINATOR') return res.sendStatus(403);
  const a = db.allocations[req.params.id];
  a.status = 'APPROVED';                                // V-06 no requester != approver check
  a.approvedBy = req.user.sub;
  res.json(a);
});

app.get('/api/incidents/search', auth, async (req, res) => {
  const rows = await pg.query("SELECT * FROM incident WHERE type = '" + req.query.type + "'"); // V-04 SQLi
  res.json(rows.rows);                                  // V-01 returns exact location to everyone
});
