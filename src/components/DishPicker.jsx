import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Button, Chip } from './ui.jsx';

// Type-ahead over the dish catalog with recent dishes as quick chips, an
// inline "New dish" flow (name + main ingredients), and a restaurant toggle.
export default function DishPicker({ onPicked, onCancel }) {
  const { state } = useApp();
  const [q, setQ] = useState('');
  const [dishes, setDishes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [isRestaurant, setIsRestaurant] = useState(false);
  const [newName, setNewName] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [ingInput, setIngInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    rpc('listDishes', { q }).then((d) => { if (live) setDishes(d); });
    return () => { live = false; };
  }, [q]);

  const pick = async (dish) => {
    if (busy) return;
    setBusy(true);
    try { await onPicked(dish.dish_id, isRestaurant || !!dish.is_restaurant); }
    finally { setBusy(false); }
  };

  const addIngredient = (name) => {
    const t = String(name).trim();
    if (!t || ingredients.includes(t)) return;
    setIngredients([...ingredients, t]);
    setIngInput('');
  };

  const createAndPick = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const dish = await rpc('createDish', { name: newName, is_restaurant: isRestaurant, ingredients });
      await onPicked(dish.dish_id, isRestaurant);
    } finally { setBusy(false); }
  };

  if (creating) {
    return (
      <div data-testid="new-dish-form">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Dish name"
          className="w-full px-3 py-3 rounded-xl border border-slate-300 mb-3 text-base"
        />
        <p className="text-sm text-slate-600 mb-2">Main ingredients (tagged once, reused):</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {ingredients.map((ing) => (
            <Chip key={ing} active onClick={() => setIngredients(ingredients.filter((i) => i !== ing))}>
              {ing} ✕
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            value={ingInput}
            onChange={(e) => setIngInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(ingInput); } }}
            placeholder="Add ingredient"
            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-base"
          />
          <Button type="button" variant="subtle" onClick={() => addIngredient(ingInput)}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(state.common_ingredients || []).filter((s) => !ingredients.includes(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addIngredient(s)}
              className="px-2.5 py-1.5 rounded-full text-xs bg-slate-100 text-slate-600"
            >
              + {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 mb-4 text-slate-700 text-sm">
          <input type="checkbox" checked={isRestaurant} onChange={(e) => setIsRestaurant(e.target.checked)} className="w-5 h-5" />
          Restaurant / takeaway
        </label>
        <div className="flex gap-2">
          <Button onClick={createAndPick} disabled={!newName.trim() || busy} data-testid="save-new-dish">
            Save & log dinner
          </Button>
          <Button variant="subtle" onClick={() => setCreating(false)}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dish-picker">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search dishes…"
        data-testid="dish-search"
        className="w-full px-3 py-3 rounded-xl border border-slate-300 mb-3 text-base"
      />
      <div className="flex flex-wrap gap-2 mb-3">
        {dishes.slice(0, 8).map((d) => (
          <Chip key={d.dish_id} onClick={() => pick(d)}>
            {d.name}{d.is_restaurant ? ' 🥡' : ''}
          </Chip>
        ))}
        {dishes.length === 0 && <p className="text-sm text-slate-500">No matching dishes.</p>}
      </div>
      <label className="flex items-center gap-2 mb-3 text-slate-700 text-sm">
        <input type="checkbox" checked={isRestaurant} onChange={(e) => setIsRestaurant(e.target.checked)} className="w-5 h-5" />
        Restaurant / takeaway
      </label>
      <div className="flex gap-2">
        <Button variant="subtle" onClick={() => { setCreating(true); setNewName(q); }} data-testid="new-dish-button">
          + New dish
        </Button>
        {onCancel && <Button variant="subtle" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}
