/**
 * @file clarity/trigger.ts
 * @module ClarityTrigger
 * @description Watches for ticket replies and triggers Clarity Agent review
 * MT-011.2: Implements ticket reply review trigger
 * MT-011.11: Adds P1 priority boost
 * 
 * **Simple explanation**: Like a hall monitor watching for new homework being
 * turned in. When a student submits work, it alerts the teacher to grade it.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../../logger';
import { onTicketChange } from '../../services/ticketDb';
import { getClarityScorerInstance, type ScoringResult } from './scoring';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Trigger configuration
 */
export interface TriggerConfig {
    /** Delay after reply before starting review (ms) */
    reviewDelayMs: number;
    /** Minimum reply length to trigger review (characters) */
    minReplyLength: number;
    /** Whether trigger is enabled */
    enabled: boolean;
}

/**
 * Queued review item
 */
interface QueuedReview {
    ticketId: string;
    replyContent: string;
    originalQuestion: string;
    context?: string;
    priority: 1 | 2 | 3;
    enqueuedAt: number;
    timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: TriggerConfig = {
    reviewDelayMs: 5000, // 5 seconds
    minReplyLength: 10,
    enabled: true
};

// ============================================================================
// ClarityTrigger Class
// ============================================================================

/**
 * Monitors ticket database for new replies and triggers Clarity Agent review.
 * 
 * **Simple explanation**: Watches the ticket system like a security camera.
 * When someone adds a reply, it schedules the Clarity Agent to review it.
 * High priority tickets (P1) get reviewed first.
 * 
 * @emits 'review-queued' - When a review is added to the queue
 * @emits 'review-started' - When a review begins processing
 * @emits 'review-completed' - When a review finishes with results
 * @emits 'review-skipped' - When a reply is too short or disabled
 */
export class ClarityTrigger extends EventEmitter {
    private config: TriggerConfig;
    private reviewQueue: QueuedReview[] = [];
    private isProcessing: boolean = false;
    private isSubscribed: boolean = false;

    constructor(config: Partial<TriggerConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        logInfo(`[ClarityTrigger] Initialized (delay=${this.config.reviewDelayMs}ms)`);
    }

    // ========================================================================
    // Subscription Management (MT-011.2)
    // ========================================================================

    /**
     * Start watching for ticket replies
     * NOTE: Full integration requires ticketDb to emit 'replyAdded' events.
     * For now, this sets up the trigger to be ready for manual queueReview calls.
     */
    subscribe(): void {
        if (this.isSubscribed) {
            logWarn('[ClarityTrigger] Already subscribed to ticket changes');
            return;
        }

        // Register for ticket changes (will need to be extended when ticketDb has reply events)
        try {
            onTicketChange(() => {
                // Ticket changed - could poll for replies here
                // For now, just log that we're watching
            });

            this.isSubscribed = true;
            logInfo('[ClarityTrigger] Subscribed to ticket change events');

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[ClarityTrigger] Failed to subscribe: ${msg}`);
        }
    }

    /**
     * Stop watching for ticket replies
     */
    unsubscribe(): void {
        if (!this.isSubscribed) {
            return;
        }

        // Note: onTicketChange doesn't support unsubscription currently
        // We just mark as unsubscribed to prevent new reviews
        this.isSubscribed = false;
        logInfo('[ClarityTrigger] Unsubscribed from ticket events');
    }

    /**
     * Handle reply added event (for future use when ticketDb emits these)
     */
    handleReplyAdded(event: { ticketId: string; reply: { content: string; author: string } }): void {
        if (!this.config.enabled) {
            this.emit('review-skipped', { ticketId: event.ticketId, reason: 'disabled' });
            return;
        }

        const { ticketId, reply } = event;

        // Skip agent replies (we only review human/user replies)
        if (reply.author.toLowerCase().includes('agent')) {
            this.emit('review-skipped', { ticketId, reason: 'agent-reply' });
            return;
        }

        // Check minimum length
        if (reply.content.length < this.config.minReplyLength) {
            this.emit('review-skipped', { ticketId, reason: 'too-short' });
            logInfo(`[ClarityTrigger] Skipping review of ${ticketId}: reply too short`);
            return;
        }

        // Queue the review with delay
        this.queueReview(ticketId, reply.content);
    }

    // ========================================================================
    // Review Queue Management
    // ========================================================================

    /**
     * Queue a reply for review after the configured delay
     */
    queueReview(
        ticketId: string,
        replyContent: string,
        options: {
            originalQuestion?: string;
            context?: string;
            priority?: 1 | 2 | 3;
        } = {}
    ): void {
        const { originalQuestion = '', context, priority = 1 } = options; // P1 by default (MT-011.11)

        // Check if already queued
        const existingIndex = this.reviewQueue.findIndex(r => r.ticketId === ticketId);
        if (existingIndex >= 0) {
            // Cancel existing and re-queue
            const existing = this.reviewQueue[existingIndex];
            if (existing.timeoutHandle) {
                clearTimeout(existing.timeoutHandle);
            }
            this.reviewQueue.splice(existingIndex, 1);
        }

        const review: QueuedReview = {
            ticketId,
            replyContent,
            originalQuestion,
            context,
            priority,
            enqueuedAt: Date.now()
        };

        // Set timeout to trigger review
        review.timeoutHandle = setTimeout(() => {
            this.startReview(ticketId);
        }, this.config.reviewDelayMs);

        // Insert by priority (P1 first, then P2, then P3)
        const insertIndex = this.reviewQueue.findIndex(r => r.priority > priority);
        if (insertIndex === -1) {
            this.reviewQueue.push(review);
        } else {
            this.reviewQueue.splice(insertIndex, 0, review);
        }

        this.emit('review-queued', { ticketId, priority, delayMs: this.config.reviewDelayMs });
        logInfo(`[ClarityTrigger] Queued review for ${ticketId} (P${priority}, delay=${this.config.reviewDelayMs}ms)`);
    }

    /**
     * Start reviewing a specific ticket
     */
    private async startReview(ticketId: string): Promise<void> {
        const index = this.reviewQueue.findIndex(r => r.ticketId === ticketId);
        if (index < 0) {
            return;
        }

        const review = this.reviewQueue.splice(index, 1)[0];
        this.emit('review-started', { ticketId });
        logInfo(`[ClarityTrigger] Starting review for ticket ${ticketId}`);

        try {
            const scorer = getClarityScorerInstance();
            const result = await scorer.scoreReply(
                ticketId,
                review.originalQuestion,
                review.replyContent,
                review.context
            );

            this.emit('review-completed', { ticketId, result });
            logInfo(`[ClarityTrigger] Review completed for ${ticketId}: ${result.scores.overall}/100`);

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[ClarityTrigger] Review failed for ${ticketId}: ${msg}`);
            this.emit('review-error', { ticketId, error: msg });
        }
    }

    // ========================================================================
    // Priority Boost (MT-011.11)
    // ========================================================================

    /**
     * Boost a queued review to P1 priority
     */
    boostPriority(ticketId: string): boolean {
        const review = this.reviewQueue.find(r => r.ticketId === ticketId);
        if (!review || review.priority === 1) {
            return false;
        }

        // Remove and re-insert at P1
        const index = this.reviewQueue.indexOf(review);
        this.reviewQueue.splice(index, 1);
        review.priority = 1;

        // Find new position (after existing P1s)
        const insertIndex = this.reviewQueue.findIndex(r => r.priority > 1);
        if (insertIndex === -1) {
            this.reviewQueue.push(review);
        } else {
            this.reviewQueue.splice(insertIndex, 0, review);
        }

        logInfo(`[ClarityTrigger] Boosted ${ticketId} to P1 priority`);
        return true;
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    /**
     * Enable or disable the trigger
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        logInfo(`[ClarityTrigger] ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Update review delay
     */
    setReviewDelay(delayMs: number): void {
        if (delayMs < 0) {
            throw new Error('Delay must be non-negative');
        }
        this.config.reviewDelayMs = delayMs;
        logInfo(`[ClarityTrigger] Review delay updated to ${delayMs}ms`);
    }

    /**
     * Get current configuration
     */
    getConfig(): TriggerConfig {
        return { ...this.config };
    }

    // ========================================================================
    // Queue Status
    // ========================================================================

    /**
     * Get number of pending reviews
     */
    getPendingCount(): number {
        return this.reviewQueue.length;
    }

    /**
     * Get pending reviews
     */
    getPendingReviews(): Array<{ ticketId: string; priority: 1 | 2 | 3; enqueuedAt: number }> {
        return this.reviewQueue.map(r => ({
            ticketId: r.ticketId,
            priority: r.priority,
            enqueuedAt: r.enqueuedAt
        }));
    }

    /**
     * Cancel a pending review
     */
    cancelReview(ticketId: string): boolean {
        const index = this.reviewQueue.findIndex(r => r.ticketId === ticketId);
        if (index < 0) {
            return false;
        }

        const review = this.reviewQueue.splice(index, 1)[0];
        if (review.timeoutHandle) {
            clearTimeout(review.timeoutHandle);
        }

        logInfo(`[ClarityTrigger] Cancelled review for ${ticketId}`);
        return true;
    }

    /**
     * Cancel all pending reviews
     */
    cancelAll(): void {
        for (const review of this.reviewQueue) {
            if (review.timeoutHandle) {
                clearTimeout(review.timeoutHandle);
            }
        }
        this.reviewQueue = [];
        logInfo('[ClarityTrigger] All pending reviews cancelled');
    }

    /**
     * Check if subscribed
     */
    isActive(): boolean {
        return this.isSubscribed;
    }
}

// ============================================================================
// Singleton Management
// ============================================================================

let instance: ClarityTrigger | null = null;

export function initializeClarityTrigger(config?: Partial<TriggerConfig>): ClarityTrigger {
    if (instance !== null) {
        throw new Error('ClarityTrigger already initialized');
    }
    instance = new ClarityTrigger(config);
    return instance;
}

export function getClarityTriggerInstance(): ClarityTrigger {
    if (!instance) {
        throw new Error('ClarityTrigger not initialized');
    }
    return instance;
}

export function resetClarityTriggerForTests(): void {
    if (instance) {
        instance.cancelAll();
        instance.unsubscribe();
    }
    instance = null;
}
