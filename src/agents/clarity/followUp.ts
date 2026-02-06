/**
 * @file clarity/followUp.ts
 * @module ClarityFollowUp
 * @description Generates follow-up questions for low-scoring replies
 * MT-011.8: Auto-reply generation
 * MT-011.9: Iteration limit
 * MT-011.10: Boss/user escalation
 * MT-011.12: Ticket thread integration
 * 
 * **Simple explanation**: Like a teacher asking follow-up questions when a
 * student's answer isn't complete. Keeps asking until satisfied or gives up
 * and asks the principal (boss) for help.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../../logger';
import { completeLLM } from '../../services/llmService';
import { getTicket, updateTicket } from '../../services/ticketDb';
import { type ScoringResult } from './scoring';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Follow-up configuration
 */
export interface FollowUpConfig {
    /** Maximum iterations before escalation */
    maxIterations: number;
    /** Maximum follow-up questions per iteration */
    maxQuestions: number;
    /** Whether to auto-post to ticket thread */
    autoPost: boolean;
}

/**
 * Follow-up result
 */
export interface FollowUpResult {
    /** Generated questions */
    questions: string[];
    /** Current iteration number */
    iteration: number;
    /** Whether max iterations reached */
    maxReached: boolean;
    /** Issues that prompted follow-up */
    issues: string[];
}

/**
 * Escalation result
 */
export interface EscalationResult {
    /** Whether escalation occurred */
    escalated: boolean;
    /** Reason for escalation */
    reason: string;
    /** Iteration count when escalated */
    iterationCount: number;
    /** Summary of issues */
    issueSummary: string;
}

/**
 * Iteration tracking for a ticket
 */
interface IterationTracker {
    ticketId: string;
    count: number;
    history: Array<{ score: number; questions: string[]; timestamp: number }>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: FollowUpConfig = {
    maxIterations: 5,
    maxQuestions: 3,
    autoPost: true
};

// ============================================================================
// Prompt Templates
// ============================================================================

const FOLLOW_UP_PROMPT = `You are a Clarity Agent generating follow-up questions for an incomplete or unclear reply.

Original question:
{{question}}

Reply being reviewed:
{{reply}}

Issues identified:
{{issues}}

Task: Generate 1-3 specific, targeted follow-up questions that will help get a more complete and clear answer.

Guidelines:
- Questions should directly address the identified issues
- Be specific, not generic
- Focus on what's missing or unclear
- Keep questions concise

Return ONLY valid JSON:
{"questions": ["<question 1>", "<question 2>", ...]}`;

const ESCALATION_SUMMARY_PROMPT = `Summarize the clarification history for escalation to a supervisor.

Original question: {{question}}
Initial reply: {{initialReply}}

Clarification attempts:
{{history}}

Create a brief summary of:
1. What was asked
2. What clarifications were attempted
3. Why the issue remains unresolved

Keep it under 200 words.`;

// ============================================================================
// FollowUpManager Class
// ============================================================================

/**
 * Manages follow-up question generation and escalation for Clarity Agent.
 * 
 * **Simple explanation**: Keeps asking clarifying questions when answers
 * aren't good enough. After 5 tries, gives up and escalates to a human.
 * 
 * @emits 'follow-up-generated' - When questions are generated
 * @emits 'iteration-complete' - When an iteration completes
 * @emits 'max-iterations-reached' - When limit is hit
 * @emits 'escalated' - When escalated to user/boss
 */
export class FollowUpManager extends EventEmitter {
    private config: FollowUpConfig;
    private iterationTrackers: Map<string, IterationTracker>;

    constructor(config: Partial<FollowUpConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.iterationTrackers = new Map();
        logInfo(`[FollowUpManager] Initialized (maxIterations=${this.config.maxIterations})`);
    }

    // ========================================================================
    // Follow-up Generation (MT-011.8)
    // ========================================================================

    /**
     * Generate follow-up questions for a low-scoring reply
     * 
     * @param ticketId - Ticket being reviewed
     * @param scoringResult - The scoring result that triggered follow-up
     * @param question - Original question
     * @param reply - The reply being reviewed
     * @returns Follow-up result with questions and iteration info
     */
    async generateFollowUp(
        ticketId: string,
        scoringResult: ScoringResult,
        question: string,
        reply: string
    ): Promise<FollowUpResult> {
        // Get or create iteration tracker
        let tracker = this.iterationTrackers.get(ticketId);
        if (!tracker) {
            tracker = {
                ticketId,
                count: 0,
                history: []
            };
            this.iterationTrackers.set(ticketId, tracker);
        }

        // Check iteration limit (MT-011.9)
        if (tracker.count >= this.config.maxIterations) {
            this.emit('max-iterations-reached', { ticketId, count: tracker.count });
            return {
                questions: [],
                iteration: tracker.count,
                maxReached: true,
                issues: this.collectIssues(scoringResult)
            };
        }

        // Increment iteration
        tracker.count++;

        // Collect all issues from the scoring result
        const issues = this.collectIssues(scoringResult);
        const issuesText = issues.length > 0 ? issues.join('\n- ') : 'General clarity issues';

        try {
            // Generate follow-up questions
            const prompt = FOLLOW_UP_PROMPT
                .replace('{{question}}', question)
                .replace('{{reply}}', reply)
                .replace('{{issues}}', `- ${issuesText}`);

            const response = await completeLLM(prompt, {
                temperature: 0.3
            });

            const questions = this.parseFollowUpResponse(response.content);

            // Limit to maxQuestions
            const limitedQuestions = questions.slice(0, this.config.maxQuestions);

            // Record in history
            tracker.history.push({
                score: scoringResult.scores.overall,
                questions: limitedQuestions,
                timestamp: Date.now()
            });

            const result: FollowUpResult = {
                questions: limitedQuestions,
                iteration: tracker.count,
                maxReached: tracker.count >= this.config.maxIterations,
                issues
            };

            this.emit('follow-up-generated', { ticketId, result });
            this.emit('iteration-complete', { ticketId, iteration: tracker.count });

            logInfo(`[FollowUpManager] Generated ${limitedQuestions.length} follow-up questions for ${ticketId} (iteration ${tracker.count})`);

            // Auto-post to ticket if enabled (MT-011.12)
            if (this.config.autoPost && limitedQuestions.length > 0) {
                await this.postToTicket(ticketId, limitedQuestions, scoringResult.scores.overall);
            }

            return result;

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[FollowUpManager] Failed to generate follow-up for ${ticketId}: ${msg}`);
            throw error;
        }
    }

    /**
     * Parse follow-up questions from LLM response
     */
    private parseFollowUpResponse(content: string): string[] {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed.questions)) {
                throw new Error('No questions array');
            }

            return parsed.questions.map(String).filter((q: string) => q.length > 0);
        } catch {
            logWarn('[FollowUpManager] Failed to parse follow-up response');
            return [];
        }
    }

    /**
     * Collect issues from scoring result
     */
    private collectIssues(result: ScoringResult): string[] {
        const issues: string[] = [];

        if (result.assessments.completeness.issues.length > 0) {
            issues.push(...result.assessments.completeness.issues.map(i => `Missing: ${i}`));
        }
        if (result.assessments.clarity.issues.length > 0) {
            issues.push(...result.assessments.clarity.issues.map(i => `Unclear: ${i}`));
        }
        if (result.assessments.accuracy.issues.length > 0) {
            issues.push(...result.assessments.accuracy.issues.map(i => `Accuracy: ${i}`));
        }

        return issues;
    }

    // ========================================================================
    // Ticket Thread Integration (MT-011.12)
    // ========================================================================

    /**
     * Post follow-up questions to ticket thread
     */
    async postToTicket(ticketId: string, questions: string[], score: number): Promise<void> {
        try {
            const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
            const content = `**Clarity Agent Review** (Score: ${score}/100)\n\nPlease clarify the following:\n${questionList}`;

            // Get existing ticket and add to thread
            const ticket = await getTicket(ticketId);
            if (ticket) {
                const thread = ticket.thread || [];
                thread.push({
                    role: 'system',
                    content: content,
                    createdAt: new Date().toISOString(),
                    status: 'reviewing'
                });
                await updateTicket(ticketId, { thread });
                logInfo(`[FollowUpManager] Posted follow-up to ticket ${ticketId}`);
            } else {
                logWarn(`[FollowUpManager] Ticket ${ticketId} not found`);
            }

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[FollowUpManager] Failed to post to ticket ${ticketId}: ${msg}`);
        }
    }

    // ========================================================================
    // Escalation (MT-011.10)
    // ========================================================================

    /**
     * Escalate ticket to user/boss after max iterations
     */
    async escalate(
        ticketId: string,
        originalQuestion: string,
        initialReply: string
    ): Promise<EscalationResult> {
        const tracker = this.iterationTrackers.get(ticketId);
        if (!tracker) {
            return {
                escalated: false,
                reason: 'No iteration history found',
                iterationCount: 0,
                issueSummary: ''
            };
        }

        logInfo(`[FollowUpManager] Escalating ticket ${ticketId} after ${tracker.count} iterations`);

        try {
            // Generate escalation summary
            const historyText = tracker.history.map((h, i) =>
                `Iteration ${i + 1} (Score: ${h.score}):\n  Questions: ${h.questions.join('; ')}`
            ).join('\n\n');

            const summaryPrompt = ESCALATION_SUMMARY_PROMPT
                .replace('{{question}}', originalQuestion)
                .replace('{{initialReply}}', initialReply)
                .replace('{{history}}', historyText);

            const response = await completeLLM(summaryPrompt);
            const summary = response.content;

            // Post escalation notice to ticket
            if (this.config.autoPost) {
                const escalationMessage = `**⚠️ Escalated to User**\n\nAfter ${tracker.count} clarification attempts, this issue requires human attention.\n\n**Summary:**\n${summary}`;

                // Add to ticket thread
                const ticket = await getTicket(ticketId);
                if (ticket) {
                    const thread = ticket.thread || [];
                    thread.push({
                        role: 'system',
                        content: escalationMessage,
                        createdAt: new Date().toISOString(),
                        status: 'blocked'
                    });
                    await updateTicket(ticketId, { thread });
                }
            }

            // Update ticket status/priority
            try {
                await updateTicket(ticketId, {
                    status: 'blocked',
                    priority: 1 // Boost to P1
                });
            } catch {
                // Ticket update is best-effort
            }

            const result: EscalationResult = {
                escalated: true,
                reason: `Max iterations (${this.config.maxIterations}) reached`,
                iterationCount: tracker.count,
                issueSummary: summary
            };

            this.emit('escalated', { ticketId, result });
            logInfo(`[FollowUpManager] Ticket ${ticketId} escalated successfully`);

            return result;

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[FollowUpManager] Escalation failed for ${ticketId}: ${msg}`);

            return {
                escalated: false,
                reason: `Escalation failed: ${msg}`,
                iterationCount: tracker.count,
                issueSummary: ''
            };
        }
    }

    // ========================================================================
    // Iteration Tracking (MT-011.9)
    // ========================================================================

    /**
     * Get iteration count for a ticket
     */
    getIterationCount(ticketId: string): number {
        return this.iterationTrackers.get(ticketId)?.count || 0;
    }

    /**
     * Get full iteration history for a ticket
     */
    getHistory(ticketId: string): IterationTracker | undefined {
        return this.iterationTrackers.get(ticketId);
    }

    /**
     * Reset iteration count for a ticket
     */
    resetIterations(ticketId: string): void {
        this.iterationTrackers.delete(ticketId);
        logInfo(`[FollowUpManager] Reset iterations for ${ticketId}`);
    }

    /**
     * Check if ticket has reached max iterations
     */
    hasReachedMax(ticketId: string): boolean {
        const count = this.getIterationCount(ticketId);
        return count >= this.config.maxIterations;
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    /**
     * Update max iterations
     */
    setMaxIterations(max: number): void {
        if (max < 1) {
            throw new Error('Max iterations must be at least 1');
        }
        this.config.maxIterations = max;
        logInfo(`[FollowUpManager] Max iterations updated to ${max}`);
    }

    /**
     * Update max questions
     */
    setMaxQuestions(max: number): void {
        if (max < 1) {
            throw new Error('Max questions must be at least 1');
        }
        this.config.maxQuestions = max;
        logInfo(`[FollowUpManager] Max questions updated to ${max}`);
    }

    /**
     * Enable/disable auto-posting
     */
    setAutoPost(enabled: boolean): void {
        this.config.autoPost = enabled;
        logInfo(`[FollowUpManager] Auto-post ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get configuration
     */
    getConfig(): FollowUpConfig {
        return { ...this.config };
    }
}

// ============================================================================
// Singleton Management
// ============================================================================

let instance: FollowUpManager | null = null;

export function initializeFollowUpManager(config?: Partial<FollowUpConfig>): FollowUpManager {
    if (instance !== null) {
        throw new Error('FollowUpManager already initialized');
    }
    instance = new FollowUpManager(config);
    return instance;
}

export function getFollowUpManagerInstance(): FollowUpManager {
    if (!instance) {
        throw new Error('FollowUpManager not initialized');
    }
    return instance;
}

export function resetFollowUpManagerForTests(): void {
    instance = null;
}
