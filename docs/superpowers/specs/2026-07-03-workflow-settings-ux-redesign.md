# 2026-07-03 Workflow Settings UX Redesign Spec

Design specification for improving the usability and robustness of the workflow template creation and editing screens in the Next.js admin dashboard.

---

## 1. Objectives & Requirements

1. **Step Type Configuration**: Enable selecting the `step_type` ('approval', 'data_entry', 'automated') for each step.
2. **Assignee Guardrails**: 
   - Dynamically toggle assignee inputs. Assignees are required for `approval` and `data_entry`, but must be disabled/hidden and set to `null` for `automated` steps.
3. **Visual Reordering**: Add `Move Up` and `Move Down` buttons on each step card to dynamically adjust their sequence order.
4. **Configuration Helpers**:
   - **Automated**: Simple rule selector dropdown (Discount Limit, Price Increase Limit, Refund Limit, Custom) and a numeric input field for threshold value.
   - **Data Entry**: Selection templates (e.g. VIP discount fields, refund fields) that pre-populate the fields list JSON block.
5. **Timeline Visuals**: Update the read-only details page to display correct step type badges and summarize configurations (e.g., rules or input fields).
6. **No Data Loss on Save**: Ensure existing data-entry/automated steps and configs are preserved when fetched and saved.
7. **Consistent Behavior**: Apply these improvements to both the **Template Detail page** (`/templates/[id]`) and the **Create Template page** (`/templates/new`).

---

## 2. UI Component Design

### 2.1 Timeline Visualization (Read-Only)
* **Step Type Badges**:
  - `Approval`: Slate/Indigo badge (`bg-indigo-500/10 text-indigo-400 border-indigo-500/20`)
  - `Data Entry`: Teal badge (`bg-teal-500/10 text-teal-400 border-teal-500/20`)
  - `Automated`: Amber badge (`bg-amber-500/10 text-amber-400 border-amber-500/20`)
* **Step Details Summaries**:
  - `approval`: Show "Requires approval from [Assignee Role / Specific User]"
  - `data_entry`: Show "Data collection by [Assignee]: [List of fields, e.g. discount_percent, reason]"
  - `automated`: Show "Automated check: [rule name] (Limit: [value])"

### 2.2 Step Editor Cards (Edit Mode / Create Page)
Each step card will contain:
1. **Header Row**:
   - Step sequence number badge.
   - Move controls: `Move Up` (disabled on first step) and `Move Down` (disabled on last step) using chevron icons.
   - `Delete` button (disabled if only one step remains).
2. **Step Type Selector**:
   - A segmented button control: `Approval`, `Data Entry`, `Automated`.
3. **Assignee Form Section** (Hidden if step type is `Automated`):
   - Toggle to select "Role" vs "Specific Agent".
   - Dropdown selection of Roles (Sales Manager, Finance Manager, Sales Coordinator) or Users (list of agents).
4. **Configuration Section** (Shown for `Data Entry` and `Automated`):
   - **Data Entry Config**:
     - Pre-baked template loader (e.g. VIP Discount Fields, Pricing Details Fields, Refund Details Fields, Custom JSON).
     - Textarea editor for raw fields JSON configuration.
   - **Automated Config**:
     - Pre-baked rules dropdown:
       - `discount_limit`: Show numeric input "Max Discount (%)".
       - `price_increase_limit`: Show numeric input "Max Increase Ratio (e.g., 0.15)".
       - `refund_limit`: Show numeric input "Max Refund Ratio (e.g., 0.05)".
       - `custom`: Textarea for raw rule JSON configuration.

---

## 3. Data Mapping & Resequencing Logic

### 3.1 State Type Definition
```typescript
interface StepInput {
  sequence: number;
  step_type: 'approval' | 'data_entry' | 'automated';
  assigneeType: 'role' | 'user';
  assignee_role: string | null;
  assignee_user_id: number | null;
  config: any; // parsed JSON object
}
```

### 3.2 Fetch mapping (`loadData`):
```typescript
const mappedSteps = (tpl.steps || []).map((s: any) => {
  let parsedConfig = null;
  if (s.config) {
    try {
      parsedConfig = typeof s.config === 'string' ? JSON.parse(s.config) : s.config;
    } catch (e) {
      parsedConfig = {};
    }
  }
  return {
    sequence: s.sequence,
    step_type: s.step_type || 'approval',
    assigneeType: s.assignee_user_id ? 'user' : 'role',
    assignee_role: s.assignee_role || null,
    assignee_user_id: s.assignee_user_id || null,
    config: parsedConfig
  };
});
```

### 3.3 Save mapping (Submit payload):
```typescript
const payload = {
  name,
  description,
  trigger_event: triggerEvent,
  steps: steps.map((s) => ({
    sequence: s.sequence,
    step_type: s.step_type,
    assignee_role: s.step_type === 'automated' ? null : (s.assigneeType === 'role' ? s.assignee_role : null),
    assignee_user_id: s.step_type === 'automated' ? null : (s.assigneeType === 'user' ? s.assignee_user_id : null),
    config: s.config ? (typeof s.config === 'string' ? s.config : JSON.stringify(s.config)) : null
  }))
};
```

---

## 4. Verification Plan

1. **Unit Build**: Confirm `npm run build` succeeds.
2. **Reordering Test**: Add three steps, swap step 1 and step 3, save, and verify that the backend updates sequences correctly.
3. **Step Type Mutation**:
   - Add an Automated step, choose `discount_limit` rule, enter `15%`, save. Verify details show correct badge and limit.
   - Verify that no assignee parameters are sent in the payload for that automated step.
4. **Create Verification**: Navigate to `/templates/new`, create a new template with various step types, and verify successful redirection.
