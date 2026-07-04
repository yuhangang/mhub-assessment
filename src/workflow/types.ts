export interface TriggerInput {
  event_name: string;
  entity_type: string;
  entity_id: string;
  initiated_by: number;
}

export interface ActionInput {
  instance_id: number;
  step_id: number;
  user_id: number;
  decision: 'approved' | 'rejected';
  comment?: string;
}

export interface InstanceStep {
  id: string;
  instance_id: string;
  sequence: number;
  assignee_user_id: string | null;
  assignee_role: string | null;
  status: string;
  version: number;
}

export interface TemplateStepInput {
  sequence: number;
  assignee_user_id?: number | string | null;
  assignee_role?: string | null;
}
