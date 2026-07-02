import express from 'express';
import dotenv from 'dotenv';
import templatesRouter from './routes/templates';
import instancesRouter, { getInbox } from './routes/instances';
import reviewRouter from './routes/review';
import db from './db/connection';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Mount Routes
app.use('/api/templates', templatesRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/review', reviewRouter);

// Support both /api/inbox and /api/instances/inbox
app.get('/api/inbox', getInbox);

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    // Ping DB
    db.prepare('SELECT 1').get();
    res.json({ status: 'OK', database: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'ERROR', database: 'disconnected' });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Workflow Engine API listening on port ${PORT}`);
  });
}

export default app;
