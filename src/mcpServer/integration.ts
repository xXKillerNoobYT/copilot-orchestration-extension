// integration.ts
// MCP tool registry and integration helpers

import { logInfo } from '../logger';

/**
 * MCP tool registration metadata
 */
export interface MCPToolRegistration {
    name: string;
    description: string;
}

const REGISTERED_TOOLS: MCPToolRegistration[] = [
    {
        name: 'getNextTask',
        description: 'Retrieve the next available task with optional filters'
    },
    {
        name: 'reportTaskDone',
        description: 'Report task completion status and trigger verification'
    },
    {
        name: 'askQuestion',
        description: 'Ask the Answer Agent a question with timeout handling'
    },
    {
        name: 'getErrors',
        description: 'Get quality gate diagnostics (TypeScript errors, skipped tests, coverage warnings)'
    }
];

/**
 * Get all registered MCP tools
 * 
 * **Simple explanation**: This is a list of all the tools our MCP server knows about.
 */
export function getRegisteredTools(): MCPToolRegistration[] {
    return [...REGISTERED_TOOLS];
}

/**
 * Log the registered tool list (used during server startup)
 * 
 * **Simple explanation**: Prints the tool list so we can see what the server exposes.
 */
export function logRegisteredTools(): void {
    const toolNames = REGISTERED_TOOLS.map((tool) => tool.name).join(', ');
    logInfo(`MCP registered tools: ${toolNames}`);
}
