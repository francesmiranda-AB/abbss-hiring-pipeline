import { Component, type ReactNode } from 'react';
import { Button, ErrorAlert } from '@/ui/kit';

// A page that fails to load (a script file missing after a new release, or a crash)
// shows this instead of a blank or stuck screen. `resetKey` clears it when the person
// navigates somewhere else.
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorAlert title="This page didn't load" action={<Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload</Button>}>
        This can happen right after the app was updated. Reloading gets the latest version. Nothing you saved is lost.
      </ErrorAlert>
    );
  }
}
