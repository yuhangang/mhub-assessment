import { PoolClient } from 'pg';
import { query, withTransaction } from '../db';
import { HttpError } from './errors';
import { TriggerInput, ActionInput, InstanceStep } from './types';

export class InstanceService {
  async triggerInstance(input: TriggerInput): Promise<number> {
    if (!input.event_name || !input.entity_type || !input.entity_id || !input.initiated_by) {
      throw new HttpError(400, 'event_name, entity_type, entity_id, and initiated_by are required');
    }

    return withTransaction(async (client) => {
      const templateResult = await client.query(
        `SELECT id, trigger_event
         FROM workflow_templates
         WHERE trigger_event = $1 AND is_active = true AND deleted_at IS NULL
         FOR UPDATE`,
        [input.event_name]
      );

      if (templateResult.rowCount === 0) {
        throw new HttpError(404, `No active workflow template found for event ${input.event_name}`);
      }

      const existingResult = await client.query(
        `SELECT id
         FROM workflow_instances
         WHERE entity_type = $1 AND entity_id = $2 AND trigger_event = $3 AND status IN ('pending', 'in_progress')
         LIMIT 1`,
        [input.entity_type, input.entity_id, input.event_name]
      );

      if ((existingResult.rowCount || 0) > 0) {
        throw new HttpError(
          409,
          `Entity ${input.entity_type}:${input.entity_id} already has an active workflow instance for event ${input.event_name} (${existingResult.rows[0].id})`
        );
      }

      const agentResult = await client.query('SELECT id FROM agents WHERE id = $1', [input.initiated_by]);
      if (agentResult.rowCount === 0) {
        throw new HttpError(400, `Initiator agent ${input.initiated_by} does not exist`);
      }

      const stepsResult = await client.query(
        `SELECT id, sequence, group_sequence, approval_policy, assignee_user_id, assignee_role
         FROM workflow_template_steps
         WHERE template_id = $1
         ORDER BY group_sequence ASC, sequence ASC`,
        [templateResult.rows[0].id]
      );

      if (stepsResult.rowCount === 0) {
        throw new HttpError(400, 'Active template has no steps');
      }

      const instanceResult = await client.query(
        `INSERT INTO workflow_instances (template_id, trigger_event, entity_type, entity_id, status, initiated_by)
         VALUES ($1, $2, $3, $4, 'in_progress', $5)
         RETURNING id`,
        [
          templateResult.rows[0].id,
          input.event_name,
          input.entity_type,
          input.entity_id,
          input.initiated_by
        ]
      );

      const instanceId = Number(instanceResult.rows[0].id);
      const firstGroupSequence = Math.min(...stepsResult.rows.map((step) => Number(step.group_sequence)));

      for (const step of stepsResult.rows) {
        await client.query(
          `INSERT INTO workflow_instance_steps
            (instance_id, template_step_id, sequence, group_sequence, approval_policy, assignee_user_id, assignee_role, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            instanceId,
            step.id,
            step.sequence,
            step.group_sequence,
            step.approval_policy,
            step.assignee_user_id,
            step.assignee_role,
            Number(step.group_sequence) === firstGroupSequence ? 'awaiting_action' : 'pending'
          ]
        );
      }

      return instanceId;
    });
  }

  async actionStep(input: ActionInput): Promise<void> {
    if (!input.user_id) {
      throw new HttpError(400, 'user_id is required');
    }
    if (input.decision === 'rejected' && !input.comment?.trim()) {
      throw new HttpError(400, 'comment is required when rejecting a step');
    }

    await withTransaction(async (client) => {
      const stepResult = await client.query<InstanceStep>(
        `SELECT *
         FROM workflow_instance_steps
         WHERE id = $1 AND instance_id = $2
         FOR UPDATE`,
        [input.step_id, input.instance_id]
      );

      if (stepResult.rowCount === 0) {
        throw new HttpError(404, 'Step not found for this workflow instance');
      }

      const step = stepResult.rows[0];
      if (step.status !== 'awaiting_action') {
        throw new HttpError(409, `Step is not actionable; current status is ${step.status}`);
      }

      const userResult = await client.query('SELECT id, role FROM agents WHERE id = $1', [input.user_id]);
      if (userResult.rowCount === 0) {
        throw new HttpError(400, `User ${input.user_id} does not exist`);
      }

      const user = userResult.rows[0];
      if (step.assignee_user_id && Number(step.assignee_user_id) !== input.user_id) {
        throw new HttpError(403, 'User is not assigned to this step');
      }
      if (step.assignee_role && step.assignee_role !== user.role) {
        throw new HttpError(403, `User role ${user.role} cannot act on ${step.assignee_role} step`);
      }

      const updated = await client.query(
        `UPDATE workflow_instance_steps
         SET status = $1, version = version + 1, updated_at = now()
         WHERE id = $2 AND status = 'awaiting_action' AND version = $3`,
        [input.decision, input.step_id, step.version]
      );

      if (updated.rowCount !== 1) {
        throw new HttpError(409, 'Step was already actioned by another approver');
      }

      await client.query(
        `INSERT INTO workflow_step_decisions (step_id, instance_id, decision, actioned_by, comment)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.step_id, input.instance_id, input.decision, input.user_id, input.comment || null]
      );

      if (input.decision === 'rejected') {
        await client.query(
          `UPDATE workflow_instance_steps
           SET status = 'cancelled', updated_at = now()
           WHERE instance_id = $1 AND status IN ('pending', 'awaiting_action') AND id <> $2`,
          [input.instance_id, input.step_id]
        );
        await client.query(
          `UPDATE workflow_instances
           SET status = 'rejected', updated_at = now()
           WHERE id = $1`,
          [input.instance_id]
        );
        return;
      }

      const waitingInCurrentGroup = await client.query(
        `SELECT id
         FROM workflow_instance_steps
         WHERE instance_id = $1
           AND group_sequence = $2
           AND status = 'awaiting_action'
         LIMIT 1`,
        [input.instance_id, step.group_sequence]
      );

      if ((waitingInCurrentGroup.rowCount || 0) > 0) {
        return;
      }

      const nextGroup = await client.query(
        `SELECT group_sequence
         FROM workflow_instance_steps
         WHERE instance_id = $1 AND status = 'pending'
         ORDER BY group_sequence ASC
         LIMIT 1`,
        [input.instance_id]
      );

      if (nextGroup.rowCount && nextGroup.rowCount > 0) {
        await client.query(
          `UPDATE workflow_instance_steps
           SET status = 'awaiting_action', updated_at = now()
           WHERE instance_id = $1 AND group_sequence = $2 AND status = 'pending'`,
          [input.instance_id, nextGroup.rows[0].group_sequence]
        );
        return;
      }

      await client.query(
        `UPDATE workflow_instances
         SET status = 'approved', updated_at = now()
         WHERE id = $1`,
        [input.instance_id]
      );

      await this.runFinalApprovalCallback(client, input.instance_id);
    });
  }

  private async runFinalApprovalCallback(client: PoolClient, instanceId: number): Promise<void> {
    const instanceResult = await client.query(
      'SELECT entity_type, entity_id, trigger_event FROM workflow_instances WHERE id = $1',
      [instanceId]
    );
    const instance = instanceResult.rows[0];

    if (
      instance?.entity_type === 'booking' &&
      instance.trigger_event === 'booking.cancellation_requested'
    ) {
      const booking = await client.query(
        `SELECT b.id, u.id AS unit_id
         FROM bookings b
         JOIN units u ON u.id = b.unit_id
         WHERE b.id = $1
         FOR UPDATE`,
        [instance.entity_id]
      );

      if (booking.rowCount === 0) {
        throw new HttpError(404, `Booking ${instance.entity_id} not found for callback`);
      }

      await client.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [instance.entity_id]);
      await client.query("UPDATE units SET status = 'available' WHERE id = $1", [booking.rows[0].unit_id]);
    } else if (
      instance?.entity_type === 'booking' &&
      instance.trigger_event === 'booking.confirmed'
    ) {
      const booking = await client.query(
        `SELECT id FROM bookings WHERE id = $1 FOR UPDATE`,
        [instance.entity_id]
      );
      if (booking.rowCount === 0) {
        throw new HttpError(404, `Booking ${instance.entity_id} not found for callback`);
      }
      await client.query("UPDATE bookings SET status = 'active' WHERE id = $1", [instance.entity_id]);
    }
  }

  async getInstances(): Promise<any[]> {
    const result = await query(`
      SELECT wi.*, wt.name AS template_name
      FROM workflow_instances wi
      JOIN workflow_templates wt ON wt.id = wi.template_id
      ORDER BY wi.created_at DESC, wi.id DESC
    `);
    return result.rows;
  }

  async getInstanceById(id: number): Promise<any> {
    const instance = await query(
      `SELECT wi.*, wt.name AS template_name
       FROM workflow_instances wi
       JOIN workflow_templates wt ON wt.id = wi.template_id
       WHERE wi.id = $1`,
      [id]
    );
    if (instance.rowCount === 0) {
      throw new HttpError(404, 'Workflow instance not found');
    }

    const [steps, auditTrail] = await Promise.all([
      query('SELECT * FROM workflow_instance_steps WHERE instance_id = $1 ORDER BY sequence ASC', [id]),
      query(`
        SELECT d.*, a.name AS actioned_by_name, a.role AS actioned_by_role
        FROM workflow_step_decisions d
        JOIN agents a ON a.id = d.actioned_by
        WHERE d.instance_id = $1
        ORDER BY d.actioned_at ASC
      `, [id])
    ]);

    return { ...instance.rows[0], steps: steps.rows, audit_trail: auditTrail.rows };
  }

  async getInbox(queryInput: { user_id?: number | null; role?: string | null }): Promise<any[]> {
    const userId = queryInput.user_id;
    const role = queryInput.role;
    if (!userId && !role) {
      throw new HttpError(400, 'user_id or role is required');
    }

    const result = await query(
      `SELECT s.*, wi.entity_type, wi.entity_id, wi.trigger_event, wt.name AS template_name
       FROM workflow_instance_steps s
       JOIN workflow_instances wi ON wi.id = s.instance_id
       JOIN workflow_templates wt ON wt.id = wi.template_id
       WHERE s.status = 'awaiting_action'
         AND wi.status = 'in_progress'
         AND (($1::bigint IS NOT NULL AND s.assignee_user_id = $1) OR ($2::text IS NOT NULL AND s.assignee_role = $2))
       ORDER BY s.created_at ASC`,
      [userId, role]
    );

    return result.rows;
  }
}
