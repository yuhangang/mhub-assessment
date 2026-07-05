DROP TABLE IF EXISTS workflow_step_decisions CASCADE;
DROP TABLE IF EXISTS workflow_instance_steps CASCADE;
DROP TABLE IF EXISTS workflow_instances CASCADE;
DROP TABLE IF EXISTS workflow_template_steps CASCADE;
DROP TABLE IF EXISTS workflow_templates CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS workflow_events CASCADE;

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  unit_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'booked', 'sold')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, unit_number)
);

CREATE TABLE agents (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('sales_manager', 'finance_manager', 'sales_coordinator'))
);

CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  buyer_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_events (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE workflow_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_event TEXT NOT NULL REFERENCES workflow_events(name) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  previous_template_id BIGINT REFERENCES workflow_templates(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_one_active_template_per_trigger
ON workflow_templates(trigger_event)
WHERE is_active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_workflow_template_versions
ON workflow_templates(trigger_event, version);

CREATE UNIQUE INDEX idx_workflow_template_single_child
ON workflow_templates(previous_template_id)
WHERE previous_template_id IS NOT NULL;

CREATE TABLE workflow_template_steps (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  group_sequence INTEGER NOT NULL CHECK (group_sequence > 0),
  approval_policy TEXT NOT NULL DEFAULT 'ALL' CHECK (approval_policy = 'ALL'),
  assignee_user_id BIGINT REFERENCES agents(id) ON DELETE RESTRICT,
  assignee_role TEXT CHECK (assignee_role IN ('sales_manager', 'finance_manager', 'sales_coordinator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, sequence),
  CHECK (
    (assignee_user_id IS NOT NULL AND assignee_role IS NULL)
    OR
    (assignee_user_id IS NULL AND assignee_role IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_template_parallel_unique_role
ON workflow_template_steps(template_id, group_sequence, assignee_role)
WHERE assignee_role IS NOT NULL;

CREATE UNIQUE INDEX idx_template_parallel_unique_user
ON workflow_template_steps(template_id, group_sequence, assignee_user_id)
WHERE assignee_user_id IS NOT NULL;

CREATE TABLE workflow_instances (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES workflow_templates(id) ON DELETE RESTRICT,
  trigger_event TEXT NOT NULL REFERENCES workflow_events(name) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'cancelled')),
  initiated_by BIGINT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_one_running_instance_per_entity
ON workflow_instances(entity_type, entity_id, trigger_event)
WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);

CREATE TABLE workflow_instance_steps (
  id BIGSERIAL PRIMARY KEY,
  instance_id BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  template_step_id BIGINT REFERENCES workflow_template_steps(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  group_sequence INTEGER NOT NULL CHECK (group_sequence > 0),
  approval_policy TEXT NOT NULL DEFAULT 'ALL' CHECK (approval_policy = 'ALL'),
  assignee_user_id BIGINT REFERENCES agents(id) ON DELETE RESTRICT,
  assignee_role TEXT CHECK (assignee_role IN ('sales_manager', 'finance_manager', 'sales_coordinator')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_action', 'approved', 'rejected', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, sequence),
  CHECK (
    (assignee_user_id IS NOT NULL AND assignee_role IS NULL)
    OR
    (assignee_user_id IS NULL AND assignee_role IS NOT NULL)
  )
);

CREATE INDEX idx_steps_awaiting_user
ON workflow_instance_steps(assignee_user_id)
WHERE status = 'awaiting_action';

CREATE INDEX idx_steps_awaiting_role
ON workflow_instance_steps(assignee_role)
WHERE status = 'awaiting_action';

CREATE TABLE workflow_step_decisions (
  id BIGSERIAL PRIMARY KEY,
  step_id BIGINT NOT NULL UNIQUE REFERENCES workflow_instance_steps(id) ON DELETE CASCADE,
  instance_id BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  actioned_by BIGINT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  comment TEXT,
  actioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (decision = 'approved' OR length(trim(coalesce(comment, ''))) > 0)
);

CREATE INDEX idx_decisions_instance ON workflow_step_decisions(instance_id, actioned_at);
