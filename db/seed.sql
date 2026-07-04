INSERT INTO projects (name) VALUES
  ('Northbank Residences'),
  ('South Garden');

INSERT INTO units (project_id, unit_number, status, price_cents) VALUES
  (1, 'A-01-01', 'booked', 85000000),
  (1, 'A-01-02', 'available', 78000000),
  (1, 'A-02-01', 'available', 90000000),
  (1, 'A-02-02', 'available', 91000000),
  (1, 'A-03-01', 'available', 92000000),
  (2, 'B-01-01', 'available', 65000000),
  (2, 'B-01-02', 'available', 66000000),
  (2, 'B-02-01', 'available', 68000000),
  (2, 'B-02-02', 'available', 69000000),
  (2, 'B-03-01', 'available', 71000000);

INSERT INTO agents (name, email, role) VALUES
  ('Sarah Sales', 'sarah@example.com', 'sales_manager'),
  ('Farid Finance', 'farid@example.com', 'finance_manager'),
  ('Carmen Coordinator', 'carmen@example.com', 'sales_coordinator');

INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES
  (1, 3, 'Buyer One', 'active'),
  (2, 3, 'Buyer Two', 'pending'),
  (3, 3, 'Buyer Three', 'pending'),
  (4, 3, 'Buyer Four', 'pending'),
  (5, 3, 'Buyer Five', 'pending');

INSERT INTO workflow_events (name, description) VALUES
  ('booking.cancellation_requested', 'Booking cancellation approval'),
  ('booking.confirmed', 'Booking confirmation approval'),
  ('unit.price_updated', 'Unit price update approval');

INSERT INTO workflow_templates (name, description, trigger_event, is_active)
VALUES ('Booking Cancellation Approval', 'Sales manager approval followed by finance sign-off.', 'booking.cancellation_requested', true);

INSERT INTO workflow_template_steps (template_id, sequence, assignee_role)
VALUES (1, 1, 'sales_manager');

INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id)
VALUES (1, 2, 2);

