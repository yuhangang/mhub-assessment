import { Router, Request, Response } from 'express';
import db from '../db/connection';

const router = Router();

interface StepInput {
  sequence: number;
  assignee_user_id?: number | null;
  assignee_role?: string | null;
}

interface TemplateInput {
  name: string;
  description?: string;
  trigger_event: string;
  is_active?: number;
  steps: StepInput[];
}

/**
 * Validate steps: ordered, starting from 1, contiguous, and exactly one assignee field populated
 */
async function validateSteps(steps: StepInput[]): Promise<string | null> {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'Steps must be a non-empty array';
  }

  // Sort by sequence
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  
  if (sorted[0].sequence !== 1) {
    return 'Steps must start with sequence 1';
  }

  for (let i = 0; i < sorted.length; i++) {
    const step = sorted[i];
    if (step.sequence !== i + 1) {
      return `Invalid step sequence: expected ${i + 1}, got ${step.sequence}`;
    }

    const hasUser = step.assignee_user_id !== undefined && step.assignee_user_id !== null;
    const hasRole = step.assignee_role !== undefined && step.assignee_role !== null && step.assignee_role.toString().trim() !== '';

    if ((hasUser && hasRole) || (!hasUser && !hasRole)) {
      return `Step ${step.sequence} must specify exactly one of assignee_user_id or assignee_role`;
    }

    if (hasUser) {
      const userExists = await db.queryOne('SELECT id FROM agents WHERE id = ?', [step.assignee_user_id]);
      if (!userExists) {
        return `Step ${step.sequence} assignee_user_id (${step.assignee_user_id}) does not exist in agents`;
      }
    }

    if (hasRole) {
      const validRoles = ['sales_manager', 'finance_manager', 'sales_coordinator'];
      if (!validRoles.includes(step.assignee_role as string)) {
        return `Step ${step.sequence} assignee_role must be one of: ${validRoles.join(', ')}`;
      }
    }
  }

  return null;
}

/**
 * 1. POST /api/templates - Create a new template with steps
 */
router.post('/', async (req: Request, res: Response) => {
  const { name, description = '', trigger_event, is_active = 0, steps } = req.body as TemplateInput;

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

  // Verify that the trigger event exists and is enabled
  const event = await db.queryOne(
    'SELECT is_enabled FROM workflow_events WHERE name = ?',
    [trigger_event]
  ) as { is_enabled: number } | undefined;

  if (!event) {
    return res.status(400).json({ error: `Trigger event '${trigger_event}' is not registered` });
  }

  // Check if active template already exists for trigger event
  if (is_active === 1) {
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
      const templateResult = await tx.execute(
        'INSERT INTO workflow_templates (name, description, trigger_event, is_active) VALUES (?, ?, ?, ?)',
        [name, description, trigger_event, is_active]
      );

      const newId = templateResult.lastInsertRowid as number;

      for (const step of steps) {
        await tx.execute(
          'INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)',
          [
            newId,
            step.sequence,
            step.assignee_user_id !== undefined ? step.assignee_user_id : null,
            step.assignee_role !== undefined ? step.assignee_role : null
          ]
        );
      }

      return newId;
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
    'SELECT id, sequence, assignee_user_id, assignee_role, created_at FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC',
    [id]
  );

  return res.json({
    ...template,
    is_active: Boolean(template.is_active),
    steps
  });
});

/**
 * 3. PUT /api/templates/:id - Update template details and steps
 * Permitted only when no running (pending or in_progress) instances are bound to this template.
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

  // Verify that the trigger event exists
  const event = await db.queryOne(
    'SELECT is_enabled FROM workflow_events WHERE name = ?',
    [trigger_event]
  ) as { is_enabled: number } | undefined;

  if (!event) {
    return res.status(400).json({ error: `Trigger event '${trigger_event}' is not registered` });
  }

  // Fetch template
  const template = await db.queryOne('SELECT * FROM workflow_templates WHERE id = ?', [id]) as any;
  if (!template) {
    return res.status(404).json({ error: `Template with ID ${id} not found` });
  }

  // If the template is active, check if the event is enabled
  if (template.is_active === 1 && event.is_enabled !== 1) {
    return res.status(400).json({
      error: `Cannot update template: Trigger event '${trigger_event}' is currently disabled`
    });
  }

  // Check if there are any running/pending instances against this template
  const activeCountResult = await db.queryOne(`
    SELECT COUNT(*) as count 
    FROM workflow_instances 
    WHERE template_id = ? AND status IN ('pending', 'in_progress')
  `, [id]) as { count: number };

  if (activeCountResult.count > 0) {
    return res.status(400).json({
      error: 'Cannot update template: instances are currently running against it'
    });
  }

  try {
    await db.transaction(async (tx) => {
      // Update template details
      await tx.execute(`
        UPDATE workflow_templates 
        SET name = ?, description = ?, trigger_event = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [name, description, trigger_event, id]);

      // Remove existing steps
      await tx.execute('DELETE FROM workflow_template_steps WHERE template_id = ?', [id]);

      // Insert new steps
      for (const step of steps) {
        await tx.execute(
          'INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)',
          [
            id,
            step.sequence,
            step.assignee_user_id !== undefined ? step.assignee_user_id : null,
            step.assignee_role !== undefined ? step.assignee_role : null
          ]
        );
      }
    });

    return res.json({ success: true, message: 'Template updated successfully' });
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

  // Fetch template
  const template = await db.queryOne('SELECT * FROM workflow_templates WHERE id = ?', [id]) as any;
  if (!template) {
    return res.status(404).json({ error: `Template with ID ${id} not found` });
  }

  // If activating, check if another active template is already bound to this trigger event or if the trigger event is disabled
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

    const existing = await db.queryOne(
      'SELECT id FROM workflow_templates WHERE trigger_event = ? AND is_active = 1 AND id != ?',
      [template.trigger_event, id]
    ) as { id: number } | undefined;

    if (existing) {
      return res.status(400).json({
        error: `Another active template (ID ${existing.id}) is already bound to trigger event '${template.trigger_event}'`
      });
    }
  }

  try {
    await db.execute(
      'UPDATE workflow_templates SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [activeVal, id]
    );

    return res.json({ success: true, is_active: Boolean(activeVal) });
  } catch (error: any) {
    console.error('Error toggling template status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
