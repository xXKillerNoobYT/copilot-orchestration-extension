/**
 * Tests for StreamProcessor
 * Covers MT-010.7: Streaming chunk processing implementation
 */

import {
    StreamProcessor,
    type StreamChunk,
    type StreamResult,
    getStreamProcessorInstance,
    resetStreamProcessorForTests
} from '../../src/llm/streaming';

// Mock the logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('StreamProcessor', () => {
    let processor: StreamProcessor;
    let events: { type: string; data: unknown }[];

    beforeEach(() => {
        events = [];
        resetStreamProcessorForTests();

        processor = new StreamProcessor();

        // Track events
        processor.on('chunk', (data) => events.push({ type: 'chunk', data }));
        processor.on('progress', (data) => events.push({ type: 'progress', data }));
        processor.on('complete', (data) => events.push({ type: 'complete', data }));
        processor.on('error', (data) => events.push({ type: 'error', data }));
        processor.on('timeout', (data) => events.push({ type: 'timeout', data }));
        processor.on('cancelled', (data) => events.push({ type: 'cancelled', data }));
    });

    afterEach(() => {
        processor.cleanup();
    });

    describe('MT-010.7: Chunk reception', () => {
        it('Test 1: should create streaming session', () => {
            const sessionId = processor.startSession();

            expect(sessionId).toBeDefined();
            expect(sessionId.startsWith('stream-')).toBe(true);
        });

        it('Test 2: should process string chunk', () => {
            const sessionId = processor.startSession();

            const result = processor.processChunk(sessionId, 'Hello');

            expect(result).toBe(true);
        });

        it('Test 3: should process object chunk', () => {
            const sessionId = processor.startSession();

            const chunk = { choices: [{ delta: { content: 'Hello' } }] };
            const result = processor.processChunk(sessionId, chunk);

            expect(result).toBe(true);
        });

        it('Test 4: should reject chunk for unknown session', () => {
            const result = processor.processChunk('unknown-session', 'Hello');

            expect(result).toBe(false);
        });

        it('Test 5: should emit chunk event', () => {
            const sessionId = processor.startSession();
            processor.processChunk(sessionId, 'Hello');

            const chunkEvents = events.filter(e => e.type === 'chunk');
            expect(chunkEvents.length).toBe(1);
        });
    });

    describe('Chunk accumulation', () => {
        it('Test 6: should accumulate content', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'Hello');
            processor.processChunk(sessionId, ' ');
            processor.processChunk(sessionId, 'world');

            const buffer = processor.getBuffer(sessionId);
            expect(buffer).toBe('Hello world');
        });

        it('Test 7: should track chunk count', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'A');
            processor.processChunk(sessionId, 'B');
            processor.processChunk(sessionId, 'C');

            const session = processor.getSession(sessionId);
            expect(session?.chunks.length).toBe(3);
        });

        it('Test 8: should reset on new session', () => {
            const sessionId1 = processor.startSession();
            processor.processChunk(sessionId1, 'First');

            const sessionId2 = processor.startSession();
            processor.processChunk(sessionId2, 'Second');

            expect(processor.getBuffer(sessionId2)).toBe('Second');
        });
    });

    describe('Completion detection', () => {
        it('Test 9: should detect stop token [DONE]', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'Hello');
            processor.processChunk(sessionId, 'data: [DONE]');

            const completeEvents = events.filter(e => e.type === 'complete');
            expect(completeEvents.length).toBe(1);
        });

        it('Test 10: should finalize session on complete() call', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'Hello');
            const result = processor.complete(sessionId);

            expect(result).not.toBeNull();
            expect(result?.content).toBe('Hello');
        });

        it('Test 11: should get session result', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'Hello world');
            const result = processor.complete(sessionId);

            expect(result?.content).toBe('Hello world');
            expect(result?.chunkCount).toBe(1);
        });
    });

    describe('Session state', () => {
        it('Test 12: should track active state', () => {
            const sessionId = processor.startSession();

            let session = processor.getSession(sessionId);
            expect(session?.isActive).toBe(true);

            processor.complete(sessionId);

            session = processor.getSession(sessionId);
            expect(session?.isActive).toBe(false);
        });

        it('Test 13: should track multiple sessions', () => {
            const session1 = processor.startSession();
            const session2 = processor.startSession();

            processor.processChunk(session1, 'Session 1');
            processor.processChunk(session2, 'Session 2');

            expect(processor.getBuffer(session1)).toBe('Session 1');
            expect(processor.getBuffer(session2)).toBe('Session 2');
        });

        it('Test 14: should handle session-specific operations', () => {
            const session1 = processor.startSession();
            const session2 = processor.startSession();

            processor.processChunk(session1, 'Session 1');
            processor.processChunk(session2, 'Session 2');

            // Complete session 1, session 2 should still be active
            processor.complete(session1);

            expect(processor.getSession(session1)?.isActive).toBe(false);
            expect(processor.getSession(session2)?.isActive).toBe(true);
        });
    });

    describe('Error handling', () => {
        it('Test 15: should reject chunk after session inactive', () => {
            const sessionId = processor.startSession();
            processor.complete(sessionId);

            const result = processor.processChunk(sessionId, 'Late chunk');
            expect(result).toBe(false);
        });

        it('Test 16: should cancel session', () => {
            const sessionId = processor.startSession();

            const cancelled = processor.cancel(sessionId);

            expect(cancelled).toBe(true);
            expect(processor.getSession(sessionId)?.isActive).toBe(false);
            expect(processor.getSession(sessionId)?.error).toBeDefined();
        });

        it('Test 17: should emit cancelled event', () => {
            const sessionId = processor.startSession();

            processor.cancel(sessionId);

            const cancelEvents = events.filter(e => e.type === 'cancelled');
            expect(cancelEvents.length).toBe(1);
        });
    });

    describe('Cleanup', () => {
        it('Test 18: should cleanup all sessions', () => {
            const session1 = processor.startSession();
            const session2 = processor.startSession();
            const session3 = processor.startSession();

            processor.cleanup();

            // All sessions should be inactive
            expect(processor.getSession(session1)?.isActive).toBe(false);
            expect(processor.getSession(session2)?.isActive).toBe(false);
            expect(processor.getSession(session3)?.isActive).toBe(false);
        });

        it('Test 19: should be able to create new session after cleanup', () => {
            processor.startSession();
            processor.cleanup();

            const session2 = processor.startSession();
            expect(session2).toBeDefined();
            expect(processor.getSession(session2)?.isActive).toBe(true);
        });
    });
});
