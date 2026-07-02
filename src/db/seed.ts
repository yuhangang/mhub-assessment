import db from './connection';
import fs from 'fs';
import path from 'path';

export async function runSeed() {
  console.log('Resetting and seeding database...');

  const dbType = process.env.DB_TYPE === 'postgres' ? 'postgres' : 'sqlite';
  const schemaFile = dbType === 'postgres' ? 'schema.postgres.sql' : 'schema.sql';
  const schemaPath = path.resolve(__dirname, schemaFile);
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Execute drop table script depending on DB type
  if (dbType === 'postgres') {
    await db.exec(`
      DROP TABLE IF EXISTS workflow_step_decisions CASCADE;
      DROP TABLE IF EXISTS workflow_instance_steps CASCADE;
      DROP TABLE IF EXISTS workflow_instances CASCADE;
      DROP TABLE IF EXISTS workflow_template_steps CASCADE;
      DROP TABLE IF EXISTS workflow_templates CASCADE;
      DROP TABLE IF EXISTS workflow_events CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS agents CASCADE;
      DROP TABLE IF EXISTS units CASCADE;
      DROP TABLE IF EXISTS projects CASCADE;
    `);
  } else {
    await db.exec(`
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
  }

  await db.exec(schema);

  // Seed Predefined Trigger Events
  await db.execute('INSERT INTO workflow_events (name, description, is_enabled) VALUES (?, ?, ?)', ['booking.cancellation_requested', 'Triggered when a buyer cancellation is requested', 1]);
  await db.execute('INSERT INTO workflow_events (name, description, is_enabled) VALUES (?, ?, ?)', ['booking.confirmed', 'Triggered when a booking is confirmed', 1]);
  await db.execute('INSERT INTO workflow_events (name, description, is_enabled) VALUES (?, ?, ?)', ['unit.price_updated', 'Triggered when unit price changes', 1]);
  console.log('Seeded Workflow Events');

  // Seed Projects
  const project1 = await db.execute('INSERT INTO projects (name) VALUES (?)', ['Emerald Heights']);
  const project2 = await db.execute('INSERT INTO projects (name) VALUES (?)', ['Sapphire Residences']);

  const p1Id = project1.lastInsertRowid;
  const p2Id = project2.lastInsertRowid;

  console.log(`Seeded Projects: Emerald Heights (ID: ${p1Id}), Sapphire Residences (ID: ${p2Id})`);

  // Seed Units (10 units) storing price in cents
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p1Id, 'A-101', 'available', 45000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p1Id, 'A-102', 'booked', 52000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p1Id, 'A-103', 'sold', 60000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p1Id, 'B-201', 'available', 48000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p1Id, 'B-202', 'booked', 53000000]);

  // Sapphire Residences units
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p2Id, 'PH-01', 'booked', 125000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p2Id, 'PH-02', 'available', 135000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p2Id, 'C-301', 'sold', 75000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p2Id, 'C-302', 'available', 78000000]);
  await db.execute('INSERT INTO units (project_id, unit_number, status, price_cents) VALUES (?, ?, ?, ?)', [p2Id, 'C-303', 'booked', 81000000]);

  console.log('Seeded 10 Units');

  // Seed Agents/Users
  const alice = await db.execute('INSERT INTO agents (name, email, role) VALUES (?, ?, ?)', ['Alice Coordinator', 'alice@mhub.my', 'sales_coordinator']);
  const bob = await db.execute('INSERT INTO agents (name, email, role) VALUES (?, ?, ?)', ['Bob Manager', 'bob@mhub.my', 'sales_manager']);
  const charlie = await db.execute('INSERT INTO agents (name, email, role) VALUES (?, ?, ?)', ['Charlie Finance', 'charlie@mhub.my', 'finance_manager']);

  const aliceId = alice.lastInsertRowid;
  const bobId = bob.lastInsertRowid;
  const charlieId = charlie.lastInsertRowid;

  console.log(`Seeded Agents: Alice (ID ${aliceId}), Bob (ID ${bobId}), Charlie (ID ${charlieId})`);

  // Seed Bookings (5 bookings)
  const bookedUnits = await db.query("SELECT id FROM units WHERE status = 'booked'");
  const soldUnits = await db.query("SELECT id FROM units WHERE status = 'sold'");

  await db.execute('INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES (?, ?, ?, ?)', [bookedUnits[0].id, aliceId, 'John Doe', 'active']);
  await db.execute('INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES (?, ?, ?, ?)', [bookedUnits[1].id, aliceId, 'Jane Smith', 'active']);
  await db.execute('INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES (?, ?, ?, ?)', [bookedUnits[2].id, bobId, 'Robert Johnson', 'pending']);
  await db.execute('INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES (?, ?, ?, ?)', [bookedUnits[3].id, bobId, 'Michael Brown', 'active']);
  await db.execute('INSERT INTO bookings (unit_id, agent_id, buyer_name, status) VALUES (?, ?, ?, ?)', [soldUnits[0].id, aliceId, 'William Davis', 'active']);

  console.log('Seeded 5 Bookings');

  // Seed Workflow Template for booking.cancellation_requested
  const template = await db.execute('INSERT INTO workflow_templates (name, description, trigger_event, is_active) VALUES (?, ?, ?, ?)', [
    'Booking Cancellation Workflow',
    'Standard workflow for cancellation requests of booked properties',
    'booking.cancellation_requested',
    1
  ]);
  const templateId = template.lastInsertRowid;

  console.log(`Seeded Template: Booking Cancellation Workflow (ID: ${templateId}, Active: 1)`);

  // Seed Steps using new assignee columns
  // Step 1: Assigned to Role "sales_manager"
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)', [templateId, 1, null, 'sales_manager']);
  
  // Step 2: Assigned to User "Charlie Finance" (ID 3)
  await db.execute('INSERT INTO workflow_template_steps (template_id, sequence, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)', [templateId, 2, charlieId, null]);

  console.log('Seeded Workflow Template Steps (Step 1: Role sales_manager, Step 2: User ' + charlieId + ')');
  console.log('Database seeding completed successfully.');
}

if (require.main === module) {
  runSeed()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seeding failed:', err);
      try {
        await db.close();
      } catch (e) {}
      process.exit(1);
    });
}
