/**
 * Acceptance Criteria Generator for Planning Team
 * 
 * **Simple explanation**: This module creates clear, testable success criteria
 * for each task - like making a checklist that tells you exactly what "done" looks like.
 * 
 * @module agents/planning/acceptanceCriteria
 */

import { completeLLM } from '../../services/llmService';
import { logInfo, logWarn, logError } from '../../logger';
import type { AtomicTask } from './decomposer';

/**
 * SMART criteria validation result
 * S - Specific, M - Measurable, A - Achievable, R - Relevant, T - Time-bound
 */
export interface SMARTValidation {
    /** Is the criterion specific? */
    isSpecific: boolean;
    /** Is the criterion measurable? */
    isMeasurable: boolean;
    /** Is the criterion achievable? */
    isAchievable: boolean;
    /** Is the criterion relevant to the task? */
    isRelevant: boolean;
    /** Does the criterion have a time bound or testable condition? */
    isTimeBound: boolean;
    /** Overall SMART score (count of true values / 5) */
    score: number;
    /** Improvement suggestions */
    suggestions: string[];
}

/**
 * Generated acceptance criteria
 */
export interface GeneratedCriteria {
    /** The criterion text */
    text: string;
    /** Type of criterion */
    type: 'functional' | 'behavioral' | 'performance' | 'quality' | 'edge-case';
    /** Whether this can be tested automatically */
    isAutomatable: boolean;
    /** Test method suggestion */
    testMethod: 'unit' | 'integration' | 'manual' | 'visual';
    /** SMART validation */
    smartValidation: SMARTValidation;
}

/**
 * Acceptance criteria generation result
 */
export interface AcceptanceCriteriaResult {
    /** Task ID */
    taskId: string;
    /** Generated criteria */
    criteria: GeneratedCriteria[];
    /** Coverage score (0-100) */
    coverageScore: number;
    /** Missing coverage areas */
    missingAreas: string[];
    /** Generation timestamp */
    timestamp: Date;
}

/**
 * Configuration for acceptance criteria generation
 */
export interface AcceptanceCriteriaConfig {
    /** Minimum criteria per task (default: 3) */
    minCriteria: number;
    /** Maximum criteria per task (default: 8) */
    maxCriteria: number;
    /** Minimum SMART score required (default: 0.6) */
    minSmartScore: number;
    /** Include edge case criteria (default: true) */
    includeEdgeCases: boolean;
}

const DEFAULT_CONFIG: AcceptanceCriteriaConfig = {
    minCriteria: 3,
    maxCriteria: 8,
    minSmartScore: 0.6,
    includeEdgeCases: true
};

/**
 * AcceptanceCriteriaGenerator class for creating testable criteria
 * 
 * **Simple explanation**: Like a test writer that creates a "definition of done"
 * checklist for each task, making sure each item is clear and verifiable.
 */
export class AcceptanceCriteriaGenerator {
    private config: AcceptanceCriteriaConfig;
    private systemPrompt: string;

    constructor(config: Partial<AcceptanceCriteriaConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.systemPrompt = this.buildSystemPrompt();
    }

    /**
     * Build the system prompt for AC generation
     */
    private buildSystemPrompt(): string {
        return `You are an acceptance criteria expert. Generate clear, testable acceptance criteria.

Rules for SMART criteria:
- SPECIFIC: Exactly what should happen (not vague)
- MEASURABLE: Can be verified objectively (yes/no, count, etc.)
- ACHIEVABLE: Realistic within task scope
- RELEVANT: Directly relates to task goal
- TIME-BOUND: Has clear completion condition

Each criterion should be:
1. A single, atomic statement
2. Written in "Given/When/Then" or "Should" format
3. Testable by a developer or tester
4. Free of ambiguous words (nice, fast, good, etc.)`;
    }

    /**
     * Generate acceptance criteria for a task
     * 
     * @param task - Task to generate criteria for
     * @returns Generated criteria result
     */
    async generateCriteria(task: AtomicTask): Promise<AcceptanceCriteriaResult> {
        logInfo(`[AcceptanceCriteria] Generating criteria for task: ${task.id}`);

        try {
            const criteria = await this.generateViallm(task);
            const enhancedCriteria = this.enhanceWithDefaults(task, criteria);
            const validatedCriteria = await this.validateCriteria(enhancedCriteria, task);
            const coverage = this.calculateCoverage(validatedCriteria, task);

            const result: AcceptanceCriteriaResult = {
                taskId: task.id,
                criteria: validatedCriteria,
                coverageScore: coverage.score,
                missingAreas: coverage.missing,
                timestamp: new Date()
            };

            logInfo(`[AcceptanceCriteria] Generated ${validatedCriteria.length} criteria for ${task.id}, coverage: ${coverage.score}%`);
            return result;
        } catch (error: unknown) {
            logError(`[AcceptanceCriteria] Failed to generate: ${error instanceof Error ? error.message : String(error)}`);
            // Return fallback criteria
            return this.createFallbackResult(task);
        }
    }

    /**
     * Generate criteria using LLM
     */
    private async generateViallm(task: AtomicTask): Promise<GeneratedCriteria[]> {
        const prompt = this.buildGenerationPrompt(task);

        try {
            const response = await completeLLM(prompt, {
                systemPrompt: this.systemPrompt,
                temperature: 0.3
            });
            return this.parseGeneratedCriteria(response.content);
        } catch (error: unknown) {
            logWarn(`[AcceptanceCriteria] LLM failed, using rule-based generation`);
            return this.generateRuleBased(task);
        }
    }

    /**
     * Build the generation prompt
     */
    private buildGenerationPrompt(task: AtomicTask): string {
        return `Generate ${this.config.minCriteria}-${this.config.maxCriteria} acceptance criteria for this task:

Task: ${task.title}
Description: ${task.description}
Files: ${task.files.join(', ') || 'Not specified'}
Is UI: ${task.isUI ? 'Yes' : 'No'}

For each criterion, output:
CRITERION: [text]
TYPE: [functional|behavioral|performance|quality|edge-case]
AUTOMATABLE: [yes|no]
TEST_METHOD: [unit|integration|manual|visual]

Include:
1. At least ${this.config.minCriteria} core functional criteria
2. ${this.config.includeEdgeCases ? 'At least 1 edge case scenario' : 'Skip edge cases'}
3. If UI task, include visual/behavioral criteria`;
    }

    /**
     * Parse LLM response into criteria array
     */
    private parseGeneratedCriteria(response: string): GeneratedCriteria[] {
        const criteria: GeneratedCriteria[] = [];
        const blocks = response.split(/(?=CRITERION:)/i).filter(b => b.trim());

        for (const block of blocks) {
            const criterion = this.parseBlock(block);
            if (criterion) {
                criteria.push(criterion);
            }
        }

        return criteria;
    }

    /**
     * Parse a single criterion block
     */
    private parseBlock(block: string): GeneratedCriteria | null {
        const criterionMatch = block.match(/CRITERION:\s*(.+?)(?=TYPE:|$)/is);
        const typeMatch = block.match(/TYPE:\s*(\w+)/i);
        const automatableMatch = block.match(/AUTOMATABLE:\s*(yes|no)/i);
        const testMethodMatch = block.match(/TEST_METHOD:\s*(\w+)/i);

        if (!criterionMatch) {
            return null;
        }

        const text = criterionMatch[1].trim();
        const type = this.parseType(typeMatch?.[1]);
        const isAutomatable = automatableMatch?.[1].toLowerCase() === 'yes';
        const testMethod = this.parseTestMethod(testMethodMatch?.[1]);

        return {
            text,
            type,
            isAutomatable,
            testMethod,
            smartValidation: this.validateSMART(text)
        };
    }

    /**
     * Parse criterion type
     */
    private parseType(raw?: string): GeneratedCriteria['type'] {
        const normalized = raw?.toLowerCase() || '';
        if (normalized.includes('functional')) return 'functional';
        if (normalized.includes('behavioral')) return 'behavioral';
        if (normalized.includes('performance')) return 'performance';
        if (normalized.includes('edge')) return 'edge-case';
        if (normalized.includes('quality')) return 'quality';
        return 'functional'; // default
    }

    /**
     * Parse test method
     */
    private parseTestMethod(raw?: string): GeneratedCriteria['testMethod'] {
        const normalized = raw?.toLowerCase() || '';
        if (normalized.includes('unit')) return 'unit';
        if (normalized.includes('integration')) return 'integration';
        if (normalized.includes('visual')) return 'visual';
        if (normalized.includes('manual')) return 'manual';
        return 'unit'; // default
    }

    /**
     * Validate SMART criteria
     */
    private validateSMART(text: string): SMARTValidation {
        const suggestions: string[] = [];

        // Check Specific - no vague words
        const vagueWords = ['nice', 'good', 'fast', 'easy', 'simple', 'better', 'improved', 'appropriate'];
        const isSpecific = !vagueWords.some(word => text.toLowerCase().includes(word));
        if (!isSpecific) {
            suggestions.push('Remove vague words (nice, good, fast, etc.) and be specific');
        }

        // Check Measurable - has quantifiable or verifiable condition
        const measurablePatterns = [
            /\d+/,                      // Numbers
            /should|must|will/i,        // Assertion words
            /returns?|outputs?/i,       // Output verification
            /displays?|shows?/i,        // Display verification
            /creates?|generates?/i,     // Creation verification
            /valid|invalid/i,           // Validation
            /error|exception/i,         // Error handling
            /true|false/i               // Boolean outcomes
        ];
        const isMeasurable = measurablePatterns.some(p => p.test(text));
        if (!isMeasurable) {
            suggestions.push('Add measurable conditions (numbers, success/failure states)');
        }

        // Check Achievable - reasonable scope (not too complex)
        const isAchievable = text.length < 200 && !text.includes(' and ') || text.split(' and ').length <= 2;
        if (!isAchievable) {
            suggestions.push('Split into smaller, achievable criteria');
        }

        // Check Relevant - contains action words related to dev work
        const relevantPatterns = [/function|method|component|module|api|file|test|implement|create|update/i];
        const isRelevant = relevantPatterns.some(p => p.test(text)) || text.length > 20;
        if (!isRelevant) {
            suggestions.push('Connect to specific code/feature elements');
        }

        // Check Time-bound - has completion condition
        const timeBoundPatterns = [
            /when|after|before|on|during/i,     // Temporal conditions
            /given|then/i,                       // BDD format
            /if|unless/i,                        // Conditional
            /complete|finish|succeed|fail/i     // Completion states
        ];
        const isTimeBound = timeBoundPatterns.some(p => p.test(text));
        if (!isTimeBound) {
            suggestions.push('Add clear completion/trigger conditions (when X, then Y)');
        }

        const checks = [isSpecific, isMeasurable, isAchievable, isRelevant, isTimeBound];
        const score = checks.filter(Boolean).length / 5;

        return {
            isSpecific,
            isMeasurable,
            isAchievable,
            isRelevant,
            isTimeBound,
            score,
            suggestions
        };
    }

    /**
     * Enhance criteria with default patterns
     */
    private enhanceWithDefaults(task: AtomicTask, criteria: GeneratedCriteria[]): GeneratedCriteria[] {
        const enhanced = [...criteria];

        // Ensure minimum criteria
        while (enhanced.length < this.config.minCriteria) {
            const defaultCriterion = this.getDefaultCriterion(task, enhanced.length);
            enhanced.push(defaultCriterion);
        }

        // Add edge case if configured and missing
        if (this.config.includeEdgeCases && !enhanced.some(c => c.type === 'edge-case')) {
            enhanced.push(this.getEdgeCaseCriterion(task));
        }

        // Limit to max
        return enhanced.slice(0, this.config.maxCriteria);
    }

    /**
     * Get a default criterion based on task
     */
    private getDefaultCriterion(task: AtomicTask, index: number): GeneratedCriteria {
        const templates: Array<(t: AtomicTask) => string> = [
            (t) => `The ${t.title} implementation should compile without TypeScript errors`,
            (t) => `All unit tests for ${t.title} should pass`,
            (t) => `The implementation should follow existing code patterns in the codebase`,
            (t) => `Error cases should be handled with appropriate error messages`,
            (t) => `The code should be documented with JSDoc comments`
        ];

        const text = templates[index % templates.length](task);
        return {
            text,
            type: 'quality',
            isAutomatable: true,
            testMethod: 'unit',
            smartValidation: this.validateSMART(text)
        };
    }

    /**
     * Get an edge case criterion
     */
    private getEdgeCaseCriterion(task: AtomicTask): GeneratedCriteria {
        const text = task.isUI
            ? `The component should display appropriately when given empty or null data`
            : `The function should handle edge cases (null, undefined, empty values) gracefully`;

        return {
            text,
            type: 'edge-case',
            isAutomatable: true,
            testMethod: 'unit',
            smartValidation: this.validateSMART(text)
        };
    }

    /**
     * Validate all criteria
     */
    private async validateCriteria(criteria: GeneratedCriteria[], task: AtomicTask): Promise<GeneratedCriteria[]> {
        return criteria.map(c => ({
            ...c,
            smartValidation: this.validateSMART(c.text)
        })).filter(c => c.smartValidation.score >= this.config.minSmartScore || criteria.indexOf(c) < this.config.minCriteria);
    }

    /**
     * Calculate coverage
     */
    private calculateCoverage(criteria: GeneratedCriteria[], task: AtomicTask): { score: number; missing: string[] } {
        const missing: string[] = [];
        let coverage = 0;

        // Check for functional criteria
        if (criteria.some(c => c.type === 'functional')) {
            coverage += 40;
        } else {
            missing.push('functional requirements');
        }

        // Check for edge case criteria
        if (criteria.some(c => c.type === 'edge-case')) {
            coverage += 20;
        } else {
            missing.push('edge case handling');
        }

        // Check for error handling
        if (criteria.some(c => c.text.toLowerCase().includes('error'))) {
            coverage += 20;
        } else {
            missing.push('error handling');
        }

        // Check for quality criteria
        if (criteria.some(c => c.type === 'quality' || c.text.toLowerCase().includes('test'))) {
            coverage += 20;
        } else {
            missing.push('quality/testing requirements');
        }

        return { score: coverage, missing };
    }

    /**
     * Generate criteria using rules (fallback)
     */
    private generateRuleBased(task: AtomicTask): GeneratedCriteria[] {
        const criteria: GeneratedCriteria[] = [];

        // Core functional criterion
        criteria.push({
            text: `The ${task.title} should be implemented as described in the task description`,
            type: 'functional',
            isAutomatable: false,
            testMethod: 'manual',
            smartValidation: this.validateSMART(`The ${task.title} should be implemented as described`)
        });

        // Testability criterion
        criteria.push({
            text: `Unit tests should be created for the ${task.title} covering at least 80% of the code`,
            type: 'quality',
            isAutomatable: true,
            testMethod: 'unit',
            smartValidation: this.validateSMART(`Unit tests should cover at least 80% of the code`)
        });

        // Error handling
        criteria.push({
            text: `Error conditions should return appropriate error messages to the caller`,
            type: 'behavioral',
            isAutomatable: true,
            testMethod: 'unit',
            smartValidation: this.validateSMART(`Error conditions should return appropriate error messages`)
        });

        if (task.isUI) {
            criteria.push({
                text: `The UI component should render correctly with valid input data`,
                type: 'functional',
                isAutomatable: true,
                testMethod: 'visual',
                smartValidation: this.validateSMART(`The UI component should render correctly`)
            });
        }

        return criteria;
    }

    /**
     * Create fallback result
     */
    private createFallbackResult(task: AtomicTask): AcceptanceCriteriaResult {
        return {
            taskId: task.id,
            criteria: this.generateRuleBased(task),
            coverageScore: 60,
            missingAreas: ['edge cases'],
            timestamp: new Date()
        };
    }

    /**
     * Validate existing acceptance criteria from a task
     * 
     * @param task - Task with existing criteria
     * @returns Validation results for each criterion
     */
    validateExisting(task: AtomicTask): SMARTValidation[] {
        return task.acceptanceCriteria.map(text => this.validateSMART(text));
    }

    /**
     * Enhance existing criteria
     * 
     * @param task - Task to enhance
     * @returns Enhanced task with improved criteria
     */
    async enhanceExisting(task: AtomicTask): Promise<AtomicTask> {
        const validations = this.validateExisting(task);
        const lowScoreCriteria = task.acceptanceCriteria.filter((_, i) => validations[i].score < this.config.minSmartScore);

        if (lowScoreCriteria.length === 0) {
            return task; // All criteria are good
        }

        // Generate better criteria
        const result = await this.generateCriteria(task);
        return {
            ...task,
            acceptanceCriteria: result.criteria.map(c => c.text)
        };
    }
}

// Singleton instance
let instance: AcceptanceCriteriaGenerator | null = null;

/**
 * Get the singleton AcceptanceCriteriaGenerator
 */
export function getAcceptanceCriteriaGenerator(): AcceptanceCriteriaGenerator {
    if (!instance) {
        instance = new AcceptanceCriteriaGenerator();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetAcceptanceCriteriaGeneratorForTests(): void {
    instance = null;
}
