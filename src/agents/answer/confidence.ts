/**
 * @file answer/confidence.ts
 * @module AnswerTeam/Confidence
 * @description Confidence scoring for answers (MT-014.3)
 * 
 * Scores answer confidence from 0-100. If below threshold (95%),
 * creates a ticket for user clarification.
 * 
 * **Simple explanation**: Like a student grading their own test.
 * "How sure am I about this answer?" If not confident enough (below 95),
 * we ask a human for help instead of giving a possibly wrong answer.
 */

import { logInfo, logWarn, logError } from '../../logger';
import { completeLLM } from '../../services/llmService';
import { createTicket } from '../../services/ticketDb';

// ============================================================================
// Types
// ============================================================================

export interface ConfidenceResult {
    score: number;           // 0-100 confidence score
    reasoning: string;       // Why this confidence level
    needsEscalation: boolean; // True if below threshold
    factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
    name: string;
    weight: number;          // 0-1 contribution to score
    present: boolean;        // Whether this factor is present
    description: string;
}

export interface ConfidenceConfig {
    threshold: number;       // Default: 95
    escalateBelow: boolean;  // Default: true
    escalationPriority: number; // Default: 2
}

const DEFAULT_CONFIG: ConfidenceConfig = {
    threshold: 95,
    escalateBelow: true,
    escalationPriority: 2
};

// ============================================================================
// Confidence Scoring Prompt
// ============================================================================

const CONFIDENCE_SCORING_PROMPT = `You are a confidence evaluator. Rate the confidence of an answer to a question.

Score from 0-100 based on:
- 100: Answer is certain, directly from documentation, no ambiguity
- 80-99: Answer is likely correct, some minor uncertainty
- 60-79: Answer has moderate uncertainty, may need clarification
- 40-59: Answer is uncertain, multiple interpretations possible
- 0-39: Answer is mostly guesswork or clearly incomplete

Respond with ONLY a JSON object (no markdown, no explanation):
{"score": <number>, "reasoning": "<1-2 sentences>"}`;

// ============================================================================
// ConfidenceScorer Class
// ============================================================================

/**
 * Scores answer confidence and handles escalation
 * 
 * **Simple explanation**: The quality checker that decides if an answer
 * is good enough to send, or if we need to get a human involved.
 */
export class ConfidenceScorer {
    private config: ConfidenceConfig;

    constructor(config?: Partial<ConfidenceConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Score the confidence of an answer
     * 
     * @param question The original question
     * @param answer The generated answer
     * @param contextAvailable Summary of available context
     * @returns Confidence result with score and factors
     */
    async scoreConfidence(
        question: string,
        answer: string,
        contextAvailable?: string
    ): Promise<ConfidenceResult> {
        logInfo(`[ConfidenceScorer] Scoring answer for: ${question.substring(0, 50)}...`);

        try {
            // Use LLM to score confidence
            const prompt = `Question: ${question}\n\nAnswer: ${answer}\n\nContext available: ${contextAvailable || 'minimal'}`;
            const response = await completeLLM(prompt, {
                systemPrompt: CONFIDENCE_SCORING_PROMPT,
                temperature: 0.2 // Low temperature for consistent scoring
            });

            // Parse JSON response
            const parsed = this.parseScoreResponse(response.content);

            // Check factors
            const factors = this.evaluateConfidenceFactors(question, answer);

            // Calculate final score (LLM score weighted with factors)
            const factorAdjustment = this.calculateFactorAdjustment(factors);
            const finalScore = Math.round(parsed.score * factorAdjustment);

            const result: ConfidenceResult = {
                score: Math.max(0, Math.min(100, finalScore)),
                reasoning: parsed.reasoning,
                needsEscalation: finalScore < this.config.threshold,
                factors
            };

            logInfo(`[ConfidenceScorer] Score: ${result.score}/100 (threshold: ${this.config.threshold})`);

            return result;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[ConfidenceScorer] Scoring failed: ${message}`);

            // Default to low confidence on error
            return {
                score: 50,
                reasoning: 'Unable to score confidence due to error',
                needsEscalation: true,
                factors: []
            };
        }
    }

    /**
     * Create escalation ticket for low confidence answer
     */
    async escalate(
        question: string,
        answer: string,
        confidenceResult: ConfidenceResult
    ): Promise<string> {
        if (!this.config.escalateBelow) {
            logInfo('[ConfidenceScorer] Escalation disabled, skipping');
            return '';
        }

        logWarn(`[ConfidenceScorer] Escalating low-confidence answer (${confidenceResult.score}%)`);

        try {
            const ticket = await createTicket({
                title: `CLARIFICATION NEEDED: ${question.substring(0, 60)}${question.length > 60 ? '...' : ''}`,
                status: 'open',
                description: `## Question\n${question}\n\n## Attempted Answer (${confidenceResult.score}% confidence)\n${answer}\n\n## Why Escalated\n${confidenceResult.reasoning}\n\n## Confidence Factors\n${confidenceResult.factors.map(f => `- ${f.name}: ${f.present ? '✓' : '✗'}`).join('\n')}`,
                priority: this.config.escalationPriority,
                creator: 'answer-team',
                assignee: 'user',
                type: 'ai_to_human',
                taskId: null,
                version: 1,
                resolution: null
            });

            logInfo(`[ConfidenceScorer] Created escalation ticket: ${ticket.id}`);
            return ticket.id;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[ConfidenceScorer] Failed to create escalation ticket: ${message}`);
            return '';
        }
    }

    /**
     * Parse LLM response for score
     */
    private parseScoreResponse(content: string): { score: number; reasoning: string } {
        try {
            // Try to extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    score: typeof parsed.score === 'number' ? parsed.score : 50,
                    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided'
                };
            }
        } catch (e) {
            logWarn('[ConfidenceScorer] Failed to parse JSON response');
        }

        // Fallback: try to extract a number
        const numMatch = content.match(/\b(\d{1,3})\b/);
        return {
            score: numMatch ? Math.min(100, parseInt(numMatch[1], 10)) : 50,
            reasoning: content.substring(0, 200)
        };
    }

    /**
     * Evaluate rule-based confidence factors
     */
    private evaluateConfidenceFactors(question: string, answer: string): ConfidenceFactor[] {
        return [
            {
                name: 'Answer Length',
                weight: 0.15,
                present: answer.length > 50 && answer.length < 5000,
                description: 'Answer is neither too short nor too long'
            },
            {
                name: 'Contains Code',
                weight: 0.1,
                present: answer.includes('```') || answer.includes('`'),
                description: 'Answer includes code examples when relevant'
            },
            {
                name: 'Addresses Question',
                weight: 0.2,
                present: this.questionWordsInAnswer(question, answer),
                description: 'Answer references key terms from question'
            },
            {
                name: 'Not Hedging',
                weight: 0.15,
                present: !this.containsHedgingLanguage(answer),
                description: 'Answer does not use excessive uncertainty words'
            },
            {
                name: 'Not Generic',
                weight: 0.2,
                present: answer.length > 100,
                description: 'Answer is specific, not a generic response'
            }
        ];
    }

    /**
     * Check if key words from question appear in answer
     */
    private questionWordsInAnswer(question: string, answer: string): boolean {
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 'why', 'when', 'where', 'which', 'who', 'do', 'does', 'can', 'could', 'should', 'would', 'to', 'in', 'on', 'at', 'for', 'of', 'and', 'or', 'but', 'if', 'then', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'it', 'my', 'your', 'our', 'their', 'its']);

        const questionWords = question.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));

        const answerLower = answer.toLowerCase();
        const matchCount = questionWords.filter(w => answerLower.includes(w)).length;

        return matchCount >= Math.min(3, questionWords.length * 0.5);
    }

    /**
     * Check for hedging language that indicates uncertainty
     */
    private containsHedgingLanguage(answer: string): boolean {
        const hedgingPhrases = [
            'i\'m not sure',
            'i don\'t know',
            'i can\'t',
            'i cannot',
            'might be',
            'could be',
            'may be',
            'possibly',
            'perhaps',
            'i think maybe',
            'not certain',
            'uncertain',
            'unclear'
        ];

        const lowerAnswer = answer.toLowerCase();
        const hedgeCount = hedgingPhrases.filter(phrase => lowerAnswer.includes(phrase)).length;

        return hedgeCount >= 2;
    }

    /**
     * Calculate adjustment multiplier from factors
     */
    private calculateFactorAdjustment(factors: ConfidenceFactor[]): number {
        let adjustment = 1.0;

        for (const factor of factors) {
            if (!factor.present) {
                adjustment -= factor.weight * 0.2; // Reduce by 20% of weight if factor missing
            }
        }

        return Math.max(0.6, adjustment); // Never reduce by more than 40%
    }

    /**
     * Get current threshold
     */
    getThreshold(): number {
        return this.config.threshold;
    }

    /**
     * Update threshold
     */
    setThreshold(threshold: number): void {
        this.config.threshold = Math.max(0, Math.min(100, threshold));
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createConfidenceScorer(config?: Partial<ConfidenceConfig>): ConfidenceScorer {
    return new ConfidenceScorer(config);
}
