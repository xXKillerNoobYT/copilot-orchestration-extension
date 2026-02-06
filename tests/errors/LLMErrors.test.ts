/**
 * Tests for LLM Error Classes
 *
 * Tests the error classes defined in src/errors/LLMErrors.ts
 */

import {
    LLMError,
    LLMTimeoutError,
    LLMOfflineError,
    LLMResponseError,
    isLLMError,
    isLLMTimeoutError,
    isLLMOfflineError,
    isLLMResponseError,
    getLLMErrorMessage,
} from '../../src/errors/LLMErrors';
import { ErrorCode } from '../../src/errors/errorCodes';

describe('LLMErrors', () => {
    describe('LLMError base class', () => {
        it('Test 1: should create base error with correct properties', () => {
            const error = new LLMError('Test message', ErrorCode.INTERNAL_ERROR, 'test-op');

            expect(error.message).toBe('Test message');
            expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
            expect(error.operation).toBe('test-op');
            expect(error.timestamp).toBeInstanceOf(Date);
            expect(error.name).toBe('LLMError');
        });

        it('Test 2: should serialize to JSON', () => {
            const error = new LLMError('Test', ErrorCode.INTERNAL_ERROR, 'op');
            const json = error.toJSON();

            expect(json.name).toBe('LLMError');
            expect(json.message).toBe('Test');
            expect(json.code).toBe(ErrorCode.INTERNAL_ERROR);
            expect(json.operation).toBe('op');
            expect(typeof json.timestamp).toBe('string');
        });
    });

    describe('LLMTimeoutError', () => {
        it('Test 3: should create timeout error with phase-specific message', () => {
            const error = new LLMTimeoutError('startup', 5000, { model: 'test-model' });

            expect(error.message).toContain('LLM startup timeout');
            expect(error.message).toContain('5000ms');
            expect(error.message).toContain('test-model');
            expect(error.phase).toBe('startup');
            expect(error.timeoutMs).toBe(5000);
            expect(error.code).toBe(ErrorCode.TIMEOUT);
        });

        it('Test 4: should provide phase-specific retry suggestions', () => {
            const startupError = new LLMTimeoutError('startup', 1000);
            const streamingError = new LLMTimeoutError('streaming', 1000);
            const inactivityError = new LLMTimeoutError('inactivity', 1000);

            expect(startupError.retrySuggestion).toContain('LLM server');
            expect(streamingError.retrySuggestion).toContain('maxTokens');
            expect(inactivityError.retrySuggestion).toContain('stopped responding');
        });

        it('Test 5: should calculate retry delay based on phase', () => {
            const startupError = new LLMTimeoutError('startup', 1000);
            const streamingError = new LLMTimeoutError('streaming', 1000);

            expect(startupError.getRetryDelayMs()).toBe(60000);
            expect(streamingError.getRetryDelayMs()).toBe(10000);
        });

        it('Test 6: should serialize with extended properties', () => {
            const error = new LLMTimeoutError('request', 3000);
            const json = error.toJSON();

            expect(json.timeoutMs).toBe(3000);
            expect(json.phase).toBe('request');
            expect(typeof json.retrySuggestion).toBe('string');
            expect(typeof json.retryDelayMs).toBe('number');
        });
    });

    describe('LLMOfflineError', () => {
        it('Test 7: should create offline error with endpoint info', () => {
            const error = new LLMOfflineError(
                'http://localhost:1234/v1',
                'LLM offline – ticket created'
            );

            expect(error.message).toContain('LLM endpoint unreachable');
            expect(error.message).toContain('localhost:1234');
            expect(error.endpoint).toBe('http://localhost:1234/v1');
            expect(error.fallbackMessage).toBe('LLM offline – ticket created');
            expect(error.code).toBe(ErrorCode.LLM_OFFLINE);
        });

        it('Test 8: should preserve original error', () => {
            const originalError = new Error('ECONNREFUSED');
            const error = new LLMOfflineError(
                'http://localhost:1234/v1',
                'Fallback',
                originalError
            );

            expect(error.originalError).toBe(originalError);
        });

        it('Test 9: should serialize with endpoint and fallback', () => {
            const error = new LLMOfflineError('http://test', 'Fallback');
            const json = error.toJSON();

            expect(json.endpoint).toBe('http://test');
            expect(json.fallbackMessage).toBe('Fallback');
        });
    });

    describe('LLMResponseError', () => {
        it('Test 10: should create response error with status code', () => {
            const error = new LLMResponseError(500, 'Internal Server Error', 'Details');

            expect(error.message).toContain('LLM HTTP error: 500');
            expect(error.statusCode).toBe(500);
            expect(error.statusText).toBe('Internal Server Error');
            expect(error.responseBody).toBe('Details');
        });

        it('Test 11: should detect rate limit errors', () => {
            const rateLimitError = new LLMResponseError(429, 'Too Many Requests');
            const serverError = new LLMResponseError(500, 'Server Error');

            expect(rateLimitError.isRateLimited()).toBe(true);
            expect(rateLimitError.code).toBe(ErrorCode.RATE_LIMIT);
            expect(rateLimitError.retryAfterMs).toBe(30000);

            expect(serverError.isRateLimited()).toBe(false);
            expect(serverError.code).toBe(ErrorCode.LLM_ERROR);
        });

        it('Test 12: should detect error types', () => {
            const clientError = new LLMResponseError(400, 'Bad Request');
            const serverError = new LLMResponseError(503, 'Service Unavailable');

            expect(clientError.isClientError()).toBe(true);
            expect(clientError.isServerError()).toBe(false);

            expect(serverError.isServerError()).toBe(true);
            expect(serverError.isClientError()).toBe(false);
        });
    });

    describe('Type guards', () => {
        it('Test 13: should correctly identify LLMError instances', () => {
            const llmError = new LLMError('Test', ErrorCode.INTERNAL_ERROR, 'op');
            const timeoutError = new LLMTimeoutError('startup', 1000);
            const regularError = new Error('Not LLM');

            expect(isLLMError(llmError)).toBe(true);
            expect(isLLMError(timeoutError)).toBe(true);
            expect(isLLMError(regularError)).toBe(false);
            expect(isLLMError(null)).toBe(false);
            expect(isLLMError('string')).toBe(false);
        });

        it('Test 14: should correctly identify specific error types', () => {
            const timeoutError = new LLMTimeoutError('startup', 1000);
            const offlineError = new LLMOfflineError('url', 'msg');
            const responseError = new LLMResponseError(500, 'Error');

            expect(isLLMTimeoutError(timeoutError)).toBe(true);
            expect(isLLMTimeoutError(offlineError)).toBe(false);

            expect(isLLMOfflineError(offlineError)).toBe(true);
            expect(isLLMOfflineError(responseError)).toBe(false);

            expect(isLLMResponseError(responseError)).toBe(true);
            expect(isLLMResponseError(timeoutError)).toBe(false);
        });
    });

    describe('getLLMErrorMessage', () => {
        it('Test 15: should extract user-friendly message from timeout error', () => {
            const error = new LLMTimeoutError('startup', 1000);
            const message = getLLMErrorMessage(error);

            expect(message).toContain('startup');
            expect(message).toContain('LLM server');
        });

        it('Test 16: should extract fallback message from offline error', () => {
            const error = new LLMOfflineError('url', 'Custom fallback');
            const message = getLLMErrorMessage(error);

            expect(message).toBe('Custom fallback');
        });

        it('Test 17: should provide friendly message for rate limit', () => {
            const error = new LLMResponseError(429, 'Rate Limited');
            const message = getLLMErrorMessage(error);

            expect(message).toContain('Too many requests');
        });

        it('Test 18: should handle regular errors gracefully', () => {
            const error = new Error('Regular error');
            const message = getLLMErrorMessage(error);

            expect(message).toBe('Regular error');
        });

        it('Test 19: should handle non-error values', () => {
            expect(getLLMErrorMessage('string error')).toBe('string error');
            expect(getLLMErrorMessage(123)).toBe('123');
        });
    });
});
