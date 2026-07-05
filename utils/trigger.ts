export interface TriggerEventOption {
  name: string;
  description: string;
  is_enabled: boolean;
}

export interface TriggerTemplateOption {
  id: number | string;
  name: string;
  trigger_event: string;
  version?: number | string;
  is_active: boolean;
}

export interface TriggerFormState {
  event_name: string;
  entity_type: string;
  entity_id: string;
  initiated_by: number | string;
}

export function inferEntityTypeFromEvent(eventName: string): string {
  const [entityType] = eventName.split('.');
  return entityType || '';
}

export function getTriggerableEvents(
  events: TriggerEventOption[],
  templates: TriggerTemplateOption[]
) {
  const activeTemplateByEvent = new Map(
    templates
      .filter((template) => template.is_active)
      .map((template) => [template.trigger_event, template])
  );

  return events
    .filter((event) => event.is_enabled && activeTemplateByEvent.has(event.name))
    .map((event) => ({
      ...event,
      template: activeTemplateByEvent.get(event.name)!
    }));
}

export function buildTriggerWorkflowPayload(state: TriggerFormState) {
  return {
    event_name: state.event_name.trim(),
    entity_type: state.entity_type.trim(),
    entity_id: state.entity_id.trim(),
    initiated_by: Number(state.initiated_by),
  };
}
