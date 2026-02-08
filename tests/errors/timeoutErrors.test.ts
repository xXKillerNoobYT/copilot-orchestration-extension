/**
 * Tests for Timeout and Rate Limit Error Handlers
 *
 * Tests timeout error creation, rate limit handling, LLM-specific timeouts,
 * exponential backoff calculation, and error detection functions defined
 * in src/errors/timeoutErrors.ts.
 *
 * **Simple explanation**: Verifies that all the "took too long" and
 * "too many requests" error helpers produce correct messages, codes,
 * retry suggestions, and backoff calculations.
 */

import {
    TimeoutError,
    createTimeoutError,
    throwTimeout,
    createRateLimitError,
    throwRateLimit,
    createLLMTimeoutError,
    calculateBackoff,
    isTimeoutError,
    isRateLimitError,
    getRetryDelayFromError,
} from '../../src/errors/timeoutErrors';
import { ErrorCode } from '../../src/errors/errorCodes';

describe('timeoutErrors', () => {
    // ── createTimeoutError ────────────────────────────────────────────

    describe('createTimeoutError', () => {
        it('Test 1: should create error with correct code and message', () => {
            const error = createTimeoutError('LLM request', 60000);

            expect(error.code).toBe(ErrorCode.TIMEOUT);
            expect(error.message).toBe(
                "Operation 'LLM request' timed out after 60000ms"
            );
        });

        it('Test 2: should include operation and timeoutMs properties', () => {
            const error = createTimeoutError('database query', 5000);

            expect(error.operation).toBe('database query');
            expect(error.timeoutMs).toBe(5000);
        });

        it('Test 3: should set retryAfterMs to double the timeout', () => {
            const error = createTimeoutError('fetch', 10000);

            expect(error.retryAfterMs).toBe(20000);
        });

        it('Test 4: should cap retryAfterMs at 300000ms (5 minutes)', () => {
            const error = createTimeoutError('big operation', 200000);

            expect(error.retryAfterMs).toBe(300000);
        });

        it('Test 5: should include retry suggestion referencing the delay', () => {
            const error = createTimeoutError('op', 5000);

            expect(error.retrySuggestion).toBeDefined();
            expect(error.retrySuggestion).toContain('10000ms');
        });

        it('Test 6: should handle very small timeout values', () => {
            const error = createTimeoutError('fast-op', 1);

            expect(error.timeoutMs).toBe(1);
            expect(error.retryAfterMs).toBe(2);
            expect(error.message).toContain('1ms');
        });
    });

    // ── throwTimeout ──────────────────────────────────────────────────

    describe('throwTimeout', () => {
        it('Test 7: should throw Error with code prefix, message, and retry suggestion', () => {
            try {
                throwTimeout('network call', 3000);
                fail('Expected throwTimeout to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toContain('[TIMEOUT]');
                expect(err.message).toContain("Operation 'network call' timed out after 3000ms");
                expect(err.message).toContain('Consider increasing timeout');
            }
        });

        it('Test 8: should always throw (never return)', () => {
            let didThrow = false;
            try {
                throwTimeout('op', 100);
            } catch {
                didThrow = true;
            }
            expect(didThrow).toBe(true);
        });
    });

    // ── createRateLimitError ──────────────────────────────────────────

    describe('createRateLimitError', () => {
        it('Test 9: should create rate limit error with RATE_LIMIT code', () => {
            const error = createRateLimitError('API call', 5000);

            expect(error.code).toBe(ErrorCode.RATE_LIMIT);
            expect(error.message).toBe("Rate limit exceeded for 'API call'");
        });

        it('Test 10: should use provided retryAfterMs', () => {
            const error = createRateLimitError('POST /data', 15000);

            expect(error.retryAfterMs).toBe(15000);
            expect(error.retrySuggestion).toContain('15000ms');
        });

        it('Test 11: should default retryAfterMs to 30000 when not provided', () => {
            const error = createRateLimitError('GET /status');

            expect(error.retryAfterMs).toBe(30000);
            expect(error.retrySuggestion).toContain('30000ms');
        });

        it('Test 12: should include the operation in the error', () => {
            const error = createRateLimitError('LLM chat completion');

            expect(error.operation).toBe('LLM chat completion');
        });
    });

    // ── throwRateLimit ────────────────────────────────────────────────

    describe('throwRateLimit', () => {
        it('Test 13: should throw Error with RATE_LIMIT code and retry suggestion', () => {
            try {
                throwRateLimit('api-call', 10000);
                fail('Expected throwRateLimit to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toContain('[RATE_LIMIT]');
                expect(err.message).toContain("Rate limit exceeded for 'api-call'");
                expect(err.message).toContain('Wait 10000ms');
            }
        });

        it('Test 14: should throw with default retry when retryAfterMs omitted', () => {
            try {
                throwRateLimit('batch-request');
                fail('Expected throwRateLimit to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('30000ms');
            }
        });
    });

    // ── createLLMTimeoutError ─────────────────────────────────────────

    describe('createLLMTimeoutError', () => {
        it('Test 15: should create startup phase timeout with correct suggestion', () => {
            const error = createLLMTimeoutError('startup', 10000);

            expect(error.code).toBe(ErrorCode.TIMEOUT);
            expect(error.message).toContain('LLM startup timeout');
            expect(error.message).toContain('10000ms');
            expect(error.operation).toBe('llm-startup');
            expect(error.retrySuggestion).toContain('LLM server');
            expect(error.retryAfterMs).toBe(60000);
        });

        it('Test 16: should create streaming phase timeout with correct suggestion', () => {
            const error = createLLMTimeoutError('streaming', 30000);

            expect(error.message).toContain('LLM streaming timeout');
            expect(error.operation).toBe('llm-streaming');
            expect(error.retrySuggestion).toContain('maxTokens');
            expect(error.retryAfterMs).toBe(10000);
        });

        it('Test 17: should create inactivity phase timeout with correct suggestion', () => {
            const error = createLLMTimeoutError('inactivity', 5000);

            expect(error.message).toContain('LLM inactivity timeout');
            expect(error.operation).toBe('llm-inactivity');
            expect(error.retrySuggestion).toContain('stopped responding');
            expect(error.retryAfterMs).toBe(10000);
        });

        it('Test 18: should include model name in message when context is provided', () => {
            const error = createLLMTimeoutError('startup', 5000, {
                model: 'ministral-3-14b',
            });

            expect(error.message).toContain('model: ministral-3-14b');
        });

        it('Test 19: should omit model from message when context has no model', () => {
            const error = createLLMTimeoutError('streaming', 5000, {});

            expect(error.message).not.toContain('model:');
        });

        it('Test 20: should omit model from message when no context provided', () => {
            const error = createLLMTimeoutError('startup', 5000);

            expect(error.message).not.toContain('model:');
        });
    });

    // ── calculateBackoff ──────────────────────────────────────────────

    describe('calculateBackoff', () => {
        it('Test 21: should return baseDelayMs for attempt 0', () => {
            expect(calculateBackoff(0)).toBe(1000);
        });

        it('Test 22: should double delay for each subsequent attempt', () => {
            expect(calculateBackoff(0)).toBe(1000);
            expect(calculateBackoff(1)).toBe(2000);
            expect(calculateBackoff(2)).toBe(4000);
            expect(calculateBackoff(3)).toBe(8000);
            expect(calculateBackoff(4)).toBe(16000);
            expect(calculateBackoff(5)).toBe(32000);
        });

        it('Test 23: should cap at maxDelayMs (default 60000)', () => {
            expect(calculateBackoff(10)).toBe(60000);
            expect(calculateBackoff(20)).toBe(60000);
        });

        it('Test 24: should respect custom baseDelayMs', () => {
            expect(calculateBackoff(0, 500)).toBe(500);
            expect(calculateBackoff(1, 500)).toBe(1000);
            expect(calculateBackoff(2, 500)).toBe(2000);
        });

        it('Test 25: should respect custom maxDelayMs', () => {
            expect(calculateBackoff(10, 1000, 5000)).toBe(5000);
        });

        it('Test 26: should handle edge case where baseDelayMs exceeds maxDelayMs', () => {
            expect(calculateBackoff(0, 10000, 5000)).toBe(5000);
        });
    });

    // ── isTimeoutError ────────────────────────────────────────────────

    describe('isTimeoutError', () => {
        it('Test 27: should detect errors with [TIMEOUT] prefix', () => {
            const error = new Error('[TIMEOUT] Operation timed out');
            expect(isTimeoutError(error)).toBe(true);
        });

        it('Test 28: should detect errors containing "timeout" (case insensitive match)', () => {
            const error = new Error('Connection timeout after 30s');
            expect(isTimeoutError(error)).toBe(true);
        });

        it('Test 29: should detect AbortError by name', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            expect(isTimeoutError(error)).toBe(true);
        });

        it('Test 30: should return false for non-timeout errors', () => {
            const error = new Error('Something else went wrong');
            expect(isTimeoutError(error)).toBe(false);
        });

        it('Test 31: should return false for non-Error values', () => {
            expect(isTimeoutError(null)).toBe(false);
            expect(isTimeoutError(undefined)).toBe(false);
            expect(isTimeoutError('timeout string')).toBe(false);
            expect(isTimeoutError(42)).toBe(false);
        });

        it('Test 32: should detect errors thrown by throwTimeout', () => {
            try {
                throwTimeout('op', 1000);
            } catch (e: unknown) {
                expect(isTimeoutError(e)).toBe(true);
            }
        });
    });

    // ── isRateLimitError ──────────────────────────────────────────────

    describe('isRateLimitError', () => {
        it('Test 33: should detect errors with [RATE_LIMIT] prefix', () => {
            const error = new Error('[RATE_LIMIT] Too many requests');
            expect(isRateLimitError(error)).toBe(true);
        });

        it('Test 34: should detect errors containing "rate limit"', () => {
            const error = new Error('You hit the rate limit');
            expect(isRateLimitError(error)).toBe(true);
        });

        it('Test 35: should detect errors containing "429"', () => {
            const error = new Error('HTTP 429 Too Many Requests');
            expect(isRateLimitError(error)).toBe(true);
        });

        it('Test 36: should return false for non-rate-limit errors', () => {
            const error = new Error('Regular server error');
            expect(isRateLimitError(error)).toBe(false);
        });

        it('Test 37: should return false for non-Error values', () => {
            expect(isRateLimitError(null)).toBe(false);
            expect(isRateLimitError(undefined)).toBe(false);
            expect(isRateLimitError('rate limit string')).toBe(false);
        });

        it('Test 38: should detect errors thrown by throwRateLimit', () => {
            try {
                throwRateLimit('api', 5000);
            } catch (e: unknown) {
                expect(isRateLimitError(e)).toBe(true);
            }
        });
    });

    // ── getRetryDelayFromError ────────────────────────────────────────

    describe('getRetryDelayFromError', () => {
        it('Test 39: should extract retry delay from error message', () => {
            const error = new Error('Rate limited, retry after 5000ms');
            expect(getRetryDelayFromError(error)).toBe(5000);
        });

        it('Test 40: should return undefined when no retry info in message', () => {
            const error = new Error('Generic error with no retry info');
            expect(getRetryDelayFromError(error)).toBeUndefined();
        });

        it('Test 41: should return undefined for non-Error values', () => {
            expect(getRetryDelayFromError(null)).toBeUndefined();
            expect(getRetryDelayFromError(undefined)).toBeUndefined();
            expect(getRetryDelayFromError('string')).toBeUndefined();
            expect(getRetryDelayFromError(42)).toBeUndefined();
        });

        it('Test 42: should extract delay from throwTimeout error messages', () => {
            try {
                throwTimeout('op', 5000);
            } catch (e: unknown) {
                const delay = getRetryDelayFromError(e);
                // throwTimeout includes "retry after {retryAfterMs}ms" in the message
                expect(delay).toBe(10000);
            }
        });

        it('Test 43: should return undefined for throwRateLimit errors (message format not matched)', () => {
            // throwRateLimit produces "Wait Xms before retrying" which does not
            // match the regex /retry after (\d+)ms/i, so no delay is extracted.
            try {
                throwRateLimit('api', 7000);
            } catch (e: unknown) {
                const delay = getRetryDelayFromError(e);
                expect(delay).toBeUndefined();
            }
        });
    });
});
