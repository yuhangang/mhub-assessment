import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { runSeed } from '../db/seed';

const router = Router();

router.get('/agents', (req: Request, res: Response) => {
  const agents = db.prepare('SELECT id, name, email, role FROM agents').all();
  res.json(agents);
});

router.get('/bookings', (req: Request, res: Response) => {
  const bookings = db.prepare(`
    SELECT b.*, u.unit_number, u.price_cents, p.name as project_name
    FROM bookings b
    JOIN units u ON b.unit_id = u.id
    JOIN projects p ON u.project_id = p.id
  `).all();
  res.json(bookings);
});

router.get('/units', (req: Request, res: Response) => {
  const units = db.prepare(`
    SELECT u.*, p.name as project_name
    FROM units u
    JOIN projects p ON u.project_id = p.id
  `).all();
  res.json(units);
});

router.get('/events', (req: Request, res: Response) => {
  const events = db.prepare('SELECT name, description, is_enabled FROM workflow_events').all();
  res.json(events);
});

router.get('/all-templates', (req: Request, res: Response) => {
  const templates = db.prepare('SELECT * FROM workflow_templates ORDER BY id DESC').all() as any[];
  const enhancedTemplates = templates.map(t => {
    const steps = db.prepare('SELECT * FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC').all(t.id);
    return { ...t, is_active: Boolean(t.is_active), steps };
  });
  res.json(enhancedTemplates);
});

router.get('/all-instances', (req: Request, res: Response) => {
  const instances = db.prepare(`
    SELECT wi.*, wt.name as template_name, wt.trigger_event, a.name as initiator_name
    FROM workflow_instances wi
    JOIN workflow_templates wt ON wi.template_id = wt.id
    JOIN agents a ON wi.initiated_by = a.id
    ORDER BY wi.created_at DESC
  `).all() as any[];

  const enhancedInstances = instances.map(inst => {
    const steps = db.prepare('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC').all(inst.id);
    const auditTrail = db.prepare(`
      SELECT wsd.*, a.name as agent_name
      FROM workflow_step_decisions wsd
      JOIN agents a ON wsd.actioned_by = a.id
      WHERE wsd.instance_id = ?
      ORDER BY wsd.actioned_at ASC
    `).all(inst.id);

    return { ...inst, steps, audit_trail: auditTrail };
  });

  res.json(enhancedInstances);
});

router.post('/db/reset', (req: Request, res: Response) => {
  try {
    runSeed();
    res.json({ success: true, message: 'Database reset complete' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
