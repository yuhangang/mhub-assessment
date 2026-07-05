import request from 'supertest';
import { createApp } from '../src/app';
import { pool, query } from '../src/db';

describe('workflow engine', () => {
  const app = createApp();

  afterAll(async () => {
    await pool.end();
  });

  beforeAll(async () => {
    await query('ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
    await query('ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1');
    await query('ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS previous_template_id BIGINT REFERENCES workflow_templates(id) ON DELETE RESTRICT');
    await query('ALTER TABLE workflow_template_steps ADD COLUMN IF NOT EXISTS group_sequence INTEGER NOT NULL DEFAULT 1');
    await query("ALTER TABLE workflow_template_steps ADD COLUMN IF NOT EXISTS approval_policy TEXT NOT NULL DEFAULT 'ALL'");
    await query('ALTER TABLE workflow_instance_steps ADD COLUMN IF NOT EXISTS group_sequence INTEGER NOT NULL DEFAULT 1');
    await query("ALTER TABLE workflow_instance_steps ADD COLUMN IF NOT EXISTS approval_policy TEXT NOT NULL DEFAULT 'ALL'");
    await query('DROP INDEX IF EXISTS idx_one_active_template_per_trigger');
    await query('DROP INDEX IF EXISTS idx_one_awaiting_step_per_instance');
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_template_per_trigger
      ON workflow_templates(trigger_event)
      WHERE is_active = true AND deleted_at IS NULL
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_template_versions
      ON workflow_templates(trigger_event, version)
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_template_single_child
      ON workflow_templates(previous_template_id)
      WHERE previous_template_id IS NOT NULL
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_template_parallel_unique_role
      ON workflow_template_steps(template_id, group_sequence, assignee_role)
      WHERE assignee_role IS NOT NULL
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_template_parallel_unique_user
      ON workflow_template_steps(template_id, group_sequence, assignee_user_id)
      WHERE assignee_user_id IS NOT NULL
    `);
  });

  beforeEach(async () => {
    await query('TRUNCATE workflow_step_decisions, workflow_instance_steps, workflow_instances, workflow_template_steps, workflow_templates, bookings, units, projects, agents, workflow_events RESTART IDENTITY CASCADE');
    await query(`
      INSERT INTO projects (name) VALUES ('Northbank Residences'), ('South Garden');
      INSERT INTO units (project_id, unit_number, status, price_cents) VALUES
        (1, 'A-01-01', 'booked', 85000000),
        (1, 'A-01-02', 'available', 78000000),
        (1, 'A-02-01', 'available', 90000000),
        (1, 'A-02-02', 'available', 91000000),
        (1, 'A-03-01', 'available', 92000000),
        (2, 'B-01-01', 'available', 65000000),
        (2, 'B-01-02', 'available', 66000000),
        (2, 'B-02-01', 'available', 68000000),
        (2, 'B-02-02', 'available', 69000000),
        (2, 'B-03-01', 'available', 71000000);
      INSERT INTO agents (name, email, role) VALUES
        ('Sarah Sales', 'sarah@example.com', 'sales_manager'),
        ('Farid Finance', 'farid@example.com', 'finance_manager'),
        ('Carmen Coordinator', 'carmen@example.com', 'sales_coordinator'),
        ('Aisha Sales Manager', 'aisha@example.com', 'sales_manager'),
        ('Daniel Finance', 'daniel@example.com', 'finance_manager'),
        ('Mei Coordinator', 'mei@example.com', 'sales_coordinator');
      INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES
        (1, 3, 'Buyer One', 'active'),
        (2, 3, 'Buyer Two', 'pending'),
        (3, 3, 'Buyer Three', 'pending'),
        (4, 3, 'Buyer Four', 'pending'),
        (5, 3, 'Buyer Five', 'pending');
      INSERT INTO workflow_events (name, description) VALUES
        ('booking.cancellation_requested', 'Booking cancellation approval'),
        ('booking.confirmed', 'Booking confirmation approval'),
        ('unit.price_updated', 'Unit price update approval');
      INSERT INTO workflow_templates (name, description, trigger_event, is_active)
      VALUES 
        ('Booking Cancellation Approval', 'Sales then finance approval', 'booking.cancellation_requested', true),
        ('Booking Confirmation Approval', 'Sales coordinator check followed by sales manager final approval.', 'booking.confirmed', true);
      INSERT INTO workflow_template_steps (template_id, sequence, group_sequence, assignee_role)
      VALUES (1, 1, 1, 'sales_manager');
      INSERT INTO workflow_template_steps (template_id, sequence, group_sequence, assignee_user_id)
      VALUES (1, 2, 2, 2);
      INSERT INTO workflow_template_steps (template_id, sequence, group_sequence, assignee_role)
      VALUES (2, 1, 1, 'sales_coordinator');
      INSERT INTO workflow_template_steps (template_id, sequence, group_sequence, assignee_role)
      VALUES (2, 2, 2, 'sales_manager');
    `);
  });

  test('triggers a workflow instance and exposes the first approver inbox item', async () => {
    const trigger = await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    expect(trigger.body.instance_id).toBe(1);

    const inbox = await request(app).get('/api/inbox?role=sales_manager').expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ instance_id: 1, sequence: 1, status: 'awaiting_action' });
  });

  test('rejects duplicate running workflow for the same source entity', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    const duplicate = await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(409);

    expect(duplicate.body.error).toContain('already has an active workflow instance');
  });

  test('allows different workflows to run concurrently for the same entity', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    // Should be allowed because it is a different event type
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.confirmed', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);
  });

  test('approves sequential steps and runs booking cancellation callback on final approval', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    await request(app).post('/api/instances/1/steps/1/approve').send({ user_id: 1, comment: 'Sales approved' }).expect(200);

    const financeInbox = await request(app).get('/api/inbox?user_id=2').expect(200);
    expect(financeInbox.body[0]).toMatchObject({ instance_id: 1, sequence: 2, status: 'awaiting_action' });

    await request(app).post('/api/instances/1/steps/2/approve').send({ user_id: 2, comment: 'Finance approved' }).expect(200);

    const instance = await request(app).get('/api/instances/1').expect(200);
    expect(instance.body.status).toBe('approved');
    expect(instance.body.audit_trail).toHaveLength(2);

    const booking = await query<{ booking_status: string; unit_status: string }>(
      `SELECT b.status AS booking_status, u.status AS unit_status
       FROM bookings b JOIN units u ON b.unit_id = u.id WHERE b.id = 1`
    );
    expect(booking.rows[0]).toEqual({ booking_status: 'cancelled', unit_status: 'available' });
  });

  test('rejects a workflow immediately and requires a rejection comment', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    await request(app).post('/api/instances/1/steps/1/reject').send({ user_id: 1 }).expect(400);

    await request(app).post('/api/instances/1/steps/1/reject').send({ user_id: 1, comment: 'Missing buyer document' }).expect(200);

    const instance = await request(app).get('/api/instances/1').expect(200);
    expect(instance.body.status).toBe('rejected');
    expect(instance.body.steps[1].status).toBe('cancelled');
  });

  test('allows only one concurrent action to win a step', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    const responses = await Promise.all([
      request(app).post('/api/instances/1/steps/1/approve').send({ user_id: 1, comment: 'First' }),
      request(app).post('/api/instances/1/steps/1/approve').send({ user_id: 1, comment: 'Second' })
    ]);

    const statusCodes = responses.map((response) => response.status).sort();
    expect(statusCodes).toEqual([200, 409]);

    const decisions = await query('SELECT * FROM workflow_step_decisions WHERE step_id = 1');
    expect(decisions.rowCount).toBe(1);
  });

  test('rolls back template creation when one step insert fails', async () => {
    await request(app)
      .post('/api/templates')
      .send({
        name: 'Broken Template',
        description: 'Should not persist if any step is invalid',
        trigger_event: 'booking.cancellation_requested',
        is_active: false,
        steps: [
          { sequence: 1, assignee_role: 'sales_manager' },
          { sequence: 2, assignee_role: 'finance_manager', assignee_user_id: 2 }
        ]
      })
      .expect(400);

    const persisted = await query('SELECT id FROM workflow_templates WHERE name = $1', ['Broken Template']);
    expect(persisted.rowCount).toBe(0);
  });

  test('returns a clear conflict when activating a template for an already active trigger', async () => {
    const inactive = await request(app)
      .post('/api/templates')
      .send({
        name: 'Second Cancellation Template',
        description: 'Inactive alternative',
        trigger_event: 'booking.cancellation_requested',
        is_active: false,
        steps: [{ sequence: 1, assignee_role: 'sales_manager' }]
      })
      .expect(201);

    const activation = await request(app)
      .post(`/api/templates/${inactive.body.id}/activate`)
      .send()
      .expect(409);

    expect(activation.body.error).toBe("Another template is already active for trigger event 'booking.cancellation_requested'");
  });

  test('rejects empty template patch values explicitly', async () => {
    const response = await request(app)
      .patch('/api/templates/1')
      .send({ name: '' })
      .expect(400);

    expect(response.body.error).toBe('Template name cannot be empty');
  });

  test('patching a template creates a new revision for future workflows', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    const revision = await request(app)
      .patch('/api/templates/1')
      .send({
        name: 'Booking Cancellation Finance Review',
        description: 'Finance handles the next revision',
        steps: [{ sequence: 1, assignee_role: 'finance_manager' }]
      })
      .expect(200);

    expect(Number(revision.body.id)).toBe(3);
    expect(revision.body.version).toBe(2);
    expect(Number(revision.body.previous_template_id)).toBe(1);
    expect(revision.body.is_active).toBe(true);

    const templates = await query(
      `SELECT id, is_active, version, previous_template_id
       FROM workflow_templates
       ORDER BY id ASC`
    );
    expect(templates.rows.map((template) => ({
      ...template,
      id: Number(template.id),
      previous_template_id: template.previous_template_id === null ? null : Number(template.previous_template_id)
    }))).toEqual([
      expect.objectContaining({ id: 1, is_active: false, version: 1, previous_template_id: null }),
      expect.objectContaining({ id: 2, is_active: true, version: 1, previous_template_id: null }),
      expect.objectContaining({ id: 3, is_active: true, version: 2, previous_template_id: 1 })
    ]);

    const oldInstanceSteps = await query(
      `SELECT assignee_role
       FROM workflow_instance_steps
       WHERE instance_id = 1
       ORDER BY sequence ASC`
    );
    expect(oldInstanceSteps.rows[0].assignee_role).toBe('sales_manager');

    const newWorkflow = await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '2', initiated_by: 3 })
      .expect(201);

    const newInstance = await query(
      `SELECT wi.template_id, wis.assignee_role
       FROM workflow_instances wi
       JOIN workflow_instance_steps wis ON wis.instance_id = wi.id
       WHERE wi.id = $1 AND wis.sequence = 1`,
      [newWorkflow.body.instance_id]
    );
    expect(Number(newInstance.rows[0].template_id)).toBe(3);
    expect(newInstance.rows[0].assignee_role).toBe('finance_manager');
  });

  test('waits for every approval in a parallel group before moving to the next group', async () => {
    await request(app)
      .post('/api/templates')
      .send({
        name: 'Parallel Unit Price Approval',
        description: 'Sales first, finance and coordinator in parallel, final finance sign-off',
        trigger_event: 'unit.price_updated',
        is_active: true,
        steps: [
          { sequence: 1, group_sequence: 1, assignee_role: 'sales_manager' },
          { sequence: 2, group_sequence: 2, assignee_role: 'finance_manager' },
          { sequence: 3, group_sequence: 2, assignee_role: 'sales_coordinator' },
          { sequence: 4, group_sequence: 3, assignee_user_id: 2 }
        ]
      })
      .expect(201);

    await request(app)
      .post('/api/instances')
      .send({ event_name: 'unit.price_updated', entity_type: 'unit', entity_id: '2', initiated_by: 3 })
      .expect(201);

    await request(app).post('/api/instances/1/steps/1/approve').send({ user_id: 1, comment: 'Sales approved' }).expect(200);

    const parallelSteps = await query(
      `SELECT id, sequence, assignee_role, status
       FROM workflow_instance_steps
       WHERE instance_id = 1 AND group_sequence = 2
       ORDER BY sequence ASC`
    );
    expect(parallelSteps.rows).toEqual([
      expect.objectContaining({ sequence: 2, assignee_role: 'finance_manager', status: 'awaiting_action' }),
      expect.objectContaining({ sequence: 3, assignee_role: 'sales_coordinator', status: 'awaiting_action' })
    ]);

    await request(app)
      .post(`/api/instances/1/steps/${parallelSteps.rows[0].id}/approve`)
      .send({ user_id: 2, comment: 'Finance approved' })
      .expect(200);

    const afterOneParallelApproval = await query(
      `SELECT sequence, status
       FROM workflow_instance_steps
       WHERE instance_id = 1 AND sequence IN (3, 4)
       ORDER BY sequence ASC`
    );
    expect(afterOneParallelApproval.rows).toEqual([
      expect.objectContaining({ sequence: 3, status: 'awaiting_action' }),
      expect.objectContaining({ sequence: 4, status: 'pending' })
    ]);

    await request(app)
      .post(`/api/instances/1/steps/${parallelSteps.rows[1].id}/approve`)
      .send({ user_id: 3, comment: 'Coordinator approved' })
      .expect(200);

    const finalStep = await query(
      `SELECT id, sequence, status
       FROM workflow_instance_steps
       WHERE instance_id = 1 AND sequence = 4`
    );
    expect(finalStep.rows[0]).toMatchObject({ sequence: 4, status: 'awaiting_action' });

    await request(app)
      .post(`/api/instances/1/steps/${finalStep.rows[0].id}/approve`)
      .send({ user_id: 2, comment: 'Final approval' })
      .expect(200);

    const instance = await request(app).get('/api/instances/1').expect(200);
    expect(instance.body.status).toBe('approved');
  });

  test('rejects duplicate role assignees in the same parallel group', async () => {
    const response = await request(app)
      .post('/api/templates')
      .send({
        name: 'Duplicate Role Parallel Approval',
        description: 'Invalid parallel group',
        trigger_event: 'unit.price_updated',
        is_active: true,
        steps: [
          { sequence: 1, group_sequence: 1, assignee_role: 'sales_manager' },
          { sequence: 2, group_sequence: 1, assignee_role: 'sales_manager' }
        ]
      })
      .expect(400);

    expect(response.body.error).toBe('parallel steps in the same group must use different roles or different users');
  });

  test('rejects duplicate user assignees in the same parallel group', async () => {
    const response = await request(app)
      .post('/api/templates')
      .send({
        name: 'Duplicate User Parallel Approval',
        description: 'Invalid parallel group',
        trigger_event: 'unit.price_updated',
        is_active: true,
        steps: [
          { sequence: 1, group_sequence: 1, assignee_user_id: 2 },
          { sequence: 2, group_sequence: 1, assignee_user_id: 2 }
        ]
      })
      .expect(400);

    expect(response.body.error).toBe('parallel steps in the same group must use different roles or different users');
  });

  test('allows the same role or user in different approval groups', async () => {
    await request(app)
      .post('/api/templates')
      .send({
        name: 'Repeated Approver Across Groups',
        description: 'Valid sequential reuse',
        trigger_event: 'unit.price_updated',
        is_active: true,
        steps: [
          { sequence: 1, group_sequence: 1, assignee_role: 'sales_manager' },
          { sequence: 2, group_sequence: 2, assignee_role: 'sales_manager' },
          { sequence: 3, group_sequence: 3, assignee_user_id: 2 },
          { sequence: 4, group_sequence: 4, assignee_user_id: 2 }
        ]
      })
      .expect(201);
  });

  test('dashboard payload includes workflow events for template settings', async () => {
    const response = await request(app).get('/api/dashboard').expect(200);

    expect(response.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'booking.cancellation_requested',
          description: 'Booking cancellation approval'
        }),
        expect.objectContaining({
          name: 'unit.price_updated',
          description: 'Unit price update approval'
        })
      ])
    );
  });

  test('creates a workflow event and uses it for a new template', async () => {
    const createdEvent = await request(app)
      .post('/api/events')
      .send({
        name: 'booking.refund_requested',
        description: 'Booking refund approval'
      })
      .expect(201);

    expect(createdEvent.body).toMatchObject({
      name: 'booking.refund_requested',
      description: 'Booking refund approval',
      is_enabled: true
    });

    const events = await request(app).get('/api/events').expect(200);
    expect(events.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'booking.refund_requested' })
      ])
    );

    await request(app)
      .post('/api/templates')
      .send({
        name: 'Booking Refund Approval',
        description: 'Finance approval for refund requests',
        trigger_event: 'booking.refund_requested',
        is_active: true,
        steps: [{ sequence: 1, assignee_role: 'finance_manager' }]
      })
      .expect(201);

    await request(app)
      .post('/api/instances')
      .send({
        event_name: 'booking.refund_requested',
        entity_type: 'booking',
        entity_id: '2',
        initiated_by: 3
      })
      .expect(201);
  });

  test('rejects invalid or duplicate workflow events', async () => {
    await request(app)
      .post('/api/events')
      .send({
        name: 'Booking Confirmed',
        description: 'Invalid display label'
      })
      .expect(400);

    const duplicate = await request(app)
      .post('/api/events')
      .send({
        name: 'booking.confirmed',
        description: 'Duplicate event'
      })
      .expect(409);

    expect(duplicate.body.error).toBe("Workflow event 'booking.confirmed' already exists");
  });

  test('soft deletes an unused template and hides it from template settings', async () => {
    const created = await request(app)
      .post('/api/templates')
      .send({
        name: 'Unit Price Approval',
        description: 'Inactive test template',
        trigger_event: 'unit.price_updated',
        is_active: true,
        steps: [{ sequence: 1, assignee_role: 'finance_manager' }]
      })
      .expect(201);

    await request(app).delete(`/api/templates/${created.body.id}`).expect(200);

    const templates = await request(app).get('/api/templates').expect(200);
    expect(templates.body.map((template: any) => template.name)).not.toContain('Unit Price Approval');

    const persisted = await query(
      'SELECT is_active, deleted_at FROM workflow_templates WHERE id = $1',
      [created.body.id]
    );
    expect(persisted.rows[0].is_active).toBe(false);
    expect(persisted.rows[0].deleted_at).toBeTruthy();
  });

  test('blocks soft delete while a workflow is running against the template', async () => {
    await request(app)
      .post('/api/instances')
      .send({ event_name: 'booking.cancellation_requested', entity_type: 'booking', entity_id: '1', initiated_by: 3 })
      .expect(201);

    const response = await request(app).delete('/api/templates/1').expect(409);
    expect(response.body.error).toBe('Cannot delete a template while instances are running against it');
  });

  test('does not trigger workflows from soft-deleted templates', async () => {
    const created = await request(app)
      .post('/api/templates')
      .send({
        name: 'Unit Price Approval',
        description: 'Temporary active template',
        trigger_event: 'unit.price_updated',
        is_active: true,
        steps: [{ sequence: 1, assignee_role: 'finance_manager' }]
      })
      .expect(201);

    await request(app).delete(`/api/templates/${created.body.id}`).expect(200);

    const response = await request(app)
      .post('/api/instances')
      .send({ event_name: 'unit.price_updated', entity_type: 'unit', entity_id: '2', initiated_by: 3 })
      .expect(404);

    expect(response.body.error).toBe('No active workflow template found for event unit.price_updated');
  });
});
