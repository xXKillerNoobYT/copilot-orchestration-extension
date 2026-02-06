/**
 * @file llm/polling.ts
 * @module LLMPolling
 * @description Token polling system for OpenAI-compatible API integration (MT-010.3)
 * 
 * Polls for new streaming tokens at configurable intervals.
 * 
 * **Simple explanation**: Like checking your mailbox periodically for new mail -
 * we check the LLM server regularly to see if new tokens have arrived from the
 * streaming response.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../logger';
import { getConfigInstance } from '../config';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Poll result containing new tokens
 */
export interface PollResult {
    /** New tokens received since last poll */
    tokens: string;
    /** Whether the stream is complete */
    isComplete: boolean;
    /** Total tokens accumulated so far */
    totalTokens: number;
    /** Error if polling failed */
    error?: Error;
}

/**
 * Polling session state
 */
export interface PollingSession {
    /** Session identifier */
    id: string;
    /** Whether polling is active */
    isActive: boolean;
    /** Accumulated tokens */
    accumulatedTokens: string;
    /** Poll count */
    pollCount: number;
    /** Session start time */
    startedAt: number;
    /** Last poll time */
    lastPollAt: number;
}

/**
 * Configuration for polling
 */
export interface PollingConfig {
    /** Poll interval in seconds (10-120) */
    pollIntervalSeconds: number;
    /** Maximum polls before timeout */
    maxPolls: number;
    /** Endpoint to poll */
    endpoint: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_POLLING_CONFIG: PollingConfig = {
    pollIntervalSeconds: 30,
    maxPolls: 100,
    endpoint: 'http://127.0.0.1:1234/v1'
};

// ============================================================================
// TokenPoller Class
// ============================================================================

/**
 * Token poller for streaming LLM responses.
 * 
 * **Simple explanation**: A mailman who checks your mailbox at regular intervals,
 * collecting any new tokens that have arrived and delivering them to you.
 * 
 * @emits 'poll' - When a poll is initiated
 * @emits 'tokens' - When new tokens are received
 * @emits 'complete' - When the stream is finished
 * @emits 'error' - When polling fails
 * @emits 'timeout' - When max polls exceeded
 */
export class TokenPoller extends EventEmitter {
    private config: PollingConfig;
    private sessions: Map<string, PollingSession> = new Map();
    private pollIntervalHandles: Map<string, ReturnType<typeof setInterval>> = new Map();
    private sessionIdCounter = 0;

    constructor(config: Partial<PollingConfig> = {}) {
        super();
        this.config = { ...DEFAULT_POLLING_CONFIG, ...config };

        // Try to get interval from config
        try {
            const appConfig = getConfigInstance();
            if (appConfig.lmStudioPolling?.tokenPollIntervalSeconds) {
                this.config.pollIntervalSeconds = appConfig.lmStudioPolling.tokenPollIntervalSeconds;
            }
            if (appConfig.llm?.endpoint) {
                this.config.endpoint = appConfig.llm.endpoint;
            }
        } catch {
            // Config not initialized yet, use defaults
        }

        logInfo(`TokenPoller initialized (interval=${this.config.pollIntervalSeconds}s)`);
    }

    /**
     * Generate a unique session ID
     */
    private generateSessionId(): string {
        return `poll-session-${Date.now()}-${++this.sessionIdCounter}`;
    }

    /**
     * Start polling for tokens (MT-010.3)
     * 
     * @param streamId - The stream/request ID to poll for
     * @param pollFunction - Function that returns new tokens when called
     * @returns Session ID for tracking
     */
    startPolling(
        streamId: string,
        pollFunction: () => Promise<PollResult>
    ): string {
        const sessionId = this.generateSessionId();

        const session: PollingSession = {
            id: sessionId,
            isActive: true,
            accumulatedTokens: '',
            pollCount: 0,
            startedAt: Date.now(),
            lastPollAt: Date.now()
        };

        this.sessions.set(sessionId, session);

        // Start polling interval
        const intervalMs = this.config.pollIntervalSeconds * 1000;
        const handle = setInterval(async () => {
            await this.doPoll(sessionId, pollFunction);
        }, intervalMs);

        this.pollIntervalHandles.set(sessionId, handle);

        // Do an immediate poll
        this.doPoll(sessionId, pollFunction);

        logInfo(`Polling started for ${streamId} (session=${sessionId}, interval=${this.config.pollIntervalSeconds}s)`);
        return sessionId;
    }

    /**
     * Perform a single poll
     */
    private async doPoll(
        sessionId: string,
        pollFunction: () => Promise<PollResult>
    ): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isActive) {
            return;
        }

        session.pollCount++;
        session.lastPollAt = Date.now();

        // Check max polls
        if (session.pollCount > this.config.maxPolls) {
            this.emit('timeout', { sessionId, pollCount: session.pollCount });
            logWarn(`Polling session ${sessionId} timed out after ${session.pollCount} polls`);
            this.stopPolling(sessionId);
            return;
        }

        this.emit('poll', { sessionId, pollCount: session.pollCount });

        try {
            const result = await pollFunction();

            if (result.error) {
                this.emit('error', { sessionId, error: result.error });
                logError(`Polling error for ${sessionId}: ${result.error.message}`);
                this.stopPolling(sessionId);
                return;
            }

            if (result.tokens) {
                session.accumulatedTokens += result.tokens;
                this.emit('tokens', {
                    sessionId,
                    newTokens: result.tokens,
                    totalTokens: session.accumulatedTokens.length
                });
            }

            if (result.isComplete) {
                this.emit('complete', {
                    sessionId,
                    finalTokens: session.accumulatedTokens,
                    pollCount: session.pollCount,
                    durationMs: Date.now() - session.startedAt
                });
                logInfo(`Polling complete for ${sessionId} (${session.pollCount} polls, ${session.accumulatedTokens.length} chars)`);
                this.stopPolling(sessionId);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.emit('error', { sessionId, error: err });
            logError(`Polling exception for ${sessionId}: ${err.message}`);
            this.stopPolling(sessionId);
        }
    }

    /**
     * Stop polling for a session
     */
    stopPolling(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.isActive = false;
        }

        const handle = this.pollIntervalHandles.get(sessionId);
        if (handle) {
            clearInterval(handle);
            this.pollIntervalHandles.delete(sessionId);
        }

        logInfo(`Polling stopped for ${sessionId}`);
    }

    /**
     * Get session status
     */
    getSession(sessionId: string): PollingSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Get all active sessions
     */
    getActiveSessions(): PollingSession[] {
        return Array.from(this.sessions.values()).filter(s => s.isActive);
    }

    /**
     * Update polling interval (takes effect on new sessions)
     */
    setPollingInterval(seconds: number): void {
        if (seconds < 10 || seconds > 120) {
            throw new Error('Polling interval must be between 10 and 120 seconds');
        }
        this.config.pollIntervalSeconds = seconds;
        logInfo(`Polling interval updated to ${seconds}s`);
    }

    /**
     * Clean up all sessions
     */
    cleanup(): void {
        for (const [sessionId, handle] of this.pollIntervalHandles) {
            clearInterval(handle);
            this.pollIntervalHandles.delete(sessionId);

            const session = this.sessions.get(sessionId);
            if (session) {
                session.isActive = false;
            }
        }

        logInfo(`TokenPoller cleaned up (${this.sessions.size} sessions)`);
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: TokenPoller | null = null;

/**
 * Get the singleton token poller instance
 */
export function getTokenPollerInstance(): TokenPoller {
    if (!instance) {
        instance = new TokenPoller();
    }
    return instance;
}

/**
 * Reset the poller instance (for testing)
 */
export function resetTokenPollerForTests(): void {
    if (instance) {
        instance.cleanup();
    }
    instance = null;
}

export default TokenPoller;
