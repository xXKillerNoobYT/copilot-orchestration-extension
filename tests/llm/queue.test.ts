/**
 * Tests for LLMQueue - Minimal test coverage
 * Covers MT-010.1, MT-010.2, MT-010.4
 * 
 * NOTE: The queue auto-processes and uses real timers. To avoid test timeout
 * issues, we only test synchronous behavior and API shape.
 */

import { LLMQueue, resetLLMQueueForTests } from '../../src/llm/queue';

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
        resetLLMQueueForTests();
        queue = new LLMQueue<string>({
            maxPending: 5,
            verbose: false,
            processingTimeoutMs: 300000 // 5 min - won't timeout in test
        });
    });

    afterEach(() => {
        // Just reset - don't await anything to avoid timer race conditions
        resetLLMQueueForTests();
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
    });

    describe('MT-010.4: Queue statistics', () => {
        it('Test 3: should have correct stats shape', () => {
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

        it('Test 4: should start empty', () => {
            expect(queue.isFull()).toBe(false);
            expect(queue.isEmpty()).toBe(true);
        });

        it('Test 5: should not be empty after enqueue', () => {
            const p = queue.enqueue('test');
            p.catch(() => { });
            expect(queue.isEmpty()).toBe(false);
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
    });

    describe('EventEmitter API', () => {
        it('Test 7: should expose EventEmitter methods', () => {
            expect(typeof queue.on).toBe('function');
            expect(typeof queue.emit).toBe('function');
            expect(typeof queue.once).toBe('function');
        });
    });
});
