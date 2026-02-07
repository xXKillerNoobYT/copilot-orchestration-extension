/**
 * Variable Substitution Engine for Custom Agents
 *
 * Replaces {{variable}} placeholders with actual values at runtime.
 *
 * **Simple explanation**: Like mail merge - replace {{name}} with "John" in a letter.
 * Agents can use {{task_id}}, {{ticket_id}}, etc to reference execution context.
 *
 * @module agents/custom/variables
 */

/**
 * Context object provided during agent execution
 *
 * **Simple explanation**: The data available when the agent runs.
 */
export interface SubstitutionContext {
    task_id?: string;
    ticket_id?: string;
    query?: string;
    user_id?: string;
    timestamp?: string;
    [key: string]: string | undefined;
}

/**
 * Find all {{variable}} placeholders in text
 *
 * **Simple explanation**: Scan text and find all {{...}} patterns
 */
export function findVariables(text: string): string[] {
    const pattern = /\{\{(\w+)\}\}/g;
    const matches: string[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
            matches.push(match[1]);
        }
    }

    return [...new Set(matches)]; // dedup
}

/**
 * Validate that all variables in text are available in context
 *
 * **Simple explanation**: Check if all {{variables}} can be replaced
 */
export function validateVariables(
    text: string,
    context: SubstitutionContext
): { valid: boolean; missing: string[] } {
    const required = findVariables(text);
    const missing = required.filter(v => context[v] === undefined);

    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * Replace all {{variable}} placeholders with values from context
 *
 * **Simple explanation**: Do the mail merge - replace all {{...}} with actual data
 */
export function substituteVariables(
    text: string,
    context: SubstitutionContext
): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
        return context[variable] ?? match; // Keep placeholder if not found
    });
}

/**
 * Available variables that can be used in agent prompts
 *
 * **Simple explanation**: The list of {{variables}} agents can use
 */
export const AVAILABLE_VARIABLES = [
    'task_id',
    'ticket_id',
    'query',
    'user_id',
    'timestamp',
    'agent_name',
    'agent_version'
] as const;

/**
 * Get documentation for a specific variable
 *
 * **Simple explanation**: What does {{task_id}} mean and when is it available?
 */
export function getVariableDefinition(variable: string): { description: string; example: string } | null {
    const definitions: Record<string, { description: string; example: string }> = {
        task_id: {
            description: 'Unique identifier for the current task',
            example: 'task_12345'
        },
        ticket_id: {
            description: 'Unique identifier for the ticket being processed',
            example: 'TICKET-001'
        },
        query: {
            description: 'The user query or question being answered',
            example: 'How do I install Node.js?'
        },
        user_id: {
            description: 'ID of the user who created the task',
            example: 'user_789'
        },
        timestamp: {
            description: 'Current timestamp when agent runs',
            example: '2026-02-07T10:30:00Z'
        },
        agent_name: {
            description: 'Name of the current agent',
            example: 'research-assistant'
        },
        agent_version: {
            description: 'Version of the current agent',
            example: '1.2.3'
        }
    };

    return definitions[variable] ?? null;
}

/**
 * Create a mock context for testing/preview
 *
 * **Simple explanation**: Generate sample data for testing variables
 */
export function createMockContext(overrides?: Partial<SubstitutionContext>): SubstitutionContext {
    const now = new Date().toISOString();
    return {
        task_id: 'task_demo_12345',
        ticket_id: 'DEMO-001',
        query: 'What is the quickest way to learn TypeScript?',
        user_id: 'user_demo',
        timestamp: now,
        agent_name: 'demo-agent',
        agent_version: '1.0.0',
        ...overrides
    };
}

/**
 * Create context from execution parameters
 *
 * **Simple explanation**: How to build the substitution context from actual data
 */
export function createContextFromExecution(params: {
    taskId?: string;
    ticketId?: string;
    userQuery?: string;
    userId?: string;
    agentName?: string;
    agentVersion?: string;
}): SubstitutionContext {
    return {
        task_id: params.taskId,
        ticket_id: params.ticketId,
        query: params.userQuery,
        user_id: params.userId,
        timestamp: new Date().toISOString(),
        agent_name: params.agentName,
        agent_version: params.agentVersion
    };
}

/**
 * Safely substitute variables, handling missing ones gracefully
 *
 * **Simple explanation**: Replace what we can, warn about what we can't
 */
export function safeSubstitute(
    text: string,
    context: SubstitutionContext
): { result: string; warnings: string[] } {
    const validation = validateVariables(text, context);
    const result = substituteVariables(text, context);
    const warnings = validation.missing.length > 0
        ? [`Missing variables: ${validation.missing.join(', ')}`]
        : [];

    return { result, warnings };
}
