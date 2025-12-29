/**
 * AI Module - Performance Optimization Caches
 *
 * This module exports performance optimization utilities for the Hytopia Soccer AI system.
 * These caches reduce computational overhead and improve game performance.
 *
 * Usage:
 * ```typescript
 * import { globalBallDistanceCache, globalThreatAnalysisCache } from './ai';
 *
 * // Update caches once per tick
 * globalBallDistanceCache.updateForTick(ball, allAIPlayers);
 * globalThreatAnalysisCache.updateForTeam('red', blueOpponents);
 * globalThreatAnalysisCache.updateForTeam('blue', redOpponents);
 *
 * // Use in AI decision-making
 * const distance = globalBallDistanceCache.getDistance(playerId);
 * const threatLevel = globalThreatAnalysisCache.getThreatLevel(position, team);
 * ```
 */

// Ball Distance Cache - O(1) ball distance lookups
export {
  BallDistanceCache,
  globalBallDistanceCache,
  type PlayerDistanceInfo
} from './BallDistanceCache';

// Threat Analysis Cache - Pre-computed opponent positions and threat levels
export {
  ThreatAnalysisCache,
  globalThreatAnalysisCache,
  type OpponentInfo,
  type ThreatZone,
  type ThreatAnalysisStats
} from './ThreatAnalysisCache';

// Decision Caching - General-purpose decision caching
export {
  DecisionCache,
  globalDecisionCache,
  type CacheEntry
} from './DecisionCache';

// AI Decision Cache - Advanced decision caching with context awareness
export {
  AIDecisionCache,
  aiDecisionCache,
  type CacheKey,
  type CachedDecision,
  type CacheStats,
  type CacheConfig
} from './AIDecisionCache';

// Re-export adaptive controller if needed
export { AdaptiveAIController } from './AdaptiveAIController';

// Re-export cached soccer agent if needed
export { CachedSoccerAgent } from './CachedSoccerAgent';
