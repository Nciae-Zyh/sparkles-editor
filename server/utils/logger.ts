/**
 * Logger utility for Cloudflare Workers
 * In server-side code, logs are sent to Cloudflare Observability
 * In client-side code, logs are suppressed in production to avoid browser console output
 */

// Check if we're in development mode
// For client-side, check import.meta.dev if available
// For server-side, always log (goes to Cloudflare Observability)
function isDevelopment(): boolean {
  // Server-side: always return true (logs go to Cloudflare)
  if (typeof window === 'undefined') {
    return true
  }
  // Client-side: check if in development mode
  try {
    return typeof import.meta !== 'undefined' && import.meta.dev === true
  } catch {
    return process.env.NODE_ENV === 'development'
  }
}

interface LogContext {
  [key: string]: any
}

class Logger {
  private prefix: string

  constructor(prefix: string = '') {
    this.prefix = prefix
  }

  private formatMessage(message: string, context?: LogContext): string {
    if (this.prefix) {
      return `[${this.prefix}] ${message}`
    }
    return message
  }

  log(message: string, context?: LogContext): void {
    // Server-side: always log (goes to Cloudflare Observability)
    // Client-side: only log in development
    if (typeof window === 'undefined' || isDevelopment()) {
      const formattedMessage = this.formatMessage(message)
      if (context) {
        console.log(formattedMessage, context)
      } else {
        console.log(formattedMessage)
      }
    }
  }

  error(message: string, context?: LogContext): void {
    // Server-side: always log (goes to Cloudflare Observability)
    // Client-side: only log in development
    if (typeof window === 'undefined' || isDevelopment()) {
      const formattedMessage = this.formatMessage(message)
      if (context) {
        console.error(formattedMessage, context)
      } else {
        console.error(formattedMessage)
      }
    }
  }

  warn(message: string, context?: LogContext): void {
    // Server-side: always log (goes to Cloudflare Observability)
    // Client-side: only log in development
    if (typeof window === 'undefined' || isDevelopment()) {
      const formattedMessage = this.formatMessage(message)
      if (context) {
        console.warn(formattedMessage, context)
      } else {
        console.warn(formattedMessage)
      }
    }
  }

  info(message: string, context?: LogContext): void {
    // Server-side: always log (goes to Cloudflare Observability)
    // Client-side: only log in development
    if (typeof window === 'undefined' || isDevelopment()) {
      const formattedMessage = this.formatMessage(message)
      if (context) {
        console.info(formattedMessage, context)
      } else {
        console.info(formattedMessage)
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    // Server-side: always log (goes to Cloudflare Observability)
    // Client-side: only log in development
    if (typeof window === 'undefined' || isDevelopment()) {
      const formattedMessage = this.formatMessage(message)
      if (context) {
        console.debug(formattedMessage, context)
      } else {
        console.debug(formattedMessage)
      }
    }
  }
}

/**
 * Create a logger instance with optional prefix
 */
export function createLogger(prefix?: string): Logger {
  return new Logger(prefix)
}

/**
 * Default logger instance
 */
export const logger = createLogger()
