/**
 * LLM Prompt Templates for Planning Team
 * 
 * **Simple explanation**: This module provides pre-written prompt templates
 * for different planning scenarios - like having a script ready for different
 * types of conversations with the AI.
 * 
 * @module agents/planning/prompts
 */

import { logInfo } from '../../logger';

/**
 * Template variable substitution map
 */
export type TemplateVariables = Record<string, string | number | boolean | string[]>;

/**
 * Prompt template with metadata
 */
export interface PromptTemplate {
    /** Template ID */
    id: string;
    /** Template name */
    name: string;
    /** Template description */
    description: string;
    /** Scenario this template is for */
    scenario: 'new-feature' | 'bug-fix' | 'refactor' | 'documentation' | 'testing' | 'general';
    /** The template string with {{variables}} */
    template: string;
    /** Required variables */
    requiredVariables: string[];
    /** Optional variables with defaults */
    optionalVariables: Record<string, string>;
    /** System prompt to use */
    systemPrompt: string;
    /** Recommended temperature */
    temperature: number;
}

/**
 * Generated prompt result
 */
export interface GeneratedPrompt {
    /** The final prompt string */
    prompt: string;
    /** System prompt to use */
    systemPrompt: string;
    /** Temperature to use */
    temperature: number;
    /** Template used */
    templateId: string;
    /** Variables used */
    variables: TemplateVariables;
    /** Missing optional variables */
    missingOptional: string[];
}

/**
 * Planning prompt templates
 */
const PLANNING_TEMPLATES: PromptTemplate[] = [
    {
        id: 'new-feature-decomposition',
        name: 'New Feature Decomposition',
        description: 'Break down a new feature into atomic tasks',
        scenario: 'new-feature',
        template: `Analyze and decompose this new feature into atomic development tasks:

FEATURE: {{featureName}}
DESCRIPTION: {{featureDescription}}
{{#if existingPatterns}}
EXISTING PATTERNS TO FOLLOW:
{{existingPatterns}}
{{/if}}

Requirements:
1. Each task must be 15-60 minutes of focused work
2. Tasks must be independently testable
3. Order tasks by dependencies (what must be done first)

For each task, provide:
- Title: Clear, action-oriented title
- Description: What specifically needs to be done
- Estimate: Time in minutes (15-60)
- Dependencies: Which tasks must complete first
- Acceptance Criteria: 3+ testable conditions for "done"
- Files: Which files to create or modify

Decompose the feature now:`,
        requiredVariables: ['featureName', 'featureDescription'],
        optionalVariables: {
            existingPatterns: ''
        },
        systemPrompt: `You are a senior software architect who specializes in breaking down features into well-structured, atomic tasks. Your tasks are always clear, testable, and properly ordered by dependencies.`,
        temperature: 0.3
    },
    {
        id: 'bug-fix-analysis',
        name: 'Bug Fix Analysis',
        description: 'Analyze a bug and create fix tasks',
        scenario: 'bug-fix',
        template: `Analyze this bug report and create tasks to fix it:

BUG SUMMARY: {{bugSummary}}
{{#if errorMessage}}
ERROR MESSAGE: {{errorMessage}}
{{/if}}
{{#if stackTrace}}
STACK TRACE:
{{stackTrace}}
{{/if}}
{{#if reproduction}}
REPRODUCTION STEPS:
{{reproduction}}
{{/if}}
{{#if affectedFiles}}
AFFECTED FILES: {{affectedFiles}}
{{/if}}

Create tasks for:
1. Root cause investigation (if needed)
2. Fix implementation
3. Test creation
4. Verification

For each task, provide:
- Title: Clear description of task
- Description: What to do
- Estimate: Time in minutes
- Acceptance Criteria: How to verify

Analyze and create tasks:`,
        requiredVariables: ['bugSummary'],
        optionalVariables: {
            errorMessage: '',
            stackTrace: '',
            reproduction: '',
            affectedFiles: ''
        },
        systemPrompt: `You are a debugging expert who methodically analyzes bugs and creates clear fix plans. You always consider root causes and ensure comprehensive testing.`,
        temperature: 0.2
    },
    {
        id: 'refactor-planning',
        name: 'Refactor Planning',
        description: 'Plan a code refactoring effort',
        scenario: 'refactor',
        template: `Plan a refactoring effort for:

WHAT TO REFACTOR: {{target}}
WHY: {{reason}}
{{#if constraints}}
CONSTRAINTS:
{{constraints}}
{{/if}}
{{#if currentCode}}
CURRENT CODE STRUCTURE:
{{currentCode}}
{{/if}}

Create a phased refactoring plan with:
1. Preparation tasks (tests, backup, etc.)
2. Incremental refactoring steps (preserve functionality)
3. Cleanup tasks
4. Verification tasks

Each task should be:
- Small enough to complete in 15-60 minutes
- Safe (doesn't break existing functionality)
- Independently verifiable

Create the refactoring plan:`,
        requiredVariables: ['target', 'reason'],
        optionalVariables: {
            constraints: '',
            currentCode: ''
        },
        systemPrompt: `You are a refactoring specialist who plans safe, incremental improvements. You never recommend "big bang" rewrites - always prefer small, verifiable changes.`,
        temperature: 0.3
    },
    {
        id: 'documentation-tasks',
        name: 'Documentation Tasks',
        description: 'Create documentation tasks',
        scenario: 'documentation',
        template: `Create documentation tasks for:

WHAT TO DOCUMENT: {{subject}}
{{#if audience}}
TARGET AUDIENCE: {{audience}}
{{/if}}
{{#if existingDocs}}
EXISTING DOCUMENTATION:
{{existingDocs}}
{{/if}}

Create tasks for documenting:
1. API/interface documentation (JSDoc, TypeDoc)
2. Usage examples
3. Architecture/design decisions
4. Troubleshooting guides (if applicable)

Each task should produce a tangible documentation artifact.

Create documentation tasks:`,
        requiredVariables: ['subject'],
        optionalVariables: {
            audience: 'developers',
            existingDocs: ''
        },
        systemPrompt: `You are a technical writer who creates clear, comprehensive documentation. You ensure documentation is accurate, up-to-date, and useful.`,
        temperature: 0.4
    },
    {
        id: 'test-coverage',
        name: 'Test Coverage Tasks',
        description: 'Create tasks to improve test coverage',
        scenario: 'testing',
        template: `Create tasks to improve test coverage for:

TARGET: {{target}}
{{#if currentCoverage}}
CURRENT COVERAGE: {{currentCoverage}}%
{{/if}}
{{#if targetCoverage}}
TARGET COVERAGE: {{targetCoverage}}%
{{/if}}
{{#if untestedPaths}}
UNTESTED CODE PATHS:
{{untestedPaths}}
{{/if}}

Create tasks for:
1. Unit tests for individual functions
2. Integration tests for component interactions
3. Edge case tests
4. Error handling tests

Each test task should specify:
- What to test
- Type of test (unit/integration)
- Expected outcomes

Create testing tasks:`,
        requiredVariables: ['target'],
        optionalVariables: {
            currentCoverage: '',
            targetCoverage: '80',
            untestedPaths: ''
        },
        systemPrompt: `You are a QA engineer who designs comprehensive test suites. You focus on both happy paths and edge cases, ensuring robust coverage.`,
        temperature: 0.3
    },
    {
        id: 'requirement-clarification',
        name: 'Requirement Clarification',
        description: 'Generate clarification questions for vague requirements',
        scenario: 'general',
        template: `This requirement needs clarification:

REQUIREMENT: {{requirement}}
{{#if vagueElements}}
VAGUE ELEMENTS DETECTED: {{vagueElements}}
{{/if}}

Generate specific clarification questions for:
1. Ambiguous terms
2. Missing acceptance criteria
3. Unclear scope boundaries
4. Technical constraints

For each question:
- Make it specific and actionable
- Suggest possible answers where appropriate
- Explain why the clarification is needed

Generate clarification questions:`,
        requiredVariables: ['requirement'],
        optionalVariables: {
            vagueElements: ''
        },
        systemPrompt: `You are a requirements analyst who identifies gaps and ambiguities. Your questions are specific, constructive, and help refine requirements into actionable specifications.`,
        temperature: 0.4
    }
];

/**
 * PromptTemplateManager class for managing and generating prompts
 * 
 * **Simple explanation**: Like having a folder of form letters where you just
 * fill in the blanks - but for AI prompts.
 */
export class PromptTemplateManager {
    private templates: Map<string, PromptTemplate>;

    constructor() {
        this.templates = new Map();
        // Load default templates
        for (const template of PLANNING_TEMPLATES) {
            this.templates.set(template.id, template);
        }
    }

    /**
     * Get all available templates
     */
    getTemplates(): PromptTemplate[] {
        return Array.from(this.templates.values());
    }

    /**
     * Get templates by scenario
     */
    getTemplatesByScenario(scenario: PromptTemplate['scenario']): PromptTemplate[] {
        return this.getTemplates().filter(t => t.scenario === scenario);
    }

    /**
     * Get a specific template by ID
     */
    getTemplate(id: string): PromptTemplate | undefined {
        return this.templates.get(id);
    }

    /**
     * Add a custom template
     */
    addTemplate(template: PromptTemplate): void {
        this.templates.set(template.id, template);
        logInfo(`[PromptTemplates] Added template: ${template.id}`);
    }

    /**
     * Generate a prompt from a template
     * 
     * @param templateId - Template ID to use
     * @param variables - Variables to substitute
     * @returns Generated prompt
     */
    generate(templateId: string, variables: TemplateVariables): GeneratedPrompt {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        // Check required variables
        const missing = template.requiredVariables.filter(v => variables[v] === undefined);
        if (missing.length > 0) {
            throw new Error(`Missing required variables: ${missing.join(', ')}`);
        }

        // Merge with optional defaults
        const mergedVariables: TemplateVariables = {
            ...template.optionalVariables,
            ...variables
        };

        // Find missing optional (for reporting)
        const missingOptional = Object.keys(template.optionalVariables)
            .filter(v => variables[v] === undefined && template.optionalVariables[v] === '');

        // Substitute variables
        const prompt = this.substituteVariables(template.template, mergedVariables);

        return {
            prompt,
            systemPrompt: template.systemPrompt,
            temperature: template.temperature,
            templateId,
            variables: mergedVariables,
            missingOptional
        };
    }

    /**
     * Substitute variables in template string
     */
    private substituteVariables(template: string, variables: TemplateVariables): string {
        let result = template;

        // Handle conditionals {{#if variable}}...{{/if}}
        result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
            const value = variables[varName];
            if (value && (typeof value !== 'string' || value.length > 0)) {
                return content;
            }
            return '';
        });

        // Handle simple substitutions {{variable}}
        result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
            const value = variables[varName];
            if (Array.isArray(value)) {
                return value.join('\n');
            }
            return String(value ?? '');
        });

        // Clean up multiple newlines
        result = result.replace(/\n{3,}/g, '\n\n');

        return result.trim();
    }

    /**
     * Validate template variables
     */
    validateVariables(templateId: string, variables: TemplateVariables): {
        valid: boolean;
        missing: string[];
        extra: string[];
    } {
        const template = this.templates.get(templateId);
        if (!template) {
            return { valid: false, missing: [], extra: [] };
        }

        const allExpected = new Set([
            ...template.requiredVariables,
            ...Object.keys(template.optionalVariables)
        ]);

        const missing = template.requiredVariables.filter(v => variables[v] === undefined);
        const extra = Object.keys(variables).filter(v => !allExpected.has(v));

        return {
            valid: missing.length === 0,
            missing,
            extra
        };
    }
}

// Singleton instance
let instance: PromptTemplateManager | null = null;

/**
 * Get the singleton PromptTemplateManager
 */
export function getPromptTemplateManager(): PromptTemplateManager {
    if (!instance) {
        instance = new PromptTemplateManager();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetPromptTemplateManagerForTests(): void {
    instance = null;
}

/**
 * Quick helper to generate a prompt
 */
export function generatePrompt(templateId: string, variables: TemplateVariables): GeneratedPrompt {
    return getPromptTemplateManager().generate(templateId, variables);
}
