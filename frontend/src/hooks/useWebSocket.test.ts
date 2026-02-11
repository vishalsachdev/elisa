import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

// Minimal mock WebSocket that lets tests trigger lifecycle events
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateError() {
    this.onerror?.();
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not connect when sessionId is null', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: null, onEvent }));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('connects when sessionId is provided', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain('/ws/session/sess-1');
  });

  it('emits session_started on open', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));
    act(() => MockWebSocket.instances[0].simulateOpen());
    expect(onEvent).toHaveBeenCalledWith({ type: 'session_started', session_id: 'sess-1' });
  });

  it('dispatches parsed messages', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => MockWebSocket.instances[0].simulateMessage(JSON.stringify({ type: 'planning_started' })));
    expect(onEvent).toHaveBeenCalledWith({ type: 'planning_started' });
  });

  it('ignores malformed messages', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));
    act(() => MockWebSocket.instances[0].simulateOpen());
    onEvent.mockClear();
    act(() => MockWebSocket.instances[0].simulateMessage('not json'));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('reconnects with exponential backoff on close', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));
    expect(MockWebSocket.instances).toHaveLength(1);

    // First close -> 1s delay (1000 * 2^0)
    act(() => MockWebSocket.instances[0].simulateClose());
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second close -> 2s delay (1000 * 2^1)
    act(() => MockWebSocket.instances[1].simulateClose());
    act(() => { vi.advanceTimersByTime(1999); });
    expect(MockWebSocket.instances).toHaveLength(2); // not yet
    act(() => { vi.advanceTimersByTime(1); });
    expect(MockWebSocket.instances).toHaveLength(3);

    // Third close -> 4s delay (1000 * 2^2)
    act(() => MockWebSocket.instances[2].simulateClose());
    act(() => { vi.advanceTimersByTime(3999); });
    expect(MockWebSocket.instances).toHaveLength(3);
    act(() => { vi.advanceTimersByTime(1); });
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('stops reconnecting after MAX_RETRIES (10)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));

    // Exhaust all retries
    for (let i = 0; i < 10; i++) {
      act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose());
      act(() => { vi.advanceTimersByTime(30_000); }); // always enough
    }

    const countBefore = MockWebSocket.instances.length;

    // 11th close should not schedule another reconnect
    act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose());
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(MockWebSocket.instances).toHaveLength(countBefore);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('gave up after 10 retries'));
  });

  it('resets retry count on successful connection', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));

    // Fail a few times
    for (let i = 0; i < 5; i++) {
      act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose());
      act(() => { vi.advanceTimersByTime(30_000); });
    }

    // Now succeed
    act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateOpen());

    // After success, close again - should use initial 1s delay, not continued backoff
    const countBefore = MockWebSocket.instances.length;
    act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(MockWebSocket.instances).toHaveLength(countBefore + 1);
  });

  it('cleans up WebSocket on unmount', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));
    const ws = MockWebSocket.instances[0];
    unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it('cleans up pending reconnect timer on unmount', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));

    // Trigger a close so a reconnect timer is scheduled
    act(() => MockWebSocket.instances[0].simulateClose());
    const countBefore = MockWebSocket.instances.length;

    unmount();

    // Advance past the timer - no new connection should be created
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(MockWebSocket.instances).toHaveLength(countBefore);
  });

  it('backoff delay is capped at MAX_DELAY_MS (30s)', () => {
    const onEvent = vi.fn();
    renderHook(() => useWebSocket({ sessionId: 'sess-1', onEvent }));

    // Fail enough times that the uncapped delay would exceed 30s (2^5 * 1000 = 32000)
    for (let i = 0; i < 5; i++) {
      act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose());
      act(() => { vi.advanceTimersByTime(30_000); });
    }

    // Next failure: delay should be capped at 30s, not 32s
    const countBefore = MockWebSocket.instances.length;
    act(() => MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose());
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(MockWebSocket.instances).toHaveLength(countBefore + 1);
  });
});
