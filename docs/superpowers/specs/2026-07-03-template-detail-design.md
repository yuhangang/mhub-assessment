# 2026-07-03 Template Detail & Edit Page Design

Design specification for adding a workflow template detail page in the Next.js admin dashboard to view, configure, and modify workflow templates.

---

## 1. Objectives & Success Criteria

1. **Detailed View**: Access a template detail page at `/templates/[id]` displaying name, description, trigger event, status, and the sequential chain of steps.
2. **Visual Step representation**: Render the template steps as a visual ordered timeline showing assignee type, step type, and step details.
3. **Interactive Step Editing**: Enable an interactive form layout where users can update the template's name, description, trigger event, and add, remove, or modify steps.
4. **State Constraints Safeguard**: 
   - Check for running instances associated with the template.
   - Disable editing capabilities and display a warning banner if any active instances exist (as required by the backend schema and endpoint validation).
5. **CORS/API Integration**: Integrate frontend actions with existing `GET /api/templates/:id` and `PUT /api/templates/:id` backend endpoints.

---

## 2. Directory & Route Changes

### Frontend (Next.js Application)
We will add a new dynamic route for templates:
* `dashboard/src/app/templates/[id]/page.tsx` - Details & Edit page.

We will modify:
* `dashboard/src/app/templates/page.tsx` - Add a link to each template card navigating to the detail page.

---

## 3. UI/UX Page Layout Design

The template detail page (`/templates/[id]`) will have two view states: **Read-Only Mode** and **Edit Mode**.

### 3.1 Header Controls
* **Back Button**: Navigate back to `/templates`.
* **Action Button**:
  * In Read-Only mode: "Edit Template" button (disabled if running instances exist).
  * In Edit mode: "Cancel" and "Save Changes" buttons.

### 3.2 Read-Only Mode (Default)
* Displays:
  * **Template Name** and **Description**.
  * **Trigger Event** name (as a badge).
  * **Status Toggle**: Toggles template active state instantly using `PATCH /api/templates/:id/status`.
  * **Visual Timeline**: Vertical step list. Each step shows its sequence badge, type (`approval`, `data_entry`, or `automated`), assignee (either role name or agent user name), and configuration details (e.g. data fields).

### 3.3 Edit Mode
* Form inputs:
  * **Template Name** (required).
  * **Description** (text area).
  * **Trigger Event** (dropdown selector of registered workflow events).
* **Steps Configurator List**:
  * Allow adding new steps, removing steps, changing sequence ordering.
  * For each step:
    * Select Assignee Type (`role` vs `user`).
    * Select Role (`sales_manager`, `finance_manager`, `sales_coordinator`) or specific User (populated from `/api/agents`).
    * Select Step Type (`approval`, `data_entry`, `automated`).
* Validates rules client-side:
  * Sequence must start at 1, be contiguous, and ordered.
  * Exactly one of `assignee_user_id` or `assignee_role` must be populated if the step is not automated.

### 3.4 Locked State Warning Banner
* Displays at the top of the page if active instances exist:
  > **Caution**: This template is currently locked and cannot be edited because there are live running workflow instances (`pending` or `in_progress`) associated with it.

---

## 4. API & Data Integration

1. **Fetch Details**:
   - `GET /api/templates/:id` to retrieve details and steps.
   - `GET /api/all-instances` to inspect if there are running instances with `template_id = id` and status in `['pending', 'in_progress']`.
   - `GET /api/agents` and `GET /api/events` to populate the options in dropdowns during editing.
2. **Update Template**:
   - `PUT /api/templates/:id` to save modifications.
3. **Status Toggle**:
   - `PATCH /api/templates/:id/status` to activate or deactivate the template directly.

---

## 5. Verification Plan

### Automated Build Verification
* Run `npm run build` inside `dashboard/` to verify Next.js builds successfully.
* Run `npm run test` on the root workspace to verify tests still pass.

### Manual Verification
* Navigate to `/templates`, click a template card to view details.
* Try editing a template that has no running instances. Save changes and verify updates are reflected.
* Trigger a process using the template to make an instance `in_progress`.
* Navigate back to the template detail page, confirm that the "Edit Template" button is disabled and the locked warning banner is displayed.
