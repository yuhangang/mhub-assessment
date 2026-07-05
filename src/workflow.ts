import { HttpError } from './workflow/errors';
import { DashboardService } from './workflow/dashboard';
import { EventService } from './workflow/events';
import { TemplateService } from './workflow/templates';
import { InstanceService } from './workflow/instances';
import type { TemplateStepInput } from './workflow/types';

export { HttpError };
export type { TemplateStepInput };
export { validateSteps } from './workflow/templates';

export class WorkflowService {
  private dashboardService = new DashboardService();
  private eventService = new EventService();
  private templateService = new TemplateService();
  private instanceService = new InstanceService();

  getDashboardData = this.dashboardService.getDashboardData.bind(this.dashboardService);
  getEvents = this.eventService.getEvents.bind(this.eventService);
  createEvent = this.eventService.createEvent.bind(this.eventService);
  getTemplates = this.templateService.getTemplates.bind(this.templateService);
  createTemplate = this.templateService.createTemplate.bind(this.templateService);
  getTemplateById = this.templateService.getTemplateById.bind(this.templateService);
  patchTemplate = this.templateService.patchTemplate.bind(this.templateService);
  activateTemplate = this.templateService.activateTemplate.bind(this.templateService);
  deactivateTemplate = this.templateService.deactivateTemplate.bind(this.templateService);
  deleteTemplate = this.templateService.deleteTemplate.bind(this.templateService);

  triggerInstance = this.instanceService.triggerInstance.bind(this.instanceService);
  actionStep = this.instanceService.actionStep.bind(this.instanceService);
  getInstances = this.instanceService.getInstances.bind(this.instanceService);
  getInstanceById = this.instanceService.getInstanceById.bind(this.instanceService);
  getInbox = this.instanceService.getInbox.bind(this.instanceService);
}

export const workflowService = new WorkflowService();
