/**
 * Tests for QueueWarningManager
 * Covers MT-010.5: Full queue warning ticket implementation
 * 
 * Uses a mock EventEmitter to avoid conflicts with LLMQueue async operations.
 */

import { EventEmitter } from 'events';
import { QueueWarningManager, resetQueueWarningForTests } from '../../src/llm/queueWarning';

// Mock the config service
jest.mock('../../src/config', () => ({
    getConfigInstance: jest.fn(() => ({
        llm: { timeoutSeconds: 60 }
    }))
}));

// Mock the logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock createTicket
const mockCreateTicket = jest.fn().mockResolvedValue('ticket-123');
jest.mock('../../src/services/ticketDb', () => ({
    createTicket: (...args: unknown[]) => mockCreateTicket(...args)
}));

/**
 * Mock queue that emits events but has no async operations
 * Uses same event interface as LLMQueue
 */
class MockQueue extends EventEmitter {
    private fullState = false;

    isFull(): boolean {
        return this.fullState;
    }

    setFull(full: boolean): void {
        const wasNotFull = !this.fullState;
        this.fullState = full;
        if (full && wasNotFull) {
            this.emit('full', { queueSize: 5, maxPending: 5 });
        }
        if (!full) {
            this.emit('drain');
        }
    }

    // Stub methods to satisfy type requirements
    getStats() { return { pending: 0, processing: 0, completed: 0, failed: 0 }; }
}

describe('QueueWarningManager', () => {
    let manager: QueueWarningManager;
    let mockQueue: MockQueue;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        resetQueueWarningForTests();

        mockQueue = new MockQueue();
        manager = new QueueWarningManager();
        // Cast to any to allow mock queue
        manager.attach(mockQueue as unknown as any);
    });

    afterEach(() => {
        manager.reset();
        jest.useRealTimers();
    });

    describe('MT-010.5: Queue warning ticket creation', () => {
        it('Test 1: should not create ticket immediately when queue becomes full', () => {
            mockQueue.setFull(true);

            // No ticket created yet
            expect(mockCreateTicket).not.toHaveBeenCalled();
        });

        it('Test 2: should create ticket after queue full for 60 seconds', () => {
            mockQueue.setFull(true);

            // Advance 60 seconds
            jest.advanceTimersByTime(60000);

            expect(mockCreateTicket).toHaveBeenCalled();
        });

        it('Test 3: should cancel warning timer if queue drains before 60s', () => {
            mockQueue.setFull(true);

            // Wait 30 seconds
            jest.advanceTimersByTime(30000);

            // Queue drains
            mockQueue.setFull(false);

            // Wait another 40 seconds (past the original 60s threshold)
            jest.advanceTimersByTime(40000);

            // No ticket should have been created
            expect(mockCreateTicket).not.toHaveBeenCalled();
        });

        it('Test 4: should configure custom warning delay', () => {
            manager.reset();
            manager.updateConfig({ fullDurationThreshold: 30000 }); // 30 seconds
            manager.attach(mockQueue as unknown as any);

            mockQueue.setFull(true);

            // Wait 30 seconds (custom threshold)
            jest.advanceTimersByTime(30000);

            expect(mockCreateTicket).toHaveBeenCalled();
        });

        it('Test 5: should throttle ticket creation (1 hour cooldown)', () => {
            mockQueue.setFull(true);
            jest.advanceTimersByTime(60000);

            // First ticket created
            expect(mockCreateTicket).toHaveBeenCalledTimes(1);

            // Reset and trigger full again
            mockQueue.setFull(false);
            mockQueue.setFull(true);
            jest.advanceTimersByTime(60000);

            // Still only 1 ticket (within cooldown)
            expect(mockCreateTicket).toHaveBeenCalledTimes(1);

            // Wait past cooldown (1 hour)
            mockQueue.setFull(false);
            jest.advanceTimersByTime(3600000);
            mockQueue.setFull(true);
            jest.advanceTimersByTime(60000);

            // Now second ticket should be created
            expect(mockCreateTicket).toHaveBeenCalledTimes(2);
        });

        it('Test 6: should disable warning system', () => {
            manager.setEnabled(false);

            mockQueue.setFull(true);
            jest.advanceTimersByTime(60000);

            // No ticket when disabled
            expect(mockCreateTicket).not.toHaveBeenCalled();
        });

        it('Test 7: should enable after disable', () => {
            manager.setEnabled(false);
            manager.setEnabled(true);

            mockQueue.setFull(true);
            jest.advanceTimersByTime(60000);

            expect(mockCreateTicket).toHaveBeenCalled();
        });

        it('Test 8: should return state with getState()', () => {
            const state = manager.getState();

            // State has fullSince, lastWarningAt, timeoutHandle, warningCount
            expect(state).toHaveProperty('fullSince');
            expect(state).toHaveProperty('lastWarningAt');
            expect(state).toHaveProperty('warningCount');
        });

        it('Test 9: should create ticket with required fields', () => {
            mockQueue.setFull(true);
            jest.advanceTimersByTime(60000);

            expect(mockCreateTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: expect.any(String),
                    priority: expect.any(Number),
                    status: 'open',
                    type: 'ai_to_human'
                })
            );
        });

        it('Test 10: should reset manager state', () => {
            mockQueue.setFull(true);
            jest.advanceTimersByTime(30000);

            manager.reset();

            // Timer should be cleared, no ticket on time advance
            jest.advanceTimersByTime(40000);
            expect(mockCreateTicket).not.toHaveBeenCalled();
        });
    });
});
