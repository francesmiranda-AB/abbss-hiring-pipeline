import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/auth';
import { ToastProvider } from '@/ui/toast';
import { App } from '@/app/App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true }, mutations: { retry: 0 } },
});

// A tab left open across a release asks for page files that no longer exist. Reload once to
// pick up the new version; the flag stops a reload loop, and clears once the app has run a while.
const RELOADED = 'abbss_preload_reload';
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem(RELOADED)) return;
    sessionStorage.setItem(RELOADED, '1');
  } catch {
    return;
  }
  e.preventDefault();
  window.location.reload();
});
setTimeout(() => { try { sessionStorage.removeItem(RELOADED); } catch { /* nothing to clear */ } }, 30_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
