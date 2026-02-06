/**
 * LLM-specific Error Classes
 *
 * Provides typed error classes for LLM operations including timeout,
 * offline detection, and response errors. These enable structured error
 * handling throughout the LLM service layer.
 *
 * **Simple explanation**: When the AI model has problems (too slow, offline,
 * or returns bad data), these special error types tell us exactly what
 * went wrong so we can handle each situation appropriately.
 *
 * @module LLMErrors
 * @since MT-009.4
 */

import { ErrorCode } from './errorCodes';

/**
 * Base class for all LLM-related errors.
 *
 * **Simple explanation**: Like a family name for all AI-related errors,
 * so we can check if any error is "an LLM problem" with one simple check.
 */
export class LLMError extends Error {
    public readonly code: ErrorCode;
    public readonly operation: string;
    public readonly timestamp: Date;

    constructor(message: string, code: ErrorCode, operation: string) {
        super(message);
        this.name = 'LLMError';
        this.code = code;
        this.operation = operation;
        this.timestamp = new Date();

        // Maintains proper stack trace for where error was thrown (V8 engines)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Serialize error for logging or ticket creation.
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            operation: this.operation,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack,
        };
    }
}

/**
 * Error thrown when an LLM request times out.
 *
 * **Simple explanation**: Like a kitchen timer going off – the AI took
 * too long to respond, so we gave up waiting.
 */
export class LLMTimeoutError extends LLMError {
    public readonly timeoutMs: number;
    public readonly phase: 'startup' | 'streaming' | 'inactivity' | 'request';
    public readonly retrySuggestion: string;

    constructor(
        phase: 'startup' | 'streaming' | 'inactivity' | 'request',
        timeoutMs: number,
        context?: { model?: string; promptPreview?: string }
    ) {
        const phaseSuggestions: Record<string, string> = {
            startup: 'Check if the LLM server is running and responsive. Consider increasing startupTimeoutSeconds.',
            streaming: 'The model may be generating a long response. Consider increasing maxTokens or timeoutSeconds.',
            inactivity: 'The model stopped responding mid-generation. Check server logs for errors.',
            request: 'The request took too long. Consider increasing timeoutSeconds or simplifying the prompt.',
        };

        const modelInfo = context?.model ? ` (model: ${context.model})` : '';
        const message = `LLM ${phase} timeout after ${timeoutMs}ms${modelInfo}`;

        super(message, ErrorCode.TIMEOUT, `llm-${phase}`);
        this.name = 'LLMTimeoutError';
        this.timeoutMs = timeoutMs;
        this.phase = phase;
        this.retrySuggestion = phaseSuggestions[phase];
    }

    /**
     * Calculate suggested retry delay based on timeout phase.
     */
    getRetryDelayMs(): number {
        // Longer wait for startup issues, shorter for streaming
        return this.phase === 'startup' ? 60000 : 10000;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            timeoutMs: this.timeoutMs,
            phase: this.phase,
            retrySuggestion: this.retrySuggestion,
            retryDelayMs: this.getRetryDelayMs(),
        };
    }
}

/**
 * Error thrown when the LLM endpoint is unreachable (offline).
 *
 * **Simple explanation**: Like knocking on a door and nobody's home –
 * the AI server isn't responding at all.
 */
export class LLMOfflineError extends LLMError {
    public readonly endpoint: string;
    public readonly fallbackMessage: string;
    public readonly originalError?: Error;

    constructor(
        endpoint: string,
        fallbackMessage: string,
        originalError?: Error
    ) {
        const message = `LLM endpoint unreachable: ${endpoint}. ${fallbackMessage}`;
        super(message, ErrorCode.LLM_OFFLINE, 'llm-connection');
        this.name = 'LLMOfflineError';
        this.endpoint = endpoint;
        this.fallbackMessage = fallbackMessage;
        this.originalError = originalError;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            endpoint: this.endpoint,
            fallbackMessage: this.fallbackMessage,
            originalError: this.originalError?.message,
        };
    }
}

/**
 * Error thrown when the LLM returns a bad HTTP status code.
 *
 * **Simple explanation**: The AI server responded, but with an error code
 * like "too busy" (429), "bad request" (400), or "server crashed" (500).
 */
export class LLMResponseError extends LLMError {
    public readonly statusCode: number;
    public readonly statusText: string;
    public readonly responseBody?: string;
    public readonly parsedError?: { message: string; type?: string; param?: string };
    public readonly retryAfterMs?: number;

    constructor(
        statusCode: number,
        statusText: string,
        responseBody?: string
    ) {
        // Try to parse the response body for a more helpful error message
        let parsedError: { message: string; type?: string; param?: string } | undefined;
        let detailedMessage = `LLM HTTP error: ${statusCode} ${statusText}`;

        if (responseBody) {
            try {
                const errorJson = JSON.parse(responseBody);
                if (errorJson.error?.message) {
                    parsedError = {
                        message: errorJson.error.message,
                        type: errorJson.error.type,
                        param: errorJson.error.param,
                    };
                    // Use the API error message as the primary message
                    detailedMessage = `LLM error (${statusCode}): ${errorJson.error.message}`;
                }
            } catch {
                // Couldn't parse as JSON, use raw body if short enough
                if (responseBody.length < 500) {
                    detailedMessage = `LLM HTTP error: ${statusCode} ${statusText} - ${responseBody}`;
                }
            }
        }

        const code = statusCode === 429 ? ErrorCode.RATE_LIMIT : ErrorCode.LLM_ERROR;
        super(detailedMessage, code, 'llm-response');
        this.name = 'LLMResponseError';
        this.statusCode = statusCode;
        this.statusText = statusText;
        this.responseBody = responseBody;
        this.parsedError = parsedError;

        // Extract retry-after for rate limits
        if (statusCode === 429) {
            this.retryAfterMs = 30000; // Default 30 seconds for rate limit
        }
    }

    /**
     * Check if this is a model loading error.
     * These errors indicate the model isn't available or failed to load.
     */
    isModelLoadingError(): boolean {
        const msg = this.parsedError?.message || this.responseBody || '';
        return msg.includes('Failed to load model') || msg.includes('Model loading');
    }

    /**
     * Check if this is a rate limit error (429).
     */
    isRateLimited(): boolean {
        return this.statusCode === 429;
    }

    /**
     * Check if this is a server error (5xx).
     */
    isServerError(): boolean {
        return this.statusCode >= 500 && this.statusCode < 600;
    }

    /**
     * Check if this is a client error (4xx).
     */
    isClientError(): boolean {
        return this.statusCode >= 400 && this.statusCode < 500;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            statusCode: this.statusCode,
            statusText: this.statusText,
            responseBody: this.responseBody,
            retryAfterMs: this.retryAfterMs,
            isRateLimited: this.isRateLimited(),
            isServerError: this.isServerError(),
            isClientError: this.isClientError(),
        };
    }
}

// ============================================================================
// Type Guards and Helpers
// ============================================================================

/**
 * Check if an error is any type of LLM error.
 *
 * @param error - The error to check
 * @returns true if this is an LLMError or subclass
 */
export function isLLMError(error: unknown): error is LLMError {
    return error instanceof LLMError;
}

/**
 * Check if an error is an LLM timeout error.
 */
export function isLLMTimeoutError(error: unknown): error is LLMTimeoutError {
    return error instanceof LLMTimeoutError;
}

/**
 * Check if an error is an LLM offline error.
 */
export function isLLMOfflineError(error: unknown): error is LLMOfflineError {
    return error instanceof LLMOfflineError;
}

/**
 * Check if an error is an LLM response error.
 */
export function isLLMResponseError(error: unknown): error is LLMResponseError {
    return error instanceof LLMResponseError;
}

/**
 * Extract a user-friendly message from any LLM error.
 *
 * **Simple explanation**: Turns technical error details into a message
 * that makes sense to a human user.
 *
 * @param error - The error to extract a message from
 * @returns User-friendly error message
 */
export function getLLMErrorMessage(error: unknown): string {
    if (isLLMTimeoutError(error)) {
        return `Request timed out (${error.phase}). ${error.retrySuggestion}`;
    }
    if (isLLMOfflineError(error)) {
        return error.fallbackMessage;
    }
    if (isLLMResponseError(error)) {
        if (error.isRateLimited()) {
            return 'Too many requests. Please wait a moment and try again.';
        }
        if (error.isServerError()) {
            return 'The AI service encountered an error. Please try again later.';
        }
        return `Request failed: ${error.statusText}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
