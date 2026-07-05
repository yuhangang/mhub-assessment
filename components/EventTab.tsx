'use client';

import React from 'react';

interface EventType {
  name: string;
  description: string;
  is_enabled: boolean;
}

interface EventTabProps {
  events: EventType[];
  onCreateEvent: (payload: {
    name: string;
    description: string;
  }) => Promise<void>;
}

export default function EventTab({ events, onCreateEvent }: EventTabProps) {
  const [eventName, setEventName] = React.useState('');
  const [eventDescription, setEventDescription] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await onCreateEvent({
        name: eventName.trim(),
        description: eventDescription.trim(),
      });
      setEventName('');
      setEventDescription('');
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while adding the event.');
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Workflow Events</h2>
        <span className="status inactive">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>
      <form className="template-form event-form" onSubmit={handleEventSubmit}>
        <div className="form-row">
          <label>
            Event name
            <input
              type="text"
              placeholder="e.g. booking.refund_requested"
              required
              value={eventName}
              onChange={(e) => {
                setEventName(e.target.value);
                setFormError(null);
              }}
            />
          </label>
          <label>
            Description
            <input
              type="text"
              placeholder="Short event purpose"
              required
              value={eventDescription}
              onChange={(e) => {
                setEventDescription(e.target.value);
                setFormError(null);
              }}
            />
          </label>
        </div>
        {formError && (
          <div className="form-error-alert" id="eventFormError">
            {formError}
          </div>
        )}

        <div className="form-actions compact">
          <button type="submit">Add Event</button>
        </div>
      </form>
      <div className="event-list">
        {events.map((event) => (
          <div className="event-row" key={event.name}>
            <div>
              <strong>{event.name}</strong>
              <p>{event.description}</p>
            </div>
            <span className={event.is_enabled ? 'status active' : 'status inactive'}>
              {event.is_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
