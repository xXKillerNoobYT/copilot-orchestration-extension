/**
 * Retry Logic with Exponential Backoff
 *
 * Provides retry mechanisms for database operations that may fail due to
 * SQLITE_BUSY or other transient errors.
 *
 * **Simple explanation**: When something fails, try again - but wait a
 * little longer each time. Like knocking on a door: knock, wait 1 sec,
 * knock, wait 2 sec, knock, wait 4 sec. This prevents hammering the
 * database when it's busy.
 *
 * @module ticketDb/retry
 * @since MT-007.2
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Retry configuration
 */
export interface RetryConfig {
    /** Maximum number of retry attempts (default: 5) */
    maxRetries: number;
    /** Base delay in ms before first retry (default: 100) */
    baseDelayMs: number;
    /** Maximum delay cap in ms (default: 5000) */
    maxDelayMs: number;
    /** Multiplier for exponential backoff (default: 2) */
    backoffMultiplier: number;
    /** Whether to add jitter to delays (default: true) */
    jitter: boolean;
    /** List of error codes/messages that should trigger retry */
    retryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 5,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: ['SQLITE_BUSY', 'SQLITE_LOCKED', 'database is locked'],
};

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
    /** The result value (if successful) */
    value?: T;
    /** Whether the operation succeeded */
    success: boolean;
    /** Number of attempts made */
    attempts: number;
    /** Total time spent (ms) */
    totalTimeMs: number;
    /** Error from last failed attempt (if failed) */
    lastError?: string;
    /** All errors encountered */
    errors: string[];
}

/**
 * Execute an operation with retry logic and exponential backoff.
 *
 * **Simple explanation**: Runs your function. If it fails with a "retryable"
 * error (like database busy), waits a bit and tries again. Each retry
 * waits longer than the last.
 *
 * @param operation - The async operation to execute
 * @param config - Optional retry configuration
 * @returns Result with value, attempt count, and timing
 *
 * @example
 * const result = await withRetry(
 *   () => updateTicketInDb(id, changes),
 *   { maxRetries: 3 }
 * );
 * if (result.success) {
 *   console.log('Updated after', result.attempts, 'attempt(s)');
 * }
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
): Promise<RetryResult<T>> {
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    const errors: string[] = [];

    for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
        try {
            const value = await operation();
            return {
                value,
                success: true,
                attempts: attempt,
                totalTimeMs: Date.now() - startTime,
                errors,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(msg);

            // Check if this is a retryable error
            if (!isRetryableError(msg, cfg.retryableErrors)) {
                logWarn(`Non-retryable error on attempt ${attempt}: ${msg}`);
                return {
                    success: false,
                    attempts: attempt,
                    totalTimeMs: Date.now() - startTime,
                    lastError: msg,
                    errors,
                };
            }

            // If we've exhausted retries, return failure
            if (attempt > cfg.maxRetries) {
                logWarn(`All ${cfg.maxRetries} retries exhausted: ${msg}`);
                return {
                    success: false,
                    attempts: attempt,
                    totalTimeMs: Date.now() - startTime,
                    lastError: msg,
                    errors,
                };
            }

            // Calculate delay with exponential backoff
            const delay = calculateDelay(attempt - 1, cfg);
            logInfo(`Retry ${attempt}/${cfg.maxRetries}: waiting ${delay}ms (${msg})`);
            await sleep(delay);
        }
    }

    // Should not reach here, but just in case
    return {
        success: false,
        attempts: cfg.maxRetries + 1,
        totalTimeMs: Date.now() - startTime,
        lastError: 'Max retries exceeded',
        errors,
    };
}

/**
 * Calculate the delay for a given retry attempt.
 *
 * **Simple explanation**: Figures out how long to wait before the next
 * retry. Uses exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
 * Optionally adds a random "jitter" so multiple retrying operations
 * don't all retry at the exact same time.
 *
 * @param attempt - The attempt number (0-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    const exponentialDelay = cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt);
    let delay = Math.min(exponentialDelay, cfg.maxDelayMs);

    // Add jitter (random ± 25%)
    if (cfg.jitter) {
        const jitterRange = delay * 0.25;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        delay = Math.max(0, delay + jitter);
    }

    return Math.round(delay);
}

/**
 * Check if an error message indicates a retryable condition.
 *
 * @param errorMessage - The error message to check
 * @param retryableErrors - List of retryable error patterns
 * @returns true if the error is retryable
 */
export function isRetryableError(
    errorMessage: string,
    retryableErrors: string[] = DEFAULT_RETRY_CONFIG.retryableErrors
): boolean {
    const lowerMsg = errorMessage.toLowerCase();
    return retryableErrors.some(pattern => lowerMsg.includes(pattern.toLowerCase()));
}

/**
 * Check if an error is specifically a SQLITE_BUSY error.
 *
 * @param error - The error to check
 * @returns true if SQLITE_BUSY
 */
export function isSqliteBusy(error: unknown): boolean {
    if (error instanceof Error) {
        return error.message.includes('SQLITE_BUSY') ||
               error.message.includes('database is locked');
    }
    return String(error).includes('SQLITE_BUSY');
}

/**
 * Check if an error is specifically a SQLITE_FULL error.
 *
 * @param error - The error to check
 * @returns true if SQLITE_FULL
 */
export function isSqliteFull(error: unknown): boolean {
    if (error instanceof Error) {
        return error.message.includes('SQLITE_FULL') ||
               error.message.includes('database or disk is full');
    }
    return String(error).includes('SQLITE_FULL');
}

// ─── Internal Helpers ────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
