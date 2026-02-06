import { z } from 'zod';

/**
 * Custom Agent Schema - Zod validation for user-created AI agents.
 *
 * **Simple explanation**: Custom agents are like creating your own specialized
 * assistant. You give it a name, instructions (system prompt), goals to work
 * towards, and checklists to follow. But it CAN'T write code - only research,
 * answer questions, and verify things.
 *
 * @see CUSTOM-AGENT-TEMPLATE.md for full documentation
 */

// ============================================================================
// Section 1: Constraint Constants
// ============================================================================

/** Maximum lengths for various fields */
export const CUSTOM_AGENT_CONSTRAINTS = {
    /** Agent name: short, unique identifier */
    NAME_MAX_LENGTH: 50,
    /** Brief description of what the agent does */
    DESCRIPTION_MAX_LENGTH: 200,
    /** System prompt containing agent instructions */
    SYSTEM_PROMPT_MAX_LENGTH: 4000,
    /** Individual goal item */
    GOAL_MAX_LENGTH: 200,
    /** Min/max goals per agent */
    GOALS_MIN: 1,
    GOALS_MAX: 20,
    /** Individual checklist item */
    CHECKLIST_ITEM_MAX_LENGTH: 150,
    /** Min/max checklist items */
    CHECKLIST_MIN: 0,
    CHECKLIST_MAX: 50,
    /** Custom list name */
    CUSTOM_LIST_NAME_MAX_LENGTH: 50,
    /** Custom list description */
    CUSTOM_LIST_DESCRIPTION_MAX_LENGTH: 200,
    /** Individual item in a custom list */
    CUSTOM_LIST_ITEM_MAX_LENGTH: 200,
    /** Min/max items per custom list */
    CUSTOM_LIST_ITEMS_MIN: 1,
    CUSTOM_LIST_ITEMS_MAX: 100,
    /** Max number of custom lists (0-7) */
    CUSTOM_LISTS_MAX: 7,
    /** Author name */
    AUTHOR_MAX_LENGTH: 100,
    /** Tag name */
    TAG_MAX_LENGTH: 30,
    /** Max number of tags */
    TAGS_MAX: 10,
} as const;

// ============================================================================
// Section 2: Reserved Names
// ============================================================================

/**
 * Names reserved for built-in agents - cannot be used for custom agents.
 *
 * **Simple explanation**: These are "taken" names, like usernames that
 * already exist. You can't create a custom agent called "planning" because
 * there's already a Planning Team.
 */
export const RESERVED_AGENT_NAMES = [
    'planning',
    'orchestrator',
    'answer',
    'verification',
    'clarity',
    'research',
    'boss',
    'coding',
    'system',
    'admin',
] as const;

export type ReservedAgentName = (typeof RESERVED_AGENT_NAMES)[number];

// ============================================================================
// Section 3: Allowed Tools (Hardlock)
// ============================================================================

/**
 * Tools that custom agents ARE allowed to use (read-only operations).
 *
 * **Simple explanation**: Custom agents can READ and SEARCH but NOT WRITE.
 * Think of it like giving someone library card access but not editing rights.
 */
export const CUSTOM_AGENT_ALLOWED_TOOLS = [
    'read_file',
    'grep_search',
    'semantic_search',
    'file_search',
    'list_dir',
    'get_errors',
    'ask_questions',
] as const;

export type AllowedTool = (typeof CUSTOM_AGENT_ALLOWED_TOOLS)[number];

/**
 * Tools that are BLOCKED for custom agents (write operations).
 *
 * **Simple explanation**: These tools can modify code, so they're off-limits
 * for custom agents. If a custom agent needs something written, it creates
 * a ticket for the Programming team instead.
 */
export const CUSTOM_AGENT_BLOCKED_TOOLS = [
    'create_file',
    'replace_string_in_file',
    'multi_replace_string_in_file',
    'run_in_terminal',
    'runTests',
] as const;

export type BlockedTool = (typeof CUSTOM_AGENT_BLOCKED_TOOLS)[number];

// ============================================================================
// Section 4: Variable Substitution
// ============================================================================

/**
 * Built-in variables that can be used in system prompts with {{variable}} syntax.
 *
 * **Simple explanation**: These are placeholders that get replaced with real
 * values when the agent runs. Like mail merge - {{user_name}} becomes "Alice".
 */
export const SYSTEM_PROMPT_VARIABLES = [
    'task_id',
    'ticket_id',
    'user_query',
    'file_path',
    'selection',
    'project_name',
    'current_date',
    'current_time',
] as const;

export type SystemPromptVariable = (typeof SYSTEM_PROMPT_VARIABLES)[number];

// ============================================================================
// Section 5: Priority Enum
// ============================================================================

/**
 * Agent priority levels for task routing.
 *
 * **Simple explanation**: Higher priority agents get called first when
 * multiple agents could handle a task. P0 = critical, P3 = nice-to-have.
 */
export const AgentPriority = z.enum(['P0', 'P1', 'P2', 'P3']);
export type AgentPriorityType = z.infer<typeof AgentPriority>;

// ============================================================================
// Section 6: Custom List Schema
// ============================================================================

/**
 * Schema for a custom list within an agent.
 *
 * **Simple explanation**: Custom lists let you organize any kind of data -
 * "Coding Standards", "Review Checklist", "Common Errors", etc.
 */
export const CustomListSchema = z.object({
    /** Unique identifier for the list */
    name: z
        .string()
        .min(1, 'List name is required')
        .max(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_NAME_MAX_LENGTH, 
            `List name must be ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_NAME_MAX_LENGTH} characters or less`),
    /** What this list is for */
    description: z
        .string()
        .max(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_DESCRIPTION_MAX_LENGTH,
            `List description must be ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_DESCRIPTION_MAX_LENGTH} characters or less`)
        .default(''),
    /** Items in the list */
    items: z
        .array(
            z.string()
                .min(1, 'List item cannot be empty')
                .max(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEM_MAX_LENGTH,
                    `List item must be ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEM_MAX_LENGTH} characters or less`)
        )
        .min(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MIN, 
            `List must have at least ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MIN} item`)
        .max(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MAX,
            `List can have at most ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MAX} items`),
    /** Display order (lower = first) */
    order: z.number().int().min(0).default(0),
    /** UI collapsed state */
    collapsed: z.boolean().default(false),
});

export type CustomList = z.infer<typeof CustomListSchema>;

// ============================================================================
// Section 7: Routing Rules Schema
// ============================================================================

/**
 * Schema for agent routing rules.
 *
 * **Simple explanation**: Routing rules tell the system when to use this agent.
 * "If the ticket has keyword 'documentation', use this Documentation Agent."
 */
export const RoutingRuleSchema = z.object({
    /** Keywords that trigger this agent (case-insensitive) */
    keywords: z.array(z.string().min(1).max(50)).default([]),
    /** Regex patterns for advanced matching */
    patterns: z.array(z.string()).default([]),
    /** Ticket tags that trigger this agent */
    tags: z.array(z.string().min(1).max(30)).default([]),
    /** Ticket types this agent handles */
    ticketTypes: z.array(z.enum(['ai_to_human', 'human_to_ai', 'internal'])).default([]),
    /** Priority boost when routing conditions match (-2 to +2) */
    priorityBoost: z.number().int().min(-2).max(2).default(0),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

// ============================================================================
// Section 8: Agent Metadata Schema
// ============================================================================

/**
 * Schema for agent metadata (optional tracking fields).
 *
 * **Simple explanation**: Metadata is like a book's cover information -
 * who wrote it, what version, when it was created.
 */
export const AgentMetadataSchema = z.object({
    /** Who created this agent */
    author: z
        .string()
        .max(CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH)
        .optional(),
    /** Semantic version (e.g., "1.0.0") */
    version: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., 1.0.0)')
        .default('1.0.0'),
    /** When this agent was created */
    createdAt: z
        .string()
        .datetime()
        .optional(),
    /** When this agent was last modified */
    updatedAt: z
        .string()
        .datetime()
        .optional(),
    /** Categorization tags */
    tags: z
        .array(
            z.string()
                .min(1)
                .max(CUSTOM_AGENT_CONSTRAINTS.TAG_MAX_LENGTH)
        )
        .max(CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX)
        .default([]),
});

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

// ============================================================================
// Section 9: Full Custom Agent Schema
// ============================================================================

/**
 * Complete schema for a custom AI agent.
 *
 * **Simple explanation**: This is the complete blueprint for creating a
 * custom agent. Every custom agent must follow these rules to be valid.
 */
export const CustomAgentSchema = z.object({
    // -------------------- Required Fields --------------------
    
    /** Unique agent identifier (no spaces, lowercase, no reserved names) */
    name: z
        .string()
        .min(1, 'Agent name is required')
        .max(CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH,
            `Agent name must be ${CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH} characters or less`)
        .regex(/^[a-z][a-z0-9-]*$/, 
            'Agent name must start with a letter, contain only lowercase letters, numbers, and hyphens')
        .refine(
            (name) => !RESERVED_AGENT_NAMES.includes(name as ReservedAgentName),
            (name) => ({ message: `"${name}" is a reserved agent name` })
        ),

    /** Human-readable description of what this agent does */
    description: z
        .string()
        .min(1, 'Description is required')
        .max(CUSTOM_AGENT_CONSTRAINTS.DESCRIPTION_MAX_LENGTH,
            `Description must be ${CUSTOM_AGENT_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters or less`),

    /** The system prompt / instructions for the LLM */
    systemPrompt: z
        .string()
        .min(10, 'System prompt must be at least 10 characters')
        .max(CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH,
            `System prompt must be ${CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH} characters or less`),

    /** Goals this agent works towards */
    goals: z
        .array(
            z.string()
                .min(1, 'Goal cannot be empty')
                .max(CUSTOM_AGENT_CONSTRAINTS.GOAL_MAX_LENGTH,
                    `Each goal must be ${CUSTOM_AGENT_CONSTRAINTS.GOAL_MAX_LENGTH} characters or less`)
        )
        .min(CUSTOM_AGENT_CONSTRAINTS.GOALS_MIN, 
            `Agent must have at least ${CUSTOM_AGENT_CONSTRAINTS.GOALS_MIN} goal`)
        .max(CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX,
            `Agent can have at most ${CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX} goals`),

    // -------------------- Optional Fields --------------------

    /** Checklist items for the agent to follow */
    checklist: z
        .array(
            z.string()
                .min(1, 'Checklist item cannot be empty')
                .max(CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_ITEM_MAX_LENGTH,
                    `Each checklist item must be ${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_ITEM_MAX_LENGTH} characters or less`)
        )
        .max(CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX,
            `Checklist can have at most ${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX} items`)
        .default([]),

    /** Custom lists (up to 7) */
    customLists: z
        .array(CustomListSchema)
        .max(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX,
            `Cannot have more than ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX} custom lists`)
        .default([])
        .refine(
            (lists) => {
                const names = lists.map(l => l.name.toLowerCase());
                return names.length === new Set(names).size;
            },
            { message: 'Custom list names must be unique' }
        ),

    /** Agent priority for task routing */
    priority: AgentPriority.default('P2'),

    /** Routing rules for automatic agent selection */
    routing: RoutingRuleSchema.default({}),

    /** Agent metadata */
    metadata: AgentMetadataSchema.default({}),

    /** Whether this agent is currently active */
    isActive: z.boolean().default(true),

    /** Timeout for agent responses (seconds) */
    timeoutSeconds: z.number().int().min(10).max(300).default(60),

    /** Maximum tokens for LLM response */
    maxTokens: z.number().int().min(256).max(4096).default(2048),

    /** Temperature for LLM (lower = more deterministic) */
    temperature: z.number().min(0).max(2).default(0.7),
});

export type CustomAgent = z.infer<typeof CustomAgentSchema>;

// ============================================================================
// Section 10: Validation Helpers
// ============================================================================

/**
 * Validate a custom agent configuration.
 *
 * **Simple explanation**: Check if an agent config follows all the rules.
 * Returns either the validated config or a list of what's wrong.
 *
 * @param config - The agent configuration to validate
 * @returns Validation result with success flag and data or errors
 */
export function validateCustomAgent(config: unknown): {
    success: boolean;
    data?: CustomAgent;
    errors?: z.ZodError;
} {
    const result = CustomAgentSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
}

/**
 * Check if an agent name is valid and available.
 *
 * **Simple explanation**: Is this name okay to use? Not reserved, not too long,
 * follows the naming rules?
 *
 * @param name - The proposed agent name
 * @returns Validation result with valid flag and optional error message
 */
export function validateAgentName(name: string): {
    valid: boolean;
    error?: string;
} {
    // Check reserved names
    if (RESERVED_AGENT_NAMES.includes(name.toLowerCase() as ReservedAgentName)) {
        return { valid: false, error: `"${name}" is a reserved agent name` };
    }

    // Check length
    if (name.length === 0) {
        return { valid: false, error: 'Agent name is required' };
    }
    if (name.length > CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH) {
        return { 
            valid: false, 
            error: `Agent name must be ${CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH} characters or less`
        };
    }

    // Check format (lowercase, starts with letter, only letters/numbers/hyphens)
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        return { 
            valid: false, 
            error: 'Agent name must start with a letter, contain only lowercase letters, numbers, and hyphens'
        };
    }

    return { valid: true };
}

/**
 * Extract all {{variable}} references from a system prompt.
 *
 * **Simple explanation**: Find all the placeholders in the prompt that need
 * to be filled in with real values.
 *
 * @param systemPrompt - The system prompt to scan
 * @returns Array of variable names found (without the {{ }})
 */
export function extractPromptVariables(systemPrompt: string): string[] {
    const matches = systemPrompt.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g);
    if (!matches) {
        return [];
    }
    // Remove {{ and }} and deduplicate
    const variables = matches.map(m => m.slice(2, -2));
    return [...new Set(variables)];
}

/**
 * Validate that all variables in a prompt are recognized.
 *
 * **Simple explanation**: Make sure all the placeholders in the prompt
 * are ones we know how to fill in.
 *
 * @param systemPrompt - The system prompt to validate
 * @returns Validation result with unknownVariables if any found
 */
export function validatePromptVariables(systemPrompt: string): {
    valid: boolean;
    unknownVariables?: string[];
} {
    const usedVariables = extractPromptVariables(systemPrompt);
    const unknownVariables = usedVariables.filter(
        v => !SYSTEM_PROMPT_VARIABLES.includes(v as SystemPromptVariable)
    );

    if (unknownVariables.length > 0) {
        return { valid: false, unknownVariables };
    }
    return { valid: true };
}

/**
 * Create a default custom agent template.
 *
 * **Simple explanation**: A starter template with all the required fields
 * filled in with placeholder values.
 *
 * @param name - The agent name
 * @returns A valid CustomAgent with default values
 */
export function createDefaultAgentTemplate(name: string): CustomAgent {
    return {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        description: 'A custom AI agent',
        systemPrompt: `You are a helpful assistant named ${name}.

Your goals:
{{goals}}

When responding:
1. Be clear and concise
2. Reference relevant documentation when available
3. If unsure, say so rather than guessing

Current task: {{user_query}}`,
        goals: ['Help users with their questions'],
        checklist: [],
        customLists: [],
        priority: 'P2',
        routing: {
            keywords: [],
            patterns: [],
            tags: [],
            ticketTypes: [],
            priorityBoost: 0,
        },
        metadata: {
            version: '1.0.0',
            tags: [],
        },
        isActive: true,
        timeoutSeconds: 60,
        maxTokens: 2048,
        temperature: 0.7,
    };
}

// ============================================================================
// Section 11: Type Guards
// ============================================================================

/**
 * Type guard to check if a tool is allowed for custom agents.
 *
 * **Simple explanation**: Is this tool on the "safe" list?
 */
export function isAllowedTool(tool: string): tool is AllowedTool {
    return CUSTOM_AGENT_ALLOWED_TOOLS.includes(tool as AllowedTool);
}

/**
 * Type guard to check if a tool is blocked for custom agents.
 *
 * **Simple explanation**: Is this tool on the "blocked" list?
 */
export function isBlockedTool(tool: string): tool is BlockedTool {
    return CUSTOM_AGENT_BLOCKED_TOOLS.includes(tool as BlockedTool);
}
