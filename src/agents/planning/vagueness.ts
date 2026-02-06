/**
 * Vagueness Detection System for Planning Team
 * 
 * **Simple explanation**: This is like a clarity checker that finds
 * unclear words and phrases in your requirements and asks for more
 * specific information.
 * 
 * @module agents/planning/vagueness
 */

import { completeLLM } from '../../services/llmService';
import { logInfo, logWarn } from '../../logger';
import { onTicketChange, updateTicket, getTicket } from '../../services/ticketDb';
import type { Ticket, TicketThreadMessage } from '../../services/ticketDb';

/**
 * Result of vagueness detection for a single phrase
 */
export interface VaguenessResult {
    /** The vague phrase detected */
    phrase: string;
    /** Clarity score 0-100 (100 = perfectly clear) */
    score: number;
    /** Suggested clarification question */
    clarificationQuestion: string;
    /** Category of vagueness */
    category: 'ambiguous' | 'subjective' | 'unmeasurable' | 'undefined' | 'context-dependent';
    /** Specific suggestions to make it concrete */
    suggestions: string[];
}

/**
 * Overall vagueness analysis result
 */
export interface VaguenessAnalysis {
    /** Original text analyzed */
    originalText: string;
    /** Overall clarity score (0-100) */
    overallScore: number;
    /** Individual vague items found */
    items: VaguenessResult[];
    /** Whether clarification is required (score < threshold) */
    requiresClarification: boolean;
    /** Generated clarification ticket ID (if created) */
    clarificationTicketId?: string;
    /** Analysis timestamp */
    timestamp: Date;
}

/**
 * Common vague patterns to detect quickly
 */
const VAGUE_PATTERNS: Array<{
    pattern: RegExp;
    category: VaguenessResult['category'];
    question: string;
    suggestions: string[];
}> = [
        {
            pattern: /\b(nice|good|better|great)\b/i,
            category: 'subjective',
            question: 'What specifically makes it "good"? What criteria should we use to measure quality?',
            suggestions: ['Define specific metrics', 'List acceptance criteria', 'Provide examples of "good"']
        },
        {
            pattern: /\buser[- ]?friendly\b/i,
            category: 'subjective',
            question: 'What does "user-friendly" mean in this context? Target audience? Specific UX requirements?',
            suggestions: ['Define target users', 'List specific UX requirements', 'Provide accessibility needs']
        },
        {
            pattern: /\b(fast|quick|efficient)\b/i,
            category: 'unmeasurable',
            question: 'How fast specifically? What are the performance targets (e.g., <100ms response time)?',
            suggestions: ['Define response time targets', 'Specify throughput requirements', 'Set memory limits']
        },
        {
            pattern: /\b(simple|easy|clean)\b/i,
            category: 'subjective',
            question: 'What makes it "simple"? For whom? What complexity should we avoid?',
            suggestions: ['Define complexity limits', 'List what to exclude', 'Specify technical constraints']
        },
        {
            pattern: /\b(modern|intuitive)\b/i,
            category: 'subjective',
            question: 'What "modern" features are needed? Which design patterns should we follow?',
            suggestions: ['Reference specific design systems', 'List required modern patterns', 'Provide UI examples']
        },
        {
            pattern: /\b(scalable|robust)\b/i,
            category: 'unmeasurable',
            question: 'What scale should we design for? Expected load? Growth projections?',
            suggestions: ['Define expected users/requests', 'Specify growth timeline', 'Set uptime requirements']
        },
        {
            pattern: /\bsome\b\s+\w+/i,
            category: 'undefined',
            question: 'Which specific items? Please list exactly what is needed.',
            suggestions: ['Enumerate all items', 'Define minimum required', 'Prioritize the list']
        },
        {
            pattern: /\betc\.?\b/i,
            category: 'undefined',
            question: 'What else is included in "etc"? Please provide the complete list.',
            suggestions: ['List all items explicitly', 'Define scope boundaries', 'Clarify what\'s excluded']
        },
        {
            pattern: /\b(maybe|possibly|might)\b/i,
            category: 'ambiguous',
            question: 'Is this feature required or optional? Please clarify the priority.',
            suggestions: ['Mark as required or optional', 'Assign priority (P0-P3)', 'Define conditions for inclusion']
        },
        {
            pattern: /\b(as needed|when necessary)\b/i,
            category: 'context-dependent',
            question: 'What conditions determine when this is needed? Please specify the triggers.',
            suggestions: ['Define trigger conditions', 'Specify frequency', 'List scenarios']
        }
    ];

/**
 * SmartPlan-specific vague patterns for planning requirements
 * 
 * **Simple explanation**: These patterns catch planning-specific vagueness
 * like undefined acceptance criteria, missing dependencies, and unclear scope.
 */
const SMARTPLAN_PATTERNS: Array<{
    pattern: RegExp;
    category: VaguenessResult['category'];
    question: string;
    suggestions: string[];
}> = [
        {
            pattern: /\b(improve|enhance|optimize)\b/i,
            category: 'unmeasurable',
            question: 'By how much should we improve? What metric defines success?',
            suggestions: ['Define baseline measurement', 'Set target improvement %', 'Specify before/after criteria']
        },
        {
            pattern: /\b(various|multiple|several)\b\s+\w+/i,
            category: 'undefined',
            question: 'Exactly how many? Please list all items explicitly.',
            suggestions: ['Provide complete enumeration', 'Define minimum count', 'Set maximum scope']
        },
        {
            pattern: /\b(appropriate|suitable|proper)\b/i,
            category: 'subjective',
            question: 'What makes something "appropriate" in this context? Define criteria.',
            suggestions: ['Define selection criteria', 'List requirements', 'Provide examples']
        },
        {
            pattern: /\b(seamless|smooth)\b/i,
            category: 'subjective',
            question: 'What makes the experience "seamless"? Max latency? Error handling?',
            suggestions: ['Define performance targets', 'Specify error recovery', 'List UX requirements']
        },
        {
            pattern: /\b(support|handle)\b\s+\w+/i,
            category: 'undefined',
            question: 'What specific cases should be supported? Edge cases? Error conditions?',
            suggestions: ['List supported cases', 'Define error handling', 'Specify limitations']
        },
        {
            pattern: /\bflexible\b/i,
            category: 'ambiguous',
            question: 'Flexible in what way? Configuration options? Extension points?',
            suggestions: ['Define customization points', 'List configurable options', 'Specify extension mechanism']
        },
        {
            pattern: /\b(later|future|eventually)\b/i,
            category: 'context-dependent',
            question: 'When specifically? Is this in scope for current work or deferred?',
            suggestions: ['Set specific timeline', 'Mark as out-of-scope if deferred', 'Create follow-up ticket']
        },
        {
            pattern: /\blike\s+\w+/i,
            category: 'ambiguous',
            question: 'What specific aspects should be similar? Exact behavior or general pattern?',
            suggestions: ['List specific features to match', 'Define differences allowed', 'Provide reference implementation']
        },
        {
            pattern: /\b(other|additional)\b\s+\w+/i,
            category: 'undefined',
            question: 'What other/additional items? Please enumerate completely.',
            suggestions: ['List all items', 'Define scope boundary', 'Mark as explicitly excluded if not in scope']
        },
        {
            pattern: /\b(standard|normal|typical)\b/i,
            category: 'context-dependent',
            question: 'What is the standard/normal in this context? Reference industry norm or internal convention?',
            suggestions: ['Reference specific standard', 'Document internal convention', 'Provide baseline example']
        }
    ];

/**
 * VaguenessDetector configuration
 */
export interface VaguenessDetectorConfig {
    /** Clarity threshold (0-100), below which clarification is required */
    threshold: number;
    /** Enable SmartPlan patterns for planning-specific vagueness */
    enableSmartPlan: boolean;
    /** Strictness level: 'relaxed' | 'standard' | 'strict' */
    strictness: 'relaxed' | 'standard' | 'strict';
}

const DEFAULT_VAGUENESS_CONFIG: VaguenessDetectorConfig = {
    threshold: 70,
    enableSmartPlan: true,
    strictness: 'standard'
};

/**
 * VaguenessDetector class for finding unclear requirements
 * 
 * **Simple explanation**: Like a writing coach that spots fuzzy language
 * and helps you make your ideas more concrete.
 */
export class VaguenessDetector {
    private config: VaguenessDetectorConfig;
    private systemPrompt: string;

    constructor(configOrThreshold: Partial<VaguenessDetectorConfig> | number = {}) {
        // Support legacy constructor (just threshold number)
        if (typeof configOrThreshold === 'number') {
            this.config = { ...DEFAULT_VAGUENESS_CONFIG, threshold: configOrThreshold };
        } else {
            this.config = { ...DEFAULT_VAGUENESS_CONFIG, ...configOrThreshold };
        }

        this.systemPrompt = `You are a requirements clarity analyst. Your job is to find vague, ambiguous, or unmeasurable requirements and suggest specific clarification questions.

Focus on:
1. Subjective terms (nice, good, user-friendly)
2. Unmeasurable requirements (fast, efficient)
3. Undefined scope (etc., some, various)
4. Ambiguous requirements (could mean multiple things)

For each vague item, provide a specific clarification question and concrete suggestions.`;
    }

    /**
     * Get combined patterns based on configuration
     */
    private getPatterns(): typeof VAGUE_PATTERNS {
        if (this.config.enableSmartPlan) {
            return [...VAGUE_PATTERNS, ...SMARTPLAN_PATTERNS];
        }
        return VAGUE_PATTERNS;
    }

    /**
     * Get score adjustment based on strictness
     */
    private getStrictnessAdjustment(): number {
        switch (this.config.strictness) {
            case 'relaxed': return 10;   // More lenient scores
            case 'strict': return -10;   // Stricter scores
            default: return 0;
        }
    }

    /**
     * Detect vagueness in given text
     * 
     * @param text - Text to analyze
     * @param ticketId - Optional ticket to create clarification for
     * @returns Vagueness analysis result
     */
    async detect(text: string, ticketId?: string): Promise<VaguenessAnalysis> {
        logInfo(`[VaguenessDetector] Starting vagueness detection (SmartPlan: ${this.config.enableSmartPlan}, strictness: ${this.config.strictness})`);

        // First, quick pattern-based detection
        const quickResults = this.quickDetect(text);

        // If many vague items found, use LLM for deeper analysis
        let allItems = quickResults;
        if (quickResults.length < 3 && text.length > 100) {
            const llmResults = await this.llmDetect(text);
            // Merge, avoiding duplicates
            allItems = this.mergeResults(quickResults, llmResults);
        }

        // Calculate overall score
        const overallScore = this.calculateOverallScore(allItems);
        const requiresClarification = overallScore < this.config.threshold;

        const analysis: VaguenessAnalysis = {
            originalText: text,
            overallScore,
            items: allItems,
            requiresClarification,
            timestamp: new Date()
        };

        // Create clarification ticket if needed
        if (requiresClarification && ticketId) {
            analysis.clarificationTicketId = await this.createClarificationTicket(ticketId, analysis);
        }

        logInfo(`[VaguenessDetector] Complete: score=${overallScore}, items=${allItems.length}, needsClarification=${requiresClarification}`);
        return analysis;
    }

    /**
     * Quick pattern-based vagueness detection
     */
    quickDetect(text: string): VaguenessResult[] {
        const results: VaguenessResult[] = [];
        const patterns = this.getPatterns();
        const scoreAdjustment = this.getStrictnessAdjustment();

        for (const { pattern, category, question, suggestions } of patterns) {
            const matches = text.match(new RegExp(pattern, 'gi'));
            if (matches) {
                for (const match of matches) {
                    // Avoid duplicates
                    if (!results.some(r => r.phrase.toLowerCase() === match.toLowerCase())) {
                        results.push({
                            phrase: match,
                            score: Math.max(0, Math.min(100, 30 + scoreAdjustment)), // Pattern-matched items are quite vague
                            clarificationQuestion: question,
                            category,
                            suggestions
                        });
                    }
                }
            }
        }

        return results;
    }

    /**
     * LLM-based deeper vagueness detection
     */
    private async llmDetect(text: string): Promise<VaguenessResult[]> {
        try {
            const prompt = `Analyze this requirement for vague or unclear language:

"${text}"

Find ALL vague phrases and for each provide:
VAGUE: [exact phrase]
SCORE: [0-100, where 100 is perfectly clear]
CATEGORY: [ambiguous|subjective|unmeasurable|undefined|context-dependent]
QUESTION: [specific clarification question]
SUGGESTION: [concrete way to make it clearer]

Only report genuinely vague items. Skip technical terms that are domain-specific but clear.`;

            const response = await completeLLM(prompt, {
                systemPrompt: this.systemPrompt,
                temperature: 0.2
            });

            return this.parseLLMResponse(response.content);
        } catch (error: unknown) {
            logWarn(`[VaguenessDetector] LLM detection failed: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Parse LLM response into VaguenessResults
     */
    private parseLLMResponse(response: string): VaguenessResult[] {
        const results: VaguenessResult[] = [];
        const blocks = response.split(/(?=VAGUE:)/i);

        for (const block of blocks) {
            if (!block.trim()) continue;

            const phraseMatch = block.match(/VAGUE:\s*(.+?)(?:\n|SCORE:)/i);
            const scoreMatch = block.match(/SCORE:\s*(\d+)/i);
            const categoryMatch = block.match(/CATEGORY:\s*(\w+)/i);
            const questionMatch = block.match(/QUESTION:\s*(.+?)(?:\n|SUGGESTION:|$)/is);
            const suggestionMatch = block.match(/SUGGESTION:\s*(.+?)$/is);

            if (phraseMatch && phraseMatch[1]) {
                results.push({
                    phrase: phraseMatch[1].trim(),
                    score: parseInt(scoreMatch?.[1] || '50', 10),
                    category: (categoryMatch?.[1]?.toLowerCase() as VaguenessResult['category']) || 'ambiguous',
                    clarificationQuestion: questionMatch?.[1]?.trim() || 'Please clarify this requirement.',
                    suggestions: suggestionMatch?.[1]?.split(/[,;]/).map(s => s.trim()).filter(Boolean) || []
                });
            }
        }

        return results;
    }

    /**
     * Merge quick and LLM results, avoiding duplicates
     */
    private mergeResults(quick: VaguenessResult[], llm: VaguenessResult[]): VaguenessResult[] {
        const merged = [...quick];

        for (const item of llm) {
            const isDuplicate = merged.some(
                existing =>
                    existing.phrase.toLowerCase().includes(item.phrase.toLowerCase()) ||
                    item.phrase.toLowerCase().includes(existing.phrase.toLowerCase())
            );
            if (!isDuplicate) {
                merged.push(item);
            }
        }

        return merged;
    }

    /**
     * Calculate overall clarity score
     */
    private calculateOverallScore(items: VaguenessResult[]): number {
        if (items.length === 0) return 100;

        // Average of individual scores, with penalty for quantity
        const avgScore = items.reduce((sum, item) => sum + item.score, 0) / items.length;
        const quantityPenalty = Math.min(items.length * 5, 30); // Max 30 point penalty

        return Math.max(0, Math.round(avgScore - quantityPenalty));
    }

    /**
     * Create a clarification ticket for vague requirements
     */
    private async createClarificationTicket(ticketId: string, analysis: VaguenessAnalysis): Promise<string> {
        try {
            const ticket = await getTicket(ticketId);
            if (!ticket) {
                logWarn(`[VaguenessDetector] Cannot find ticket ${ticketId} for clarification`);
                return '';
            }

            // Build clarification message
            const questions = analysis.items
                .map((item, i) => `${i + 1}. **"${item.phrase}"** (${item.category})\n   ${item.clarificationQuestion}`)
                .join('\n\n');

            const clarificationReply: TicketThreadMessage = {
                role: 'assistant',
                content: `## Clarification Needed (Score: ${analysis.overallScore}/100)\n\nI found some unclear requirements that need clarification:\n\n${questions}\n\nPlease provide specific details for each item above.`,
                createdAt: new Date().toISOString(),
                status: 'reviewing'
            };

            // Add clarification to ticket thread
            const currentThread = ticket.thread || [];
            currentThread.push(clarificationReply);

            await updateTicket(ticketId, {
                thread: currentThread,
                status: 'in_review' // Mark as needing review
            });

            logInfo(`[VaguenessDetector] Created clarification request on ticket ${ticketId}`);
            return ticketId;
        } catch (error: unknown) {
            logWarn(`[VaguenessDetector] Failed to create clarification ticket: ${error instanceof Error ? error.message : String(error)}`);
            return '';
        }
    }

    /**
     * Set the clarity threshold
     */
    setThreshold(threshold: number): void {
        this.config.threshold = Math.max(0, Math.min(100, threshold));
    }

    /**
     * Get current threshold
     */
    getThreshold(): number {
        return this.config.threshold;
    }

    /**
     * Enable or disable SmartPlan patterns
     */
    setSmartPlanEnabled(enabled: boolean): void {
        this.config.enableSmartPlan = enabled;
    }

    /**
     * Check if SmartPlan patterns are enabled
     */
    isSmartPlanEnabled(): boolean {
        return this.config.enableSmartPlan;
    }

    /**
     * Set strictness level
     */
    setStrictness(level: 'relaxed' | 'standard' | 'strict'): void {
        this.config.strictness = level;
    }
}

// Singleton instance
let detectorInstance: VaguenessDetector | null = null;

/**
 * Get the VaguenessDetector singleton instance
 */
export function getVaguenessDetector(): VaguenessDetector {
    if (!detectorInstance) {
        detectorInstance = new VaguenessDetector();
    }
    return detectorInstance;
}

/**
 * Reset detector for testing
 */
export function resetVaguenessDetectorForTests(): void {
    detectorInstance = null;
}
