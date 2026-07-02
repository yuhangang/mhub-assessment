'use client';
import { useState, useEffect, use } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface StepInput {
  sequence: number;
  assigneeType: 'role' | 'user';
  assignee_role: string | null;
  assignee_user_id: number | null;
}

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: templateIdStr } = use(params);
  const templateId = parseInt(templateIdStr);

  const [template, setTemplate] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hasActiveInstances, setHasActiveInstances] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [steps, setSteps] = useState<StepInput[]>([]);

  // Option lists
  const [events, setEvents] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch template details
      const tpl = await apiFetch(`/templates/${templateId}`);
      setTemplate(tpl);
      setName(tpl.name);
      setDescription(tpl.description || '');
      setTriggerEvent(tpl.trigger_event);

      // Map steps to StepInput structure
      const mappedSteps = (tpl.steps || []).map((s: any) => ({
        sequence: s.sequence,
        assigneeType: s.assignee_user_id ? 'user' : 'role',
        assignee_role: s.assignee_role || 'sales_manager',
        assignee_user_id: s.assignee_user_id || null,
      }));
      setSteps(mappedSteps);

      // Fetch all running instances to check for active ones against this template
      const instances = await apiFetch('/all-instances');
      const activeCount = instances.filter(
        (inst: any) =>
          inst.template_id === templateId &&
          (inst.status === 'pending' || inst.status === 'in_progress')
      ).length;
      setHasActiveInstances(activeCount > 0);

      // Fetch events and agents for edit options
      const eventsData = await apiFetch('/events');
      setEvents(eventsData);
      const agentsData = await apiFetch('/agents');
      setAgents(agentsData);
    } catch (e: any) {
      setError(e.message || 'Failed to load template data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [templateId]);

  const handleToggleStatus = async () => {
    if (!template) return;
    try {
      setError('');
      setSuccessMsg('');
      const updated = await apiFetch(`/templates/${templateId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !template.is_active }),
      });
      setTemplate((prev: any) => ({ ...prev, is_active: updated.is_active }));
      setSuccessMsg(`Status updated to ${updated.is_active ? 'Active' : 'Disabled'}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addStep = () => {
    setSteps([
      ...steps,
      {
        sequence: steps.length + 1,
        assigneeType: 'role',
        assignee_role: 'sales_manager',
        assignee_user_id: null,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    const newSteps = steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({
        ...s,
        sequence: i + 1,
      }));
    setSteps(newSteps);
  };

  const handleStepChange = (idx: number, field: keyof StepInput, value: any) => {
    const newSteps = [...steps];
    if (field === 'assigneeType') {
      newSteps[idx].assigneeType = value;
      if (value === 'role') {
        newSteps[idx].assignee_role = 'sales_manager';
        newSteps[idx].assignee_user_id = null;
      } else {
        newSteps[idx].assignee_role = null;
        newSteps[idx].assignee_user_id = agents[0]?.id || 1;
      }
    } else if (field === 'assignee_user_id') {
      newSteps[idx].assignee_user_id = parseInt(value) || null;
    } else {
      (newSteps[idx] as any)[field] = value;
    }
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      setSuccessMsg('');

      const payload = {
        name,
        description,
        trigger_event: triggerEvent,
        steps: steps.map((s) => ({
          sequence: s.sequence,
          assignee_role: s.assigneeType === 'role' ? s.assignee_role : null,
          assignee_user_id: s.assigneeType === 'user' ? s.assignee_user_id : null,
        })),
      };

      const res = await apiFetch(`/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setSuccessMsg('Template updated successfully!');
      setIsEditing(false);
      
      if (res.templateId && res.templateId !== templateId) {
        router.push(`/templates/${res.templateId}`);
      } else {
        loadData();
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return <p className="text-slate-400">Loading template details...</p>;
  }

  if (error && !template) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg text-sm font-medium">
        {error}
        <div className="mt-4">
          <Link href="/templates" className="text-xs underline text-indigo-400 hover:text-indigo-300">
            Back to Templates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Navigation and Actions Header */}
      <div className="flex justify-between items-center">
        <Link
          href="/templates"
          className="text-sm font-semibold text-slate-400 hover:text-white flex items-center gap-1"
        >
          ← Back to Configuration
        </Link>
        
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer"
          >
            Edit Template
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setError('');
                if (template) {
                  setName(template.name);
                  setDescription(template.description || '');
                  setTriggerEvent(template.trigger_event);
                  const mappedSteps = (template.steps || []).map((s: any) => ({
                    sequence: s.sequence,
                    assigneeType: s.assignee_user_id ? 'user' : 'role',
                    assignee_role: s.assignee_role || 'sales_manager',
                    assignee_user_id: s.assignee_user_id || null,
                  }));
                  setSteps(mappedSteps);
                }
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-lg text-sm font-medium">
          {successMsg}
        </div>
      )}

      {hasActiveInstances && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl text-sm font-medium flex flex-col gap-1 text-left">
          <span className="font-bold">Active Instances Running</span>
          <span>
            This template currently has active running workflow instances (`pending` or `in_progress`). Saving changes will create a new version of the template. Existing running instances will continue to use the current version (v{template.version}), while new triggers will use the new version.
          </span>
        </div>
      )}

      {/* Main Form/Details Card */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-8 space-y-6">
        {!isEditing ? (
          /* Read-Only State */
          <div className="space-y-6">
            <div className="flex justify-between items-start border-b border-white/5 pb-4">
              <div className="text-left">
                <h2 className="text-2xl font-bold text-white">{template.name}</h2>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500 mt-1">
                  Version {template.version}
                </p>
                <p className="text-slate-400 text-sm mt-3">{template.description || 'No description provided.'}</p>
              </div>
              <button
                onClick={handleToggleStatus}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  template.is_active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-700/20 text-slate-400 border border-white/5'
                }`}
              >
                {template.is_active ? 'Active' : 'Disabled'}
              </button>
            </div>

            <div className="text-sm text-slate-300 text-left">
              Trigger Event: <span className="font-mono text-teal-400 bg-slate-950/40 px-2 py-1 rounded border border-white/5 ml-1">{template.trigger_event}</span>
            </div>

            {template.previous_template_id && (
              <div className="text-xs text-slate-500 text-left">
                Based on template ID: <span className="font-mono text-slate-300">{template.previous_template_id}</span>
              </div>
            )}

            {/* Steps Timeline Visual */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Configured Step Sequence</h3>
              {steps.length === 0 ? (
                <p className="text-slate-500 text-sm">No steps configured.</p>
              ) : (
                <div className="relative pl-6 border-l border-indigo-500/20 space-y-6 ml-3">
                  {steps.map((step, idx) => {
                    const agentName = step.assignee_user_id
                      ? agents.find((a) => a.id === step.assignee_user_id)?.name || `User ID: ${step.assignee_user_id}`
                      : null;
                    return (
                      <div key={idx} className="relative text-left">
                        {/* Timeline node icon */}
                        <div className="absolute -left-[31px] top-0 bg-slate-950 w-6 h-6 rounded-full border border-indigo-500/50 flex items-center justify-center text-xs font-bold text-indigo-400">
                          {step.sequence}
                        </div>
                        <div className="bg-slate-950/30 p-4 rounded-xl border border-white/5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Step {step.sequence}
                            </span>
                            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-semibold uppercase">
                              Approval
                            </span>
                          </div>
                          <p className="text-sm text-white font-semibold mt-1">
                            {step.assigneeType === 'role'
                              ? `Role: ${step.assignee_role?.replace('_', ' ')}`
                              : `Specific User: ${agentName}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Editable State */
          <form onSubmit={handleSubmit} className="space-y-6 text-left">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Template Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.g., Price Approval Chain"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the workflow purpose..."
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trigger Event</label>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all cursor-pointer"
              >
                {events.map((ev) => (
                  <option key={ev.name} value={ev.name}>
                    {ev.name} - {ev.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-t border-white/5 pt-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configure Steps</label>
                <button
                  type="button"
                  onClick={addStep}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  + Add Step
                </button>
              </div>

              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-wrap gap-4 items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-indigo-500/20 text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">
                        {step.sequence}
                      </span>
                      <div className="flex gap-2">
                        <select
                          value={step.assigneeType}
                          onChange={(e) => handleStepChange(idx, 'assigneeType', e.target.value)}
                          className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="role">Assign to Role</option>
                          <option value="user">Assign to User</option>
                        </select>

                        {step.assigneeType === 'role' ? (
                          <select
                            value={step.assignee_role || 'sales_manager'}
                            onChange={(e) => handleStepChange(idx, 'assignee_role', e.target.value)}
                            className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                          >
                            <option value="sales_manager">Sales Manager</option>
                            <option value="finance_manager">Finance Manager</option>
                            <option value="sales_coordinator">Sales Coordinator</option>
                          </select>
                        ) : (
                          <select
                            value={step.assignee_user_id || ''}
                            onChange={(e) => handleStepChange(idx, 'assignee_user_id', e.target.value)}
                            className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                          >
                            {agents.map((ag) => (
                              <option key={ag.id} value={ag.id}>
                                {ag.name} ({ag.role.replace('_', ' ')})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="text-xs font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
