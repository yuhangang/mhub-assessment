'use client';

import React, { useEffect, useMemo } from 'react';
import {
  buildTriggerWorkflowPayload,
  getTriggerableEvents,
  inferEntityTypeFromEvent,
  TriggerEventOption,
  TriggerTemplateOption
} from '../utils/trigger';

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface TriggerTabProps {
  events: TriggerEventOption[];
  templates: TriggerTemplateOption[];
  activeAgent: Agent | null;
  onTriggerWorkflow: (payload: {
    event_name: string;
    entity_type: string;
    entity_id: string;
    initiated_by: number;
  }) => Promise<void>;
}

export default function TriggerTab({
  events,
  templates,
  activeAgent,
  onTriggerWorkflow,
}: TriggerTabProps) {
  const triggerableEvents = useMemo(
    () => getTriggerableEvents(events, templates),
    [events, templates]
  );
  const [eventName, setEventName] = React.useState('');
  const [entityType, setEntityType] = React.useState('');
  const [entityId, setEntityId] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  useEffect(() => {
    if (!eventName && triggerableEvents.length > 0) {
      const firstEventName = triggerableEvents[0].name;
      setEventName(firstEventName);
      setEntityType(inferEntityTypeFromEvent(firstEventName));
    }
  }, [eventName, triggerableEvents]);

  const selectedEvent = triggerableEvents.find((event) => event.name === eventName);
  const canTrigger = Boolean(activeAgent && selectedEvent && entityType.trim() && entityId.trim());

  const handleEventChange = (nextEventName: string) => {
    setEventName(nextEventName);
    setEntityType(inferEntityTypeFromEvent(nextEventName));
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAgent || !selectedEvent) return;
    setFormError(null);

    try {
      await onTriggerWorkflow(buildTriggerWorkflowPayload({
        event_name: eventName,
        entity_type: entityType,
        entity_id: entityId,
        initiated_by: activeAgent.id,
      }));
      setEntityId('');
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while triggering the workflow.');
    }
  };

  return (
    <section className="trigger-layout">
      <div className="panel">
        <div className="panel-heading">
          <h2>Trigger Workflow</h2>
          <span className="status inactive">
            {triggerableEvents.length} ready event{triggerableEvents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {triggerableEvents.length === 0 ? (
          <p className="empty">No active workflow templates are available to trigger.</p>
        ) : (
          <form className="template-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label>
                Trigger event
                <select
                  value={eventName}
                  onChange={(e) => handleEventChange(e.target.value)}
                >
                  {triggerableEvents.map((event) => (
                    <option value={event.name} key={event.name}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source type
                <input
                  type="text"
                  placeholder="e.g. unit, quote, booking"
                  required
                  value={entityType}
                  onChange={(e) => {
                    setEntityType(e.target.value);
                    setFormError(null);
                  }}
                />
              </label>
            </div>

            <label>
              Source ID
              <input
                type="text"
                placeholder="Record ID to attach this workflow to"
                required
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value);
                  setFormError(null);
                }}
              />
            </label>

            {selectedEvent && (
              <div className="trigger-template-summary">
                <div>
                  <span>Active template</span>
                  <strong>{selectedEvent.template.name}</strong>
                </div>
                <span className="status active">
                  v{selectedEvent.template.version || 1}
                </span>
              </div>
            )}

            {formError && (
              <div className="form-error-alert" id="triggerFormError">
                {formError}
              </div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={!canTrigger}>
                Trigger workflow
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Available Trigger Events</h2>
        </div>
        <div className="event-list">
          {triggerableEvents.map((event) => (
            <div className="event-row" key={event.name}>
              <div>
                <strong>{event.name}</strong>
                <p>{event.description}</p>
              </div>
              <span className="status active">{event.template.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
