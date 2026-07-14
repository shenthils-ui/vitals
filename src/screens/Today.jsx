import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { todayStr } from '../../shared/normalize.js';
import { useApp } from '../App.jsx';
import { Card, PrivateBadge, SharedBadge } from '../components/ui.jsx';
import DinnerEditor from '../components/DinnerEditor.jsx';
import CheckinForm from '../components/CheckinForm.jsx';
import ShareSync from '../components/ShareSync.jsx';

export default function Today() {
  const { state } = useApp();
  const [date, setDate] = useState(todayStr());
  const [day, setDay] = useState(null);
  const [peers, setPeers] = useState([]);

  // Roll over to the new day if the app stays open past midnight or is
  // brought back from the background on the next morning.
  useEffect(() => {
    const check = () => setDate(todayStr());
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    return () => { document.removeEventListener('visibilitychange', check); clearInterval(timer); };
  }, []);

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([rpc('getDay', { date }), rpc('getPeers')]);
    setDay(d);
    setPeers(p);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const prettyDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div data-testid="screen-today">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Today</h1>
        <p className="text-slate-500">{prettyDate} · {state.person_name}</p>
      </header>

      <Card title="Dinner" badge={<SharedBadge />}>
        {day && <DinnerEditor date={date} meals={day.meals} onChanged={load} />}
      </Card>

      <Card title="Check-in" badge={<PrivateBadge />}>
        {day && <CheckinForm date={date} existing={day.checkin} onSaved={load} />}
      </Card>

      <Card title="Sync with your partner">
        <ShareSync />
        <div className="mt-3 text-sm text-slate-500" data-testid="peer-footer">
          {peers.length === 0
            ? 'No exchanges yet — share a sync bundle to get started.'
            : peers.map((p) => {
              const days = p.last_exchange_at
                ? Math.max(0, Math.floor((Date.now() - new Date(p.last_exchange_at).getTime()) / 86400000))
                : null;
              return (
                <p key={p.device_id}>
                  Last exchange with {p.name || 'partner'}: {days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`}
                </p>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
