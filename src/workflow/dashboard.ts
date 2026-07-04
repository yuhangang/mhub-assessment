import { query } from '../db';

export class DashboardService {
  async getDashboardData(): Promise<{
    agents: any[];
    bookings: any[];
    instances: any[];
    templates: any[];
    events: any[];
  }> {
    const [agents, bookings, instances, templates, events] = await Promise.all([
      query('SELECT * FROM agents ORDER BY id ASC'),
      query(`
        SELECT b.*, u.unit_number, u.status AS unit_status, p.name AS project_name
        FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN projects p ON p.id = u.project_id
        ORDER BY b.id ASC
      `),
      query(`
        SELECT wi.*, wt.name AS template_name
        FROM workflow_instances wi
        JOIN workflow_templates wt ON wt.id = wi.template_id
        ORDER BY wi.created_at DESC, wi.id DESC
      `),
      query('SELECT * FROM workflow_templates WHERE deleted_at IS NULL ORDER BY id ASC'),
      query('SELECT * FROM workflow_events WHERE is_enabled = true ORDER BY name ASC')
    ]);

    return {
      agents: agents.rows,
      bookings: bookings.rows,
      instances: instances.rows,
      templates: templates.rows,
      events: events.rows
    };
  }
}
