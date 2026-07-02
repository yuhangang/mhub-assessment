import Database from 'better-sqlite3';
import { Pool, PoolClient } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbType = process.env.DB_TYPE === 'postgres' ? 'postgres' : 'sqlite';

// Simple Mutex for SQLite transactions to prevent concurrent BEGIN on the same SQLite handle
class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          next?.();
        } else {
          this.locked = false;
        }
      };

      if (this.locked) {
        this.queue.push(() => resolve(release));
      } else {
        this.locked = true;
        resolve(release);
      }
    });
  }
}

const sqliteMutex = new Mutex();

export interface DbConnection {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number }>;
  transaction<T>(cb: (tx: DbConnection) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// Helper to translate query placeholders and insert returning statements for Postgres
function translateQuery(sql: string, type: 'sqlite' | 'postgres'): string {
  if (type === 'postgres') {
    let index = 1;
    let convertedSql = sql.replace(/\?/g, () => `$${index++}`);
    // Handle INSERT returning
    if (/^\s*insert\s+into\s+workflow_events/i.test(convertedSql)) {
      // workflow_events has primary key 'name', not 'id'
    } else if (/^\s*insert\s+into/i.test(convertedSql) && !/returning/i.test(convertedSql)) {
      convertedSql = convertedSql.trim().replace(/;$/, '') + ' RETURNING id';
    }
    return convertedSql;
  }
  return sql;
}

// Postgres pool initialization (lazy-loaded if DB_TYPE is postgres)
let pgPool: Pool | null = null;
if (dbType === 'postgres') {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mhub_workflow',
  });
}

// SQLite initialization
let sqliteDb: any = null;
if (dbType === 'sqlite') {
  const dbPath = path.resolve(__dirname, '../../workflow.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('foreign_keys = ON');
}

class PostgresConnection implements DbConnection {
  constructor(private client: Pool | PoolClient) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const translated = translateQuery(sql, 'postgres');
    const res = await this.client.query(translated, params);
    return res.rows;
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
    const translated = translateQuery(sql, 'postgres');
    const res = await this.client.query(translated, params);
    const lastInsertRowid = res.rows[0]?.id ? parseInt(res.rows[0].id) : undefined;
    return {
      changes: res.rowCount ?? 0,
      lastInsertRowid,
    };
  }

  async transaction<T>(cb: (tx: DbConnection) => Promise<T>): Promise<T> {
    const client = 'connect' in this.client ? await (this.client as Pool).connect() : (this.client as PoolClient);
    try {
      await client.query('BEGIN');
      const tx = new PostgresConnection(client);
      const res = await cb(tx);
      await client.query('COMMIT');
      return res;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      if ('connect' in this.client) {
        (client as PoolClient).release();
      }
    }
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async close(): Promise<void> {
    if ('connect' in this.client) {
      await (this.client as Pool).end();
    }
  }
}

class SqliteConnection implements DbConnection {
  constructor(private db: any) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
    const res = this.db.prepare(sql).run(...params);
    return {
      changes: res.changes,
      lastInsertRowid: typeof res.lastInsertRowid === 'bigint' ? Number(res.lastInsertRowid) : res.lastInsertRowid,
    };
  }

  async transaction<T>(cb: (tx: DbConnection) => Promise<T>): Promise<T> {
    const release = await sqliteMutex.acquire();
    try {
      this.db.prepare('BEGIN TRANSACTION').run();
      const res = await cb(this);
      this.db.prepare('COMMIT').run();
      return res;
    } catch (e) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        // Ignored
      }
      throw e;
    } finally {
      release();
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

const db: DbConnection = dbType === 'postgres' ? new PostgresConnection(pgPool!) : new SqliteConnection(sqliteDb);

export default db;
