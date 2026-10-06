import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { reportError } from '@/api/actions';
import { useUser } from '@/auth/auth';
import { Button, Dialog, Field } from '@/ui/kit';
import { useToast } from '@/ui/toast';

// Sends a note (plus the last error the app caught, if any) to the backend's
// Error Reports tab.
let lastError: { message: string; stack: string } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => { lastError = { message: String(e.message || ''), stack: String(e.error?.stack || '') }; });
  window.addEventListener('unhandledrejection', (e) => { lastError = { message: String(e.reason?.message || e.reason || ''), stack: String(e.reason?.stack || '') }; });
}

export function ReportProblemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const user = useUser();
  const location = useLocation();
  const toast = useToast();
  const submit = async () => {
    if (!note.trim()) { setError('Say what happened, so it can be fixed.'); return; }
    setBusy(true);
    try {
      await reportError({
        source: 'user-report', userNote: note.trim(), message: lastError?.message || '', stack: lastError?.stack || '',
        page: location.pathname, role: user.role, url: location.pathname + location.search, userAgent: navigator.userAgent,
      });
      toast.show({ message: 'Thanks. The report was sent.' });
      setNote('');
      onClose();
    } catch (e) {
      setError(`Couldn't send it: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Report a problem" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" busy={busy} onClick={submit}>Send report</Button>
    </>}>
      <Field label="What went wrong?" required htmlFor="problem-note" error={error}>
        <textarea id="problem-note" className="ab-textarea" value={note} aria-invalid={!!error}
          onChange={(e) => { setNote(e.target.value); setError(''); }} placeholder="What you were doing, and what happened instead." />
      </Field>
    </Dialog>
  );
}
