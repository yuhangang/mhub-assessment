# Workflow Settings UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the workflow template creation and editing screens to support interactive step-type selection, configuration helpers, assignee safety, and step reordering buttons.

**Architecture:** Extend the Next.js frontend pages (`templates/[id]/page.tsx` and `templates/new/page.tsx`) to track full step configuration parameters (`step_type`, `config`), implement step index shifting controls (`moveStepUp`, `moveStepDown`), and render conditional form elements.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide icons.

## Global Constraints

- Design visually outstanding dark-theme cards with high-fidelity, polished, clean micro-interactions.
- Client-side validation to ensure step order sequences are contiguous, and automated steps have null assignees.
- Maintain existing API endpoints (`PUT /api/templates/:id` and `POST /api/templates`).

---

### Task 1: Redesign Template Detail & Edit Page

**Files:**
- Modify: `dashboard/src/app/templates/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/templates/:id`, `PUT /api/templates/:id`
- Produces: Polished, interactive editor with step reordering and conditional rule configurations.

- [ ] **Step 1: Update type definitions and data mapping in templates/[id]/page.tsx**
  Update the `StepInput` interface and modify `loadData` and `handleSubmit` to map `step_type` and `config` safely (preserving existing configurations).

- [ ] **Step 2: Add step reordering logic**
  Implement `moveStepUp` and `moveStepDown` state handlers in the component.

- [ ] **Step 3: Update read-only Timeline visualization**
  Display appropriate color badges for each step type and summarize the configuration rules or collected data fields.

- [ ] **Step 4: Update edit form step cards**
  Add step reordering chevrons/buttons, a segmented selector for Step Type, dynamic inputs for assignee details (hidden for Automated), and configuration inputs (pre-baked rule details for Automated, field templates for Data Entry).

---

### Task 2: Redesign Create Template Page

**Files:**
- Modify: `dashboard/src/app/templates/new/page.tsx`

**Interfaces:**
- Consumes: `GET /api/events`, `GET /api/agents`, `POST /api/templates`
- Produces: Polished template creation page with full configurator cards.

- [ ] **Step 1: Implement same step card redesign in templates/new/page.tsx**
  Update type definitions, dynamic fields toggling, config templates, and reordering controls.

- [ ] **Step 2: Update form submit mapping**
  Properly format the payload to include `step_type`, stringified config JSON, and assignee properties.

---

### Task 3: Build & Manual Verification

**Files:**
- Test: Build Next.js app and perform UI verification.

- [ ] **Step 1: Verify Next.js build compiles**
  Run: `npm run build` inside `dashboard/`
  Expected: Successful production build.

- [ ] **Step 2: Verify step reordering and saving**
  Edit a template, swap step positions, update rules, and verify changes persist after saving.
