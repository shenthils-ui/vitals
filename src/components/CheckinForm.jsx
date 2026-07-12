import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { Button, Chip } from './ui.jsx';

const MOODS = [
  { v: 1, face: '😞' }, { v: 2, face: '😕' }, { v: 3, face: '😐' },
  { v: 4, face: '🙂' }, { v: 5, face: '😄' },
];

// Private daily check-in: mood 1..5, optional energy, symptom tags, note.
// Saved locally only — never enters a sync bundle.
export default function CheckinForm({ date, existing, onSaved }) {
  const [mood, setMood] = useState(existing?.mood ?? null);
  const [energy, setEnergy] = useState(existing?.energy ?? null);
  const [selected, setSelected] = useState(existing?.symptoms ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    rpc('listSymptoms').then(setTags);
  }, []);

  useEffect(() => {
    setMood(existing?.mood ?? null);
    setEnergy(existing?.energy ?? null);
    setSelected(existing?.symptoms ?? []);
    setNote(existing?.note ?? '');
  }, [existing, date]);

  const toggle = (tag) => setSelected(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);

  const addTag = async () => {
    const t = newTag.trim();
    if (!t) return;
    const updated = await rpc('addSymptom', { tag: t });
    setTags(updated);
    if (!selected.includes(t)) setSelected([...selected, t]);
    setNewTag('');
  };

  const save = async () => {
    if (!mood || busy) return;
    setBusy(true);
    try {
      await rpc('saveCheckin', { date, mood, energy, note: note.trim() || null, symptoms: selected });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved?.();
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="checkin-form">
      <p className="text-sm text-slate-600 mb-2">How was the day?</p>
      <div className="flex gap-2 mb-4">
        {MOODS.map((m) => (
          <button
            key={m.v}
            type="button"
            data-testid={`mood-${m.v}`}
            onClick={() => setMood(m.v)}
            aria-pressed={mood === m.v}
            className={`flex-1 text-3xl py-2.5 rounded-xl border-2 ${mood === m.v ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50'}`}
          >
            {m.face}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600 mb-2">Energy (optional)</p>
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setEnergy(energy === v ? null : v)}
            className={`flex-1 py-2 rounded-xl border text-sm font-medium ${energy === v ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-600 border-slate-300'}`}
          >
            {v}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600 mb-2">Any symptoms?</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((t) => (
          <Chip key={t.id} active={selected.includes(t.tag)} onClick={() => toggle(t.tag)}>{t.tag}</Chip>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Add a symptom tag"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-base"
        />
        <Button type="button" variant="subtle" onClick={addTag}>Add</Button>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Private note (optional)"
        rows={2}
        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-base mb-3"
      />
      <Button onClick={save} disabled={!mood || busy} data-testid="save-checkin" className="w-full">
        {savedFlash ? 'Saved ✓' : existing ? 'Update check-in' : 'Save check-in'}
      </Button>
    </div>
  );
}
