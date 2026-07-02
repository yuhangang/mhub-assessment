'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function InboxPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAgents = async () => {
    try {
      const data = await apiFetch('/agents');
      setAgents(data);
      if (data.length > 0) setSelectedAgentId(data[0].id.toString());
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
  }, []);

  useEffect(() => {
    fetchInbox(selectedAgentId);
  }, [selectedAgentId, agents]);

  const handleAction = async (item: any, action: 'approve' | 'reject') => {
    setErrorMsg('');
    setSuccessMsg('');
    if (action === 'reject' && (!comment || comment.trim() === '')) {
      setErrorMsg('Comments are required for step rejection.');
      return;
    }

    try {
      const path = `/instances/${item.instance_id}/steps/${item.id}/${action}`;
      await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(selectedAgentId),
          comment: comment || undefined
        })
      });

      setSuccessMsg(`Step successfully ${action === 'approve' ? 'approved' : 'rejected'}!`);
      setComment('');
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
        <p className="text-slate-400 mt-1">Simulate agent actions for steps awaiting approval or signature.</p>
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
          value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)}
          className="bg-slate-950 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
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
        <h3 className="text-lg font-semibold mb-4">Pending Approvals</h3>
        
        {loading ? (
          <p className="text-slate-400">Loading inbox items...</p>
        ) : inboxItems.length === 0 ? (
          <p className="text-slate-500 text-sm">No pending approvals for this profile. Try running a process or logging in as another agent.</p>
        ) : (
          <div className="space-y-6">
            {inboxItems.map(item => (
              <div key={item.id} className="bg-slate-950/40 p-6 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Awaiting Decision</span>
                    <span className="text-xs text-slate-500">Instance #{item.instance_id} - Step {item.sequence}</span>
                  </div>
                  <h4 className="text-lg font-bold text-white">{item.template_name}</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 pt-2">
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
                </div>

                {/* Actions Column */}
                <div className="space-y-3 w-full md:w-80">
                  <textarea
                    placeholder="Comment (Mandatory on rejection)..."
                    value={comment} onChange={e => setComment(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(item, 'approve')}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      Approve
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
