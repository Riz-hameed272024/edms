// PHASE 1 REFACTORING R2 - BEFORE (not executed; evidence only)
// Problem: one handler validates, builds SQL, applies business rules, notifies
// and logs. Hard to test, SQL injection risk (V-04), audit easy to skip (V-08).
app.post('/api/incidents', async (req, res) => {
  if (!req.body.type || req.body.description.length < 5) return res.status(400).end();   // ad-hoc validation
  const sql = "INSERT INTO incident(type, description) VALUES('" + req.body.type + "','" + req.body.description + "')";
  await pg.query(sql);                                                                    // SQL concatenation
  const dups = await pg.query("SELECT * FROM incident WHERE type='" + req.body.type + "'");
  if (dups.rows.length > 3) sendSms(coordinators, 'Possible duplicate');                  // notification inline
  console.log('incident created by ' + req.body.phone + ' at ' + req.body.lat);           // logs location + phone
  res.json(dups.rows);                                                                    // leaks other reports
});
