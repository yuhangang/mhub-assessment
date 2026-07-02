import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { WorkflowEngine } from '../services/workflow';

const router = Router();

/**
 * Part 3 — Code Review Rewrite
 * 
 * Target Endpoint: POST /api/review/workflow-instances/:id/steps/:stepId/approve
 * 
 * Corrections implemented:
 * 1. SQL Injection: Parameterized queries (?) are used everywhere.
 * 2. Inverted Status Logic: Reject if step status is NOT 'awaiting_action'.
 * 3. Race Conditions: Optimistic locking version validation. The update increases the version.
 *    If changes === 0, the step has already been actioned (concurrency conflict).
 * 4. Missing Authorization: Check if actioning user matches the assignee_user_id or assignee_role.
 * 5. No Transaction Wrapping: Wrapped in a database transaction block.
 * 6. Audit Trail: Decisions are recorded in the workflow_step_decisions table.
 * 7. HTTP Response Codes: 400, 403, 404, 409, 200, 500.
 * 8. Portability: SQLite compatible CURRENT_TIMESTAMP.
 */
router.post('/workflow-instances/:id/steps/:stepId/approve', (req: Request, res: Response) => {
  const instanceId = parseInt(req.params.id);
  const stepId = parseInt(req.params.stepId);
  const { user_id, comment } = req.body;

  // 1. Input Validation
  if (isNaN(instanceId) || isNaN(stepId)) {
    return res.status(400).json({ error: 'Instance ID and Step ID must be integers' });
  }

  if (!user_id || isNaN(parseInt(user_id))) {
    return res.status(400).json({ error: 'Valid user_id is required' });
  }

  const userIdNum = parseInt(user_id);

  try {
    const pendingCallback: { fn?: () => void } = {};

    const runTx = db.transaction(() => {
      // 2. Fetch the step safely
      const step = db.prepare(
        'SELECT * FROM workflow_instance_steps WHERE id = ? AND instance_id = ?'
      ).get(stepId, instanceId) as any;

      if (!step) {
        return { status: 404, data: { error: 'Workflow step or instance not found' } };
      }

      // 3. Status Check (Verify step is awaiting action)
      if (step.status !== 'awaiting_action') {
        if (step.status === 'approved' || step.status === 'rejected') {
          return { status: 409, data: { error: `Concurrency Conflict: Step is already actioned (current status: ${step.status})` } };
        }
        return { status: 400, data: { error: `Step is not actionable (current status: ${step.status})` } };
      }

      // 4. Fetch the actioning user/agent details for Authorization
      const user = db.prepare(
        'SELECT id, role FROM agents WHERE id = ?'
      ).get(userIdNum) as { id: number; role: string } | undefined;

      if (!user) {
        return { status: 403, data: { error: 'User not found in system' } };
      }

      // 5. Authorization Check
      if (step.assignee_user_id !== null) {
        if (step.assignee_user_id !== userIdNum) {
          return { status: 403, data: { error: `Unauthorized: Step is assigned to user ID: ${step.assignee_user_id}` } };
        }
      } else if (step.assignee_role !== null) {
        if (step.assignee_role !== user.role) {
          return { status: 403, data: { error: `Unauthorized: Step is assigned to role '${step.assignee_role}', user has role '${user.role}'` } };
        }
      }

      // 6. Concurrency Control: Optimistic status and version update
      const updateResult = db.prepare(`
        UPDATE workflow_instance_steps 
        SET status = 'approved', version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'awaiting_action' AND version = ?
      `).run(stepId, step.version);

      if (updateResult.changes === 0) {
        return { status: 409, data: { error: 'Concurrency Conflict: This step has already been actioned' } };
      }

      // 7. Audit Trail insertion
      db.prepare(`
        INSERT INTO workflow_step_decisions (step_id, instance_id, decision, actioned_by, comment)
        VALUES (?, ?, 'approved', ?, ?)
      `).run(stepId, instanceId, userIdNum, comment || null);

      // 8. Progress to next step or complete instance
      const nextStep = db.prepare(`
        SELECT * FROM workflow_instance_steps 
        WHERE instance_id = ? AND sequence > ? 
        ORDER BY sequence ASC LIMIT 1
      `).get(instanceId, step.sequence) as any;

      if (nextStep) {
        // Advance to next step
        db.prepare(`
          UPDATE workflow_instance_steps 
          SET status = 'awaiting_action', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(nextStep.id);
      } else {
        // No next step -> Complete/Approve Instance
        db.prepare(`
          UPDATE workflow_instances 
          SET status = 'approved', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(instanceId);

        // Retrieve instance details to run callbacks
        const instance = db.prepare(
          'SELECT template_id, entity_type, entity_id FROM workflow_instances WHERE id = ?'
        ).get(instanceId) as { template_id: number; entity_type: string; entity_id: string };

        const template = db.prepare(
          'SELECT trigger_event FROM workflow_templates WHERE id = ?'
        ).get(instance.template_id) as { trigger_event: string };

        // Get post-approval callback
        const callback = WorkflowEngine.getCallback(instance.entity_type, template.trigger_event);
        if (callback) {
          pendingCallback.fn = () => callback(instance.entity_id);
        }
      }

      return { status: 200, data: { success: true } };
    });

    const result = runTx();

    if (result.status === 200 && pendingCallback.fn) {
      pendingCallback.fn();
    }

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error('Error in review approval handler:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
