import request from 'supertest';
import app from '../src/index';
import db from '../src/db/connection';

describe('Dashboard Helper APIs', () => {
  test('GET /api/agents - retrieves list of agents', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('role');
  });

  test('POST /api/db/reset - resets database successfully', async () => {
    const res = await request(app).post('/api/db/reset');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Database reset complete' });
  });
});
