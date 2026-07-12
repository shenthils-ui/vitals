import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { addDays, todayStr } from '../../shared/normalize.js';
import { Card, PrivateBadge, SharedBadge } from '../components/ui.jsx';
import DinnerEditor from '../components/DinnerEditor.jsx';
import CheckinForm from '../components/CheckinForm.jsx';

const MOOD_FACES = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

// Combined per-day view of the shared dinner and this phone's private
// check-in, with backfill for past dates.
export default function History() {
  const today = todayStr();
  const [days, setDays] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [backfillDate, setBackfillDate] = useState('');

  const load = useCallback(async () => {
    setDays(await rpc('getHistory', { from: addDays(today, -90), to: today }));
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const open = useCallback(async (date) => {
    setSelected(date);
    setSelectedDay(await rpc('getDay', { date }));
  }, []);

  const refreshSelected = useCallback(async () => {
    if (selected) setSelectedDay(await rpc('getDay', { date: selected }));
    load();
  }, [selected, load]);

  return (
    <div data-testid="screen-history">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">History</h1>
        <p className="text-slate-500">Last 90 days on this phone</p>
      </header>

      <Card title="Add or edit a past day">
        <div className="flex gap-2">
          <input
            type="date"
            value={backfillDate}
            max={today}
            onChange={(e) => setBackfillDate(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-base"
          />
          <button
            className="px-4 py-2 rounded-xl bg-teal-700 text-white font-medium disabled:opacity-40"
            disabled={!backfillDate}
            onClick={() => open(backfillDate)}
          >
            Open
          </button>
        </div>
      </Card>

      {selected && selectedDay && (
        <div className="mb-4" data-testid="day-editor">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-800">{selected}</h2>
            <button className="text-sm text-slate-500" onClick={() => { setSelected(null); setSelectedDay(null); }}>
              Close
            </button>
          </div>
          <Card title="Dinner" badge={<SharedBadge />}>
            <DinnerEditor date={selected} meals={selectedDay.meals} onChanged={refreshSelected} />
          </Card>
          <Card title="Check-in" badge={<PrivateBadge />}>
            <CheckinForm date={selected} existing={selectedDay.checkin} onSaved={refreshSelected} />
          </Card>
        </div>
      )}

      {days.length === 0 && <p className="text-slate-500 text-sm">Nothing logged yet.</p>}
      {days.map((d) => (
        <button
          key={d.date}
          onClick={() => open(d.date)}
          className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 mb-2"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-800">{d.date}</span>
            <span className="text-xl">{d.checkin ? MOOD_FACES[d.checkin.mood] : ''}</span>
          </div>
          <p className="text-sm text-slate-600">
            {d.meals.length ? `🍲 ${d.meals.map((m) => m.dish_name).join(', ')}` : 'No dinner logged'}
          </p>
          {d.checkin?.symptoms?.length > 0 && (
            <p className="text-sm text-indigo-600">🔒 {d.checkin.symptoms.join(', ')}</p>
          )}
        </button>
      ))}
    </div>
  );
}
