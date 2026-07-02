'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  
  // Default initial step
  const [steps, setSteps] = useState<any[]>([
    { sequence: 1, assigneeType: 'role', assignee_role: 'sales_manager', assignee_user_id: null }
  ]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const eventsData = await apiFetch('/events');
        setEvents(eventsData);
        if (eventsData.length > 0) setTriggerEvent(eventsData[0].name);

        const agentsData = await apiFetch('/agents');
        setAgents(agentsData);
      } catch (err) {
        console.error(err);
      }
    };
    loadOptions();
  }, []);

  const addStep = () => {
    setSteps([
      ...steps,
      { 
        sequence: steps.length + 1, 
        assigneeType: 'role', 
        assignee_role: 'sales_manager', 
        assignee_user_id: null 
      }
    ]);
  };

  const removeStep = (idx: number) => {
    const newSteps = steps.filter((_, i) => i !== idx).map((s, i) => ({
      ...s,
      sequence: i + 1
    }));
    setSteps(newSteps);
  };

  const handleStepChange = (idx: number, field: string, value: any) => {
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
      newSteps[idx][field] = value;
    }
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        description,
        trigger_event: triggerEvent,
        is_active: 1, // Created active by default
        steps: steps.map(s => ({
          sequence: s.sequence,
          assignee_role: s.assigneeType === 'role' ? s.assignee_role : null,
          assignee_user_id: s.assigneeType === 'user' ? s.assignee_user_id : null
        }))
      };

      await apiFetch('/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      router.push('/templates');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Create Workflow Template</h2>
        <p className="text-slate-400 text-sm mt-1">Configure triggers and execution hierarchy steps.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Template Name</label>
          <input 
            type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder="E.g., Price Approval Chain"
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
          <textarea 
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Describe the workflow purpose..."
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trigger Event</label>
          <select
            value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
          >
            {events.map(ev => (
              <option key={ev.name} value={ev.name}>{ev.name} - {ev.description}</option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center border-t border-white/5 pt-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configure Steps</label>
            <button 
              type="button" onClick={addStep}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              + Add Step
            </button>
          </div>

          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={idx} className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="bg-indigo-500/20 text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">{step.sequence}</span>
                  <div className="flex gap-2">
                    <select
                      value={step.assigneeType} onChange={e => handleStepChange(idx, 'assigneeType', e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="role">Assign to Role</option>
                      <option value="user">Assign to User</option>
                    </select>

                    {step.assigneeType === 'role' ? (
                      <select
                        value={step.assignee_role} onChange={e => handleStepChange(idx, 'assignee_role', e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                      >
                        <option value="sales_manager">Sales Manager</option>
                        <option value="finance_manager">Finance Manager</option>
                        <option value="sales_coordinator">Sales Coordinator</option>
                      </select>
                    ) : (
                      <select
                        value={step.assignee_user_id || ''} onChange={e => handleStepChange(idx, 'assignee_user_id', e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                      >
                        {agents.map(ag => (
                          <option key={ag.id} value={ag.id}>{ag.name} ({ag.role})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {steps.length > 1 && (
                  <button 
                    type="button" onClick={() => removeStep(idx)}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end border-t border-white/5 pt-4">
          <button 
            type="button" onClick={() => router.push('/templates')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
          >
            Save Template
          </button>
        </div>
      </form>
    </div>
  );
}
