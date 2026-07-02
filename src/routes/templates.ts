import { Router, Request, Response } from 'express';
import db, { DbConnection } from '../db/connection';

const router = Router();

type StepType = 'approval' | 'data_entry' | 'automated';

interface StepInput {
  sequence: number;
  assignee_user_id?: number | null;
  assignee_role?: string | null;
  step_type?: StepType;
  config?: unknown;
}

interface TemplateInput {
  name: string;
  description?: string;
  trigger_event: string;
  is_active?: number;
  steps: StepInput[];
}

interface NormalizedStepInput {
  sequence: number;
  assignee_user_id: number | null;
  assignee_role: string | null;
  step_type: StepType;
  config: string | null;
}

const VALID_ROLES = ['sales_manager', 'finance_manager', 'sales_coordinator'];

function normalizeConfig(config: unknown): string | null {
  if (config === undefined || config === null) {
    return null;
  }

  return typeof config === 'string' ? config : JSON.stringify(config);
}

function normalizeIsActive(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value ? 1 : 0;
}

function normalizeStep(step: StepInput): NormalizedStepInput {
  return {
    sequence: step.sequence,
    assignee_user_id: step.assignee_user_id ?? null,
    assignee_role: step.assignee_role?.toString().trim() || null,
    step_type: step.step_type ?? 'approval',
    config: normalizeConfig(step.config),
  };
}

/**
 * Validate steps: ordered, starting from 1, contiguous, and assignee rules depend on step type.
 */
async function validateSteps(steps: StepInput[]): Promise<string | null> {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'Steps must be a non-empty array';
  }

  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);

  if (sorted[0].sequence !== 1) {
    return 'Steps must start with sequence 1';
  }

  for (let i = 0; i < sorted.length; i++) {
    const step = normalizeStep(sorted[i]);

    if (step.sequence !== i + 1) {
      return `Invalid step sequence: expected ${i + 1}, got ${step.sequence}`;
    }

    const hasUser = step.assignee_user_id !== null;
    const hasRole = step.assignee_role !== null;

    if (step.step_type === 'automated') {
      if (hasUser || hasRole) {
        return `Automated step ${step.sequence} cannot specify assignee_user_id or assignee_role`;
      }
      continue;
    }

    if ((hasUser && hasRole) || (!hasUser && !hasRole)) {
      return `Step ${step.sequence} must specify exactly one of assignee_user_id or assignee_role`;
    }

    if (hasUser) {
      const userExists = await db.queryOne('SELECT id FROM agents WHERE id = ?', [step.assignee_user_id]);
      if (!userExists) {
        return `Step ${step.sequence} assignee_user_id (${step.assignee_user_id}) does not exist in agents`;
      }
    }

    if (hasRole && !VALID_ROLES.includes(step.assignee_role as string)) {
      return `Step ${step.sequence} assignee_role must be one of: ${VALID_ROLES.join(', ')}`;
    }
  }

  return null;
}

async function insertTemplateVersion(
  tx: DbConnection,
  input: TemplateInput,
  normalizedSteps: NormalizedStepInput[],
  options?: {
    isActive?: number;
    version?: number;
    previousTemplateId?: number | null;
  }
): Promise<number> {
  const templateResult = await tx.execute(
    `INSERT INTO workflow_templates
      (name, description, trigger_event, version, previous_template_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.description ?? '',
      input.trigger_event,
      options?.version ?? 1,
      options?.previousTemplateId ?? null,
      options?.isActive ?? normalizeIsActive(input.is_active),
    ]
  );

  const templateId = templateResult.lastInsertRowid as number;

  for (const step of normalizedSteps) {
    await tx.execute(
      `INSERT INTO workflow_template_steps
        (template_id, sequence, assignee_user_id, assignee_role, step_type, config)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        templateId,
        step.sequence,
        step.assignee_user_id,
        step.assignee_role,
        step.step_type,
        step.config,
      ]
    );
  }

  return templateId;
}

/**
 * 1. POST /api/templates - Create a new template with steps
 */
router.post('/', async (req: Request, res: Response) => {
  const { name, description = '', trigger_event, steps } = req.body as TemplateInput;
  const isActive = normalizeIsActive((req.body as TemplateInput).is_active);

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  if (!trigger_event || !trigger_event.trim()) {
    return res.status(400).json({ error: 'Trigger event is required' });
  }

  const stepsError = await validateSteps(steps);
  if (stepsError) {
    return res.status(400).json({ error: stepsError });
  }

  const normalizedSteps = steps.map(normalizeStep);

  const event = await db.queryOne(
    'SELECT is_enabled FROM workflow_events WHERE name = ?',
    [trigger_event]
  ) as { is_enabled: number } | undefined;

  if (!event) {
    return res.status(400).json({ error: `Trigger event '${trigger_event}' is not registered` });
  }

  if (isActive === 1) {
    if (event.is_enabled !== 1) {
      return res.status(400).json({
        error: `Cannot activate template: Trigger event '${trigger_event}' is currently disabled`
      });
    }

    const existing = await db.queryOne(
      'SELECT id FROM workflow_templates WHERE trigger_event = ? AND is_active = 1',
      [trigger_event]
    );

    if (existing) {
      return res.status(400).json({
        error: `An active template is already bound to trigger event '${trigger_event}'`
      });
    }
  }

  try {
    const templateId = await db.transaction(async (tx) => {
      return insertTemplateVersion(
        tx,
        { name, description, trigger_event, is_active: isActive, steps },
        normalizedSteps,
        { isActive, version: 1, previousTemplateId: null }
      );
    });

    return res.status(201).json({ success: true, templateId });
  } catch (error: any) {
    console.error('Error creating template:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(400).json({
        error: `Conflict: Constraint violation. An active template might already be bound to trigger event '${trigger_event}'`
      });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * 2. GET /api/templates/:id - Retrieve template details with steps
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const template = await db.queryOne(
    'SELECT * FROM workflow_templates WHERE id = ?',
    [id]
  ) as any;

  if (!template) {
    return res.status(404).json({ error: `Template with ID ${id} not found` });
  }

  const steps = await db.query(
    `SELECT id, sequence, assignee_user_id, assignee_role, step_type, config, created_at
     FROM workflow_template_steps
     WHERE template_id = ?
     ORDER BY sequence ASC`,
    [id]
  );

  return res.json({
    ...template,
    is_active: Boolean(template.is_active),
    steps
  });
});

/**
 * 3. PUT /api/templates/:id - Create a new immutable version of a template.
 */
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description = '', trigger_event, steps } = req.body as TemplateInput;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  if (!trigger_event || !trigger_event.trim()) {
    return res.status(400).json({ error: 'Trigger event is required' });
  }

  const stepsError = await validateSteps(steps);
  if (stepsError) {
    return res.status(400).json({ error: stepsError });
  }

  const normalizedSteps = steps.map(normalizeStep);

  const event = await db.queryOne(
    'SELECT is_enabled FROM workflow_events WHERE name = ?',
    [trigger_event]
  ) as { is_enabled: number } | undefined;

  if (!event) {
    return res.status(400).json({ error: `Trigger event '${trigger_event}' is not registered` });
  }

  const template = await db.queryOne('SELECT * FROM workflow_templates WHERE id = ?', [id]) as any;
  if (!template) {
    return res.status(404).json({ error: `Template with ID ${id} not found` });
  }

  const nextIsActive = normalizeIsActive((req.body as TemplateInput).is_active, template.is_active);

  if (nextIsActive === 1 && event.is_enabled !== 1) {
    return res.status(400).json({
      error: `Cannot activate template: Trigger event '${trigger_event}' is currently disabled`
    });
  }

  try {
    const templateId = await db.transaction(async (tx) => {
      if (nextIsActive === 1) {
        if (template.is_active === 1) {
          await tx.execute(
            'UPDATE workflow_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
          );
        }

        await tx.execute(
          `UPDATE workflow_templates
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE trigger_event = ? AND is_active = 1`,
          [trigger_event]
        );
      }

      return insertTemplateVersion(
        tx,
        { name, description, trigger_event, is_active: nextIsActive, steps },
        normalizedSteps,
        {
          isActive: nextIsActive,
          version: Number(template.version) + 1,
          previousTemplateId: Number(id),
        }
      );
    });

    return res.json({
      success: true,
      message: 'Template updated successfully as a new version',
      templateId,
      previousTemplateId: Number(id),
      version: Number(template.version) + 1,
    });
  } catch (error: any) {
    console.error('Error updating template:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(400).json({
        error: `Conflict: An active template is already bound to trigger event '${trigger_event}'`
      });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * 4. PATCH /api/templates/:id/status - Toggle is_active
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (is_active === undefined) {
    return res.status(400).json({ error: 'is_active is required' });
  }

  const activeVal = is_active ? 1 : 0;

  const template = await db.queryOne('SELECT * FROM workflow_templates WHERE id = ?', [id]) as any;
  if (!template) {
    return res.status(404).json({ error: `Template with ID ${id} not found` });
  }

  if (activeVal === 1) {
    const event = await db.queryOne(
      'SELECT is_enabled FROM workflow_events WHERE name = ?',
      [template.trigger_event]
    ) as { is_enabled: number } | undefined;

    if (!event || event.is_enabled !== 1) {
      return res.status(400).json({
        error: `Cannot activate template: Trigger event '${template.trigger_event}' is currently disabled`
      });
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (activeVal === 1) {
        await tx.execute(
          `UPDATE workflow_templates
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE trigger_event = ? AND id != ? AND is_active = 1`,
          [template.trigger_event, id]
        );
      }

      await tx.execute(
        'UPDATE workflow_templates SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [activeVal, id]
      );
    });

    return res.json({ success: true, is_active: Boolean(activeVal) });
  } catch (error: any) {
    console.error('Error toggling template status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
