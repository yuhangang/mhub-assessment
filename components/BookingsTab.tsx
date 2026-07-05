'use client';

import React from 'react';

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Booking {
  id: number;
  buyer_name: string;
  project_name: string;
  unit_number: string;
  status: 'pending' | 'active' | 'cancelled';
}

interface WorkflowInstance {
  id: number;
  entity_type: string;
  entity_id: string;
  trigger_event: string;
  status: string;
}

interface BookingsTabProps {
  bookings: Booking[];
  instances: WorkflowInstance[];
  activeAgent: Agent | null;
  triggerConfirmation: (bookingId: number) => Promise<void>;
  triggerCancellation: (bookingId: number) => Promise<void>;
}

export default function BookingsTab({
  bookings,
  instances,
  activeAgent,
  triggerConfirmation,
  triggerCancellation,
}: BookingsTabProps) {
  const getBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'badge success';
      case 'pending':
        return 'badge warning';
      case 'cancelled':
        return 'badge danger';
      default:
        return 'badge';
    }
  };

  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Bookings</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Buyer</th>
              <th>Unit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const runningCancellation = instances.some(
                (inst) =>
                  inst.entity_type === 'booking' &&
                  String(inst.entity_id) === String(booking.id) &&
                  inst.trigger_event === 'booking.cancellation_requested' &&
                  ['pending', 'in_progress'].includes(inst.status)
              );

              const runningConfirmation = instances.some(
                (inst) =>
                  inst.entity_type === 'booking' &&
                  String(inst.entity_id) === String(booking.id) &&
                  inst.trigger_event === 'booking.confirmed' &&
                  ['pending', 'in_progress'].includes(inst.status)
              );

              let actionButton: React.ReactNode;
              if (booking.status === 'pending') {
                const canTrigger = !runningConfirmation && !!activeAgent;
                actionButton = (
                  <button
                    type="button"
                    className="btn-confirm booking-action-button"
                    disabled={!canTrigger}
                    onClick={() => triggerConfirmation(booking.id)}
                  >
                    {runningConfirmation ? 'Confirming...' : 'Confirm booking'}
                  </button>
                );
              } else if (booking.status === 'active') {
                const canTrigger = !runningCancellation && !!activeAgent;
                actionButton = (
                  <button
                    type="button"
                    className="danger booking-action-button"
                    disabled={!canTrigger}
                    onClick={() => triggerCancellation(booking.id)}
                  >
                    {runningCancellation ? 'Cancelling...' : 'Request cancellation'}
                  </button>
                );
              } else {
                actionButton = (
                  <button type="button" className="booking-action-button" disabled>
                    No actions
                  </button>
                );
              }

              return (
                <tr key={booking.id}>
                  <td>#{booking.id}</td>
                  <td>{booking.buyer_name}</td>
                  <td>
                    {booking.project_name} / {booking.unit_number}
                  </td>
                  <td>
                    <span className={getBadgeClass(booking.status)}>
                      {getStatusText(booking.status)}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions booking-actions">{actionButton}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
