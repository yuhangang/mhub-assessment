'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function DashboardOverview() {
  const [instances, setInstances] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'instances' | 'inbox' | 'bookings'>('instances');
  const [stats, setStats] = useState({ total: 0, pending: 0, progress: 0, approved: 0, rejected: 0 });
  const [selectedInstance, setSelectedInstance] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [inboxError, setInboxError] = useState('');
  const [inboxComment, setInboxComment] = useState('');
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch agents first to map active agent and role
      const agentsData = await apiFetch('/agents');
      setAgents(agentsData);

      // Fetch workflow instances
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
      
      if (selectedInstance) {
        const updated = data.find((i: any) => i.id === selectedInstance.id);
        if (updated) {
          setSelectedInstance(updated);
        }
      }

      // Fetch bookings for the quick start tab
      const bookingsData = await apiFetch('/bookings');
      setBookings(bookingsData);

      // Fetch inbox items for active agent
      const savedAgentId = localStorage.getItem('simulated_agent_id');
      const activeAgent = agentsData.find((a: any) => a.id.toString() === savedAgentId) || agentsData[0];
      if (activeAgent) {
        const inboxData = await apiFetch(`/inbox?user_id=${activeAgent.id}&role=${activeAgent.role}`);
        setInboxItems(inboxData);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset the database to its seed state?')) {
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

  const handleQuickTrigger = async (bookingId: string, eventName: string = 'booking.cancellation_requested') => {
    setMessage('');
    try {
      const savedAgentId = localStorage.getItem('simulated_agent_id') || '1';
      
      const res = await apiFetch('/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: eventName,
          entity_type: 'booking',
          entity_id: bookingId,
          initiated_by: parseInt(savedAgentId)
        })
      });

      setMessage(`Workflow instance successfully triggered for booking #${bookingId}!`);
      
      // Reload overview data
      await loadData();
      
      // Auto-select the newly created instance
      if (res.instanceId) {
        const checkInstances = await apiFetch('/all-instances');
        const newInst = checkInstances.find((i: any) => i.id === res.instanceId);
        if (newInst) {
          setSelectedInstance(newInst);
        }
      }
      
      // Switch back to instances tab
      setActiveTab('instances');
      
      setTimeout(() => setMessage(''), 4000);
    } catch (e: any) {
      alert('Failed to trigger workflow: ' + e.message);
    }
  };

  const handleInboxAction = async (item: any, action: 'approve' | 'reject') => {
    setInboxError('');
    setMessage('');
    if (action === 'reject' && (!inboxComment || inboxComment.trim() === '')) {
      setInboxError('Comments are required for step rejection.');
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
            setInboxError(`Field "${field.label}" is required.`);
            return;
          }
        }
        submittedData = itemData;
      }
    }

    try {
      const savedAgentId = localStorage.getItem('simulated_agent_id') || '1';
      const path = `/instances/${item.instance_id}/steps/${item.id}/${action}`;
      await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(savedAgentId),
          comment: inboxComment || undefined,
          submitted_data: submittedData
        })
      });

      setMessage(`Step successfully ${action === 'approve' ? 'submitted/approved' : 'rejected'}!`);
      setInboxComment('');
      
      // Clear form data for this step
      setFormData(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });

      // Reload all overview data (which updates active instances, sidebar details, and inbox count)
      await loadData();
      
      setTimeout(() => setMessage(''), 4000);
    } catch (err: any) {
      setInboxError(err.message);
    }
  };

  useEffect(() => {
    loadData();

    const handleGlobalChange = () => {
      loadData();
    };
    window.addEventListener('simulated-agent-changed', handleGlobalChange);
    return () => window.removeEventListener('simulated-agent-changed', handleGlobalChange);
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
          
          {/* Tab Selector Header */}
          <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-6">
            <div className="flex gap-2">
              <button 
                onClick={() => setActiveTab('instances')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'instances' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Active Workflows
              </button>
              <button 
                onClick={() => setActiveTab('inbox')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'inbox' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>My Inbox</span>
                {inboxItems.length > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4 h-4 flex items-center justify-center">
                    {inboxItems.length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('bookings')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'bookings' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Quick Start
              </button>
            </div>
            
            <button onClick={loadData} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer">
              Refresh
            </button>
          </div>

          {loading && instances.length === 0 ? (
            <p className="text-slate-400">Loading details...</p>
          ) : activeTab === 'instances' ? (
            instances.length === 0 ? (
              <p className="text-slate-400">No active instances. Go to 'Quick Start' to trigger one.</p>
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
            )
          ) : activeTab === 'inbox' ? (
            // Embedded Inbox Simulator Tab
            inboxItems.length === 0 ? (
              <p className="text-slate-500 text-sm">No pending approvals for your simulated profile. Trigger a workflow or switch roleplay agents.</p>
            ) : (
              <div className="space-y-6">
                {inboxError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg text-sm font-medium">
                    {inboxError}
                  </div>
                )}
                {inboxItems.map(item => {
                  let configObj: any = null;
                  if (item.config) {
                    try {
                      configObj = JSON.parse(item.config);
                    } catch(e) {}
                  }

                  return (
                    <div key={item.id} className="bg-slate-950/40 p-5 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2 flex-1">
                        <div className="flex gap-2 items-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            item.step_type === 'data_entry' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {item.step_type === 'data_entry' ? 'Data Entry Needed' : 'Awaiting Approval'}
                          </span>
                          <span className="text-xs text-slate-500">Instance #{item.instance_id} - Step {item.sequence}</span>
                        </div>
                        <h4 className="text-base font-bold text-white">{item.template_name}</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1 pb-1">
                          <p>Entity: <span className="text-slate-300 capitalize">{item.entity_type} ID: {item.entity_id}</span></p>
                          {item.source_entity && (
                            <>
                              <p>Buyer: <span className="text-slate-300">{item.source_entity.buyer_name || 'N/A'}</span></p>
                              <p>Project: <span className="text-slate-300">{item.source_entity.project_name || 'N/A'}</span></p>
                              <p>Unit: <span className="text-slate-300">{item.source_entity.unit_number || 'N/A'}</span></p>
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
                          value={inboxComment} onChange={e => setInboxComment(e.target.value)}
                          rows={2}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:border-indigo-500 outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleInboxAction(item, 'approve')}
                            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-md"
                          >
                            {item.step_type === 'data_entry' ? 'Submit Data' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleInboxAction(item, 'reject')}
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
            )
          ) : (
            // Bookings Quick Trigger Tab
            bookings.length === 0 ? (
              <p className="text-slate-500 text-sm">No bookings found in database.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-400 text-xs uppercase font-semibold">
                      <th className="pb-3">ID</th>
                      <th className="pb-3">Buyer Name</th>
                      <th className="pb-3">Project / Unit</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {bookings.map((bk) => {
                      const hasActiveInstance = instances.some(
                        inst => inst.entity_type === 'booking' && inst.entity_id === bk.id.toString() && ['pending', 'in_progress'].includes(inst.status)
                      );
                      
                      return (
                        <tr key={bk.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-4 font-semibold text-slate-300">#{bk.id}</td>
                          <td className="py-4 text-white font-medium">{bk.buyer_name}</td>
                          <td className="py-4 text-sm text-slate-300">{bk.project_name} - Unit {bk.unit_number}</td>
                          <td className="py-4 text-sm capitalize text-slate-400">{bk.status}</td>
                          <td className="py-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                disabled={hasActiveInstance}
                                onClick={() => handleQuickTrigger(bk.id.toString(), 'booking.cancellation_requested')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                                  hasActiveInstance 
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-white/5'
                                }`}
                              >
                                Standard Cancel
                              </button>
                              <button
                                disabled={hasActiveInstance}
                                onClick={() => handleQuickTrigger(bk.id.toString(), 'booking.cancellation_with_refund')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                                  hasActiveInstance 
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-indigo-500 to-teal-400 text-white hover:opacity-90 shadow-sm'
                                }`}
                              >
                                {hasActiveInstance ? 'Active Workflow' : 'Refund Cancel'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
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
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-semibold text-white">Step {step.sequence}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            step.step_type === 'data_entry' ? 'bg-indigo-500/20 text-indigo-400' :
                            step.step_type === 'automated' ? 'bg-teal-500/20 text-teal-400' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {(step.step_type || 'approval').replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {step.step_type === 'automated'
                            ? 'Assignee: System Check'
                            : `Assignee: ${step.assignee_user_id ? `User ID ${step.assignee_user_id}` : `Role ${step.assignee_role || 'approval'}`}`
                          }
                        </p>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mt-0.5">{step.status}</span>
                        {step.submitted_data && (
                          <div className="bg-slate-950/50 p-2.5 rounded-lg border border-white/5 text-[10px] text-slate-300 mt-2 space-y-1">
                            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider block">Submitted Data</span>
                            {(() => {
                              try {
                                const parsed = JSON.parse(step.submitted_data);
                                return Object.entries(parsed).map(([key, val]: any) => (
                                  <p key={key} className="capitalize">
                                    <span className="text-slate-500">{key.replace('_', ' ')}:</span> <span className="font-semibold text-slate-200">{val}</span>
                                  </p>
                                ));
                              } catch(e) {
                                return <p className="text-rose-400">Error parsing data</p>;
                              }
                            })()}
                          </div>
                        )}
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
