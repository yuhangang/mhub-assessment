import dotenv from 'dotenv';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';

dotenv.config();

types.setTypeParser(20, (value) => Number.parseInt(value, 10));

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mhub_workflow';

export const pool = new Pool({ connectionString });

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
