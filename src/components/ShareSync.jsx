import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { todayStr } from '../../shared/normalize.js';
import { Button } from './ui.jsx';

// "Share sync": builds an outgoing bundle of SHARED data only (dishes,
// ingredients, dinners) and hands it to the Android share sheet (WhatsApp is
// just the carrier), with a clipboard fallback.
export default function ShareSync() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bundle = await rpc('createBundle', { today: todayStr() });
      let how = null;
      if (navigator.share) {
        try { await navigator.share({ text: bundle.text }); how = 'shared'; } catch { /* cancelled or unsupported */ }
      }
      if (!how && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(bundle.text); how = 'copied'; } catch { /* clipboard blocked */ }
      }
      setResult({ ...bundle, how: how || 'shown' });
    } catch (err) {
      setResult({ error: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <Button onClick={share} disabled={busy} data-testid="share-sync" className="w-full">
        📤 Share sync (dinners & dishes only)
      </Button>
      {result?.error && <p className="text-sm text-rose-600 mt-2">{result.error}</p>}
      {result && !result.error && (
        <div className="mt-3 text-sm text-slate-600" data-testid="share-result">
          <p className="mb-1">
            {result.how === 'shared' && 'Sent to the share sheet.'}
            {result.how === 'copied' && 'Copied to clipboard — paste it to your partner (e.g. in WhatsApp).'}
            {result.how === 'shown' && 'Copy the text below and send it to your partner:'}
          </p>
          <p className="mb-2 text-slate-500">
            Contains {result.counts.meals} dinners and {result.counts.dishes} dishes.
            Check-ins never leave this phone.
          </p>
          <textarea
            readOnly
            value={result.text}
            rows={3}
            data-testid="bundle-text"
            className="w-full px-2 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 font-mono"
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}
    </div>
  );
}
