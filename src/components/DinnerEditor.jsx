import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { Button } from './ui.jsx';
import DishPicker from './DishPicker.jsx';

// Shows the dinner(s) logged for a date, or the dish picker to log one.
// Writing a meal event is SHARED household data (including any dinner note).
export default function DinnerEditor({ date, meals, onChanged }) {
  const [picking, setPicking] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [noteText, setNoteText] = useState('');

  const logDish = async (dishId, isRestaurant) => {
    if (editingEventId) {
      await rpc('updateMeal', { event_id: editingEventId, dish_id: dishId, is_restaurant: isRestaurant });
    } else {
      await rpc('logMeal', { date, dish_id: dishId, is_restaurant: isRestaurant });
    }
    setPicking(false);
    setEditingEventId(null);
    onChanged?.();
  };

  const saveNote = async (eventId) => {
    await rpc('updateMeal', { event_id: eventId, note: noteText.trim() || null });
    setNoteFor(null);
    onChanged?.();
  };

  if (picking || meals.length === 0) {
    return (
      <div>
        {meals.length === 0 && !picking && <p className="text-sm text-slate-500 mb-3">No dinner logged yet.</p>}
        <DishPicker
          onPicked={logDish}
          onCancel={meals.length > 0 ? () => { setPicking(false); setEditingEventId(null); } : null}
        />
      </div>
    );
  }

  return (
    <div data-testid="dinner-logged">
      {meals.map((m) => (
        <div key={m.event_id} className="py-2 border-b border-slate-100 last:border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800 text-lg">
                {m.dish_name || 'Unknown dish'}{m.is_restaurant ? ' 🥡' : ''}
              </p>
              {m.note && noteFor !== m.event_id && <p className="text-sm text-slate-500">📝 {m.note}</p>}
              {m.source === 'synced' && <p className="text-xs text-teal-600">synced from partner</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                className="text-sm text-slate-500 px-2 py-1.5"
                onClick={() => { setNoteFor(noteFor === m.event_id ? null : m.event_id); setNoteText(m.note || ''); }}
              >
                Note
              </button>
              <button
                className="text-sm text-teal-700 font-medium px-2 py-1.5"
                onClick={() => { setEditingEventId(m.event_id); setPicking(true); }}
              >
                Change
              </button>
              <button
                className="text-sm text-slate-400 px-2 py-1.5"
                onClick={async () => { await rpc('deleteMeal', { event_id: m.event_id }); onChanged?.(); }}
              >
                Remove
              </button>
            </div>
          </div>
          {noteFor === m.event_id && (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveNote(m.event_id); } }}
                placeholder="Dinner note (shared with household)"
                aria-label="Dinner note"
                data-testid="meal-note-input"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-base"
              />
              <Button variant="subtle" className="!py-2" onClick={() => saveNote(m.event_id)} data-testid="save-meal-note">
                Save
              </Button>
            </div>
          )}
        </div>
      ))}
      <Button variant="subtle" className="mt-3 text-sm !py-2" onClick={() => setPicking(true)}>
        + Add another dinner entry
      </Button>
    </div>
  );
}
