/**
 * GameLogger - Centralized logging system with configurable log levels
 *
 * Reduces console spam in production by filtering logs based on level.
 * Set LOG_LEVEL environment variable to control verbosity:
 * - LOG_LEVEL=0 (ERROR only)
 * - LOG_LEVEL=1 (ERROR + WARN)
 * - LOG_LEVEL=2 (ERROR + WARN + INFO) - Default
 * - LOG_LEVEL=3 (ERROR + WARN + INFO + DEBUG)
 *
 * @example
 * const logger = GameLogger.getInstance();
 *
 * logger.error('Critical error!', { details });  // Always shown
 * logger.warn('Something might be wrong');       // Shown if level >= 1
 * logger.info('Game started');                   // Shown if level >= 2
 * logger.debug('AI decision details', data);     // Shown if level >= 3
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class GameLogger {
  private static instance: GameLogger;
  private level: LogLevel;
  private enableTimestamps: boolean;
  private enableColors: boolean;

  private constructor() {
    // Read log level from environment or default to INFO
    this.level = process.env.LOG_LEVEL
      ? parseInt(process.env.LOG_LEVEL)
      : LogLevel.INFO;

    this.enableTimestamps = process.env.LOG_TIMESTAMPS === 'true';
    this.enableColors = process.env.LOG_COLORS !== 'false'; // Enabled by default
  }

  static getInstance(): GameLogger {
    if (!GameLogger.instance) {
      GameLogger.instance = new GameLogger();
    }
    return GameLogger.instance;
  }

  /**
   * Set the logging level programmatically
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    console.log(`=Ý Log level changed to: ${LogLevel[level]}`);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Format message with optional timestamp
   */
  private formatMessage(prefix: string, message: string): string {
    if (this.enableTimestamps) {
      const timestamp = new Date().toISOString();
      return `[${timestamp}] ${prefix} ${message}`;
    }
    return `${prefix} ${message}`;
  }

  /**
   * Log an error message (always shown)
   * Use for critical issues that break functionality
   */
  error(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.ERROR) {
      const formatted = this.formatMessage('[ERROR]', message);
      console.error(formatted, ...args);
    }
  }

  /**
   * Log a warning message (shown if level >= WARN)
   * Use for issues that don't break functionality but should be addressed
   */
  warn(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.WARN) {
      const formatted = this.formatMessage('[WARN]', message);
      console.warn(formatted, ...args);
    }
  }

  /**
   * Log an info message (shown if level >= INFO)
   * Use for important game events and state changes
   */
  info(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.INFO) {
      const formatted = this.formatMessage('[INFO]', message);
      console.log(formatted, ...args);
    }
  }

  /**
   * Log a debug message (shown if level >= DEBUG)
   * Use for detailed debugging information
   */
  debug(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('[DEBUG]', message);
      console.log(formatted, ...args);
    }
  }

  /**
   * Log AI-specific debug info (shown if level >= DEBUG)
   * Prefixed with AI emoji for easy filtering
   */
  ai(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('[AI]', message);
      console.log(formatted, ...args);
    }
  }

  /**
   * Log physics-specific debug info (shown if level >= DEBUG)
   * Prefixed with physics emoji for easy filtering
   */
  physics(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('[PHYSICS]', message);
      console.log(formatted, ...args);
    }
  }

  /**
   * Log network-specific debug info (shown if level >= DEBUG)
   * Prefixed with network emoji for easy filtering
   */
  network(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('[NETWORK]', message);
      console.log(formatted, ...args);
    }
  }

  /**
   * Always log regardless of level (use sparingly!)
   * For critical announcements that must always be shown
   */
  always(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('[IMPORTANT]', message);
    console.log(formatted, ...args);
  }

  /**
   * Create a scoped logger for a specific system/component
   * Useful for consistent prefixing
   */
  createScope(scope: string): ScopedLogger {
    return new ScopedLogger(this, scope);
  }
}

/**
 * Scoped logger for consistent prefixing
 * Created via GameLogger.createScope()
 */
export class ScopedLogger {
  constructor(
    private logger: GameLogger,
    private scope: string
  ) {}

  private prefixMessage(message: string): string {
    return `[${this.scope}] ${message}`;
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(this.prefixMessage(message), ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(this.prefixMessage(message), ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(this.prefixMessage(message), ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug(this.prefixMessage(message), ...args);
  }
}

// Export singleton instance for convenience
export const logger = GameLogger.getInstance();

// Export scoped loggers for common systems
export const aiLogger = logger.createScope('AI');
export const physicsLogger = logger.createScope('PHYSICS');
export const networkLogger = logger.createScope('NETWORK');
export const gameLogger = logger.createScope('GAME');
