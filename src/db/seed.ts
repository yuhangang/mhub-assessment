import db from './connection';
import fs from 'fs';
import path from 'path';

export function runSeed() {
  console.log('Resetting and seeding database...');

  // Read schema.sql
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema DDL to drop/recreate tables
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TRIGGER IF EXISTS trg_workflow_instance_steps_updated_at;
    DROP TRIGGER IF EXISTS trg_workflow_instances_updated_at;
    DROP TRIGGER IF EXISTS trg_workflow_templates_updated_at;
    DROP TABLE IF EXISTS workflow_step_decisions;
    DROP TABLE IF EXISTS workflow_instance_steps;
    DROP TABLE IF EXISTS workflow_instances;
    DROP TABLE IF EXISTS workflow_template_steps;
    DROP TABLE IF EXISTS workflow_templates;
    DROP TABLE IF EXISTS workflow_events;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS agents;
    DROP TABLE IF EXISTS units;
    DROP TABLE IF EXISTS projects;
    PRAGMA foreign_keys = ON;
  `);

  db.exec(schema);

  // Seed Predefined Trigger Events
  const insertEvent = db.prepare('INSERT INTO workflow_events (name, description, is_enabled) VALUES (?, ?, ?)');
  insertEvent.run('booking.cancellation_requested', 'Triggered when a buyer cancellation is requested', 1);
  insertEvent.run('booking.confirmed', 'Triggered when a booking is confirmed', 1);
  insertEvent.run('unit.price_updated', 'Triggered when unit price changes', 1);
  console.log('Seeded Workflow Events');

  // Seed Projects
  const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
  const project1 = insertProject.run('Emerald Heights');
  const project2 = insertProject.run('Sapphire Residences');

  console.log(`Seeded Projects: Emerald Heights (ID: ${project1.lastInsertRowid}), Sapphire Residences (ID: ${project2.lastInsertRowid})`);

  // Seed Units (10 units) storing price in cents
  const insertUnit = db.prepare('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)');
  
  // Emerald Heights units
  insertUnit.run(project1.lastInsertRowid, 'A-101', 'available', 45000000);
  insertUnit.run(project1.lastInsertRowid, 'A-102', 'booked', 52000000);
  insertUnit.run(project1.lastInsertRowid, 'A-103', 'sold', 60000000);
  insertUnit.run(project1.lastInsertRowid, 'B-201', 'available', 48000000);
  insertUnit.run(project1.lastInsertRowid, 'B-202', 'booked', 53000000);

  // Sapphire Residences units
  insertUnit.run(project2.lastInsertRowid, 'PH-01', 'booked', 125000000);
  insertUnit.run(project2.lastInsertRowid, 'PH-02', 'available', 135000000);
  insertUnit.run(project2.lastInsertRowid, 'C-301', 'sold', 75000000);
  insertUnit.run(project2.lastInsertRowid, 'C-302', 'available', 78000000);
  insertUnit.run(project2.lastInsertRowid, 'C-303', 'booked', 81000000);

  console.log('Seeded 10 Units');

  // Seed Agents/Users
  const insertAgent = db.prepare('INSERT INTO agents (name, email, role) VALUES (?, ?, ?)');
  const alice = insertAgent.run('Alice Coordinator', 'alice@mhub.my', 'sales_coordinator');
  const bob = insertAgent.run('Bob Manager', 'bob@mhub.my', 'sales_manager');
  const charlie = insertAgent.run('Charlie Finance', 'charlie@mhub.my', 'finance_manager');

  console.log(`Seeded Agents: Alice (ID ${alice.lastInsertRowid}), Bob (ID ${bob.lastInsertRowid}), Charlie (ID ${charlie.lastInsertRowid})`);

  // Seed Bookings (5 bookings)
  const insertBooking = db.prepare('INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES (?, ?, ?, ?)');
  
  const bookedUnits = db.prepare("SELECT id FROM units WHERE status = 'booked'").all() as { id: number }[];
  
  const booking1 = insertBooking.run(bookedUnits[0].id, alice.lastInsertRowid, 'John Doe', 'active');
  const booking2 = insertBooking.run(bookedUnits[1].id, alice.lastInsertRowid, 'Jane Smith', 'active');
  const booking3 = insertBooking.run(bookedUnits[2].id, bob.lastInsertRowid, 'Robert Johnson', 'pending');
  const booking4 = insertBooking.run(bookedUnits[3].id, bob.lastInsertRowid, 'Michael Brown', 'active');
  
  const soldUnits = db.prepare("SELECT id FROM units WHERE status = 'sold'").all() as { id: number }[];
  const booking5 = insertBooking.run(soldUnits[0].id, alice.lastInsertRowid, 'William Davis', 'active');

  console.log('Seeded 5 Bookings');

  // Seed Workflow Template for booking.cancellation_requested
  const insertTemplate = db.prepare('INSERT INTO workflow_templates (name, description, trigger_event, is_active) VALUES (?, ?, ?, ?)');
  const template = insertTemplate.run(
    'Booking Cancellation Workflow',
    'Standard workflow for cancellation requests of booked properties',
    'booking.cancellation_requested',
    1
  );
  const templateId = template.lastInsertRowid;

  console.log(`Seeded Template: Booking Cancellation Workflow (ID: ${templateId}, Active: 1)`);

  // Seed Steps using new assignee columns
  const insertStep = db.prepare('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)');
  
  // Step 1: Assigned to Role "sales_manager"
  insertStep.run(templateId, 1, null, 'sales_manager');
  
  // Step 2: Assigned to User "Charlie Finance" (ID 3)
  insertStep.run(templateId, 2, charlie.lastInsertRowid, null);

  console.log('Seeded Workflow Template Steps (Step 1: Role sales_manager, Step 2: User ' + charlie.lastInsertRowid + ')');
  console.log('Database seeding completed successfully.');
}

if (require.main === module) {
  runSeed();
}
