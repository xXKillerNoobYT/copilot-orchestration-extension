/**
 * @file tests/agents/answer/timeout.test.ts
 * @description Tests for Answer Team timeout handling (MT-014.8)
 */

import { TimeoutHandler, createTimeoutHandler, withSimpleTimeout } from '../../../src/agents/answer/timeout';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock ticketDb
jest.mock('../../../src/services/ticketDb', () => ({
    createTicket: jest.fn()
}));

import { createTicket } from '../../../src/services/ticketDb';

const mockCreateTicket = createTicket as jest.MockedFunction<typeof createTicket>;

describe('TimeoutHandler', () => {
    let handler: TimeoutHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        handler = createTimeoutHandler({ maxResponseSeconds: 1 }); // 1 second for fast tests
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Test 1-5: withTimeout', () => {
        it('Test 1: should return result for fast operations', async () => {
            const fastOperation = jest.fn().mockResolvedValue('fast result');

            const resultPromise = handler.withTimeout('req-1', fastOperation, 'test question');
            jest.advanceTimersByTime(100);

            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(result.value).toBe('fast result');
            expect(result.timedOut).toBe(false);
        });

        it('Test 2: should timeout for slow operations', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TK-1234',
                title: 'Test',
                status: 'open',
                description: '',
                priority: 2,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            const slowOperation = jest.fn().mockImplementation(() =>
                new Promise(resolve => setTimeout(resolve, 5000))
            );

            const resultPromise = handler.withTimeout('req-2', slowOperation, 'slow question');

            // Advance past timeout
            jest.advanceTimersByTime(1500);

            const result = await resultPromise;

            expect(result.success).toBe(false);
            expect(result.timedOut).toBe(true);
        });

        it('Test 3: should track elapsed time', async () => {
            const operation = jest.fn().mockResolvedValue('result');

            const resultPromise = handler.withTimeout('req-3', operation, 'test');
            jest.advanceTimersByTime(500);

            const result = await resultPromise;

            expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
        });

        it('Test 4: should handle errors in operation', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

            const resultPromise = handler.withTimeout('req-4', failingOperation, 'test');
            jest.advanceTimersByTime(100);

            const result = await resultPromise;

            expect(result.success).toBe(false);
            expect(result.timedOut).toBe(false);
        });

        it('Test 5: should pass abort signal to operation', async () => {
            let receivedSignal: AbortSignal | undefined;
            const operation = jest.fn().mockImplementation((signal: AbortSignal) => {
                receivedSignal = signal;
                return Promise.resolve('result');
            });

            const resultPromise = handler.withTimeout('req-5', operation, 'test');
            jest.advanceTimersByTime(100);
            await resultPromise;

            expect(receivedSignal).toBeDefined();
            expect(receivedSignal?.aborted).toBe(false);
        });
    });

    describe('Test 6-10: ticket creation', () => {
        it('Test 6: should create ticket on timeout when enabled', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TK-5678',
                title: 'Timeout ticket',
                status: 'open',
                description: '',
                priority: 2,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            const slowOperation = () => new Promise(resolve => setTimeout(resolve, 5000));

            const resultPromise = handler.withTimeout('req-6', slowOperation, 'urgent question');
            jest.advanceTimersByTime(1500);

            const result = await resultPromise;

            expect(mockCreateTicket).toHaveBeenCalled();
            expect(result.ticketId).toBe('TK-5678');
        });

        it('Test 7: should not create ticket when disabled', async () => {
            const noTicketHandler = createTimeoutHandler({
                maxResponseSeconds: 1,
                createTicketOnTimeout: false
            });

            const slowOperation = () => new Promise(resolve => setTimeout(resolve, 5000));

            const resultPromise = noTicketHandler.withTimeout('req-7', slowOperation, 'question');
            jest.advanceTimersByTime(1500);

            await resultPromise;

            expect(mockCreateTicket).not.toHaveBeenCalled();
        });

        it('Test 8: should include question in ticket', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TK-1234',
                title: 'Test',
                status: 'open',
                description: '',
                priority: 2,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            const slowOperation = () => new Promise(resolve => setTimeout(resolve, 5000));

            const resultPromise = handler.withTimeout('req-8', slowOperation, 'My specific question');
            jest.advanceTimersByTime(1500);

            await resultPromise;

            expect(mockCreateTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('My specific question')
                })
            );
        });

        it('Test 9: should handle ticket creation failure', async () => {
            mockCreateTicket.mockRejectedValue(new Error('DB Error'));

            const slowOperation = () => new Promise(resolve => setTimeout(resolve, 5000));

            const resultPromise = handler.withTimeout('req-9', slowOperation, 'question');
            jest.advanceTimersByTime(1500);

            const result = await resultPromise;

            expect(result.timedOut).toBe(true);
            expect(result.ticketId).toBe('');
        });

        it('Test 10: should use configured priority', async () => {
            const customHandler = createTimeoutHandler({
                maxResponseSeconds: 1,
                ticketPriority: 1
            });

            mockCreateTicket.mockResolvedValue({
                id: 'TK-1234',
                title: 'Test',
                status: 'open',
                description: '',
                priority: 1,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            const slowOperation = () => new Promise(resolve => setTimeout(resolve, 5000));

            const resultPromise = customHandler.withTimeout('req-10', slowOperation, 'question');
            jest.advanceTimersByTime(1500);

            await resultPromise;

            expect(mockCreateTicket).toHaveBeenCalledWith(
                expect.objectContaining({ priority: 1 })
            );
        });
    });

    describe('Test 11-15: cancellation', () => {
        it('Test 11: should cancel active request', () => {
            const operation = () => new Promise(resolve => setTimeout(resolve, 5000));

            // Start operation but don't await
            handler.withTimeout('req-11', operation, 'test');

            const cancelled = handler.cancel('req-11');

            expect(cancelled).toBe(true);
        });

        it('Test 12: should return false for non-existent request', () => {
            const cancelled = handler.cancel('non-existent');

            expect(cancelled).toBe(false);
        });

        it('Test 13: should track active request count', () => {
            const operation = () => new Promise(resolve => setTimeout(resolve, 5000));

            expect(handler.getActiveCount()).toBe(0);

            handler.withTimeout('req-13a', operation, 'test');
            handler.withTimeout('req-13b', operation, 'test');

            expect(handler.getActiveCount()).toBe(2);
        });

        it('Test 14: should cancel all requests', () => {
            const operation = () => new Promise(resolve => setTimeout(resolve, 5000));

            handler.withTimeout('req-14a', operation, 'test');
            handler.withTimeout('req-14b', operation, 'test');

            handler.cancelAll();

            expect(handler.getActiveCount()).toBe(0);
        });

        it('Test 15: should get/set timeout seconds', () => {
            expect(handler.getTimeoutSeconds()).toBe(1);

            handler.setTimeoutSeconds(30);

            expect(handler.getTimeoutSeconds()).toBe(30);
        });
    });

    describe('Test 16-20: configuration and utilities', () => {
        it('Test 16: should get timeout message', () => {
            const message = handler.getTimeoutMessage();

            expect(message).toContain('time');
        });

        it('Test 17: should clamp timeout to valid range', () => {
            handler.setTimeoutSeconds(1000);
            expect(handler.getTimeoutSeconds()).toBeLessThanOrEqual(300);

            handler.setTimeoutSeconds(1);
            expect(handler.getTimeoutSeconds()).toBeGreaterThanOrEqual(5);
        });

        it('Test 18: should use custom timeout message', () => {
            const customHandler = createTimeoutHandler({
                timeoutMessage: 'Custom timeout occurred'
            });

            expect(customHandler.getTimeoutMessage()).toBe('Custom timeout occurred');
        });

        it('Test 19: withSimpleTimeout should resolve fast operations', async () => {
            const result = await withSimpleTimeout(() => Promise.resolve('fast'), 1000);

            expect(result).toBe('fast');
        });

        it('Test 20: withSimpleTimeout should reject on timeout', async () => {
            const slowOperation = () => new Promise(resolve => setTimeout(resolve, 5000));

            const promise = withSimpleTimeout(slowOperation, 100);
            jest.advanceTimersByTime(200);

            await expect(promise).rejects.toThrow('TIMEOUT');
        });
    });
});
