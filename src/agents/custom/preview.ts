/**
 * Custom Agent Preview/Test Mode
 *
 * Provides functionality to preview and test custom agents before saving.
 * Supports dry-run mode (no LLM), streaming preview, and configuration validation.
 *
 * **Simple explanation**: Like a "Preview" button for emails before sending.
 * Test your agent with sample queries to make sure it works correctly.
 *
 * @module agents/custom/preview
 * @see CUSTOM-AGENT-TEMPLATE.md for full documentation
 */

import { logInfo, logWarn, logError } from '../../logger';
import { completeLLM, streamLLM, LLMResponse } from '../../services/llmService';
import {
    CustomAgent,
    validateCustomAgent,
    CUSTOM_AGENT_CONSTRAINTS,
} from './schema';
import {
    substituteVariables,
    buildSystemPrompt,
    ExecutionResult,
    PromptVariables,
    ExecutionOptions,
} from './executor';
import { getHardlockPolicyDescription } from './hardlock';

// ============================================================================
// Section 1: Types
// ============================================================================

/**
 * Configuration for a preview request.
 *
 * **Simple explanation**: Settings for how to run the test.
 */
export interface PreviewConfig {
    /** The query to test with */
    query: string;
    /** Variables to substitute in the prompt */
    variables?: PromptVariables;
    /** Whether to skip the actual LLM call (dry run) */
    dryRun?: boolean;
    /** Timeout in milliseconds (default: 30000) */
    timeoutMs?: number;
    /** Callback for streaming chunks */
    onStream?: (chunk: string) => void;
    /** Skip hardlock policy in preview */
    skipHardlock?: boolean;
}

/**
 * Result of a preview/test execution.
 *
 * **Simple explanation**: What you get back after testing an agent.
 */
export interface PreviewResult {
    /** Whether the preview succeeded */
    success: boolean;
    /** The agent's response (or mock response in dry run) */
    response: string;
    /** The fully built system prompt (useful for debugging) */
    systemPrompt: string;
    /** What the user message would be */
    userMessage: string;
    /** Token usage (null in dry run) */
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    } | null;
    /** Timing information */
    timing: {
        startedAt: string;
        completedAt: string;
        durationMs: number;
    };
    /** Error message if failed */
    error?: string;
    /** Whether this was a dry run */
    isDryRun: boolean;
    /** Estimated token count of system prompt */
    estimatedPromptTokens: number;
}

/**
 * Validation result for agent configuration.
 */
export interface ConfigValidationResult {
    /** Whether the config is valid */
    valid: boolean;
    /** List of validation errors */
    errors: string[];
    /** List of warnings (valid but not recommended) */
    warnings: string[];
    /** Estimated prompt size info */
    promptInfo: {
        estimatedTokens: number;
        withinLimit: boolean;
        percentOfLimit: number;
    };
}

// ============================================================================
// Section 2: Preview Functions
// ============================================================================

/**
 * Preview/test a custom agent with a sample query.
 *
 * **Simple explanation**: Run a test query against an agent configuration.
 * Use dryRun=true to just validate the prompt without calling the LLM.
 *
 * @param agent - The agent configuration to test
 * @param config - Preview configuration
 * @returns Preview result with response and debug info
 */
export async function previewAgent(
    agent: CustomAgent,
    config: PreviewConfig
): Promise<PreviewResult> {
    const startedAt = new Date();

    logInfo(`[Preview] Starting preview for agent: ${agent.name}`);

    // Build the system prompt
    const variables: PromptVariables = {
        ...config.variables,
        user_query: config.query,
    };

    const executionOptions: ExecutionOptions = {
        skipHardlockPolicy: config.skipHardlock ?? false,
    };

    const systemPrompt = buildSystemPrompt(agent, variables, executionOptions);
    const userMessage = config.query;

    // Estimate token count (rough: ~4 chars per token)
    const estimatedPromptTokens = Math.ceil(systemPrompt.length / 4);

    logInfo(`[Preview] System prompt built: ${systemPrompt.length} chars, ~${estimatedPromptTokens} tokens`);

    // Dry run mode - just return the prompt info
    if (config.dryRun) {
        logInfo(`[Preview] Dry run mode - skipping LLM call`);
        const completedAt = new Date();
        return {
            success: true,
            response: getDryRunResponse(agent),
            systemPrompt,
            userMessage,
            usage: null,
            timing: {
                startedAt: startedAt.toISOString(),
                completedAt: completedAt.toISOString(),
                durationMs: completedAt.getTime() - startedAt.getTime(),
            },
            isDryRun: true,
            estimatedPromptTokens,
        };
    }

    // Execute with LLM
    try {
        const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userMessage },
        ];

        const llmOptions = {
            messages,
            temperature: agent.temperature,
        };

        let response: LLMResponse;

        if (config.onStream) {
            response = await streamLLM('', config.onStream, llmOptions);
        } else {
            response = await completeLLM('', llmOptions);
        }

        const completedAt = new Date();

        logInfo(`[Preview] LLM response received: ${response.usage?.total_tokens || 'unknown'} tokens`);

        return {
            success: true,
            response: response.content,
            systemPrompt,
            userMessage,
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
            } : null,
            timing: {
                startedAt: startedAt.toISOString(),
                completedAt: completedAt.toISOString(),
                durationMs: completedAt.getTime() - startedAt.getTime(),
            },
            isDryRun: false,
            estimatedPromptTokens,
        };

    } catch (error) {
        const completedAt = new Date();
        const errorMsg = error instanceof Error ? error.message : String(error);

        logError(`[Preview] LLM call failed: ${errorMsg}`);

        return {
            success: false,
            response: '',
            systemPrompt,
            userMessage,
            usage: null,
            timing: {
                startedAt: startedAt.toISOString(),
                completedAt: completedAt.toISOString(),
                durationMs: completedAt.getTime() - startedAt.getTime(),
            },
            error: errorMsg,
            isDryRun: false,
            estimatedPromptTokens,
        };
    }
}

/**
 * Generate a mock response for dry-run mode.
 */
function getDryRunResponse(agent: CustomAgent): string {
    return `[DRY RUN - No LLM called]\n\n` +
        `This is a preview of how "${agent.name}" would respond.\n\n` +
        `Agent Goals:\n${agent.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}\n\n` +
        `The response would be generated based on the system prompt shown above.`;
}

// ============================================================================
// Section 3: Validation Functions
// ============================================================================

/**
 * Validate an agent configuration before saving.
 *
 * **Simple explanation**: Check if the agent config is valid and
 * provide warnings about potential issues.
 *
 * @param config - The agent configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateAgentConfig(config: unknown): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Run schema validation
    const validationResult = validateCustomAgent(config);

    if (!validationResult.success) {
        const zodErrors = validationResult.errors?.issues || [];
        errors.push(...zodErrors.map(e => `${e.path.join('.')}: ${e.message}`));
    }

    // Extract the config for additional checks
    const agent = validationResult.data || config as Partial<CustomAgent>;

    // Check for warnings (valid but not recommended)
    if (agent.systemPrompt) {
        // Warn if system prompt is very short
        if (agent.systemPrompt.length < 50) {
            warnings.push('System prompt is very short. Consider adding more context for better results.');
        }

        // Warn if system prompt is very long
        if (agent.systemPrompt.length > 8000) {
            warnings.push('System prompt is very long. This may impact response quality and token usage.');
        }
    }

    // Warn if no goals defined
    if (!agent.goals || agent.goals.length === 0) {
        warnings.push('No goals defined. Goals help guide the agent\'s behavior.');
    }

    // Warn if too many goals
    if (agent.goals && agent.goals.length > 5) {
        warnings.push('Many goals defined. Consider focusing on 3-5 key goals for best results.');
    }

    // Warn if checklist is very long
    if (agent.checklist && agent.checklist.length > 10) {
        warnings.push('Checklist has many items. Consider prioritizing the most important ones.');
    }

    // Warn if temperature is at extremes
    if (agent.temperature !== undefined) {
        if (agent.temperature < 0.2) {
            warnings.push('Very low temperature (deterministic). Good for factual tasks, may be less creative.');
        }
        if (agent.temperature > 1.5) {
            warnings.push('Very high temperature. Responses may be unpredictable or incoherent.');
        }
    }

    // Calculate prompt info
    let estimatedTokens = 0;
    if (validationResult.success && validationResult.data) {
        const mockPrompt = buildSystemPrompt(validationResult.data, {});
        estimatedTokens = Math.ceil(mockPrompt.length / 4);
    }

    const maxTokens = 4000; // Typical context limit portion for system prompt
    const withinLimit = estimatedTokens < maxTokens;
    const percentOfLimit = Math.round((estimatedTokens / maxTokens) * 100);

    if (!withinLimit) {
        warnings.push(`System prompt is ${percentOfLimit}% of typical limit. May leave less room for conversation.`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        promptInfo: {
            estimatedTokens,
            withinLimit,
            percentOfLimit,
        },
    };
}

/**
 * Get a quick preview of the system prompt for an agent config.
 *
 * **Simple explanation**: See what the full prompt looks like without
 * running the agent.
 *
 * @param agent - The agent configuration
 * @param variables - Optional variables to substitute
 * @returns The complete system prompt
 */
export function getPromptPreview(
    agent: CustomAgent,
    variables?: PromptVariables
): string {
    return buildSystemPrompt(agent, variables || {});
}

/**
 * Estimate token usage for an agent configuration.
 *
 * **Simple explanation**: How many tokens will this agent use?
 * Helps avoid context limit issues.
 *
 * @param agent - The agent configuration
 * @returns Estimated token counts
 */
export function estimateTokenUsage(agent: CustomAgent): {
    systemPromptTokens: number;
    hardlockPolicyTokens: number;
    totalBaseTokens: number;
    availableForConversation: number;
} {
    const fullPrompt = buildSystemPrompt(agent, {});
    const promptWithoutHardlock = buildSystemPrompt(agent, {}, { skipHardlockPolicy: true });
    const hardlockPolicy = getHardlockPolicyDescription();

    const systemPromptTokens = Math.ceil(promptWithoutHardlock.length / 4);
    const hardlockPolicyTokens = Math.ceil(hardlockPolicy.length / 4);
    const totalBaseTokens = Math.ceil(fullPrompt.length / 4);

    // Assume 8K context, reserve 2K for response
    const maxContext = 8000;
    const reservedForResponse = 2000;
    const availableForConversation = maxContext - totalBaseTokens - reservedForResponse;

    return {
        systemPromptTokens,
        hardlockPolicyTokens,
        totalBaseTokens,
        availableForConversation: Math.max(0, availableForConversation),
    };
}

// ============================================================================
// Section 4: Sample Queries
// ============================================================================

/**
 * Default sample queries for testing agents.
 */
export const DEFAULT_SAMPLE_QUERIES = [
    'What can you help me with?',
    'Explain your role and capabilities.',
    'Give me an example of how you would approach a task.',
    'What are your limitations?',
    'How should I format my requests for best results?',
];

/**
 * Get domain-specific sample queries based on agent goals.
 *
 * **Simple explanation**: Suggest test queries based on what the agent does.
 *
 * @param agent - The agent configuration
 * @returns Array of suggested sample queries
 */
export function getSuggestedQueries(agent: CustomAgent): string[] {
    const queries: string[] = [...DEFAULT_SAMPLE_QUERIES];

    // Add queries based on keywords in goals
    const goalsText = agent.goals.join(' ').toLowerCase();

    if (goalsText.includes('research') || goalsText.includes('find')) {
        queries.push(
            'Research the best practices for error handling.',
            'Find information about TypeScript generics.',
        );
    }

    if (goalsText.includes('document') || goalsText.includes('explain')) {
        queries.push(
            'Document this function and its parameters.',
            'Explain how this code works.',
        );
    }

    if (goalsText.includes('review') || goalsText.includes('analyze')) {
        queries.push(
            'Review this code for potential issues.',
            'Analyze the architecture of this module.',
        );
    }

    if (goalsText.includes('plan') || goalsText.includes('architect')) {
        queries.push(
            'Create a plan for implementing user authentication.',
            'Design a database schema for a blog.',
        );
    }

    if (goalsText.includes('debug') || goalsText.includes('fix')) {
        queries.push(
            'Help me debug this error: "Cannot read property of undefined".',
            'Why might this function return null?',
        );
    }

    // Remove duplicates
    return [...new Set(queries)];
}

/**
 * Generate a sample query based on agent context.
 *
 * **Simple explanation**: Create a test query that makes sense for this agent.
 *
 * @param agent - The agent configuration
 * @returns A contextual sample query
 */
export function generateContextualQuery(agent: CustomAgent): string {
    const firstGoal = agent.goals[0] || 'assist with tasks';

    // Build a contextual query from the agent's description and goals
    const templates = [
        `Based on your focus on "${firstGoal}", how would you approach a complex problem in this area?`,
        `As ${agent.name}, what would be your first steps when given a new task related to ${firstGoal.toLowerCase()}?`,
        `Help me understand how you would ${firstGoal.toLowerCase()}?`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
}

// ============================================================================
// Section 5: Exports
// ============================================================================

export {
    // Re-export relevant types from executor for convenience
    PromptVariables,
    ExecutionOptions,
};
