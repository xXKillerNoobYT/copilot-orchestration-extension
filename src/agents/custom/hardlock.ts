import {
    CUSTOM_AGENT_ALLOWED_TOOLS,
    CUSTOM_AGENT_BLOCKED_TOOLS,
    isAllowedTool,
    isBlockedTool,
    type AllowedTool,
    type BlockedTool,
} from './schema';

/**
 * Custom Agent Hardlock - Enforces coding restrictions on custom agents.
 *
 * **Simple explanation**: Custom agents are "read-only" assistants. They can
 * look at files, search code, and answer questions - but they CANNOT write
 * code, modify files, or run commands. If they need something written, they
 * create a ticket for the Programming team instead.
 *
 * This is a SECURITY BOUNDARY. Custom agents are user-defined and could
 * potentially contain malicious instructions if they had write access.
 *
 * @see CUSTOM-AGENT-TEMPLATE.md for full documentation
 */

// ============================================================================
// Section 1: Hardlock Error Types
// ============================================================================

/**
 * Error thrown when a custom agent attempts to use a blocked tool.
 *
 * **Simple explanation**: This error says "Stop! You can't do that!" when
 * a custom agent tries to write code or modify files.
 */
export class HardlockViolationError extends Error {
    public readonly code = 'HARDLOCK_VIOLATION';
    public readonly tool: string;
    public readonly agentName: string;

    constructor(tool: string, agentName: string) {
        const message = `Custom agent "${agentName}" attempted to use blocked tool "${tool}". ` +
            `Custom agents can only use read-only tools. ` +
            `If this operation is needed, escalate to the Planning or Programming team.`;
        super(message);
        this.name = 'HardlockViolationError';
        this.tool = tool;
        this.agentName = agentName;
    }

    /**
     * Get a user-friendly error message suitable for display.
     */
    getUserMessage(): string {
        return `🚫 Action blocked: "${this.tool}" is not available for custom agents.\n\n` +
            `Custom agents can only read and search - they cannot modify code.\n\n` +
            `💡 Solution: Create a ticket for the Programming team to handle this operation.`;
    }

    /**
     * Get a suggestion for what to do instead.
     */
    getSuggestion(): string {
        const toolSuggestions: Record<string, string> = {
            create_file: 'Create a ticket with the file contents you need created',
            replace_string_in_file: 'Create a ticket describing the code change needed',
            multi_replace_string_in_file: 'Create a ticket with all the changes needed',
            run_in_terminal: 'Create a ticket with the command that needs to be run',
            runTests: 'Use get_errors to check for compile errors instead',
        };

        return toolSuggestions[this.tool] || 
            'Create a ticket describing what you need done';
    }
}

// ============================================================================
// Section 2: Tool Validation
// ============================================================================

/**
 * Result of validating a tool call.
 */
export interface ToolValidationResult {
    allowed: boolean;
    tool: string;
    reason?: string;
    suggestion?: string;
}

/**
 * Validate whether a tool call is allowed for a custom agent.
 *
 * **Simple explanation**: Check if the tool is on the "safe" list.
 * Returns details about why it's allowed or blocked.
 *
 * @param tool - The tool name to validate
 * @returns Validation result with allowed status and details
 */
export function validateToolAccess(tool: string): ToolValidationResult {
    // Check if explicitly allowed
    if (isAllowedTool(tool)) {
        return {
            allowed: true,
            tool,
            reason: `"${tool}" is on the allowed tools list`,
        };
    }

    // Check if explicitly blocked
    if (isBlockedTool(tool)) {
        const suggestions: Record<string, string> = {
            create_file: 'Use ask_questions to request file creation',
            replace_string_in_file: 'Create a ticket with the code change',
            multi_replace_string_in_file: 'Create a ticket with all changes needed',
            run_in_terminal: 'Create a ticket for command execution',
            runTests: 'Use get_errors for compile-time checking',
        };

        return {
            allowed: false,
            tool,
            reason: `"${tool}" is a write operation and blocked for custom agents`,
            suggestion: suggestions[tool] || 'Create a ticket for this operation',
        };
    }

    // Unknown tool - block by default (whitelist approach)
    return {
        allowed: false,
        tool,
        reason: `"${tool}" is not on the allowed tools list`,
        suggestion: 'Only known read-only tools are permitted',
    };
}

/**
 * Assert that a tool is allowed for custom agents.
 * Throws HardlockViolationError if blocked.
 *
 * **Simple explanation**: Call this before executing any tool. If the tool
 * is blocked, it throws an error that stops execution.
 *
 * @param tool - The tool name to check
 * @param agentName - The custom agent attempting to use it
 * @throws HardlockViolationError if tool is blocked
 */
export function assertToolAllowed(tool: string, agentName: string): void {
    const result = validateToolAccess(tool);
    if (!result.allowed) {
        throw new HardlockViolationError(tool, agentName);
    }
}

// ============================================================================
// Section 3: Tool List Utilities
// ============================================================================

/**
 * Get a formatted list of allowed tools for display.
 *
 * **Simple explanation**: Get a nice list of tools the agent CAN use.
 */
export function getAllowedToolsList(): string {
    return CUSTOM_AGENT_ALLOWED_TOOLS.map(tool => `• ${tool}`).join('\n');
}

/**
 * Get a formatted list of blocked tools for display.
 *
 * **Simple explanation**: Get a list of tools the agent CANNOT use.
 */
export function getBlockedToolsList(): string {
    return CUSTOM_AGENT_BLOCKED_TOOLS.map(tool => `• ${tool}`).join('\n');
}

/**
 * Get a complete hardlock policy description.
 *
 * **Simple explanation**: Get a full explanation of what custom agents
 * can and cannot do, suitable for including in system prompts.
 */
export function getHardlockPolicyDescription(): string {
    return `## Custom Agent Permissions

**IMPORTANT: You are a CUSTOM AGENT with LIMITED permissions.**

### ✅ ALLOWED Operations (Read-Only)
${getAllowedToolsList()}

### ❌ BLOCKED Operations (Write/Execute)
${getBlockedToolsList()}

### What to do when you need a blocked operation:
1. **DO NOT** attempt to use blocked tools - it will fail
2. **DO** use \`ask_questions\` to create a ticket explaining what you need
3. **DO** be specific about what code changes or commands are required
4. The Planning or Programming team will handle the operation

### Why this restriction exists:
- Custom agents are user-defined and could contain instructions we can't fully verify
- This hardlock ensures custom agents cannot modify code without human oversight
- It's a security boundary, not a limitation of your capabilities
`;
}

// ============================================================================
// Section 4: Hardlock Guard
// ============================================================================

/**
 * A guard function that wraps tool execution with hardlock checks.
 *
 * **Simple explanation**: This wraps around tool calls to intercept
 * and block any blocked operations before they execute.
 *
 * @param agentName - The custom agent name
 * @param toolName - The tool being called
 * @param executor - The function that actually runs the tool
 * @returns The tool's result if allowed
 * @throws HardlockViolationError if tool is blocked
 */
export async function withHardlockGuard<T>(
    agentName: string,
    toolName: string,
    executor: () => Promise<T>
): Promise<T> {
    // Check if tool is allowed BEFORE executing
    assertToolAllowed(toolName, agentName);
    
    // Execute the tool
    return executor();
}

/**
 * Create a hardlock-aware tool executor for a specific agent.
 *
 * **Simple explanation**: Creates a "gatekeeper" that checks every tool
 * call for a specific agent. Use this to wrap all tool calls.
 *
 * @param agentName - The custom agent this executor is for
 * @returns A function that wraps tool execution with hardlock checks
 */
export function createHardlockExecutor(agentName: string) {
    return async function executeTool<T>(
        toolName: string,
        executor: () => Promise<T>
    ): Promise<T> {
        return withHardlockGuard(agentName, toolName, executor);
    };
}

// ============================================================================
// Section 5: Validation for Tool Lists
// ============================================================================

/**
 * Validate a list of tools against the hardlock policy.
 *
 * **Simple explanation**: Check a bunch of tools at once and get a report
 * of which are allowed and which are blocked.
 *
 * @param tools - Array of tool names to validate
 * @returns Analysis of allowed and blocked tools
 */
export function validateToolList(tools: string[]): {
    allowed: string[];
    blocked: string[];
    unknown: string[];
    allAllowed: boolean;
} {
    const allowed: string[] = [];
    const blocked: string[] = [];
    const unknown: string[] = [];

    for (const tool of tools) {
        if (isAllowedTool(tool)) {
            allowed.push(tool);
        } else if (isBlockedTool(tool)) {
            blocked.push(tool);
        } else {
            unknown.push(tool);
        }
    }

    return {
        allowed,
        blocked,
        unknown,
        allAllowed: blocked.length === 0 && unknown.length === 0,
    };
}

// ============================================================================
// Section 6: Escalation Helpers
// ============================================================================

/**
 * Generate an escalation ticket description for a blocked operation.
 *
 * **Simple explanation**: When a custom agent can't do something, this
 * creates a clear description for a ticket asking someone else to do it.
 *
 * @param agentName - The custom agent that hit the block
 * @param tool - The blocked tool
 * @param context - What the agent was trying to do
 * @returns Formatted ticket description
 */
export function generateEscalationDescription(
    agentName: string,
    tool: string,
    context: string
): string {
    return `## Escalation from Custom Agent: ${agentName}

### Blocked Operation
- **Tool**: \`${tool}\`
- **Reason**: Custom agents cannot use write/execute operations

### Context
${context}

### What's Needed
This operation requires elevated permissions. A Planning or Programming team member needs to:
1. Review the requested operation
2. Determine if it's safe and appropriate
3. Execute the operation if approved

### Original Agent
- Name: ${agentName}
- Type: Custom Agent (read-only)
`;
}

// ============================================================================
// Section 7: Type Exports
// ============================================================================

export type { AllowedTool, BlockedTool };
