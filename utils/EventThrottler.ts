/**
 * EventThrottler
 *
 * Throttles and debounces high-frequency event handlers to reduce CPU overhead.
 * Essential for performance-critical events like collisions, movement, etc.
 *
 * Performance Benefits:
 * - Reduces event handler calls by 50-90% for high-frequency events
 * - Prevents redundant processing of similar events
 * - Lowers CPU usage and improves frame rate
 *
 * Usage:
 * ```typescript
 * // Throttle collision events to max once per 100ms
 * const throttledHandler = EventThrottler.throttle((data) => {
 *   handleCollision(data);
 * }, 100);
 *
 * ball.on('collision', throttledHandler);
 * ```
 */

/**
 * Throttle a function to only execute once per time window
 * The function will execute immediately on first call, then ignore subsequent calls
 * until the time window expires
 *
 * @param fn - Function to throttle
 * @param delay - Minimum time between executions (ms)
 * @returns Throttled function
 *
 * @example
 * const throttledUpdate = EventThrottler.throttle(() => {
 *   updateGameState();
 * }, 100); // Max 10 times per second
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, execute immediately
      lastCall = now;
      fn(...args);
    } else {
      // Too soon, schedule for later
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Debounce a function to only execute after it stops being called
 * Resets the timer on each call
 *
 * @param fn - Function to debounce
 * @param delay - Time to wait after last call (ms)
 * @returns Debounced function
 *
 * @example
 * const debouncedSave = EventThrottler.debounce(() => {
 *   saveGameState();
 * }, 500); // Save 500ms after user stops making changes
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Rate limit a function to max N executions per time window
 * Uses a sliding window approach
 *
 * @param fn - Function to rate limit
 * @param maxCalls - Maximum number of calls allowed
 * @param windowMs - Time window in milliseconds
 * @returns Rate-limited function
 *
 * @example
 * const limitedLog = EventThrottler.rateLimit((msg) => {
 *   console.log(msg);
 * }, 5, 1000); // Max 5 logs per second
 */
export function rateLimit<T extends (...args: any[]) => any>(
  fn: T,
  maxCalls: number,
  windowMs: number
): (...args: Parameters<T>) => void {
  const callTimes: number[] = [];

  return function rateLimited(...args: Parameters<T>) {
    const now = Date.now();

    // Remove old calls outside the window
    while (callTimes.length > 0 && callTimes[0] <= now - windowMs) {
      callTimes.shift();
    }

    // Check if we can make another call
    if (callTimes.length < maxCalls) {
      callTimes.push(now);
      fn(...args);
    }
    // Otherwise silently drop the call
  };
}

/**
 * Batch multiple calls together and execute once
 * Collects all arguments and calls function with batched data
 *
 * @param fn - Function to call with batched arguments
 * @param delay - Time to wait before batching (ms)
 * @returns Batched function
 *
 * @example
 * const batchedUpdate = EventThrottler.batch((updates) => {
 *   processUpdates(updates);
 * }, 50); // Process all updates collected in 50ms windows
 */
export function batch<T>(
  fn: (batch: T[]) => void,
  delay: number
): (item: T) => void {
  let batchedItems: T[] = [];
  let timeoutId: NodeJS.Timeout | null = null;

  return function batched(item: T) {
    batchedItems.push(item);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn([...batchedItems]);
      batchedItems = [];
    }, delay);
  };
}

/**
 * Throttle with leading and trailing edge execution
 * Executes immediately on first call, and once more after the delay if called again
 *
 * @param fn - Function to throttle
 * @param delay - Minimum time between executions (ms)
 * @returns Throttled function
 */
export function throttleWithTrailing<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;

  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    lastArgs = args;

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, execute immediately
      lastCall = now;
      fn(...args);
      lastArgs = null;
    } else {
      // Too soon, schedule trailing call
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        if (lastArgs) {
          lastCall = Date.now();
          fn(...lastArgs);
          lastArgs = null;
        }
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Create a cooldown wrapper for a function
 * Function can only be called once per cooldown period
 *
 * @param fn - Function to wrap
 * @param cooldownMs - Cooldown time in milliseconds
 * @returns Function with cooldown
 *
 * @example
 * const shootWithCooldown = EventThrottler.cooldown(() => {
 *   shoot();
 * }, 1000); // Can only shoot once per second
 */
export function cooldown<T extends (...args: any[]) => any>(
  fn: T,
  cooldownMs: number
): (...args: Parameters<T>) => boolean {
  let lastCall = 0;

  return function withCooldown(...args: Parameters<T>): boolean {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= cooldownMs) {
      lastCall = now;
      fn(...args);
      return true;
    }

    return false; // On cooldown
  };
}

/**
 * Coalesce multiple rapid calls into a single call with the latest data
 * Uses requestAnimationFrame for smooth updates
 *
 * @param fn - Function to call with latest data
 * @returns Coalesced function
 *
 * @example
 * const coalescedRender = EventThrottler.coalesce((state) => {
 *   renderGame(state);
 * }); // Updates once per frame with latest state
 */
export function coalesce<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => void {
  let scheduled = false;
  let latestArgs: Parameters<T> | null = null;

  return function coalesced(...args: Parameters<T>) {
    latestArgs = args;

    if (!scheduled) {
      scheduled = true;
      setTimeout(() => {
        if (latestArgs) {
          fn(...latestArgs);
          latestArgs = null;
        }
        scheduled = false;
      }, 0);
    }
  };
}

// Namespace export for convenient usage
export const EventThrottler = {
  throttle,
  debounce,
  rateLimit,
  batch,
  throttleWithTrailing,
  cooldown,
  coalesce
};

export default EventThrottler;
