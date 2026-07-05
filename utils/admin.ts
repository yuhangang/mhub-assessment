export type AdminTabId = 'dashboard' | 'bookings' | 'trigger' | 'templates' | 'events';

export const ADMIN_TABS: Array<{ id: AdminTabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'trigger', label: 'Trigger' },
  { id: 'templates', label: 'Workflow Templates' },
  { id: 'events', label: 'Workflow Events' },
];

export interface TemplateRuntimeInstance {
  template_id: number | string;
  status: string;
}

const RUNNING_STATUSES = new Set(['pending', 'in_progress']);

export function getRunningInstanceCountByTemplate(
  instances: TemplateRuntimeInstance[]
): Record<number, number> {
  return instances.reduce<Record<number, number>>((counts, instance) => {
    if (!RUNNING_STATUSES.has(instance.status)) {
      return counts;
    }

    const templateId = Number(instance.template_id);
    counts[templateId] = (counts[templateId] || 0) + 1;
    return counts;
  }, {});
}

export function canDeleteTemplateFromAdmin(
  templateId: number | string,
  instances: TemplateRuntimeInstance[]
): boolean {
  const counts = getRunningInstanceCountByTemplate(instances);
  return !counts[Number(templateId)];
}
