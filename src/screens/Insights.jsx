import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { todayStr } from '../../shared/normalize.js';
import { Bar, Card, HypothesisBanner, PrivateBadge } from '../components/ui.jsx';

function pct(x) { return `${Math.round((x || 0) * 100)}%`; }

export default function Insights() {
  const [ins, setIns] = useState(null);

  useEffect(() => {
    rpc('getInsights', { today: todayStr() }).then(setIns);
  }, []);

  if (!ins) return <div data-testid="screen-insights" />;

  const { basket, cooccurrence, mood_trend: mood, window: win, constants } = ins;
  const countTotal = basket.by_count.healthy + basket.by_count.watch + basket.by_count.rest;
  const spendTotal = basket.by_spend
    ? basket.by_spend.healthy + basket.by_spend.watch + basket.by_spend.rest : 0;

  return (
    <div data-testid="screen-insights">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Insights</h1>
        <p className="text-slate-500">Trailing {win.days} days · {win.from} → {win.to}</p>
      </header>

      <HypothesisBanner />

      <Card title="Mood trend" badge={<PrivateBadge />}>
        {mood.total_checkins === 0 ? (
          <p className="text-sm text-slate-500">No check-ins in the window yet.</p>
        ) : (
          <div data-testid="mood-trend">
            <p className="text-xs text-slate-400 mb-2">{mood.total_checkins} check-ins · average mood per week</p>
            <div className="flex items-end gap-1.5 h-24">
              {mood.weeks.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-slate-100 rounded-t-md flex items-end h-20">
                    <div
                      className="w-full bg-teal-500 rounded-t-md"
                      style={{ height: w.avg_mood ? `${(w.avg_mood / 5) * 100}%` : '0%' }}
                      title={w.avg_mood ? `avg ${w.avg_mood.toFixed(1)} (n=${w.count})` : 'no data'}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{w.count || ''}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">oldest week → this week; number = check-ins that week</p>
          </div>
        )}
      </Card>

      <Card title="Basket composition">
        {basket.total_purchases === 0 ? (
          <p className="text-sm text-slate-500">
            No grocery data in the window. <Link to="/import" className="text-teal-700 underline">Import your Restock purchases</Link> to see basket composition.
          </p>
        ) : (
          <div data-testid="basket-composition">
            <p className="text-xs text-slate-400 mb-2">{basket.total_purchases} purchases in the window</p>
            <p className="text-sm text-slate-600 mb-1">By count</p>
            <div className="flex h-5 rounded-full overflow-hidden mb-1">
              <div className="bg-emerald-500" style={{ width: pct(basket.by_count.healthy / countTotal) }} />
              <div className="bg-orange-400" style={{ width: pct(basket.by_count.watch / countTotal) }} />
              <div className="bg-slate-300" style={{ width: pct(basket.by_count.rest / countTotal) }} />
            </div>
            <p className="text-xs text-slate-500 mb-3" data-testid="basket-count-shares">
              🟢 Veg & fruit {pct(basket.by_count.healthy / countTotal)} ({basket.by_count.healthy}) ·
              🟠 Snacks & drinks {pct(basket.by_count.watch / countTotal)} ({basket.by_count.watch}) ·
              ⚪ Rest {pct(basket.by_count.rest / countTotal)} ({basket.by_count.rest})
            </p>
            {basket.by_spend && spendTotal > 0 && (
              <>
                <p className="text-sm text-slate-600 mb-1">By spend ({basket.spend_rows} priced items)</p>
                <div className="flex h-5 rounded-full overflow-hidden mb-1">
                  <div className="bg-emerald-500" style={{ width: pct(basket.by_spend.healthy / spendTotal) }} />
                  <div className="bg-orange-400" style={{ width: pct(basket.by_spend.watch / spendTotal) }} />
                  <div className="bg-slate-300" style={{ width: pct(basket.by_spend.rest / spendTotal) }} />
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  🟢 {pct(basket.by_spend.healthy / spendTotal)} · 🟠 {pct(basket.by_spend.watch / spendTotal)} · ⚪ {pct(basket.by_spend.rest / spendTotal)}
                </p>
              </>
            )}
            <p className="text-sm text-slate-600 mb-1">Veg & fruit share, week by week</p>
            {basket.weekly_healthy_share.map((w, i) => (
              <div key={i} className="mb-1">
                <Bar fraction={w.share ?? 0} color="bg-emerald-500" label={w.total ? `${pct(w.share)} (${w.healthy}/${w.total})` : 'no data'} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Symptoms & foods" badge={<PrivateBadge />}>
        <p className="text-xs text-slate-500 mb-3">
          Your check-ins (this phone only) against the household dinners of the
          {' '}same day and the {constants.lookback_days} days before. Associations, not causes.
        </p>
        {cooccurrence.length === 0 && (
          <p className="text-sm text-slate-500">No symptoms logged in the window yet.</p>
        )}
        {cooccurrence.map((c) => (
          <div key={c.tag} className="mb-4 border-b border-slate-100 pb-3 last:border-0" data-testid={`symptom-${c.tag}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-slate-800">{c.tag}</span>
              <span className="text-xs text-slate-500">n = {c.occurrences} symptom days</span>
            </div>
            {!c.ranked ? (
              <p className="text-sm text-slate-500" data-testid="not-enough-data">
                Logged on {c.occurrences} {c.occurrences === 1 ? 'day' : 'days'} — not enough data yet (ranking needs at least {c.min_needed} days).
              </p>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Worth noticing — ingredients that precede {c.tag} days more often than any day:</p>
                {c.ingredients.map((ing) => (
                  <div key={ing.ingredient} className="mb-2" data-testid="ranked-ingredient">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">{ing.ingredient}</span>
                      <span className="text-xs text-slate-500">
                        {ing.symptom_days_with}/{ing.symptom_days_total} symptom days ({pct(ing.with_rate)})
                        {' '}vs {ing.baseline_days_with}/{ing.window_days} all days ({pct(ing.baseline_rate)})
                      </span>
                    </div>
                    <Bar fraction={ing.with_rate} color="bg-indigo-400" />
                  </div>
                ))}
                {c.ingredients.length === 0 && (
                  <p className="text-sm text-slate-500">No dinner ingredients found before these days.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
