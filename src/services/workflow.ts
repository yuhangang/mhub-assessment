import db from '../db/connection';

type CallbackFn = (entityId: string) => void;

class WorkflowEngineService {
  private callbacks: Map<string, CallbackFn> = new Map();

  constructor() {
    // Register the default callback for booking cancellation
    this.registerCallback('booking', 'booking.cancellation_requested', (entityId) => {
      console.log(`[CALLBACK] Running booking cancellation handler for booking ID: ${entityId}`);
      
      const booking = db.prepare('SELECT unit_id FROM bookings WHERE id = ?').get(entityId) as { unit_id: number } | undefined;
      
      if (!booking) {
        throw new Error(`Booking with ID ${entityId} not found in callback`);
      }

      // Update booking status to cancelled
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(entityId);
      
      // Release unit back to available
      db.prepare("UPDATE units SET status = 'available' WHERE id = ?").run(booking.unit_id);
      
      console.log(`[CALLBACK] Successfully cancelled booking ${entityId} and released unit ${booking.unit_id}`);
    });
  }

  /**
   * Register a custom callback for when a workflow is fully approved
   */
  public registerCallback(entityType: string, triggerEvent: string, callback: CallbackFn) {
    const key = `${entityType}:${triggerEvent}`;
    this.callbacks.set(key, callback);
  }

  /**
   * Get a registered callback
   */
  public getCallback(entityType: string, triggerEvent: string): CallbackFn | undefined {
    const key = `${entityType}:${triggerEvent}`;
    return this.callbacks.get(key);
  }

  /**
   * Trigger a new workflow instance
   */
  public triggerInstance(triggerEvent: string, entityType: string, entityId: string, initiatedByUserId: number): number {
    // Validate trigger event status (enabled)
    const event = db.prepare(
      'SELECT is_enabled FROM workflow_events WHERE name = ?'
    ).get(triggerEvent) as { is_enabled: number } | undefined;

    if (!event) {
      throw new Error(`Workflow event '${triggerEvent}' is not registered`);
    }
    if (event.is_enabled !== 1) {
      throw new Error(`Workflow event '${triggerEvent}' is currently disabled`);
    }

    // Fetch active template
    const template = db.prepare(
      'SELECT id, name FROM workflow_templates WHERE trigger_event = ? AND is_active = 1'
    ).get(triggerEvent) as { id: number; name: string } | undefined;

    if (!template) {
      throw new Error(`No active workflow template found for event: ${triggerEvent}`);
    }

    // Check if an in-progress or pending instance already exists for this entity
    const existing = db.prepare(
      "SELECT id FROM workflow_instances WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'in_progress')"
    ).get(entityType, entityId);

    if (existing) {
      throw new Error(`An active workflow instance already exists for entity ${entityType} ID ${entityId}`);
    }

    // Validate initiator
    const initiator = db.prepare('SELECT id FROM agents WHERE id = ?').get(initiatedByUserId);
    if (!initiator) {
      throw new Error(`Initiator agent with ID ${initiatedByUserId} not found`);
    }

    // Retrieve template steps
    const steps = db.prepare(
      'SELECT id, sequence, assignee_user_id, assignee_role FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC'
    ).all(template.id) as { id: number; sequence: number; assignee_user_id: number | null; assignee_role: string | null }[];

    if (steps.length === 0) {
      throw new Error(`Template ${template.name} (ID: ${template.id}) has no steps configured`);
    }

    // Run creation in a database transaction
    const executeTx = db.transaction(() => {
      // 1. Insert Workflow Instance with status 'in_progress' and initiated_by
      const result = db.prepare(
        "INSERT INTO workflow_instances (template_id, status, entity_type, entity_id, initiated_by) VALUES (?, 'in_progress', ?, ?, ?)"
      ).run(template.id, entityType, entityId, initiatedByUserId);

      const instanceId = result.lastInsertRowid as number;

      // 2. Insert Workflow Instance Steps
      const insertStepStmt = db.prepare(`
        INSERT INTO workflow_instance_steps 
        (instance_id, template_step_id, sequence, assignee_user_id, assignee_role, status, version) 
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `);

      for (const step of steps) {
        const stepStatus = step.sequence === 1 ? 'awaiting_action' : 'pending';
        insertStepStmt.run(instanceId, step.id, step.sequence, step.assignee_user_id, step.assignee_role, stepStatus);
      }

      return instanceId;
    });

    return executeTx();
  }

  /**
   * Action a step (approve/reject) with optimistic locking
   */
  public actionStep(
    instanceId: number,
    stepId: number,
    userId: number,
    action: 'approved' | 'rejected',
    comment?: string
  ): void {
    const executeTx = db.transaction(() => {
      let pendingCallback: (() => void) | null = null;

      // Fetch step
      const step = db.prepare(
        'SELECT * FROM workflow_instance_steps WHERE id = ? AND instance_id = ?'
      ).get(stepId, instanceId) as any;

      if (!step) {
        throw new Error(`Step ${stepId} not found in workflow instance ${instanceId}`);
      }

      // Check current step status
      if (step.status !== 'awaiting_action') {
        if (step.status === 'approved' || step.status === 'rejected') {
          throw new Error(`Concurrency Conflict: Step has already been actioned (current status: ${step.status})`);
        }
        throw new Error(`Step is not in awaiting_action status (current: ${step.status})`);
      }

      // Fetch user details for authorization
      const user = db.prepare('SELECT id, role FROM agents WHERE id = ?').get(userId) as { id: number; role: string } | undefined;
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Authorization Check: Does the user match the step assignment?
      if (step.assignee_user_id !== null) {
        if (step.assignee_user_id !== userId) {
          throw new Error(`User is not authorized to act on this step (assigned to user ID: ${step.assignee_user_id})`);
        }
      } else if (step.assignee_role !== null) {
        if (step.assignee_role !== user.role) {
          throw new Error(`User role '${user.role}' is not authorized to act on this step (assigned to role: ${step.assignee_role})`);
        }
      }

      const decisionStatus = action === 'approved' ? 'approved' : 'rejected';

      // 1. Optimistic Locking Status Update
      const updateStep = db.prepare(`
        UPDATE workflow_instance_steps 
        SET status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'awaiting_action' AND version = ?
      `).run(decisionStatus, stepId, step.version);

      if (updateStep.changes === 0) {
        throw new Error('Concurrency Conflict: This step has already been actioned by another user');
      }

      // 2. Add Entry to Decision Audit Trail
      db.prepare(`
        INSERT INTO workflow_step_decisions (step_id, instance_id, decision, actioned_by, comment)
        VALUES (?, ?, ?, ?, ?)
      `).run(stepId, instanceId, decisionStatus, userId, comment || null);

      if (action === 'rejected') {
        if (!comment || comment.trim() === '') {
          throw new Error('Comment is mandatory for rejection');
        }

        // Update workflow instance status to 'rejected'
        db.prepare(`
          UPDATE workflow_instances 
          SET status = 'rejected', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(instanceId);

        console.log(`[ENGINE] Instance ${instanceId} rejected at step ${stepId} by user ${userId}`);

      } else {
        // Approval: Look for next step in sequence
        const nextStep = db.prepare(`
          SELECT * FROM workflow_instance_steps 
          WHERE instance_id = ? AND sequence > ? 
          ORDER BY sequence ASC LIMIT 1
        `).get(instanceId, step.sequence) as any;

        if (nextStep) {
          // Advance to the next step
          db.prepare(`
            UPDATE workflow_instance_steps 
            SET status = 'awaiting_action', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(nextStep.id);
          console.log(`[ENGINE] Step approved. Advanced instance ${instanceId} to step ${nextStep.id} (sequence ${nextStep.sequence})`);
        } else {
          // No more steps. Instance is fully approved
          db.prepare(`
            UPDATE workflow_instances 
            SET status = 'approved', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(instanceId);
          console.log(`[ENGINE] Instance ${instanceId} fully approved! Running callback...`);

          // Fetch instance info to run the correct callback
          const instance = db.prepare(
            'SELECT template_id, entity_type, entity_id FROM workflow_instances WHERE id = ?'
          ).get(instanceId) as { template_id: number; entity_type: string; entity_id: string };

          const template = db.prepare(
            'SELECT trigger_event FROM workflow_templates WHERE id = ?'
          ).get(instance.template_id) as { trigger_event: string };

          // Run post-approval callback
          const key = `${instance.entity_type}:${template.trigger_event}`;
          const callback = this.callbacks.get(key);
          if (callback) {
            pendingCallback = () => callback(instance.entity_id);
          } else {
            console.warn(`No callback registered for event callback type: ${key}`);
          }
        }
      }

      return pendingCallback;
    });

    const callbackToRun = executeTx();

    if (callbackToRun) {
      callbackToRun();
    }
  }
}

export const WorkflowEngine = new WorkflowEngineService();
export { CallbackFn };
