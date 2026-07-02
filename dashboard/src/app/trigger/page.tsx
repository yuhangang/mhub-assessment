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
      
      const saved = localStorage.getItem('simulated_agent_id');
      if (saved && agentsData.some((a: any) => a.id.toString() === saved)) {
        setInitiatedBy(saved);
      } else if (agentsData.length > 0) {
        setInitiatedBy(agentsData[0].id.toString());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    const handleGlobalChange = () => {
      const saved = localStorage.getItem('simulated_agent_id');
      if (saved) {
        setInitiatedBy(saved);
      }
    };
    window.addEventListener('simulated-agent-changed', handleGlobalChange);
    return () => window.removeEventListener('simulated-agent-changed', handleGlobalChange);
  }, []);

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    setTriggerError('');
    if (!selectedBooking) {
      setTriggerError('Please select a booking to trigger the process.');
      return;
    }
    try {
      await apiFetch('/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: selectedEvent,
          entity_type: 'booking',
          entity_id: selectedBooking,
          initiated_by: parseInt(initiatedBy || '1')
        })
      });

      router.push('/');
    } catch (err: any) {
      setTriggerError(err.message);
    }
  };

  const activeAgent = agents.find(a => a.id.toString() === initiatedBy);

  return (
    <div className="max-w-4xl mx-auto bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white">Run Process</h2>
        <p className="text-slate-400 text-sm mt-1">Select a Booking card and choose the event you want to trigger.</p>
      </div>

      {triggerError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg text-sm font-medium">
          {triggerError}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading process options...</p>
      ) : (
        <form onSubmit={handleTrigger} className="space-y-6">
          
          {/* Target Booking Selection Card Grid */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">1. Select Target Booking</label>
            {bookings.length === 0 ? (
              <p className="text-slate-500 text-sm">No bookings available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookings.map(bk => {
                  const isSelected = selectedBooking === bk.id.toString();
                  return (
                    <div 
                      key={bk.id}
                      onClick={() => setSelectedBooking(bk.id.toString())}
                      className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-32 ${
                        isSelected 
                          ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-500/5' 
                          : 'bg-slate-950/40 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`}>Booking #{bk.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          bk.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>{bk.status}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base truncate">{bk.buyer_name}</h4>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{bk.project_name} • Unit {bk.unit_number}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-[10px] text-slate-500">Value</span>
                        <span className="text-xs text-indigo-400 font-semibold">${(bk.price_cents / 100).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end pt-4 border-t border-white/5">
            {/* Trigger Event Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">2. Select Trigger Event</label>
              <select
                value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:border-indigo-500/80 outline-none transition-all cursor-pointer"
              >
                {events.map(ev => (
                  <option key={ev.name} value={ev.name}>{ev.name}</option>
                ))}
              </select>
            </div>

            {/* Read-only Global Roleplay Initiator Status */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Initiator (Active Roleplay)</label>
              <div className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-4 py-3 text-sm text-slate-300 flex items-center justify-between">
                <span>{activeAgent ? activeAgent.name : 'Unknown User'}</span>
                <span className="bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                  {activeAgent ? activeAgent.role.replace('_', ' ') : 'None'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end border-t border-white/5 pt-6">
            <button 
              type="button" onClick={() => router.push('/')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-teal-400 text-white rounded-lg text-sm font-semibold transition-all hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              Start Process
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
