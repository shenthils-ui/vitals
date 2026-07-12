import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { Button } from './ui.jsx';
import DishPicker from './DishPicker.jsx';

// Shows the dinner(s) logged for a date, or the dish picker to log one.
// Writing a meal event is SHARED household data.
export default function DinnerEditor({ date, meals, onChanged }) {
  const [picking, setPicking] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);

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
        <div key={m.event_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
          <div>
            <p className="font-medium text-slate-800 text-lg">
              {m.dish_name || 'Unknown dish'}{m.is_restaurant ? ' 🥡' : ''}
            </p>
            {m.note && <p className="text-sm text-slate-500">{m.note}</p>}
            {m.source === 'synced' && <p className="text-xs text-teal-600">synced from partner</p>}
          </div>
          <div className="flex gap-2">
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
      ))}
      <Button variant="subtle" className="mt-3 text-sm !py-2" onClick={() => setPicking(true)}>
        + Add another dinner entry
      </Button>
    </div>
  );
}
