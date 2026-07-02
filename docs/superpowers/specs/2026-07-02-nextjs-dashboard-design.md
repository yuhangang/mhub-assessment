# 2026-07-02 Next.js Dashboard Design

Design specification for building a separate Next.js admin dashboard to configure workflow templates and run/advance sample workflow processes.

---

## 1. Objectives & Success Criteria

1.  **Template Configuration**: User can view template versions, toggle which version is active for a trigger, and create new templates with sequential steps (mapping to roles or specific user IDs).
2.  **Sample Process Triggering**: User can select an entity (e.g., booked unit or active booking) and trigger a workflow process using predefined events.
3.  **Visual Progress tracking**: User can view running workflow instances, their current status (`in_progress`, `approved`, `rejected`), step-by-step timeline progress, and a full decision audit trail.
4.  **Action Steps (Inbox)**: User can simulate roles (Sales Coordinator, Sales Manager, Finance Manager) or specific users to approve or reject pending steps.
5.  **Database Seeding**: An easy-to-use button to trigger database resets to initial state, enabling clean testing and demonstrations.
6.  **Premium Aesthetics**: Modern cyber-glassmorphism dark-mode UI with high-fidelity components, micro-interactions, responsive grid layout, and clean transitions.

---

## 2. Technology Stack & Directory Structure

### Backend Additions (Express API)
We will add listing routes and enable CORS in the Express API running on port 3000.
*   **Dependencies**: `cors`, `@types/cors` (devDependency)

### Frontend (Next.js Application)
We will create a Next.js app in a `dashboard/` subdirectory:
*   **Framework**: Next.js 15+ (App Router, TypeScript)
*   **Styling**: Tailwind CSS v4
*   **Iconography**: `lucide-react`
*   **HTTP Client**: Fetch API with standard state handlers.

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Outfits & Inter typography, global theme wrapper
│   │   ├── page.tsx           # Dashboard main overview (stats, active instances, reset button)
│   │   ├── templates/
│   │   │   ├── page.tsx       # List of workflow templates with activation toggles
│   │   │   └── new/
│   │   │       └── page.tsx   # Form to create new template with dynamic step configuration
│   │   ├── trigger/
│   │   │   └── page.tsx       # Live triggering panel (select booking/unit + event to run)
│   │   └── inbox/
│   │       └── page.tsx       # Role actions (approve/reject steps with simulated user profiles)
│   ├── components/            # Timeline, glass card wrappers, visual sqlite inspector
│   └── lib/
│       └── api.ts             # Typed API requests to Express API on http://localhost:3000
```

---

## 3. Detailed Component Designs

### 3.1 Template Config (`/templates`)
*   **List View**: Interactive grid of template versions. Displays Name, Description, Trigger Event, Version Number, Step Count, and an active status badge with a Toggle Switch (`PATCH /api/templates/:id/status`).
*   **Creation Wizard (`/templates/new`)**:
    *   Form fields: Name, Description, Trigger Event (dropdown of enabled events).
    *   Dynamic steps configurator: Allows adding/removing steps, setting sequence order, and choosing assignee type (`Specific Agent` dropdown vs. `Assignee Role` dropdown).
    *   Validates constraints client-side (no empty fields, exactly one assignee, sequence starting at 1, etc.) before submitting `POST /api/templates`.
*   **Versioning Rule**: Editing a template must create a new immutable version instead of mutating the existing row. Running instances stay pinned to their original version, while the newly activated version receives future triggers.

### 3.2 Live Triggering (`/trigger`)
*   **Target Selector**: Lists available Units and Bookings fetched via backend API.
*   **Event Selector**: Dropdown of registered trigger events.
*   **Trigger CTA**: Fires `POST /api/instances` sending `event_name`, `entity_type`, `entity_id`, and `initiated_by` (defaults to Agent 1). Displays inline success toast or handles errors (e.g. duplicate active instance).

### 3.3 Inbox Actions (`/inbox`)
*   **Profile Simulator Switcher**: A header bar lets the user change who they are viewing the inbox as:
    *   Alice Coordinator (ID: 1, Role: `sales_coordinator`)
    *   Bob Manager (ID: 2, Role: `sales_manager`)
    *   Charlie Finance (ID: 3, Role: `finance_manager`)
*   **Task List**: Fetches inbox using `GET /api/inbox?user_id=X&role=Y`. Displays context details (e.g. Buyer Name, Unit Number, Price, Project Name).
*   **Action Panel**: Approve/Reject buttons with an input field for Comments. Enforces mandatory comment on Rejection. Employs optimistic locking version tracking to simulate real concurrent calls.

### 3.4 Live Instances & SQL State Overview (`/` Overview)
*   **Overview Stats**: Total Templates, Active Instances, Fully Approved, Rejected.
*   **Instances Table**: Live list of created instances. Clicking an instance displays a detailed sidebar showing:
    *   The visual step timeline: Steps completed (Green check), active step (Amber pulse), pending steps (Slate circle).
    *   Full Audit Trail: Step decisions with author, decision (approved/rejected), timestamp, and comment.
*   **Database Reset Component**: A header button linking to `POST /api/db/reset` which calls the seeding function. When clicked, it resets SQLite, displays a success indicator, and refreshes all lists.

---

## 4. Backend Endpoints Specifications

1.  **CORS Setup**:
    ```typescript
    import cors from 'cors';
    app.use(cors({ origin: 'http://localhost:3001' }));
    ```

2.  **`GET /api/templates`**:
    Returns all template versions: `id`, `name`, `description`, `trigger_event`, `version`, `previous_template_id`, `is_active`, and their nested `steps` (sorted by `sequence`).

3.  **`GET /api/instances`**:
    Returns all instances from `workflow_instances` with initiator details, pinned `template_version`, current state of steps, audit log trail, and source entity information.

4.  **`GET /api/agents`**:
    Returns `id`, `name`, `email`, `role` for all agents in the DB.

5.  **`GET /api/bookings`**:
    Returns all bookings with nested unit/project details.

6.  **`GET /api/units`**:
    Returns all units with project details.

7.  **`GET /api/events`**:
    Returns all `workflow_events`.

8.  **`POST /api/db/reset`**:
    Resets the SQLite database by running `runSeed()` and returns `{ success: true, message: "Database reset complete" }`.

---

## 5. Verification Plan

### Automated Verification
*   We will ensure the backend changes don't break existing tests: `npm run test`.
*   We will test Next.js builds successfully: `npm run build` within `dashboard/`.

### Manual Walkthrough
*   **Reset DB**: Trigger reset, verify bookings are reverted to initial state.
*   **Create Template**: Create a custom 3-step template for `unit.price_updated`. Toggle status to active.
*   **Version Template**: Update an active template and verify a new version is created while existing in-progress instances still show the original template version.
*   **Trigger Workflow**: Trigger a cancellation workflow for Booking ID 1. Verify `in_progress` status on the main dashboard.
*   **Approve Workflow**: Action Step 1 (Sales Manager) and Step 2 (Charlie Finance) via the simulator. Verify workflow completes, booking updates to `cancelled` and unit status changes to `available`.
