-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Units Table
CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    unit_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('available', 'booked', 'sold')),
    price_cents INTEGER NOT NULL CHECK(price_cents >= 0), -- Storing currency as integers (cents) in SQLite
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
);

-- Agents/Users Table
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('sales_manager', 'finance_manager', 'sales_coordinator'))
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    buyer_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT, -- Preserving historical data in production
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

-- Predefined Trigger Events Table
CREATE TABLE IF NOT EXISTS workflow_events (
    name TEXT PRIMARY KEY,
    description TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0, 1))
);

-- Workflow Templates Table
CREATE TABLE IF NOT EXISTS workflow_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
    previous_template_id INTEGER,
    is_active INTEGER DEFAULT 0 CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trigger_event) REFERENCES workflow_events(name) ON DELETE RESTRICT,
    FOREIGN KEY (previous_template_id) REFERENCES workflow_templates(id) ON DELETE RESTRICT
);

-- Partial index for active template triggers (ensuring only one active template per trigger)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_trigger_event 
ON workflow_templates(trigger_event) 
WHERE is_active = 1;

-- Workflow Template Steps Table
CREATE TABLE IF NOT EXISTS workflow_template_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence > 0), -- Enforced sequence > 0
    assignee_user_id INTEGER,
    assignee_role TEXT,
    step_type TEXT NOT NULL DEFAULT 'approval' CHECK(step_type IN ('approval', 'data_entry', 'automated')),
    config TEXT, -- Holds JSON configuration (e.g. form fields or automated checks)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_user_id) REFERENCES agents(id) ON DELETE RESTRICT,
    UNIQUE(template_id, sequence),
    -- Ensure exactly one assignee is populated if not automated, or both are NULL if automated
    CHECK (
      (step_type = 'automated' AND assignee_user_id IS NULL AND assignee_role IS NULL)
      OR
      (step_type != 'automated' AND (
        (assignee_user_id IS NOT NULL AND assignee_role IS NULL)
        OR
        (assignee_user_id IS NULL AND assignee_role IS NOT NULL)
      ))
    ),
    CHECK (assignee_role IN ('sales_manager', 'finance_manager', 'sales_coordinator') OR assignee_role IS NULL)
);

-- Workflow Instances Table
CREATE TABLE IF NOT EXISTS workflow_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'approved', 'rejected', 'cancelled')), -- Default pending
    entity_type TEXT NOT NULL, -- polymorphic reference
    entity_id TEXT NOT NULL,   -- polymorphic reference
    initiated_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE RESTRICT,
    FOREIGN KEY (initiated_by) REFERENCES agents(id) ON DELETE RESTRICT
);

-- Prevent multiple running workflow instances for the same entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_entity_instance 
ON workflow_instances(entity_type, entity_id) 
WHERE status IN ('pending', 'in_progress');

-- Workflow Instance Steps Table
CREATE TABLE IF NOT EXISTS workflow_instance_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_step_id INTEGER, -- Traceability field linking back to template definition
    instance_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence > 0), -- Enforced sequence > 0
    assignee_user_id INTEGER,
    assignee_role TEXT,
    step_type TEXT NOT NULL DEFAULT 'approval' CHECK(step_type IN ('approval', 'data_entry', 'automated')),
    config TEXT,
    submitted_data TEXT, -- Holds submitted JSON values from data entry step
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'awaiting_action', 'approved', 'rejected', 'cancelled')), -- Default pending & support cancelled status
    version INTEGER NOT NULL DEFAULT 0, -- Optimistic locking
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_step_id) REFERENCES workflow_template_steps(id) ON DELETE SET NULL, -- Nullable traceability on template step delete
    FOREIGN KEY (instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_user_id) REFERENCES agents(id) ON DELETE RESTRICT,
    UNIQUE(instance_id, sequence),
    UNIQUE(id, instance_id), -- Required for composite FK validation
    -- Ensure exactly one assignee is populated if not automated, or both are NULL if automated
    CHECK (
      (step_type = 'automated' AND assignee_user_id IS NULL AND assignee_role IS NULL)
      OR
      (step_type != 'automated' AND (
        (assignee_user_id IS NOT NULL AND assignee_role IS NULL)
        OR
        (assignee_user_id IS NULL AND assignee_role IS NOT NULL)
      ))
    ),
    CHECK (assignee_role IN ('sales_manager', 'finance_manager', 'sales_coordinator') OR assignee_role IS NULL) -- Role validation
);

-- Decision Audit Trail Table
CREATE TABLE IF NOT EXISTS workflow_step_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL UNIQUE, -- Restricts step to exactly one decision log
    instance_id INTEGER NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected')),
    actioned_by INTEGER NOT NULL,
    comment TEXT,
    actioned_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Renamed from created_at for domain consistency
    -- Composite FK validates step belongs to the referenced instance
    FOREIGN KEY (step_id, instance_id) REFERENCES workflow_instance_steps(id, instance_id) ON DELETE CASCADE,
    FOREIGN KEY (actioned_by) REFERENCES agents(id) ON DELETE RESTRICT,
    CHECK (
      decision = 'approved'
      OR (decision = 'rejected' AND comment IS NOT NULL AND length(trim(comment)) > 0) -- Mandatory comments on rejection
    )
);

-- Query optimization indexes for inbox/pending actions
CREATE INDEX IF NOT EXISTS idx_steps_awaiting_user 
ON workflow_instance_steps(assignee_user_id) 
WHERE status = 'awaiting_action';

CREATE INDEX IF NOT EXISTS idx_steps_awaiting_role 
ON workflow_instance_steps(assignee_role) 
WHERE status = 'awaiting_action';

-- Ensure only one step per instance can be awaiting action at any point in time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_awaiting_step_per_instance
ON workflow_instance_steps(instance_id)
WHERE status = 'awaiting_action';

-- Decision trail lookup optimization indexes
CREATE INDEX IF NOT EXISTS idx_step_decisions_instance
ON workflow_step_decisions(instance_id, actioned_at);

CREATE INDEX IF NOT EXISTS idx_step_decisions_actioned_by
ON workflow_step_decisions(actioned_by, actioned_at);

-- Retrieve workflow history for a source entity
CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity
ON workflow_instances(entity_type, entity_id, created_at);

-- Trigger event templates lookup index
CREATE INDEX IF NOT EXISTS idx_workflow_templates_trigger_event
ON workflow_templates(trigger_event, is_active);

-- Triggers for auto-updating updated_at in SQLite (safer WHEN clause prevents recursion loops)
CREATE TRIGGER IF NOT EXISTS trg_workflow_templates_updated_at
AFTER UPDATE ON workflow_templates
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workflow_templates
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_instances_updated_at
AFTER UPDATE ON workflow_instances
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workflow_instances
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_instance_steps_updated_at
AFTER UPDATE ON workflow_instance_steps
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workflow_instance_steps
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;
