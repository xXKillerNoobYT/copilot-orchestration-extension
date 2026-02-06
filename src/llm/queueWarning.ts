/**
 * @file llm/queueWarning.ts
 * @module QueueWarning
 * @description Full queue warning ticket creation (MT-010.5)
 * 
 * Creates warning tickets when the LLM queue stays full for too long.
 * Throttled to prevent spam - max one warning per hour.
 * 
 * **Simple explanation**: Like a warning light that comes on when a machine
 * is overloaded - it creates a ticket to let you know the LLM queue is backed up,
 * but doesn't spam you with repeated warnings.
 */

import { logInfo, logWarn } from '../logger';
import { createTicket } from '../services/ticketDb';
import { getLLMQueueInstance, LLMQueue } from './queue';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Warning tracker state
 */
interface WarningState {
    /** When the queue first became full */
    fullSince: number | null;
    /** When the last warning ticket was created */
    lastWarningAt: number | null;
    /** Number of warnings issued */
    warningCount: number;
    /** Timeout handle for checking full duration */
    timeoutHandle: ReturnType<typeof setTimeout> | null;
}

/**
 * Configuration for queue warnings
 */
export interface QueueWarningConfig {
    /** Time queue must be full before warning (ms) */
    fullDurationThreshold: number;
    /** Minimum time between warnings (ms) */
    warningCooldownMs: number;
    /** Whether warnings are enabled */
    enabled: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_WARNING_CONFIG: QueueWarningConfig = {
    fullDurationThreshold: 60 * 1000, // 60 seconds
    warningCooldownMs: 60 * 60 * 1000, // 1 hour
    enabled: true
};

// ============================================================================
// QueueWarningManager Class
// ============================================================================

/**
 * Manages queue full warning tickets.
 * 
 * **Simple explanation**: A watchdog that monitors the LLM queue and creates
 * a help ticket if things get backed up for too long. Like an alert system
 * that says "Hey, we might need more capacity here!"
 */
export class QueueWarningManager {
    private config: QueueWarningConfig;
    private state: WarningState;
    private queue: LLMQueue | null = null;

    constructor(config: Partial<QueueWarningConfig> = {}) {
        this.config = { ...DEFAULT_WARNING_CONFIG, ...config };
        this.state = {
            fullSince: null,
            lastWarningAt: null,
            warningCount: 0,
            timeoutHandle: null
        };
    }

    /**
     * Attach to a queue instance and start monitoring
     */
    attach(queue: LLMQueue): void {
        this.queue = queue;

        // Listen for queue events
        queue.on('full', () => this.onQueueFull());
        queue.on('dequeue', () => this.onQueueNotFull());
        queue.on('drain', () => this.onQueueNotFull());

        logInfo('QueueWarningManager attached to LLM queue');
    }

    /**
     * Handle queue becoming full
     */
    private onQueueFull(): void {
        if (!this.config.enabled) {
            return;
        }

        // If already tracking, ignore
        if (this.state.fullSince !== null) {
            return;
        }

        this.state.fullSince = Date.now();
        logInfo('Queue full, starting duration tracking');

        // Set timer for warning threshold
        this.state.timeoutHandle = setTimeout(() => {
            this.checkAndWarn();
        }, this.config.fullDurationThreshold);
    }

    /**
     * Handle queue no longer being full
     */
    private onQueueNotFull(): void {
        if (this.state.timeoutHandle) {
            clearTimeout(this.state.timeoutHandle);
            this.state.timeoutHandle = null;
        }

        if (this.state.fullSince !== null) {
            const duration = Date.now() - this.state.fullSince;
            logInfo(`Queue no longer full (was full for ${duration}ms)`);
        }

        this.state.fullSince = null;
    }

    /**
     * Check if we should issue a warning and do so if appropriate
     */
    private async checkAndWarn(): Promise<void> {
        // Verify queue is still full
        if (this.queue && !this.queue.isFull()) {
            this.state.fullSince = null;
            return;
        }

        // Check cooldown
        if (this.state.lastWarningAt !== null) {
            const timeSinceLastWarning = Date.now() - this.state.lastWarningAt;
            if (timeSinceLastWarning < this.config.warningCooldownMs) {
                logInfo(`Queue still full, but in warning cooldown (${Math.round((this.config.warningCooldownMs - timeSinceLastWarning) / 1000)}s remaining)`);
                return;
            }
        }

        // Issue warning
        await this.createWarningTicket();
    }

    /**
     * Create a warning ticket for full queue
     */
    private async createWarningTicket(): Promise<void> {
        const fullDuration = this.state.fullSince ? Date.now() - this.state.fullSince : 0;
        const stats = this.queue?.getStats();

        this.state.warningCount++;
        this.state.lastWarningAt = Date.now();

        const ticketData = {
            title: '⚠️ LLM Queue Full for Extended Period',
            description: [
                `The LLM request queue has been at maximum capacity for ${Math.round(fullDuration / 1000)} seconds.`,
                '',
                '**Queue Statistics:**',
                `- Pending requests: ${stats?.pending ?? 'unknown'}`,
                `- Currently processing: ${stats?.processing ?? 'unknown'}`,
                `- Average wait time: ${stats?.averageWaitMs ? Math.round(stats.averageWaitMs) + 'ms' : 'unknown'}`,
                '',
                '**Possible Actions:**',
                '- Check if LM Studio is running and responsive',
                '- Consider increasing maxConcurrentRequests in config',
                '- Review if requests are timing out (check timeoutSeconds)',
                '- Check for slow or stuck requests',
                '',
                `This is warning #${this.state.warningCount} this session.`
            ].join('\n'),
            type: 'ai_to_human' as const,
            priority: 2,
            creator: 'LLMQueueWarning',
            status: 'open' as const,
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };

        try {
            await createTicket(ticketData);
            logWarn(`Queue warning ticket created (full for ${Math.round(fullDuration / 1000)}s, warning #${this.state.warningCount})`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logWarn(`Failed to create queue warning ticket: ${msg}`);
        }
    }

    /**
     * Get current warning state
     */
    getState(): Readonly<WarningState> {
        return { ...this.state };
    }

    /**
     * Reset warning state (for testing)
     */
    reset(): void {
        if (this.state.timeoutHandle) {
            clearTimeout(this.state.timeoutHandle);
        }
        this.state = {
            fullSince: null,
            lastWarningAt: null,
            warningCount: 0,
            timeoutHandle: null
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<QueueWarningConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Enable or disable warnings
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        if (!enabled) {
            this.reset();
        }
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: QueueWarningManager | null = null;

/**
 * Get the singleton warning manager instance
 */
export function getQueueWarningManager(): QueueWarningManager {
    if (!instance) {
        instance = new QueueWarningManager();
        // Auto-attach to default queue
        try {
            instance.attach(getLLMQueueInstance());
        } catch {
            // Queue not initialized yet, will need manual attachment
        }
    }
    return instance;
}

/**
 * Reset the warning manager (for testing)
 */
export function resetQueueWarningForTests(): void {
    if (instance) {
        instance.reset();
    }
    instance = null;
}

export default QueueWarningManager;
