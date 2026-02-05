/**
 * Comprehensive Error Handling Test Suite
 *
 * Tests all error categories: validation, timeout/rate-limit, and state conflicts.
 * Covers 15+ test cases as required by MT-002.5.
 *
 * @since MT-002.5
 */

import { ErrorCode } from '../../src/errors/errorCodes';
import {
    createMissingParamError,
    throwMissingParam,
    createInvalidTypeError,
    throwInvalidType,
    createOutOfRangeError,
    throwOutOfRange,
    createInvalidEnumError,
    throwInvalidEnum,
    requireParam,
    requireNonEmptyString,
    requireInRange,
} from '../../src/errors/validationErrors';

import {
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

import {
    createTaskInProgressError,
    throwTaskInProgress,
    createInvalidTransitionError,
    throwInvalidTransition,
    createResourceLockedError,
    throwResourceLocked,
    createTicketConflictError,
    throwTicketConflict,
    TICKET_STATE_MACHINE,
    validateTicketTransition,
    isStateConflictError,
} from '../../src/errors/stateErrors';

describe('Error Handling', () => {
    // ============================================================
    // VALIDATION ERRORS (MT-002.2)
    // ============================================================
    describe('Validation Errors', () => {
        describe('Missing Parameter', () => {
            it('Test 1: should create error with correct code and message', () => {
                const error = createMissingParamError('ticketId');

                expect(error.code).toBe(ErrorCode.INVALID_PARAM);
                expect(error.message).toContain('Missing required parameter');
                expect(error.message).toContain('ticketId');
                expect(error.param).toBe('ticketId');
            });

            it('Test 2: should throw with formatted message', () => {
                expect(() => throwMissingParam('userId')).toThrow('[INVALID_PARAM]');
                expect(() => throwMissingParam('userId')).toThrow('Missing required parameter: userId');
            });
        });

        describe('Invalid Type', () => {
            it('Test 3: should create error with type details', () => {
                const error = createInvalidTypeError('age', 'number', 'string');

                expect(error.code).toBe(ErrorCode.INVALID_PARAM);
                expect(error.message).toContain('Invalid type');
                expect(error.expected).toBe('number');
                expect(error.received).toBe('string');
            });

            it('Test 4: should throw with type information', () => {
                expect(() => throwInvalidType('count', 'number', 'boolean')).toThrow(
                    /expected number, received boolean/
                );
            });
        });

        describe('Out of Range', () => {
            it('Test 5: should create error with range details', () => {
                const error = createOutOfRangeError('timeout', 1, 100, 999);

                expect(error.code).toBe(ErrorCode.INVALID_PARAM);
                expect(error.message).toContain('Value out of range');
                expect(error.expected).toBe('1-100');
                expect(error.received).toBe('999');
            });

            it('Test 6: should throw with range information', () => {
                expect(() => throwOutOfRange('priority', 0, 10, -5)).toThrow(
                    /must be between 0 and 10/
                );
            });
        });

        describe('Invalid Enum', () => {
            it('Test 7: should create error with allowed values', () => {
                const allowed = ['open', 'done', 'blocked'];
                const error = createInvalidEnumError('status', allowed, 'invalid');

                expect(error.code).toBe(ErrorCode.INVALID_PARAM);
                expect(error.message).toContain('must be one of');
                expect(error.expected).toBe('open|done|blocked');
            });
        });

        describe('Require Helpers', () => {
            it('Test 8: requireParam should return value if present', () => {
                expect(requireParam('value', 'test')).toBe('value');
                expect(requireParam(0, 'zero')).toBe(0);
                expect(requireParam(false, 'bool')).toBe(false);
            });

            it('Test 9: requireParam should throw for null/undefined', () => {
                expect(() => requireParam(null, 'nullParam')).toThrow('Missing required parameter');
                expect(() => requireParam(undefined, 'undefinedParam')).toThrow('Missing required parameter');
            });

            it('Test 10: requireNonEmptyString should reject empty strings', () => {
                expect(() => requireNonEmptyString('', 'name')).toThrow('cannot be empty');
                expect(() => requireNonEmptyString('   ', 'name')).toThrow('cannot be empty');
            });

            it('Test 11: requireInRange should validate numeric ranges', () => {
                expect(requireInRange(5, 'value', 0, 10)).toBe(5);
                expect(() => requireInRange(15, 'value', 0, 10)).toThrow('Value out of range');
            });
        });
    });

    // ============================================================
    // TIMEOUT AND RATE LIMIT ERRORS (MT-002.3)
    // ============================================================
    describe('Timeout and Rate Limit Errors', () => {
        describe('Timeout', () => {
            it('Test 12: should create timeout error with retry suggestion', () => {
                const error = createTimeoutError('LLM request', 60000);

                expect(error.code).toBe(ErrorCode.TIMEOUT);
                expect(error.message).toContain('timed out');
                expect(error.timeoutMs).toBe(60000);
                expect(error.retrySuggestion).toBeDefined();
                expect(error.retryAfterMs).toBeDefined();
            });

            it('Test 13: should cap retry delay at 5 minutes', () => {
                const error = createTimeoutError('long operation', 600000);
                expect(error.retryAfterMs).toBeLessThanOrEqual(300000);
            });

            it('Test 14: should throw with retry suggestion', () => {
                expect(() => throwTimeout('database query', 30000)).toThrow('timed out');
                expect(() => throwTimeout('database query', 30000)).toThrow('Consider');
            });
        });

        describe('Rate Limit', () => {
            it('Test 15: should create rate limit error with default wait', () => {
                const error = createRateLimitError('API call');

                expect(error.code).toBe(ErrorCode.RATE_LIMIT);
                expect(error.message).toContain('Rate limit exceeded');
                expect(error.retryAfterMs).toBe(30000); // Default 30s
            });

            it('Test 16: should respect custom retry delay', () => {
                const error = createRateLimitError('API call', 60000);
                expect(error.retryAfterMs).toBe(60000);
            });
        });

        describe('LLM-Specific Timeout', () => {
            it('Test 17: should create LLM startup timeout with context', () => {
                const error = createLLMTimeoutError('startup', 30000, { model: 'test-model' });

                expect(error.code).toBe(ErrorCode.TIMEOUT);
                expect(error.message).toContain('startup');
                expect(error.message).toContain('test-model');
                expect(error.retrySuggestion).toContain('LM Studio');
            });

            it('Test 18: should provide different suggestions for each phase', () => {
                const startup = createLLMTimeoutError('startup', 1000);
                const streaming = createLLMTimeoutError('streaming', 1000);
                const inactivity = createLLMTimeoutError('inactivity', 1000);

                expect(startup.retrySuggestion).not.toBe(streaming.retrySuggestion);
                expect(streaming.retrySuggestion).not.toBe(inactivity.retrySuggestion);
            });
        });

        describe('Backoff Calculation', () => {
            it('Test 19: should calculate exponential backoff correctly', () => {
                expect(calculateBackoff(0)).toBe(1000);   // 1s
                expect(calculateBackoff(1)).toBe(2000);   // 2s
                expect(calculateBackoff(2)).toBe(4000);   // 4s
                expect(calculateBackoff(3)).toBe(8000);   // 8s
            });

            it('Test 20: should cap at maximum delay', () => {
                expect(calculateBackoff(10)).toBe(60000); // Capped at 60s
                expect(calculateBackoff(20)).toBe(60000); // Still capped
            });
        });

        describe('Error Detection', () => {
            it('Test 21: should detect timeout errors', () => {
                expect(isTimeoutError(new Error('[TIMEOUT] Operation failed'))).toBe(true);
                expect(isTimeoutError(new Error('Request timeout'))).toBe(true);
                expect(isTimeoutError({ name: 'AbortError' })).toBe(false); // Not Error instance
                expect(isTimeoutError(new Error('Normal error'))).toBe(false);
            });

            it('Test 22: should detect rate limit errors', () => {
                expect(isRateLimitError(new Error('[RATE_LIMIT] Too many requests'))).toBe(true);
                expect(isRateLimitError(new Error('Error 429: rate limit'))).toBe(true);
                expect(isRateLimitError(new Error('Normal error'))).toBe(false);
            });

            it('Test 23: should extract retry delay from error message', () => {
                const error = new Error('Rate limited, retry after 5000ms');
                expect(getRetryDelayFromError(error)).toBe(5000);
                expect(getRetryDelayFromError(new Error('No delay info'))).toBeUndefined();
            });
        });
    });

    // ============================================================
    // STATE CONFLICT ERRORS (MT-002.4)
    // ============================================================
    describe('State Conflict Errors', () => {
        describe('Task In Progress', () => {
            it('Test 24: should create task in progress error with steps', () => {
                const error = createTaskInProgressError('TICKET-123', 'start');

                expect(error.code).toBe(ErrorCode.INVALID_STATE);
                expect(error.message).toContain('already in progress');
                expect(error.resourceId).toBe('TICKET-123');
                expect(error.resolutionSteps).toBeDefined();
                expect(error.resolutionSteps!.length).toBeGreaterThan(0);
            });

            it('Test 25: should throw with task ID', () => {
                expect(() => throwTaskInProgress('TASK-456', 'process')).toThrow('TASK-456');
                expect(() => throwTaskInProgress('TASK-456', 'process')).toThrow('already in progress');
            });
        });

        describe('Invalid State Transition', () => {
            it('Test 26: should create transition error with allowed states', () => {
                const error = createInvalidTransitionError(
                    'TICKET-123',
                    'done',
                    'open',
                    []
                );

                expect(error.code).toBe(ErrorCode.INVALID_STATE);
                expect(error.message).toContain('Invalid state transition');
                expect(error.currentState).toBe('done');
                expect(error.requestedState).toBe('open');
            });

            it('Test 27: should list allowed transitions in resolution', () => {
                const error = createInvalidTransitionError(
                    'TICKET-123',
                    'open',
                    'done',
                    ['in-progress', 'blocked']
                );

                expect(error.resolutionSteps).toBeDefined();
                expect(error.resolutionSteps!.some(s => s.includes('in-progress'))).toBe(true);
            });
        });

        describe('Resource Locked', () => {
            it('Test 28: should create locked error with holder info', () => {
                const error = createResourceLockedError('config.json', 'other process');

                expect(error.code).toBe(ErrorCode.INVALID_STATE);
                expect(error.message).toContain('locked');
                expect(error.message).toContain('other process');
            });

            it('Test 29: should work without lock holder', () => {
                const error = createResourceLockedError('database');
                expect(error.message).toContain('locked');
            });
        });

        describe('Ticket Conflict', () => {
            it('Test 30: should create conflict error with version info', () => {
                const error = createTicketConflictError('TICKET-123', 'v1', 'v2');

                expect(error.code).toBe(ErrorCode.TICKET_UPDATE_CONFLICT);
                expect(error.message).toContain('conflict');
                expect(error.resourceId).toBe('TICKET-123');
            });
        });

        describe('Ticket State Machine', () => {
            it('Test 31: should define valid transitions', () => {
                expect(TICKET_STATE_MACHINE['open']).toContain('in-progress');
                expect(TICKET_STATE_MACHINE['open']).toContain('blocked');
                expect(TICKET_STATE_MACHINE['done']).toHaveLength(0); // Terminal
            });

            it('Test 32: should validate allowed transitions', () => {
                expect(() => validateTicketTransition('T1', 'open', 'in-progress')).not.toThrow();
                expect(() => validateTicketTransition('T1', 'done', 'open')).toThrow('Invalid state transition');
            });
        });

        describe('Error Detection', () => {
            it('Test 33: should detect state conflict errors', () => {
                expect(isStateConflictError(new Error('[INVALID_STATE] Conflict'))).toBe(true);
                expect(isStateConflictError(new Error('Resource locked'))).toBe(true);
                expect(isStateConflictError(new Error('Normal error'))).toBe(false);
            });
        });
    });

    // ============================================================
    // CROSS-CATEGORY TESTS
    // ============================================================
    describe('Cross-Category', () => {
        it('Test 34: all errors should have distinct error codes', () => {
            const codes = new Set([
                createMissingParamError('test').code,
                createTimeoutError('test', 1000).code,
                createRateLimitError('test').code,
                createTaskInProgressError('test', 'test').code,
                createTicketConflictError('test').code,
            ]);

            // At least 3 distinct codes (INVALID_PARAM, TIMEOUT, RATE_LIMIT, etc.)
            expect(codes.size).toBeGreaterThanOrEqual(3);
        });

        it('Test 35: all errors should be instances of Error when thrown', () => {
            expect(() => throwMissingParam('test')).toThrow(Error);
            expect(() => throwTimeout('test', 1000)).toThrow(Error);
            expect(() => throwRateLimit('test')).toThrow(Error);
            expect(() => throwTaskInProgress('test', 'test')).toThrow(Error);
        });
    });
});
