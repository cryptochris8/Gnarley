import { describe, it, expect, beforeEach } from 'vitest';
import { HalfTimeManager } from '../../state/HalfTimeManager';
import type { GameState } from '../../state/HalfTimeManager';
import { HALF_DURATION } from '../../state/gameConfig';

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentHalf: 1,
    halfTimeRemaining: HALF_DURATION,
    timeRemaining: HALF_DURATION,
    stoppageTimeAdded: 0,
    stoppageTimeNotified: false,
    status: 'in-progress',
    score: { red: 0, blue: 0 },
    isHalftime: false,
    halftimeTimeRemaining: 0,
    ...overrides,
  };
}

describe('HalfTimeManager', () => {
  let state: GameState;
  let manager: HalfTimeManager;

  beforeEach(() => {
    state = createGameState();
    manager = new HalfTimeManager(state);
  });

  // ── shouldAddStoppageTime ─────────────────────────────────────
  describe('shouldAddStoppageTime', () => {
    it('returns true when halfTimeRemaining is exactly 60 and not yet notified', () => {
      state.halfTimeRemaining = 60;
      state.stoppageTimeNotified = false;
      expect(manager.shouldAddStoppageTime()).toBe(true);
    });

    it('returns false when already notified', () => {
      state.halfTimeRemaining = 60;
      state.stoppageTimeNotified = true;
      expect(manager.shouldAddStoppageTime()).toBe(false);
    });

    it('returns false when not at 60 seconds', () => {
      state.halfTimeRemaining = 59;
      expect(manager.shouldAddStoppageTime()).toBe(false);
    });
  });

  // ── calculateStoppageTime ─────────────────────────────────────
  describe('calculateStoppageTime', () => {
    it('returns value between 15 and 59', () => {
      for (let i = 0; i < 100; i++) {
        const time = manager.calculateStoppageTime();
        expect(time).toBeGreaterThanOrEqual(15);
        expect(time).toBeLessThanOrEqual(59);
      }
    });

    it('returns integer values', () => {
      for (let i = 0; i < 20; i++) {
        const time = manager.calculateStoppageTime();
        expect(time).toBe(Math.floor(time));
      }
    });
  });

  // ── addStoppageTime ───────────────────────────────────────────
  describe('addStoppageTime', () => {
    it('sets stoppageTimeAdded on state', () => {
      const time = manager.addStoppageTime();
      expect(state.stoppageTimeAdded).toBe(time);
    });

    it('marks stoppageTimeNotified as true', () => {
      manager.addStoppageTime();
      expect(state.stoppageTimeNotified).toBe(true);
    });

    it('returns the stoppage time amount', () => {
      const time = manager.addStoppageTime();
      expect(time).toBeGreaterThanOrEqual(15);
      expect(time).toBeLessThanOrEqual(59);
    });
  });

  // ── shouldEndHalf ─────────────────────────────────────────────
  describe('shouldEndHalf', () => {
    it('returns true when time reaches 0 and no stoppage time', () => {
      state.halfTimeRemaining = 0;
      state.stoppageTimeNotified = false;
      expect(manager.shouldEndHalf()).toBe(true);
    });

    it('returns false when time still remaining', () => {
      state.halfTimeRemaining = 30;
      expect(manager.shouldEndHalf()).toBe(false);
    });

    it('waits for stoppage time to elapse when notified', () => {
      state.stoppageTimeNotified = true;
      state.stoppageTimeAdded = 30;
      state.halfTimeRemaining = -20; // 20 seconds into stoppage
      expect(manager.shouldEndHalf()).toBe(false);
    });

    it('ends when full stoppage time elapsed', () => {
      state.stoppageTimeNotified = true;
      state.stoppageTimeAdded = 30;
      state.halfTimeRemaining = -30; // Exactly at stoppage time end
      expect(manager.shouldEndHalf()).toBe(true);
    });

    it('ends when past stoppage time', () => {
      state.stoppageTimeNotified = true;
      state.stoppageTimeAdded = 30;
      state.halfTimeRemaining = -35; // Past stoppage time
      expect(manager.shouldEndHalf()).toBe(true);
    });
  });

  // ── isInStoppageTime ──────────────────────────────────────────
  describe('isInStoppageTime', () => {
    it('returns false when time remaining is positive', () => {
      state.halfTimeRemaining = 30;
      expect(manager.isInStoppageTime()).toBe(false);
    });

    it('returns true when time remaining is 0', () => {
      state.halfTimeRemaining = 0;
      expect(manager.isInStoppageTime()).toBe(true);
    });

    it('returns true when time remaining is negative', () => {
      state.halfTimeRemaining = -10;
      expect(manager.isInStoppageTime()).toBe(true);
    });
  });

  // ── getLoggingInterval ────────────────────────────────────────
  describe('getLoggingInterval', () => {
    it('returns 30 during regular time', () => {
      state.halfTimeRemaining = 60;
      expect(manager.getLoggingInterval()).toBe(30);
    });

    it('returns 10 during stoppage time', () => {
      state.halfTimeRemaining = -5;
      expect(manager.getLoggingInterval()).toBe(10);
    });
  });

  // ── shouldPlayTickingSound ────────────────────────────────────
  describe('shouldPlayTickingSound', () => {
    it('returns true at 5 seconds remaining', () => {
      state.halfTimeRemaining = 5;
      expect(manager.shouldPlayTickingSound()).toBe(true);
    });

    it('returns false at other times during regulation', () => {
      state.halfTimeRemaining = 10;
      expect(manager.shouldPlayTickingSound()).toBe(false);
    });

    it('returns true 5 seconds before stoppage time ends', () => {
      state.stoppageTimeNotified = true;
      state.stoppageTimeAdded = 30;
      // Endpoint = -30, so 5 seconds before = -25
      state.halfTimeRemaining = -25;
      expect(manager.shouldPlayTickingSound()).toBe(true);
    });
  });

  // ── getHalfEndTransition ──────────────────────────────────────
  describe('getHalfEndTransition', () => {
    it('returns halftime for first half', () => {
      state.currentHalf = 1;
      expect(manager.getHalfEndTransition()).toBe('halftime');
    });

    it('returns end-of-regulation for second half', () => {
      state.currentHalf = 2;
      expect(manager.getHalfEndTransition()).toBe('end-of-regulation');
    });

    it('returns null for invalid half number', () => {
      state.currentHalf = 3;
      expect(manager.getHalfEndTransition()).toBeNull();
    });
  });

  // ── prepareHalftime ───────────────────────────────────────────
  describe('prepareHalftime', () => {
    it('sets halftime state correctly', () => {
      manager.prepareHalftime();
      expect(state.isHalftime).toBe(true);
      expect(state.halftimeTimeRemaining).toBe(0);
      expect(state.status).toBe('halftime');
    });
  });

  // ── prepareSecondHalf ─────────────────────────────────────────
  describe('prepareSecondHalf', () => {
    it('resets state for second half', () => {
      state.isHalftime = true;
      state.stoppageTimeNotified = true;
      state.stoppageTimeAdded = 45;
      manager.prepareSecondHalf(HALF_DURATION);
      expect(state.currentHalf).toBe(2);
      expect(state.halfTimeRemaining).toBe(HALF_DURATION);
      expect(state.timeRemaining).toBe(HALF_DURATION);
      expect(state.isHalftime).toBe(false);
      expect(state.stoppageTimeNotified).toBe(false);
      expect(state.stoppageTimeAdded).toBe(0);
      expect(state.status).toBe('in-progress');
    });
  });

  // ── decrementTime ─────────────────────────────────────────────
  describe('decrementTime', () => {
    it('decrements both time counters', () => {
      state.halfTimeRemaining = 100;
      state.timeRemaining = 200;
      manager.decrementTime();
      expect(state.halfTimeRemaining).toBe(99);
      expect(state.timeRemaining).toBe(199);
    });
  });

  // ── getStoppageTimeNotification ───────────────────────────────
  describe('getStoppageTimeNotification', () => {
    it('returns formatted notification string', () => {
      const msg = manager.getStoppageTimeNotification(30);
      expect(msg).toContain('30');
      expect(msg).toContain('stoppage time');
    });
  });

  // ── getTimeLogMessage ─────────────────────────────────────────
  describe('getTimeLogMessage', () => {
    it('includes STOPPAGE TIME during stoppage', () => {
      state.halfTimeRemaining = -10;
      state.stoppageTimeAdded = 30;
      const msg = manager.getTimeLogMessage();
      expect(msg).toContain('STOPPAGE TIME');
    });

    it('includes HALF during regular time', () => {
      state.halfTimeRemaining = 60;
      state.currentHalf = 1;
      const msg = manager.getTimeLogMessage();
      expect(msg).toContain('HALF 1');
    });
  });
});
