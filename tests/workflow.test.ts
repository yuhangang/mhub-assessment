import request from 'supertest';
import app from '../src/index';
import db from '../src/db/connection';
import { runSeed } from '../src/db/seed';

describe('Workflow Engine Technical Challenge Tests', () => {
  beforeEach(async () => {
    // Reset and seed the database before each test
    await runSeed();
  });

  afterAll(async () => {
    // Close DB connection
    await db.close();
  });

  describe('Part 2.1 — Template Management', () => {
    test('POST /api/templates - creates a new template and its steps successfully', async () => {
      const payload = {
        name: 'New Custom Workflow',
        description: 'Verifies price updates',
        trigger_event: 'unit.price_updated',
        is_active: 1,
        steps: [
          { sequence: 1, assignee_role: 'finance_manager' },
          { sequence: 2, assignee_user_id: 2 }
        ]
      };

      const res = await request(app)
        .post('/api/templates')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('templateId');

      // Verify template exists in DB
      const template = await db.queryOne('SELECT * FROM workflow_templates WHERE id = ?', [res.body.templateId]) as any;
      expect(template.name).toBe('New Custom Workflow');
      expect(template.description).toBe('Verifies price updates');
      expect(template.is_active).toBe(1);

      // Verify steps
      const steps = await db.query('SELECT * FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC', [res.body.templateId]) as any[];
      expect(steps.length).toBe(2);
      expect(steps[0].assignee_role).toBe('finance_manager');
      expect(steps[0].assignee_user_id).toBeNull();
      expect(steps[1].assignee_user_id).toBe(2);
      expect(steps[1].assignee_role).toBeNull();
    });

    test('POST /api/templates - rejects duplicate active trigger event', async () => {
      const payload = {
        name: 'Duplicate Workflow',
        trigger_event: 'booking.cancellation_requested',
        is_active: 1,
        steps: [
          { sequence: 1, assignee_role: 'sales_manager' }
        ]
      };

      const res = await request(app)
        .post('/api/templates')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already bound to trigger event');
    });

    test('GET /api/templates/:id - returns template details with steps', async () => {
      const res = await request(app).get('/api/templates/1');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Booking Cancellation Workflow');
      expect(res.body.description).toBe('Standard workflow for cancellation requests of booked properties');
      expect(res.body.steps.length).toBe(2);
      expect(res.body.steps[0].sequence).toBe(1);
      expect(res.body.steps[0].assignee_role).toBe('sales_manager');
    });

    test('PUT /api/templates/:id - permits updates if no instances are running', async () => {
      const payload = {
        name: 'Updated Name',
        description: 'New Description',
        trigger_event: 'booking.cancellation_requested',
        steps: [
          { sequence: 1, assignee_role: 'sales_coordinator' }
        ]
      };

      const res = await request(app)
        .put('/api/templates/1')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const template = await db.queryOne('SELECT name, description FROM workflow_templates WHERE id = 1') as any;
      expect(template.name).toBe('Updated Name');
      expect(template.description).toBe('New Description');
    });

    test('PUT /api/templates/:id - blocks updates if instances are running', async () => {
      // Trigger an instance first
      await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      // Try updating
      const payload = {
        name: 'Updated Name',
        trigger_event: 'booking.cancellation_requested',
        steps: [
          { sequence: 1, assignee_role: 'sales_coordinator' }
        ]
      };

      const res = await request(app)
        .put('/api/templates/1')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('instances are currently running');
    });
  });

  describe('Part 2.2 — Triggering Workflow Instance', () => {
    test('POST /api/instances - triggers workflow instance successfully and configures step status', async () => {
      const res = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('instanceId');

      // Verify instance status in DB (should be 'in_progress')
      const instance = await db.queryOne('SELECT * FROM workflow_instances WHERE id = ?', [res.body.instanceId]) as any;
      expect(instance.status).toBe('in_progress');
      expect(instance.entity_type).toBe('booking');
      expect(instance.entity_id).toBe('1');
      expect(instance.initiated_by).toBe(1);

      // Verify step statuses (Step 1 -> awaiting_action, Step 2 -> pending)
      const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [res.body.instanceId]) as any[];
      expect(steps.length).toBe(2);
      expect(steps[0].sequence).toBe(1);
      expect(steps[0].status).toBe('awaiting_action');
      expect(steps[1].sequence).toBe(2);
      expect(steps[1].status).toBe('pending');
    });

    test('POST /api/instances - prevents duplicate running instances for same entity', async () => {
      // First trigger
      await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      // Second trigger (should fail)
      const res = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('active workflow instance already exists');
    });
  });

  describe('Part 2.3 — Inbox & Step Actions & Concurrency', () => {
    test('GET /api/inbox - retrieves pending steps matching role or user ID', async () => {
      // Trigger instance
      await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      // Step 1 is assigned to role 'sales_manager'
      // Fetch inbox for sales_manager
      const resRole = await request(app).get('/api/inbox?role=sales_manager');
      expect(resRole.status).toBe(200);
      expect(resRole.body.length).toBe(1);
      expect(resRole.body[0].assignee_role).toBe('sales_manager');
      expect(resRole.body[0].source_entity.buyer_name).toBe('John Doe');

      // Fetch inbox for non-matching role
      const resWrongRole = await request(app).get('/api/inbox?role=finance_manager');
      expect(resWrongRole.status).toBe(200);
      expect(resWrongRole.body.length).toBe(0);
    });

    test('POST /api/instances/:id/steps/:stepId/approve - workflow progression, audit trail & callback', async () => {
      // Trigger instance
      const triggerRes = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      const instanceId = triggerRes.body.instanceId;

      // Get steps to find IDs
      const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
      const step1Id = steps[0].id;
      const step2Id = steps[1].id;

      // Alice (ID: 1, role sales_coordinator) tries to approve step 1. Forbidden.
      const forbiddenRes = await request(app)
        .post(`/api/instances/${instanceId}/steps/${step1Id}/approve`)
        .send({ user_id: 1, comment: 'Illegal approval' });
      expect(forbiddenRes.status).toBe(403);

      // Bob (ID: 2, role sales_manager) approves step 1. Success.
      const approve1Res = await request(app)
        .post(`/api/instances/${instanceId}/steps/${step1Id}/approve`)
        .send({ user_id: 2, comment: 'Manager approves' });
      expect(approve1Res.status).toBe(200);

      // Verify audit decision created
      const decisions = await db.query('SELECT * FROM workflow_step_decisions WHERE instance_id = ?', [instanceId]) as any[];
      expect(decisions.length).toBe(1);
      expect(decisions[0].step_id).toBe(step1Id);
      expect(decisions[0].decision).toBe('approved');
      expect(decisions[0].actioned_by).toBe(2);
      expect(decisions[0].comment).toBe('Manager approves');

      // Verify step 2 is now awaiting_action
      const step2 = await db.queryOne('SELECT status FROM workflow_instance_steps WHERE id = ?', [step2Id]) as any;
      expect(step2.status).toBe('awaiting_action');

      // Charlie (ID: 3, role finance_manager) is assigned explicitly as user_id 3 on step 2.
      // Charlie approves step 2. Success.
      const approve2Res = await request(app)
        .post(`/api/instances/${instanceId}/steps/${step2Id}/approve`)
        .send({ user_id: 3, comment: 'Finance sign-off' });
      expect(approve2Res.status).toBe(200);

      // Verify instance details and full audit history
      const instanceRes = await request(app).get(`/api/instances/${instanceId}`);
      expect(instanceRes.status).toBe(200);
      expect(instanceRes.body.status).toBe('approved');
      expect(instanceRes.body.audit_trail.length).toBe(2);
      expect(instanceRes.body.audit_trail[0].decision).toBe('approved');
      expect(instanceRes.body.audit_trail[1].decision).toBe('approved');
      expect(instanceRes.body.audit_trail[1].agent_name).toBe('Charlie Finance');

      // Verify Callback executed
      const booking = await db.queryOne('SELECT status, unit_id FROM bookings WHERE id = 1') as any;
      expect(booking.status).toBe('cancelled');
    });

    test('POST /api/instances/:id/steps/:stepId/reject - rejects step immediately & terminates workflow', async () => {
      const triggerRes = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      const instanceId = triggerRes.body.instanceId;
      const step1Id = (await db.queryOne('SELECT id FROM workflow_instance_steps WHERE instance_id = ? AND sequence = 1', [instanceId]) as any).id;

      // Reject step 1 (Bob, ID 2, sales_manager)
      const rejectRes = await request(app)
        .post(`/api/instances/${instanceId}/steps/${step1Id}/reject`)
        .send({ user_id: 2, comment: 'Booking cannot be cancelled' });

      expect(rejectRes.status).toBe(200);

      // Verify step is rejected in decisions
      const decisions = await db.query('SELECT * FROM workflow_step_decisions WHERE step_id = ?', [step1Id]) as any[];
      expect(decisions.length).toBe(1);
      expect(decisions[0].decision).toBe('rejected');
      expect(decisions[0].comment).toBe('Booking cannot be cancelled');

      // Verify instance status is 'rejected'
      const instance = await db.queryOne('SELECT status FROM workflow_instances WHERE id = ?', [instanceId]) as any;
      expect(instance.status).toBe('rejected');
    });

    test('Concurrency Control - optimistic locking blocks simultaneous step approvals', async () => {
      const triggerRes = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      const instanceId = triggerRes.body.instanceId;
      const step1Id = (await db.queryOne('SELECT id FROM workflow_instance_steps WHERE instance_id = ? AND sequence = 1', [instanceId]) as any).id;

      const [res1, res2] = await Promise.all([
        request(app).post(`/api/instances/${instanceId}/steps/${step1Id}/approve`).send({ user_id: 2, comment: 'Approver A' }),
        request(app).post(`/api/instances/${instanceId}/steps/${step1Id}/approve`).send({ user_id: 2, comment: 'Approver B' })
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });
  });

  describe('Part 3 — Code Review Rewrite Endpoint', () => {
    test('POST /api/review/workflow-instances/:id/steps/:stepId/approve - checks validations and progressive approvals', async () => {
      const triggerRes = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });

      const instanceId = triggerRes.body.instanceId;
      const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
      const step1Id = steps[0].id;
      const step2Id = steps[1].id;

      // 1. Step 2 is not actionable (still pending)
      const step2Res = await request(app)
        .post(`/api/review/workflow-instances/${instanceId}/steps/${step2Id}/approve`)
        .send({ user_id: 3, comment: 'Finance sign-off early' });
      expect(step2Res.status).toBe(400);

      // 2. Unauthorized user
      const authRes = await request(app)
        .post(`/api/review/workflow-instances/${instanceId}/steps/${step1Id}/approve`)
        .send({ user_id: 1 });
      expect(authRes.status).toBe(403);

      // 3. Approve successfully
      const approveRes1 = await request(app)
        .post(`/api/review/workflow-instances/${instanceId}/steps/${step1Id}/approve`)
        .send({ user_id: 2, comment: 'Bob approves via review endpoint' });
      expect(approveRes1.status).toBe(200);

      // Verify db changes
      const step1 = await db.queryOne('SELECT status, version FROM workflow_instance_steps WHERE id = ?', [step1Id]) as any;
      expect(step1.status).toBe('approved');
      expect(step1.version).toBe(1);

      // Verify decisions log
      const decision = await db.queryOne('SELECT * FROM workflow_step_decisions WHERE step_id = ?', [step1Id]) as any;
      expect(decision.decision).toBe('approved');
      expect(decision.comment).toBe('Bob approves via review endpoint');
    });
  });

  describe('Part 4 — Data Entry and Automated Checking Usecases', () => {
    test('Trigger cancellation_with_refund: submitting refund within limit auto-approves and advances', async () => {
      // 1. Trigger the advanced refund workflow
      const triggerRes = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_with_refund',
          entity_type: 'booking',
          entity_id: '1',
          initiated_by: 1
        });
      expect(triggerRes.status).toBe(201);
      const instanceId = triggerRes.body.instanceId;

      // Fetch the steps
      const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
      expect(steps.length).toBe(3);
      expect(steps[0].step_type).toBe('data_entry');
      expect(steps[0].status).toBe('awaiting_action');
      expect(steps[1].step_type).toBe('automated');
      expect(steps[1].status).toBe('pending');
      
      const step1Id = steps[0].id;
      const step2Id = steps[1].id;
      const step3Id = steps[2].id;

      // 2. Action Step 1 (Data Entry) by Alice Coordinator (user_id: 1, role: sales_coordinator)
      // Deposit = 10% of unit price ($450,000) = $45,000. Limit = 5% of unit price = $22,500.
      // We submit a refund of $15,000 (which is within the limit)
      const actionRes = await request(app)
        .post(`/api/instances/${instanceId}/steps/${step1Id}/approve`)
        .send({
          user_id: 1,
          comment: 'Alice enters refund details',
          submitted_data: { refund_amount: 15000, reason: 'Withdrew before signing' }
        });
      expect(actionRes.status).toBe(200);

      // Verify Step 1 is approved and submitted_data is saved
      const step1Obj = await db.queryOne('SELECT * FROM workflow_instance_steps WHERE id = ?', [step1Id]) as any;
      expect(step1Obj.status).toBe('approved');
      expect(JSON.parse(step1Obj.submitted_data)).toEqual({ refund_amount: 15000, reason: 'Withdrew before signing' });

      // Verify Step 2 (Automated check) was triggered, passed, and marked approved automatically by System (-1)
      const step2Obj = await db.queryOne('SELECT * FROM workflow_instance_steps WHERE id = ?', [step2Id]) as any;
      expect(step2Obj.status).toBe('approved');

      const decision2 = await db.queryOne('SELECT * FROM workflow_step_decisions WHERE step_id = ?', [step2Id]) as any;
      expect(decision2.decision).toBe('approved');
      expect(decision2.actioned_by).toBe(-1);
      expect(decision2.comment).toContain('Automated Check Passed');

      // Verify Step 3 is now awaiting_action
      const step3Obj = await db.queryOne('SELECT * FROM workflow_instance_steps WHERE id = ?', [step3Id]) as any;
      expect(step3Obj.status).toBe('awaiting_action');
    });

    test('Trigger cancellation_with_refund: submitting refund exceeding limit auto-rejects and terminates workflow', async () => {
      // 1. Trigger the advanced refund workflow
      const triggerRes = await request(app)
        .post('/api/instances')
        .send({
          event_name: 'booking.cancellation_with_refund',
          entity_type: 'booking',
          entity_id: '2',
          initiated_by: 1
        });
      expect(triggerRes.status).toBe(201);
      const instanceId = triggerRes.body.instanceId;

      const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
      const step1Id = steps[0].id;
      const step2Id = steps[1].id;

      // 2. Action Step 1 (Data Entry)
      // Price = $520,000, Limit = $26,000.
      // We submit a refund of $35,000 (which exceeds the limit)
      const actionRes = await request(app)
        .post(`/api/instances/${instanceId}/steps/${step1Id}/approve`)
        .send({
          user_id: 1,
          comment: 'Alice enters refund details',
          submitted_data: { refund_amount: 35000, reason: 'Buyer demands full refund' }
        });
      expect(actionRes.status).toBe(200);

      // Verify Step 1 is approved
      const step1Obj = await db.queryOne('SELECT * FROM workflow_instance_steps WHERE id = ?', [step1Id]) as any;
      expect(step1Obj.status).toBe('approved');

      // Verify Step 2 (Automated check) was triggered and marked rejected automatically by System (-1)
      const step2Obj = await db.queryOne('SELECT * FROM workflow_instance_steps WHERE id = ?', [step2Id]) as any;
      expect(step2Obj.status).toBe('rejected');

      const decision2 = await db.queryOne('SELECT * FROM workflow_step_decisions WHERE step_id = ?', [step2Id]) as any;
      expect(decision2.decision).toBe('rejected');
      expect(decision2.actioned_by).toBe(-1);
      expect(decision2.comment).toContain('Automated Check Failed');

      // Verify the entire instance is rejected
      const instanceObj = await db.queryOne('SELECT * FROM workflow_instances WHERE id = ?', [instanceId]) as any;
      expect(instanceObj.status).toBe('rejected');
    });
  });
});
