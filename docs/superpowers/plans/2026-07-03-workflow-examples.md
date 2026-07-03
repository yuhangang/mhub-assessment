# Workflow Examples & Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** enrich the workflow dashboard by seeding three new workflows with customized manual inputs, automated policy checks, and database-altering completion callbacks.

**Architecture:** 
- Add event and template configurations in the seed script (`src/db/seed.ts`).
- Expand automated step processing in `WorkflowEngineService.executeAutomatedSteps` (`src/services/workflow.ts`) to validate discount and price change limits.
- Register completion callbacks in `src/services/workflow.ts` to perform database modifications (e.g. updating booking status and unit prices).

**Tech Stack:** Node.js, Express, SQLite / PostgreSQL.

## Global Constraints

- Full backwards compatibility with existing test suites.
- Strict validation checks on steps sequence, types, and assignee definitions.

---

### Task 1: Update Database Seed Data

**Files:**
- Modify: `src/db/seed.ts:50-55`, `src/db/seed.ts:167-168`

**Interfaces:**
- Consumes: None
- Produces: New seeded tables for events, templates, and template steps.

- [ ] **Step 1: Modify seed.ts to insert new events and template steps**

Modify `src/db/seed.ts` to:
1. Register `booking.vip_discount_requested` event.
2. Seed the VIP Discount Approval Workflow template and its steps.
3. Seed the Unit Price Change Workflow template and its steps.
4. Seed the Booking Confirmation Workflow template and its steps.

Here is the code to insert at the end of the `runSeed` function:

```typescript
  // 1. Seed VIP Discount event
  await db.execute('INSERT INTO workflow_events (name, description, is_enabled) VALUES (?, ?, ?)', [
    'booking.vip_discount_requested',
    'Triggered when a VIP buyer discount is requested',
    1
  ]);

  // 2. Seed VIP Discount Approval Workflow Template
  const vipTemplate = await db.execute('INSERT INTO workflow_templates (name, description, trigger_event, is_active) VALUES (?, ?, ?, ?)', [
    'VIP Discount Approval Workflow',
    'Workflow for approving special VIP discount rates on property bookings',
    'booking.vip_discount_requested',
    1
  ]);
  const vipTemplateId = vipTemplate.lastInsertRowid;

  // Step 1: Data entry of VIP details
  const vipStep1Config = JSON.stringify({
    fields: [
      { name: 'discount_percent', type: 'number', label: 'Discount Percentage (%)', required: true },
      { name: 'vip_card_id', type: 'text', label: 'VIP Card ID Number', required: true }
    ]
  });
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    vipTemplateId, 1, null, 'sales_coordinator', 'data_entry', vipStep1Config
  ]);

  // Step 2: Automated discount limit check
  const vipStep2Config = JSON.stringify({
    rule: 'discount_limit',
    max_discount_percent: 10
  });
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    vipTemplateId, 2, null, null, 'automated', vipStep2Config
  ]);

  // Step 3: Finance Manager approval
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    vipTemplateId, 3, null, 'finance_manager', 'approval', null
  ]);

  // Step 4: Sales Manager approval
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    vipTemplateId, 4, null, 'sales_manager', 'approval', null
  ]);


  // 3. Seed Unit Price Change Workflow Template
  const priceTemplate = await db.execute('INSERT INTO workflow_templates (name, description, trigger_event, is_active) VALUES (?, ?, ?, ?)', [
    'Unit Price Change Workflow',
    'Workflow to approve modifications/updates to unit sale pricing',
    'unit.price_updated',
    1
  ]);
  const priceTemplateId = priceTemplate.lastInsertRowid;

  // Step 1: Data entry of pricing details
  const priceStep1Config = JSON.stringify({
    fields: [
      { name: 'new_price_cents', type: 'number', label: 'New Price (in Cents)', required: true },
      { name: 'reason', type: 'text', label: 'Reason for Pricing Modification', required: true }
    ]
  });
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    priceTemplateId, 1, null, 'sales_coordinator', 'data_entry', priceStep1Config
  ]);

  // Step 2: Automated price change limit check (max 15% increase)
  const priceStep2Config = JSON.stringify({
    rule: 'price_increase_limit',
    max_increase_ratio: 0.15
  });
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    priceTemplateId, 2, null, null, 'automated', priceStep2Config
  ]);

  // Step 3: Finance Manager approval
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    priceTemplateId, 3, null, 'finance_manager', 'approval', null
  ]);


  // 4. Seed Booking Confirmation Workflow Template
  const confirmTemplate = await db.execute('INSERT INTO workflow_templates (name, description, trigger_event, is_active) VALUES (?, ?, ?, ?)', [
    'Booking Confirmation Workflow',
    'Workflow for verifying buyer documents and clearing payments to confirm booking',
    'booking.confirmed',
    1
  ]);
  const confirmTemplateId = confirmTemplate.lastInsertRowid;

  // Step 1: Data entry of checklist
  const confirmStep1Config = JSON.stringify({
    fields: [
      { name: 'documents_signed', type: 'text', label: 'Documents Signed & Verified Status (Yes/No)', required: true },
      { name: 'deposit_received_cents', type: 'number', label: 'Deposit Amount Received (Cents)', required: true }
    ]
  });
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    confirmTemplateId, 1, null, 'sales_coordinator', 'data_entry', confirmStep1Config
  ]);

  // Step 2: Finance Manager approval
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role, step_type, config) VALUES (?, ?, ?, ?, ?, ?)', [
    confirmTemplateId, 2, null, 'finance_manager', 'approval', null
  ]);
```

- [ ] **Step 2: Run setup command to verify seeds are applied cleanly**

Run: `npm run db:setup`
Expected: Resetting and seeding database... Seeding completed successfully.

- [ ] **Step 3: Commit Task 1 changes**

```bash
git add src/db/seed.ts
git commit -m "feat(seed): seed vip, price update, and booking confirmation workflow templates"
```

---

### Task 2: Implement Automated Policy Rules & Completion Callbacks

**Files:**
- Modify: `src/services/workflow.ts:28-47`, `src/services/workflow.ts:326-389`

**Interfaces:**
- Consumes: Submitted data from prior data entry steps.
- Produces: Dynamic rule execution status and database mutations (e.g. updating unit price or booking status).

- [ ] **Step 1: Implement discount and price rules in executeAutomatedSteps**

Modify the automated steps runner in `src/services/workflow.ts` to inspect the rule type and execute correctly:

```typescript
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

      let passed = true;
      let comment = `Automated Check Passed.`;

      // 2. Fetch the entity details (booking and unit price)
      const instance = await tx.queryOne(
        "SELECT entity_type, entity_id FROM workflow_instances WHERE id = ?",
        [instanceId]
      ) as { entity_type: string; entity_id: string };

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
            // 15% increase limit
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
```

- [ ] **Step 2: Implement Completion Callbacks in Constructor**

Register callbacks in the `constructor` of `WorkflowEngineService`:

```typescript
    // Register callback for vip discount approval
    this.registerCallback('booking', 'booking.vip_discount_requested', async (entityId) => {
      console.log(`[CALLBACK] Running VIP discount approval handler for booking ID: ${entityId}`);
      // VIP approval callback: updates simulated VIP status or logs successfully
      await db.execute("UPDATE bookings SET comment = 'VIP Discount Approved' WHERE id = ?", [entityId]).catch(() => {});
    });

    // Register callback for unit price update
    this.registerCallback('unit', 'unit.price_updated', async (entityId) => {
      console.log(`[CALLBACK] Running Unit price update handler for Unit ID: ${entityId}`);
      
      // Fetch latest approved price cents from data entry step
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
      
      // Set booking status to active
      await db.execute("UPDATE bookings SET status = 'active' WHERE id = ?", [entityId]);
      console.log(`[CALLBACK] Successfully confirmed booking ${entityId} as active`);
    });
```

- [ ] **Step 3: Run the test suite to verify no regressions exist**

Run: `npm test`
Expected: 16/16 tests passing.

- [ ] **Step 4: Commit Task 2 changes**

```bash
git add src/services/workflow.ts
git commit -m "feat(workflow): implement vip, price update, and confirmation automated rules and callbacks"
```

---

### Task 3: Test New Workflows E2E

**Files:**
- Modify: `tests/workflow.test.ts` (add test cases for the new workflows)

- [ ] **Step 1: Add automated tests in tests/workflow.test.ts**

Let's verify that the new automated checks and callbacks are 100% correct by writing unit tests for them:

```typescript
    describe('Part 5 — VIP & Unit Price Workflow Extensions', () => {
      beforeEach(async () => {
        await runSeed();
      });

      it('VIP discount approval - automatically rejects if discount exceeds 10%', async () => {
        const instanceId = await WorkflowEngine.triggerInstance(
          'booking.vip_discount_requested',
          'booking',
          '1',
          1
        );

        const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
        
        // Approve data entry with 12% discount
        await WorkflowEngine.actionStep(
          instanceId,
          steps[0].id,
          1,
          'approved',
          'Entering discount details',
          { discount_percent: '12', vip_card_id: 'VIP999' }
        );

        // Verify that it automatically fails and terminates the instance
        const updatedInstance = await db.queryOne('SELECT * FROM workflow_instances WHERE id = ?', [instanceId]) as any;
        expect(updatedInstance.status).toBe('rejected');
      });

      it('Unit price update - updates the unit price upon full approval if within limit', async () => {
        const instanceId = await WorkflowEngine.triggerInstance(
          'unit.price_updated',
          'unit',
          '2',
          1
        );

        const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
        
        // Original price of unit 2 is 520,000 cents. 10% increase is 572,000 cents (572000 cents)
        await WorkflowEngine.actionStep(
          instanceId,
          steps[0].id,
          1,
          'approved',
          'Entering price details',
          { new_price_cents: '57200000', reason: 'Market adjustments' }
        );

        // Approve automated step (which passes) & Finance manager approval
        const nextSteps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [instanceId]) as any[];
        
        // Finance manager is charlie (User ID 3)
        await WorkflowEngine.actionStep(
          instanceId,
          nextSteps[2].id,
          3,
          'approved',
          'Finance clearance'
        );

        // Verify that the workflow completed successfully and unit price is updated
        const updatedUnit = await db.queryOne('SELECT price_cents FROM units WHERE id = 2') as any;
        expect(updatedUnit.price_cents).toBe(57200000);
      });
    });
```

Let's read `tests/workflow.test.ts` to see where we can append the test code.
