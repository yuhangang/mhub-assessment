'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTemplates = async () => {
    try {
      const data = await apiFetch('/all-templates');
      setTemplates(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: number, currentActive: boolean) => {
    try {
      await apiFetch(`/templates/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      loadTemplates();
    } catch (err: any) {
      alert('Error toggling status: ' + err.message);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Workflow Configuration</h2>
          <p className="text-slate-400 mt-1">Configure templates, sequence steps, and activate events.</p>
        </div>
        <Link href="/templates/new" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-all">
          + New Template
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading templates...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map(tpl => (
            <div key={tpl.id} className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 space-y-4 hover:border-indigo-500/20 transition-all flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white">{tpl.name}</h3>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500 mt-1">
                      Version {tpl.version}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleStatus(tpl.id, tpl.is_active)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      tpl.is_active 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-slate-700/20 text-slate-400 border border-white/5'
                    }`}
                  >
                    {tpl.is_active ? 'Active' : 'Disabled'}
                  </button>
                </div>
                <p className="text-slate-400 text-sm">{tpl.description || 'No description provided.'}</p>
                <div className="text-xs text-slate-500">
                  Trigger Event: <span className="font-mono text-teal-400">{tpl.trigger_event}</span>
                </div>
                {tpl.previous_template_id ? (
                  <div className="text-xs text-slate-500">
                    Based on template ID <span className="font-mono text-slate-300">{tpl.previous_template_id}</span>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-white/5 pt-4 flex justify-between items-end">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Configured Steps ({tpl.steps?.length || 0})</h4>
                  <div className="flex flex-wrap gap-2">
                    {tpl.steps?.map((step: any) => (
                      <div key={step.id} className="bg-slate-950/40 border border-white/5 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5">
                        <span className="bg-indigo-500/20 text-indigo-400 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px]">{step.sequence}</span>
                        <span className="text-slate-300 font-medium">
                          {step.assignee_user_id ? `User ID: ${step.assignee_user_id}` : step.assignee_role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <Link href={`/templates/${tpl.id}`} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 shrink-0 pb-1">
                  Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
