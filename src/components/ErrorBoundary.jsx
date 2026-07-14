import { Component } from 'react';

// Catches render/runtime errors anywhere below it and shows a friendly
// recovery screen instead of a blank page. The on-device data is untouched,
// so "Reload" almost always recovers.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Vitals crashed while rendering:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-4">😔</div>
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Something went wrong on this screen</h1>
          <p className="text-slate-600 mb-2">
            Your data is safe on this device. Reloading usually fixes it.
          </p>
          <p className="text-xs text-slate-400 mb-6 break-words font-mono">{String(this.state.error?.message || this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-teal-700 text-white font-medium text-lg"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
