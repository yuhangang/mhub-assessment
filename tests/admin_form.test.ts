import { flattenStages, Stage } from '../utils/workflow';
import {
  ADMIN_TABS,
  canDeleteTemplateFromAdmin,
  getRunningInstanceCountByTemplate
} from '../utils/admin';
import {
  buildTriggerWorkflowPayload,
  getTriggerableEvents,
  inferEntityTypeFromEvent
} from '../utils/trigger';
import fs from 'fs';
import path from 'path';

describe('admin template form steps flattening', () => {
  test('submits custom step groups from the dynamic step builder', () => {
    // Set up nested stages: single → parallel(2 steps) → single
    const stages: Stage[] = [
      { type: 'single', step: { assignee_type: 'role', assignee_role: 'sales_manager', assignee_user_id: null } },
      { type: 'parallel', steps: [
        { assignee_type: 'user', assignee_role: 'sales_manager', assignee_user_id: 2 },
        { assignee_type: 'role', assignee_role: 'sales_coordinator', assignee_user_id: null }
      ]},
      { type: 'single', step: { assignee_type: 'user', assignee_role: 'sales_manager', assignee_user_id: 2 } }
    ];

    const steps = flattenStages(stages);

    expect(steps).toEqual([
      { sequence: 1, group_sequence: 1, assignee_role: 'sales_manager', approval_policy: 'ALL' },
      { sequence: 2, group_sequence: 2, assignee_user_id: 2, approval_policy: 'ALL' },
      { sequence: 3, group_sequence: 2, assignee_role: 'sales_coordinator', approval_policy: 'ALL' },
      { sequence: 4, group_sequence: 3, assignee_user_id: 2, approval_policy: 'ALL' }
    ]);
  });
});

describe('admin navigation and template delete guards', () => {
  test('exposes workflow events as a separate admin tab', () => {
    expect(ADMIN_TABS.map((tab) => tab.id)).toEqual([
      'dashboard',
      'bookings',
      'trigger',
      'templates',
      'events'
    ]);
    expect(ADMIN_TABS.find((tab) => tab.id === 'events')?.label).toBe('Workflow Events');
  });

  test('blocks template deletion in admin while matching instances are running', () => {
    const instances = [
      { template_id: 1, status: 'approved' },
      { template_id: 1, status: 'in_progress' },
      { template_id: 2, status: 'pending' },
      { template_id: 2, status: 'cancelled' },
      { template_id: 3, status: 'rejected' }
    ];

    expect(getRunningInstanceCountByTemplate(instances)).toEqual({
      1: 1,
      2: 1
    });
    expect(canDeleteTemplateFromAdmin(1, instances)).toBe(false);
    expect(canDeleteTemplateFromAdmin(2, instances)).toBe(false);
    expect(canDeleteTemplateFromAdmin(3, instances)).toBe(true);
  });
});

describe('admin generic trigger widget', () => {
  const appPage = () => fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');

  test('shows enabled events that have an active template', () => {
    const triggerable = getTriggerableEvents(
      [
        { name: 'booking.confirmed', description: 'Booking confirmation', is_enabled: true },
        { name: 'unit.price_updated', description: 'Quote price workflow', is_enabled: true },
        { name: 'quote.created', description: 'Disabled event', is_enabled: false },
      ],
      [
        { id: 1, name: 'Booking Confirmation', trigger_event: 'booking.confirmed', is_active: false },
        { id: 2, name: 'quote price', trigger_event: 'unit.price_updated', version: 2, is_active: true },
        { id: 3, name: 'Quote Created', trigger_event: 'quote.created', is_active: true },
      ]
    );

    expect(triggerable).toEqual([
      expect.objectContaining({
        name: 'unit.price_updated',
        template: expect.objectContaining({ name: 'quote price', version: 2 })
      })
    ]);
  });

  test('builds a trigger payload for custom workflow events', () => {
    expect(inferEntityTypeFromEvent('unit.price_updated')).toBe('unit');
    expect(inferEntityTypeFromEvent('quote.created')).toBe('quote');

    expect(buildTriggerWorkflowPayload({
      event_name: ' unit.price_updated ',
      entity_type: ' unit ',
      entity_id: ' 7 ',
      initiated_by: '3',
    })).toEqual({
      event_name: 'unit.price_updated',
      entity_type: 'unit',
      entity_id: '7',
      initiated_by: 3,
    });
  });

  test('wires the generic trigger tab into the admin shell', () => {
    expect(appPage()).toContain("import TriggerTab from '../components/TriggerTab'");
    expect(appPage()).toContain("activeTab === 'trigger'");
    expect(appPage()).toContain('onTriggerWorkflow={handleTriggerWorkflow}');
  });
});

describe('admin layout regressions', () => {
  const css = () => fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
  const dashboard = () => fs.readFileSync(path.join(process.cwd(), 'components/DashboardTab.tsx'), 'utf8');
  const bookings = () => fs.readFileSync(path.join(process.cwd(), 'components/BookingsTab.tsx'), 'utf8');

  test('approval progress details use a vertical step list that prevents badge overlap', () => {
    expect(dashboard()).toContain('instance-pipeline');
    expect(dashboard()).toContain('pipeline-step-label');
    expect(dashboard()).toContain('pipeline-step-status');
    expect(css()).toContain('.instance-pipeline {');
    expect(css()).toContain('flex-direction: column');
    expect(css()).toContain('overflow-x: visible');
    expect(css()).toContain('.instance-pipeline .pipeline-step');
    expect(css()).toContain('grid-template-columns: auto minmax(180px, 1fr) auto');
    expect(css()).toContain('.instance-pipeline .pipeline-connector::after');
    expect(css()).toContain('.pipeline-step-status');
  });

  test('booking table actions use fixed action sizing instead of stretching table rows', () => {
    expect(bookings()).toContain('booking-actions');
    expect(bookings()).toContain('booking-action-button');
    expect(css()).toContain('.booking-actions');
    expect(css()).toContain('.booking-action-button');
    expect(css()).toContain('width: 168px');
  });
});

describe('admin API error handling and validation display', () => {
  const css = () => fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
  const settingsTab = () => fs.readFileSync(path.join(process.cwd(), 'components/SettingsTab.tsx'), 'utf8');
  const eventTab = () => fs.readFileSync(path.join(process.cwd(), 'components/EventTab.tsx'), 'utf8');
  const triggerTab = () => fs.readFileSync(path.join(process.cwd(), 'components/TriggerTab.tsx'), 'utf8');
  const appPage = () => fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');

  test('appPage uses correct toast classes and contains visible class', () => {
    expect(appPage()).toContain('toast toast-${toast.type} visible');
  });

  test('inline error alerts are present in all major form tabs', () => {
    expect(settingsTab()).toContain('form-error-alert');
    expect(settingsTab()).toContain('id="templateFormError"');
    expect(eventTab()).toContain('form-error-alert');
    expect(eventTab()).toContain('id="eventFormError"');
    expect(triggerTab()).toContain('form-error-alert');
    expect(triggerTab()).toContain('id="triggerFormError"');
  });

  test('CSS file defines styling for form-error-alert', () => {
    expect(css()).toContain('.form-error-alert');
    expect(css()).toContain('background: var(--danger-bg)');
  });
});
