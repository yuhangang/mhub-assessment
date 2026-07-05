'use client';

import React, { useState } from 'react';

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface WorkflowInstance {
  id: number;
  template_id: number;
  template_name?: string;
  trigger_event: string;
  entity_type: string;
  entity_id: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  initiated_by: number;
  created_at: string;
}

interface InboxItem {
  id: number;
  instance_id: number;
  sequence: number;
  group_sequence: number;
  status: string;
  template_name: string;
  entity_type: string;
  entity_id: string;
  assignee_user_id?: number;
  assignee_role?: string;
}

interface InstanceStep {
  id: number;
  sequence: number;
  group_sequence: number;
  status: string;
  assignee_user_id?: number;
  assignee_role?: string;
  approval_policy: string;
}

interface AuditTrailItem {
  id: number;
  actioned_by_name: string;
  actioned_by_role: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  actioned_at: string;
}

interface InstanceDetails {
  id: number;
  status: string;
  template_name: string;
  entity_type: string;
  entity_id: string;
  steps: InstanceStep[];
  audit_trail: AuditTrailItem[];
}

interface DashboardTabProps {
  instances: WorkflowInstance[];
  inbox: InboxItem[];
  agents: Agent[];
  selectedInstanceId: number | null;
  selectedInstanceDetails: InstanceDetails | null;
  onSelectInstance: (id: number) => void;
  onCloseDetails: () => void;
  onApproveStep: (instanceId: number, stepId: number, comment: string) => Promise<void>;
  onRejectStep: (instanceId: number, stepId: number, comment: string) => Promise<void>;
}

export default function DashboardTab({
  instances,
  inbox,
  agents,
  selectedInstanceId,
  selectedInstanceDetails,
  onSelectInstance,
  onCloseDetails,
  onApproveStep,
  onRejectStep,
}: DashboardTabProps) {
  const [comments, setComments] = useState<Record<number, string>>({});

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

  const getBadgeClass = (status: string) => {
    return `status ${status}`;
  };

  const getStepNumberStyle = (status: string) => {
    switch (status) {
      case 'approved':
        return { background: 'var(--success, #059669)' };
      case 'awaiting_action':
        return { background: 'var(--warning, #d97706)' };
      case 'rejected':
      case 'cancelled':
        return { background: 'var(--danger, #dc2626)' };
      default:
        return { background: 'var(--muted, #94a3b8)' };
    }
  };

  const formatStatus = (status: string) => {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'awaiting_action') return 'Awaiting Action';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const assigneeLabel = (step: { assignee_user_id?: number; assignee_role?: string }) => {
    if (step.assignee_user_id) {
      const user = agents.find((u) => String(u.id) === String(step.assignee_user_id));
      return user ? `${user.name} (${roleLabel(user.role)})` : `User ID: ${step.assignee_user_id}`;
    }
    return roleLabel(step.assignee_role || '');
  };

  // Compute metrics
  const counts = instances.reduce((acc, inst) => {
    acc[inst.status] = (acc[inst.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const metrics = [
    { label: 'Total workflows', value: instances.length },
    { label: 'In progress', value: counts.in_progress || 0 },
    { label: 'Approved', value: counts.approved || 0 },
    { label: 'Rejected', value: counts.rejected || 0 },
  ];

  return (
    <div>
      {/* Metrics */}
      <section className="metrics">
        {metrics.map((m, idx) => (
          <div className="metric" key={idx}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </section>

      {/* Approver Inbox */}
      <section className="panel">
        <div className="panel-heading">
          <h2>Approver Inbox</h2>
        </div>
        <div id="inboxList" className="stack">
          {inbox.length === 0 ? (
            <p className="empty">Your inbox is clean. No approvals pending.</p>
          ) : (
            inbox.map((item) => (
              <div className="inbox-item-card" key={item.id}>
                <div className="inbox-item-header">
                  <div className="inbox-item-title">{item.template_name}</div>
                  <span className="status awaiting_action">Awaiting Action</span>
                </div>
                <div className="inbox-item-body">
                  <span>
                    Source: {item.entity_type} #{item.entity_id}
                  </span>
                  <span className="dot">·</span>
                  <span>Step {item.sequence} (Group {item.group_sequence})</span>
                </div>
                <div className="inbox-item-actions">
                  <textarea
                    placeholder="Comment for approval or rejection"
                    value={comments[item.id] || ''}
                    onChange={(e) =>
                      setComments({ ...comments, [item.id]: e.target.value })
                    }
                  />
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() =>
                        onApproveStep(item.instance_id, item.id, comments[item.id] || '')
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        onRejectStep(item.instance_id, item.id, comments[item.id] || '')
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Grid: Log and Details */}
      <section className="grid" style={{ marginTop: '16px' }}>
        {/* Approval Progress Log */}
        <div className="panel">
          <div className="panel-heading">
            <h2>Approval Progress Log</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Template</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => {
                  const isSelected = selectedInstanceId === inst.id;
                  return (
                    <tr
                      key={inst.id}
                      onClick={() => onSelectInstance(inst.id)}
                      className={isSelected ? 'selected' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>#{inst.id}</td>
                      <td>{inst.template_name || `Template ID: ${inst.template_id}`}</td>
                      <td>
                        {inst.entity_type} #{inst.entity_id}
                      </td>
                      <td>
                        <span className={getBadgeClass(inst.status)}>
                          {formatStatus(inst.status)}
                        </span>
                      </td>
                      <td>{new Date(inst.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Approval Progress Details */}
        {selectedInstanceId && selectedInstanceDetails && (
          <div className="panel" id="instanceHistoryPanel">
            <div className="panel-heading">
              <h2>Approval Progress Details</h2>
            </div>
            <div>
              <div className="detail-meta-card">
                <div>
                  <strong>Template:</strong> {selectedInstanceDetails.template_name}
                </div>
                <div>
                  <strong>Source:</strong> {selectedInstanceDetails.entity_type} #{selectedInstanceDetails.entity_id}
                </div>
                <div>
                  <strong>Overall Status:</strong>{' '}
                  <span className={getBadgeClass(selectedInstanceDetails.status)}>
                    {formatStatus(selectedInstanceDetails.status)}
                  </span>
                </div>
              </div>

              {/* Steps visual flow */}
              <div style={{ marginTop: '20px' }}>
                <h3 className="section-title">Execution Steps</h3>
                <div className="pipeline-flow instance-pipeline">
                  {(() => {
                    const groups: Record<number, InstanceStep[]> = {};
                    selectedInstanceDetails.steps.forEach((step) => {
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
                            {stepsInGroup.map((step) => (
                              <div className="pipeline-step" key={step.id}>
                                <span
                                  className="pipeline-step-number"
                                  style={getStepNumberStyle(step.status)}
                                >
                                  {step.sequence}
                                </span>
                                <span className="pipeline-step-label">{assigneeLabel(step)}</span>
                                <span className={`${getBadgeClass(step.status)} pipeline-step-status`}>
                                  {formatStatus(step.status)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {idx < sortedKeys.length - 1 && <div className="pipeline-connector"></div>}
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Decision Log */}
              <div style={{ marginTop: '20px' }}>
                <h3 className="section-title">Decision History</h3>
                {!selectedInstanceDetails.audit_trail || selectedInstanceDetails.audit_trail.length === 0 ? (
                  <p className="empty">No decisions logged yet.</p>
                ) : (
                  <div className="stack">
                    {selectedInstanceDetails.audit_trail.map((dec) => (
                      <div className="history-decision" key={dec.id}>
                        <div className="history-decision-header">
                          <span>
                            <strong>{dec.actioned_by_name}</strong>{' '}
                            <span style={{ color: 'var(--muted)', marginLeft: '4px' }}>
                              ({roleLabel(dec.actioned_by_role)})
                            </span>
                          </span>
                          <span className={getBadgeClass(dec.decision)}>
                            {formatStatus(dec.decision)}
                          </span>
                        </div>
                        {dec.comment && (
                          <div className="comment">"{dec.comment}"</div>
                        )}
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                          {new Date(dec.actioned_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
