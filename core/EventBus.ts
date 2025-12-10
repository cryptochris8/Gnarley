/**
 * EventBus
 *
 * Event-driven architecture implementation for decoupling game systems.
 * Allows services to communicate without direct dependencies.
 *
 * Usage:
 *   eventBus.on('goal-scored', (data) => { ... });
 *   eventBus.emit('goal-scored', { team: 'red', player: 'John' });
 */

export type EventHandler<T = any> = (data: T) => void;

export interface EventBusEvents {
  // Match Events
  'match-started': void;
  'match-ended': { winner: 'red' | 'blue' | 'tie'; score: { red: number; blue: number } };
  'half-started': { half: number };
  'half-ended': { half: number };
  'halftime-started': void;
  'halftime-ended': void;
  'overtime-started': void;

  // Scoring Events
  'goal-scored': { team: 'red' | 'blue'; scorer?: string; assistedBy?: string };
  'goal-celebration': { team: 'red' | 'blue'; player: string };

  // Team Events
  'player-joined': { playerId: string; playerName: string; team: 'red' | 'blue' };
  'player-left': { playerId: string; playerName: string; team: 'red' | 'blue' };
  'team-changed': { playerId: string; oldTeam: 'red' | 'blue' | null; newTeam: 'red' | 'blue' };

  // Kickoff Events
  'kickoff-ready': { team: 'red' | 'blue'; reason: string };
  'kickoff-performed': { team: 'red' | 'blue' };

  // Ball Events
  'ball-out-sideline': { side: string; position: { x: number; y: number; z: number } };
  'ball-out-goal-line': { side: string; position: { x: number; y: number; z: number } };
  'throw-in': { team: 'red' | 'blue'; position: { x: number; y: number; z: number } };
  'corner-kick': { team: 'red' | 'blue'; position: { x: number; y: number; z: number } };
  'goal-kick': { team: 'red' | 'blue'; position: { x: number; y: number; z: number } };

  // Stoppage Events
  'stoppage-time-added': { seconds: number; half: number };

  // Statistics Events
  'stats-updated': { stats: any };
  'half-stats-shown': { half: number; stats: any };

  // Audio Events
  'music-change': { track: 'opening' | 'gameplay' };
  'crowd-reaction': { type: 'goal' | 'save' | 'near-miss' };
}

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private onceHandlers: Map<string, Set<EventHandler>> = new Map();
  private eventHistory: Array<{ event: string; timestamp: number; data?: any }> = [];
  private maxHistorySize: number = 100;

  /**
   * Subscribe to an event
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  public on<K extends keyof EventBusEvents>(
    event: K,
    handler: EventHandler<EventBusEvents[K]>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Subscribe to an event (fires only once)
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  public once<K extends keyof EventBusEvents>(
    event: K,
    handler: EventHandler<EventBusEvents[K]>
  ): () => void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.onceHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Unsubscribe from an event
   * @param event - Event name
   * @param handler - Event handler function to remove
   */
  public off<K extends keyof EventBusEvents>(
    event: K,
    handler: EventHandler<EventBusEvents[K]>
  ): void {
    this.handlers.get(event)?.delete(handler);
    this.onceHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   * @param event - Event name
   * @param data - Event data
   */
  public emit<K extends keyof EventBusEvents>(
    event: K,
    data?: EventBusEvents[K]
  ): void {
    // Record event in history
    this.recordEvent(event, data);

    // Call regular handlers
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      });
    }

    // Call once handlers and then remove them
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      onceHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in once handler for "${event}":`, error);
        }
      });
      this.onceHandlers.delete(event);
    }
  }

  /**
   * Remove all handlers for a specific event
   * @param event - Event name
   */
  public clearEvent<K extends keyof EventBusEvents>(event: K): void {
    this.handlers.delete(event);
    this.onceHandlers.delete(event);
  }

  /**
   * Remove all event handlers
   */
  public clearAll(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
  }

  /**
   * Get the number of handlers for an event
   * @param event - Event name
   * @returns Number of handlers
   */
  public listenerCount<K extends keyof EventBusEvents>(event: K): number {
    const regularCount = this.handlers.get(event)?.size || 0;
    const onceCount = this.onceHandlers.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * Check if an event has any listeners
   * @param event - Event name
   * @returns Whether the event has listeners
   */
  public hasListeners<K extends keyof EventBusEvents>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Get all registered event names
   * @returns Array of event names
   */
  public getEventNames(): string[] {
    const allEvents = new Set([
      ...this.handlers.keys(),
      ...this.onceHandlers.keys()
    ]);
    return Array.from(allEvents);
  }

  /**
   * Record an event in history
   * @param event - Event name
   * @param data - Event data
   */
  private recordEvent(event: string, data?: any): void {
    this.eventHistory.push({
      event,
      timestamp: Date.now(),
      data
    });

    // Limit history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history
   * @param eventName - Optional event name to filter by
   * @param limit - Maximum number of events to return
   * @returns Array of historical events
   */
  public getHistory(eventName?: string, limit: number = 50): Array<{ event: string; timestamp: number; data?: any }> {
    let history = this.eventHistory;

    if (eventName) {
      history = history.filter(entry => entry.event === eventName);
    }

    return history.slice(-limit);
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
  }
}

/**
 * Singleton instance for global event bus
 */
export const globalEventBus = new EventBus();
