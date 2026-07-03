import db from '../db/connection';

type CallbackFn = (entityId: string) => void | Promise<void>;

class WorkflowEngineService {
  private callbacks: Map<string, CallbackFn> = new Map();

  constructor() {
    // Register the default callback for booking cancellation
    this.registerCallback('booking', 'booking.cancellation_requested', async (entityId) => {
      console.log(`[CALLBACK] Running booking cancellation handler for booking ID: ${entityId}`);
      
      const booking = await db.queryOne('SELECT unit_id FROM bookings WHERE id = ?', [entityId]) as { unit_id: number } | undefined;
      
      if (!booking) {
        throw new Error(`Booking with ID ${entityId} not found in callback`);
      }

      // Update booking status to cancelled
      await db.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [entityId]);
      
      // Release unit back to available
      await db.execute("UPDATE units SET status = 'available' WHERE id = ?", [booking.unit_id]);
      
      console.log(`[CALLBACK] Successfully cancelled booking ${entityId} and released unit ${booking.unit_id}`);
    });

    // Register callback for booking cancellation with refund
    this.registerCallback('booking', 'booking.cancellation_with_refund', async (entityId) => {
      console.log(`[CALLBACK] Running booking cancellation (with refund) handler for booking ID: ${entityId}`);
      
      const booking = await db.queryOne('SELECT unit_id FROM bookings WHERE id = ?', [entityId]) as { unit_id: number } | undefined;
      
      if (!booking) {
        throw new Error(`Booking with ID ${entityId} not found in callback`);
      }

      // Update booking status to cancelled
      await db.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [entityId]);
      
      // Release unit back to available
      await db.execute("UPDATE units SET status = 'available' WHERE id = ?", [booking.unit_id]);
      
      console.log(`[CALLBACK] Successfully cancelled booking ${entityId} and released unit ${booking.unit_id} (refund processed)`);
    });

    // Register callback for vip discount approval
    this.registerCallback('booking', 'booking.vip_discount_requested', async (entityId) => {
      console.log(`[CALLBACK] Running VIP discount approval handler for booking ID: ${entityId}`);
      await db.execute("UPDATE bookings SET comment = 'VIP Discount Approved' WHERE id = ?", [entityId]).catch(() => {});
    });

    // Register callback for unit price update
    this.registerCallback('unit', 'unit.price_updated', async (entityId) => {
      console.log(`[CALLBACK] Running Unit price update handler for Unit ID: ${entityId}`);
      
      const latestApprovedPrice = await db.queryOne(`
        SELECT wsd.submitted_data
        FROM workflow_instances wi
        JOIN workflow_instance_steps wsd ON wi.id = wsd.instance_id
        WHERE wi.entity_type = 'unit' AND wi.entity_id = ? AND wi.status = 'approved' AND wsd.step_type = 'data_entry'
        ORDER BY wi.created_at DESC LIMIT 1
      `, [entityId]) as { submitted_data: string } | undefined;

      if (latestApprovedPrice && latestApprovedPrice.submitted_data) {
        try {
          const data = JSON.parse(latestApprovedPrice.submitted_data);
          const newPrice = parseInt(data.new_price_cents);
          if (newPrice > 0) {
            await db.execute("UPDATE units SET price_cents = ? WHERE id = ?", [newPrice, entityId]);
            console.log(`[CALLBACK] Successfully updated Unit ${entityId} price to ${newPrice} cents`);
          }
        } catch (e) {
          console.error('[CALLBACK] Error parsing approved unit price:', e);
        }
      }
    });

    // Register callback for booking confirmation
    this.registerCallback('booking', 'booking.confirmed', async (entityId) => {
      console.log(`[CALLBACK] Running Booking Confirmation handler for Booking ID: ${entityId}`);
      await db.execute("UPDATE bookings SET status = 'active' WHERE id = ?", [entityId]);
      console.log(`[CALLBACK] Successfully confirmed booking ${entityId} as active`);
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
  public async triggerInstance(triggerEvent: string, entityType: string, entityId: string, initiatedByUserId: number): Promise<number> {
    // Validate trigger event status (enabled)
    const event = await db.queryOne(
      'SELECT is_enabled FROM workflow_events WHERE name = ?',
      [triggerEvent]
    ) as { is_enabled: number } | undefined;

    if (!event) {
      throw new Error(`Workflow event '${triggerEvent}' is not registered`);
    }
    if (event.is_enabled !== 1) {
      throw new Error(`Workflow event '${triggerEvent}' is currently disabled`);
    }

    // Fetch active template
    const template = await db.queryOne(
      'SELECT id, name FROM workflow_templates WHERE trigger_event = ? AND is_active = 1',
      [triggerEvent]
    ) as { id: number; name: string } | undefined;

    if (!template) {
      throw new Error(`No active workflow template found for event: ${triggerEvent}`);
    }

    // Check if an in-progress or pending instance already exists for this entity
    const existing = await db.queryOne(
      "SELECT id FROM workflow_instances WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'in_progress')",
      [entityType, entityId]
    );

    if (existing) {
      throw new Error(`An active workflow instance already exists for entity ${entityType} ID ${entityId}`);
    }

    // Validate initiator
    const initiator = await db.queryOne('SELECT id FROM agents WHERE id = ?', [initiatedByUserId]);
    if (!initiator) {
      throw new Error(`Initiator agent with ID ${initiatedByUserId} not found`);
    }

    // Retrieve template steps (including step_type and config)
    const steps = await db.query(
      'SELECT id, sequence, assignee_user_id, assignee_role, step_type, config FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC',
      [template.id]
    ) as { id: number; sequence: number; assignee_user_id: number | null; assignee_role: string | null; step_type: string; config: string | null }[];

    if (steps.length === 0) {
      throw new Error(`Template ${template.name} (ID: ${template.id}) has no steps configured`);
    }

    let callbackToRun: (() => Promise<void> | void) | null = null;

    // Run creation in a database transaction
    const instanceId = await db.transaction(async (tx) => {
      // 1. Insert Workflow Instance with status 'in_progress' and initiated_by
      const result = await tx.execute(
        "INSERT INTO workflow_instances (template_id, status, entity_type, entity_id, initiated_by) VALUES (?, 'in_progress', ?, ?, ?)",
        [template.id, entityType, entityId, initiatedByUserId]
      );

      const newId = result.lastInsertRowid as number;

      // 2. Insert Workflow Instance Steps
      for (const step of steps) {
        const stepStatus = step.sequence === 1 ? 'awaiting_action' : 'pending';
        await tx.execute(`
          INSERT INTO workflow_instance_steps 
          (instance_id, template_step_id, sequence, assignee_user_id, assignee_role, status, step_type, config, version) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `, [newId, step.id, step.sequence, step.assignee_user_id, step.assignee_role, stepStatus, step.step_type, step.config]);
      }

      // 3. Immediately run starting automated steps if any
      callbackToRun = await this.executeAutomatedSteps(tx, newId);

      return newId;
    });

    if (callbackToRun) {
      await (callbackToRun as any)();
    }

    return instanceId;
  }

  /**
   * Action a step (approve/reject) with optimistic locking
   */
  public async actionStep(
    instanceId: number,
    stepId: number,
    userId: number,
    action: 'approved' | 'rejected',
    comment?: string,
    submittedData?: any
  ): Promise<void> {
    const callbackToRun = await db.transaction(async (tx) => {
      let pendingCallback: (() => Promise<void> | void) | null = null;

      // Fetch step
      const step = await tx.queryOne(
        'SELECT * FROM workflow_instance_steps WHERE id = ? AND instance_id = ?',
        [stepId, instanceId]
      ) as any;

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
      const user = await tx.queryOne('SELECT id, role FROM agents WHERE id = ?', [userId]) as { id: number; role: string } | undefined;
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
      let updateStep;
      if (submittedData) {
        const submittedDataStr = typeof submittedData === 'string' ? submittedData : JSON.stringify(submittedData);
        updateStep = await tx.execute(`
          UPDATE workflow_instance_steps 
          SET status = ?, submitted_data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'awaiting_action' AND version = ?
        `, [decisionStatus, submittedDataStr, stepId, step.version]);
      } else {
        updateStep = await tx.execute(`
          UPDATE workflow_instance_steps 
          SET status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'awaiting_action' AND version = ?
        `, [decisionStatus, stepId, step.version]);
      }

      if (updateStep.changes === 0) {
        throw new Error('Concurrency Conflict: This step has already been actioned by another user');
      }

      // 2. Add Entry to Decision Audit Trail
      await tx.execute(`
        INSERT INTO workflow_step_decisions (step_id, instance_id, decision, actioned_by, comment)
        VALUES (?, ?, ?, ?, ?)
      `, [stepId, instanceId, decisionStatus, userId, comment || null]);

      if (action === 'rejected') {
        if (!comment || comment.trim() === '') {
          throw new Error('Comment is mandatory for rejection');
        }

        // Update workflow instance status to 'rejected'
        await tx.execute(`
          UPDATE workflow_instances 
          SET status = 'rejected', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [instanceId]);

        console.log(`[ENGINE] Instance ${instanceId} rejected at step ${stepId} by user ${userId}`);

      } else {
        // Approval: Look for next step in sequence
        const nextStep = await tx.queryOne(`
          SELECT * FROM workflow_instance_steps 
          WHERE instance_id = ? AND sequence > ? 
          ORDER BY sequence ASC LIMIT 1
        `, [instanceId, step.sequence]) as any;

        if (nextStep) {
          // Advance to the next step
          await tx.execute(`
            UPDATE workflow_instance_steps 
            SET status = 'awaiting_action', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [nextStep.id]);
          console.log(`[ENGINE] Step approved. Advanced instance ${instanceId} to step ${nextStep.id} (sequence ${nextStep.sequence})`);

          // Execute any automated steps starting from this new step
          const autoCallback = await this.executeAutomatedSteps(tx, instanceId);
          if (autoCallback) {
            pendingCallback = autoCallback;
          }
        } else {
          // No more steps. Instance is fully approved
          await tx.execute(`
            UPDATE workflow_instances 
            SET status = 'approved', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [instanceId]);
          console.log(`[ENGINE] Instance ${instanceId} fully approved! Running callback...`);

          // Fetch instance info to run the correct callback
          const instance = await tx.queryOne(
            'SELECT template_id, entity_type, entity_id FROM workflow_instances WHERE id = ?',
            [instanceId]
          ) as { template_id: number; entity_type: string; entity_id: string };

          const template = await tx.queryOne(
            'SELECT trigger_event FROM workflow_templates WHERE id = ?',
            [instance.template_id]
          ) as { trigger_event: string };

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

    if (callbackToRun) {
      await callbackToRun();
    }
  }

  /**
   * Process and execute any pending automated workflow steps recursively
   */
  private async executeAutomatedSteps(tx: any, instanceId: number): Promise<(() => Promise<void> | void) | null> {
    let pendingCallback: (() => Promise<void> | void) | null = null;
    let running = true;

    while (running) {
      // Find the step currently awaiting action
      const activeStep = await tx.queryOne(
        "SELECT * FROM workflow_instance_steps WHERE instance_id = ? AND status = 'awaiting_action'",
        [instanceId]
      ) as any;

      if (!activeStep || activeStep.step_type !== 'automated') {
        running = false;
        break;
      }

      console.log(`[ENGINE] Executing automated step sequence ${activeStep.sequence} (ID: ${activeStep.id})`);

      // 1. Fetch the data submitted in the previous step(s)
      const dataEntryStep = await tx.queryOne(
        "SELECT submitted_data FROM workflow_instance_steps WHERE instance_id = ? AND step_type = 'data_entry' AND status = 'approved' ORDER BY sequence DESC LIMIT 1",
        [instanceId]
      ) as any;

      let submittedFields: any = {};
      if (dataEntryStep && dataEntryStep.submitted_data) {
        try {
          submittedFields = JSON.parse(dataEntryStep.submitted_data);
        } catch (e) {
          console.error('[ENGINE] Error parsing submitted data:', e);
        }
      }

      // Parse step configuration
      let stepConfig: any = {};
      if (activeStep.config) {
        try {
          stepConfig = JSON.parse(activeStep.config);
        } catch (e) {}
      }

      // 2. Fetch the entity details (booking and unit price)
      const instance = await tx.queryOne(
        "SELECT entity_type, entity_id FROM workflow_instances WHERE id = ?",
        [instanceId]
      ) as { entity_type: string; entity_id: string };

      let passed = true;
      let comment = `Automated Check Passed.`;

      if (stepConfig.rule === 'discount_limit') {
        const discountPercent = parseFloat(submittedFields.discount_percent || '0');
        const maxPercent = stepConfig.max_discount_percent || 10;
        passed = discountPercent <= maxPercent;
        comment = passed
          ? `Automated Check Passed: Discount percentage of ${discountPercent}% is within the limit of ${maxPercent}%`
          : `Automated Check Failed: Discount percentage of ${discountPercent}% exceeds the limit of ${maxPercent}%`;

      } else if (stepConfig.rule === 'price_increase_limit') {
        const newPriceCents = parseInt(submittedFields.new_price_cents || '0');
        let maxLimit = 0;
        let originalPrice = 0;
        
        if (instance && instance.entity_type === 'unit') {
          const unit = await tx.queryOne(
            "SELECT price_cents FROM units WHERE id = ?",
            [instance.entity_id]
          ) as { price_cents: number } | undefined;

          if (unit) {
            originalPrice = unit.price_cents;
            // Max increase limit
            maxLimit = originalPrice * (1 + (stepConfig.max_increase_ratio || 0.15));
          }
        }
        passed = newPriceCents <= maxLimit;
        comment = passed
          ? `Automated Check Passed: New price of $${(newPriceCents / 100).toLocaleString()} is within the 15% increase limit ($${(maxLimit / 100).toLocaleString()})`
          : `Automated Check Failed: New price of $${(newPriceCents / 100).toLocaleString()} exceeds the 15% increase limit ($${(maxLimit / 100).toLocaleString()})`;

      } else {
        // Default rule: refund_limit
        const refundAmount = parseFloat(submittedFields.refund_amount || '0');
        let maxLimit = 0;
        let unitPrice = 0;
        if (instance && instance.entity_type === 'booking') {
          const booking = await tx.queryOne(
            "SELECT b.unit_id, u.price_cents FROM bookings b JOIN units u ON b.unit_id = u.id WHERE b.id = ?",
            [instance.entity_id]
          ) as { unit_id: number; price_cents: number } | undefined;

          if (booking) {
            unitPrice = booking.price_cents / 100;
            maxLimit = unitPrice * (stepConfig.max_ratio || 0.05);
          }
        }
        passed = refundAmount <= maxLimit;
        comment = passed
          ? `Automated Check Passed: Refund amount of $${refundAmount.toLocaleString()} is within the 5% deposit limit ($${maxLimit.toLocaleString()})`
          : `Automated Check Failed: Refund amount of $${refundAmount.toLocaleString()} exceeds the 5% deposit limit ($${maxLimit.toLocaleString()})`;
      }

      const decisionStatus = passed ? 'approved' : 'rejected';

      // Update the automated step status
      await tx.execute(
        "UPDATE workflow_instance_steps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [decisionStatus, activeStep.id]
      );

      // Log decision (System User ID is -1)
      await tx.execute(
        "INSERT INTO workflow_step_decisions (step_id, instance_id, decision, actioned_by, comment) VALUES (?, ?, ?, ?, ?)",
        [activeStep.id, instanceId, decisionStatus, -1, comment]
      );

      if (!passed) {
        // Reject instance
        await tx.execute(
          "UPDATE workflow_instances SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [instanceId]
        );
        console.log(`[ENGINE] Instance ${instanceId} automatically rejected at step ${activeStep.id} by system check.`);
        running = false;
      } else {
        // Check next step
        const nextStep = await tx.queryOne(
          "SELECT * FROM workflow_instance_steps WHERE instance_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT 1",
          [instanceId, activeStep.sequence]
        ) as any;

        if (nextStep) {
          await tx.execute(
            "UPDATE workflow_instance_steps SET status = 'awaiting_action', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [nextStep.id]
          );
          // Loop continues to check if the next step is also automated
        } else {
          // Complete/approve instance
          await tx.execute(
            "UPDATE workflow_instances SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [instanceId]
          );
          
          const templateInfo = await tx.queryOne(
            "SELECT template_id FROM workflow_instances WHERE id = ?",
            [instanceId]
          ) as { template_id: number };

          const template = await tx.queryOne(
            "SELECT trigger_event FROM workflow_templates WHERE id = ?",
            [templateInfo.template_id]
          ) as { trigger_event: string };

          const key = `${instance.entity_type}:${template.trigger_event}`;
          const callback = this.callbacks.get(key);
          if (callback) {
            pendingCallback = () => callback(instance.entity_id);
          }
          running = false;
        }
      }
    }

    return pendingCallback;
  }
}

export const WorkflowEngine = new WorkflowEngineService();
export { CallbackFn };
