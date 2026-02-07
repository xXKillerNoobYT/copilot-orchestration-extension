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

type EventData = { type: string; data: unknown };

describe('StreamProcessor', () => {
    let processor: StreamProcessor;
    let events: EventData[];

    beforeEach(() => {
        jest.useFakeTimers();
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
        jest.useRealTimers();
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

    describe('Buffer overflow handling', () => {
        it('Test 20: should emit error on buffer overflow', () => {
            // Create processor with tiny buffer
            const smallProcessor = new StreamProcessor({ maxBufferSize: 10 });
            const errorEvents: EventData[] = [];
            smallProcessor.on('error', (data) => errorEvents.push({ type: 'error', data }));

            const sessionId = smallProcessor.startSession();

            // Add content that exceeds buffer
            smallProcessor.processChunk(sessionId, 'This is way too long for the buffer');

            expect(errorEvents.length).toBe(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((errorEvents[0].data as any).error.message).toContain('Buffer overflow');
            smallProcessor.cleanup();
        });

        it('Test 21: should return false on buffer overflow', () => {
            const smallProcessor = new StreamProcessor({ maxBufferSize: 5 });
            smallProcessor.on('error', () => { /* ignore error events */ });

            const sessionId = smallProcessor.startSession();

            const result = smallProcessor.processChunk(sessionId, 'Too long');

            expect(result).toBe(false);
            smallProcessor.cleanup();
        });
    });

    describe('Timeout handling', () => {
        it('Test 22: should emit timeout when no chunks received', () => {
            const timeoutProcessor = new StreamProcessor({ chunkTimeoutMs: 1000 });
            const timeoutEvents: EventData[] = [];
            timeoutProcessor.on('timeout', (data) => timeoutEvents.push({ type: 'timeout', data }));

            const sessionId = timeoutProcessor.startSession();

            // Advance time past timeout
            jest.advanceTimersByTime(1100);

            expect(timeoutEvents.length).toBe(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((timeoutEvents[0].data as any).sessionId).toBe(sessionId);
            timeoutProcessor.cleanup();
        });

        it('Test 23: should mark session inactive on timeout', () => {
            const timeoutProcessor = new StreamProcessor({ chunkTimeoutMs: 500 });
            timeoutProcessor.on('timeout', () => { /* ignore timeout events */ });

            const sessionId = timeoutProcessor.startSession();

            jest.advanceTimersByTime(600);

            const session = timeoutProcessor.getSession(sessionId);
            expect(session?.isActive).toBe(false);
            expect(session?.error).toBeDefined();
            expect(session?.error?.message).toContain('timed out');
            timeoutProcessor.cleanup();
        });

        it('Test 24: should reset timeout on chunk received', () => {
            const timeoutProcessor = new StreamProcessor({ chunkTimeoutMs: 1000 });
            const timeoutEvents: EventData[] = [];
            timeoutProcessor.on('timeout', (data) => timeoutEvents.push({ type: 'timeout', data }));

            const sessionId = timeoutProcessor.startSession();

            // Advance halfway, then send chunk
            jest.advanceTimersByTime(500);
            timeoutProcessor.processChunk(sessionId, 'Keep alive');

            // Advance another half
            jest.advanceTimersByTime(500);

            // Should not have timed out because chunk reset the timer
            expect(timeoutEvents.length).toBe(0);
            timeoutProcessor.cleanup();
        });

        it('Test 25: should not timeout if session already inactive', () => {
            const timeoutProcessor = new StreamProcessor({ chunkTimeoutMs: 500 });
            const timeoutEvents: EventData[] = [];
            timeoutProcessor.on('timeout', (data) => timeoutEvents.push({ type: 'timeout', data }));

            const sessionId = timeoutProcessor.startSession();
            timeoutProcessor.complete(sessionId);

            jest.advanceTimersByTime(600);

            // No timeout because session was already complete
            expect(timeoutEvents.length).toBe(0);
            timeoutProcessor.cleanup();
        });
    });

    describe('Stop token handling', () => {
        it('Test 26: should detect custom stop tokens', () => {
            const customProcessor = new StreamProcessor({ stopTokens: ['<END>', '###'] });
            const completeEvents: EventData[] = [];
            customProcessor.on('complete', (data) => completeEvents.push({ type: 'complete', data }));

            const sessionId = customProcessor.startSession();
            customProcessor.processChunk(sessionId, 'Response<END>');

            expect(completeEvents.length).toBe(1);
            customProcessor.cleanup();
        });

        it('Test 27: should remove stop token from content', () => {
            const customProcessor = new StreamProcessor({ stopTokens: ['<END>'] });
            customProcessor.on('complete', () => { /* ignore */ });

            const sessionId = customProcessor.startSession();
            customProcessor.processChunk(sessionId, 'Hello<END>');

            expect(customProcessor.getBuffer(sessionId)).toBe('Hello');
            customProcessor.cleanup();
        });

        it('Test 28: should detect stop token in raw data string', () => {
            // Stop token should be detected in raw data as well
            const sessionId = processor.startSession();
            processor.processChunk(sessionId, '[DONE]');

            const completeEvents = events.filter(e => e.type === 'complete');
            expect(completeEvents.length).toBe(1);
        });
    });

    describe('OpenAI format parsing', () => {
        it('Test 29: should extract content from choices[0].delta', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-123',
                choices: [{ delta: { content: 'Hello' } }]
            };

            processor.processChunk(sessionId, openAIChunk);

            expect(processor.getBuffer(sessionId)).toBe('Hello');
        });

        it('Test 30: should extract content from choices[0].message (final)', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-123',
                choices: [{ message: { content: 'Full response' } }]
            };

            processor.processChunk(sessionId, openAIChunk);

            expect(processor.getBuffer(sessionId)).toBe('Full response');
        });

        it('Test 31: should detect finish_reason in OpenAI format', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-123',
                choices: [{ delta: { content: '' }, finish_reason: 'stop' }]
            };

            processor.processChunk(sessionId, openAIChunk);

            const completeEvents = events.filter(e => e.type === 'complete');
            expect(completeEvents.length).toBe(1);
        });

        it('Test 32: should extract usage data from OpenAI format', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-123',
                choices: [{ delta: { content: 'Response' }, finish_reason: 'stop' }],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15
                }
            };

            processor.processChunk(sessionId, openAIChunk);

            const completeEvents = events.filter(e => e.type === 'complete');
            expect(completeEvents.length).toBe(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (completeEvents[0].data as any).result;
            expect(result.usage).toEqual({
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15
            });
        });

        it('Test 33: should use chunk id from OpenAI format', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-custom-id',
                choices: [{ delta: { content: 'Test' } }]
            };

            processor.processChunk(sessionId, openAIChunk);

            const session = processor.getSession(sessionId);
            expect(session?.chunks[0].id).toBe('chatcmpl-custom-id');
        });

        it('Test 34: should handle empty choices array', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-123',
                choices: []
            };

            const result = processor.processChunk(sessionId, openAIChunk);

            expect(result).toBe(true);
            expect(processor.getBuffer(sessionId)).toBe('');
        });

        it('Test 35: should handle missing delta content', () => {
            const sessionId = processor.startSession();
            const openAIChunk = {
                id: 'chatcmpl-123',
                choices: [{ delta: {} }]
            };

            const result = processor.processChunk(sessionId, openAIChunk);

            expect(result).toBe(true);
            expect(processor.getBuffer(sessionId)).toBe('');
        });
    });

    describe('SSE format parsing', () => {
        it('Test 36: should parse SSE data: prefix with JSON', () => {
            const sessionId = processor.startSession();
            const sseData = 'data: {"choices":[{"delta":{"content":"SSE response"}}]}';

            processor.processChunk(sessionId, sseData);

            expect(processor.getBuffer(sessionId)).toBe('SSE response');
        });

        it('Test 37: should handle SSE data: [DONE]', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'Some content');
            processor.processChunk(sessionId, 'data: [DONE]');

            const completeEvents = events.filter(e => e.type === 'complete');
            expect(completeEvents.length).toBe(1);
        });

        it('Test 38: should handle non-JSON SSE data as raw text', () => {
            const sessionId = processor.startSession();
            processor.processChunk(sessionId, 'data: plain text response');

            expect(processor.getBuffer(sessionId)).toBe('data: plain text response');
        });
    });

    describe('Session edge cases', () => {
        it('Test 39: should return false when completing unknown session', () => {
            const result = processor.complete('non-existent-session');

            expect(result).toBeNull();
        });

        it('Test 40: should return false when cancelling unknown session', () => {
            const result = processor.cancel('non-existent-session');

            expect(result).toBe(false);
        });

        it('Test 41: should return false when cancelling inactive session', () => {
            const sessionId = processor.startSession();
            processor.complete(sessionId);

            const result = processor.cancel(sessionId);

            expect(result).toBe(false);
        });

        it('Test 42: should return undefined buffer for unknown session', () => {
            const buffer = processor.getBuffer('unknown-session');

            expect(buffer).toBeUndefined();
        });

        it('Test 43: should return undefined session for unknown id', () => {
            const session = processor.getSession('unknown-session');

            expect(session).toBeUndefined();
        });
    });

    describe('Singleton functions', () => {
        it('Test 44: should return singleton instance', () => {
            resetStreamProcessorForTests();

            const instance1 = getStreamProcessorInstance();
            const instance2 = getStreamProcessorInstance();

            expect(instance1).toBe(instance2);
        });

        it('Test 45: should reset singleton for tests', () => {
            const instance1 = getStreamProcessorInstance();
            resetStreamProcessorForTests();
            const instance2 = getStreamProcessorInstance();

            expect(instance1).not.toBe(instance2);
        });

        it('Test 46: should work with fresh singleton', () => {
            resetStreamProcessorForTests();

            const instance = getStreamProcessorInstance();
            const sessionId = instance.startSession();

            expect(sessionId).toBeDefined();
            expect(instance.getSession(sessionId)?.isActive).toBe(true);
            instance.cleanup();
        });
    });

    describe('Complete with usage from chunks', () => {
        it('Test 47: should find usage from last chunk with usage data', () => {
            const sessionId = processor.startSession();

            // First chunk without usage
            processor.processChunk(sessionId, { choices: [{ delta: { content: 'Part 1' } }] });
            // Second chunk with usage
            processor.processChunk(sessionId, {
                choices: [{ delta: { content: 'Part 2' } }],
                usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
            });

            const result = processor.complete(sessionId);

            expect(result?.usage).toEqual({
                prompt_tokens: 5,
                completion_tokens: 10,
                total_tokens: 15
            });
        });

        it('Test 48: should return null usage if no chunks have usage', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'No usage data');

            const result = processor.complete(sessionId);

            expect(result?.usage).toBeUndefined();
        });
    });

    describe('Progress events', () => {
        it('Test 49: should emit chunk events with progress data', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'A');
            processor.processChunk(sessionId, 'B');
            processor.processChunk(sessionId, 'C');

            const chunkEvents = events.filter(e => e.type === 'chunk');
            expect(chunkEvents.length).toBe(3);

            // Each chunk event should include totalChunks and bufferSize
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lastEvent = chunkEvents[2].data as any;
            expect(lastEvent.totalChunks).toBe(3);
            expect(lastEvent.bufferSize).toBe(3);
        });
    });

    describe('Custom configuration', () => {
        it('Test 50: should use custom maxBufferSize', () => {
            const customProcessor = new StreamProcessor({ maxBufferSize: 50 });
            customProcessor.on('error', () => { /* ignore */ });

            const sessionId = customProcessor.startSession();

            // This should be OK (under 50 chars)
            const result1 = customProcessor.processChunk(sessionId, 'Short');
            expect(result1).toBe(true);

            customProcessor.cleanup();
        });

        it('Test 51: should use custom chunkTimeoutMs', () => {
            const customProcessor = new StreamProcessor({ chunkTimeoutMs: 200 });
            const timeoutEvents: EventData[] = [];
            customProcessor.on('timeout', (data) => timeoutEvents.push({ type: 'timeout', data }));

            customProcessor.startSession();

            // Should not timeout at 100ms
            jest.advanceTimersByTime(100);
            expect(timeoutEvents.length).toBe(0);

            // Should timeout at 201ms
            jest.advanceTimersByTime(101);
            expect(timeoutEvents.length).toBe(1);

            customProcessor.cleanup();
        });
    });

    describe('Chunk ID generation', () => {
        it('Test 52: should generate sequential chunk IDs', () => {
            const sessionId = processor.startSession();

            processor.processChunk(sessionId, 'First');
            processor.processChunk(sessionId, 'Second');
            processor.processChunk(sessionId, 'Third');

            const session = processor.getSession(sessionId);
            expect(session?.chunks[0].id).toBe('chunk-0');
            expect(session?.chunks[1].id).toBe('chunk-1');
            expect(session?.chunks[2].id).toBe('chunk-2');
        });
    });

    describe('Session timing', () => {
        it('Test 53: should track startedAt timestamp', () => {
            const before = Date.now();
            const sessionId = processor.startSession();
            const after = Date.now();

            const session = processor.getSession(sessionId);
            expect(session?.startedAt).toBeGreaterThanOrEqual(before);
            expect(session?.startedAt).toBeLessThanOrEqual(after);
        });

        it('Test 54: should track lastChunkAt timestamp', () => {
            const sessionId = processor.startSession();
            const before = Date.now();

            processor.processChunk(sessionId, 'Chunk');

            const session = processor.getSession(sessionId);
            expect(session?.lastChunkAt).toBeGreaterThanOrEqual(before);
        });

        it('Test 55: should calculate duration in result', () => {
            const sessionId = processor.startSession();
            processor.processChunk(sessionId, 'Content');

            const result = processor.complete(sessionId);

            expect(result?.duration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Error event handling', () => {
        it('Test 56: should mark session inactive on error', () => {
            const smallProcessor = new StreamProcessor({ maxBufferSize: 5 });
            smallProcessor.on('error', () => { /* ignore */ });

            const sessionId = smallProcessor.startSession();
            smallProcessor.processChunk(sessionId, 'Too long string');

            const session = smallProcessor.getSession(sessionId);
            expect(session?.isActive).toBe(false);
            expect(session?.error).toBeDefined();
            smallProcessor.cleanup();
        });
    });

    describe('Parse chunk error handling', () => {
        it('Test 57: should handle object that throws on property access', () => {
            const sessionId = processor.startSession();

            // Create an object that throws when accessed
            const throwingObj = {
                get choices(): never {
                    throw new Error('Property access error');
                }
            };

            // This should return false because parseChunk catches and returns null
            const result = processor.processChunk(sessionId, throwingObj);

            expect(result).toBe(false);
        });

        it('Test 58: should handle invalid JSON in SSE data prefix', () => {
            const sessionId = processor.startSession();

            // Invalid JSON after data: prefix - should be treated as raw text
            const result = processor.processChunk(sessionId, 'data: {invalid json}');

            expect(result).toBe(true);
            // The entire string is treated as raw text since JSON parsing fails
            expect(processor.getBuffer(sessionId)).toBe('data: {invalid json}');
        });
    });

    describe('Multiple stop token detection', () => {
        it('Test 59: should handle multiple stop tokens in config', () => {
            const multiStopProcessor = new StreamProcessor({
                stopTokens: ['<|end|>', '<|endoftext|>', '[DONE]', '###']
            });
            const completeEvents: EventData[] = [];
            multiStopProcessor.on('complete', (data) => completeEvents.push({ type: 'complete', data }));

            const sessionId = multiStopProcessor.startSession();
            multiStopProcessor.processChunk(sessionId, 'Response ###');

            expect(completeEvents.length).toBe(1);
            expect(multiStopProcessor.getBuffer(sessionId)).toBe('Response ');
            multiStopProcessor.cleanup();
        });
    });
});
