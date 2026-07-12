export function Card({ title, badge, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4 ${className}`}>
      {(title || badge) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-base font-semibold text-slate-800">{title}</h2>}
          {badge}
        </div>
      )}
      {children}
    </section>
  );
}

export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2.5 py-1">
      🔒 Stays on this phone
    </span>
  );
}

export function SharedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 rounded-full px-2.5 py-1">
      👥 Shared with household
    </span>
  );
}

export function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
        active
          ? 'bg-teal-700 text-white border-teal-700'
          : 'bg-white text-slate-700 border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-teal-700 text-white',
    subtle: 'bg-slate-100 text-slate-700',
    danger: 'bg-rose-600 text-white',
  };
  return (
    <button
      {...props}
      className={`px-4 py-3 rounded-xl font-medium disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function HypothesisBanner() {
  return (
    <div
      data-testid="hypothesis-banner"
      className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 mb-4"
    >
      <strong>Patterns, not diagnoses.</strong> Vitals shows co-occurrences in your own
      entries to discuss with a healthcare professional. Correlation is not causation,
      and this app cannot diagnose anything.
    </div>
  );
}

// Simple horizontal bar (plain CSS/div; no chart library in v1)
export function Bar({ fraction, color = 'bg-teal-600', label }) {
  const pct = Math.max(0, Math.min(100, Math.round((fraction || 0) * 100)));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {label != null && <span className="text-xs text-slate-500 w-16 text-right">{label}</span>}
    </div>
  );
}
