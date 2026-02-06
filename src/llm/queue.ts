/**
 * @file llm/queue.ts
 * @module LLMQueue
 * @description Streaming queue data structure for LLM requests (MT-010.1, MT-010.2, MT-010.4, MT-010.6, MT-010.8)
 * 
 * Provides a FIFO queue for managing LLM streaming requests with:
 * - Maximum 5 pending requests (configurable)
 * - Single-threaded execution (one request at a time)
 * - Timeout handling with configurable limits
 * - Queue status logging and monitoring
 * - Graceful shutdown with drain capabilities
 * 
 * **Simple explanation**: Like a line at a coffee shop - only one person can
 * order at a time, and if the line gets too long (>5 people), new customers
 * have to wait or come back later.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../logger';
import { getConfigInstance } from '../config';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Status of a queue request
 */
export type QueueRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled';

/**
 * A request in the LLM queue
 */
export interface QueuedRequest<T = unknown> {
    /** Unique identifier for this request */
    id: string;
    /** The prompt to send to the LLM */
    prompt: string;
    /** System prompt (optional) */
    systemPrompt?: string;
    /** When this request was added to the queue */
    enqueuedAt: number;
    /** When processing started (if started) */
    processingStartedAt?: number;
    /** Current status */
    status: QueueRequestStatus;
    /** Priority (1=highest, 3=lowest) */
    priority: 1 | 2 | 3;
    /** Callback to resolve the promise */
    resolve: (result: T) => void;
    /** Callback to reject the promise */
    reject: (error: Error) => void;
    /** Optional context data */
    context?: Record<string, unknown>;
    /** Timeout handle */
    timeoutHandle?: ReturnType<typeof setTimeout>;
}

/**
 * Queue statistics for monitoring
 */
export interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    timeout: number;
    cancelled: number;
    averageWaitMs: number;
    averageProcessingMs: number;
}

/**
 * Configuration for the queue
 */
export interface QueueConfig {
    /** Maximum pending requests (default: 5) */
    maxPending: number;
    /** Queue timeout in ms (default: 5 minutes) */
    queueTimeoutMs: number;
    /** Processing timeout in ms (default: from config) */
    processingTimeoutMs: number;
    /** Enable verbose logging */
    verbose: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_QUEUE_CONFIG: QueueConfig = {
    maxPending: 5,
    queueTimeoutMs: 5 * 60 * 1000, // 5 minutes
    processingTimeoutMs: 60 * 1000, // 60 seconds (or from config)
    verbose: false
};

// ============================================================================
// LLMQueue Class
// ============================================================================

/**
 * Streaming queue for managing LLM requests with single-threaded execution.
 * 
 * **Simple explanation**: A queue manager that ensures only one LLM request
 * runs at a time, preventing the LLM from being overwhelmed. Think of it as
 * a bouncer at a club - only one person can enter at a time.
 * 
 * @emits 'enqueue' - When a request is added to the queue
 * @emits 'dequeue' - When a request starts processing
 * @emits 'complete' - When a request completes successfully
 * @emits 'error' - When a request fails
 * @emits 'timeout' - When a request times out
 * @emits 'full' - When the queue reaches maximum capacity
 * @emits 'drain' - When the queue becomes empty after being full
 */
export class LLMQueue<T = string> extends EventEmitter {
    private queue: QueuedRequest<T>[] = [];
    private currentRequest: QueuedRequest<T> | null = null;
    private config: QueueConfig;
    private stats = {
        completed: 0,
        failed: 0,
        timeout: 0,
        cancelled: 0,
        totalWaitMs: 0,
        totalProcessingMs: 0
    };
    private isProcessing = false;
    private isShuttingDown = false;
    private requestIdCounter = 0;

    constructor(config: Partial<QueueConfig> = {}) {
        super();
        this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
        
        // Try to get processing timeout from config
        try {
            const appConfig = getConfigInstance();
            if (appConfig.llm?.timeoutSeconds) {
                this.config.processingTimeoutMs = appConfig.llm.timeoutSeconds * 1000;
            }
        } catch {
            // Config not initialized yet, use default
        }

        this.log('info', `LLM Queue initialized (maxPending=${this.config.maxPending}, queueTimeout=${this.config.queueTimeoutMs}ms)`);
    }

    // ========================================================================
    // Core Queue Operations (MT-010.1)
    // ========================================================================

    /**
     * Generate a unique request ID
     */
    private generateRequestId(): string {
        return `llm-req-${Date.now()}-${++this.requestIdCounter}`;
    }

    /**
     * Add a request to the queue (MT-010.1)
     * 
     * @param prompt - The prompt to send
     * @param options - Additional options
     * @returns Promise that resolves when the request completes
     * @throws Error if queue is full and rejectOnFull is true
     */
    enqueue(
        prompt: string,
        options: {
            systemPrompt?: string;
            priority?: 1 | 2 | 3;
            context?: Record<string, unknown>;
            rejectOnFull?: boolean;
        } = {}
    ): Promise<T> {
        const { systemPrompt, priority = 2, context, rejectOnFull = false } = options;

        // Check if shutting down
        if (this.isShuttingDown) {
            return Promise.reject(new Error('Queue is shutting down, not accepting new requests'));
        }

        // Check queue capacity
        if (this.queue.length >= this.config.maxPending) {
            this.emit('full', { pending: this.queue.length });
            
            if (rejectOnFull) {
                this.log('warn', `Queue full (${this.queue.length}/${this.config.maxPending}), rejecting request`);
                return Promise.reject(new Error(`Queue full: max ${this.config.maxPending} pending requests`));
            }
            
            // Queue is full but we'll wait
            this.log('warn', `Queue full (${this.queue.length}/${this.config.maxPending}), request will wait`);
        }

        return new Promise<T>((resolve, reject) => {
            const request: QueuedRequest<T> = {
                id: this.generateRequestId(),
                prompt,
                systemPrompt,
                enqueuedAt: Date.now(),
                status: 'pending',
                priority,
                resolve,
                reject,
                context
            };

            // Set queue timeout (time waiting in queue)
            request.timeoutHandle = setTimeout(() => {
                this.handleQueueTimeout(request);
            }, this.config.queueTimeoutMs);

            // Insert by priority (higher priority = earlier in queue)
            const insertIndex = this.queue.findIndex(r => r.priority > priority);
            if (insertIndex === -1) {
                this.queue.push(request);
            } else {
                this.queue.splice(insertIndex, 0, request);
            }

            this.emit('enqueue', { id: request.id, pending: this.queue.length });
            this.log('info', `Request ${request.id} enqueued (pending: ${this.queue.length}, priority: ${priority})`);

            // Try to process next
            this.processNext();
        });
    }

    /**
     * Process the next request in the queue (MT-010.2)
     * Ensures single-threaded execution - only one request processes at a time.
     */
    private async processNext(): Promise<void> {
        // Single-threaded: if already processing, exit
        if (this.isProcessing || this.currentRequest) {
            return;
        }

        // Get next request from queue
        const request = this.queue.shift();
        if (!request) {
            // Queue empty
            if (this.stats.completed + this.stats.failed > 0) {
                this.emit('drain');
            }
            return;
        }

        // Clear queue timeout (request is now processing)
        if (request.timeoutHandle) {
            clearTimeout(request.timeoutHandle);
            request.timeoutHandle = undefined;
        }

        // Mark as processing
        this.isProcessing = true;
        this.currentRequest = request;
        request.status = 'processing';
        request.processingStartedAt = Date.now();

        // Record wait time
        const waitMs = request.processingStartedAt - request.enqueuedAt;
        this.stats.totalWaitMs += waitMs;

        this.emit('dequeue', { id: request.id, waitMs });
        this.log('info', `Request ${request.id} started processing (waited ${waitMs}ms)`);

        // Set processing timeout
        request.timeoutHandle = setTimeout(() => {
            this.handleProcessingTimeout(request);
        }, this.config.processingTimeoutMs);
    }

    /**
     * Mark the current request as complete (MT-010.2)
     * 
     * @param result - The result from the LLM
     */
    complete(result: T): void {
        const request = this.currentRequest;
        if (!request) {
            this.log('warn', 'complete() called but no request is processing');
            return;
        }

        // Clear timeout
        if (request.timeoutHandle) {
            clearTimeout(request.timeoutHandle);
            request.timeoutHandle = undefined;
        }

        // Record processing time
        const processingMs = Date.now() - (request.processingStartedAt ?? request.enqueuedAt);
        this.stats.totalProcessingMs += processingMs;
        this.stats.completed++;

        request.status = 'completed';
        this.emit('complete', { id: request.id, processingMs });
        this.log('info', `Request ${request.id} completed (processed in ${processingMs}ms)`);

        // Resolve promise
        request.resolve(result);

        // Clean up and process next
        this.currentRequest = null;
        this.isProcessing = false;
        this.processNext();
    }

    /**
     * Mark the current request as failed (MT-010.6)
     * 
     * @param error - The error that occurred
     */
    fail(error: Error): void {
        const request = this.currentRequest;
        if (!request) {
            this.log('warn', 'fail() called but no request is processing');
            return;
        }

        // Clear timeout
        if (request.timeoutHandle) {
            clearTimeout(request.timeoutHandle);
            request.timeoutHandle = undefined;
        }

        // Record stats
        const processingMs = Date.now() - (request.processingStartedAt ?? request.enqueuedAt);
        this.stats.totalProcessingMs += processingMs;
        this.stats.failed++;

        request.status = 'failed';
        this.emit('error', { id: request.id, error, processingMs });
        this.log('error', `Request ${request.id} failed: ${error.message}`);

        // Reject promise
        request.reject(error);

        // Clean up and process next
        this.currentRequest = null;
        this.isProcessing = false;
        this.processNext();
    }

    // ========================================================================
    // Timeout Handling (MT-010.6)
    // ========================================================================

    /**
     * Handle timeout while request is waiting in queue
     */
    private handleQueueTimeout(request: QueuedRequest<T>): void {
        // Remove from queue
        const index = this.queue.findIndex(r => r.id === request.id);
        if (index > -1) {
            this.queue.splice(index, 1);
        }

        this.stats.timeout++;
        request.status = 'timeout';
        this.emit('timeout', { id: request.id, phase: 'queue', waitMs: Date.now() - request.enqueuedAt });
        this.log('warn', `Request ${request.id} timed out while waiting in queue`);

        request.reject(new Error(`Request timed out after ${this.config.queueTimeoutMs}ms in queue`));
    }

    /**
     * Handle timeout while request is being processed
     */
    private handleProcessingTimeout(request: QueuedRequest<T>): void {
        if (this.currentRequest?.id !== request.id) {
            return; // Request already completed
        }

        const processingMs = Date.now() - (request.processingStartedAt ?? request.enqueuedAt);
        this.stats.timeout++;
        request.status = 'timeout';

        this.emit('timeout', { id: request.id, phase: 'processing', processingMs });
        this.log('warn', `Request ${request.id} timed out during processing (${processingMs}ms)`);

        request.reject(new Error(`Request timed out after ${processingMs}ms processing`));

        // Clean up and process next
        this.currentRequest = null;
        this.isProcessing = false;
        this.processNext();
    }

    // ========================================================================
    // Queue Status & Logging (MT-010.4)
    // ========================================================================

    /**
     * Get current queue statistics
     */
    getStats(): QueueStats {
        const completed = this.stats.completed;
        const failed = this.stats.failed;
        const totalCompleted = completed + failed;

        return {
            pending: this.queue.length,
            processing: this.currentRequest ? 1 : 0,
            completed,
            failed,
            timeout: this.stats.timeout,
            cancelled: this.stats.cancelled,
            averageWaitMs: totalCompleted > 0 ? this.stats.totalWaitMs / totalCompleted : 0,
            averageProcessingMs: totalCompleted > 0 ? this.stats.totalProcessingMs / totalCompleted : 0
        };
    }

    /**
     * Get the current request being processed
     */
    getCurrentRequest(): QueuedRequest<T> | null {
        return this.currentRequest;
    }

    /**
     * Get all pending requests (not including current)
     */
    getPendingRequests(): QueuedRequest<T>[] {
        return [...this.queue];
    }

    /**
     * Check if queue is full
     */
    isFull(): boolean {
        return this.queue.length >= this.config.maxPending;
    }

    /**
     * Check if queue is empty (no pending or processing)
     */
    isEmpty(): boolean {
        return this.queue.length === 0 && !this.currentRequest;
    }

    /**
     * Internal logging helper
     */
    private log(level: 'info' | 'warn' | 'error', message: string): void {
        if (!this.config.verbose && level === 'info') {
            return;
        }

        const logFn = level === 'error' ? logError : level === 'warn' ? logWarn : logInfo;
        logFn(`[LLMQueue] ${message}`);
    }

    // ========================================================================
    // Queue Drain & Shutdown (MT-010.8)
    // ========================================================================

    /**
     * Cancel a specific pending request
     * 
     * @param requestId - ID of the request to cancel
     * @returns true if the request was cancelled
     */
    cancel(requestId: string): boolean {
        // Check if it's the current request
        if (this.currentRequest?.id === requestId) {
            // Can't cancel a request that's already processing
            this.log('warn', `Cannot cancel request ${requestId}: already processing`);
            return false;
        }

        // Find in queue
        const index = this.queue.findIndex(r => r.id === requestId);
        if (index === -1) {
            return false;
        }

        const request = this.queue[index];
        
        // Clear timeout
        if (request.timeoutHandle) {
            clearTimeout(request.timeoutHandle);
        }

        // Remove from queue
        this.queue.splice(index, 1);
        this.stats.cancelled++;
        request.status = 'cancelled';

        this.emit('cancelled', { id: requestId });
        this.log('info', `Request ${requestId} cancelled`);

        request.reject(new Error('Request cancelled'));
        return true;
    }

    /**
     * Clear all pending requests (not the current one)
     */
    clearPending(): number {
        const count = this.queue.length;
        
        for (const request of this.queue) {
            if (request.timeoutHandle) {
                clearTimeout(request.timeoutHandle);
            }
            request.status = 'cancelled';
            request.reject(new Error('Queue cleared'));
        }

        this.stats.cancelled += count;
        this.queue = [];

        this.log('info', `Cleared ${count} pending requests`);
        return count;
    }

    /**
     * Gracefully shut down the queue (MT-010.8)
     * 
     * - Stops accepting new requests
     * - Waits for current request to complete
     * - Cancels all pending requests
     * - Returns states of cancelled requests for potential recovery
     * 
     * @param waitForCurrent - Wait for current request to complete (default: true)
     * @returns Array of cancelled request states for recovery
     */
    async shutdown(waitForCurrent = true): Promise<Array<{ id: string; prompt: string; context?: Record<string, unknown> }>> {
        this.isShuttingDown = true;
        this.log('info', 'Queue shutdown initiated');

        // Save pending request info for recovery
        const cancelled = this.queue.map(r => ({
            id: r.id,
            prompt: r.prompt,
            context: r.context
        }));

        // Cancel all pending
        this.clearPending();

        // Wait for current request if specified
        if (waitForCurrent && this.currentRequest) {
            this.log('info', 'Waiting for current request to complete...');
            await new Promise<void>(resolve => {
                const checkComplete = () => {
                    if (!this.currentRequest) {
                        resolve();
                    } else {
                        setTimeout(checkComplete, 100);
                    }
                };
                checkComplete();
            });
        }

        this.log('info', `Queue shutdown complete (${cancelled.length} requests saved for recovery)`);
        return cancelled;
    }

    /**
     * Reset shutdown state to allow new requests
     */
    resetShutdown(): void {
        this.isShuttingDown = false;
        this.log('info', 'Queue shutdown state reset');
    }

    /**
     * Reset all statistics
     */
    resetStats(): void {
        this.stats = {
            completed: 0,
            failed: 0,
            timeout: 0,
            cancelled: 0,
            totalWaitMs: 0,
            totalProcessingMs: 0
        };
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: LLMQueue | null = null;

/**
 * Get the singleton LLM queue instance
 */
export function getLLMQueueInstance(): LLMQueue {
    if (!instance) {
        instance = new LLMQueue();
    }
    return instance;
}

/**
 * Reset the queue instance (for testing)
 */
export function resetLLMQueueForTests(): void {
    if (instance) {
        instance.clearPending();
        instance.resetStats();
        instance.resetShutdown();
    }
    instance = null;
}

export default LLMQueue;
