/**
 * @file clarity/scoring.ts
 * @module ClarityScoring
 * @description Implements 0-100 clarity scoring algorithm for ticket replies
 * MT-011.3: Scoring algorithm
 * MT-011.4: Completeness assessment
 * MT-011.5: Clarity assessment
 * MT-011.6: Accuracy assessment
 * MT-011.7: Threshold detection
 * 
 * **Simple explanation**: Like a teacher grading homework - checks if the answer
 * is complete, clear, and correct. Gives a score from 0-100.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../../logger';
import { completeLLM } from '../../services/llmService';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Score breakdown for a reply
 */
export interface ScoreBreakdown {
    /** Overall score (0-100) - weighted average of dimensions */
    overall: number;
    /** Completeness score (0-100) - addresses all parts of question */
    completeness: number;
    /** Clarity score (0-100) - unambiguous and specific */
    clarity: number;
    /** Accuracy score (0-100) - aligns with project context */
    accuracy: number;
}

/**
 * Detailed assessment result
 */
export interface AssessmentResult {
    /** Score for this dimension */
    score: number;
    /** Reasoning for the score */
    reasoning: string;
    /** Specific issues found */
    issues: string[];
}

/**
 * Full scoring result
 */
export interface ScoringResult {
    /** Score breakdown */
    scores: ScoreBreakdown;
    /** Whether score is below threshold (needs follow-up) */
    needsFollowUp: boolean;
    /** Individual assessments */
    assessments: {
        completeness: AssessmentResult;
        clarity: AssessmentResult;
        accuracy: AssessmentResult;
    };
    /** Timestamp of scoring */
    scoredAt: number;
}

/**
 * Configuration for the scorer
 */
export interface ScorerConfig {
    /** Minimum acceptable score (default: 85) */
    threshold: number;
    /** Weights for each dimension */
    weights: {
        completeness: number;
        clarity: number;
        accuracy: number;
    };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ScorerConfig = {
    threshold: 85,
    weights: {
        completeness: 0.40,
        clarity: 0.35,
        accuracy: 0.25
    }
};

// ============================================================================
// Prompt Templates
// ============================================================================

const COMPLETENESS_PROMPT = `You are evaluating a reply for COMPLETENESS.

Original question:
{{question}}

Reply:
{{reply}}

Task: Score how completely the reply addresses the question (0-100).

Scoring guide:
- 0-30: Misses most key points, ignores parts of the question
- 31-60: Partially addresses question but misses important aspects
- 61-80: Addresses main points but lacks some details
- 81-100: Thoroughly addresses all aspects of the question

Return ONLY valid JSON:
{"score": <number 0-100>, "reasoning": "<brief explanation>", "missing": ["<missed point 1>", "<missed point 2>"]}`;

const CLARITY_PROMPT = `You are evaluating a reply for CLARITY.

Reply:
{{reply}}

Task: Score how clear and unambiguous the reply is (0-100).

Scoring guide:
- 0-30: Vague, ambiguous, confusing, or uses unclear language
- 31-60: Somewhat clear but needs clarification in places
- 61-80: Generally clear but could be more specific
- 81-100: Very clear, specific, and easy to understand

Return ONLY valid JSON:
{"score": <number 0-100>, "reasoning": "<brief explanation>", "vague_parts": ["<vague section 1>", "<vague section 2>"]}`;

const ACCURACY_PROMPT = `You are evaluating a reply for ACCURACY.

Project context:
{{context}}

Reply:
{{reply}}

Task: Score how accurately the reply aligns with the project context (0-100).

Scoring guide:
- 0-30: Contains inaccuracies or contradicts the context
- 31-60: Mostly accurate but has some discrepancies
- 61-80: Accurate but could be more aligned with context
- 81-100: Fully accurate and well-aligned with project context

If no context is provided, evaluate for general technical accuracy.

Return ONLY valid JSON:
{"score": <number 0-100>, "reasoning": "<brief explanation>", "discrepancies": ["<issue 1>", "<issue 2>"]}`;

// ============================================================================
// ClarityScorer Class
// ============================================================================

/**
 * Scores ticket replies for completeness, clarity, and accuracy.
 * 
 * **Simple explanation**: Acts like a quality inspector for answers.
 * Checks if the answer is:
 * - Complete (answers the whole question)
 * - Clear (easy to understand)
 * - Accurate (factually correct)
 * 
 * @emits 'scored' - When a reply is scored
 * @emits 'threshold-failed' - When score is below threshold
 */
export class ClarityScorer extends EventEmitter {
    private config: ScorerConfig;
    private scoringHistory: Map<string, ScoringResult[]>;

    constructor(config: Partial<ScorerConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.scoringHistory = new Map();

        // Validate weights sum to 1
        const weightSum = this.config.weights.completeness +
            this.config.weights.clarity +
            this.config.weights.accuracy;
        if (Math.abs(weightSum - 1.0) > 0.001) {
            logWarn(`[ClarityScorer] Weights sum to ${weightSum}, normalizing...`);
            this.config.weights.completeness /= weightSum;
            this.config.weights.clarity /= weightSum;
            this.config.weights.accuracy /= weightSum;
        }

        logInfo(`[ClarityScorer] Initialized (threshold=${this.config.threshold})`);
    }

    // ========================================================================
    // Main Scoring Method (MT-011.3)
    // ========================================================================

    /**
     * Score a reply for completeness, clarity, and accuracy.
     * 
     * @param ticketId - ID of the ticket being scored
     * @param question - Original question/request
     * @param reply - The reply to score
     * @param context - Optional project context for accuracy check
     * @returns Scoring result with breakdown and follow-up flag
     */
    async scoreReply(
        ticketId: string,
        question: string,
        reply: string,
        context?: string
    ): Promise<ScoringResult> {
        logInfo(`[ClarityScorer] Scoring reply for ticket ${ticketId}`);

        try {
            // Run all assessments in parallel
            const [completeness, clarity, accuracy] = await Promise.all([
                this.assessCompleteness(question, reply),
                this.assessClarity(reply),
                this.assessAccuracy(reply, context || '')
            ]);

            // Calculate weighted overall score
            const overall = Math.round(
                completeness.score * this.config.weights.completeness +
                clarity.score * this.config.weights.clarity +
                accuracy.score * this.config.weights.accuracy
            );

            const scores: ScoreBreakdown = {
                overall,
                completeness: completeness.score,
                clarity: clarity.score,
                accuracy: accuracy.score
            };

            const needsFollowUp = overall < this.config.threshold;

            const result: ScoringResult = {
                scores,
                needsFollowUp,
                assessments: {
                    completeness,
                    clarity,
                    accuracy
                },
                scoredAt: Date.now()
            };

            // Store in history
            const history = this.scoringHistory.get(ticketId) || [];
            history.push(result);
            this.scoringHistory.set(ticketId, history);

            // Emit events
            this.emit('scored', { ticketId, result });
            if (needsFollowUp) {
                this.emit('threshold-failed', { ticketId, score: overall, threshold: this.config.threshold });
                logWarn(`[ClarityScorer] Score ${overall} below threshold ${this.config.threshold} for ticket ${ticketId}`);
            }

            logInfo(`[ClarityScorer] Ticket ${ticketId} scored: ${overall}/100 (C:${completeness.score}/Cl:${clarity.score}/A:${accuracy.score})`);
            return result;

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[ClarityScorer] Scoring failed for ticket ${ticketId}: ${msg}`);
            throw error;
        }
    }

    // ========================================================================
    // Individual Assessments (MT-011.4, MT-011.5, MT-011.6)
    // ========================================================================

    /**
     * Assess reply completeness (MT-011.4)
     */
    private async assessCompleteness(question: string, reply: string): Promise<AssessmentResult> {
        const prompt = COMPLETENESS_PROMPT
            .replace('{{question}}', question)
            .replace('{{reply}}', reply);

        return this.runAssessment(prompt, 'completeness');
    }

    /**
     * Assess reply clarity (MT-011.5)
     */
    private async assessClarity(reply: string): Promise<AssessmentResult> {
        const prompt = CLARITY_PROMPT.replace('{{reply}}', reply);
        return this.runAssessment(prompt, 'clarity');
    }

    /**
     * Assess reply accuracy (MT-011.6)
     */
    private async assessAccuracy(reply: string, context: string): Promise<AssessmentResult> {
        const prompt = ACCURACY_PROMPT
            .replace('{{context}}', context || 'No specific context provided.')
            .replace('{{reply}}', reply);

        return this.runAssessment(prompt, 'accuracy');
    }

    /**
     * Run a single assessment prompt
     */
    private async runAssessment(prompt: string, dimension: string): Promise<AssessmentResult> {
        try {
            const response = await completeLLM(prompt, {
                temperature: 0.1 // Low temperature for consistent scoring
            });

            // Parse JSON response
            const parsed = this.parseAssessmentResponse(response.content, dimension);
            return parsed;

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[ClarityScorer] ${dimension} assessment failed: ${msg}`);
            // Return a conservative middle score on error
            return {
                score: 50,
                reasoning: `Assessment failed: ${msg}`,
                issues: ['Unable to complete assessment']
            };
        }
    }

    /**
     * Parse LLM response into AssessmentResult
     */
    private parseAssessmentResponse(content: string, dimension: string): AssessmentResult {
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Normalize score to 0-100
            let score = Number(parsed.score);
            if (isNaN(score)) score = 50;
            score = Math.max(0, Math.min(100, Math.round(score)));

            // Extract issues from relevant field
            const issuesField = dimension === 'completeness' ? 'missing' :
                dimension === 'clarity' ? 'vague_parts' :
                    'discrepancies';
            const issues = Array.isArray(parsed[issuesField]) ? parsed[issuesField] : [];

            return {
                score,
                reasoning: String(parsed.reasoning || ''),
                issues: issues.map(String)
            };

        } catch (error: unknown) {
            logWarn(`[ClarityScorer] Failed to parse ${dimension} response, using fallback`);
            return {
                score: 50,
                reasoning: 'Unable to parse assessment response',
                issues: []
            };
        }
    }

    // ========================================================================
    // Threshold Detection (MT-011.7)
    // ========================================================================

    /**
     * Check if a score passes the threshold
     */
    checkThreshold(score: number): boolean {
        return score >= this.config.threshold;
    }

    /**
     * Get the threshold value
     */
    getThreshold(): number {
        return this.config.threshold;
    }

    /**
     * Update the threshold
     */
    setThreshold(threshold: number): void {
        if (threshold < 0 || threshold > 100) {
            throw new Error('Threshold must be 0-100');
        }
        this.config.threshold = threshold;
        logInfo(`[ClarityScorer] Threshold updated to ${threshold}`);
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Get scoring history for a ticket
     */
    getHistory(ticketId: string): ScoringResult[] {
        return this.scoringHistory.get(ticketId) || [];
    }

    /**
     * Clear scoring history for a ticket
     */
    clearHistory(ticketId: string): void {
        this.scoringHistory.delete(ticketId);
    }

    /**
     * Get config for external use
     */
    getConfig(): ScorerConfig {
        return { ...this.config };
    }

    /**
     * Update weights
     */
    setWeights(weights: Partial<ScorerConfig['weights']>): void {
        this.config.weights = { ...this.config.weights, ...weights };

        // Re-normalize
        const sum = this.config.weights.completeness +
            this.config.weights.clarity +
            this.config.weights.accuracy;
        this.config.weights.completeness /= sum;
        this.config.weights.clarity /= sum;
        this.config.weights.accuracy /= sum;
    }

    /**
     * Get color code for score display (MT-011.13)
     */
    getScoreColor(score: number): 'red' | 'yellow' | 'green' {
        if (score < 60) return 'red';
        if (score < 85) return 'yellow';
        return 'green';
    }
}

// ============================================================================
// Singleton Management
// ============================================================================

let instance: ClarityScorer | null = null;

export function initializeClarityScorer(config?: Partial<ScorerConfig>): ClarityScorer {
    if (instance !== null) {
        throw new Error('ClarityScorer already initialized');
    }
    instance = new ClarityScorer(config);
    return instance;
}

export function getClarityScorerInstance(): ClarityScorer {
    if (!instance) {
        throw new Error('ClarityScorer not initialized');
    }
    return instance;
}

export function resetClarityScorerForTests(): void {
    instance = null;
}
