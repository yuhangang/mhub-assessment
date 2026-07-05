import { Router, Request, Response } from 'express';
import { HttpError, workflowService } from './workflow';

const router = Router();

function toHttpError(error: unknown): { status: number; message: string } {
  if (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number') {
    return { status: (error as any).status, message: (error as any).message || 'HTTP error' };
  }
  if (error && typeof error === 'object' && 'code' in error && (error as any).code === '23505') {
    return { status: 409, message: 'Request violates a unique workflow constraint' };
  }
  if (error && typeof error === 'object' && 'code' in error && (error as any).code === '23514') {
    return { status: 400, message: 'Request violates workflow validation constraints' };
  }
  return { status: 500, message: 'Internal server error' };
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<Response | void>) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      const httpError = toHttpError(error);
      if (httpError.status === 500) {
        console.error(error);
      }
      res.status(httpError.status).json({ error: httpError.message });
    }
  };
}

router.get('/dashboard', asyncRoute(async (_req, res) => {
  const data = await workflowService.getDashboardData();
  res.json(data);
}));

router.get('/events', asyncRoute(async (_req, res) => {
  const events = await workflowService.getEvents();
  res.json(events);
}));

router.post('/events', asyncRoute(async (req, res) => {
  const event = await workflowService.createEvent({
    name: req.body.name,
    description: req.body.description,
    is_enabled: req.body.is_enabled
  });
  res.status(201).json(event);
}));

router.get('/templates', asyncRoute(async (_req, res) => {
  const templates = await workflowService.getTemplates();
  res.json(templates);
}));

router.post('/templates', asyncRoute(async (req, res) => {
  const templateId = await workflowService.createTemplate({
    name: req.body.name,
    description: req.body.description,
    trigger_event: req.body.trigger_event,
    is_active: req.body.is_active,
    steps: req.body.steps
  });
  res.status(201).json({ id: templateId });
}));

router.get('/templates/:id', asyncRoute(async (req, res) => {
  const template = await workflowService.getTemplateById(Number(req.params.id));
  res.json(template);
}));

router.patch('/templates/:id', asyncRoute(async (req, res) => {
  const revision = await workflowService.patchTemplate(Number(req.params.id), {
    name: req.body.name,
    description: req.body.description,
    steps: req.body.steps
  });
  res.json(revision);
}));

router.post('/templates/:id/activate', asyncRoute(async (req, res) => {
  const updated = await workflowService.activateTemplate(Number(req.params.id));
  res.json(updated);
}));

router.post('/templates/:id/deactivate', asyncRoute(async (req, res) => {
  const updated = await workflowService.deactivateTemplate(Number(req.params.id));
  res.json(updated);
}));

router.delete('/templates/:id', asyncRoute(async (req, res) => {
  const deleted = await workflowService.deleteTemplate(Number(req.params.id));
  res.json(deleted);
}));

router.post('/instances', asyncRoute(async (req, res) => {
  const instanceId = await workflowService.triggerInstance({
    event_name: String(req.body.event_name || ''),
    entity_type: String(req.body.entity_type || ''),
    entity_id: String(req.body.entity_id || ''),
    initiated_by: Number(req.body.initiated_by)
  });
  res.status(201).json({ instance_id: instanceId });
}));

router.get('/instances', asyncRoute(async (_req, res) => {
  const instances = await workflowService.getInstances();
  res.json(instances);
}));

router.get('/instances/:id', asyncRoute(async (req, res) => {
  const instance = await workflowService.getInstanceById(Number(req.params.id));
  res.json(instance);
}));

router.get('/inbox', asyncRoute(async (req, res) => {
  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  const role = req.query.role ? String(req.query.role) : null;
  const inbox = await workflowService.getInbox({ user_id: userId, role: role });
  res.json(inbox);
}));

router.post('/instances/:id/steps/:stepId/approve', asyncRoute(async (req, res) => {
  await workflowService.actionStep({
    instance_id: Number(req.params.id),
    step_id: Number(req.params.stepId),
    user_id: Number(req.body.user_id),
    decision: 'approved',
    comment: req.body.comment
  });
  res.json({ success: true });
}));

router.post('/instances/:id/steps/:stepId/reject', asyncRoute(async (req, res) => {
  await workflowService.actionStep({
    instance_id: Number(req.params.id),
    step_id: Number(req.params.stepId),
    user_id: Number(req.body.user_id),
    decision: 'rejected',
    comment: req.body.comment
  });
  res.json({ success: true });
}));

export default router;
