import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Button, Card, Chip } from '../components/ui.jsx';

export default function DishDetail() {
  const { dishId } = useParams();
  const { state } = useApp();
  const navigate = useNavigate();
  const [dish, setDish] = useState(null);
  const [name, setName] = useState('');
  const [isRestaurant, setIsRestaurant] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [ingInput, setIngInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    rpc('getDish', { dish_id: dishId }).then((d) => {
      setDish(d);
      setName(d.name);
      setIsRestaurant(!!d.is_restaurant);
      setIngredients(d.ingredients.map((i) => i.ingredient_name));
    }).catch(() => navigate('/dishes'));
  }, [dishId, navigate]);

  if (!dish) return null;

  const addIngredient = (n) => {
    const t = String(n).trim();
    if (!t || ingredients.includes(t)) return;
    setIngredients([...ingredients, t]);
    setIngInput('');
  };

  const save = async () => {
    await rpc('updateDish', { dish_id: dishId, name, is_restaurant: isRestaurant, ingredients });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div data-testid="screen-dish-detail">
      <header className="mb-4">
        <button className="text-sm text-teal-700 mb-1" onClick={() => navigate('/dishes')}>← All dishes</button>
        <h1 className="text-2xl font-bold text-slate-800">{dish.name}</h1>
        <p className="text-slate-500">{dish.meal_type} · editing updates future insights</p>
      </header>
      <Card>
        <label className="block text-sm text-slate-600 mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-3 rounded-xl border border-slate-300 mb-3 text-base"
        />
        <label className="flex items-center gap-2 mb-4 text-slate-700 text-sm">
          <input type="checkbox" checked={isRestaurant} onChange={(e) => setIsRestaurant(e.target.checked)} className="w-5 h-5" />
          Restaurant / takeaway
        </label>
        <p className="text-sm text-slate-600 mb-2">Ingredients (tap to remove):</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {ingredients.map((ing) => (
            <Chip key={ing} active onClick={() => setIngredients(ingredients.filter((i) => i !== ing))}>{ing} ✕</Chip>
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
          <Button variant="subtle" onClick={() => addIngredient(ingInput)}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(state.common_ingredients || []).filter((s) => !ingredients.includes(s)).map((s) => (
            <button key={s} onClick={() => addIngredient(s)} className="px-2.5 py-1.5 rounded-full text-xs bg-slate-100 text-slate-600">
              + {s}
            </button>
          ))}
        </div>
        <Button onClick={save} disabled={!name.trim()} className="w-full">{saved ? 'Saved ✓' : 'Save dish'}</Button>
      </Card>
    </div>
  );
}
