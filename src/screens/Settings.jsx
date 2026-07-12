import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, IS_STANDALONE } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Button, Card, PrivateBadge } from '../components/ui.jsx';
import ShareSync from '../components/ShareSync.jsx';

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const { state, refresh } = useApp();
  const [deviceName, setDeviceName] = useState(state.device_name || '');
  const [personName, setPersonName] = useState(state.person_name || '');
  const [savedNames, setSavedNames] = useState(false);
  const [symptoms, setSymptoms] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [restoreMsg, setRestoreMsg] = useState(null);

  const loadSymptoms = () => rpc('listSymptoms', { include_archived: true }).then(setSymptoms);
  useEffect(() => { loadSymptoms(); }, []);

  const saveNames = async () => {
    await rpc('updateSettings', { device_name: deviceName, person_name: personName });
    await refresh();
    setSavedNames(true);
    setTimeout(() => setSavedNames(false), 2000);
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    await rpc('addSymptom', { tag: newTag.trim() });
    setNewTag('');
    loadSymptoms();
  };

  const exportBackup = async () => {
    const data = await rpc('exportBackup');
    download(`vitals-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
  };

  const onRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!confirm('Restoring a backup REPLACES everything on this device, including private check-ins. Continue?')) return;
    try {
      await rpc('importBackup', { data: await file.text() });
      setRestoreMsg('Backup restored.');
      await refresh();
    } catch (err) {
      setRestoreMsg(`Restore failed: ${err.message}`);
    }
  };

  const resetAll = async () => {
    if (!confirm('Delete ALL Vitals data on this device? This cannot be undone.')) return;
    if (!confirm('Really delete everything, including private check-ins?')) return;
    await rpc('resetAll');
    await refresh();
  };

  return (
    <div data-testid="screen-settings">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500">{IS_STANDALONE ? 'Standalone app — all data on this device' : 'Server mode — data on the laptop'}</p>
      </header>

      <Card title="Names">
        <label className="block text-sm text-slate-600 mb-1">Device name</label>
        <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 mb-3 text-base" />
        <label className="block text-sm text-slate-600 mb-1">Your name (labels your private check-ins)</label>
        <input value={personName} onChange={(e) => setPersonName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 mb-3 text-base" />
        <Button onClick={saveNames} disabled={!deviceName.trim() || !personName.trim()}>
          {savedNames ? 'Saved ✓' : 'Save names'}
        </Button>
      </Card>

      <Card title="Share sync">
        <p className="text-sm text-slate-500 mb-3">
          Sends dinners and dishes from the last 8 weeks to your partner.
          Private check-ins are never included.
        </p>
        <ShareSync />
      </Card>

      <Card title="Symptom tags" badge={<PrivateBadge />}>
        <div className="flex flex-wrap gap-2 mb-3">
          {symptoms.map((s) => (
            <button
              key={s.id}
              onClick={async () => { await rpc('setSymptomArchived', { id: s.id, archived: !s.archived }); loadSymptoms(); }}
              className={`px-3 py-1.5 rounded-full text-sm border ${s.archived ? 'bg-slate-100 text-slate-400 border-slate-200 line-through' : 'bg-white text-slate-700 border-slate-300'}`}
              title={s.archived ? 'Tap to restore' : 'Tap to archive'}
            >
              {s.tag}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="New tag" className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-base" />
          <Button variant="subtle" onClick={addTag}>Add</Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Tap a tag to archive/restore it. Archived tags keep their history.</p>
      </Card>

      <Card title="Backup (everything, stays with you)">
        <p className="text-sm text-slate-500 mb-3">
          The full backup <strong>does include your private check-ins</strong> — it is a
          personal on-device backup for moving or restoring your own data, not a sync
          bundle. Share sync (above) is the only thing that goes to your partner, and it
          carries dinners and dishes only.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={exportBackup} data-testid="export-backup">⬇️ Export full backup</Button>
          <label className="px-4 py-3 rounded-xl font-medium bg-slate-100 text-slate-700 text-center cursor-pointer">
            ⬆️ Restore from backup file
            <input type="file" accept=".json,application/json" className="hidden" onChange={onRestoreFile} />
          </label>
          {restoreMsg && <p className="text-sm text-slate-600">{restoreMsg}</p>}
        </div>
      </Card>

      <Card title="Shortcuts">
        <div className="flex flex-col gap-1 text-teal-700">
          <Link to="/dishes" className="py-2">🍲 Dish catalog</Link>
          <Link to="/import" className="py-2">📥 Import (sync bundle / Restock)</Link>
        </div>
      </Card>

      <Card title="Danger zone">
        <Button variant="danger" onClick={resetAll} className="w-full">Reset all data on this device</Button>
      </Card>

      <p className="text-center text-xs text-slate-400 mb-4">
        Device ID: {state.device_id} · Schema v{state.schema_version}
      </p>
    </div>
  );
}
