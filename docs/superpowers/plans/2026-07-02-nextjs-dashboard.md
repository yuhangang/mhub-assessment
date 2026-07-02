# Next.js Workflow Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Next.js App Router admin dashboard styled with Tailwind CSS v4 that connects to the Express/SQLite backend to configure versioned templates, trigger new workflow instances, view live database states, and action steps (Approve/Reject) using a simulated inbox.

**Architecture:** A separate Next.js project will run on port `3001` and call the Express backend on port `3000`. The Express backend will be updated to support CORS and expose read/write endpoints for templates, instances, agents, bookings, units, and database resets.

**Tech Stack:** Next.js 15+ (App Router, TypeScript), Tailwind CSS v4, Lucide React, Express, cors, better-sqlite3.

## Global Constraints

- Use Tailwind CSS v4 in Next.js.
- Ensure all CORS configurations allow requests from `http://localhost:3001`.
- Clean up any unused Next.js boilerplates (default images, text, and main page styles).
- Adhere to the Outfits & Inter typography design system.

---

### Task 1: Express Backend CORS & Listing Endpoints

**Files:**
- Modify: `package.json` (add cors dependencies)
- Create: `src/routes/dashboard.ts` (dashboard listing and reset APIs)
- Modify: `src/index.ts` (mount cors and dashboard routes)
- Create: `tests/dashboard.test.ts` (TDD tests for dashboard endpoints)

**Interfaces:**
- Produces: `GET /api/agents`, `GET /api/bookings`, `GET /api/units`, `GET /api/events`, `GET /api/templates`, `GET /api/instances`, `POST /api/db/reset`
- Template responses should include `version` and `previous_template_id`, and instance responses should include pinned `template_version`.

- [ ] **Step 1: Write the failing tests**
  Create `tests/dashboard.test.ts`:
  ```typescript
  import request from 'supertest';
  import app from '../src/index';
  import db from '../src/db/connection';

  describe('Dashboard Helper APIs', () => {
    test('GET /api/agents - retrieves list of agents', async () => {
      const res = await request(app).get('/api/agents');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('role');
    });

    test('POST /api/db/reset - resets database successfully', async () => {
      const res = await request(app).post('/api/db/reset');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Database reset complete' });
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test tests/dashboard.test.ts`
  Expected: FAIL (Cannot find modules or 404/500 errors)

- [ ] **Step 3: Install cors dependency**
  Run: `npm install cors && npm install --save-dev @types/cors`

- [ ] **Step 4: Create backend dashboard routes**
  Create `src/routes/dashboard.ts`:
  ```typescript
  import { Router, Request, Response } from 'express';
  import db from '../db/connection';
  import { runSeed } from '../db/seed';

  const router = Router();

  router.get('/agents', (req: Request, res: Response) => {
    const agents = db.prepare('SELECT id, name, email, role FROM agents').all();
    res.json(agents);
  });

  router.get('/bookings', (req: Request, res: Response) => {
    const bookings = db.prepare(`
      SELECT b.*, u.unit_number, u.price_cents, p.name as project_name
      FROM bookings b
      JOIN units u ON b.unit_id = u.id
      JOIN projects p ON u.project_id = p.id
    `).all();
    res.json(bookings);
  });

  router.get('/units', (req: Request, res: Response) => {
    const units = db.prepare(`
      SELECT u.*, p.name as project_name
      FROM units u
      JOIN projects p ON u.project_id = p.id
    `).all();
    res.json(units);
  });

  router.get('/events', (req: Request, res: Response) => {
    const events = db.prepare('SELECT name, description, is_enabled FROM workflow_events').all();
    res.json(events);
  });

  router.get('/all-templates', (req: Request, res: Response) => {
    const templates = db.prepare('SELECT * FROM workflow_templates ORDER BY trigger_event ASC, version DESC, id DESC').all() as any[];
    const enhancedTemplates = templates.map(t => {
      const steps = db.prepare('SELECT * FROM workflow_template_steps WHERE template_id = ? ORDER BY sequence ASC').all(t.id);
      return { ...t, is_active: Boolean(t.is_active), steps };
    });
    res.json(enhancedTemplates);
  });

  router.get('/all-instances', (req: Request, res: Response) => {
    const instances = db.prepare(`
      SELECT wi.*, wt.name as template_name, wt.trigger_event, wt.version as template_version, a.name as initiator_name
      FROM workflow_instances wi
      JOIN workflow_templates wt ON wi.template_id = wt.id
      JOIN agents a ON wi.initiated_by = a.id
      ORDER BY wi.created_at DESC
    `).all() as any[];

    const enhancedInstances = instances.map(inst => {
      const steps = db.prepare('SELECT * FROM workflow_instance_steps WHERE instance_id = ? ORDER BY sequence ASC').all(inst.id);
      const auditTrail = db.prepare(`
        SELECT wsd.*, a.name as agent_name
        FROM workflow_step_decisions wsd
        JOIN agents a ON wsd.actioned_by = a.id
        WHERE wsd.instance_id = ?
        ORDER BY wsd.actioned_at ASC
      `).all(inst.id);

      return { ...inst, steps, audit_trail: auditTrail };
    });

    res.json(enhancedInstances);
  });

  router.post('/db/reset', (req: Request, res: Response) => {
    try {
      runSeed();
      res.json({ success: true, message: 'Database reset complete' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  export default router;
  ```

- [ ] **Step 5: Configure Index with CORS and mount route**
  In `src/index.ts`, add the import and configure:
  ```typescript
  import cors from 'cors';
  import dashboardRouter from './routes/dashboard';

  app.use(cors({ origin: 'http://localhost:3001' }));
  app.use('/api', dashboardRouter);
  ```

- [ ] **Step 6: Run tests and verify they pass**
  Run: `npm run test`
  Expected: All tests pass, including the original tests.

- [ ] **Step 7: Commit backend changes**
  ```bash
  git add package.json src/index.ts src/routes/dashboard.ts tests/dashboard.test.ts
  git commit -m "feat(backend): add dashboard helper endpoints and CORS configuration"
  ```

---

### Task 2: Scaffold Next.js Application

**Files:**
- Create: `dashboard` directory and new files inside it.

- [ ] **Step 1: Scaffold Next.js App using create-next-app**
  Run from root directory:
  `npx -y create-next-app@latest dashboard --ts --tailwind --app --src-dir --use-npm --eslint --yes`

- [ ] **Step 2: Start backend dev server**
  Run: `npm run dev` (Keep it running in the background)

- [ ] **Step 3: Verify the Next.js app structure**
  Verify that the `dashboard/src/app` directory is initialized.

- [ ] **Step 4: Clean up boilerplate**
  Modify `dashboard/src/app/page.tsx` to be a simple empty page:
  ```tsx
  export default function Home() {
    return <main className="min-h-screen bg-[#0b0f19] text-white">Hello Workflow Dashboard</main>;
  }
  ```
  Remove `dashboard/public/next.svg` and `vercel.svg` if they exist.

- [ ] **Step 5: Verify Next.js can build successfully**
  Run inside `dashboard/` directory:
  `npm run build`
  Expected: Build succeeds.

- [ ] **Step 6: Commit Next.js Scaffolding**
  ```bash
  git add dashboard/
  git commit -m "chore(frontend): scaffold Next.js App Router dashboard project"
  ```

---

### Task 3: Global Theme, API Client & Layout Navigation

**Files:**
- Create: `dashboard/src/lib/api.ts`
- Modify: `dashboard/src/app/globals.css` (custom design tokens)
- Modify: `dashboard/src/app/layout.tsx` (navigation layout, dark-mode styling)
- Modify: `dashboard/src/app/templates/page.tsx` (surface template versions and predecessor links)

- [ ] **Step 1: Define styling design system**
  Add google fonts and import variables in `dashboard/src/app/globals.css`:
  ```css
  @import "tailwindcss";

  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap');

  :root {
    --font-heading: 'Outfit', sans-serif;
    --font-body: 'Inter', sans-serif;
  }

  body {
    background-color: #0b0f19;
    color: #e2e8f0;
    font-family: var(--font-body);
    background-image: 
      radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 40%),
      radial-gradient(circle at 90% 80%, rgba(20, 184, 166, 0.08) 0%, transparent 40%);
    background-attachment: fixed;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
  }
  ```

- [ ] **Step 2: Create API fetch library**
  Create `dashboard/src/lib/api.ts`:
  ```typescript
  const API_BASE = 'http://localhost:3000/api';

  export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Server error');
    }
    return res.json();
  }
  ```

- [ ] **Step 3: Modify Layout for Premium Navigation Header**
  Modify `dashboard/src/app/layout.tsx`:
  ```tsx
  import type { Metadata } from "next";
  import "./globals.css";
  import Link from "next/link";

  export const metadata: Metadata = {
    title: "MHub Workflow Dashboard",
    description: "Manage, configure, and execute workflows",
  };

  export default function RootLayout({
    children,
  }: Readonly<{
    children: React.ReactNode;
  }>) {
    return (
      <html lang="en">
        <body className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-50 bg-[#0b0f19]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-teal-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">MH</div>
              <div>
                <h1 className="font-semibold text-lg text-white leading-none">MHub Workflow</h1>
                <span className="text-[10px] text-teal-400 font-medium tracking-widest uppercase">Admin Engine</span>
              </div>
            </div>
            <nav className="flex gap-6 text-sm font-medium text-slate-300">
              <Link href="/" className="hover:text-indigo-400 transition-colors">Overview</Link>
              <Link href="/templates" className="hover:text-indigo-400 transition-colors">Configuration</Link>
              <Link href="/trigger" className="hover:text-indigo-400 transition-colors">Run Process</Link>
              <Link href="/inbox" className="hover:text-indigo-400 transition-colors">Inbox Simulator</Link>
            </nav>
          </header>
          <main className="flex-1 max-w-7xl w-full mx-auto p-6">
            {children}
          </main>
        </body>
      </html>
    );
  }
  ```

- [ ] **Step 4: Verify layout navigation builds**
  Run: `npm run build` inside `dashboard/`
  Expected: PASS

- [ ] **Step 5: Commit Layout & API**
  ```bash
  git add dashboard/src/lib/api.ts dashboard/src/app/globals.css dashboard/src/app/layout.tsx
  git commit -m "feat(frontend): add styles, layout navigation, and API client"
  ```

---

### Task 4: Main Dashboard Overview Page

**Files:**
- Modify: `dashboard/src/app/page.tsx`

- [ ] **Step 1: Implement Overview with Instance Progress details**
  Rewrite `dashboard/src/app/page.tsx`:
  ```tsx
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
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
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
            <h3 className="text-lg font-semibold mb-4">Workflow Instances</h3>
            {loading ? (
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
  ```

- [ ] **Step 2: Run Dev build inside dashboard to verify**
  Run: `npm run build` in `dashboard`
  Expected: PASS

- [ ] **Step 3: Commit Overview Page**
  ```bash
  git add dashboard/src/app/page.tsx
  git commit -m "feat(frontend): implement dashboard overview page with timeline details"
  ```

---

### Task 5: Workflow Configuration Page

**Files:**
- Create: `dashboard/src/app/templates/page.tsx`
- Create: `dashboard/src/app/templates/new/page.tsx`

- [ ] **Step 1: Implement Template configuration listing page**
  Create `dashboard/src/app/templates/page.tsx`:
  ```tsx
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
                    <h3 className="text-lg font-bold text-white">{tpl.name}</h3>
                    <button
                      onClick={() => handleToggleStatus(tpl.id, tpl.is_active)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
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
                </div>

                <div className="border-t border-white/5 pt-4">
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
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Implement Create Template wizard**
  Create `dashboard/src/app/templates/new/page.tsx`:
  ```tsx
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
        const eventsData = await apiFetch('/events');
        setEvents(eventsData);
        if (eventsData.length > 0) setTriggerEvent(eventsData[0].name);

        const agentsData = await apiFetch('/agents');
        setAgents(agentsData);
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
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
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
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                      >
                        <option value="role">Assign to Role</option>
                        <option value="user">Assign to User</option>
                      </select>

                      {step.assigneeType === 'role' ? (
                        <select
                          value={step.assignee_role} onChange={e => handleStepChange(idx, 'assignee_role', e.target.value)}
                          className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                        >
                          <option value="sales_manager">Sales Manager</option>
                          <option value="finance_manager">Finance Manager</option>
                          <option value="sales_coordinator">Sales Coordinator</option>
                        </select>
                      ) : (
                        <select
                          value={step.assignee_user_id || ''} onChange={e => handleStepChange(idx, 'assignee_user_id', e.target.value)}
                          className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
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
                      className="text-xs font-semibold text-rose-400 hover:text-rose-300"
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
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold"
            >
              Save Template
            </button>
          </div>
        </form>
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify build**
  Run: `npm run build` in `dashboard`
  Expected: PASS

- [ ] **Step 4: Commit Templates pages**
  ```bash
  git add dashboard/src/app/templates/
  git commit -m "feat(frontend): implement template configuration lists and template creation wizard"
  ```

---

### Task 6: Run Sample Process Page

**Files:**
- Create: `dashboard/src/app/trigger/page.tsx`

- [ ] **Step 1: Implement Live triggering interface**
  Create `dashboard/src/app/trigger/page.tsx`:
  ```tsx
  'use client';
  import { useState, useEffect } from 'react';
  import { apiFetch } from '@/lib/api';
  import { useRouter } from 'next/navigation';

  export default function TriggerWorkflowPage() {
    const router = useRouter();
    const [bookings, setBookings] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [agents, setAgents] = useState<any[]>([]);

    const [selectedBooking, setSelectedBooking] = useState('');
    const [selectedEvent, setSelectedEvent] = useState('');
    const [initiatedBy, setInitiatedBy] = useState('');
    const [loading, setLoading] = useState(true);
    const [triggerError, setTriggerError] = useState('');

    useEffect(() => {
      const loadOptions = async () => {
        try {
          const bookingsData = await apiFetch('/bookings');
          setBookings(bookingsData);
          if (bookingsData.length > 0) setSelectedBooking(bookingsData[0].id.toString());

          const eventsData = await apiFetch('/events');
          setEvents(eventsData);
          if (eventsData.length > 0) setSelectedEvent(eventsData[0].name);

          const agentsData = await apiFetch('/agents');
          setAgents(agentsData);
          if (agentsData.length > 0) setInitiatedBy(agentsData[0].id.toString());
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      loadOptions();
    }, []);

    const handleTrigger = async (e: React.FormEvent) => {
      e.preventDefault();
      setTriggerError('');
      try {
        await apiFetch('/instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: selectedEvent,
            entity_type: 'booking',
            entity_id: selectedBooking,
            initiated_by: parseInt(initiatedBy)
          })
        });

        router.push('/');
      } catch (err: any) {
        setTriggerError(err.message);
      }
    };

    return (
      <div className="max-w-2xl mx-auto bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Trigger Workflow Instance</h2>
          <p className="text-slate-400 text-sm mt-1">Select an active Booking and trigger a configured event.</p>
        </div>

        {triggerError && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg text-sm font-medium">
            {triggerError}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading trigger options...</p>
        ) : (
          <form onSubmit={handleTrigger} className="space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Booking (Entity)</label>
              <select
                value={selectedBooking} onChange={e => setSelectedBooking(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
              >
                {bookings.map(bk => (
                  <option key={bk.id} value={bk.id}>
                    Booking #{bk.id} - Buyer: {bk.buyer_name} ({bk.project_name} {bk.unit_number}) - Status: {bk.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trigger Event</label>
              <select
                value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
              >
                {events.map(ev => (
                  <option key={ev.name} value={ev.name}>{ev.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Initiated By (Agent)</label>
              <select
                value={initiatedBy} onChange={e => setInitiatedBy(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500/80 outline-none transition-all"
              >
                {agents.map(ag => (
                  <option key={ag.id} value={ag.id}>{ag.name} ({ag.role})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end border-t border-white/5 pt-4">
              <button 
                type="button" onClick={() => router.push('/')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-teal-400 text-white rounded-lg text-sm font-semibold transition-all hover:opacity-90 flex items-center gap-1.5"
              >
                Trigger Now
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify build**
  Run: `npm run build` in `dashboard`
  Expected: PASS

- [ ] **Step 3: Commit Trigger page**
  ```bash
  git add dashboard/src/app/trigger/page.tsx
  git commit -m "feat(frontend): implement run process / workflow triggering interface"
  ```

---

### Task 7: Inbox Actions Page

**Files:**
- Create: `dashboard/src/app/inbox/page.tsx`

- [ ] **Step 1: Implement Inbox actions simulation**
  Create `dashboard/src/app/inbox/page.tsx`:
  ```tsx
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
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(item, 'reject')}
                        className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all"
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
  ```

- [ ] **Step 2: Verify build**
  Run: `npm run build` in `dashboard`
  Expected: PASS

- [ ] **Step 3: Commit Inbox page**
  ```bash
  git add dashboard/src/app/inbox/page.tsx
  git commit -m "feat(frontend): implement inbox simulated actions interface"
  ```
