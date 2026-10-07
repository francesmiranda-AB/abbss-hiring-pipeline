import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSlow } from '@/ui/useSlow';
import { ErrorBoundary } from './ErrorBoundary';

describe('useSlow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns true after the delay and back to false when the work ends', () => {
    const { result, rerender } = renderHook(({ active }) => useSlow(active, 8_000), { initialProps: { active: true } });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(7_999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('never turns true if the work finishes first', () => {
    const { result, rerender } = renderHook(({ active }) => useSlow(active, 8_000), { initialProps: { active: true } });
    act(() => { vi.advanceTimersByTime(3_000); });
    rerender({ active: false });
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current).toBe(false);
  });
});

function Boom(): never { throw new Error('chunk failed'); }

describe('ErrorBoundary', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => spy.mockRestore());

  it('shows a Reload message instead of a blank page', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent("This page didn't load");
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('clears when the person goes to another page', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/b"><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('passes children through when nothing is wrong', async () => {
    render(<ErrorBoundary><button type="button">ok</button></ErrorBoundary>);
    await userEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
