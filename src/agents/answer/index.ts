/**
 * @file answer/index.ts
 * @module AnswerTeam
 * @description Main Answer Team module - orchestrates context extraction, confidence scoring, and timeout handling
 * MT-014: Answer Team Implementation
 * 
 * **Simple explanation**: The Answer Team is like a knowledgeable assistant.
 * When the Coding AI asks a question, we search relevant documents (plan, PRD),
 * generate an answer with context, score our confidence, and either return the
 * answer or escalate to a human if we're not sure enough.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../../logger';
import { completeLLM } from '../../services/llmService';
import { createTicket } from '../../services/ticketDb';
import { ANSWER_SYSTEM_PROMPT } from '../../services/orchestrator';

import { ConfidenceScorer, createConfidenceScorer, ConfidenceResult } from './confidence';
import { TimeoutHandler, createTimeoutHandler, TimeoutResult } from './timeout';
import { PlanContextExtractor, createPlanContextExtractor, PlanContextResult } from './planContext';
import { PRDContextExtractor, createPRDContextExtractor, PRDContextResult } from './prdContext';

// Re-export all types
export * from './confidence';
export * from './timeout';
export * from './planContext';
export * from './prdContext';

// ============================================================================
// Configuration
// ============================================================================

export interface AnswerTeamConfig {
    invokeFrom: 'coding_ai_only' | 'any';    // Who can invoke
    confidenceThreshold: number;              // Default: 95
    timeoutSeconds: number;                   // Default: 45
    maxContextTokens: number;                 // Default: 2000
    usePlanContext: boolean;                  // Default: true
    usePRDContext: boolean;                   // Default: true
    escalateOnLowConfidence: boolean;         // Default: true
    escalateOnTimeout: boolean;               // Default: true
}

const DEFAULT_CONFIG: AnswerTeamConfig = {
    invokeFrom: 'coding_ai_only',
    confidenceThreshold: 95,
    timeoutSeconds: 45,
    maxContextTokens: 2000,
    usePlanContext: true,
    usePRDContext: true,
    escalateOnLowConfidence: true,
    escalateOnTimeout: true
};

// ============================================================================
// Answer Result Type
// ============================================================================

export interface AnswerResult {
    answer: string;
    confidence: ConfidenceResult;
    contextUsed: {
        plan: boolean;
        prd: boolean;
        totalTokens: number;
    };
    timing: {
        totalMs: number;
        contextMs: number;
        llmMs: number;
        confidenceMs: number;
    };
    escalated: boolean;
    ticketId?: string;
}

// ============================================================================
// AnswerTeam Class
// ============================================================================

/**
 * Main Answer Team orchestrator
 * 
 * **Simple explanation**: The conductor of the answer-giving orchestra.
 * Coordinates context extraction, LLM calls, confidence scoring, and
 * escalation to ensure every question gets the best possible answer.
 * 
 * @emits 'question-received' - When a new question comes in
 * @emits 'context-extracted' - When context has been gathered
 * @emits 'answer-generated' - When LLM produces an answer
 * @emits 'confidence-scored' - When confidence scoring completes
 * @emits 'answer-complete' - When the full process finishes
 * @emits 'escalated' - When answer is escalated to human
 */
export class AnswerTeam extends EventEmitter {
    private config: AnswerTeamConfig;
    private confidenceScorer: ConfidenceScorer;
    private timeoutHandler: TimeoutHandler;
    private planExtractor: PlanContextExtractor;
    private prdExtractor: PRDContextExtractor;

    private requestCounter: number = 0;

    constructor(config?: Partial<AnswerTeamConfig>, workspacePath?: string) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };

        this.confidenceScorer = createConfidenceScorer({
            threshold: this.config.confidenceThreshold,
            escalateBelow: this.config.escalateOnLowConfidence
        });

        this.timeoutHandler = createTimeoutHandler({
            maxResponseSeconds: this.config.timeoutSeconds,
            createTicketOnTimeout: this.config.escalateOnTimeout
        });

        this.planExtractor = createPlanContextExtractor(workspacePath);
        this.prdExtractor = createPRDContextExtractor(workspacePath);
    }

    /**
     * Answer a question from the Coding AI
     * 
     * @param question The question to answer
     * @param caller Who is calling (for invoke_trigger enforcement)
     * @returns Answer result with confidence and timing info
     */
    async answer(question: string, caller: string = 'coding_ai'): Promise<AnswerResult> {
        const requestId = `answer-${++this.requestCounter}-${Date.now()}`;
        const startTime = Date.now();

        logInfo(`[AnswerTeam] Received question (${requestId}): ${question.substring(0, 50)}...`);
        this.emit('question-received', { requestId, question, caller });

        // Check invoke_trigger
        if (this.config.invokeFrom === 'coding_ai_only' && !this.isFromCodingAI(caller)) {
            logWarn(`[AnswerTeam] Rejected: caller "${caller}" not allowed (invokeFrom: coding_ai_only)`);
            return this.createRejectedResult(question, 'Caller not authorized');
        }

        // Execute with timeout
        const timeoutResult = await this.timeoutHandler.withTimeout(
            requestId,
            async (signal) => this.processQuestion(question, signal, startTime),
            question
        );

        if (timeoutResult.timedOut) {
            logWarn(`[AnswerTeam] Question timed out (${requestId})`);
            this.emit('escalated', { requestId, reason: 'timeout', ticketId: timeoutResult.ticketId });

            return {
                answer: this.timeoutHandler.getTimeoutMessage(),
                confidence: {
                    score: 0,
                    reasoning: 'Answer timed out',
                    needsEscalation: true,
                    factors: []
                },
                contextUsed: { plan: false, prd: false, totalTokens: 0 },
                timing: {
                    totalMs: timeoutResult.elapsedMs,
                    contextMs: 0,
                    llmMs: 0,
                    confidenceMs: 0
                },
                escalated: true,
                ticketId: timeoutResult.ticketId
            };
        }

        if (!timeoutResult.success || !timeoutResult.value) {
            return this.createRejectedResult(question, 'Processing failed');
        }

        return timeoutResult.value;
    }

    /**
     * Process a question (called within timeout handler)
     */
    private async processQuestion(
        question: string,
        signal: AbortSignal,
        startTime: number
    ): Promise<AnswerResult> {
        const contextStartTime = Date.now();

        // Extract context from plan and PRD
        const [planContext, prdContext] = await Promise.all([
            this.config.usePlanContext
                ? this.planExtractor.extractContext(question, this.config.maxContextTokens / 2)
                : Promise.resolve({ sections: [], tokenEstimate: 0, planFound: false } as PlanContextResult),
            this.config.usePRDContext
                ? this.prdExtractor.extractContext(question, this.config.maxContextTokens / 2)
                : Promise.resolve({ sections: [], tokenEstimate: 0, prdFound: false } as PRDContextResult)
        ]);

        if (signal.aborted) throw new Error('Aborted');

        const contextMs = Date.now() - contextStartTime;
        this.emit('context-extracted', { planContext, prdContext });

        // Build context string
        const contextString = this.buildContextString(planContext, prdContext);
        const totalContextTokens = planContext.tokenEstimate + prdContext.tokenEstimate;

        logInfo(`[AnswerTeam] Context: ${totalContextTokens} tokens (plan: ${planContext.sections.length}, prd: ${prdContext.sections.length})`);

        // Generate answer with LLM
        const llmStartTime = Date.now();
        const enhancedPrompt = contextString
            ? `Context:\n${contextString}\n\nQuestion: ${question}`
            : question;

        const response = await completeLLM(enhancedPrompt, {
            systemPrompt: ANSWER_SYSTEM_PROMPT
        });

        if (signal.aborted) throw new Error('Aborted');

        const answer = response.content;
        const llmMs = Date.now() - llmStartTime;
        this.emit('answer-generated', { answer });

        // Score confidence
        const confidenceStartTime = Date.now();
        const confidence = await this.confidenceScorer.scoreConfidence(
            question,
            answer,
            contextString ? 'Plan and PRD context available' : 'Minimal context'
        );
        const confidenceMs = Date.now() - confidenceStartTime;
        this.emit('confidence-scored', { confidence });

        // Check if escalation needed
        let escalated = false;
        let ticketId: string | undefined;

        if (confidence.needsEscalation && this.config.escalateOnLowConfidence) {
            ticketId = await this.confidenceScorer.escalate(question, answer, confidence);
            escalated = true;
            this.emit('escalated', { reason: 'low_confidence', confidence, ticketId });
        }

        const totalMs = Date.now() - startTime;
        const result: AnswerResult = {
            answer,
            confidence,
            contextUsed: {
                plan: planContext.sections.length > 0,
                prd: prdContext.sections.length > 0,
                totalTokens: totalContextTokens
            },
            timing: {
                totalMs,
                contextMs,
                llmMs,
                confidenceMs
            },
            escalated,
            ticketId
        };

        this.emit('answer-complete', result);
        logInfo(`[AnswerTeam] Answer complete: ${confidence.score}% confidence, ${totalMs}ms total`);

        return result;
    }

    /**
     * Build context string from extracted sections
     */
    private buildContextString(planContext: PlanContextResult, prdContext: PRDContextResult): string {
        const parts: string[] = [];

        if (planContext.sections.length > 0) {
            const planSections = planContext.sections
                .map(s => s.content)
                .join('\n\n');
            parts.push(`## Plan Context\n${planSections}`);
        }

        if (prdContext.sections.length > 0) {
            const prdSections = prdContext.sections
                .map(s => {
                    const heading = s.heading ? `### ${s.heading}\n` : '';
                    return `${heading}${s.content}`;
                })
                .join('\n\n');
            parts.push(`## PRD Context\n${prdSections}`);
        }

        return parts.join('\n\n---\n\n');
    }

    /**
     * Check if caller is from Coding AI
     */
    private isFromCodingAI(caller: string): boolean {
        const codingAICallers = ['coding_ai', 'copilot', 'coe', 'orchestrator'];
        return codingAICallers.includes(caller.toLowerCase());
    }

    /**
     * Create a rejected result
     */
    private createRejectedResult(question: string, reason: string): AnswerResult {
        return {
            answer: `Unable to answer: ${reason}`,
            confidence: {
                score: 0,
                reasoning: reason,
                needsEscalation: false,
                factors: []
            },
            contextUsed: { plan: false, prd: false, totalTokens: 0 },
            timing: { totalMs: 0, contextMs: 0, llmMs: 0, confidenceMs: 0 },
            escalated: false
        };
    }

    /**
     * Get current configuration
     */
    getConfig(): AnswerTeamConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<AnswerTeamConfig>): void {
        this.config = { ...this.config, ...updates };

        if (updates.confidenceThreshold !== undefined) {
            this.confidenceScorer.setThreshold(updates.confidenceThreshold);
        }

        if (updates.timeoutSeconds !== undefined) {
            this.timeoutHandler.setTimeoutSeconds(updates.timeoutSeconds);
        }
    }

    /**
     * Cancel all active requests
     */
    cancelAll(): void {
        this.timeoutHandler.cancelAll();
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: AnswerTeam | null = null;

/**
 * Initialize the Answer Team singleton
 */
export function initializeAnswerTeam(
    config?: Partial<AnswerTeamConfig>,
    workspacePath?: string
): AnswerTeam {
    if (instance) {
        throw new Error('AnswerTeam already initialized');
    }
    instance = new AnswerTeam(config, workspacePath);
    logInfo('[AnswerTeam] Initialized');
    return instance;
}

/**
 * Get the Answer Team singleton instance
 */
export function getAnswerTeamInstance(): AnswerTeam {
    if (!instance) {
        throw new Error('AnswerTeam not initialized');
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetAnswerTeamForTests(): void {
    if (instance) {
        instance.cancelAll();
    }
    instance = null;
}
