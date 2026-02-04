// reportTaskDone.ts
// MCP Tool: Report task completion status

import { logError, logInfo, logWarn } from '../../logger';
import { getTicket, updateTicket } from '../../services/ticketDb';
import { routeToVerificationAgent } from '../../services/orchestrator';

/**
 * Request parameters for reportTaskDone tool
 */
export interface ReportTaskDoneParams {
    taskId: string;
    status: 'done' | 'failed' | 'blocked' | 'partial';
    taskDescription?: string;
    codeDiff?: string; // Optional: code diff for verification
    notes?: string;
}

/**
 * Response for reportTaskDone tool
 */
export interface ReportTaskDoneResponse {
    success: boolean;
    taskId: string;
    status: string;
    message: string;
    verification?: {
        passed: boolean;
        explanation: string;
    };
    error?: {
        code: string;
        message: string;
    };
}

/**
 * Validate reportTaskDone parameters
 * 
 * **Simple explanation**: Make sure the caller gave us a task ID and a valid status.
 */
export function validateReportTaskDoneParams(params: any): { isValid: boolean; error?: string } {
    if (!params || typeof params !== 'object') {
        return { isValid: false, error: 'Parameters must be an object' };
    }

    if (!params.taskId || typeof params.taskId !== 'string') {
        return { isValid: false, error: 'taskId is required and must be a string' };
    }

    const validStatuses = ['done', 'failed', 'blocked', 'partial'];
    if (!params.status || !validStatuses.includes(params.status)) {
        return { isValid: false, error: `status must be one of: ${validStatuses.join(', ')}` };
    }

    if (params.codeDiff !== undefined && typeof params.codeDiff !== 'string') {
        return { isValid: false, error: 'codeDiff must be a string if provided' };
    }

    if (params.taskDescription !== undefined && typeof params.taskDescription !== 'string') {
        return { isValid: false, error: 'taskDescription must be a string if provided' };
    }

    if (params.notes !== undefined && typeof params.notes !== 'string') {
        return { isValid: false, error: 'notes must be a string if provided' };
    }

    return { isValid: true };
}

/**
 * Report a task as done/failed/blocked/partial and update the ticket
 * 
 * **Simple explanation**: This is like telling your manager, "I finished task X." It updates the
 * task status and (optionally) asks the Verification Agent to double-check the work.
 */
export async function handleReportTaskDone(params: ReportTaskDoneParams): Promise<ReportTaskDoneResponse> {
    try {
        logInfo(`[reportTaskDone] Reporting task ${params.taskId} as ${params.status}`);

        // Confirm the ticket exists
        const ticket = await getTicket(params.taskId);
        if (!ticket) {
            logWarn(`[reportTaskDone] Task not found: ${params.taskId}`);
            return {
                success: false,
                taskId: params.taskId,
                status: params.status,
                message: 'Task not found',
                error: {
                    code: 'TASK_NOT_FOUND',
                    message: `No task found with ID ${params.taskId}`
                }
            };
        }

        // Map report status to ticket status
        const statusMap: Record<string, 'done' | 'blocked' | 'in-progress'> = {
            done: 'done',
            failed: 'blocked',
            blocked: 'blocked',
            partial: 'in-progress'
        };

        const newStatus = statusMap[params.status];
        const updatedAt = new Date().toISOString();

        // Append notes to description if provided
        let newDescription = ticket.description;
        if (params.notes) {
            const prefix = newDescription ? `${newDescription}\n\n` : '';
            newDescription = `${prefix}Report Notes (${updatedAt}):\n${params.notes}`;
        }

        // Update ticket status
        await updateTicket(params.taskId, {
            status: newStatus,
            updatedAt,
            description: newDescription
        });

        let verificationResult: { passed: boolean; explanation: string } | undefined;

        // Trigger verification when marked done and a code diff is provided
        if (params.status === 'done' && params.codeDiff) {
            const taskDescription = params.taskDescription || ticket.title;
            verificationResult = await routeToVerificationAgent(taskDescription, params.codeDiff);

            if (!verificationResult.passed) {
                logWarn(`[reportTaskDone] Verification failed for ${params.taskId}, marking blocked`);
                await updateTicket(params.taskId, {
                    status: 'blocked',
                    updatedAt: new Date().toISOString()
                });
            }
        }

        return {
            success: true,
            taskId: params.taskId,
            status: params.status,
            message: `Task ${params.taskId} marked as ${params.status}`,
            verification: verificationResult
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`[reportTaskDone] Error: ${message}`);

        return {
            success: false,
            taskId: params.taskId,
            status: params.status,
            message: 'Failed to report task status',
            error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to report task status: ${message}`
            }
        };
    }
}
