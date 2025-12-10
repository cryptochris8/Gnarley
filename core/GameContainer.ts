/**
 * GameContainer
 *
 * Dependency Injection container for managing game services.
 * Provides service registration, resolution, and lifecycle management.
 *
 * Usage:
 *   container.register('matchTime', () => new MatchTimeService(world, eventBus));
 *   const matchTimeService = container.resolve<MatchTimeService>('matchTime');
 */

export type ServiceFactory<T> = () => T;

export interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  instance?: T;
  singleton: boolean;
}

export class GameContainer {
  private services: Map<string, ServiceRegistration> = new Map();
  private resolutionStack: string[] = []; // For circular dependency detection

  /**
   * Register a service factory
   * @param key - Service identifier
   * @param factory - Factory function that creates the service
   * @param options - Registration options
   */
  public register<T>(
    key: string,
    factory: ServiceFactory<T>,
    options: { singleton?: boolean } = { singleton: true }
  ): void {
    if (this.services.has(key)) {
      console.warn(`Service "${key}" is already registered. Overwriting.`);
    }

    this.services.set(key, {
      factory,
      singleton: options.singleton ?? true
    });
  }

  /**
   * Register a singleton service (always returns the same instance)
   * @param key - Service identifier
   * @param factory - Factory function that creates the service
   */
  public registerSingleton<T>(key: string, factory: ServiceFactory<T>): void {
    this.register(key, factory, { singleton: true });
  }

  /**
   * Register a transient service (creates a new instance each time)
   * @param key - Service identifier
   * @param factory - Factory function that creates the service
   */
  public registerTransient<T>(key: string, factory: ServiceFactory<T>): void {
    this.register(key, factory, { singleton: false });
  }

  /**
   * Register an existing instance as a singleton
   * @param key - Service identifier
   * @param instance - Service instance
   */
  public registerInstance<T>(key: string, instance: T): void {
    this.services.set(key, {
      factory: () => instance,
      instance,
      singleton: true
    });
  }

  /**
   * Resolve a service by its key
   * @param key - Service identifier
   * @returns Service instance
   * @throws Error if service is not found or circular dependency detected
   */
  public resolve<T>(key: string): T {
    const registration = this.services.get(key);

    if (!registration) {
      throw new Error(`Service "${key}" not found. Did you forget to register it?`);
    }

    // Check for circular dependencies
    if (this.resolutionStack.includes(key)) {
      const cycle = [...this.resolutionStack, key].join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    // If singleton and already instantiated, return cached instance
    if (registration.singleton && registration.instance) {
      return registration.instance as T;
    }

    // Add to resolution stack for circular dependency detection
    this.resolutionStack.push(key);

    try {
      const instance = registration.factory();

      // Cache singleton instance
      if (registration.singleton) {
        registration.instance = instance;
      }

      return instance as T;
    } finally {
      // Remove from resolution stack
      this.resolutionStack.pop();
    }
  }

  /**
   * Try to resolve a service, returning undefined if not found
   * @param key - Service identifier
   * @returns Service instance or undefined
   */
  public tryResolve<T>(key: string): T | undefined {
    try {
      return this.resolve<T>(key);
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Check if a service is registered
   * @param key - Service identifier
   * @returns Whether the service is registered
   */
  public has(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * Unregister a service
   * @param key - Service identifier
   */
  public unregister(key: string): void {
    this.services.delete(key);
  }

  /**
   * Clear all registered services
   */
  public clear(): void {
    this.services.clear();
  }

  /**
   * Get all registered service keys
   * @returns Array of service keys
   */
  public getServiceKeys(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get the number of registered services
   * @returns Number of services
   */
  public size(): number {
    return this.services.size;
  }

  /**
   * Reset a singleton instance (forces recreation on next resolve)
   * @param key - Service identifier
   */
  public resetSingleton(key: string): void {
    const registration = this.services.get(key);
    if (registration && registration.singleton) {
      delete registration.instance;
    }
  }

  /**
   * Reset all singleton instances
   */
  public resetAllSingletons(): void {
    this.services.forEach(registration => {
      if (registration.singleton) {
        delete registration.instance;
      }
    });
  }

  /**
   * Create a child container that inherits parent services
   * @returns New child container
   */
  public createChild(): GameContainer {
    const child = new GameContainer();

    // Copy parent services to child
    this.services.forEach((registration, key) => {
      child.services.set(key, { ...registration });
    });

    return child;
  }

  /**
   * Get diagnostic information about registered services
   * @returns Service diagnostics
   */
  public getDiagnostics(): {
    totalServices: number;
    singletons: number;
    transients: number;
    instantiated: number;
    services: Array<{ key: string; singleton: boolean; instantiated: boolean }>;
  } {
    const services = Array.from(this.services.entries()).map(([key, reg]) => ({
      key,
      singleton: reg.singleton,
      instantiated: !!reg.instance
    }));

    return {
      totalServices: services.length,
      singletons: services.filter(s => s.singleton).length,
      transients: services.filter(s => !s.singleton).length,
      instantiated: services.filter(s => s.instantiated).length,
      services
    };
  }
}

/**
 * Global container instance
 */
export const globalContainer = new GameContainer();
