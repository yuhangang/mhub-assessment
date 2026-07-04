# MHUB Workflow Engine

A small configurable approval workflow engine for the MHUB assessment.

Stack:

- Node.js
- TypeScript
- Express
- PostgreSQL
- Docker Compose
- Plain HTML/CSS/JS admin dashboard

## Run

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

Postgres is initialized from:

- `db/schema.sql`
- `db/seed.sql`

## Local Development

```bash
npm install
```

Create `.env`:

```text
DATABASE_URL=postgres://postgres:postgres@localhost:5433/mhub_workflow
```

Then run:

```bash
npm run build
npm test
npm run dev
```

## What It Does

- Admin can create workflow templates.
- A template has ordered approval steps.
- Only one active template is allowed per trigger event.
- Template edits publish a new revision.
- A workflow instance is created from a template when an event is triggered.
- Template steps are copied into instance steps, so the running approval route stays stable.
- Approvers can act by user ID or role.
- Rejections require a comment.
- Every decision is stored in an audit table.
- Only one running workflow is allowed per source record.
- Final approval for booking cancellation updates the booking to `cancelled` and the unit to `available`.
- The dashboard supports template settings, triggering workflows, inbox actions, and instance history.

## Template Revisions And Deletes

`PATCH /api/templates/:id` creates a new revision instead of changing the existing row.

- The new row gets the next `version`.
- `previous_template_id` points to the older revision.
- If the older revision was active, the new revision becomes active.
- Existing workflow instances stay pinned to the revision they started with.
- Only the latest non-deleted revision can be patched.

Instance responses still join to the template row for display names. If labels must be frozen exactly as shown at trigger time, add `template_name_snapshot` and `template_description_snapshot` to `workflow_instances`.

Deleting a template is a soft delete:

- `deleted_at` is set;
- `is_active` becomes false;
- the template is hidden from Template Settings;
- old workflow history can still join to the template row.

Delete is also blocked while a workflow is running against the template.

## Schema Notes

Main tables:

- `workflow_events`
- `workflow_templates`
- `workflow_template_steps`
- `workflow_instances`
- `workflow_instance_steps`
- `workflow_step_decisions`

Important indexes:

- `idx_one_active_template_per_trigger`: one active template per event.
- `idx_workflow_template_versions`: one version number per event.
- `idx_one_running_instance_per_entity`: one running workflow per source record.
- `idx_one_awaiting_step_per_instance`: one active step per workflow instance.
- `idx_steps_awaiting_user`: user inbox lookup.
- `idx_steps_awaiting_role`: role inbox lookup.

## Concurrency

Step actions run in a transaction.

The service locks the step row with `FOR UPDATE`, checks the actor, then updates only if the step is still actionable and the version still matches:

```sql
UPDATE workflow_instance_steps
SET status = $1, version = version + 1, updated_at = now()
WHERE id = $2
  AND status = 'awaiting_action'
  AND version = $3;
```

If two approvers act at the same time, only one request succeeds. The other gets `409 Conflict`.

## API

Dashboard:

- `GET /`
- `GET /api/dashboard`

Templates:

- `GET /api/templates`
- `POST /api/templates`
- `GET /api/templates/:id`
- `PATCH /api/templates/:id`
- `POST /api/templates/:id/activate`
- `POST /api/templates/:id/deactivate`
- `DELETE /api/templates/:id`

Instances and inbox:

- `POST /api/instances`
- `GET /api/instances`
- `GET /api/instances/:id`
- `GET /api/inbox?user_id=2`
- `GET /api/inbox?role=sales_manager`
- `POST /api/instances/:id/steps/:stepId/approve`
- `POST /api/instances/:id/steps/:stepId/reject`

Create template example:

```json
{
  "name": "Booking Cancellation Approval",
  "description": "Sales then finance approval",
  "trigger_event": "booking.cancellation_requested",
  "is_active": true,
  "steps": [
    { "sequence": 1, "assignee_role": "sales_manager" },
    { "sequence": 2, "assignee_user_id": 2 }
  ]
}
```

Trigger workflow example:

```json
{
  "event_name": "booking.cancellation_requested",
  "entity_type": "booking",
  "entity_id": "1",
  "initiated_by": 3
}
```

Approve example:

```json
{
  "user_id": 1,
  "comment": "Approved"
}
```

Reject example:

```json
{
  "user_id": 1,
  "comment": "Buyer document missing"
}
```

## Seed Data

The seed creates:

- 2 projects
- 10 units
- 3 agents
- 5 bookings
- 3 workflow events
- 1 active booking cancellation template

## Part 3 Code Review

Please read `code_review.md` for my code review.
