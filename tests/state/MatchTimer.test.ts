import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchTimer } from '../../state/game/MatchTimer';
import { HALF_DURATION, MATCH_DURATION } from '../../state/gameConfig';

describe('MatchTimer', () => {
  let timer: MatchTimer;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    timer = new MatchTimer();
  });

  // ── Constructor ──────────────────────────────────────────────
  describe('constructor', () => {
    it('initializes currentHalf to 1', () => {
      expect(timer.getCurrentHalf()).toBe(1);
    });

    it('initializes halfTimeRemaining to HALF_DURATION', () => {
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION);
    });

    it('initializes isHalftime to false', () => {
      expect(timer.isInHalftime()).toBe(false);
    });

    it('initializes timeRemaining to MATCH_DURATION', () => {
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION);
    });

    it('initializes full state correctly', () => {
      const state = timer.getState();
      expect(state).toEqual({
        currentHalf: 1,
        halfTimeRemaining: HALF_DURATION,
        isHalftime: false,
        halftimeTimeRemaining: 0,
        stoppageTimeAdded: 0,
        stoppageTimeNotified: false,
        timeRemaining: MATCH_DURATION,
        overtimeTimeRemaining: 0,
      });
    });
  });

  // ── decrementTime ────────────────────────────────────────────
  describe('decrementTime', () => {
    it('decrements halfTimeRemaining by 1', () => {
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION - 1);
    });

    it('decrements timeRemaining by 1', () => {
      timer.decrementTime();
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION - 1);
    });

    it('decrements both counters each call', () => {
      timer.decrementTime();
      timer.decrementTime();
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION - 3);
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION - 3);
    });

    it('does NOT decrement during halftime', () => {
      timer.startHalftime();
      const halfBefore = timer.getHalfTimeRemaining();
      const totalBefore = timer.getTimeRemaining();
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(halfBefore);
      expect(timer.getTimeRemaining()).toBe(totalBefore);
    });

    it('resumes decrementing after halftime ends', () => {
      timer.startHalftime();
      timer.decrementTime(); // should be no-op
      timer.endHalftime();
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION - 1);
    });

    it('can go negative (into stoppage time)', () => {
      // Decrement past zero
      for (let i = 0; i < HALF_DURATION + 5; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(-5);
    });
  });

  // ── shouldAddStoppageTime ────────────────────────────────────
  describe('shouldAddStoppageTime', () => {
    it('returns true when halfTimeRemaining is exactly 60 and not yet notified', () => {
      // Decrement to exactly 60 seconds remaining
      const ticks = HALF_DURATION - 60;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(60);
      expect(timer.shouldAddStoppageTime()).toBe(true);
    });

    it('returns false when halfTimeRemaining is not 60', () => {
      expect(timer.shouldAddStoppageTime()).toBe(false);
    });

    it('returns false after stoppage time has already been notified', () => {
      const ticks = HALF_DURATION - 60;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      timer.addStoppageTime(); // sets notified to true
      expect(timer.shouldAddStoppageTime()).toBe(false);
    });
  });

  // ── addStoppageTime ──────────────────────────────────────────
  describe('addStoppageTime', () => {
    it('returns stoppage time in seconds (1-3 minutes)', () => {
      const stoppageTime = timer.addStoppageTime();
      expect(stoppageTime).toBeGreaterThanOrEqual(60);
      expect(stoppageTime).toBeLessThanOrEqual(180);
    });

    it('returns a multiple of 60', () => {
      const stoppageTime = timer.addStoppageTime();
      expect(stoppageTime % 60).toBe(0);
    });

    it('sets stoppageTimeNotified to true', () => {
      timer.addStoppageTime();
      const state = timer.getState();
      expect(state.stoppageTimeNotified).toBe(true);
    });

    it('sets stoppageTimeAdded in state', () => {
      const stoppageTime = timer.addStoppageTime();
      const state = timer.getState();
      expect(state.stoppageTimeAdded).toBe(stoppageTime);
    });
  });

  // ── shouldEndHalf ────────────────────────────────────────────
  describe('shouldEndHalf', () => {
    it('returns true when halfTimeRemaining reaches 0 and no stoppage time', () => {
      // With no stoppage time, threshold is 0
      for (let i = 0; i < HALF_DURATION; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(0);
      expect(timer.shouldEndHalf()).toBe(true);
    });

    it('returns false when time remains', () => {
      expect(timer.shouldEndHalf()).toBe(false);
    });

    it('accounts for stoppage time', () => {
      // Add stoppage time first, mock Math.random to return 0 (1 minute = 60s)
      vi.spyOn(Math, 'random').mockReturnValue(0);
      timer.addStoppageTime();
      // stoppageTimeAdded should be 60

      // Decrement to 0
      for (let i = 0; i < HALF_DURATION; i++) {
        timer.decrementTime();
      }
      // At 0, should NOT end because stoppage time extends
      expect(timer.shouldEndHalf()).toBe(false);

      // Decrement 59 more (to -59)
      for (let i = 0; i < 59; i++) {
        timer.decrementTime();
      }
      expect(timer.shouldEndHalf()).toBe(false);

      // One more decrement to -60, which equals -stoppageTimeAdded
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(-60);
      expect(timer.shouldEndHalf()).toBe(true);

      vi.restoreAllMocks();
    });
  });

  // ── shouldPlayTickingSound ───────────────────────────────────
  describe('shouldPlayTickingSound', () => {
    it('returns true when halfTimeRemaining is exactly 5', () => {
      const ticks = HALF_DURATION - 5;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(5);
      expect(timer.shouldPlayTickingSound()).toBe(true);
    });

    it('returns false when halfTimeRemaining is not 5', () => {
      expect(timer.shouldPlayTickingSound()).toBe(false);
    });

    it('returns false at 4 seconds remaining', () => {
      const ticks = HALF_DURATION - 4;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      expect(timer.shouldPlayTickingSound()).toBe(false);
    });
  });

  // ── shouldLog ────────────────────────────────────────────────
  describe('shouldLog', () => {
    it('returns true when halfTimeRemaining is divisible by 30', () => {
      // HALF_DURATION is 180, which is divisible by 30
      expect(timer.shouldLog()).toBe(true);
    });

    it('returns true when halfTimeRemaining is 10 or less', () => {
      const ticks = HALF_DURATION - 10;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(10);
      expect(timer.shouldLog()).toBe(true);
    });

    it('returns true at 7 seconds (<=10)', () => {
      const ticks = HALF_DURATION - 7;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(7);
      expect(timer.shouldLog()).toBe(true);
    });

    it('returns false at a non-30-multiple above 10', () => {
      // Decrement to 25 seconds (not divisible by 30, above 10)
      const ticks = HALF_DURATION - 25;
      for (let i = 0; i < ticks; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(25);
      expect(timer.shouldLog()).toBe(false);
    });

    it('returns true at 0 seconds (divisible by 30)', () => {
      for (let i = 0; i < HALF_DURATION; i++) {
        timer.decrementTime();
      }
      expect(timer.getHalfTimeRemaining()).toBe(0);
      expect(timer.shouldLog()).toBe(true);
    });
  });

  // ── startHalftime ────────────────────────────────────────────
  describe('startHalftime', () => {
    it('sets isHalftime to true', () => {
      timer.startHalftime();
      expect(timer.isInHalftime()).toBe(true);
    });

    it('sets halftimeTimeRemaining to 0 (manual halftime)', () => {
      timer.startHalftime();
      const state = timer.getState();
      expect(state.halftimeTimeRemaining).toBe(0);
    });
  });

  // ── endHalftime ──────────────────────────────────────────────
  describe('endHalftime', () => {
    it('sets isHalftime to false', () => {
      timer.startHalftime();
      timer.endHalftime();
      expect(timer.isInHalftime()).toBe(false);
    });

    it('sets currentHalf to 2', () => {
      timer.startHalftime();
      timer.endHalftime();
      expect(timer.getCurrentHalf()).toBe(2);
    });

    it('resets halfTimeRemaining to HALF_DURATION', () => {
      timer.startHalftime();
      timer.endHalftime();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION);
    });

    it('resets timeRemaining to HALF_DURATION', () => {
      timer.startHalftime();
      timer.endHalftime();
      expect(timer.getTimeRemaining()).toBe(HALF_DURATION);
    });

    it('resets stoppageTimeAdded to 0', () => {
      timer.addStoppageTime();
      timer.startHalftime();
      timer.endHalftime();
      const state = timer.getState();
      expect(state.stoppageTimeAdded).toBe(0);
    });

    it('resets stoppageTimeNotified to false', () => {
      timer.addStoppageTime();
      timer.startHalftime();
      timer.endHalftime();
      const state = timer.getState();
      expect(state.stoppageTimeNotified).toBe(false);
    });

    it('resets halftimeTimeRemaining to 0', () => {
      timer.startHalftime();
      timer.endHalftime();
      const state = timer.getState();
      expect(state.halftimeTimeRemaining).toBe(0);
    });
  });

  // ── startOvertime ────────────────────────────────────────────
  describe('startOvertime', () => {
    it('sets halfTimeRemaining to the given duration', () => {
      timer.startOvertime(120);
      expect(timer.getHalfTimeRemaining()).toBe(120);
    });

    it('sets timeRemaining to the given duration', () => {
      timer.startOvertime(120);
      expect(timer.getTimeRemaining()).toBe(120);
    });

    it('sets overtimeTimeRemaining in state', () => {
      timer.startOvertime(120);
      const state = timer.getState();
      expect(state.overtimeTimeRemaining).toBe(120);
    });
  });

  // ── isOvertimeEnded ──────────────────────────────────────────
  describe('isOvertimeEnded', () => {
    it('returns true when halfTimeRemaining is 0', () => {
      timer.startOvertime(3);
      timer.decrementTime();
      timer.decrementTime();
      timer.decrementTime();
      expect(timer.isOvertimeEnded()).toBe(true);
    });

    it('returns true when halfTimeRemaining is negative', () => {
      timer.startOvertime(1);
      timer.decrementTime();
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(-1);
      expect(timer.isOvertimeEnded()).toBe(true);
    });

    it('returns false when time remains', () => {
      timer.startOvertime(60);
      expect(timer.isOvertimeEnded()).toBe(false);
    });
  });

  // ── getState ─────────────────────────────────────────────────
  describe('getState', () => {
    it('returns an object with all timer state properties', () => {
      const state = timer.getState();
      expect(state).toHaveProperty('currentHalf');
      expect(state).toHaveProperty('halfTimeRemaining');
      expect(state).toHaveProperty('isHalftime');
      expect(state).toHaveProperty('halftimeTimeRemaining');
      expect(state).toHaveProperty('stoppageTimeAdded');
      expect(state).toHaveProperty('stoppageTimeNotified');
      expect(state).toHaveProperty('timeRemaining');
      expect(state).toHaveProperty('overtimeTimeRemaining');
    });

    it('returns a copy, not a reference to internal state', () => {
      const state1 = timer.getState();
      state1.currentHalf = 99;
      const state2 = timer.getState();
      expect(state2.currentHalf).toBe(1);
    });

    it('returns different object references on each call', () => {
      const state1 = timer.getState();
      const state2 = timer.getState();
      expect(state1).not.toBe(state2);
    });
  });

  // ── getCurrentHalf ───────────────────────────────────────────
  describe('getCurrentHalf', () => {
    it('returns 1 initially', () => {
      expect(timer.getCurrentHalf()).toBe(1);
    });

    it('returns 2 after halftime ends', () => {
      timer.startHalftime();
      timer.endHalftime();
      expect(timer.getCurrentHalf()).toBe(2);
    });
  });

  // ── getTimeRemaining ─────────────────────────────────────────
  describe('getTimeRemaining', () => {
    it('returns MATCH_DURATION initially', () => {
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION);
    });

    it('decreases after decrementTime calls', () => {
      timer.decrementTime();
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION - 1);
    });
  });

  // ── getHalfTimeRemaining ─────────────────────────────────────
  describe('getHalfTimeRemaining', () => {
    it('returns HALF_DURATION initially', () => {
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION);
    });

    it('decreases after decrementTime calls', () => {
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION - 1);
    });
  });

  // ── isInHalftime ─────────────────────────────────────────────
  describe('isInHalftime', () => {
    it('returns false initially', () => {
      expect(timer.isInHalftime()).toBe(false);
    });

    it('returns true after startHalftime', () => {
      timer.startHalftime();
      expect(timer.isInHalftime()).toBe(true);
    });

    it('returns false after endHalftime', () => {
      timer.startHalftime();
      timer.endHalftime();
      expect(timer.isInHalftime()).toBe(false);
    });
  });

  // ── reset ────────────────────────────────────────────────────
  describe('reset', () => {
    it('resets currentHalf to 1', () => {
      timer.startHalftime();
      timer.endHalftime();
      timer.reset();
      expect(timer.getCurrentHalf()).toBe(1);
    });

    it('resets halfTimeRemaining to HALF_DURATION', () => {
      timer.decrementTime();
      timer.decrementTime();
      timer.reset();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION);
    });

    it('resets timeRemaining to MATCH_DURATION', () => {
      timer.decrementTime();
      timer.reset();
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION);
    });

    it('resets isHalftime to false', () => {
      timer.startHalftime();
      timer.reset();
      expect(timer.isInHalftime()).toBe(false);
    });

    it('resets all state fields to initial values', () => {
      // Modify various state
      timer.decrementTime();
      timer.addStoppageTime();
      timer.startHalftime();
      timer.reset();

      expect(timer.getState()).toEqual({
        currentHalf: 1,
        halfTimeRemaining: HALF_DURATION,
        isHalftime: false,
        halftimeTimeRemaining: 0,
        stoppageTimeAdded: 0,
        stoppageTimeNotified: false,
        timeRemaining: MATCH_DURATION,
        overtimeTimeRemaining: 0,
      });
    });

    it('can be used again after reset', () => {
      timer.decrementTime();
      timer.reset();
      timer.decrementTime();
      expect(timer.getHalfTimeRemaining()).toBe(HALF_DURATION - 1);
      expect(timer.getTimeRemaining()).toBe(MATCH_DURATION - 1);
    });
  });
});
