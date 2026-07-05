import { query } from '../db';
import { HttpError } from './errors';

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/;

export class EventService {
  async getEvents(): Promise<any[]> {
    const result = await query(
      'SELECT * FROM workflow_events WHERE is_enabled = true ORDER BY name ASC'
    );
    return result.rows;
  }

  async createEvent(data: {
    name: string;
    description: string;
    is_enabled?: boolean;
  }): Promise<any> {
    const name = String(data.name || '').trim();
    const description = String(data.description || '').trim();

    if (!name || !description) {
      throw new HttpError(400, 'name and description are required');
    }
    if (!EVENT_NAME_PATTERN.test(name)) {
      throw new HttpError(400, 'event name must use dot notation, for example booking.confirmed');
    }

    const existing = await query('SELECT name FROM workflow_events WHERE name = $1', [name]);
    if ((existing.rowCount || 0) > 0) {
      throw new HttpError(409, `Workflow event '${name}' already exists`);
    }

    const inserted = await query(
      `INSERT INTO workflow_events (name, description, is_enabled)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, data.is_enabled !== false]
    );

    return inserted.rows[0];
  }
}
