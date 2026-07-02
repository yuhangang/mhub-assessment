import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { runSeed } from '../db/seed';

const router = Router();

router.get('/agents', async (req: Request, res: Response) => {
  try {
    const agents = await db.query('SELECT id, name, email, role FROM agents');
    res.json(agents);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/bookings', async (req: Request, res: Response) => {
  try {
    const bookings = await db.query(`
      SELECT b.*, u.unit_number, u.price_cents, p.name as project_name
      FROM bookings b
      JOIN units u ON b.unit_id = u.id
      JOIN projects p ON u.project_id = p.id
    `);
    res.json(bookings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/units', async (req: Request, res: Response) => {
  try {
    const units = await db.query(`
      SELECT u.*, p.name as project_name
      FROM units u
      JOIN projects p ON u.project_id = p.id
    `);
    res.json(units);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const events = await db.query('SELECT name, description, is_enabled FROM workflow_events');
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/all-templates', async (req: Request, res: Response) => {
  try {
    const templates = await db.query(
      'SELECT * FROM workflow_templates ORDER BY trigger_event ASC, version DESC, id DESC'
    ) as any[];
    const enhancedTemplates = await Promise.all(templates.map(async t => {
      const steps = await db.query(
        'SELECT * FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC',
        [t.id]
      );
      return { ...t, is_active: Boolean(t.is_active), steps };
    }));
    res.json(enhancedTemplates);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/all-instances', async (req: Request, res: Response) => {
  try {
    const instances = await db.query(`
      SELECT wi.*, wt.name as template_name, wt.trigger_event, wt.version as template_version, a.name as initiator_name
      FROM workflow_instances wi
      JOIN workflow_templates wt ON wi.template_id = wt.id
      JOIN agents a ON wi.initiated_by = a.id
      ORDER BY wi.created_at DESC
    `) as any[];

    const enhancedInstances = await Promise.all(instances.map(async inst => {
      const steps = await db.query('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC', [inst.id]);
      const auditTrail = await db.query(`
        SELECT wsd.*, a.name as agent_name
        FROM workflow_step_decisions wsd
        JOIN agents a ON wsd.actioned_by = a.id
        WHERE wsd.instance_id = ?
        ORDER BY wsd.actioned_at ASC
      `, [inst.id]);

      return { ...inst, steps, audit_trail: auditTrail };
    }));

    res.json(enhancedInstances);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/reset', async (req: Request, res: Response) => {
  try {
    await runSeed();
    res.json({ success: true, message: 'Database reset complete' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
