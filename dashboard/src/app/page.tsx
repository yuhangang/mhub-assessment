'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function DashboardOverview() {
  const [instances, setInstances] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, progress: 0, approved: 0, rejected: 0 });
  const [selectedInstance, setSelectedInstance] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/all-instances');
      setInstances(data);
      
      const counts = data.reduce((acc: any, curr: any) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
      }, {});

      setStats({
        total: data.length,
        pending: counts.pending || 0,
        progress: counts.in_progress || 0,
        approved: counts.approved || 0,
        rejected: counts.rejected || 0
      });
      
      // Keep selected instance data updated
      if (selectedInstance) {
        const updated = data.find((i: any) => i.id === selectedInstance.id);
        if (updated) {
          setSelectedInstance(updated);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset the SQLite database to its seed state?')) {
      try {
        await apiFetch('/db/reset', { method: 'POST' });
        setMessage('Database reset completed successfully.');
        setSelectedInstance(null);
        loadData();
        setTimeout(() => setMessage(''), 4000);
      } catch (e: any) {
        alert('Failed to reset: ' + e.message);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h2>
          <p className="text-slate-400 mt-1">Monitor live instance progress and system state.</p>
        </div>
        <button 
          onClick={handleReset}
          className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer"
        >
          Reset Database
        </button>
      </div>

      {message && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-lg text-sm font-medium">
          {message}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Instances', value: stats.total, color: 'border-white/5' },
          { label: 'Pending', value: stats.pending, color: 'border-slate-500/20 text-slate-400' },
          { label: 'In Progress', value: stats.progress, color: 'border-sky-500/20 text-sky-400' },
          { label: 'Approved', value: stats.approved, color: 'border-emerald-500/20 text-emerald-400' },
          { label: 'Rejected', value: stats.rejected, color: 'border-rose-500/20 text-rose-400' },
        ].map((item, idx) => (
          <div key={idx} className={`bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border ${item.color}`}>
            <span className="text-xs text-slate-400 uppercase font-medium">{item.label}</span>
            <p className="text-3xl font-bold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {/* List of Instances & Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Workflow Instances</h3>
            <button onClick={loadData} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer">
              Refresh
            </button>
          </div>
          {loading && instances.length === 0 ? (
            <p className="text-slate-400">Loading instances...</p>
          ) : instances.length === 0 ? (
            <p className="text-slate-400">No active instances. Go to 'Run Process' to trigger one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase font-semibold">
                    <th className="pb-3">ID</th>
                    <th className="pb-3">Template</th>
                    <th className="pb-3">Trigger Event</th>
                    <th className="pb-3">Entity</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {instances.map((inst) => (
                    <tr 
                      key={inst.id} 
                      onClick={() => setSelectedInstance(inst)}
                      className={`hover:bg-indigo-500/5 cursor-pointer transition-colors ${selectedInstance?.id === inst.id ? 'bg-indigo-500/10' : ''}`}
                    >
                      <td className="py-4 font-semibold text-slate-300">#{inst.id}</td>
                      <td className="py-4 text-white font-medium">{inst.template_name}</td>
                      <td className="py-4 text-xs font-mono text-slate-400">{inst.trigger_event}</td>
                      <td className="py-4 text-sm text-slate-300">{inst.entity_type} #{inst.entity_id}</td>
                      <td className="py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          inst.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                          inst.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' :
                          'bg-sky-500/10 text-sky-400'
                        }`}>
                          {inst.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar Inspector */}
        <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-4">Instance Inspector</h3>
          {selectedInstance ? (
            <div className="space-y-6">
              <div>
                <span className="text-xs text-slate-400">Template / Entity</span>
                <h4 className="font-bold text-white text-lg mt-0.5">{selectedInstance.template_name}</h4>
                <p className="text-xs text-slate-400 font-mono mt-1">{selectedInstance.entity_type} (ID: {selectedInstance.entity_id})</p>
              </div>

              {/* Timeline Progress */}
              <div>
                <h5 className="text-sm font-semibold mb-3 text-slate-200">Execution Progress</h5>
                <div className="space-y-4">
                  {selectedInstance.steps?.map((step: any) => (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                          step.status === 'approved' ? 'border-emerald-500 bg-emerald-500 text-white' :
                          step.status === 'rejected' ? 'border-rose-500 bg-rose-500 text-white' :
                          step.status === 'awaiting_action' ? 'border-amber-500 bg-amber-500/10 text-amber-500 animate-pulse' :
                          'border-slate-700 bg-slate-800 text-slate-500'
                        }`}>
                          {step.sequence}
                        </div>
                        <div className="w-0.5 h-6 bg-slate-800 last:hidden mt-1"></div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">Step {step.sequence}</p>
                        <p className="text-xs text-slate-400">
                          Assignee: {step.assignee_user_id ? `User ID ${step.assignee_user_id}` : `Role ${step.assignee_role}`}
                        </p>
                        <span className="text-[10px] uppercase font-bold text-slate-500">{step.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Trail Decisions */}
              <div>
                <h5 className="text-sm font-semibold mb-3 text-slate-200">Decision History</h5>
                {selectedInstance.audit_trail?.length === 0 ? (
                  <p className="text-xs text-slate-500">No decisions taken yet.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedInstance.audit_trail?.map((trail: any) => (
                      <div key={trail.id} className="bg-slate-950/40 p-3 rounded-lg border border-white/5 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-slate-300">{trail.agent_name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            trail.decision === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>{trail.decision}</span>
                        </div>
                        {trail.comment && <p className="text-slate-400 mt-1">"{trail.comment}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Select an instance from the list to view timeline details and decisions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
