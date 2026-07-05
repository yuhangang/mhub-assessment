# MHUB Workflow Engine

A small configurable approval workflow engine for the MHUB assessment.

Stack:

- Node.js
- TypeScript
- Next.js
- React
- Express
- PostgreSQL
- Docker Compose
- React admin dashboard

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
npm test
npm run dev
```

`npm run dev` starts:

- the API on `http://localhost:3001`
- the Next.js admin dashboard on `http://localhost:3000`

## What It Does

- Admin can create workflow templates.
- Admin can add workflow trigger events.
- A template has ordered approval steps.
- Only one active template is allowed per trigger event.
- Template edits publish a new revision.
- Templates can model parallel approval groups.
- A workflow instance is created from a template when an event is triggered.
- The admin Trigger tab can start any enabled event that has an active template.
- Template steps are copied into instance steps, so the running approval route stays stable.
- Approvers can act by user ID or role.
- Rejections require a comment.
- Every decision is stored in an audit table.
- Only one running workflow is allowed per source record and trigger event.
- Final approval for booking cancellation updates the booking to `cancelled` and the unit to `available`.
- Final approval for booking confirmation updates the booking to `active`.
- The dashboard supports bookings, generic workflow triggering, workflow events, template settings, parallel approval setup, inbox actions, and instance history.

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
- `idx_template_parallel_unique_role`: one step per role in a template approval group.
- `idx_template_parallel_unique_user`: one step per user in a template approval group.
- `idx_one_running_instance_per_entity`: one running workflow per source record and trigger event.
- `idx_steps_awaiting_user`: user inbox lookup.
- `idx_steps_awaiting_role`: role inbox lookup.

Parallel approval uses `group_sequence` on template and instance steps. All steps in the same group can be `awaiting_action` at the same time, but a group cannot assign the same role twice or the same user twice. The engine moves to the next group only after every step in the current group is approved.

`workflow_events` is the trigger catalog. `workflow_templates.trigger_event` references it to define the approval route for that event, and `workflow_instances.trigger_event` records which event started a runtime workflow. Adding an event makes it available for template creation; any domain-specific final approval side effect still has to be implemented in the backend callback code.

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
- `GET /health`
- `GET /api/dashboard`

Templates:

- `GET /api/events`
- `POST /api/events`
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

Create event example:

```json
{
  "name": "booking.refund_requested",
  "description": "Booking refund approval"
}
```

Event names must use dot notation, for example `booking.refund_requested`.

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

Parallel approval example:

```json
{
  "name": "Parallel Unit Price Approval",
  "description": "Sales first, finance and coordinator in parallel, then final finance sign-off",
  "trigger_event": "unit.price_updated",
  "is_active": true,
  "steps": [
    { "sequence": 1, "group_sequence": 1, "assignee_role": "sales_manager" },
    { "sequence": 2, "group_sequence": 2, "assignee_role": "finance_manager" },
    { "sequence": 3, "group_sequence": 2, "assignee_role": "sales_coordinator" },
    { "sequence": 4, "group_sequence": 3, "assignee_user_id": 2 }
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

The same source record can have another running workflow for a different trigger event. A duplicate for the same source record and trigger event returns `409 Conflict`.

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
- 6 agents
- 5 bookings
- 3 workflow events
- 1 active booking cancellation template
- 1 active booking confirmation template

## Part 3 Code Review

Please read `code_review.md` for my code review.
