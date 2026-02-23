import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle, debounce, rateLimit, batch, cooldown, coalesce } from '../../utils/EventThrottler';

describe('EventThrottler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── throttle ──────────────────────────────────────────────────
  describe('throttle', () => {
    it('executes immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('ignores calls within delay window', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled();
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes again after delay expires', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled();
      vi.advanceTimersByTime(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('schedules trailing call for calls during delay', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled('first');
      throttled('second');
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('second');
    });

    it('passes arguments correctly', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled('hello', 42);
      expect(fn).toHaveBeenCalledWith('hello', 42);
    });
  });

  // ── debounce ──────────────────────────────────────────────────
  describe('debounce', () => {
    it('does not execute immediately', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced();
      expect(fn).not.toHaveBeenCalled();
    });

    it('executes after delay', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets timer on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced();
      vi.advanceTimersByTime(50);
      debounced(); // Reset
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled(); // Still waiting
      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes latest arguments', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('first');
      debounced('second');
      debounced('third');
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('third');
    });
  });

  // ── rateLimit ─────────────────────────────────────────────────
  describe('rateLimit', () => {
    it('allows up to maxCalls in window', () => {
      const fn = vi.fn();
      const limited = rateLimit(fn, 3, 1000);
      limited();
      limited();
      limited();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('drops calls beyond maxCalls in window', () => {
      const fn = vi.fn();
      const limited = rateLimit(fn, 3, 1000);
      limited();
      limited();
      limited();
      limited(); // Dropped
      limited(); // Dropped
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('allows calls again after window expires', () => {
      const fn = vi.fn();
      const limited = rateLimit(fn, 2, 100);
      limited();
      limited();
      expect(fn).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(100);
      limited();
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // ── batch ─────────────────────────────────────────────────────
  describe('batch', () => {
    it('collects items before executing', () => {
      const fn = vi.fn();
      const batched = batch(fn, 50);
      batched('a');
      batched('b');
      batched('c');
      expect(fn).not.toHaveBeenCalled();
    });

    it('delivers all batched items after delay', () => {
      const fn = vi.fn();
      const batched = batch<string>(fn, 50);
      batched('a');
      batched('b');
      batched('c');
      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('resets batch after delivery', () => {
      const fn = vi.fn();
      const batched = batch<string>(fn, 50);
      batched('a');
      vi.advanceTimersByTime(50);
      batched('b');
      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, ['a']);
      expect(fn).toHaveBeenNthCalledWith(2, ['b']);
    });
  });

  // ── cooldown ──────────────────────────────────────────────────
  describe('cooldown', () => {
    it('returns true on first call', () => {
      const fn = vi.fn();
      const withCooldown = cooldown(fn, 1000);
      expect(withCooldown()).toBe(true);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns false during cooldown', () => {
      const fn = vi.fn();
      const withCooldown = cooldown(fn, 1000);
      withCooldown();
      expect(withCooldown()).toBe(false);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('allows call again after cooldown expires', () => {
      const fn = vi.fn();
      const withCooldown = cooldown(fn, 100);
      withCooldown();
      vi.advanceTimersByTime(100);
      expect(withCooldown()).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('passes arguments correctly', () => {
      const fn = vi.fn();
      const withCooldown = cooldown(fn, 100);
      withCooldown('test', 42);
      expect(fn).toHaveBeenCalledWith('test', 42);
    });
  });

  // ── coalesce ──────────────────────────────────────────────────
  describe('coalesce', () => {
    it('defers execution to next tick', () => {
      const fn = vi.fn();
      const coalesced = coalesce(fn);
      coalesced('a');
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('uses latest arguments', () => {
      const fn = vi.fn();
      const coalesced = coalesce(fn);
      coalesced('first');
      coalesced('second');
      coalesced('third');
      vi.advanceTimersByTime(0);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('third');
    });

    it('allows new calls after execution', () => {
      const fn = vi.fn();
      const coalesced = coalesce(fn);
      coalesced('a');
      vi.advanceTimersByTime(0);
      coalesced('b');
      vi.advanceTimersByTime(0);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
