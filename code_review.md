# 1. SQL injection vulnerabilities

```js
SELECT * FROM workflow_instance_steps WHERE id = ${stepId}
```
AND
```js
UPDATE workflow_instance_steps SET status = 'approved', actioned_by = ${user_id}, comment = '${comment}', actioned_at = NOW() WHERE id = ${stepId}`
```
This is unsafe because a malicious comment could break the SQL query or modify unintended data.

```js
await db.query(
  `SELECT * FROM workflow_instance_steps WHERE id = $1`,
  [stepId]
);
```

```js
await db.query(
  `
  UPDATE workflow_instance_steps
  SET status = 'approved',
      actioned_by = $1,
      comment = $2,
      actioned_at = NOW()
  WHERE id = $3
  `,
  [userId, comment, stepId]
);
```

Same thing applies to the next-step query and the two updates after it — none of them should build SQL by hand, they should all use `$1, $2, ...` placeholders.

# 2. Inverted condition logic

This part is wrong:
```js
if (step[0].status == 'awaiting_action') {
  return res.send({ error: 'step not actionable' });
}
```

The code currently rejects the step when it is awaiting action, which is backwards — that's the one state where it should actually be approvable. It should reject when the status is anything else.

```js
if (step.status !== 'awaiting_action') {
  return res.status(409).json({ error: 'step not actionable' });
}
```

# 3. Race condition

Right now there's a gap between reading the step's status and writing the "approved" status. If two people click approve at almost the same time, both requests can read `awaiting_action` before either one writes, so both go through and the step (and workflow) gets advanced twice.

The fix is to lock the row while we're working with it, inside a transaction:

```js
await client.query('BEGIN');

const { rows } = await client.query(
  `SELECT * FROM workflow_instance_steps WHERE id = $1 FOR UPDATE`,
  [stepId]
);
const step = rows[0];
/* 
...
*/
await client.query('COMMIT');
```

`FOR UPDATE` makes the second request wait until the first one commits, so it sees the updated status and gets correctly rejected instead of racing.

# 4. Missing authorisation check

`user_id` is just taken from the request body, so anyone can say they're any user:

```js
const { user_id, comment } = req.body;
```

There's also no check that this user is actually allowed to approve this step. This should come from the logged-in session instead, and be checked against whoever is supposed to approve it:

```js
const userId = req.user?.id;
if (!userId) return res.status(401).json({ error: 'authentication required' });

if (!isAuthorizedApprover(userId, step)) {
  return res.status(403).json({ error: 'not authorized to approve this step' });
}
```

# 5. Missing input validation and error handling

If `stepId` doesn't match anything, `step[0]` is `undefined` and `step[0].status` throws. Also, there's no try/catch here, so a DB error just crashes the request in this case.

```js
if (!Number.isInteger(Number(id)) || !Number.isInteger(Number(stepId))) {
  return res.status(400).json({ error: 'invalid id or stepId' });
}

if (!step) {
  return res.status(404).json({ error: 'step not found' });
}
```

And wrap the whole handler body in a try/catch that rolls back and returns a 500 error.

# 6. Incorrect or missing HTTP status codes

Every response in the original, success or failure, comes back as a plain `200` via `res.send(...)`. That makes it hard for the handling validation and troubleshooting. It should be:

- `200` — success
- `400` — bad input
- `401` — authorised
- `403` — not allowed to approve this step
- `404` — step/instance doesn't exist
- `409` — step exists but isn't in an approvable state
- `500` — something went wrong on our end

# 7. No transaction wrapping across multiple queries

The status update, the lookup for the next step, and the update that activates it (or closes out the instance) are four separate queries with nothing tying them together. If the process dies in the middle, you can end up with a step marked approved but no next step ever activated.

All of it should run inside one transaction so it either fully happens or fully doesn't — same `BEGIN` / `COMMIT` / `ROLLBACK` shown in section 3.

# 8. Other things worth fixing

- To optimise the query, avoid using `SELECT *`, just select the columns needed.
- lack of audit log for accountability and observability
