'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function InboxPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAgents = async () => {
    try {
      const data = await apiFetch('/agents');
      setAgents(data);
      const saved = localStorage.getItem('simulated_agent_id');
      if (saved && data.some((a: any) => a.id.toString() === saved)) {
        setSelectedAgentId(saved);
      } else if (data.length > 0) {
        setSelectedAgentId(data[0].id.toString());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInbox = async (agentId: string) => {
    if (!agentId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const agent = agents.find(a => a.id.toString() === agentId);
      if (!agent) return;

      // Fetch using both user_id and role
      const data = await apiFetch(`/inbox?user_id=${agent.id}&role=${agent.role}`);
      setInboxItems(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();

    const handleGlobalChange = () => {
      const saved = localStorage.getItem('simulated_agent_id');
      if (saved) {
        setSelectedAgentId(saved);
      }
    };
    window.addEventListener('simulated-agent-changed', handleGlobalChange);
    return () => window.removeEventListener('simulated-agent-changed', handleGlobalChange);
  }, []);

  useEffect(() => {
    fetchInbox(selectedAgentId);
  }, [selectedAgentId, agents]);

  const handleAgentChangeLocally = (val: string) => {
    setSelectedAgentId(val);
    localStorage.setItem('simulated_agent_id', val);
    window.dispatchEvent(new Event('simulated-agent-changed'));
  };

  const handleAction = async (item: any, action: 'approve' | 'reject') => {
    setErrorMsg('');
    setSuccessMsg('');
    if (action === 'reject' && (!comment || comment.trim() === '')) {
      setErrorMsg('Comments are required for step rejection.');
      return;
    }

    // Extract submitted_data for data_entry step types
    let submittedData: any = undefined;
    if (action === 'approve' && item.step_type === 'data_entry') {
      let configObj: any = null;
      try {
        configObj = JSON.parse(item.config || '{}');
      } catch (e) {}

      if (configObj?.fields) {
        const itemData = formData[item.id] || {};
        for (const field of configObj.fields) {
          if (field.required && !itemData[field.name]) {
            setErrorMsg(`Field "${field.label}" is required.`);
            return;
          }
        }
        submittedData = itemData;
      }
    }

    try {
      const path = `/instances/${item.instance_id}/steps/${item.id}/${action}`;
      await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(selectedAgentId),
          comment: comment || undefined,
          submitted_data: submittedData
        })
      });

      setSuccessMsg(`Step successfully ${action === 'approve' ? 'submitted/approved' : 'rejected'}!`);
      setComment('');
      
      // Clear form data for this step
      setFormData(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });

      fetchInbox(selectedAgentId);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const activeAgent = agents.find(a => a.id.toString() === selectedAgentId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Inbox Simulator</h2>
        <p className="text-slate-400 mt-1">Simulate agent actions for steps awaiting approval or data entry.</p>
      </div>

      {/* Profile Simulator Bar */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Simulate Agent Role</span>
          {activeAgent && (
            <p className="text-sm font-medium text-teal-400">
              Active Profile: <span className="text-white font-bold">{activeAgent.name}</span> ({activeAgent.role})
            </p>
          )}
        </div>
        <select
          value={selectedAgentId} onChange={e => handleAgentChangeLocally(e.target.value)}
          className="bg-slate-950 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none cursor-pointer"
        >
          {agents.map(ag => (
            <option key={ag.id} value={ag.id}>{ag.name} ({ag.role})</option>
          ))}
        </select>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-lg text-sm font-medium">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {/* Pending Steps List */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">Pending Approvals / Tasks</h3>
        
        {loading ? (
          <p className="text-slate-400">Loading inbox items...</p>
        ) : inboxItems.length === 0 ? (
          <p className="text-slate-500 text-sm">No pending approvals for this profile. Try running a process or logging in as another agent.</p>
        ) : (
          <div className="space-y-6">
            {inboxItems.map(item => {
              let configObj: any = null;
              if (item.config) {
                try {
                  configObj = JSON.parse(item.config);
                } catch(e) {}
              }

              return (
                <div key={item.id} className="bg-slate-950/40 p-6 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2 flex-1">
                    <div className="flex gap-2 items-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        item.step_type === 'data_entry' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {item.step_type === 'data_entry' ? 'Data Entry Needed' : 'Awaiting Approval'}
                      </span>
                      <span className="text-xs text-slate-500">Instance #{item.instance_id} - Step {item.sequence}</span>
                    </div>
                    <h4 className="text-lg font-bold text-white">{item.template_name}</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 pt-2 pb-2">
                      <p>Entity: <span className="text-slate-300 capitalize">{item.entity_type} ID: {item.entity_id}</span></p>
                      {item.source_entity && (
                        <>
                          <p>Buyer: <span className="text-slate-300">{item.source_entity.buyer_name || 'N/A'}</span></p>
                          <p>Project: <span className="text-slate-300">{item.source_entity.project_name || 'N/A'}</span></p>
                          <p>Unit Number: <span className="text-slate-300">{item.source_entity.unit_number || 'N/A'}</span></p>
                          <p>Price: <span className="text-slate-300">${(item.source_entity.price || 0).toLocaleString()}</span></p>
                        </>
                      )}
                    </div>

                    {/* Dynamic Data Entry Form Fields */}
                    {item.step_type === 'data_entry' && configObj?.fields && (
                      <div className="space-y-3 p-4 bg-slate-900/40 rounded-lg border border-white/5 mt-3 max-w-md">
                        <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">Required Data Entry Fields</span>
                        {configObj.fields.map((field: any) => (
                          <div key={field.name} className="space-y-1">
                            <label className="text-xs text-slate-300 font-medium">{field.label}</label>
                            <input
                              type={field.type === 'number' ? 'number' : 'text'}
                              placeholder={`Enter ${field.label}...`}
                              value={formData[item.id]?.[field.name] || ''}
                              onChange={(e) => {
                                setFormData({
                                  ...formData,
                                  [item.id]: {
                                    ...(formData[item.id] || {}),
                                    [field.name]: e.target.value
                                  }
                                });
                              }}
                              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="space-y-3 w-full md:w-80">
                    <textarea
                      placeholder={item.step_type === 'data_entry' ? "Optional notes/comments..." : "Comment (Mandatory on rejection)..."}
                      value={comment} onChange={e => setComment(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:border-indigo-500 outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(item, 'approve')}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-md"
                      >
                        {item.step_type === 'data_entry' ? 'Submit Data' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleAction(item, 'reject')}
                        className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
