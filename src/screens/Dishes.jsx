import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';

export default function Dishes() {
  const [q, setQ] = useState('');
  const [dishes, setDishes] = useState([]);

  useEffect(() => {
    let live = true;
    rpc('listDishes', { q }).then((d) => { if (live) setDishes(d); });
    return () => { live = false; };
  }, [q]);

  return (
    <div data-testid="screen-dishes">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Dishes</h1>
        <p className="text-slate-500">Shared catalog — tagged once, reused</p>
      </header>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search dishes…"
        className="w-full px-3 py-3 rounded-xl border border-slate-300 mb-4 text-base"
      />
      {dishes.map((d) => (
        <Link
          key={d.dish_id}
          to={`/dishes/${encodeURIComponent(d.dish_id)}`}
          className="block bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 mb-2"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-800">{d.name}{d.is_restaurant ? ' 🥡' : ''}</span>
            <span className="text-xs text-slate-400">{d.use_count ? `logged ×${d.use_count}` : 'never logged'}</span>
          </div>
          <p className="text-sm text-slate-500">
            {d.ingredients.length ? d.ingredients.map((i) => i.ingredient_name).join(', ') : 'No ingredients tagged yet'}
          </p>
        </Link>
      ))}
      {dishes.length === 0 && <p className="text-slate-500 text-sm">No dishes match.</p>}
      <p className="text-sm text-slate-400 mt-3">To add a dish, use “New dish” while logging a dinner on Today.</p>
    </div>
  );
}
