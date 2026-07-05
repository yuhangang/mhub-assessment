'use client';

import React, { useEffect } from 'react';
import {
  canDeleteTemplateFromAdmin,
  getRunningInstanceCountByTemplate,
  TemplateRuntimeInstance
} from '../utils/admin';

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface EventType {
  name: string;
  description: string;
  is_enabled: boolean;
}

interface TemplateStep {
  id?: number;
  sequence: number;
  group_sequence: number;
  approval_policy: string;
  assignee_user_id?: number;
  assignee_role?: string;
}

interface Template {
  id: number;
  name: string;
  description: string;
  trigger_event: string;
  version: number;
  is_active: boolean;
  steps?: TemplateStep[];
}

import { Stage, StageStep, flattenStages } from '../utils/workflow';

interface SettingsTabProps {
  templates: Template[];
  events: EventType[];
  instances: TemplateRuntimeInstance[];
  agents: Agent[];
  expandedTemplateId: number | null;
  templateDetailCache: Record<number, { steps: TemplateStep[] }>;
  editingTemplateId: number | null;
  onToggleTemplateDetail: (id: number) => Promise<void>;
  onSetTemplateActive: (id: number, active: boolean) => Promise<void>;
  onDeleteTemplate: (id: number) => Promise<void>;
  onCreateTemplate: (payload: {
    name: string;
    description: string;
    trigger_event: string;
    is_active: boolean;
    steps: any[];
  }) => Promise<void>;
  onPatchTemplate: (
    id: number,
    payload: { name: string; description: string; is_active: boolean; steps: any[] }
  ) => Promise<void>;
}

const ROLES = [
  { value: 'sales_coordinator', label: 'Sales Coordinator' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'finance_manager', label: 'Finance Manager' },
];

export default function SettingsTab({
  templates,
  events,
  instances,
  agents,
  expandedTemplateId,
  templateDetailCache,
  editingTemplateId,
  onToggleTemplateDetail,
  onSetTemplateActive,
  onDeleteTemplate,
  onCreateTemplate,
  onPatchTemplate,
}: SettingsTabProps) {
  // Form State
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [triggerEvent, setTriggerEvent] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const runningInstanceCounts = getRunningInstanceCountByTemplate(instances);

  // Default step scaffolding
  const createDefaultStep = (): StageStep => ({
    assignee_type: 'role',
    assignee_role: ROLES[0].value,
    assignee_user_id: agents.length ? String(agents[0].id) : '',
  });

  // Initialize form default trigger event
  useEffect(() => {
    if (events.length && !triggerEvent) {
      setTriggerEvent(events[0].name);
    }
  }, [events]);

  // Setup initial step builder if empty
  useEffect(() => {
    if (stages.length === 0) {
      setStages([{ type: 'single', step: createDefaultStep() }]);
    }
  }, []);

  // Handle Edit template triggers
  useEffect(() => {
    setFormError(null);
    if (editingTemplateId !== null) {
      const template = templates.find((t) => t.id === editingTemplateId);
      const detail = templateDetailCache[editingTemplateId];
      if (template && detail) {
        setName(template.name);
        setDescription(template.description || '');
        setTriggerEvent(template.trigger_event);
        setIsActive(template.is_active);

        // Convert steps back to stages
        const groups: Record<number, TemplateStep[]> = {};
        detail.steps.forEach((step) => {
          const g = step.group_sequence || step.sequence;
          if (!groups[g]) groups[g] = [];
          groups[g].push(step);
        });

        const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
        const mappedStages = sortedKeys.map((gKey): Stage => {
          const stepsInGroup = groups[gKey];
          if (stepsInGroup.length === 1) {
            const s = stepsInGroup[0];
            return {
              type: 'single',
              step: {
                assignee_type: s.assignee_user_id ? 'user' : 'role',
                assignee_role: s.assignee_role || ROLES[0].value,
                assignee_user_id: s.assignee_user_id ? String(s.assignee_user_id) : (agents.length ? String(agents[0].id) : ''),
              },
            };
          } else {
            return {
              type: 'parallel',
              steps: stepsInGroup.map((s) => ({
                assignee_type: s.assignee_user_id ? 'user' : 'role',
                assignee_role: s.assignee_role || ROLES[0].value,
                assignee_user_id: s.assignee_user_id ? String(s.assignee_user_id) : (agents.length ? String(agents[0].id) : ''),
              })),
            };
          }
        });
        setStages(mappedStages);
      }
    }
  }, [editingTemplateId, templateDetailCache]);

  const cancelEdit = () => {
    setName('');
    setDescription('');
    if (events.length) setTriggerEvent(events[0].name);
    setIsActive(true);
    setStages([{ type: 'single', step: createDefaultStep() }]);
    setFormError(null);
    // We let the parent component clear editingTemplateId
    onToggleTemplateDetail(-1); // special signal to clear edit
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    cancelEdit();
  };

  // Helper to determine if a template is the latest version
  const isLatestVersion = (template: Template) => {
    const sameTriggerTemplates = templates.filter((t) => t.trigger_event === template.trigger_event);
    if (sameTriggerTemplates.length === 0) return true;
    const maxVersion = Math.max(...sameTriggerTemplates.map((t) => t.version || 1));
    return template.version === maxVersion;
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'sales_manager':
        return 'Sales Manager';
      case 'finance_manager':
        return 'Finance Manager';
      case 'sales_coordinator':
        return 'Sales Coordinator';
      default:
        return role;
    }
  };

  const assigneeLabel = (step: { assignee_user_id?: number; assignee_role?: string }) => {
    if (step.assignee_user_id) {
      const user = agents.find((u) => String(u.id) === String(step.assignee_user_id));
      return user ? `${user.name} (${roleLabel(user.role)})` : `User ID: ${step.assignee_user_id}`;
    }
    return roleLabel(step.assignee_role || '');
  };

  const getBadgeClass = (active: boolean) => {
    return active ? 'status active' : 'status inactive';
  };

  // Nested Stage modification handlers
  const updateSingleStep = (sIdx: number, field: keyof StageStep, value: string) => {
    const newStages = [...stages];
    const stage = newStages[sIdx];
    if (stage.type === 'single') {
      stage.step = { ...stage.step, [field]: value };
      setStages(newStages);
    }
  };

  const updateParallelStep = (sIdx: number, pIdx: number, field: keyof StageStep, value: string) => {
    const newStages = [...stages];
    const stage = newStages[sIdx];
    if (stage.type === 'parallel') {
      stage.steps[pIdx] = { ...stage.steps[pIdx], [field]: value };
      setStages(newStages);
    }
  };

  const addStageStep = () => {
    setStages([...stages, { type: 'single', step: createDefaultStep() }]);
  };

  const addStageParallelGroup = () => {
    setStages([
      ...stages,
      {
        type: 'parallel',
        steps: [createDefaultStep(), createDefaultStep()],
      },
    ]);
  };

  const removeStage = (sIdx: number) => {
    const newStages = stages.filter((_, idx) => idx !== sIdx);
    setStages(newStages.length ? newStages : [{ type: 'single', step: createDefaultStep() }]);
  };

  const convertToParallel = (sIdx: number) => {
    const newStages = [...stages];
    const stage = newStages[sIdx];
    if (stage.type === 'single') {
      newStages[sIdx] = {
        type: 'parallel',
        steps: [stage.step, createDefaultStep()],
      };
      setStages(newStages);
    }
  };

  const addParallelStep = (sIdx: number) => {
    const newStages = [...stages];
    const stage = newStages[sIdx];
    if (stage.type === 'parallel') {
      stage.steps.push(createDefaultStep());
      setStages(newStages);
    }
  };

  const removeParallelStep = (sIdx: number, pIdx: number) => {
    const newStages = [...stages];
    const stage = newStages[sIdx];
    if (stage.type === 'parallel') {
      stage.steps = stage.steps.filter((_, idx) => idx !== pIdx);
      if (stage.steps.length === 1) {
        newStages[sIdx] = { type: 'single', step: stage.steps[0] };
      }
      setStages(newStages);
    }
  };

  // Convert Stages UI model back to flat steps API format
  const getFlatSteps = () => {
    return flattenStages(stages);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const steps = getFlatSteps();
    if (steps.length === 0) {
      setFormError('Please add at least one step.');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      trigger_event: triggerEvent,
      is_active: isActive,
      steps,
    };

    try {
      if (editingTemplateId !== null) {
        await onPatchTemplate(editingTemplateId, payload);
      } else {
        await onCreateTemplate(payload);
      }
      cancelEdit();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while saving the template.');
    }
  };

  // Build static JSX visual preview elements from flattened stages
  const renderPipelinePreview = () => {
    const flatSteps = getFlatSteps();
    if (flatSteps.length === 0) {
      return <div className="pipeline-empty">Add steps above to see the approval flow</div>;
    }

    const groups: Record<number, any[]> = {};
    flatSteps.forEach((step) => {
      const g = step.group_sequence || step.sequence;
      if (!groups[g]) groups[g] = [];
      groups[g].push(step);
    });

    const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    return sortedKeys.map((gKey, idx) => {
      const stepsInGroup = groups[gKey];
      const isParallel = stepsInGroup.length > 1;
      return (
        <React.Fragment key={gKey}>
          <div className={`pipeline-group ${isParallel ? 'parallel' : ''}`}>
            <div className="pipeline-group-label">
              Group {gKey} {isParallel && '(parallel)'}
            </div>
            {stepsInGroup.map((step, sIdx) => (
              <div className="pipeline-step" key={sIdx}>
                <span className="pipeline-step-number">{step.sequence}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{assigneeLabel(step)}</span>
              </div>
            ))}
          </div>
          {idx < sortedKeys.length - 1 && <div className="pipeline-connector"></div>}
        </React.Fragment>
      );
    });
  };

  // Step card HTML render
  const renderStepRow = (
    step: StageStep,
    onTypeChange: (val: 'role' | 'user') => void,
    onRoleChange: (val: string) => void,
    onUserChange: (val: string) => void,
    removeAction?: () => void
  ) => {
    return (
      <div className="step-row">
        <label style={{ flex: 1 }}>
          Assignee Type
          <select
            value={step.assignee_type}
            onChange={(e) => onTypeChange(e.target.value as 'role' | 'user')}
          >
            <option value="role">By Role</option>
            <option value="user">Specific User</option>
          </select>
        </label>

        {step.assignee_type === 'role' ? (
          <label style={{ flex: 1 }}>
            Role
            <select value={step.assignee_role} onChange={(e) => onRoleChange(e.target.value)}>
              {ROLES.map((r) => (
                <option value={r.value} key={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label style={{ flex: 1 }}>
            User
            <select
              value={step.assignee_user_id}
              onChange={(e) => onUserChange(e.target.value)}
            >
              {agents.map((agent) => (
                <option value={agent.id} key={agent.id}>
                  {agent.name} ({roleLabel(agent.role)})
                </option>
              ))}
            </select>
          </label>
        )}

        {removeAction && (
          <button
            type="button"
            className="secondary-danger step-remove-btn"
            onClick={removeAction}
            title="Remove step"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="settings-layout">
      {/* Left: Creator/Editor */}
      <div className="create-template-card">
        <div className="card-header">
          <h3 id="formTitle">
            {editingTemplateId !== null ? `✦ Edit Workflow Template` : '✦ Create Workflow Template'}
          </h3>
          <p>Define approval steps for a trigger event. Add as many steps as needed.</p>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit} className="template-form">
            <div className="form-section-title">Template Info</div>

            <label>
              Template name
              <input
                type="text"
                placeholder="e.g. Booking Cancellation Approval"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="form-row">
              <label>
                Trigger event
                <select
                  value={triggerEvent}
                  onChange={(e) => setTriggerEvent(e.target.value)}
                  disabled={editingTemplateId !== null}
                >
                  {events.map((ev) => (
                    <option value={ev.name} key={ev.name}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <input
                  type="text"
                  placeholder="Short purpose"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>

            <div className="form-section-title">Approval Steps</div>

            {/* Step Builder Grid */}
            <div className="step-builder">
              {stages.map((stage, sIdx) => {
                const connector = sIdx > 0 && (
                  <div className="stage-connector" key={`conn-${sIdx}`}>
                    <span>then</span>
                  </div>
                );

                if (stage.type === 'single') {
                  return (
                    <React.Fragment key={sIdx}>
                      {connector}
                      <div className="stage-card">
                        <div className="stage-header">
                          <span className="stage-label">Step {sIdx + 1}</span>
                          <div className="stage-header-actions">
                            <button
                              type="button"
                              className="secondary stage-action-btn"
                              onClick={() => convertToParallel(sIdx)}
                            >
                              ⑂ Add parallel
                            </button>
                            <button
                              type="button"
                              className="step-remove-btn"
                              onClick={() => removeStage(sIdx)}
                              title="Remove step"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {renderStepRow(
                          stage.step,
                          (val) => updateSingleStep(sIdx, 'assignee_type', val),
                          (val) => updateSingleStep(sIdx, 'assignee_role', val),
                          (val) => updateSingleStep(sIdx, 'assignee_user_id', val)
                        )}
                      </div>
                    </React.Fragment>
                  );
                } else {
                  return (
                    <React.Fragment key={sIdx}>
                      {connector}
                      <div className="stage-card stage-parallel">
                        <div className="stage-header">
                          <div className="parallel-badge">⑂ Parallel</div>
                          <span className="stage-label">Parallel step group</span>
                          <div className="stage-header-actions">
                            <button
                              type="button"
                              className="step-remove-btn"
                              onClick={() => removeStage(sIdx)}
                              title="Remove group"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="parallel-steps-container">
                          {stage.steps.map((pStep, pIdx) => (
                            <div className="parallel-step-card" key={pIdx}>
                              <div className="parallel-step-header">
                                <span className="stage-label">Parallel Step</span>
                              </div>
                              {renderStepRow(
                                pStep,
                                (val) => updateParallelStep(sIdx, pIdx, 'assignee_type', val),
                                (val) => updateParallelStep(sIdx, pIdx, 'assignee_role', val),
                                (val) => updateParallelStep(sIdx, pIdx, 'assignee_user_id', val),
                                stage.steps.length > 2
                                  ? () => removeParallelStep(sIdx, pIdx)
                                  : undefined
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="add-parallel-step-btn"
                          onClick={() => addParallelStep(sIdx)}
                        >
                          + Add parallel step
                        </button>
                      </div>
                    </React.Fragment>
                  );
                }
              })}
            </div>

            <div className="add-stage-buttons">
              <button type="button" className="add-step-btn" onClick={addStageStep}>
                + Add Step
              </button>
              <button
                type="button"
                className="add-step-btn add-parallel-btn"
                onClick={addStageParallelGroup}
              >
                ⑂ Add Parallel Group
              </button>
            </div>

            {/* Pipeline Preview */}
            <div className="pipeline-preview">
              <div className="pipeline-preview-label">Pipeline Preview</div>
              <div className="pipeline-flow">{renderPipelinePreview()}</div>
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Activate immediately after creation
            </label>

            {formError && (
              <div className="form-error-alert" id="templateFormError">
                {formError}
              </div>
            )}

            <div className="form-actions">
              <button type="submit" id="submitTemplateBtn">
                {editingTemplateId !== null ? 'Save Changes as New Version' : 'Create Template'}
              </button>
              <button type="button" className="secondary" onClick={handleReset}>
                Reset
              </button>
              {editingTemplateId !== null && (
                <button type="button" className="secondary-danger" onClick={cancelEdit}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Right: Existing Templates */}
      <div className="panel">
        <div className="panel-heading">
          <h2>Existing Templates</h2>
          <span id="templateCount" className="status inactive">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div id="templateList" className="stack" style={{ marginTop: '16px' }}>
          {templates.length === 0 ? (
            <p className="empty">No templates created yet. Use the form to create one.</p>
          ) : (
            templates.map((template) => {
              const isExpanded = expandedTemplateId === template.id;
              const detail = templateDetailCache[template.id];
              const runningCount = runningInstanceCounts[Number(template.id)] || 0;
              const canDelete = canDeleteTemplateFromAdmin(template.id, instances);
              return (
                <div
                  className={`template-card ${isExpanded ? 'expanded' : ''}`}
                  key={template.id}
                >
                  <div
                    className="template-card-header"
                    onClick={() => onToggleTemplateDetail(template.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="template-card-info">
                      <div className="template-card-name">
                        {template.name}{' '}
                        <span className={getBadgeClass(template.is_active)}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="template-card-meta">
                        {template.trigger_event} · v{template.version || 1}
                        {template.description && ` · ${template.description}`}
                      </div>
                    </div>
                    <div className="template-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetTemplateActive(template.id, !template.is_active);
                        }}
                      >
                        {template.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {isLatestVersion(template) ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTemplateDetail(template.id + 100000);
                          }}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary"
                          disabled
                          title="Only the latest version can be edited"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary-danger"
                        disabled={!canDelete}
                        title={
                          canDelete
                            ? 'Delete template'
                            : `Cannot delete while ${runningCount} workflow${runningCount === 1 ? '' : 's'} are running`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(template.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <button type="button" className="template-card-expand ghost">
                      ▾
                    </button>
                  </div>

                  <div className="template-card-detail">
                    {isExpanded &&
                      (detail ? (
                        <div className="mini-pipeline">
                          <div className="pipeline-preview-label">Approval Steps</div>
                          <div className="pipeline-flow">
                            {(() => {
                              const steps = detail.steps;
                              const groups: Record<number, TemplateStep[]> = {};
                              steps.forEach((step) => {
                                const g = step.group_sequence || step.sequence;
                                if (!groups[g]) groups[g] = [];
                                groups[g].push(step);
                              });
                              const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
                              return sortedKeys.map((gKey, idx) => {
                                const stepsInGroup = groups[gKey];
                                const isParallel = stepsInGroup.length > 1;
                                return (
                                  <React.Fragment key={gKey}>
                                    <div className={`pipeline-group ${isParallel ? 'parallel' : ''}`}>
                                      <div className="pipeline-group-label">
                                        Group {gKey} {isParallel && '(parallel)'}
                                      </div>
                                      {stepsInGroup.map((step, sIdx) => (
                                        <div className="pipeline-step" key={sIdx}>
                                          <span className="pipeline-step-number">{step.sequence}</span>
                                          <span style={{ whiteSpace: 'nowrap' }}>{assigneeLabel(step)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {idx < sortedKeys.length - 1 && (
                                      <div className="pipeline-connector"></div>
                                    )}
                                  </React.Fragment>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="template-detail-loading">Loading steps…</div>
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
