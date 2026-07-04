const state = {
  agents: [],
  bookings: [],
  instances: [],
  templates: [],
  events: [],
  inbox: [],
  activeAgentId: null
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function activeAgent() {
  return state.agents.find((agent) => String(agent.id) === String(state.activeAgentId)) || state.agents[0];
}

function badge(status) {
  return `<span class="status ${String(status).replaceAll(' ', '_')}">${status}</span>`;
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

async function load() {
  const dashboard = await api('/api/dashboard');
  state.agents = dashboard.agents;
  state.bookings = dashboard.bookings;
  state.instances = dashboard.instances;
  state.templates = dashboard.templates;
  state.events = dashboard.events;

  if (!state.activeAgentId && state.agents.length) {
    state.activeAgentId = state.agents[0].id;
  }

  const agent = activeAgent();
  state.inbox = agent
    ? await api(`/api/inbox?user_id=${agent.id}&role=${agent.role}`)
    : [];

  render();
}

function render() {
  renderAgentSelect();
  renderMetrics();
  renderTemplateSettings();
  renderBookings();
  renderInbox();
  renderInstances();
}

function renderTemplateSettings() {
  $('templateEvent').innerHTML = state.events
    .map((event) => `<option value="${event.name}">${event.name}</option>`)
    .join('');

  $('stepTwoUser').innerHTML = state.agents
    .map((agent) => `<option value="${agent.id}">${agent.name} (${agent.role})</option>`)
    .join('');

  $('templateRows').innerHTML = state.templates
    .map((template) => `
      <tr>
	        <td>
	          <strong>${template.name}</strong>
	          <p class="muted">v${template.version || 1} · ${template.description || 'No description'}</p>
	        </td>
        <td>${template.trigger_event}</td>
        <td>${badge(template.is_active ? 'active' : 'inactive')}</td>
        <td>
          <div class="row-actions">
            ${template.is_active
              ? `<button class="secondary" type="button" onclick="setTemplateActive(${template.id}, false)">Deactivate</button>`
              : `<button type="button" onclick="setTemplateActive(${template.id}, true)">Activate</button>`}
            <button class="secondary-danger" type="button" onclick="deleteTemplate(${template.id})">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join('');
}

function renderAgentSelect() {
  const select = $('agentSelect');
  select.innerHTML = state.agents
    .map((agent) => `<option value="${agent.id}">${agent.name} (${agent.role})</option>`)
    .join('');
  select.value = state.activeAgentId || '';
}

function renderMetrics() {
  const counts = state.instances.reduce((acc, instance) => {
    acc[instance.status] = (acc[instance.status] || 0) + 1;
    return acc;
  }, {});
  const metrics = [
    ['Total workflows', state.instances.length],
    ['In progress', counts.in_progress || 0],
    ['Approved', counts.approved || 0],
    ['Rejected', counts.rejected || 0]
  ];
  $('metrics').innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function renderBookings() {
  $('bookingRows').innerHTML = state.bookings
    .map((booking) => {
      const running = state.instances.find(
        (instance) =>
          instance.entity_type === 'booking' &&
          String(instance.entity_id) === String(booking.id) &&
          ['pending', 'in_progress'].includes(instance.status)
      );
      const canTrigger = booking.status === 'active' && !running;
      return `
        <tr>
          <td>#${booking.id}</td>
          <td>${booking.buyer_name}</td>
          <td>${booking.project_name} / ${booking.unit_number}</td>
          <td>${badge(booking.status)}</td>
          <td>
            <button type="button" ${canTrigger ? '' : 'disabled'} onclick="triggerCancellation(${booking.id})">
              Request cancellation
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderInbox() {
  if (!state.inbox.length) {
    $('inboxList').innerHTML = '<p class="empty">No steps waiting for this agent.</p>';
    return;
  }

  $('inboxList').innerHTML = state.inbox
    .map((item) => `
      <article class="inbox-card">
        <header>
          <div>
            <strong>${item.template_name}</strong>
            <p>${item.entity_type} #${item.entity_id} · Step ${item.sequence}</p>
          </div>
          ${badge(item.status)}
        </header>
        <textarea id="comment-${item.id}" placeholder="Comment for approval or rejection"></textarea>
        <div class="actions">
          <button type="button" onclick="approveStep(${item.instance_id}, ${item.id})">Approve</button>
          <button class="danger" type="button" onclick="rejectStep(${item.instance_id}, ${item.id})">Reject</button>
        </div>
      </article>
    `)
    .join('');
}

function renderInstances() {
  $('instanceRows').innerHTML = state.instances
    .map((instance) => {
      const isSelected = String(state.selectedInstanceId) === String(instance.id);
      return `
        <tr onclick="selectInstance(${instance.id})" style="cursor: pointer;" class="${isSelected ? 'selected-row' : ''}">
          <td>#${instance.id}</td>
          <td>${instance.template_name}</td>
          <td>${instance.entity_type} #${instance.entity_id}</td>
          <td>${badge(instance.status)}</td>
          <td>${new Date(instance.created_at).toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');
}

async function selectInstance(id) {
  state.selectedInstanceId = id;
  renderInstances();
  await showInstanceHistory(id);
}

async function showInstanceHistory(id) {
  try {
    const details = await api(`/api/instances/${id}`);
    const historyPanel = $('instanceHistoryPanel');
    const content = $('instanceHistoryContent');

    historyPanel.hidden = false;

    // Render Steps
    const stepsHtml = details.steps && details.steps.length
      ? details.steps.map(step => {
          const assignee = step.assignee_user_id 
            ? `User ID: ${step.assignee_user_id}` 
            : step.assignee_role.replaceAll('_', ' ');
          return `
            <div class="history-step">
              <div class="history-step-header">
                <strong>Step ${step.sequence} · ${assignee}</strong>
                ${badge(step.status)}
              </div>
              <p class="muted">Last updated: ${new Date(step.updated_at).toLocaleString()}</p>
            </div>
          `;
        }).join('')
      : '<p class="empty">No steps configured for this instance.</p>';

    // Render Decisions / Audit Trail
    const decisionsHtml = details.audit_trail && details.audit_trail.length
      ? details.audit_trail.map(trail => {
          const actor = `${trail.actioned_by_name} (${trail.actioned_by_role.replaceAll('_', ' ')})`;
          return `
            <div class="history-decision">
              <div class="history-decision-header">
                <strong>${actor}</strong>
                ${badge(trail.decision)}
              </div>
              ${trail.comment ? `<p class="comment">"${trail.comment}"</p>` : ''}
              <p class="muted">${new Date(trail.actioned_at).toLocaleString()}</p>
            </div>
          `;
        }).join('')
      : '<p class="empty">No decisions actioned yet.</p>';

    content.innerHTML = `
      <div class="history-meta">
        <p><strong>Template:</strong> ${details.template_name}</p>
        <p><strong>Source:</strong> ${details.entity_type} #${details.entity_id}</p>
        <p><strong>Overall Status:</strong> ${badge(details.status)}</p>
      </div>

      <div class="history-section">
        <h3>Execution Steps</h3>
        <div class="stack">${stepsHtml}</div>
      </div>

      <div class="history-section">
        <h3>Decision Log</h3>
        <div class="stack">${decisionsHtml}</div>
      </div>
    `;
  } catch (error) {
    showToast(error.message);
  }
}

function closeInstanceHistory() {
  state.selectedInstanceId = null;
  $('instanceHistoryPanel').hidden = true;
  renderInstances();
}

async function triggerCancellation(bookingId) {
  const agent = activeAgent();
  await api('/api/instances', {
    method: 'POST',
    body: JSON.stringify({
      event_name: 'booking.cancellation_requested',
      entity_type: 'booking',
      entity_id: String(bookingId),
      initiated_by: agent.id
    })
  });
  showToast(`Cancellation workflow started for booking #${bookingId}`);
  await load();
}

async function approveStep(instanceId, stepId) {
  const agent = activeAgent();
  const comment = $(`comment-${stepId}`).value;
  await api(`/api/instances/${instanceId}/steps/${stepId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ user_id: agent.id, comment })
  });
  showToast(`Step #${stepId} approved`);
  await load();
}

async function rejectStep(instanceId, stepId) {
  const agent = activeAgent();
  const comment = $(`comment-${stepId}`).value;
  if (!comment.trim()) {
    showToast('Rejection comment is required');
    return;
  }
  await api(`/api/instances/${instanceId}/steps/${stepId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ user_id: agent.id, comment })
  });
  showToast(`Step #${stepId} rejected`);
  await load();
}

async function createTemplate(event) {
  event.preventDefault();
  const payload = {
    name: $('templateName').value.trim(),
    description: $('templateDescription').value.trim(),
    trigger_event: $('templateEvent').value,
    is_active: $('templateActive').checked,
    steps: [
      { sequence: 1, assignee_role: $('stepOneRole').value },
      { sequence: 2, assignee_user_id: Number($('stepTwoUser').value) }
    ]
  };

  if (!payload.name) {
    showToast('Template name is required');
    return;
  }

  try {
    await api('/api/templates', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    $('templateForm').reset();
    showToast('Template created');
    await load();
  } catch (error) {
    showToast(error.message);
  }
}

async function setTemplateActive(templateId, active) {
  try {
    await api(`/api/templates/${templateId}/${active ? 'activate' : 'deactivate'}`, {
      method: 'POST'
    });
    showToast(active ? 'Template activated' : 'Template deactivated');
    await load();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteTemplate(templateId) {
  if (!confirm('Delete this template from template settings? Existing completed history is preserved.')) {
    return;
  }

  try {
    await api(`/api/templates/${templateId}`, { method: 'DELETE' });
    showToast('Template deleted');
    await load();
  } catch (error) {
    showToast(error.message);
  }
}

function switchTab(tab) {
  if (tab === 'dashboard') {
    $('tabBtnDashboard').classList.add('active');
    $('tabBtnSettings').classList.remove('active');
    $('tabContentDashboard').hidden = false;
    $('tabContentSettings').hidden = true;
  } else if (tab === 'settings') {
    $('tabBtnDashboard').classList.remove('active');
    $('tabBtnSettings').classList.add('active');
    $('tabContentDashboard').hidden = true;
    $('tabContentSettings').hidden = false;
  }
}

$('tabBtnDashboard').addEventListener('click', () => switchTab('dashboard'));
$('tabBtnSettings').addEventListener('click', () => switchTab('settings'));
$('closeHistoryBtn').addEventListener('click', closeInstanceHistory);

$('agentSelect').addEventListener('change', async (event) => {
  state.activeAgentId = event.target.value;
  await load();
});

$('refreshBtn').addEventListener('click', load);
$('templateForm').addEventListener('submit', createTemplate);

load().catch((error) => showToast(error.message));
