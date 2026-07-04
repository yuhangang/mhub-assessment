import path from 'path';
import cors from 'cors';
import express from 'express';
import routes from './routes';
import { query } from './db';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), 'public')));

  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(500).json({ status: 'error', database: 'unavailable' });
    }
  });

  app.use('/api', routes);

  return app;
}
