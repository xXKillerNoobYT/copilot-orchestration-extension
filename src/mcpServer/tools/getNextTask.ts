// getNextTask.ts
// MCP Tool: Get next task from queue with filtering and context

import { logInfo, logWarn, logError } from '../../logger';
import { getNextTask as orchestratorGetNextTask } from '../../services/orchestrator';

/**
 * Request parameters for getNextTask tool
 */
export interface GetNextTaskParams {
    filter?: 'ready' | 'blocked' | 'all';     // Filter by task status (default: 'ready')
    includeContext?: boolean;                  // Include task context (default: true)
}

/**
 * Response from getNextTask tool
 */
export interface GetNextTaskResponse {
    success: boolean;
    task: any | null;                          // Task object or null if queue empty
    queueStatus?: {
        isEmpty: boolean;
        message?: string;
    };
    error?: {
        code: string;
        message: string;
    };
}

/**
 * Get the next task from the orchestrator queue
 * 
 * **Simple explanation**: Like asking "What's the next item on my to-do list?"
 * This function retrieves the next task that needs to be worked on.
 * 
 * @param params Optional parameters for filtering and context
 * @returns GetNextTaskResponse with task data or error information
 */
export async function handleGetNextTask(params?: GetNextTaskParams): Promise<GetNextTaskResponse> {
    try {
        logInfo(`[getNextTask] Fetching next task with params: ${JSON.stringify(params || {})}`);

        // Set defaults
        const filter = params?.filter || 'ready';
        const includeContext = params?.includeContext !== false; // Default true

        // Validate filter parameter
        const validFilters = ['ready', 'blocked', 'all'];
        if (!validFilters.includes(filter)) {
            logWarn(`[getNextTask] Invalid filter: ${filter}`);
            return {
                success: false,
                task: null,
                error: {
                    code: 'INVALID_FILTER',
                    message: `Invalid filter '${filter}'. Valid options: ${validFilters.join(', ')}`
                }
            };
        }

        // Get next task from orchestrator
        const task = await orchestratorGetNextTask();

        // Handle empty queue
        if (!task) {
            logInfo('[getNextTask] Queue is empty');
            return {
                success: true,
                task: null,
                queueStatus: {
                    isEmpty: true,
                    message: 'No tasks available in queue'
                }
            };
        }

        // Apply filter logic
        // Note: Currently the orchestrator returns ready tasks only
        // This is a placeholder for future filtering implementation
        if (filter === 'blocked') {
            logInfo('[getNextTask] Blocked filter requested but task returned - returning empty');
            return {
                success: true,
                task: null,
                queueStatus: {
                    isEmpty: true,
                    message: 'No blocked tasks available (orchestrator returns ready tasks only)'
                }
            };
        }

        // Optionally strip context if not requested
        let responseTask = task;
        if (!includeContext) {
            // Return minimal task info without context
            responseTask = {
                id: task.id,
                ticketId: task.ticketId,
                title: task.title,
                status: task.status,
                createdAt: task.createdAt
            };
            logInfo('[getNextTask] Context excluded from response');
        }

        logInfo(`[getNextTask] Returning task: ${task.id}`);
        return {
            success: true,
            task: responseTask,
            queueStatus: {
                isEmpty: false
            }
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`[getNextTask] Error: ${errorMessage}`);

        // Handle specific error cases
        if (errorMessage.includes('not initialized')) {
            return {
                success: false,
                task: null,
                error: {
                    code: 'ORCHESTRATOR_NOT_INITIALIZED',
                    message: 'Orchestrator service is not initialized. Please ensure the extension is fully activated.'
                }
            };
        }

        // Generic error response
        return {
            success: false,
            task: null,
            error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to get next task: ${errorMessage}`
            }
        };
    }
}

/**
 * Validate getNextTask parameters
 * 
 * **Simple explanation**: Check if the parameters make sense before trying to use them
 * 
 * @param params Parameters to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateGetNextTaskParams(params: any): { isValid: boolean; error?: string } {
    if (!params) {
        return { isValid: true }; // No params is fine (use defaults)
    }

    if (typeof params !== 'object') {
        return {
            isValid: false,
            error: 'Parameters must be an object'
        };
    }

    // Validate filter if provided
    if (params.filter !== undefined) {
        const validFilters = ['ready', 'blocked', 'all'];
        if (!validFilters.includes(params.filter)) {
            return {
                isValid: false,
                error: `Invalid filter '${params.filter}'. Valid options: ${validFilters.join(', ')}`
            };
        }
    }

    // Validate includeContext if provided
    if (params.includeContext !== undefined && typeof params.includeContext !== 'boolean') {
        return {
            isValid: false,
            error: 'includeContext must be a boolean'
        };
    }

    return { isValid: true };
}
