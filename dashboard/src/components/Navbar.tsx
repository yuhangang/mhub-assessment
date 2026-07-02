'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const [agents, setAgents] = useState<any[]>([]);
  const [activeAgentId, setActiveAgentId] = useState('');

  const fetchAgents = async () => {
    try {
      const data = await apiFetch('/agents');
      setAgents(data);
      
      const saved = localStorage.getItem('simulated_agent_id');
      if (saved && data.some((a: any) => a.id.toString() === saved)) {
        setActiveAgentId(saved);
      } else if (data.length > 0) {
        const defaultId = data[0].id.toString();
        setActiveAgentId(defaultId);
        localStorage.setItem('simulated_agent_id', defaultId);
      }
    } catch (e) {
      console.error('Navbar error fetching agents:', e);
    }
  };

  useEffect(() => {
    fetchAgents();

    const handleGlobalChange = () => {
      const saved = localStorage.getItem('simulated_agent_id');
      if (saved) {
        setActiveAgentId(saved);
      }
    };

    window.addEventListener('simulated-agent-changed', handleGlobalChange);
    return () => window.removeEventListener('simulated-agent-changed', handleGlobalChange);
  }, []);

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setActiveAgentId(val);
    localStorage.setItem('simulated_agent_id', val);
    window.dispatchEvent(new Event('simulated-agent-changed'));
  };

  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/templates', label: 'Configuration' },
    { href: '/trigger', label: 'Run Process' },
    { href: '/inbox', label: 'Inbox Simulator' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0b0f19]/85 backdrop-blur-md border-b border-white/5 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-teal-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">MH</div>
        <div>
          <h1 className="font-semibold text-lg text-white leading-none">MHub Workflow</h1>
          <span className="text-[10px] text-teal-400 font-medium tracking-widest uppercase">Admin Engine</span>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
        <nav className="flex gap-6 text-sm font-medium text-slate-300">
          {navItems.map(item => (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`transition-colors ${pathname === item.href ? 'text-teal-400 font-bold' : 'hover:text-indigo-400'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        
        {/* Global Roleplay Selector in Navbar */}
        {agents.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-1.5 shadow-inner">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider hidden lg:inline">Roleplay:</span>
            <select
              value={activeAgentId}
              onChange={handleAgentChange}
              className="bg-transparent text-xs text-teal-400 font-semibold focus:outline-none cursor-pointer pr-2"
            >
              {agents.map(ag => (
                <option key={ag.id} value={ag.id} className="bg-[#0b0f19] text-white">
                  {ag.name} ({ag.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </header>
  );
}
