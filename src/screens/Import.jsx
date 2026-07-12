import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { Button, Card } from '../components/ui.jsx';

// Import screen: (a) landing point for the Android share target and manual
// paste of a partner's sync bundle, (b) Restock grocery import.
export default function ImportScreen() {
  const [params] = useSearchParams();
  const sharedText = params.get('text') || '';

  const [syncText, setSyncText] = useState(sharedText);
  const [preview, setPreview] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const [groceryText, setGroceryText] = useState('');
  const [groceryResult, setGroceryResult] = useState(null);
  const [groceryError, setGroceryError] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => { rpc('groceryStats').then(setStats); }, [groceryResult]);

  const doPreview = async (text) => {
    setSyncError(null); setApplyResult(null); setPreview(null);
    try { setPreview(await rpc('previewBundle', { text })); }
    catch (err) { setSyncError(err.message); }
  };

  // Share-target arrival: preview immediately.
  useEffect(() => {
    if (sharedText) doPreview(sharedText);
  }, [sharedText]);

  const apply = async () => {
    setSyncError(null);
    try {
      const r = await rpc('applyBundle', { text: syncText });
      setApplyResult(r);
      setPreview(null);
    } catch (err) { setSyncError(err.message); }
  };

  const importGroceryText = async (text) => {
    setGroceryError(null); setGroceryResult(null);
    try { setGroceryResult(await rpc('importGrocery', { payload: text })); }
    catch (err) { setGroceryError(err.message); }
  };

  const onGroceryFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importGroceryText(await file.text());
    e.target.value = '';
  };

  return (
    <div data-testid="screen-import">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Import</h1>
        <p className="text-slate-500">Sync bundles & Restock grocery data</p>
      </header>

      <Card title="Partner sync bundle">
        <p className="text-sm text-slate-500 mb-2">
          Paste the message from your partner (the line starting with VITL1:).
          It contains dinners and dishes only — never check-ins.
        </p>
        <textarea
          value={syncText}
          onChange={(e) => setSyncText(e.target.value)}
          rows={3}
          placeholder="Vitals sync (from …)&#10;VITL1:…"
          data-testid="sync-input"
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono mb-2"
        />
        <div className="flex gap-2 mb-2">
          <Button variant="subtle" onClick={() => doPreview(syncText)} disabled={!syncText.trim()} data-testid="preview-bundle">
            Preview
          </Button>
          <Button onClick={apply} disabled={!syncText.trim()} data-testid="apply-bundle">
            Import
          </Button>
        </div>
        {syncError && <p className="text-sm text-rose-600">{syncError}</p>}
        {preview && (
          <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-sm text-teal-900" data-testid="bundle-preview">
            <p className="font-medium">From {preview.from?.name || 'unknown'}: {preview.meals} dinners, {preview.dishes} dishes</p>
            <p className="text-xs text-teal-700">Sent {preview.sent_at?.slice(0, 10)}</p>
            {preview.already_imported && <p className="text-xs font-medium mt-1">Already imported — importing again changes nothing.</p>}
          </div>
        )}
        {applyResult && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900" data-testid="apply-result">
            {applyResult.already_imported
              ? 'This bundle was already imported — nothing changed.'
              : `Imported ${applyResult.added_meals} new dinners and ${applyResult.added_dishes} new dishes from ${applyResult.from?.name || 'partner'}.`}
          </div>
        )}
      </Card>

      <Card title="Restock grocery import">
        <p className="text-sm text-slate-500 mb-2">
          Import the “restock_purchases” export from Restock. Re-importing
          overlapping ranges adds nothing. Grocery data stays on this phone.
        </p>
        {stats?.total > 0 && (
          <p className="text-xs text-slate-400 mb-2" data-testid="grocery-stats">
            Currently: {stats.total} purchases from {stats.from_date} to {stats.to_date}
          </p>
        )}
        <label className="block mb-2">
          <span className="sr-only">Choose export file</span>
          <input type="file" accept=".json,application/json" onChange={onGroceryFile}
            className="block w-full text-sm text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-700 file:text-white file:font-medium" />
        </label>
        <textarea
          value={groceryText}
          onChange={(e) => setGroceryText(e.target.value)}
          rows={3}
          placeholder="…or paste the export JSON here"
          data-testid="grocery-input"
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono mb-2"
        />
        <Button variant="subtle" onClick={() => importGroceryText(groceryText)} disabled={!groceryText.trim()} data-testid="import-grocery">
          Import pasted JSON
        </Button>
        {groceryError && <p className="text-sm text-rose-600 mt-2">{groceryError}</p>}
        {groceryResult && (
          <p className="text-sm text-emerald-700 mt-2" data-testid="grocery-result">
            Added {groceryResult.added} purchases ({groceryResult.skipped} duplicates skipped).
          </p>
        )}
      </Card>
    </div>
  );
}
