# 2026-07-03 Workflow Examples & Variety Design

Design specification for adding new workflow templates, events, automated validation rules, and completion callbacks to enrich the workflow engine demonstration and assessment variety.

---

## 1. Objectives & Success Criteria

1. **Rich Example Variety**: Seed three new workflows covering distinct trigger events, user roles, data entry fields, automated rules, and callbacks.
2. **Automated Price and Discount Policy Checks**: Enhance the automated steps runner to check for VIP discounts (percent limits) and unit price escalation limits.
3. **Database-backed Callbacks**: Implement end-to-end callbacks that modify the unit price or booking status upon successful workflow completion, demonstrating real side-effects of approvals.
4. **Backward Compatibility**: Ensure all existing tests and workflows continue to function normally.

---

## 2. Predefined Event & Template Seeds

We will modify `src/db/seed.ts` to add the following seeds:

### 2.1 VIP Discount Approval Workflow
* **Event**: `booking.vip_discount_requested` (Description: `'Triggered when a VIP buyer discount is requested'`)
* **Template**: `"VIP Discount Approval Workflow"` (Active: `1`)
* **Steps**:
  1. **Data Entry** (sales_coordinator): Input fields `discount_percent` (number) and `vip_card_id` (text).
  2. **Automated Check**: Rule `"discount_limit"`, max discount: `10` percent.
  3. **Approval** (finance_manager): Final financial review.
  4. **Approval** (sales_manager): Final business approval.

### 2.2 Unit Price Change Workflow
* **Event**: `unit.price_updated`
* **Template**: `"Unit Price Change Workflow"` (Active: `1`)
* **Steps**:
  1. **Data Entry** (sales_coordinator): Input fields `new_price_cents` (number) and `reason` (text).
  2. **Automated Check**: Rule `"price_increase_limit"`, max increase: `15%`.
  3. **Approval** (finance_manager): Review of pricing adjustment.

### 2.3 Booking Confirmation Workflow
* **Event**: `booking.confirmed`
* **Template**: `"Booking Confirmation Workflow"` (Active: `1`)
* **Steps**:
  1. **Data Entry** (sales_coordinator): Input fields `documents_signed` (text) and `deposit_received_cents` (number).
  2. **Approval** (finance_manager): Payment clearance review.

---

## 3. Automated Rule Verification (`src/services/workflow.ts`)

We will update `executeAutomatedSteps` to support multiple rule validations dynamically based on the step configuration:

1. **`discount_limit`**: Checks if the submitted `discount_percent` is $\le 10\%$.
2. **`price_increase_limit`**:
   - Fetches the unit's current `price_cents`.
   - Computes the increase ratio: `(new_price_cents - original_price_cents) / original_price_cents`.
   - Verifies if the increase ratio $\le 15\%$.

---

## 4. Completion Callbacks (`src/services/workflow.ts`)

1. **`booking:booking.vip_discount_requested`**: Logs the discount approval.
2. **`unit:unit.price_updated`**:
   - Finds the approved `new_price_cents` from the instance steps.
   - Updates the corresponding Unit record in the database.
3. **`booking:booking.confirmed`**:
   - Updates the Booking status to `'active'`.

---

## 5. Verification Plan

### Automated Verification
* Run tests `npm test` to make sure existing test cases continue to pass.
* Verify the seed command run successfully without sqlite/postgres constraints violations.

### Manual Walkthrough
1. Reset the database.
2. Go to the Configuration page and verify all 5 templates are listed with correct steps.
3. Trigger a `unit.price_updated` workflow for Unit A-102.
4. Input a new price that increases the cost by 10%. Approve the steps, and verify that the Unit's price is updated in the database when the workflow completes.
