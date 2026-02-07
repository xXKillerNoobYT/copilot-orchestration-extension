import { logInfo, logError, logWarn } from '../../logger';
import { completeLLM, streamLLM, LLMResponse } from '../../services/llmService';
import {
    CustomAgent,
    SYSTEM_PROMPT_VARIABLES,
    type SystemPromptVariable
} from './schema';
import {
    loadCustomAgent,
    saveCustomAgent,
    customAgentExists,
    listCustomAgents,
    getWorkspaceFolder,
    AgentStorageError
} from './storage';
import {
    validateToolAccess,
    assertToolAllowed,
    HardlockViolationError,
    getHardlockPolicyDescription,
    createHardlockExecutor,
    generateEscalationDescription,
    type ToolValidationResult
} from './hardlock';

/**
 * Custom Agent Executor - Runtime execution framework for custom agents.
 *
 * **Simple explanation**: This is the "engine" that runs custom agents.
 * It loads their config, builds their system prompt with goals and checklists,
 * enforces the hardlock (no writing code), and handles conversations.
 *
 * @see CUSTOM-AGENT-TEMPLATE.md for full documentation
 */

// ============================================================================
// Section 1: Type Definitions
// ============================================================================

/**
 * Variables that can be substituted into system prompts.
 *
 * **Simple explanation**: These are the values that replace {{placeholders}}
 * in the agent's system prompt before it runs.
 */
export interface PromptVariables {
    /** Current task ID if in a task context */
    task_id?: string;
    /** Current ticket ID if in a ticket context */
    ticket_id?: string;
    /** The user's query being processed */
    user_query?: string;
    /** Current file path being worked on */
    file_path?: string;
    /** Currently selected text */
    selection?: string;
    /** Workspace/project name */
    project_name?: string;
    /** Current date (auto-filled) */
    current_date?: string;
    /** Current time (auto-filled) */
    current_time?: string;
}

/**
 * Context provided to agent execution.
 *
 * **Simple explanation**: Everything the agent needs to know when running -
 * the query, variables, and optional conversation history.
 */
export interface ExecutionContext {
    /** The user's query or request */
    query: string;
    /** Variables to substitute into system prompt */
    variables?: PromptVariables;
    /** Previous conversation messages for multi-turn */
    history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    /** Callback for streaming chunks */
    onStream?: (chunk: string) => void;
}

/**
 * Result of executing a custom agent.
 *
 * **Simple explanation**: What you get back after asking a custom agent
 * something - the response, token usage, and any errors.
 */
export interface ExecutionResult {
    /** Whether execution succeeded */
    success: boolean;
    /** The agent's response content */
    content: string;
    /** Token usage from the LLM */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    /** Error message if execution failed */
    error?: string;
    /** Error code for programmatic handling */
    errorCode?: 'AGENT_NOT_FOUND' | 'AGENT_INACTIVE' | 'AGENT_LOAD_ERROR' |
    'HARDLOCK_VIOLATION' | 'LLM_ERROR' | 'TIMEOUT' | 'UNKNOWN';
    /** Execution timing */
    timing?: {
        startedAt: string;
        completedAt: string;
        durationMs: number;
    };
    /** The agent that was executed */
    agentName: string;
}

/**
 * Options for agent execution.
 */
export interface ExecutionOptions {
    /** Override agent's configured timeout (seconds) */
    timeoutSeconds?: number;
    /** Override agent's configured maxTokens */
    maxTokens?: number;
    /** Override agent's configured temperature */
    temperature?: number;
    /** Don't include hardlock policy in system prompt (testing only) */
    skipHardlockPolicy?: boolean;
    /** Include debug information in response */
    debug?: boolean;
}

// ============================================================================
// Section 2: System Prompt Construction
// ============================================================================

/**
 * Substitute variables in a template string.
 *
 * **Simple explanation**: Replace {{variable}} placeholders with real values.
 * Like mail merge - {{user_query}} becomes "How do I fix this bug?"
 *
 * @param template - String containing {{variable}} placeholders
 * @param variables - Values to substitute
 * @returns Template with variables replaced
 */
export function substituteVariables(
    template: string,
    variables: PromptVariables
): string {
    // Auto-fill date and time if not provided
    const now = new Date();
    const filledVariables: PromptVariables = {
        current_date: now.toISOString().split('T')[0], // YYYY-MM-DD
        current_time: now.toTimeString().split(' ')[0], // HH:MM:SS
        ...variables,
    };

    // Replace all {{variable}} patterns
    return template.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match, varName) => {
        const value = filledVariables[varName as keyof PromptVariables];
        if (value !== undefined) {
            return String(value);
        }
        // Keep original if variable not found (makes debugging easier)
        return match;
    });
}

/**
 * Format goals as a bullet list.
 *
 * **Simple explanation**: Turn ["Goal 1", "Goal 2"] into a nice bullet list.
 */
function formatGoals(goals: string[]): string {
    if (goals.length === 0) {
        return 'No specific goals defined.';
    }
    return goals.map((goal, i) => `${i + 1}. ${goal}`).join('\n');
}

/**
 * Format checklist as a bullet list.
 *
 * **Simple explanation**: Turn checklist items into a checkbox list.
 */
function formatChecklist(checklist: string[]): string {
    if (checklist.length === 0) {
        return '';
    }
    return `\n## Checklist\nBefore completing your response, verify:\n` +
        checklist.map(item => `- [ ] ${item}`).join('\n');
}

/**
 * Format custom lists for inclusion in prompt.
 */
function formatCustomLists(customLists: CustomAgent['customLists']): string {
    if (!customLists || customLists.length === 0) {
        return '';
    }

    return customLists
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(list => {
            const header = `\n## ${list.name}`;
            const desc = list.description ? `\n${list.description}` : '';
            const items = list.items.map(item => `- ${item}`).join('\n');
            return `${header}${desc}\n${items}`;
        })
        .join('\n');
}

/**
 * Build the complete system prompt for a custom agent.
 *
 * **Simple explanation**: Combine all the pieces - agent's prompt, goals,
 * checklist, custom lists, and hardlock policy - into one system message.
 *
 * @param agent - The custom agent configuration
 * @param variables - Variables to substitute
 * @param options - Execution options
 * @returns Complete system prompt string
 */
export function buildSystemPrompt(
    agent: CustomAgent,
    variables: PromptVariables,
    options?: ExecutionOptions
): string {
    const parts: string[] = [];

    // Agent identity
    parts.push(`# ${agent.name}`);
    parts.push(`${agent.description}\n`);

    // Substituted system prompt
    const substitutedPrompt = substituteVariables(agent.systemPrompt, variables);
    parts.push(substitutedPrompt);

    // Goals
    parts.push('\n## Goals');
    parts.push(formatGoals(agent.goals));

    // Checklist (if any)
    const checklistSection = formatChecklist(agent.checklist);
    if (checklistSection) {
        parts.push(checklistSection);
    }

    // Custom lists (if any)
    const customListsSection = formatCustomLists(agent.customLists);
    if (customListsSection) {
        parts.push(customListsSection);
    }

    // Hardlock policy (unless explicitly skipped for testing)
    if (!options?.skipHardlockPolicy) {
        parts.push('\n' + getHardlockPolicyDescription());
    }

    return parts.join('\n');
}

// ============================================================================
// Section 3: Execution Errors
// ============================================================================

/**
 * Error thrown when a custom agent is not found.
 */
export class AgentNotFoundError extends Error {
    public readonly code = 'AGENT_NOT_FOUND';

    constructor(public readonly agentName: string) {
        super(`Custom agent "${agentName}" not found`);
        this.name = 'AgentNotFoundError';
    }
}

/**
 * Error thrown when a custom agent is inactive.
 */
export class AgentInactiveError extends Error {
    public readonly code = 'AGENT_INACTIVE';

    constructor(public readonly agentName: string) {
        super(`Custom agent "${agentName}" is inactive`);
        this.name = 'AgentInactiveError';
    }
}

/**
 * Error thrown when agent execution times out.
 */
export class AgentTimeoutError extends Error {
    public readonly code = 'TIMEOUT';

    constructor(
        public readonly agentName: string,
        public readonly timeoutSeconds: number
    ) {
        super(`Custom agent "${agentName}" timed out after ${timeoutSeconds}s`);
        this.name = 'AgentTimeoutError';
    }
}

// ============================================================================
// Section 4: Core Execution Function
// ============================================================================

/**
 * Execute a custom agent with a query.
 *
 * **Simple explanation**: The main function to run a custom agent. Give it
 * an agent name and a query, it loads the agent, builds the prompt, calls
 * the LLM, and returns the response.
 *
 * @param agentName - Name of the custom agent to execute
 * @param context - Execution context with query and options
 * @param options - Optional execution overrides
 * @returns Execution result with response or error
 */
export async function executeCustomAgent(
    agentName: string,
    context: ExecutionContext,
    options?: ExecutionOptions
): Promise<ExecutionResult> {
    const startedAt = new Date();

    logInfo(`[Custom Agent] Starting execution: ${agentName}`);

    try {
        // Get workspace folder
        const workspaceFolder = getWorkspaceFolder();
        if (!workspaceFolder) {
            return createErrorResult(agentName, 'No workspace folder open', 'UNKNOWN', startedAt);
        }

        // Check agent exists
        if (!customAgentExists(workspaceFolder, agentName)) {
            logWarn(`[Custom Agent] Agent not found: ${agentName}`);
            return createErrorResult(agentName, `Agent "${agentName}" not found`, 'AGENT_NOT_FOUND', startedAt);
        }

        // Load agent configuration
        let agent: CustomAgent;
        try {
            agent = loadCustomAgent(workspaceFolder, agentName);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Custom Agent] Failed to load agent: ${msg}`);
            return createErrorResult(agentName, `Failed to load agent: ${msg}`, 'AGENT_LOAD_ERROR', startedAt);
        }

        // Check agent is active
        if (!agent.isActive) {
            logWarn(`[Custom Agent] Agent is inactive: ${agentName}`);
            return createErrorResult(agentName, `Agent "${agentName}" is inactive`, 'AGENT_INACTIVE', startedAt);
        }

        // Build variables with user query
        const variables: PromptVariables = {
            ...context.variables,
            user_query: context.query,
        };

        // Build system prompt
        const systemPrompt = buildSystemPrompt(agent, variables, options);

        logInfo(`[Custom Agent] Built system prompt (${systemPrompt.length} chars)`);

        // Build messages array
        const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
            { role: 'system', content: systemPrompt },
        ];

        // Add conversation history if provided
        if (context.history && context.history.length > 0) {
            messages.push(...context.history);
        }

        // Add current query
        messages.push({ role: 'user', content: context.query });

        // Prepare LLM options
        const llmOptions = {
            messages,
            temperature: options?.temperature ?? agent.temperature,
        };

        // Execute LLM call
        let response: LLMResponse;

        if (context.onStream) {
            // Streaming mode
            response = await streamLLM('', context.onStream, llmOptions);
        } else {
            // Non-streaming mode
            response = await completeLLM('', llmOptions);
        }

        logInfo(`[Custom Agent] Execution complete (${response.usage?.total_tokens || 'unknown'} tokens)`);

        // Return successful result
        return createSuccessResult(agentName, response.content, response.usage, startedAt);

    } catch (error) {
        // Handle specific error types
        if (error instanceof HardlockViolationError) {
            logWarn(`[Custom Agent] Hardlock violation: ${error.message}`);
            return createErrorResult(agentName, error.getUserMessage(), 'HARDLOCK_VIOLATION', startedAt);
        }

        if (error instanceof AgentStorageError) {
            logError(`[Custom Agent] Storage error: ${error.message}`);
            return createErrorResult(agentName, error.message, 'AGENT_LOAD_ERROR', startedAt);
        }

        // Generic error handling
        const msg = error instanceof Error ? error.message : String(error);
        logError(`[Custom Agent] Execution failed: ${msg}`);
        return createErrorResult(agentName, `Execution failed: ${msg}`, 'LLM_ERROR', startedAt);
    }
}

/**
 * Create a successful execution result.
 */
function createSuccessResult(
    agentName: string,
    content: string,
    usage: LLMResponse['usage'],
    startedAt: Date
): ExecutionResult {
    const completedAt = new Date();
    return {
        success: true,
        content,
        usage,
        agentName,
        timing: {
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
        },
    };
}

/**
 * Create an error execution result.
 */
function createErrorResult(
    agentName: string,
    error: string,
    errorCode: ExecutionResult['errorCode'],
    startedAt: Date
): ExecutionResult {
    const completedAt = new Date();
    return {
        success: false,
        content: '',
        error,
        errorCode,
        agentName,
        timing: {
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
        },
    };
}

// ============================================================================
// Section 5: Custom Agent Executor Class
// ============================================================================

/**
 * Stateful executor for a custom agent with conversation history.
 *
 * **Simple explanation**: Like having a persistent chat session with an agent.
 * The executor remembers previous messages so the agent has context.
 */
export class CustomAgentExecutor {
    private agent: CustomAgent | null = null;
    private history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    private initialized = false;

    constructor(
        public readonly agentName: string,
        private options?: ExecutionOptions
    ) { }

    /**
     * Initialize the executor by loading the agent.
     *
     * @throws AgentNotFoundError if agent doesn't exist
     * @throws AgentInactiveError if agent is inactive
     */
    async initialize(): Promise<void> {
        const workspaceFolder = getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        if (!customAgentExists(workspaceFolder, this.agentName)) {
            throw new AgentNotFoundError(this.agentName);
        }

        this.agent = loadCustomAgent(workspaceFolder, this.agentName);

        if (!this.agent.isActive) {
            throw new AgentInactiveError(this.agentName);
        }

        this.initialized = true;
        logInfo(`[Custom Agent Executor] Initialized: ${this.agentName}`);
    }

    /**
     * Check if the executor is initialized.
     */
    isInitialized(): boolean {
        return this.initialized && this.agent !== null;
    }

    /**
     * Get the loaded agent configuration.
     */
    getAgent(): CustomAgent | null {
        return this.agent;
    }

    /**
     * Get the conversation history.
     */
    getHistory(): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
        return [...this.history];
    }

    /**
     * Clear the conversation history.
     */
    clearHistory(): void {
        this.history = [];
        logInfo(`[Custom Agent Executor] History cleared: ${this.agentName}`);
    }

    /**
     * Execute a query with this agent, maintaining history.
     *
     * @param query - The user's query
     * @param variables - Optional prompt variables
     * @param onStream - Optional streaming callback
     * @returns Execution result
     */
    async execute(
        query: string,
        variables?: PromptVariables,
        onStream?: (chunk: string) => void
    ): Promise<ExecutionResult> {
        if (!this.initialized || !this.agent) {
            await this.initialize();
        }

        const result = await executeCustomAgent(
            this.agentName,
            {
                query,
                variables,
                history: this.history,
                onStream,
            },
            this.options
        );

        // Add to history if successful
        if (result.success) {
            this.history.push({ role: 'user', content: query });
            this.history.push({ role: 'assistant', content: result.content });

            // Trim history to prevent context overflow (keep last 10 exchanges)
            const maxMessages = 20; // 10 exchanges = 20 messages
            if (this.history.length > maxMessages) {
                this.history = this.history.slice(-maxMessages);
            }
        }

        return result;
    }

    /**
     * Validate that a tool call would be allowed for this agent.
     */
    validateTool(toolName: string): ToolValidationResult {
        return validateToolAccess(toolName);
    }

    /**
     * Create a hardlock-guarded tool executor for this agent.
     */
    createToolExecutor() {
        return createHardlockExecutor(this.agentName);
    }
}

// ============================================================================
// Section 6: Utility Functions
// ============================================================================

/**
 * Quick execution helper - load and run agent in one call.
 *
 * **Simple explanation**: A shortcut for simple one-off queries.
 * Loads the agent, runs the query, and returns the response.
 *
 * @param agentName - Name of the agent
 * @param query - The query to run
 * @param variables - Optional prompt variables
 * @returns Execution result
 */
export async function quickExecute(
    agentName: string,
    query: string,
    variables?: PromptVariables
): Promise<ExecutionResult> {
    return executeCustomAgent(agentName, { query, variables });
}

/**
 * Check if a custom agent can be executed.
 *
 * **Simple explanation**: Pre-flight check before execution.
 * Returns true if agent exists and is active.
 *
 * @param agentName - Name of the agent to check
 * @returns True if agent can be executed
 */
export function canExecuteAgent(agentName: string): boolean {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }

    if (!customAgentExists(workspaceFolder, agentName)) {
        return false;
    }

    try {
        const agent = loadCustomAgent(workspaceFolder, agentName);
        return agent.isActive;
    } catch {
        return false;
    }
}

/**
 * Get a preview of what the system prompt would look like.
 *
 * **Simple explanation**: See what the agent's full system prompt looks like
 * with all the pieces assembled. Useful for debugging.
 *
 * @param agentName - Name of the agent
 * @param variables - Variables to substitute
 * @returns Preview of the system prompt
 */
export function previewSystemPrompt(
    agentName: string,
    variables?: PromptVariables
): string | null {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return null;
    }

    try {
        const agent = loadCustomAgent(workspaceFolder, agentName);
        return buildSystemPrompt(agent, variables || {});
    } catch {
        return null;
    }
}

// ============================================================================
// Section 7: Agent Activation/Deactivation
// ============================================================================

/**
 * Result of an activation operation.
 */
export interface ActivationResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** The agent name */
    agentName: string;
    /** The new activation state */
    isActive: boolean;
    /** Error message if operation failed */
    error?: string;
}

/**
 * Activate a custom agent.
 *
 * **Simple explanation**: Turn an agent ON so it can be used.
 * Like flipping a switch to enable the agent.
 *
 * @param agentName - Name of the agent to activate
 * @returns Result indicating success or failure
 */
export function activateAgent(agentName: string): ActivationResult {
    return setAgentActivation(agentName, true);
}

/**
 * Deactivate a custom agent.
 *
 * **Simple explanation**: Turn an agent OFF so it won't be used.
 * The agent still exists but won't receive any tasks.
 *
 * @param agentName - Name of the agent to deactivate
 * @returns Result indicating success or failure
 */
export function deactivateAgent(agentName: string): ActivationResult {
    return setAgentActivation(agentName, false);
}

/**
 * Toggle a custom agent's activation state.
 *
 * **Simple explanation**: Flip the agent's switch -
 * if it's on, turn it off; if it's off, turn it on.
 *
 * @param agentName - Name of the agent to toggle
 * @returns Result indicating success or failure with new state
 */
export function toggleAgentActivation(agentName: string): ActivationResult {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return {
            success: false,
            agentName,
            isActive: false,
            error: 'No workspace folder open',
        };
    }

    try {
        if (!customAgentExists(workspaceFolder, agentName)) {
            return {
                success: false,
                agentName,
                isActive: false,
                error: `Agent "${agentName}" not found`,
            };
        }

        const agent = loadCustomAgent(workspaceFolder, agentName);
        return setAgentActivation(agentName, !agent.isActive);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            agentName,
            isActive: false,
            error: `Failed to toggle agent: ${msg}`,
        };
    }
}

/**
 * Internal helper to set agent activation state.
 */
function setAgentActivation(agentName: string, isActive: boolean): ActivationResult {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return {
            success: false,
            agentName,
            isActive: false,
            error: 'No workspace folder open',
        };
    }

    try {
        if (!customAgentExists(workspaceFolder, agentName)) {
            return {
                success: false,
                agentName,
                isActive: false,
                error: `Agent "${agentName}" not found`,
            };
        }

        const agent = loadCustomAgent(workspaceFolder, agentName);

        // Skip if already in desired state
        if (agent.isActive === isActive) {
            logInfo(`[Custom Agent] Agent "${agentName}" already ${isActive ? 'active' : 'inactive'}`);
            return {
                success: true,
                agentName,
                isActive,
            };
        }

        // Update activation state
        const updatedAgent: CustomAgent = {
            ...agent,
            isActive,
        };

        // Save the updated agent
        saveCustomAgent(workspaceFolder, updatedAgent);

        logInfo(`[Custom Agent] ${isActive ? 'Activated' : 'Deactivated'} agent: ${agentName}`);

        return {
            success: true,
            agentName,
            isActive,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`[Custom Agent] Failed to ${isActive ? 'activate' : 'deactivate'} agent: ${msg}`);
        return {
            success: false,
            agentName,
            isActive: false,
            error: `Failed to ${isActive ? 'activate' : 'deactivate'} agent: ${msg}`,
        };
    }
}

/**
 * Get the activation status of a custom agent.
 *
 * **Simple explanation**: Check if an agent is currently ON or OFF.
 *
 * @param agentName - Name of the agent
 * @returns True if active, false otherwise (or if not found)
 */
export function isAgentActive(agentName: string): boolean {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }

    try {
        if (!customAgentExists(workspaceFolder, agentName)) {
            return false;
        }
        const agent = loadCustomAgent(workspaceFolder, agentName);
        return agent.isActive;
    } catch {
        return false;
    }
}

/**
 * Get all active custom agents.
 *
 * **Simple explanation**: List all agents that are currently ON and ready to use.
 *
 * @returns Array of active agent names
 */
export function getActiveAgents(): string[] {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return [];
    }

    try {
        return listCustomAgents(workspaceFolder, { activeOnly: true })
            .map(info => info.name);
    } catch {
        return [];
    }
}

/**
 * Get all inactive custom agents.
 *
 * **Simple explanation**: List all agents that are currently OFF.
 *
 * @returns Array of inactive agent names
 */
export function getInactiveAgents(): string[] {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return [];
    }

    try {
        const allAgents = listCustomAgents(workspaceFolder, { validOnly: true });
        return allAgents
            .filter(info => info.agent && !info.agent.isActive)
            .map(info => info.name);
    } catch {
        return [];
    }
}

/**
 * Bulk activate multiple agents.
 *
 * **Simple explanation**: Turn ON multiple agents at once.
 *
 * @param agentNames - Names of agents to activate
 * @returns Array of results for each agent
 */
export function activateAgents(agentNames: string[]): ActivationResult[] {
    return agentNames.map(name => activateAgent(name));
}

/**
 * Bulk deactivate multiple agents.
 *
 * **Simple explanation**: Turn OFF multiple agents at once.
 *
 * @param agentNames - Names of agents to deactivate
 * @returns Array of results for each agent
 */
export function deactivateAgents(agentNames: string[]): ActivationResult[] {
    return agentNames.map(name => deactivateAgent(name));
}

// ============================================================================
// Section 8: Type Exports
// ============================================================================

export { HardlockViolationError } from './hardlock';
