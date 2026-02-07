/**
 * @file streamBuffer.test.ts
 * @description Tests for StreamBuffer service (buffered LLM streaming)
 */

import { createStreamBuffer, StreamBuffer } from '../../src/services/streamBuffer';
import * as logger from '../../src/logger';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
}));

describe('StreamBuffer', () => {
    let buffer: StreamBuffer;
    const logInfo = logger.logInfo as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Test 1: createStreamBuffer with defaults', () => {
        it('should create buffer with default config', () => {
            buffer = createStreamBuffer();
            expect(buffer).toBeDefined();
            expect(buffer.onChunk).toBeDefined();
            expect(buffer.flush).toBeDefined();
            expect(buffer.getBuffer).toBeDefined();
            expect(buffer.clear).toBeDefined();
        });
    });

    describe('Test 2: createStreamBuffer with custom config', () => {
        it('should accept custom config values', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 5,
                maxWordsPerFlush: 15,
                flushIntervalMs: 10000,
                logPrefix: 'Custom',
            });
            expect(buffer).toBeDefined();
        });
    });

    describe('Test 3: onChunk - accumulates content', () => {
        it('should accumulate chunks in the buffer', () => {
            buffer = createStreamBuffer();
            buffer.onChunk('Hello ');
            buffer.onChunk('World');
            expect(buffer.getBuffer()).toBe('Hello World');
        });
    });

    describe('Test 4: flush - logs accumulated content', () => {
        it('should log content when flush is called', () => {
            buffer = createStreamBuffer({ logPrefix: 'Test' });
            buffer.onChunk('Hello World');
            buffer.flush();

            expect(logInfo).toHaveBeenCalledWith('Test: Hello World');
            expect(buffer.getBuffer()).toBe('');
        });

        it('should not log when buffer is empty', () => {
            buffer = createStreamBuffer();
            buffer.flush();
            expect(logInfo).not.toHaveBeenCalled();
        });

        it('should not log whitespace-only content', () => {
            buffer = createStreamBuffer();
            buffer.onChunk('   \n\t  ');
            buffer.flush();
            // doFlush trims and checks length before logging
            expect(logInfo).not.toHaveBeenCalled();
        });
    });

    describe('Test 5: onChunk - auto-flush at maxWordsPerFlush', () => {
        it('should auto-flush when max words reached', () => {
            buffer = createStreamBuffer({
                maxWordsPerFlush: 5,
                logPrefix: 'Max',
            });

            // Add 5 words to trigger max flush
            buffer.onChunk('one two three four five');

            expect(logInfo).toHaveBeenCalledWith('Max: one two three four five');
            expect(buffer.getBuffer()).toBe('');
        });
    });

    describe('Test 6: onChunk - timer starts at minWordsPerFlush', () => {
        it('should start timer when min words reached', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 3,
                maxWordsPerFlush: 10,
                flushIntervalMs: 5000,
                logPrefix: 'Timer',
            });

            // Add 3 words to trigger timer start
            buffer.onChunk('one two three');

            // Timer is set but not fired yet
            expect(logInfo).not.toHaveBeenCalled();
            expect(buffer.getBuffer()).toBe('one two three');

            // Advance timer
            jest.advanceTimersByTime(5000);

            expect(logInfo).toHaveBeenCalledWith('Timer: one two three');
            expect(buffer.getBuffer()).toBe('');
        });

        it('should not start timer when under min words', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 10,
                maxWordsPerFlush: 20,
                flushIntervalMs: 5000,
            });

            buffer.onChunk('just two');

            // Timer should not fire
            jest.advanceTimersByTime(10000);
            expect(logInfo).not.toHaveBeenCalled();
        });
    });

    describe('Test 7: onChunk - timer reset on max flush', () => {
        it('should reset timer when max flush occurs', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 2,
                maxWordsPerFlush: 5,
                flushIntervalMs: 10000,
                logPrefix: 'Reset',
            });

            // First batch - triggers timer at min words
            buffer.onChunk('one two three');
            expect(buffer.getBuffer()).toBe('one two three');

            // Add more to exceed max - should flush and reset timer
            buffer.onChunk(' four five six');

            // Max flush triggered
            expect(logInfo).toHaveBeenCalledTimes(1);
            expect(buffer.getBuffer()).toBe('');
        });
    });

    describe('Test 8: clear - clears buffer without logging', () => {
        it('should clear buffer content', () => {
            buffer = createStreamBuffer();
            buffer.onChunk('Some content');
            expect(buffer.getBuffer()).toBe('Some content');

            buffer.clear();
            expect(buffer.getBuffer()).toBe('');
            expect(logInfo).not.toHaveBeenCalled();
        });

        it('should clear pending timers', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 2,
                flushIntervalMs: 5000,
            });

            // Start a timer by hitting min words
            buffer.onChunk('one two three');

            // Clear everything
            buffer.clear();

            // Timer should not fire after clearing
            jest.advanceTimersByTime(10000);
            expect(logInfo).not.toHaveBeenCalled();
        });
    });

    describe('Test 9: getBuffer - returns current content', () => {
        it('should return empty string initially', () => {
            buffer = createStreamBuffer();
            expect(buffer.getBuffer()).toBe('');
        });

        it('should return accumulated content', () => {
            buffer = createStreamBuffer();
            buffer.onChunk('chunk1 ');
            buffer.onChunk('chunk2');
            expect(buffer.getBuffer()).toBe('chunk1 chunk2');
        });
    });

    describe('Test 10: flush clears pending timer', () => {
        it('should cancel pending timer on manual flush', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 2,
                flushIntervalMs: 10000,
                logPrefix: 'Manual',
            });

            buffer.onChunk('one two three');
            buffer.flush();

            expect(logInfo).toHaveBeenCalledTimes(1);

            // Timer should not fire again
            jest.advanceTimersByTime(10000);
            expect(logInfo).toHaveBeenCalledTimes(1);
        });
    });

    describe('Test 11: word counting edge cases', () => {
        it('should count multiple whitespace as word separator', () => {
            buffer = createStreamBuffer({
                maxWordsPerFlush: 3,
            });

            // Three words with extra whitespace
            buffer.onChunk('one    two\n\t\tthree');

            // Should flush at 3 words
            expect(logInfo).toHaveBeenCalled();
        });

        it('should handle empty string chunks', () => {
            buffer = createStreamBuffer();
            buffer.onChunk('');
            buffer.onChunk('');
            buffer.onChunk('word');
            expect(buffer.getBuffer()).toBe('word');
        });
    });

    describe('Test 12: timer interval handling', () => {
        it('should flush after interval expires', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 2,
                maxWordsPerFlush: 100,
                flushIntervalMs: 3000,
                logPrefix: 'Interval',
            });

            buffer.onChunk('word one two');

            // Not flushed yet
            expect(logInfo).not.toHaveBeenCalled();

            // Partial time advance
            jest.advanceTimersByTime(2000);
            expect(logInfo).not.toHaveBeenCalled();

            // Complete time advance
            jest.advanceTimersByTime(1000);
            expect(logInfo).toHaveBeenCalledWith('Interval: word one two');
        });
    });

    describe('Test 13: default flushIntervalMs', () => {
        it('should use 30 second default', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 2,
                maxWordsPerFlush: 100,
                // No flushIntervalMs - should default to 30000
            });

            buffer.onChunk('one two three');

            // Not flushed before 30 seconds
            jest.advanceTimersByTime(29000);
            expect(logInfo).not.toHaveBeenCalled();

            // Flushed at 30 seconds
            jest.advanceTimersByTime(1000);
            expect(logInfo).toHaveBeenCalled();
        });
    });

    describe('Test 14: integration - realistic streaming scenario', () => {
        it('should handle realistic LLM streaming', () => {
            buffer = createStreamBuffer({
                minWordsPerFlush: 10,
                maxWordsPerFlush: 20,
                flushIntervalMs: 5000,
                logPrefix: 'LLM',
            });

            // Simulate streaming tokens
            buffer.onChunk('The');
            buffer.onChunk(' quick');
            buffer.onChunk(' brown');
            buffer.onChunk(' fox');
            buffer.onChunk(' jumps');

            expect(logInfo).not.toHaveBeenCalled(); // Under 10 words

            buffer.onChunk(' over');
            buffer.onChunk(' the');
            buffer.onChunk(' lazy');
            buffer.onChunk(' dog.');
            buffer.onChunk(' Then');

            // At 10 words, timer starts but no auto-flush yet
            expect(buffer.getBuffer()).toContain('quick brown fox');

            // Continue streaming
            buffer.onChunk(' it');
            buffer.onChunk(' runs');
            buffer.onChunk(' away');
            buffer.onChunk(' quickly');
            buffer.onChunk(' into');
            buffer.onChunk(' the');
            buffer.onChunk(' forest');
            buffer.onChunk(' and');
            buffer.onChunk(' stops');
            buffer.onChunk(' there.');

            // Should have auto-flushed at 20 words
            expect(logInfo).toHaveBeenCalled();

            // Stream end - manual flush for remaining
            buffer.onChunk(' The end.');
            buffer.flush();
        });
    });
});
