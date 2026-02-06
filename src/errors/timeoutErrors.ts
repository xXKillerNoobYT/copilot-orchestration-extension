/**
 * Timeout and Rate Limit Error Handlers
 *
 * Provides helper functions for handling timeout and rate limit errors.
 * Includes retry suggestions to help callers recover from transient failures.
 *
 * **Simple explanation**: When operations take too long or we're making too
 * many requests too fast, these functions create errors with helpful suggestions
 * on what to do next (like "wait 5 seconds and try again").
 *
 * @module timeoutErrors
 * @since MT-002.3
 */

import { ErrorCode } from './errorCodes';

/**
 * Base interface for timeout/rate limit errors
 */
export interface TimeoutError {
    code: ErrorCode;
    message: string;
    operation?: string;
    timeoutMs?: number;
    retrySuggestion?: string;
    retryAfterMs?: number;
}

/**
 * Create a timeout error for an operation that took too long.
 *
 * **Simple explanation**: Like a kitchen timer going off - the operation
 * didn't finish in time, so we give up and report what happened.
 *
 * @param operation - Description of the operation that timed out
 * @param timeoutMs - How long we waited (in milliseconds)
 * @returns TimeoutError object with details and retry suggestion
 *
 * @example
 * const error = createTimeoutError('LLM request', 60000);
 * // Error: Operation 'LLM request' timed out after 60000ms
 */
export function createTimeoutError(
    operation: string,
    timeoutMs: number
): TimeoutError {
    const retryAfterMs = Math.min(timeoutMs * 2, 300000); // Double timeout, max 5 minutes

    return {
        code: ErrorCode.TIMEOUT,
        message: `Operation '${operation}' timed out after ${timeoutMs}ms`,
        operation,
        timeoutMs,
        retrySuggestion: `Consider increasing timeout or retry after ${retryAfterMs}ms`,
        retryAfterMs,
    };
}

/**
 * Throw a timeout error for an operation that took too long.
 *
 * @param operation - Description of the operation
 * @param timeoutMs - How long we waited
 * @throws Error with standardized message
 */
export function throwTimeout(operation: string, timeoutMs: number): never {
    const error = createTimeoutError(operation, timeoutMs);
    throw new Error(`[${error.code}] ${error.message}. ${error.retrySuggestion}`);
}

/**
 * Create a rate limit error when too many requests are made.
 *
 * **Simple explanation**: Like a bouncer saying "slow down, you're making
 * too many requests" - we need to wait before trying again.
 *
 * @param operation - Description of the operation that was rate limited
 * @param retryAfterMs - Suggested time to wait before retrying (optional)
 * @returns TimeoutError object with details and retry suggestion
 */
export function createRateLimitError(
    operation: string,
    retryAfterMs?: number
): TimeoutError {
    const suggestedWait = retryAfterMs ?? 30000; // Default 30 seconds

    return {
        code: ErrorCode.RATE_LIMIT,
        message: `Rate limit exceeded for '${operation}'`,
        operation,
        retrySuggestion: `Wait ${suggestedWait}ms before retrying`,
        retryAfterMs: suggestedWait,
    };
}

/**
 * Throw a rate limit error.
 *
 * @param operation - Description of the operation
 * @param retryAfterMs - Suggested time to wait (optional)
 * @throws Error with standardized message
 */
export function throwRateLimit(operation: string, retryAfterMs?: number): never {
    const error = createRateLimitError(operation, retryAfterMs);
    throw new Error(`[${error.code}] ${error.message}. ${error.retrySuggestion}`);
}

/**
 * Create an LLM-specific timeout error with context.
 *
 * **Simple explanation**: When the AI model takes too long to respond,
 * this creates a helpful error with suggestions specific to LLM operations.
 *
 * @param phase - Which phase of LLM operation timed out ('startup' | 'streaming' | 'inactivity')
 * @param timeoutMs - How long we waited
 * @param context - Additional context (e.g., model name, prompt preview)
 * @returns TimeoutError object with LLM-specific suggestions
 */
export function createLLMTimeoutError(
    phase: 'startup' | 'streaming' | 'inactivity',
    timeoutMs: number,
    context?: { model?: string; promptPreview?: string }
): TimeoutError {
    const phaseSuggestions: Record<string, string> = {
        startup: 'Check if the LLM server is running and responsive. Consider increasing startupTimeoutSeconds.',
        streaming: 'The model may be generating a long response. Consider increasing maxTokens or timeoutSeconds.',
        inactivity: 'The model stopped responding mid-generation. Check server logs for errors.',
    };

    return {
        code: ErrorCode.TIMEOUT,
        message: `LLM ${phase} timeout after ${timeoutMs}ms${context?.model ? ` (model: ${context.model})` : ''}`,
        operation: `llm-${phase}`,
        timeoutMs,
        retrySuggestion: phaseSuggestions[phase],
        retryAfterMs: phase === 'startup' ? 60000 : 10000, // Longer wait for startup
    };
}

/**
 * Calculate exponential backoff delay for retries.
 *
 * **Simple explanation**: Each retry waits longer than the last, like
 * "wait 1 second, then 2 seconds, then 4 seconds..." This prevents
 * overwhelming a server that's already struggling.
 *
 * @param attempt - The current attempt number (0-based)
 * @param baseDelayMs - Base delay in milliseconds (default 1000)
 * @param maxDelayMs - Maximum delay cap (default 60000)
 * @returns Delay in milliseconds for this attempt
 *
 * @example
 * calculateBackoff(0); // 1000ms
 * calculateBackoff(1); // 2000ms
 * calculateBackoff(2); // 4000ms
 * calculateBackoff(5); // 32000ms
 * calculateBackoff(10); // 60000ms (capped)
 */
export function calculateBackoff(
    attempt: number,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 60000
): number {
    const delay = baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, maxDelayMs);
}

/**
 * Check if an error is a timeout error.
 *
 * @param error - The error to check
 * @returns true if this is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
    if (error instanceof Error) {
        return (
            error.message.includes('[TIMEOUT]') ||
            error.message.includes('timeout') ||
            error.name === 'AbortError'
        );
    }
    return false;
}

/**
 * Check if an error is a rate limit error.
 *
 * @param error - The error to check
 * @returns true if this is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
        return (
            error.message.includes('[RATE_LIMIT]') ||
            error.message.includes('rate limit') ||
            error.message.includes('429')
        );
    }
    return false;
}

/**
 * Get retry delay from an error, if available.
 *
 * @param error - The error to extract retry info from
 * @returns Suggested retry delay in ms, or undefined if not available
 */
export function getRetryDelayFromError(error: unknown): number | undefined {
    if (error instanceof Error) {
        // Try to parse retry-after from error message
        const match = error.message.match(/retry after (\d+)ms/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return undefined;
}
