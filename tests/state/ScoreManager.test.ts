import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScoreManager } from '../../state/game/ScoreManager';

describe('ScoreManager', () => {
  let scoreManager: ScoreManager;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    scoreManager = new ScoreManager();
  });

  // ── Constructor ──────────────────────────────────────────────
  describe('constructor', () => {
    it('initializes red score to 0', () => {
      expect(scoreManager.getTeamScore('red')).toBe(0);
    });

    it('initializes blue score to 0', () => {
      expect(scoreManager.getTeamScore('blue')).toBe(0);
    });

    it('initializes score as {red: 0, blue: 0}', () => {
      expect(scoreManager.getScore()).toEqual({ red: 0, blue: 0 });
    });
  });

  // ── addGoal ──────────────────────────────────────────────────
  describe('addGoal', () => {
    it('increments red score by 1', () => {
      scoreManager.addGoal('red');
      expect(scoreManager.getTeamScore('red')).toBe(1);
    });

    it('increments blue score by 1', () => {
      scoreManager.addGoal('blue');
      expect(scoreManager.getTeamScore('blue')).toBe(1);
    });

    it('does not affect the other team score', () => {
      scoreManager.addGoal('red');
      expect(scoreManager.getTeamScore('blue')).toBe(0);
    });

    it('increments correctly with multiple goals', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('red');
      scoreManager.addGoal('red');
      expect(scoreManager.getTeamScore('red')).toBe(3);
    });

    it('tracks both teams independently', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('blue');
      scoreManager.addGoal('red');
      expect(scoreManager.getScore()).toEqual({ red: 2, blue: 1 });
    });
  });

  // ── getScore ─────────────────────────────────────────────────
  describe('getScore', () => {
    it('returns an object with red and blue properties', () => {
      const score = scoreManager.getScore();
      expect(score).toHaveProperty('red');
      expect(score).toHaveProperty('blue');
    });

    it('returns a copy, not a reference to internal state', () => {
      const score1 = scoreManager.getScore();
      score1.red = 999;
      const score2 = scoreManager.getScore();
      expect(score2.red).toBe(0);
    });

    it('returns different object references on each call', () => {
      const score1 = scoreManager.getScore();
      const score2 = scoreManager.getScore();
      expect(score1).not.toBe(score2);
    });

    it('reflects goals after they are scored', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('blue');
      scoreManager.addGoal('blue');
      expect(scoreManager.getScore()).toEqual({ red: 1, blue: 2 });
    });
  });

  // ── getTeamScore ─────────────────────────────────────────────
  describe('getTeamScore', () => {
    it('returns 0 for red initially', () => {
      expect(scoreManager.getTeamScore('red')).toBe(0);
    });

    it('returns 0 for blue initially', () => {
      expect(scoreManager.getTeamScore('blue')).toBe(0);
    });

    it('returns updated score after goals', () => {
      scoreManager.addGoal('blue');
      scoreManager.addGoal('blue');
      expect(scoreManager.getTeamScore('blue')).toBe(2);
    });
  });

  // ── isTied ───────────────────────────────────────────────────
  describe('isTied', () => {
    it('returns true when both scores are 0', () => {
      expect(scoreManager.isTied()).toBe(true);
    });

    it('returns true when both scores are equal and non-zero', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('blue');
      expect(scoreManager.isTied()).toBe(true);
    });

    it('returns false when red is ahead', () => {
      scoreManager.addGoal('red');
      expect(scoreManager.isTied()).toBe(false);
    });

    it('returns false when blue is ahead', () => {
      scoreManager.addGoal('blue');
      expect(scoreManager.isTied()).toBe(false);
    });
  });

  // ── getWinningTeam ───────────────────────────────────────────
  describe('getWinningTeam', () => {
    it('returns null when tied at 0-0', () => {
      expect(scoreManager.getWinningTeam()).toBeNull();
    });

    it('returns null when tied at non-zero scores', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('blue');
      expect(scoreManager.getWinningTeam()).toBeNull();
    });

    it('returns "red" when red is winning', () => {
      scoreManager.addGoal('red');
      expect(scoreManager.getWinningTeam()).toBe('red');
    });

    it('returns "blue" when blue is winning', () => {
      scoreManager.addGoal('blue');
      expect(scoreManager.getWinningTeam()).toBe('blue');
    });

    it('returns correct winner after multiple goals', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('red');
      scoreManager.addGoal('blue');
      expect(scoreManager.getWinningTeam()).toBe('red');
    });

    it('updates winner correctly as game progresses', () => {
      scoreManager.addGoal('red');
      expect(scoreManager.getWinningTeam()).toBe('red');
      scoreManager.addGoal('blue');
      expect(scoreManager.getWinningTeam()).toBeNull();
      scoreManager.addGoal('blue');
      expect(scoreManager.getWinningTeam()).toBe('blue');
    });
  });

  // ── reset ────────────────────────────────────────────────────
  describe('reset', () => {
    it('sets red score back to 0', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('red');
      scoreManager.reset();
      expect(scoreManager.getTeamScore('red')).toBe(0);
    });

    it('sets blue score back to 0', () => {
      scoreManager.addGoal('blue');
      scoreManager.addGoal('blue');
      scoreManager.addGoal('blue');
      scoreManager.reset();
      expect(scoreManager.getTeamScore('blue')).toBe(0);
    });

    it('resets both scores to {red: 0, blue: 0}', () => {
      scoreManager.addGoal('red');
      scoreManager.addGoal('blue');
      scoreManager.addGoal('red');
      scoreManager.reset();
      expect(scoreManager.getScore()).toEqual({ red: 0, blue: 0 });
    });

    it('game is tied after reset', () => {
      scoreManager.addGoal('red');
      scoreManager.reset();
      expect(scoreManager.isTied()).toBe(true);
    });

    it('no winning team after reset', () => {
      scoreManager.addGoal('blue');
      scoreManager.reset();
      expect(scoreManager.getWinningTeam()).toBeNull();
    });
  });
});
