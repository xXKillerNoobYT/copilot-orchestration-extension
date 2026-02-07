/**
 * Stream buffering service - buffers LLM streaming output for cleaner logs
 * 
 * Instead of logging every token as it arrives, buffer chunks and log in batches
 * when one of these conditions is met:
 * - 10-20 words accumulated
 * - 30 seconds elapsed since last flush
 * - Stream completes
 */

import { logInfo } from '../logger';

/**
 * Configuration for stream buffering
 */
export interface StreamBufferConfig {
    /** Minimum words before flushing (default: 10) */
    minWordsPerFlush?: number;
    /** Maximum words before forced flush (default: 20) */
    maxWordsPerFlush?: number;
    /** Maximum milliseconds between flushes (default: 30000 = 30 seconds) */
    flushIntervalMs?: number;
    /** Prefix for log messages (default: "LLM") */
    logPrefix?: string;
}

/**
 * Create a buffered stream callback for LLM streaming
 * 
 * **Simple explanation**: Like a clipboard that collects tokens until it's full or time runs out,
 * then logs the whole batch at once instead of logging each token individually.
 * 
 * @param config Configuration for buffering behavior
 * @returns Object with `onChunk` callback and `flush()` method
 */
export function createStreamBuffer(config: StreamBufferConfig = {}) {
    const {
        minWordsPerFlush = 10,
        maxWordsPerFlush = 20,
        flushIntervalMs = 30000,
        logPrefix = 'LLM'
    } = config;

    let buffer = '';
    let flushTimer: NodeJS.Timeout | null = null;
    let lastFlushTime = Date.now();

    /**
     * Count approximate words in text (simple split-by-whitespace)
     */
    function countWords(text: string): number {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * Internal flush function
     */
    function doFlush(): void {
        if (buffer.length === 0) {
            return;
        }

        const content = buffer.trim();
        if (content.length > 0) {
            logInfo(`${logPrefix}: ${content}`);
        }

        buffer = '';
        lastFlushTime = Date.now();

        // Clear existing timer
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    }

    /**
     * Set up the time-based flush timer
     */
    function resetFlushTimer(): void {
        if (flushTimer) {
            clearTimeout(flushTimer);
        }

        flushTimer = setTimeout(() => {
            doFlush();
        }, flushIntervalMs);
    }

    return {
        /**
         * Process incoming chunk from LLM stream
         * 
         * @param chunk The text chunk from the LLM
         */
        onChunk(chunk: string): void {
            buffer += chunk;

            const wordCount = countWords(buffer);

            // Flush if buffer has too many words
            if (wordCount >= maxWordsPerFlush) {
                doFlush();
                resetFlushTimer();
                return;
            }

            // Start timer if buffer has minimum words
            if (wordCount >= minWordsPerFlush && !flushTimer) {
                // Give a bit of time to see if more chunks arrive (batch them together)
                resetFlushTimer();
            }

            // Timer already running, let it handle the flush
        },

        /**
         * Manually flush remaining buffer (call when stream completes)
         */
        flush(): void {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            doFlush();
        },

        /**
         * Get current buffer content without flushing
         */
        getBuffer(): string {
            return buffer;
        },

        /**
         * Clear buffer without logging
         */
        clear(): void {
            buffer = '';
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
        }
    };
}

/**
 * Type for the stream buffer object returned by createStreamBuffer
 */
export type StreamBuffer = ReturnType<typeof createStreamBuffer>;
