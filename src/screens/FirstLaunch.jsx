import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { Button } from '../components/ui.jsx';

export default function FirstLaunch({ onDone }) {
  const [deviceName, setDeviceName] = useState('');
  const [personName, setPersonName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const start = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc('setup', { device_name: deviceName, person_name: personName });
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" data-testid="first-launch">
      <form onSubmit={start} className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">🌿</div>
          <h1 className="text-2xl font-bold text-slate-800">Vitals</h1>
          <p className="text-slate-500 text-sm mt-1">
            Two taps a day: tonight's dinner, and how you feel.
            Dinners are shared with your household; check-ins stay on this phone.
          </p>
        </div>
        <label className="block text-sm text-slate-600 mb-1">Device name</label>
        <input
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="e.g. Shen's phone"
          data-testid="device-name"
          className="w-full px-3 py-3 rounded-xl border border-slate-300 mb-4 text-base"
        />
        <label className="block text-sm text-slate-600 mb-1">Your name (labels your private check-ins)</label>
        <input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder="e.g. Shen"
          data-testid="person-name"
          className="w-full px-3 py-3 rounded-xl border border-slate-300 mb-5 text-base"
        />
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        <Button type="submit" disabled={!deviceName.trim() || !personName.trim() || busy} className="w-full text-lg" data-testid="start-button">
          Start
        </Button>
      </form>
    </div>
  );
}
