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
        if (agentsData.length > 0) {
          const saved = localStorage.getItem('simulated_agent_id');
          if (saved && agentsData.some((a: any) => a.id.toString() === saved)) {
            setInitiatedBy(saved);
          } else {
            setInitiatedBy(agentsData[0].id.toString());
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
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
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-teal-400 text-white rounded-lg text-sm font-semibold transition-all hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
            >
              Trigger Now
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
