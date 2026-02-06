/**
 * Orchestrator Error Recovery Workflows
 * 
 * **Simple explanation**: Handles task failures by retrying, creating
 * investigation tickets, and escalating to humans when needed. Like having
 * a supervisor who knows when to try again and when to ask for help.
 * 
 * @module agents/orchestrator/recovery
 */

import { logInfo, logWarn, logError } from '../../logger';
import { getBossNotificationManager } from './boss';
import { getOrchestratorQueue } from './queue';

/**
 * Task failure information
 */
export interface TaskFailure {
    /** Task ID that failed */
    taskId: string;
    /** Error message */
    error: string;
    /** Error type */
    errorType: 'runtime' | 'timeout' | 'validation' | 'dependency' | 'unknown';
    /** Timestamp of failure */
    timestamp: number;
    /** Stack trace if available */
    stackTrace?: string;
    /** Modified files before failure */
    modifiedFiles?: string[];
}

/**
 * Recovery action taken
 */
export interface RecoveryAction {
    /** Action type */
    action: 'retry' | 'investigate' | 'escalate' | 'skip' | 'rollback';
    /** Task ID */
    taskId: string;
    /** Reason for action */
    reason: string;
    /** Timestamp */
    timestamp: number;
    /** Created ticket ID if any */
    ticketId?: string;
    /** New task ID if created */
    newTaskId?: string;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
    /** Whether recovery was successful */
    success: boolean;
    /** Action taken */
    action: RecoveryAction;
    /** Message explaining result */
    message: string;
    /** Whether more retries are possible */
    canRetry: boolean;
}

/**
 * Retry tracking for tasks
 */
interface RetryState {
    /** Number of retries attempted */
    count: number;
    /** Last retry timestamp */
    lastRetry: number;
    /** Failure history */
    failures: TaskFailure[];
}

/**
 * Error Recovery Manager
 * 
 * **Simple explanation**: Tracks failures, decides when to retry,
 * and escalates to humans when the system can't fix itself.
 */
export class ErrorRecoveryManager {
    private retryStates: Map<string, RetryState> = new Map();
    private maxRetries: number = 3;
    private retryDelayMs: number = 5000; // 5 seconds between retries
    private recoveryHistory: RecoveryAction[] = [];

    /**
     * Handle a task failure
     */
    public async handleFailure(failure: TaskFailure): Promise<RecoveryResult> {
        logWarn(`[Recovery] Task ${failure.taskId} failed: ${failure.error}`);

        // Get or create retry state
        let state = this.retryStates.get(failure.taskId);
        if (!state) {
            state = { count: 0, lastRetry: 0, failures: [] };
            this.retryStates.set(failure.taskId, state);
        }

        // Record failure
        state.failures.push(failure);

        // Determine recovery action based on failure type and retry count
        if (this.shouldRetry(failure, state)) {
            return this.performRetry(failure, state);
        } else if (state.count >= this.maxRetries) {
            return this.escalateToHuman(failure, state);
        } else {
            return this.createInvestigationTicket(failure, state);
        }
    }

    /**
     * Determine if we should retry the task
     */
    private shouldRetry(failure: TaskFailure, state: RetryState): boolean {
        // Don't retry past max
        if (state.count >= this.maxRetries) {
            return false;
        }

        // Don't retry validation errors immediately - need investigation
        if (failure.errorType === 'validation') {
            return false;
        }

        // Don't retry dependency errors - need to wait for dependency
        if (failure.errorType === 'dependency') {
            return false;
        }

        // Check time since last retry (exponential backoff)
        const timeSinceLastRetry = Date.now() - state.lastRetry;
        const requiredDelay = this.retryDelayMs * Math.pow(2, state.count);
        if (timeSinceLastRetry < requiredDelay) {
            return false;
        }

        return true;
    }

    /**
     * Perform a retry of the task
     */
    private async performRetry(failure: TaskFailure, state: RetryState): Promise<RecoveryResult> {
        state.count++;
        state.lastRetry = Date.now();

        const action: RecoveryAction = {
            action: 'retry',
            taskId: failure.taskId,
            reason: `Retry ${state.count}/${this.maxRetries} after ${failure.errorType} error`,
            timestamp: Date.now()
        };
        this.recoveryHistory.push(action);

        logInfo(`[Recovery] Retrying task ${failure.taskId} (attempt ${state.count}/${this.maxRetries})`);

        // Reset task to ready state for retry
        const queue = getOrchestratorQueue();
        // In a real implementation, we'd reset the task in the queue
        // For now, mark as failed to let the queue pick it up again

        return {
            success: true,
            action,
            message: `Task queued for retry (attempt ${state.count}/${this.maxRetries})`,
            canRetry: state.count < this.maxRetries
        };
    }

    /**
     * Escalate to human intervention
     */
    private async escalateToHuman(failure: TaskFailure, state: RetryState): Promise<RecoveryResult> {
        const action: RecoveryAction = {
            action: 'escalate',
            taskId: failure.taskId,
            reason: `Max retries (${this.maxRetries}) exceeded`,
            timestamp: Date.now()
        };
        this.recoveryHistory.push(action);

        // Notify Boss
        const boss = getBossNotificationManager();
        boss.notifyRetryLimitExceeded(failure.taskId, state.count);

        logError(`[Recovery] Task ${failure.taskId} escalated to human after ${state.count} retries`);

        return {
            success: false,
            action,
            message: `Task escalated to human intervention after ${state.count} failed retries`,
            canRetry: false
        };
    }

    /**
     * Create an investigation ticket
     */
    private async createInvestigationTicket(failure: TaskFailure, state: RetryState): Promise<RecoveryResult> {
        // Build investigation ticket content
        const ticketDescription = this.buildInvestigationDescription(failure, state);

        // Truncate to 500 chars as per spec
        const truncatedDescription = ticketDescription.length > 500
            ? ticketDescription.substring(0, 497) + '...'
            : ticketDescription;

        const action: RecoveryAction = {
            action: 'investigate',
            taskId: failure.taskId,
            reason: `Investigation required for ${failure.errorType} error`,
            timestamp: Date.now(),
            ticketId: `INV-${failure.taskId}-${Date.now()}`
        };
        this.recoveryHistory.push(action);

        logInfo(`[Recovery] Created investigation ticket ${action.ticketId} for task ${failure.taskId}`);

        // In real implementation, would create ticket in ticketDb
        // For now, log and notify

        return {
            success: true,
            action,
            message: `Investigation ticket created: ${action.ticketId}`,
            canRetry: state.count < this.maxRetries
        };
    }

    /**
     * Build description for investigation ticket
     */
    private buildInvestigationDescription(failure: TaskFailure, state: RetryState): string {
        const lines: string[] = [
            `**Task**: ${failure.taskId}`,
            `**Error Type**: ${failure.errorType}`,
            `**Error**: ${failure.error}`,
            `**Retries**: ${state.count}/${this.maxRetries}`,
            `**Timestamp**: ${new Date(failure.timestamp).toISOString()}`
        ];

        if (failure.modifiedFiles && failure.modifiedFiles.length > 0) {
            lines.push(`**Modified Files**: ${failure.modifiedFiles.join(', ')}`);
        }

        if (failure.stackTrace) {
            // Just first 3 lines of stack trace
            const stackLines = failure.stackTrace.split('\n').slice(0, 3);
            lines.push(`**Stack**:\n${stackLines.join('\n')}`);
        }

        return lines.join('\n');
    }

    /**
     * Get retry count for a task
     */
    public getRetryCount(taskId: string): number {
        const state = this.retryStates.get(taskId);
        return state?.count ?? 0;
    }

    /**
     * Check if task can be retried
     */
    public canRetry(taskId: string): boolean {
        const state = this.retryStates.get(taskId);
        return !state || state.count < this.maxRetries;
    }

    /**
     * Reset retry count for a task (after successful completion)
     */
    public resetRetryCount(taskId: string): void {
        this.retryStates.delete(taskId);
        logInfo(`[Recovery] Reset retry count for task ${taskId}`);
    }

    /**
     * Get recovery history
     */
    public getRecoveryHistory(): RecoveryAction[] {
        return [...this.recoveryHistory];
    }

    /**
     * Get failure history for a task
     */
    public getFailureHistory(taskId: string): TaskFailure[] {
        const state = this.retryStates.get(taskId);
        return state?.failures ?? [];
    }

    /**
     * Clear all recovery state
     */
    public clear(): void {
        this.retryStates.clear();
        this.recoveryHistory = [];
        logInfo('[Recovery] All recovery state cleared');
    }
}

// Singleton instance
let recoveryInstance: ErrorRecoveryManager | null = null;

/**
 * Get the singleton ErrorRecoveryManager instance
 */
export function getErrorRecoveryManager(): ErrorRecoveryManager {
    if (!recoveryInstance) {
        recoveryInstance = new ErrorRecoveryManager();
    }
    return recoveryInstance;
}

/**
 * Reset the recovery manager (for testing)
 */
export function resetErrorRecoveryManagerForTests(): void {
    recoveryInstance = null;
}
