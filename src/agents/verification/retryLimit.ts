/**
 * Retry Limit Manager for Verification Team
 * 
 * **Simple explanation**: Tracks how many times a task has been retried
 * and escalates to humans after the limit is reached. Prevents infinite
 * retry loops by enforcing a maximum of 3 fix→verify cycles.
 * 
 * @module agents/verification/retryLimit
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Retry state for a task
 */
export interface RetryState {
    /** Task ID */
    taskId: string;
    /** Number of retry cycles */
    retryCount: number;
    /** Maximum retries allowed */
    maxRetries: number;
    /** Failure reasons per retry */
    failureHistory: FailureRecord[];
    /** Whether task is escalated */
    escalated: boolean;
    /** Escalation timestamp if escalated */
    escalatedAt?: number;
    /** First failure timestamp */
    firstFailureAt: number;
    /** Last failure timestamp */
    lastFailureAt: number;
}

/**
 * Record of a single failure
 */
export interface FailureRecord {
    /** Retry number (1, 2, 3) */
    retryNumber: number;
    /** Timestamp */
    timestamp: number;
    /** Reason for failure */
    reason: string;
    /** Which criteria failed */
    failedCriteria?: string[];
    /** Which tests failed */
    failedTests?: string[];
}

/**
 * Escalation info
 */
export interface EscalationInfo {
    /** Task ID */
    taskId: string;
    /** Number of retries attempted */
    totalRetries: number;
    /** Failure history summary */
    failureSummary: string;
    /** Recommended action */
    recommendation: 'manual-fix' | 'skip' | 'change-approach';
    /** Evidence for the recommendation */
    evidence: string[];
}

/**
 * Check result
 */
export interface RetryCheckResult {
    /** Whether retry is allowed */
    canRetry: boolean;
    /** Current retry count */
    currentCount: number;
    /** Remaining retries */
    remaining: number;
    /** Should escalate to human */
    shouldEscalate: boolean;
    /** Escalation info if should escalate */
    escalationInfo?: EscalationInfo;
}

/**
 * Retry Limit Manager
 * 
 * **Simple explanation**: Keeps track of verification failures and
 * decides when to give up and ask a human for help.
 */
export class RetryLimitManager {
    private states: Map<string, RetryState> = new Map();
    private readonly defaultMaxRetries: number = 3;

    /**
     * Record a verification failure
     */
    public recordFailure(
        taskId: string,
        reason: string,
        failedCriteria?: string[],
        failedTests?: string[]
    ): RetryCheckResult {
        let state = this.states.get(taskId);
        const now = Date.now();

        if (!state) {
            state = {
                taskId,
                retryCount: 0,
                maxRetries: this.defaultMaxRetries,
                failureHistory: [],
                escalated: false,
                firstFailureAt: now,
                lastFailureAt: now
            };
            this.states.set(taskId, state);
        }

        state.retryCount++;
        state.lastFailureAt = now;

        state.failureHistory.push({
            retryNumber: state.retryCount,
            timestamp: now,
            reason,
            failedCriteria,
            failedTests
        });

        logWarn(`[RetryLimit] Task ${taskId} failure #${state.retryCount}/${state.maxRetries}: ${reason}`);

        return this.checkRetry(taskId);
    }

    /**
     * Check if a task can be retried
     */
    public checkRetry(taskId: string): RetryCheckResult {
        const state = this.states.get(taskId);

        if (!state) {
            return {
                canRetry: true,
                currentCount: 0,
                remaining: this.defaultMaxRetries,
                shouldEscalate: false
            };
        }

        const canRetry = state.retryCount < state.maxRetries && !state.escalated;
        const shouldEscalate = state.retryCount >= state.maxRetries && !state.escalated;

        const result: RetryCheckResult = {
            canRetry,
            currentCount: state.retryCount,
            remaining: Math.max(0, state.maxRetries - state.retryCount),
            shouldEscalate
        };

        if (shouldEscalate) {
            result.escalationInfo = this.generateEscalationInfo(state);
        }

        return result;
    }

    /**
     * Generate escalation info for human review
     */
    private generateEscalationInfo(state: RetryState): EscalationInfo {
        // Analyze failure history to determine recommendation
        const allFailedTests = new Set<string>();
        const allFailedCriteria = new Set<string>();
        const reasons = new Set<string>();

        for (const failure of state.failureHistory) {
            reasons.add(failure.reason);
            failure.failedTests?.forEach(t => allFailedTests.add(t));
            failure.failedCriteria?.forEach(c => allFailedCriteria.add(c));
        }

        // Determine recommendation based on patterns
        let recommendation: EscalationInfo['recommendation'] = 'manual-fix';
        const evidence: string[] = [];

        // Same test failing every time = likely needs human fix
        if (allFailedTests.size <= 2 && state.retryCount >= 3) {
            recommendation = 'manual-fix';
            evidence.push(`Same test(s) failing repeatedly: ${Array.from(allFailedTests).join(', ')}`);
        }

        // Many different failures = approach might be wrong
        if (reasons.size >= 3) {
            recommendation = 'change-approach';
            evidence.push('Different failure reasons each time - current approach may be fundamentally wrong');
        }

        // Non-critical criteria failing = might be ok to skip
        const criticalKeywords = ['must', 'required', 'critical', 'security', 'error'];
        const hasCritical = Array.from(allFailedCriteria).some(c =>
            criticalKeywords.some(k => c.toLowerCase().includes(k))
        );

        if (!hasCritical && allFailedCriteria.size <= 1) {
            evidence.push('Failing criterion may be non-critical, consider skipping');
            if (recommendation !== 'change-approach') {
                recommendation = 'skip';
            }
        }

        // Build summary
        const failureSummary = [
            `${state.retryCount} retry attempts over ${this.formatDuration(state.lastFailureAt - state.firstFailureAt)}`,
            `Failed tests: ${allFailedTests.size > 0 ? Array.from(allFailedTests).join(', ') : 'None'}`,
            `Failed criteria: ${allFailedCriteria.size > 0 ? Array.from(allFailedCriteria).slice(0, 3).join('; ') : 'None'}`,
            `Reasons: ${Array.from(reasons).join('; ')}`
        ].join('\n');

        return {
            taskId: state.taskId,
            totalRetries: state.retryCount,
            failureSummary,
            recommendation,
            evidence
        };
    }

    /**
     * Format duration as human-readable
     */
    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    }

    /**
     * Mark a task as escalated
     */
    public markEscalated(taskId: string): void {
        const state = this.states.get(taskId);
        if (state) {
            state.escalated = true;
            state.escalatedAt = Date.now();
            logInfo(`[RetryLimit] Task ${taskId} marked as escalated`);
        }
    }

    /**
     * Reset retry count for a task (e.g., after successful verification)
     */
    public resetRetries(taskId: string): void {
        this.states.delete(taskId);
        logInfo(`[RetryLimit] Reset retries for task ${taskId}`);
    }

    /**
     * Get current retry state for a task
     */
    public getState(taskId: string): RetryState | undefined {
        return this.states.get(taskId);
    }

    /**
     * Get all tasks that are at or over retry limit
     */
    public getTasksAtLimit(): RetryState[] {
        return Array.from(this.states.values())
            .filter(s => s.retryCount >= s.maxRetries && !s.escalated);
    }

    /**
     * Get all escalated tasks
     */
    public getEscalatedTasks(): RetryState[] {
        return Array.from(this.states.values())
            .filter(s => s.escalated);
    }

    /**
     * Set custom max retries for a task
     */
    public setMaxRetries(taskId: string, maxRetries: number): void {
        const state = this.states.get(taskId);
        if (state) {
            state.maxRetries = maxRetries;
        } else {
            this.states.set(taskId, {
                taskId,
                retryCount: 0,
                maxRetries,
                failureHistory: [],
                escalated: false,
                firstFailureAt: Date.now(),
                lastFailureAt: Date.now()
            });
        }
    }

    /**
     * Clear all states
     */
    public clear(): void {
        this.states.clear();
    }
}

// Singleton instance
let managerInstance: RetryLimitManager | null = null;

/**
 * Get the singleton RetryLimitManager instance
 */
export function getRetryLimitManager(): RetryLimitManager {
    if (!managerInstance) {
        managerInstance = new RetryLimitManager();
    }
    return managerInstance;
}

/**
 * Reset for testing
 */
export function resetRetryLimitManagerForTests(): void {
    managerInstance = null;
}
