import { query, withTransaction } from '../db';
import { HttpError } from './errors';
import { TemplateStepInput } from './types';

export function validateSteps(steps: unknown): asserts steps is TemplateStepInput[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new HttpError(400, 'steps must be a non-empty array');
  }

  const assigneesByGroup = new Map<string, { roles: Set<string>; users: Set<string> }>();

  for (const step of steps) {
    if (!step || typeof step !== 'object') {
      throw new HttpError(400, 'each step must be an object');
    }

    const candidate = step as TemplateStepInput;
    if (!Number.isInteger(Number(candidate.sequence)) || Number(candidate.sequence) <= 0) {
      throw new HttpError(400, 'step sequence must be a positive integer');
    }
    if (
      candidate.group_sequence !== undefined &&
      (!Number.isInteger(Number(candidate.group_sequence)) || Number(candidate.group_sequence) <= 0)
    ) {
      throw new HttpError(400, 'step group_sequence must be a positive integer');
    }
    if (candidate.approval_policy !== undefined && candidate.approval_policy !== 'ALL') {
      throw new HttpError(400, "approval_policy must be 'ALL'");
    }

    const groupSequence = Number(candidate.group_sequence ?? candidate.sequence);
    const groupAssignees = assigneesByGroup.get(String(groupSequence)) ?? {
      roles: new Set<string>(),
      users: new Set<string>()
    };

    if (candidate.assignee_role) {
      const role = String(candidate.assignee_role);
      if (groupAssignees.roles.has(role)) {
        throw new HttpError(400, 'parallel steps in the same group must use different roles or different users');
      }
      groupAssignees.roles.add(role);
    }

    if (candidate.assignee_user_id) {
      const userId = String(candidate.assignee_user_id);
      if (groupAssignees.users.has(userId)) {
        throw new HttpError(400, 'parallel steps in the same group must use different roles or different users');
      }
      groupAssignees.users.add(userId);
    }

    assigneesByGroup.set(String(groupSequence), groupAssignees);
  }
}

export class TemplateService {
  async getTemplates(): Promise<any[]> {
    const result = await query(
      'SELECT * FROM workflow_templates WHERE deleted_at IS NULL ORDER BY trigger_event ASC, version DESC, id DESC'
    );
    return result.rows;
  }

  async createTemplate(data: {
    name: string;
    description?: string;
    trigger_event: string;
    is_active?: boolean;
    steps: any[];
  }): Promise<number> {
    const { name, description = '', trigger_event, is_active = false, steps } = data;
    if (!name || !trigger_event || !Array.isArray(steps) || steps.length === 0) {
      throw new HttpError(400, 'name, trigger_event, and non-empty steps are required');
    }
    validateSteps(steps);

    return withTransaction(async (client) => {
      const latestRevision = await client.query(
        `SELECT id, version
         FROM workflow_templates
         WHERE trigger_event = $1
         ORDER BY version DESC
         LIMIT 1
         FOR UPDATE`,
        [trigger_event]
      );
      const nextVersion = latestRevision.rowCount ? Number(latestRevision.rows[0].version) + 1 : 1;
      const previousTemplateId = latestRevision.rowCount ? latestRevision.rows[0].id : null;

      const template = await client.query<{ id: string }>(
        `INSERT INTO workflow_templates
           (name, description, trigger_event, version, previous_template_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [name, description, trigger_event, nextVersion, previousTemplateId, Boolean(is_active)]
      );

      for (const step of steps) {
        await client.query(
          `INSERT INTO workflow_template_steps
             (template_id, sequence, group_sequence, approval_policy, assignee_user_id, assignee_role)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            template.rows[0].id,
            Number(step.sequence),
            Number(step.group_sequence ?? step.sequence),
            step.approval_policy ?? 'ALL',
            step.assignee_user_id || null,
            step.assignee_role || null
          ]
        );
      }

      return Number(template.rows[0].id);
    });
  }

  async getTemplateById(id: number): Promise<any> {
    const template = await query(
      'SELECT * FROM workflow_templates WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (template.rowCount === 0) {
      throw new HttpError(404, 'Template not found');
    }
    const steps = await query(
      'SELECT * FROM workflow_template_steps WHERE template_id = $1 ORDER BY sequence ASC',
      [id]
    );
    return { ...template.rows[0], steps: steps.rows };
  }

  async patchTemplate(id: number, data: { name?: string; description?: string; steps?: any[] }): Promise<any> {
    const { name, description, steps } = data;
    if (name !== undefined && String(name).trim() === '') {
      throw new HttpError(400, 'Template name cannot be empty');
    }
    if (steps !== undefined) {
      validateSteps(steps);
    }

    return withTransaction(async (client) => {
      const template = await client.query(
        'SELECT * FROM workflow_templates WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (template.rowCount === 0) {
        throw new HttpError(404, 'Template not found');
      }

      const current = template.rows[0];
      const latest = await client.query(
        `SELECT id, version
         FROM workflow_templates
         WHERE trigger_event = $1 AND deleted_at IS NULL
         ORDER BY version DESC
         LIMIT 1
         FOR UPDATE`,
        [current.trigger_event]
      );
      if (latest.rowCount === 0 || String(latest.rows[0].id) !== String(current.id)) {
        throw new HttpError(409, 'Only the latest template revision can be updated');
      }

      const revisionSteps = steps !== undefined
        ? steps
        : (await client.query(
            `SELECT sequence, group_sequence, approval_policy, assignee_user_id, assignee_role
             FROM workflow_template_steps
             WHERE template_id = $1
             ORDER BY sequence ASC`,
            [current.id]
          )).rows;

      validateSteps(revisionSteps);

      if (current.is_active) {
        await client.query(
          `UPDATE workflow_templates
           SET is_active = false, updated_at = now()
           WHERE trigger_event = $1 AND is_active = true`,
          [current.trigger_event]
        );
      }

      const inserted = await client.query(
        `INSERT INTO workflow_templates
           (name, description, trigger_event, version, previous_template_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          name === undefined ? current.name : String(name).trim(),
          description === undefined ? current.description : String(description),
          current.trigger_event,
          Number(current.version) + 1,
          current.id,
          Boolean(current.is_active)
        ]
      );

      for (const step of revisionSteps) {
        await client.query(
          `INSERT INTO workflow_template_steps
             (template_id, sequence, group_sequence, approval_policy, assignee_user_id, assignee_role)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            inserted.rows[0].id,
            Number(step.sequence),
            Number(step.group_sequence ?? step.sequence),
            step.approval_policy ?? 'ALL',
            step.assignee_user_id || null,
            step.assignee_role || null
          ]
        );
      }

      return inserted.rows[0];
    });
  }

  async activateTemplate(id: number): Promise<any> {
    return withTransaction(async (client) => {
      const template = await client.query(
        'SELECT id, trigger_event FROM workflow_templates WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (template.rowCount === 0) {
        throw new HttpError(404, 'Template not found');
      }

      const triggerEvent = template.rows[0].trigger_event;
      const existingActive = await client.query(
        `SELECT id
         FROM workflow_templates
         WHERE trigger_event = $1 AND is_active = true AND deleted_at IS NULL AND id <> $2
         LIMIT 1`,
        [triggerEvent, id]
      );
      if ((existingActive.rowCount || 0) > 0) {
        throw new HttpError(409, `Another template is already active for trigger event '${triggerEvent}'`);
      }

      const updated = await client.query(
        'UPDATE workflow_templates SET is_active = true, updated_at = now() WHERE id = $1 RETURNING *',
        [id]
      );

      return updated.rows[0];
    });
  }

  async deactivateTemplate(id: number): Promise<any> {
    const updated = await query(
      'UPDATE workflow_templates SET is_active = false, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
      [id]
    );
    if (updated.rowCount === 0) {
      throw new HttpError(404, 'Template not found');
    }
    return updated.rows[0];
  }

  async deleteTemplate(id: number): Promise<any> {
    return withTransaction(async (client) => {
      const template = await client.query(
        'SELECT id FROM workflow_templates WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (template.rowCount === 0) {
        throw new HttpError(404, 'Template not found');
      }

      const running = await client.query(
        `SELECT id
         FROM workflow_instances
         WHERE template_id = $1 AND status IN ('pending', 'in_progress')
         LIMIT 1`,
        [id]
      );
      if ((running.rowCount || 0) > 0) {
        throw new HttpError(409, 'Cannot delete a template while instances are running against it');
      }

      const updated = await client.query(
        `UPDATE workflow_templates
         SET is_active = false, deleted_at = now(), updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      return updated.rows[0];
    });
  }
}
