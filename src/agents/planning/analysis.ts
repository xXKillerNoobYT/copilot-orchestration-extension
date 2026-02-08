/**
 * Requirement Analysis Engine for Planning Team
 * 
 * **Simple explanation**: This is like a reader that looks at what you want
 * to build and breaks it into clear categories - features, constraints,
 * dependencies, and things that need more clarification.
 * 
 * @module agents/planning/analysis
 */

import { completeLLM } from '../../services/llmService';
import { logInfo, logWarn } from '../../logger';

/**
 * Represents an extracted feature from requirements
 */
export interface ExtractedFeature {
    /** Feature description */
    description: string;
    /** Unique identifier */
    id: string;
    /** Whether feature is UI-related */
    isUI: boolean;
    /** Raw text from which feature was extracted */
    sourceText: string;
}

/**
 * Represents a constraint from requirements
 */
export interface Constraint {
    /** Constraint description */
    description: string;
    /** Type of constraint */
    type: 'technical' | 'business' | 'time' | 'resource';
}

/**
 * Represents a dependency
 */
export interface Dependency {
    /** Dependency name/description */
    name: string;
    /** Whether it's an external dependency */
    isExternal: boolean;
    /** Version if applicable */
    version?: string;
}

/**
 * Represents an unclear/vague part of requirements
 */
export interface UnclearItem {
    /** The vague phrase or section */
    phrase: string;
    /** Question to clarify it */
    clarificationQuestion: string;
    /** Severity of vagueness (0-100, lower is more vague) */
    severity: number;
}

/**
 * Complete analysis result
 */
export interface AnalysisResult {
    /** Extracted features */
    features: ExtractedFeature[];
    /** Constraints identified */
    constraints: Constraint[];
    /** Dependencies found */
    dependencies: Dependency[];
    /** Unclear items needing clarification */
    unclearItems: UnclearItem[];
    /** Overall clarity score (0-100) */
    clarityScore: number;
    /** Raw analysis text from LLM */
    rawAnalysis: string;
    /** Analysis timestamp */
    timestamp: Date;
}

/**
 * RequirementAnalyzer class for analyzing user requirements
 * 
 * **Simple explanation**: Think of this as a smart assistant that reads
 * your project description and organizes it into neat categories.
 */
export class RequirementAnalyzer {
    private systemPrompt: string;

    constructor() {
        this.systemPrompt = `You are a requirements analyst. Your job is to extract structured information from user requirements.
Focus on:
1. Clear, distinct features
2. Technical and business constraints
3. Dependencies on external systems/libraries
4. Vague or unclear parts that need clarification

Be precise and avoid assumptions. If something is unclear, flag it.`;
    }

    /**
     * Analyze a requirement text and extract structured information
     * 
     * **Simple explanation**: Give it a description of what you want to build,
     * and it tells you what features it found, what limits there are, and
     * what parts are unclear.
     * 
     * @param requirement - The requirement text to analyze
     * @param context - Optional additional context
     * @returns Analysis results
     */
    async analyze(requirement: string, context?: string): Promise<AnalysisResult> {
        logInfo('[RequirementAnalyzer] Starting analysis');

        const prompt = this.buildPrompt(requirement, context);

        try {
            const response = await completeLLM(prompt, {
                systemPrompt: this.systemPrompt,
                temperature: 0.3
            });

            const result = this.parseResponse(response.content, requirement);
            logInfo(`[RequirementAnalyzer] Analysis complete: ${result.features.length} features, ${result.unclearItems.length} unclear items`);

            return result;
        } catch (error: unknown) {
            logWarn(`[RequirementAnalyzer] LLM analysis failed: ${error instanceof Error ? error.message : String(error)}`);
            // Return empty analysis on failure
            return this.createEmptyResult(requirement);
        }
    }

    /**
     * Build the analysis prompt
     */
    private buildPrompt(requirement: string, context?: string): string {
        let prompt = `Analyze the following requirement and extract:
1. FEATURES: List distinct features (one per line)
2. CONSTRAINTS: Technical or business constraints
3. DEPENDENCIES: External dependencies needed
4. UNCLEAR: Parts that need clarification with questions

Requirement:
${requirement}`;

        if (context) {
            prompt += `\n\nAdditional Context:\n${context}`;
        }

        prompt += `\n\nFormat response as:
FEATURES:
- [feature description]

CONSTRAINTS:
- [type: technical|business|time|resource] [constraint]

DEPENDENCIES:
- [name] (external: yes|no)

UNCLEAR:
- [phrase] → [clarification question]`;

        return prompt;
    }

    /**
     * Parse LLM response into structured result
     */
    private parseResponse(response: string, sourceText: string): AnalysisResult {
        const features: ExtractedFeature[] = [];
        const constraints: Constraint[] = [];
        const dependencies: Dependency[] = [];
        const unclearItems: UnclearItem[] = [];

        let currentSection = '';
        const lines = response.split('\n');
        let featureCounter = 1;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('FEATURES:')) {
                currentSection = 'features';
                continue;
            } else if (trimmed.startsWith('CONSTRAINTS:')) {
                currentSection = 'constraints';
                continue;
            } else if (trimmed.startsWith('DEPENDENCIES:')) {
                currentSection = 'dependencies';
                continue;
            } else if (trimmed.startsWith('UNCLEAR:')) {
                currentSection = 'unclear';
                continue;
            }

            if (trimmed.startsWith('- ')) {
                const content = trimmed.slice(2);

                switch (currentSection) {
                    case 'features':
                        features.push({
                            id: `F${String(featureCounter++).padStart(3, '0')}`,
                            description: content,
                            isUI: this.isUIRelated(content),
                            sourceText: sourceText
                        });
                        break;

                    case 'constraints': {
                        const constraintMatch = content.match(/^\[(technical|business|time|resource)\]\s*(.+)/i);
                        constraints.push({
                            type: (constraintMatch?.[1]?.toLowerCase() as Constraint['type']) || 'technical',
                            description: constraintMatch?.[2] || content
                        });
                        break;
                    }

                    case 'dependencies': {
                        const depMatch = content.match(/^(.+?)\s*\(external:\s*(yes|no)\)/i);
                        dependencies.push({
                            name: depMatch?.[1]?.trim() || content,
                            isExternal: depMatch?.[2]?.toLowerCase() === 'yes'
                        });
                        break;
                    }

                    case 'unclear': {
                        const unclearMatch = content.match(/^(.+?)\s*→\s*(.+)$/);
                        if (unclearMatch) {
                            unclearItems.push({
                                phrase: unclearMatch[1].trim(),
                                clarificationQuestion: unclearMatch[2].trim(),
                                severity: 50 // Default medium severity
                            });
                        }
                        break;
                    }
                }
            }
        }

        // Calculate clarity score (100 - penalty for unclear items)
        const clarityScore = Math.max(0, 100 - (unclearItems.length * 15));

        return {
            features,
            constraints,
            dependencies,
            unclearItems,
            clarityScore,
            rawAnalysis: response,
            timestamp: new Date()
        };
    }

    /**
     * Check if a feature description is UI-related
     */
    private isUIRelated(description: string): boolean {
        const uiKeywords = [
            'ui', 'interface', 'button', 'form', 'page', 'screen',
            'display', 'view', 'component', 'modal', 'dialog',
            'sidebar', 'panel', 'layout', 'style', 'css', 'html',
            'frontend', 'visual', 'render', 'webview'
        ];
        const lower = description.toLowerCase();
        return uiKeywords.some(keyword => lower.includes(keyword));
    }

    /**
     * Create empty result for error cases
     */
    private createEmptyResult(sourceText: string): AnalysisResult {
        return {
            features: [],
            constraints: [],
            dependencies: [],
            unclearItems: [{
                phrase: 'entire requirement',
                clarificationQuestion: 'Could you please provide more details about what you want to build?',
                severity: 100
            }],
            clarityScore: 0,
            rawAnalysis: '',
            timestamp: new Date()
        };
    }

    /**
     * Quick check if requirement needs clarification
     * 
     * @param requirement - Requirement text
     * @returns true if clarification needed
     */
    quickClarityCheck(requirement: string): boolean {
        // Check for common vague patterns
        const vaguePatterns = [
            /make it (nice|good|better)/i,
            /user[- ]?friendly/i,
            /\b(fast|efficient|quick)\b/i,
            /\b(simple|easy|clean)\b/i,
            /\b(modern|intuitive)\b/i,
            /\b(scalable|robust)\b/i
        ];

        return vaguePatterns.some(pattern => pattern.test(requirement));
    }
}

// Singleton instance
let analyzerInstance: RequirementAnalyzer | null = null;

/**
 * Get the RequirementAnalyzer singleton instance
 */
export function getRequirementAnalyzer(): RequirementAnalyzer {
    if (!analyzerInstance) {
        analyzerInstance = new RequirementAnalyzer();
    }
    return analyzerInstance;
}

/**
 * Reset analyzer for testing
 */
export function resetRequirementAnalyzerForTests(): void {
    analyzerInstance = null;
}
