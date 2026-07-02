import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { WorkflowEngine } from '../services/workflow';

const router = Router();

/**
 * 1. POST /api/instances - Trigger a new workflow instance
 * Request body: { event_name, entity_type, entity_id, initiated_by }
 */
router.post('/', async (req: Request, res: Response) => {
  const { event_name, entity_type, entity_id, initiated_by } = req.body;

  if (!event_name || !event_name.trim()) {
    return res.status(400).json({ error: 'event_name is required' });
  }
  if (!entity_type || !entity_type.trim()) {
    return res.status(400).json({ error: 'entity_type is required' });
  }
  if (entity_id === undefined || entity_id === null || entity_id.toString().trim() === '') {
    return res.status(400).json({ error: 'entity_id is required' });
  }
  if (!initiated_by || isNaN(parseInt(initiated_by))) {
    return res.status(400).json({ error: 'initiated_by (valid agent ID) is required' });
  }

  const initiatorId = parseInt(initiated_by);

  // Verify the entity actually exists
  if (entity_type === 'booking') {
    const booking = await db.queryOne('SELECT id FROM bookings WHERE id = ?', [entity_id]);
    if (!booking) {
      return res.status(404).json({ error: `Booking with ID ${entity_id} does not exist` });
    }
  } else if (entity_type === 'unit') {
    const unit = await db.queryOne('SELECT id FROM units WHERE id = ?', [entity_id]);
    if (!unit) {
      return res.status(404).json({ error: `Unit with ID ${entity_id} does not exist` });
    }
  }

  try {
    const instanceId = await WorkflowEngine.triggerInstance(event_name, entity_type, entity_id.toString(), initiatorId);
    return res.status(201).json({
      success: true,
      message: 'Workflow instance started successfully',
      instanceId
    });
  } catch (error: any) {
    console.error('Error triggering workflow instance:', error);
    return res.status(400).json({ error: error.message });
  }
});

async function fetchSourceEntity(entityType: string, entityId: string): Promise<any> {
  try {
    if (entityType === 'booking') {
      const booking = await db.queryOne(`
        SELECT b.*, u.unit_number, u.price_cents, p.name as project_name 
        FROM bookings b 
        JOIN units u ON b.unit_id = u.id 
        JOIN projects p ON u.project_id = p.id 
        WHERE b.id = ?
      `, [entityId]) as any;
      if (booking) {
        booking.price = booking.price_cents / 100;
      }
      return booking;
    } else if (entityType === 'unit') {
      const unit = await db.queryOne(`
        SELECT u.*, p.name as project_name 
        FROM units u 
        JOIN projects p ON u.project_id = p.id 
        WHERE u.id = ?
      `, [entityId]) as any;
      if (unit) {
        unit.price = unit.price_cents / 100;
      }
      return unit;
    }
  } catch (e) {
    console.error('Error fetching source entity:', e);
  }
  return null;
}

/**
 * 3. GET /api/inbox - Fetch all steps awaiting action for a user or role
 * Query parameters: user_id (optional), role (optional)
 */
export const getInbox = async (req: Request, res: Response) => {
  const { user_id, role } = req.query;

  if (!user_id && !role) {
    return res.status(400).json({ error: 'Either user_id or role query parameter is required' });
  }

  try {
    let steps: any[] = [];
    if (user_id && role) {
      steps = await db.query(`
        SELECT wis.*, wi.entity_type, wi.entity_id, wt.name as template_name, wt.trigger_event
        FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wis.instance_id = wi.id
        JOIN workflow_templates wt ON wi.template_id = wt.id
        WHERE wis.status = 'awaiting_action' AND wi.status = 'in_progress' AND (
          wis.assignee_user_id = ? OR wis.assignee_role = ?
        )
        ORDER BY wis.created_at DESC
      `, [user_id.toString(), role.toString()]);
    } else if (user_id) {
      steps = await db.query(`
        SELECT wis.*, wi.entity_type, wi.entity_id, wt.name as template_name, wt.trigger_event
        FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wis.instance_id = wi.id
        JOIN workflow_templates wt ON wi.template_id = wt.id
        WHERE wis.status = 'awaiting_action' AND wi.status = 'in_progress' AND
          wis.assignee_user_id = ?
        ORDER BY wis.created_at DESC
      `, [user_id.toString()]);
    } else if (role) {
      steps = await db.query(`
        SELECT wis.*, wi.entity_type, wi.entity_id, wt.name as template_name, wt.trigger_event
        FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wis.instance_id = wi.id
        JOIN workflow_templates wt ON wi.template_id = wt.id
        WHERE wis.status = 'awaiting_action' AND wi.status = 'in_progress' AND
          wis.assignee_role = ?
        ORDER BY wis.created_at DESC
      `, [role.toString()]);
    }

    // Enhance steps with source entity info
    const enhancedSteps = await Promise.all(
      steps.map(async (step) => {
        return {
          ...step,
          source_entity: await fetchSourceEntity(step.entity_type, step.entity_id)
        };
      })
    );

    return res.json(enhancedSteps);
  } catch (error: any) {
    console.error('Error fetching inbox:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

router.get('/inbox', getInbox);

/**
 * 2. GET /api/instances/:id - Retrieve the current state and audit trail history
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const instance = await db.queryOne(`
    SELECT wi.*, wt.name as template_name, wt.trigger_event, a.name as initiator_name, a.email as initiator_email
    FROM workflow_instances wi
    JOIN workflow_templates wt ON wi.template_id = wt.id
    JOIN agents a ON wi.initiated_by = a.id
    WHERE wi.id = ?
  `, [id]) as any;

  if (!instance) {
    return res.status(404).json({ error: `Workflow instance with ID ${id} not found` });
  }

  // Fetch current steps state
  const steps = await db.query(`
    SELECT wis.*
    FROM workflow_instance_steps wis
    WHERE wis.instance_id = ?
    ORDER BY wis.sequence ASC
  `, [id]);

  // Fetch step decision audit history
  const auditTrail = await db.query(`
    SELECT wsd.id, wsd.step_id, wsd.decision, wsd.comment, wsd.actioned_at, 
           a.id as agent_id, a.name as agent_name, a.email as agent_email
    FROM workflow_step_decisions wsd
    JOIN agents a ON wsd.actioned_by = a.id
    WHERE wsd.instance_id = ?
    ORDER BY wsd.actioned_at ASC
  `, [id]);

  const sourceEntity = await fetchSourceEntity(instance.entity_type, instance.entity_id);

  return res.json({
    id: instance.id,
    template_id: instance.template_id,
    template_name: instance.template_name,
    trigger_event: instance.trigger_event,
    status: instance.status,
    entity_type: instance.entity_type,
    entity_id: instance.entity_id,
    initiated_by: {
      id: instance.initiated_by,
      name: instance.initiator_name,
      email: instance.initiator_email
    },
    source_entity: sourceEntity,
    created_at: instance.created_at,
    updated_at: instance.updated_at,
    steps,
    audit_trail: auditTrail
  });
});

/**
 * 4. POST /api/instances/:id/steps/:stepId/approve - Approve a step
 */
router.post('/:id/steps/:stepId/approve', async (req: Request, res: Response) => {
  const instanceId = parseInt(req.params.id);
  const stepId = parseInt(req.params.stepId);
  const { user_id, comment } = req.body;

  if (isNaN(instanceId) || isNaN(stepId)) {
    return res.status(400).json({ error: 'Invalid instanceId or stepId parameter' });
  }
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required in request body' });
  }

  try {
    await WorkflowEngine.actionStep(instanceId, stepId, parseInt(user_id), 'approved', comment);
    return res.json({ success: true, message: 'Step approved successfully' });
  } catch (error: any) {
    console.error('Error approving step:', error);
    if (error.message.includes('Concurrency Conflict')) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message.includes('not authorized') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  }
});

/**
 * 5. POST /api/instances/:id/steps/:stepId/reject - Reject a step
 */
router.post('/:id/steps/:stepId/reject', async (req: Request, res: Response) => {
  const instanceId = parseInt(req.params.id);
  const stepId = parseInt(req.params.stepId);
  const { user_id, comment } = req.body;

  if (isNaN(instanceId) || isNaN(stepId)) {
    return res.status(400).json({ error: 'Invalid instanceId or stepId parameter' });
  }
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required in request body' });
  }
  if (!comment || comment.trim() === '') {
    return res.status(400).json({ error: 'Comment is mandatory for rejection' });
  }

  try {
    await WorkflowEngine.actionStep(instanceId, stepId, parseInt(user_id), 'rejected', comment);
    return res.json({ success: true, message: 'Step rejected successfully' });
  } catch (error: any) {
    console.error('Error rejecting step:', error);
    if (error.message.includes('Concurrency Conflict')) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message.includes('not authorized') || error.message.includes('not found')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  }
});

export default router;
