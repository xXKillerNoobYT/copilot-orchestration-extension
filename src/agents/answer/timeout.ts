/**
 * @file answer/timeout.ts
 * @module AnswerTeam/Timeout
 * @description 45-second timeout handling for Answer Team (MT-014.8, MT-014.9)
 * 
 * Implements timeout enforcement for answer generation. If the LLM takes
 * longer than 45 seconds, we abort and create a ticket for human review.
 * 
 * **Simple explanation**: A timer that says "you only have 45 seconds to answer."
 * If you can't answer in time, we stop waiting and ask a human instead.
 */

import { logInfo, logWarn, logError } from '../../logger';
import { createTicket } from '../../services/ticketDb';

// ============================================================================
// Types
// ============================================================================

export interface TimeoutConfig {
    maxResponseSeconds: number;     // Default: 45
    createTicketOnTimeout: boolean; // Default: true
    ticketPriority: number;         // Default: 2
    timeoutMessage: string;         // Message to return on timeout
}

export interface TimeoutResult<T> {
    success: boolean;
    value?: T;
    timedOut: boolean;
    elapsedMs: number;
    ticketId?: string;            // If ticket was created
}

const DEFAULT_CONFIG: TimeoutConfig = {
    maxResponseSeconds: 45,
    createTicketOnTimeout: true,
    ticketPriority: 2,
    timeoutMessage: 'Answer could not be generated in time. A ticket has been created for human review.'
};

// ============================================================================
// TimeoutHandler Class
// ============================================================================

/**
 * Handles timeouts for answer generation
 * 
 * **Simple explanation**: The stopwatch that makes sure we don't wait forever
 * for an answer. If time runs out, we create a ticket and move on.
 */
export class TimeoutHandler {
    private config: TimeoutConfig;
    private activeTimeouts: Map<string, AbortController> = new Map();

    constructor(config?: Partial<TimeoutConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Execute a function with timeout
     * 
     * @param requestId Unique ID for this request (for cancellation)
     * @param fn The async function to execute
     * @param question The original question (for ticket creation)
     * @returns TimeoutResult with success/failure and optional value
     */
    async withTimeout<T>(
        requestId: string,
        fn: (signal: AbortSignal) => Promise<T>,
        question: string
    ): Promise<TimeoutResult<T>> {
        const startTime = Date.now();
        const controller = new AbortController();
        this.activeTimeouts.set(requestId, controller);

        logInfo(`[TimeoutHandler] Starting request ${requestId} (timeout: ${this.config.maxResponseSeconds}s)`);

        const timeoutMs = this.config.maxResponseSeconds * 1000;

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                controller.abort();
                reject(new Error('TIMEOUT'));
            }, timeoutMs);
        });

        try {
            // Race between the function and timeout
            const result = await Promise.race([
                fn(controller.signal),
                timeoutPromise
            ]);

            const elapsedMs = Date.now() - startTime;
            this.activeTimeouts.delete(requestId);

            logInfo(`[TimeoutHandler] Request ${requestId} completed in ${elapsedMs}ms`);

            return {
                success: true,
                value: result,
                timedOut: false,
                elapsedMs
            };
        } catch (error: unknown) {
            const elapsedMs = Date.now() - startTime;
            this.activeTimeouts.delete(requestId);

            const message = error instanceof Error ? error.message : String(error);
            const isTimeout = message === 'TIMEOUT' || controller.signal.aborted;

            if (isTimeout) {
                logWarn(`[TimeoutHandler] Request ${requestId} timed out after ${elapsedMs}ms`);

                let ticketId: string | undefined;
                if (this.config.createTicketOnTimeout) {
                    ticketId = await this.createTimeoutTicket(question, requestId);
                }

                return {
                    success: false,
                    timedOut: true,
                    elapsedMs,
                    ticketId
                };
            }

            // Non-timeout error
            logError(`[TimeoutHandler] Request ${requestId} failed: ${message}`);
            return {
                success: false,
                timedOut: false,
                elapsedMs
            };
        }
    }

    /**
     * Cancel an active request
     */
    cancel(requestId: string): boolean {
        const controller = this.activeTimeouts.get(requestId);
        if (controller) {
            controller.abort();
            this.activeTimeouts.delete(requestId);
            logInfo(`[TimeoutHandler] Cancelled request ${requestId}`);
            return true;
        }
        return false;
    }

    /**
     * Create a ticket for a timed-out question
     */
    private async createTimeoutTicket(question: string, requestId: string): Promise<string> {
        try {
            const ticket = await createTicket({
                title: `TIMEOUT: Answer needed for question (${requestId})`,
                status: 'open',
                description: `## Question (Answer Team Timed Out)\n\n${question}\n\n## Details\n- Timeout: ${this.config.maxResponseSeconds} seconds\n- Request ID: ${requestId}\n- Created: ${new Date().toISOString()}\n\nPlease provide an answer manually.`,
                priority: this.config.ticketPriority,
                creator: 'answer-team',
                assignee: 'user',
                type: 'ai_to_human',
                taskId: null,
                version: 1,
                resolution: null
            });

            logInfo(`[TimeoutHandler] Created timeout ticket: ${ticket.id}`);
            return ticket.id;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[TimeoutHandler] Failed to create timeout ticket: ${message}`);
            return '';
        }
    }

    /**
     * Get the timeout message for responses
     */
    getTimeoutMessage(): string {
        return this.config.timeoutMessage;
    }

    /**
     * Get current timeout in seconds
     */
    getTimeoutSeconds(): number {
        return this.config.maxResponseSeconds;
    }

    /**
     * Set timeout in seconds
     */
    setTimeoutSeconds(seconds: number): void {
        this.config.maxResponseSeconds = Math.max(5, Math.min(300, seconds));
    }

    /**
     * Get count of active requests
     */
    getActiveCount(): number {
        return this.activeTimeouts.size;
    }

    /**
     * Cancel all active requests
     */
    cancelAll(): void {
        for (const [requestId, controller] of this.activeTimeouts.entries()) {
            controller.abort();
            logInfo(`[TimeoutHandler] Cancelled request ${requestId}`);
        }
        this.activeTimeouts.clear();
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTimeoutHandler(config?: Partial<TimeoutConfig>): TimeoutHandler {
    return new TimeoutHandler(config);
}

// ============================================================================
// Utility: Simple timeout wrapper
// ============================================================================

/**
 * Simple utility for one-off timeout wrapping
 * 
 * @param fn The async function to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns The result or throws on timeout
 */
export async function withSimpleTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    });

    return Promise.race([fn(), timeoutPromise]);
}
