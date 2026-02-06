/**
 * @file llm/streaming.ts
 * @module LLMStreaming
 * @description Streaming chunk processing for LLM responses (MT-010.7)
 * 
 * Accumulates streaming chunks from OpenAI-compatible API into complete responses.
 * Handles partial chunks, detects stream completion, and manages buffering.
 * 
 * **Simple explanation**: Like receiving a long letter in multiple envelopes -
 * this module collects all the pieces, puts them in order, and tells you when
 * the complete message has arrived.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * A chunk from the LLM stream
 */
export interface StreamChunk {
    /** The chunk ID/index */
    id: string;
    /** Timestamp when received */
    timestamp: number;
    /** The content of this chunk */
    content: string;
    /** Whether this is the final chunk */
    isFinal: boolean;
    /** Token usage (if included) */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Accumulated stream result
 */
export interface StreamResult {
    /** Complete accumulated content */
    content: string;
    /** Total chunks received */
    chunkCount: number;
    /** Time from first to last chunk (ms) */
    duration: number;
    /** Final token usage */
    usage?: StreamChunk['usage'];
}

/**
 * Stream session state
 */
export interface StreamSession {
    /** Session identifier */
    id: string;
    /** Whether the stream is active */
    isActive: boolean;
    /** Accumulated content */
    buffer: string;
    /** Chunks received */
    chunks: StreamChunk[];
    /** Session start time */
    startedAt: number;
    /** Last chunk time */
    lastChunkAt: number;
    /** Whether stream is complete */
    isComplete: boolean;
    /** Error if stream failed */
    error?: Error;
}

/**
 * Configuration for streaming
 */
export interface StreamingConfig {
    /** Maximum buffer size in characters */
    maxBufferSize: number;
    /** Timeout between chunks before considering stream stale (ms) */
    chunkTimeoutMs: number;
    /** Expected stop tokens/sequences */
    stopTokens: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
    maxBufferSize: 100000, // ~100KB of text
    chunkTimeoutMs: 30000, // 30 seconds
    stopTokens: ['[DONE]', '<|endoftext|>', '</s>']
};

// ============================================================================
// StreamProcessor Class
// ============================================================================

/**
 * Processes streaming chunks from LLM into complete responses.
 * 
 * **Simple explanation**: A mail sorter that collects pieces of a letter
 * as they arrive, puts them together, and delivers the complete message
 * when all pieces have arrived.
 * 
 * @emits 'chunk' - When a new chunk is received
 * @emits 'progress' - Periodic progress updates
 * @emits 'complete' - When the stream is finished
 * @emits 'error' - When an error occurs
 * @emits 'timeout' - When no chunks received for too long
 */
export class StreamProcessor extends EventEmitter {
    private config: StreamingConfig;
    private sessions: Map<string, StreamSession> = new Map();
    private timeoutHandles: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private sessionIdCounter = 0;

    constructor(config: Partial<StreamingConfig> = {}) {
        super();
        this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
        logInfo(`StreamProcessor initialized (maxBuffer=${this.config.maxBufferSize}, chunkTimeout=${this.config.chunkTimeoutMs}ms)`);
    }

    /**
     * Generate a unique session ID
     */
    private generateSessionId(): string {
        return `stream-${Date.now()}-${++this.sessionIdCounter}`;
    }

    /**
     * Start a new streaming session
     */
    startSession(): string {
        const sessionId = this.generateSessionId();

        const session: StreamSession = {
            id: sessionId,
            isActive: true,
            buffer: '',
            chunks: [],
            startedAt: Date.now(),
            lastChunkAt: Date.now(),
            isComplete: false
        };

        this.sessions.set(sessionId, session);
        this.resetTimeout(sessionId);

        logInfo(`Streaming session ${sessionId} started`);
        return sessionId;
    }

    /**
     * Process an incoming chunk (MT-010.7)
     * 
     * @param sessionId - The session to add the chunk to
     * @param data - The raw chunk data (string or object)
     * @returns true if chunk was processed successfully
     */
    processChunk(sessionId: string, data: string | object): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logWarn(`Chunk received for unknown session ${sessionId}`);
            return false;
        }

        if (!session.isActive) {
            logWarn(`Chunk received for inactive session ${sessionId}`);
            return false;
        }

        // Reset timeout
        this.resetTimeout(sessionId);

        // Parse the chunk
        const chunk = this.parseChunk(data, session.chunks.length);
        if (!chunk) {
            return false;
        }

        // Check for stop tokens
        const hasStopToken = this.config.stopTokens.some(token =>
            chunk.content.includes(token) || (typeof data === 'string' && data.includes(token))
        );

        if (hasStopToken) {
            chunk.isFinal = true;
            // Remove stop token from content
            for (const token of this.config.stopTokens) {
                chunk.content = chunk.content.replace(token, '');
            }
        }

        // Add to session
        session.chunks.push(chunk);
        session.buffer += chunk.content;
        session.lastChunkAt = Date.now();

        // Check buffer size
        if (session.buffer.length > this.config.maxBufferSize) {
            this.handleError(sessionId, new Error(`Buffer overflow: exceeded ${this.config.maxBufferSize} characters`));
            return false;
        }

        // Emit events
        this.emit('chunk', {
            sessionId,
            chunk,
            totalChunks: session.chunks.length,
            bufferSize: session.buffer.length
        });

        // Check for completion
        if (chunk.isFinal) {
            this.completeSession(sessionId, chunk.usage);
        }

        return true;
    }

    /**
     * Parse raw data into a StreamChunk
     */
    private parseChunk(data: string | object, index: number): StreamChunk | null {
        const timestamp = Date.now();

        try {
            // Handle string data
            if (typeof data === 'string') {
                // Try to parse as JSON (SSE format)
                if (data.startsWith('data: ')) {
                    const jsonStr = data.substring(6).trim();
                    if (jsonStr === '[DONE]') {
                        return {
                            id: `chunk-${index}`,
                            timestamp,
                            content: '',
                            isFinal: true
                        };
                    }
                    try {
                        const parsed = JSON.parse(jsonStr);
                        return this.extractChunkFromObject(parsed, index, timestamp);
                    } catch {
                        // Not JSON, treat as raw text
                    }
                }

                // Raw text chunk
                return {
                    id: `chunk-${index}`,
                    timestamp,
                    content: data,
                    isFinal: false
                };
            }

            // Handle object data
            return this.extractChunkFromObject(data, index, timestamp);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`Failed to parse chunk: ${msg}`);
            return null;
        }
    }

    /**
     * Extract chunk data from a parsed object (OpenAI-compatible format)
     */
    private extractChunkFromObject(
        obj: object,
        index: number,
        timestamp: number
    ): StreamChunk {
        const record = obj as Record<string, unknown>;
        // OpenAI streaming format: choices[0].delta.content
        let content = '';
        let isFinal = false;
        let usage: StreamChunk['usage'];

        if (record.choices && Array.isArray(record.choices) && record.choices.length > 0) {
            const choice = record.choices[0] as Record<string, unknown>;

            // Handle delta (streaming) or message (final)
            const delta = (choice.delta || choice.message) as Record<string, unknown> | undefined;
            if (delta && typeof delta.content === 'string') {
                content = delta.content;
            }

            // Check finish_reason
            if (choice.finish_reason) {
                isFinal = true;
            }
        }

        // Extract usage if present
        if (record.usage && typeof record.usage === 'object') {
            const u = record.usage as Record<string, unknown>;
            if (typeof u.prompt_tokens === 'number' &&
                typeof u.completion_tokens === 'number' &&
                typeof u.total_tokens === 'number') {
                usage = {
                    prompt_tokens: u.prompt_tokens,
                    completion_tokens: u.completion_tokens,
                    total_tokens: u.total_tokens
                };
            }
        }

        return {
            id: (record.id as string) || `chunk-${index}`,
            timestamp,
            content,
            isFinal,
            usage
        };
    }

    /**
     * Complete a streaming session
     */
    private completeSession(sessionId: string, usage?: StreamChunk['usage']): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        // Clear timeout
        this.clearTimeout(sessionId);

        session.isActive = false;
        session.isComplete = true;

        const result: StreamResult = {
            content: session.buffer,
            chunkCount: session.chunks.length,
            duration: Date.now() - session.startedAt,
            usage
        };

        this.emit('complete', { sessionId, result });
        logInfo(`Stream ${sessionId} complete: ${result.chunkCount} chunks, ${result.content.length} chars, ${result.duration}ms`);
    }

    /**
     * Manually complete a session (when you know it's done)
     */
    complete(sessionId: string): StreamResult | null {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        // Find any usage info from chunks
        const lastChunkWithUsage = session.chunks.reverse().find(c => c.usage);
        this.completeSession(sessionId, lastChunkWithUsage?.usage);

        return {
            content: session.buffer,
            chunkCount: session.chunks.length,
            duration: Date.now() - session.startedAt,
            usage: lastChunkWithUsage?.usage
        };
    }

    /**
     * Handle a streaming error
     */
    private handleError(sessionId: string, error: Error): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        this.clearTimeout(sessionId);
        session.isActive = false;
        session.error = error;

        this.emit('error', { sessionId, error });
        logError(`Stream ${sessionId} error: ${error.message}`);
    }

    /**
     * Reset the chunk timeout for a session
     */
    private resetTimeout(sessionId: string): void {
        this.clearTimeout(sessionId);

        const handle = setTimeout(() => {
            this.handleTimeout(sessionId);
        }, this.config.chunkTimeoutMs);

        this.timeoutHandles.set(sessionId, handle);
    }

    /**
     * Clear the timeout for a session
     */
    private clearTimeout(sessionId: string): void {
        const handle = this.timeoutHandles.get(sessionId);
        if (handle) {
            clearTimeout(handle);
            this.timeoutHandles.delete(sessionId);
        }
    }

    /**
     * Handle a session timeout
     */
    private handleTimeout(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isActive) {
            return;
        }

        const timeSinceLastChunk = Date.now() - session.lastChunkAt;

        this.emit('timeout', { sessionId, timeSinceLastChunk });
        logWarn(`Stream ${sessionId} timed out (no chunks for ${timeSinceLastChunk}ms)`);

        session.isActive = false;
        session.error = new Error(`Stream timed out: no chunks for ${timeSinceLastChunk}ms`);
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: string): StreamSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Get current buffer content for a session
     */
    getBuffer(sessionId: string): string | undefined {
        return this.sessions.get(sessionId)?.buffer;
    }

    /**
     * Cancel a streaming session
     */
    cancel(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isActive) {
            return false;
        }

        this.clearTimeout(sessionId);
        session.isActive = false;
        session.error = new Error('Stream cancelled');

        this.emit('cancelled', { sessionId });
        logInfo(`Stream ${sessionId} cancelled`);
        return true;
    }

    /**
     * Clean up all sessions
     */
    cleanup(): void {
        for (const handle of this.timeoutHandles.values()) {
            clearTimeout(handle);
        }
        this.timeoutHandles.clear();

        for (const session of this.sessions.values()) {
            session.isActive = false;
        }

        logInfo(`StreamProcessor cleaned up (${this.sessions.size} sessions)`);
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: StreamProcessor | null = null;

/**
 * Get the singleton stream processor instance
 */
export function getStreamProcessorInstance(): StreamProcessor {
    if (!instance) {
        instance = new StreamProcessor();
    }
    return instance;
}

/**
 * Reset the stream processor (for testing)
 */
export function resetStreamProcessorForTests(): void {
    if (instance) {
        instance.cleanup();
    }
    instance = null;
}

export default StreamProcessor;
