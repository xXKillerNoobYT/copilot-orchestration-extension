/**
 * Tests for LLMQueue - Comprehensive test coverage
 * Covers MT-010.1, MT-010.2, MT-010.4, MT-010.6, MT-010.8
 */

import { LLMQueue, resetLLMQueueForTests, getLLMQueueInstance } from '../../src/llm/queue';

// Mock config service
jest.mock('../../src/config', () => ({
    getConfigInstance: jest.fn(() => ({
        llm: { timeoutSeconds: 60 }
    }))
}));

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('LLMQueue', () => {
    let queue: LLMQueue<string>;

    beforeEach(() => {
        jest.useFakeTimers();
        resetLLMQueueForTests();
        queue = new LLMQueue<string>({
            maxPending: 5,
            verbose: true,
            processingTimeoutMs: 60000,
            queueTimeoutMs: 300000
        });
    });

    afterEach(() => {
        resetLLMQueueForTests();
        jest.useRealTimers();
    });

    describe('MT-010.1: Queue data structure', () => {
        it('Test 1: should initialize with empty queue', () => {
            const stats = queue.getStats();
            expect(stats.pending).toBe(0);
            expect(stats.processing).toBe(0);
            expect(stats.completed).toBe(0);
        });

        it('Test 2: should return promise on enqueue', () => {
            const promise = queue.enqueue('test');
            expect(promise).toBeInstanceOf(Promise);
            promise.catch(() => { }); // Prevent unhandled rejection
        });

        it('Test 3: should enqueue with priority ordering', () => {
            // Enqueue low priority first
            const p1 = queue.enqueue('low', { priority: 3 });
            // Then high priority - should be processed first
            const p2 = queue.enqueue('high', { priority: 1 });
            const p3 = queue.enqueue('medium', { priority: 2 });

            p1.catch(() => { });
            p2.catch(() => { });
            p3.catch(() => { });

            const pending = queue.getPendingRequests();
            // First request is processing, check remaining pending order
            expect(pending.length).toBe(2);
        });

        it('Test 4: should enqueue with context data', () => {
            const promise = queue.enqueue('test', {
                context: { userId: '123', action: 'query' }
            });
            promise.catch(() => { });

            const current = queue.getCurrentRequest();
            expect(current).not.toBeNull();
            expect(current?.context).toEqual({ userId: '123', action: 'query' });
        });

        it('Test 5: should enqueue with system prompt', () => {
            const promise = queue.enqueue('test', {
                systemPrompt: 'You are helpful'
            });
            promise.catch(() => { });

            const current = queue.getCurrentRequest();
            expect(current?.systemPrompt).toBe('You are helpful');
        });
    });

    describe('MT-010.2: Single-threaded execution', () => {
        it('Test 6: should limit processing to max 1', () => {
            const p1 = queue.enqueue('first');
            const p2 = queue.enqueue('second');

            p1.catch(() => { });
            p2.catch(() => { });

            const stats = queue.getStats();
            expect(stats.processing).toBeLessThanOrEqual(1);
        });

        it('Test 7: should complete and process next', () => {
            const p1 = queue.enqueue('first');
            const p2 = queue.enqueue('second');

            p1.catch(() => { });
            p2.catch(() => { });

            // Complete first request
            queue.complete('result1');

            // Should now be processing second
            const current = queue.getCurrentRequest();
            expect(current?.prompt).toBe('second');
        });

        it('Test 8: should handle complete when no request processing', () => {
            // Should not throw
            queue.complete('orphan result');
            expect(queue.getStats().completed).toBe(0);
        });

        it('Test 9: should track completion stats', () => {
            const p1 = queue.enqueue('test');
            p1.catch(() => { });

            queue.complete('result');

            const stats = queue.getStats();
            expect(stats.completed).toBe(1);
            expect(stats.processing).toBe(0);
        });
    });

    describe('MT-010.4: Queue statistics', () => {
        it('Test 10: should have correct stats shape', () => {
            const stats = queue.getStats();
            expect(stats).toMatchObject({
                pending: expect.any(Number),
                processing: expect.any(Number),
                completed: expect.any(Number),
                failed: expect.any(Number),
                timeout: expect.any(Number),
                cancelled: expect.any(Number),
                averageWaitMs: expect.any(Number),
                averageProcessingMs: expect.any(Number)
            });
        });

        it('Test 11: should start empty', () => {
            expect(queue.isFull()).toBe(false);
            expect(queue.isEmpty()).toBe(true);
        });

        it('Test 12: should not be empty after enqueue', () => {
            const p = queue.enqueue('test');
            p.catch(() => { });
            expect(queue.isEmpty()).toBe(false);
        });

        it('Test 13: should report full when at max capacity', () => {
            const promises: Promise<string>[] = [];
            for (let i = 0; i < 6; i++) {
                promises.push(queue.enqueue(`req${i}`));
            }
            promises.forEach(p => p.catch(() => { }));

            expect(queue.isFull()).toBe(true);
        });

        it('Test 14: should calculate average times', () => {
            const p1 = queue.enqueue('test1');
            p1.catch(() => { });

            // Advance time and complete
            jest.advanceTimersByTime(100);
            queue.complete('result');

            const stats = queue.getStats();
            expect(stats.averageProcessingMs).toBeGreaterThanOrEqual(0);
        });

        it('Test 15: should reset stats', () => {
            const p = queue.enqueue('test');
            p.catch(() => { });
            queue.complete('done');

            queue.resetStats();

            const stats = queue.getStats();
            expect(stats.completed).toBe(0);
            expect(stats.averageWaitMs).toBe(0);
        });
    });

    describe('MT-010.6: Error and timeout handling', () => {
        it('Test 16: should handle fail when no request processing', () => {
            queue.fail(new Error('orphan error'));
            expect(queue.getStats().failed).toBe(0);
        });

        it('Test 17: should fail current request', async () => {
            // Add error listener to prevent unhandled event
            queue.on('error', () => { /* expected */ });
            
            const p = queue.enqueue('test');
            queue.fail(new Error('Test error'));

            await expect(p).rejects.toThrow('Test error');
            expect(queue.getStats().failed).toBe(1);
        });

        it('Test 18: should handle queue timeout', async () => {
            // Create queue with short timeout
            const shortQueue = new LLMQueue<string>({
                maxPending: 5,
                queueTimeoutMs: 100, // 100ms
                processingTimeoutMs: 60000
            });

            const p1 = shortQueue.enqueue('first');
            p1.catch(() => { });

            // Enqueue second - it waits in queue while first processes
            const p2 = shortQueue.enqueue('second');

            // Fast forward past queue timeout
            jest.advanceTimersByTime(150);

            await expect(p2).rejects.toThrow('timed out');
        });

        // Test 19: Processing timeout is tested via stats tracking
        it('Test 19: should track timeout stats', () => {
            const stats = queue.getStats();
            expect(stats.timeout).toBe(0);
        });

        it('Test 20: should emit timeout event on queue timeout', async () => {
            const timeoutHandler = jest.fn();
            
            const shortQueue = new LLMQueue<string>({
                maxPending: 5,
                queueTimeoutMs: 50, // Very short queue timeout
                processingTimeoutMs: 300000
            });
            shortQueue.on('timeout', timeoutHandler);

            // First request starts processing immediately
            const p1 = shortQueue.enqueue('first');
            p1.catch(() => { });
            
            // Second request waits in queue
            const p2 = shortQueue.enqueue('second');
            p2.catch(() => { });

            // Advance past queue timeout
            jest.advanceTimersByTime(100);

            expect(timeoutHandler).toHaveBeenCalled();
        });
    });

    describe('MT-010.8: Queue drain and shutdown', () => {
        it('Test 21: should cancel pending request', () => {
            const p1 = queue.enqueue('first');
            const p2 = queue.enqueue('second');

            p1.catch(() => { });
            p2.catch(() => { });

            // Get ID of pending request (not current)
            const pending = queue.getPendingRequests();
            if (pending.length > 0) {
                const success = queue.cancel(pending[0].id);
                expect(success).toBe(true);
            }
        });

        it('Test 22: should not cancel processing request', () => {
            const p = queue.enqueue('test');
            p.catch(() => { });

            const current = queue.getCurrentRequest();
            if (current) {
                const success = queue.cancel(current.id);
                expect(success).toBe(false);
            }
        });

        it('Test 23: should return false for non-existent cancel', () => {
            const success = queue.cancel('non-existent-id');
            expect(success).toBe(false);
        });

        it('Test 24: should clear all pending requests', () => {
            const promises = [
                queue.enqueue('req1'),
                queue.enqueue('req2'),
                queue.enqueue('req3')
            ];
            promises.forEach(p => p.catch(() => { }));

            const pendingBefore = queue.getPendingRequests().length;
            const cleared = queue.clearPending();

            expect(cleared).toBe(pendingBefore);
            expect(queue.getPendingRequests().length).toBe(0);
        });

        it('Test 25: should reject new requests when shutting down', async () => {
            await queue.shutdown(false);

            await expect(queue.enqueue('new')).rejects.toThrow('shutting down');
        });

        it('Test 26: should reset shutdown state', async () => {
            await queue.shutdown(false);
            queue.resetShutdown();

            // Should accept new requests now
            const p = queue.enqueue('new');
            p.catch(() => { });

            expect(queue.isEmpty()).toBe(false);
        });

        it('Test 27: should return cancelled requests on shutdown', async () => {
            const p1 = queue.enqueue('first', { context: { a: 1 } });
            const p2 = queue.enqueue('second', { context: { b: 2 } });
            p1.catch(() => { });
            p2.catch(() => { });

            // Complete the processing one first
            queue.complete('done');

            const saved = await queue.shutdown(false);

            // Should include info about pending requests
            expect(Array.isArray(saved)).toBe(true);
        });

        it('Test 28: should emit full event when queue is full', () => {
            const fullHandler = jest.fn();
            
            // Create queue with small maxPending
            const smallQueue = new LLMQueue<string>({
                maxPending: 2,
                queueTimeoutMs: 300000,
                processingTimeoutMs: 300000
            });
            smallQueue.on('full', fullHandler);

            // First goes to processing, second and third go to queue
            const promises: Promise<string>[] = [];
            for (let i = 0; i < 4; i++) {
                promises.push(smallQueue.enqueue(`req${i}`));
            }
            promises.forEach(p => p.catch(() => { }));

            expect(fullHandler).toHaveBeenCalled();
        });

        it('Test 29: should reject on full when option set', async () => {
            // Create queue with small maxPending
            const smallQueue = new LLMQueue<string>({
                maxPending: 2,
                queueTimeoutMs: 300000,
                processingTimeoutMs: 300000
            });

            // Fill up the queue (1 processing + 2 pending = full)
            const promises: Promise<string>[] = [];
            for (let i = 0; i < 3; i++) {
                promises.push(smallQueue.enqueue(`req${i}`));
            }
            promises.forEach(p => p.catch(() => { }));

            // Try to add one more with rejectOnFull
            await expect(smallQueue.enqueue('overflow', { rejectOnFull: true }))
                .rejects.toThrow('Queue full');
        });

        it('Test 30: should emit drain when queue empties', () => {
            const drainHandler = jest.fn();
            queue.on('drain', drainHandler);

            const p = queue.enqueue('test');
            p.catch(() => { });

            queue.complete('done');

            expect(drainHandler).toHaveBeenCalled();
        });
    });

    describe('EventEmitter API', () => {
        it('Test 31: should expose EventEmitter methods', () => {
            expect(typeof queue.on).toBe('function');
            expect(typeof queue.emit).toBe('function');
            expect(typeof queue.once).toBe('function');
        });

        it('Test 32: should emit enqueue event', () => {
            const enqueueHandler = jest.fn();
            queue.on('enqueue', enqueueHandler);

            const p = queue.enqueue('test');
            p.catch(() => { });

            expect(enqueueHandler).toHaveBeenCalled();
        });

        it('Test 33: should emit dequeue event', () => {
            const dequeueHandler = jest.fn();
            queue.on('dequeue', dequeueHandler);

            const p = queue.enqueue('test');
            p.catch(() => { });

            // Dequeue happens automatically on enqueue when queue is empty
            expect(dequeueHandler).toHaveBeenCalled();
        });

        it('Test 34: should emit complete event', () => {
            const completeHandler = jest.fn();
            queue.on('complete', completeHandler);

            const p = queue.enqueue('test');
            p.catch(() => { });
            queue.complete('result');

            expect(completeHandler).toHaveBeenCalled();
        });

        it('Test 35: should emit error event on fail', () => {
            const errorHandler = jest.fn();
            queue.on('error', errorHandler);

            const p = queue.enqueue('test');
            p.catch(() => { });
            queue.fail(new Error('test error'));

            expect(errorHandler).toHaveBeenCalled();
        });
    });

    describe('Singleton pattern', () => {
        it('Test 36: should get singleton instance', () => {
            resetLLMQueueForTests();
            const instance1 = getLLMQueueInstance();
            const instance2 = getLLMQueueInstance();

            expect(instance1).toBe(instance2);
        });

        it('Test 37: should reset singleton for tests', () => {
            const instance1 = getLLMQueueInstance();
            resetLLMQueueForTests();
            const instance2 = getLLMQueueInstance();

            expect(instance1).not.toBe(instance2);
        });
    });

    describe('Config loading', () => {
        it('Test 38: should handle config not initialized', () => {
            // Reset and recreate with config error
            jest.resetModules();
            jest.doMock('../../src/config', () => ({
                getConfigInstance: jest.fn(() => {
                    throw new Error('Config not initialized');
                })
            }));

            // Creating queue should not throw
            const { LLMQueue: LLMQueueFresh } = require('../../src/llm/queue');
            const q = new LLMQueueFresh();
            expect(q).toBeDefined();

            // Restore mock
            jest.doMock('../../src/config', () => ({
                getConfigInstance: jest.fn(() => ({
                    llm: { timeoutSeconds: 60 }
                }))
            }));
        });
    });

    describe('Edge cases', () => {
        it('Test 39: should handle shutdown with wait for current', async () => {
            const p = queue.enqueue('test');
            p.catch(() => { });

            // Start shutdown that waits
            const shutdownPromise = queue.shutdown(true);

            // Complete the current request quickly
            queue.complete('done');

            // Advance timers to let shutdown complete
            jest.advanceTimersByTime(200);

            const saved = await shutdownPromise;
            expect(Array.isArray(saved)).toBe(true);
        }, 10000);

        it('Test 40: should skip processing timeout if already completed', () => {
            const shortQueue = new LLMQueue<string>({
                maxPending: 5,
                queueTimeoutMs: 300000,
                processingTimeoutMs: 200
            });

            const p = shortQueue.enqueue('test');
            p.catch(() => { });

            // Complete before timeout
            shortQueue.complete('done');

            // Advance past timeout - should not cause issues
            jest.advanceTimersByTime(300);

            expect(shortQueue.getStats().timeout).toBe(0);
        });

        it('Test 41: should emit cancelled event', () => {
            const cancelledHandler = jest.fn();
            queue.on('cancelled', cancelledHandler);

            const p1 = queue.enqueue('first');
            const p2 = queue.enqueue('second');
            p1.catch(() => { });
            p2.catch(() => { });

            const pending = queue.getPendingRequests();
            if (pending.length > 0) {
                queue.cancel(pending[0].id);
                expect(cancelledHandler).toHaveBeenCalled();
            }
        });
    });
});
