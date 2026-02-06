/**
 * @file clarity/index.ts
 * @module ClarityAgent
 * @description Main Clarity Agent module - orchestrates scoring, triggers, and follow-ups
 * MT-011: Clarity Agent Implementation
 * 
 * **Simple explanation**: The Clarity Agent is like a quality control inspector.
 * It watches for answers in the ticket system, grades them, and asks follow-up
 * questions if they're not good enough. If after 5 tries the answer still isn't
 * good, it escalates to a human.
 */

import { EventEmitter } from 'events';
import { logInfo, logError } from '../../logger';

// Re-export all types and factories
export * from './scoring';
export * from './trigger';
export * from './followUp';

import { 
    ClarityScorer, 
    initializeClarityScorer, 
    getClarityScorerInstance, 
    resetClarityScorerForTests,
    type ScorerConfig,
    type ScoringResult 
} from './scoring';

import { 
    ClarityTrigger, 
    initializeClarityTrigger, 
    getClarityTriggerInstance, 
    resetClarityTriggerForTests,
    type TriggerConfig 
} from './trigger';

import { 
    FollowUpManager, 
    initializeFollowUpManager, 
    getFollowUpManagerInstance, 
    resetFollowUpManagerForTests,
    type FollowUpConfig 
} from './followUp';

// ============================================================================
// Combined Configuration
// ============================================================================

/**
 * Full Clarity Agent configuration
 */
export interface ClarityAgentConfig {
    scorer?: Partial<ScorerConfig>;
    trigger?: Partial<TriggerConfig>;
    followUp?: Partial<FollowUpConfig>;
}

// ============================================================================
// ClarityAgent Class
// ============================================================================

/**
 * Main Clarity Agent that orchestrates all components.
 * 
 * **Simple explanation**: The boss of the quality control team.
 * Coordinates the scorer, trigger, and follow-up generator to
 * ensure every answer in the ticket system meets quality standards.
 * 
 * @emits 'initialized' - When all components are ready
 * @emits 'review-cycle-complete' - When a full review cycle (score + follow-up) completes
 * @emits 'shutdown' - When agent is shutting down
 */
export class ClarityAgent extends EventEmitter {
    private scorer: ClarityScorer | null = null;
    private trigger: ClarityTrigger | null = null;
    private followUpManager: FollowUpManager | null = null;
    private isRunning: boolean = false;

    constructor() {
        super();
    }

    /**
     * Initialize the Clarity Agent with all components
     */
    async initialize(config: ClarityAgentConfig = {}): Promise<void> {
        try {
            // Initialize components
            this.scorer = initializeClarityScorer(config.scorer);
            this.trigger = initializeClarityTrigger(config.trigger);
            this.followUpManager = initializeFollowUpManager(config.followUp);

            // Wire up events
            this.setupEventHandlers();

            this.isRunning = true;
            this.emit('initialized');
            logInfo('[ClarityAgent] Initialized successfully');

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[ClarityAgent] Initialization failed: ${msg}`);
            throw error;
        }
    }

    /**
     * Setup event handlers to connect components
     */
    private setupEventHandlers(): void {
        if (!this.scorer || !this.trigger || !this.followUpManager) {
            return;
        }

        // When a review completes, check if follow-up needed
        this.trigger.on('review-completed', async ({ ticketId, result }) => {
            if (result.needsFollowUp) {
                // Get original question (would need to be passed through or looked up)
                // For now, we use empty question - caller should use full flow
                this.emit('follow-up-needed', { ticketId, score: result.scores.overall });
            } else {
                this.emit('review-cycle-complete', { ticketId, result, followUpNeeded: false });
            }
        });

        // When follow-up is generated, check if max reached
        this.followUpManager.on('max-iterations-reached', async ({ ticketId, count }) => {
            logInfo(`[ClarityAgent] Max iterations reached for ${ticketId}, escalating...`);
            // Escalation would need original question/reply - caller should handle
            this.emit('escalation-needed', { ticketId, iterationCount: count });
        });

        // Forward relevant events
        this.scorer.on('scored', (data) => this.emit('scored', data));
        this.scorer.on('threshold-failed', (data) => this.emit('threshold-failed', data));
        this.trigger.on('review-queued', (data) => this.emit('review-queued', data));
        this.followUpManager.on('escalated', (data) => this.emit('escalated', data));
    }

    /**
     * Start watching for ticket replies
     */
    start(): void {
        if (!this.trigger) {
            throw new Error('ClarityAgent not initialized');
        }
        this.trigger.subscribe();
        logInfo('[ClarityAgent] Started watching for ticket replies');
    }

    /**
     * Stop watching for ticket replies
     */
    stop(): void {
        if (this.trigger) {
            this.trigger.unsubscribe();
            this.trigger.cancelAll();
        }
        logInfo('[ClarityAgent] Stopped');
    }

    /**
     * Run a full review cycle for a specific reply
     */
    async reviewReply(
        ticketId: string,
        question: string,
        reply: string,
        context?: string
    ): Promise<{
        scored: ScoringResult;
        followUp: { questions: string[]; escalated: boolean } | null;
    }> {
        if (!this.scorer || !this.followUpManager) {
            throw new Error('ClarityAgent not initialized');
        }

        // Score the reply
        const scored = await this.scorer.scoreReply(ticketId, question, reply, context);

        // If needs follow-up, generate questions
        let followUp = null;
        if (scored.needsFollowUp) {
            const result = await this.followUpManager.generateFollowUp(
                ticketId,
                scored,
                question,
                reply
            );

            // If max reached, escalate
            if (result.maxReached) {
                await this.followUpManager.escalate(ticketId, question, reply);
                followUp = { questions: result.questions, escalated: true };
            } else {
                followUp = { questions: result.questions, escalated: false };
            }
        }

        this.emit('review-cycle-complete', { ticketId, scored, followUp });
        return { scored, followUp };
    }

    /**
     * Get the scorer instance
     */
    getScorer(): ClarityScorer | null {
        return this.scorer;
    }

    /**
     * Get the trigger instance
     */
    getTrigger(): ClarityTrigger | null {
        return this.trigger;
    }

    /**
     * Get the follow-up manager instance
     */
    getFollowUpManager(): FollowUpManager | null {
        return this.followUpManager;
    }

    /**
     * Check if agent is running
     */
    isActive(): boolean {
        return this.isRunning;
    }

    /**
     * Shutdown the agent
     */
    async shutdown(): Promise<void> {
        this.stop();
        this.isRunning = false;
        this.emit('shutdown');
        logInfo('[ClarityAgent] Shutdown complete');
    }
}

// ============================================================================
// Singleton Management
// ============================================================================

let agentInstance: ClarityAgent | null = null;

/**
 * Initialize the Clarity Agent singleton
 */
export async function initializeClarityAgent(config?: ClarityAgentConfig): Promise<ClarityAgent> {
    if (agentInstance !== null) {
        throw new Error('ClarityAgent already initialized');
    }
    agentInstance = new ClarityAgent();
    await agentInstance.initialize(config);
    return agentInstance;
}

/**
 * Get the Clarity Agent singleton
 */
export function getClarityAgentInstance(): ClarityAgent {
    if (!agentInstance) {
        throw new Error('ClarityAgent not initialized');
    }
    return agentInstance;
}

/**
 * Reset all Clarity Agent components for tests
 */
export function resetClarityAgentForTests(): void {
    if (agentInstance) {
        agentInstance.stop();
    }
    agentInstance = null;
    resetClarityScorerForTests();
    resetClarityTriggerForTests();
    resetFollowUpManagerForTests();
}
