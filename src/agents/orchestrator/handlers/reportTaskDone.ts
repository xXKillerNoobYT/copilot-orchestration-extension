/**
 * Orchestrator MCP Handler: reportTaskDone
 * 
 * **Simple explanation**: This handler processes task completion reports,
 * triggers verification, and handles the workflow after coding is done.
 * 
 * @module agents/orchestrator/handlers/reportTaskDone
 */

import { logInfo, logWarn, logError } from '../../../logger';
import { getTaskQueueInstance } from '../../../services/taskQueue';

/**
 * Task completion report from Coding AI
 */
export interface TaskCompletionReport {
    /** Task ID */
    taskId: string;
    /** Files modified/created */
    modifiedFiles: string[];
    /** Summary of changes */
    summary: string;
    /** Self-assessment (0-100) */
    confidence?: number;
    /** Any issues encountered */
    issues?: string[];
    /** Actual time spent (minutes) */
    actualMinutes?: number;
}

/**
 * reportTaskDone response
 */
export interface ReportTaskDoneResponse {
    /** Whether the report was accepted */
    accepted: boolean;
    /** Next step in workflow */
    nextStep: 'verification' | 'done' | 'investigation' | 'retry';
    /** Message */
    message: string;
    /** Task status after processing */
    newStatus: string;
}

/**
 * Handler configuration
 */
export interface ReportTaskDoneConfig {
    /** Minimum confidence for auto-pass */
    minConfidenceForAutoPass: number;
    /** Require modified files list */
    requireModifiedFiles: boolean;
}

const DEFAULT_CONFIG: ReportTaskDoneConfig = {
    minConfidenceForAutoPass: 95,
    requireModifiedFiles: true
};

/**
 * Handle task completion report from Coding AI
 * 
 * @param report - Task completion report
 * @param config - Handler configuration
 * @returns Processing result
 */
export async function handleReportTaskDone(
    report: TaskCompletionReport,
    config: Partial<ReportTaskDoneConfig> = {}
): Promise<ReportTaskDoneResponse> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    logInfo(`[ReportTaskDone] Processing completion for task ${report.taskId}`);

    try {
        // Validate report
        const validationError = validateReport(report, cfg);
        if (validationError) {
            logWarn(`[ReportTaskDone] Validation failed: ${validationError}`);
            return {
                accepted: false,
                nextStep: 'retry',
                message: validationError,
                newStatus: 'running'
            };
        }

        const taskQueue = getTaskQueueInstance();

        // Check task exists and is running
        const task = taskQueue.getTask(report.taskId);
        if (!task) {
            return {
                accepted: false,
                nextStep: 'retry',
                message: `Task ${report.taskId} not found`,
                newStatus: 'unknown'
            };
        }

        if (task.status !== 'running') {
            return {
                accepted: false,
                nextStep: 'retry',
                message: `Task ${report.taskId} is not running (status: ${task.status})`,
                newStatus: task.status
            };
        }

        // Store completion data in task metadata
        const result = {
            modifiedFiles: report.modifiedFiles,
            summary: report.summary,
            confidence: report.confidence,
            issues: report.issues,
            completedAt: new Date().toISOString()
        };

        // Complete the task
        taskQueue.completeTask(report.taskId, result);

        // Check if high confidence allows auto-pass
        if (report.confidence && report.confidence >= cfg.minConfidenceForAutoPass) {
            logInfo(`[ReportTaskDone] High confidence (${report.confidence}%), auto-pass`);
            return {
                accepted: true,
                nextStep: 'done',
                message: `Task ${report.taskId} completed with high confidence. Auto-passed.`,
                newStatus: 'completed'
            };
        }

        // Normal completion - would trigger verification in full system
        return {
            accepted: true,
            nextStep: 'verification',
            message: `Task ${report.taskId} completed. Pending verification.`,
            newStatus: 'completed'
        };

    } catch (error: unknown) {
        logError(`[ReportTaskDone] Error: ${error instanceof Error ? error.message : String(error)}`);
        return {
            accepted: false,
            nextStep: 'investigation',
            message: `Error processing completion: ${error instanceof Error ? error.message : String(error)}`,
            newStatus: 'failed'
        };
    }
}

/**
 * Validate the completion report
 */
function validateReport(report: TaskCompletionReport, config: ReportTaskDoneConfig): string | null {
    if (!report.taskId) {
        return 'Task ID is required';
    }

    if (config.requireModifiedFiles && (!report.modifiedFiles || report.modifiedFiles.length === 0)) {
        return 'Modified files list is required';
    }

    if (!report.summary || report.summary.length < 10) {
        return 'Summary must be at least 10 characters';
    }

    return null;
}

/**
 * Validate reportTaskDone request parameters
 */
export function validateReportTaskDoneRequest(params: unknown): TaskCompletionReport | null {
    if (!params || typeof params !== 'object') {
        return null;
    }

    const p = params as Record<string, unknown>;

    if (typeof p['taskId'] !== 'string') {
        return null;
    }

    return {
        taskId: p['taskId'] as string,
        modifiedFiles: Array.isArray(p['modifiedFiles']) ? p['modifiedFiles'] as string[] : [],
        summary: typeof p['summary'] === 'string' ? p['summary'] : '',
        confidence: typeof p['confidence'] === 'number' ? p['confidence'] : undefined,
        issues: Array.isArray(p['issues']) ? p['issues'] as string[] : undefined,
        actualMinutes: typeof p['actualMinutes'] === 'number' ? p['actualMinutes'] : undefined
    };
}
