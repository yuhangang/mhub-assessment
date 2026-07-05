'use client';

import React, { useState, useEffect } from 'react';
import DashboardTab from '../components/DashboardTab';
import BookingsTab from '../components/BookingsTab';
import SettingsTab from '../components/SettingsTab';
import EventTab from '../components/EventTab';
import TriggerTab from '../components/TriggerTab';
import { ADMIN_TABS, AdminTabId } from '../utils/admin';

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [toasts, setToasts] = useState<Toast[]>([]);

  // DB States
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('');

  // Selected details
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [selectedInstanceDetails, setSelectedInstanceDetails] = useState<any | null>(null);

  // Template details cache & expanded
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);
  const [templateDetailCache, setTemplateDetailCache] = useState<Record<number, any>>({});
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  };

  // API utility
  const api = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'API Error');
    }
    return data;
  };

  const activeAgent = () => {
    return agents.find((a) => String(a.id) === String(activeAgentId)) || null;
  };

  // Main data loader
  const load = async () => {
    try {
      const dashboard = await api('/api/dashboard');
      setAgents(dashboard.agents);
      setBookings(dashboard.bookings);
      setInstances(dashboard.instances);
      setTemplates(dashboard.templates);
      setEvents(dashboard.events);

      let currentAgentId = activeAgentId;
      if (!currentAgentId && dashboard.agents.length) {
        currentAgentId = String(dashboard.agents[0].id);
        setActiveAgentId(currentAgentId);
      }

      const agent = dashboard.agents.find((a: any) => String(a.id) === String(currentAgentId));
      if (agent) {
        const inboxData = await api(`/api/inbox?user_id=${agent.id}&role=${agent.role}`);
        setInbox(inboxData);
      } else {
        setInbox([]);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Load state on mount & periodic polling
  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [activeAgentId]);

  // Load workflow instance history details
  const loadInstanceHistory = async (id: number) => {
    try {
      const details = await api(`/api/instances/${id}`);
      setSelectedInstanceDetails(details);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Auto-selection of the first instance in Dashboard progress log
  useEffect(() => {
    if (instances.length > 0) {
      const stillExists = instances.some((inst) => String(inst.id) === String(selectedInstanceId));
      if (!stillExists) {
        const firstId = instances[0].id;
        setSelectedInstanceId(firstId);
        loadInstanceHistory(firstId);
      } else if (selectedInstanceId) {
        loadInstanceHistory(selectedInstanceId);
      }
    } else {
      setSelectedInstanceId(null);
      setSelectedInstanceDetails(null);
    }
  }, [instances]);

  // Select instance manual click handler
  const handleSelectInstance = (id: number) => {
    setSelectedInstanceId(id);
    loadInstanceHistory(id);
  };

  const handleCloseDetails = () => {
    setSelectedInstanceId(null);
    setSelectedInstanceDetails(null);
  };

  // Triggers
  const triggerConfirmation = async (bookingId: number) => {
    const agent = activeAgent();
    if (!agent) return;
    try {
      await api('/api/instances', {
        method: 'POST',
        body: JSON.stringify({
          event_name: 'booking.confirmed',
          entity_type: 'booking',
          entity_id: String(bookingId),
          initiated_by: agent.id,
        }),
      });
      showToast(`Confirmation workflow started for booking #${bookingId}`, 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const triggerCancellation = async (bookingId: number) => {
    const agent = activeAgent();
    if (!agent) return;
    try {
      await api('/api/instances', {
        method: 'POST',
        body: JSON.stringify({
          event_name: 'booking.cancellation_requested',
          entity_type: 'booking',
          entity_id: String(bookingId),
          initiated_by: agent.id,
        }),
      });
      showToast(`Cancellation workflow started for booking #${bookingId}`, 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleTriggerWorkflow = async (payload: {
    event_name: string;
    entity_type: string;
    entity_id: string;
    initiated_by: number;
  }) => {
    try {
      await api('/api/instances', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast(`Workflow started for ${payload.entity_type} #${payload.entity_id}`, 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  // Steps Action approvals
  const handleApproveStep = async (instanceId: number, stepId: number, comment: string) => {
    const agent = activeAgent();
    if (!agent) return;
    try {
      await api(`/api/instances/${instanceId}/steps/${stepId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ user_id: agent.id, comment }),
      });
      showToast(`Step approved`, 'success');
      await load();
      if (selectedInstanceId === instanceId) {
        await loadInstanceHistory(instanceId);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRejectStep = async (instanceId: number, stepId: number, comment: string) => {
    const agent = activeAgent();
    if (!agent) return;
    try {
      await api(`/api/instances/${instanceId}/steps/${stepId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ user_id: agent.id, comment }),
      });
      showToast(`Step rejected`, 'success');
      await load();
      if (selectedInstanceId === instanceId) {
        await loadInstanceHistory(instanceId);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Toggle Template Details Expand / Edit signal
  const handleToggleTemplateDetail = async (id: number) => {
    if (id === -1) {
      // cancel edit signal
      setEditingTemplateId(null);
      return;
    }

    if (id > 100000) {
      // Toggle edit template signal
      const realId = id - 100000;
      setEditingTemplateId(realId);
      if (!templateDetailCache[realId]) {
        try {
          const detail = await api(`/api/templates/${realId}`);
          setTemplateDetailCache((prev) => ({ ...prev, [realId]: detail }));
        } catch (err: any) {
          showToast(err.message, 'error');
        }
      }
      return;
    }

    if (expandedTemplateId === id) {
      setExpandedTemplateId(null);
      return;
    }

    setExpandedTemplateId(id);
    if (!templateDetailCache[id]) {
      try {
        const detail = await api(`/api/templates/${id}`);
        setTemplateDetailCache((prev) => ({ ...prev, [id]: detail }));
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    }
  };

  const handleSetTemplateActive = async (id: number, active: boolean) => {
    try {
      await api(`/api/templates/${id}/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
      });
      setTemplateDetailCache({});
      showToast(active ? 'Template activated' : 'Template deactivated', 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Delete this template? Existing completed history is preserved.')) {
      return;
    }
    try {
      await api(`/api/templates/${id}`, { method: 'DELETE' });
      setTemplateDetailCache((prev) => {
        const c = { ...prev };
        delete c[id];
        return c;
      });
      if (expandedTemplateId === id) {
        setExpandedTemplateId(null);
      }
      if (editingTemplateId === id) {
        setEditingTemplateId(null);
      }
      showToast('Template deleted', 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateTemplate = async (payload: any) => {
    try {
      await api('/api/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Template created successfully', 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleCreateEvent = async (payload: any) => {
    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Workflow event added', 'success');
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handlePatchTemplate = async (id: number, payload: any) => {
    try {
      await api(`/api/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      showToast('Template updated successfully (new version created)', 'success');
      setEditingTemplateId(null);
      await load();
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  return (
    <main className="shell">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.type} visible`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>

      <header className="topbar">
        <div>
          <h1>Workflow Admin</h1>
          <p>Manage approval workflows, templates, and approval actions.</p>
        </div>
        <label className="agent-picker">
          Acting as
          <select
            value={activeAgentId}
            onChange={(e) => setActiveAgentId(e.target.value)}
          >
            {agents.map((agent) => (
              <option value={agent.id} key={agent.id}>
                {agent.name} ({agent.role.replace('_', ' ')})
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="tab-nav">
        {ADMIN_TABS.map((tab) => (
          <button
            type="button"
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            key={tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'dashboard' && (
        <DashboardTab
          instances={instances}
          inbox={inbox}
          agents={agents}
          selectedInstanceId={selectedInstanceId}
          selectedInstanceDetails={selectedInstanceDetails}
          onSelectInstance={handleSelectInstance}
          onCloseDetails={handleCloseDetails}
          onApproveStep={handleApproveStep}
          onRejectStep={handleRejectStep}
        />
      )}

      {activeTab === 'bookings' && (
        <BookingsTab
          bookings={bookings}
          instances={instances}
          activeAgent={activeAgent()}
          triggerConfirmation={triggerConfirmation}
          triggerCancellation={triggerCancellation}
        />
      )}

      {activeTab === 'trigger' && (
        <TriggerTab
          events={events}
          templates={templates}
          activeAgent={activeAgent()}
          onTriggerWorkflow={handleTriggerWorkflow}
        />
      )}

      {activeTab === 'templates' && (
        <SettingsTab
          templates={templates}
          events={events}
          instances={instances}
          agents={agents}
          expandedTemplateId={expandedTemplateId}
          templateDetailCache={templateDetailCache}
          editingTemplateId={editingTemplateId}
          onToggleTemplateDetail={handleToggleTemplateDetail}
          onSetTemplateActive={handleSetTemplateActive}
          onDeleteTemplate={handleDeleteTemplate}
          onCreateTemplate={handleCreateTemplate}
          onPatchTemplate={handlePatchTemplate}
        />
      )}

      {activeTab === 'events' && (
        <EventTab
          events={events}
          onCreateEvent={handleCreateEvent}
        />
      )}
    </main>
  );
}
