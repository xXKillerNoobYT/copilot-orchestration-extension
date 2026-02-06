/**
 * Re-verification System
 * 
 * **Simple explanation**: Handles the cycle when verification fails.
 * Tracks retry attempts, provides failure details to Coding AI,
 * and knows when to escalate or give up.
 * 
 * @module agents/verification/reVerify
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Re-verification request
 */
export interface ReVerifyRequest {
    /** Task ID */
    taskId: string;
    /** Previous failures */
    previousFailures: VerificationFailure[];
    /** Current attempt number */
    attemptNumber: number;
    /** Modified files */
    modifiedFiles: string[];
}

/**
 * A verification failure
 */
export interface VerificationFailure {
    /** When the failure occurred */
    timestamp: Date;
    /** Failure type */
    type: 'test-failure' | 'lint-error' | 'type-error' | 'coverage-drop' | 'regression';
    /** Failure details */
    details: string;
    /** Files involved */
    files: string[];
    /** Error messages */
    errors: string[];
}

/**
 * Re-verification decision
 */
export interface ReVerifyDecision {
    /** What to do */
    action: 'retry' | 'escalate' | 'abort' | 'manual-review';
    /** Reason for decision */
    reason: string;
    /** Hints for Coding AI on retry */
    hints: string[];
    /** Priority adjustment */
    priorityBoost: number;
    /** Time limit for retry (seconds) */
    timeLimitSeconds?: number;
}

/**
 * Re-verification configuration
 */
export interface ReVerifyConfig {
    /** Maximum retry attempts */
    maxRetries: number;
    /** Time limit per retry (seconds) */
    retryTimeLimitSeconds: number;
    /** Escalate on repeated same error */
    escalateOnRepeatedError: boolean;
    /** Abort if same error 3+ times */
    abortOnSameError: number;
}

const DEFAULT_CONFIG: ReVerifyConfig = {
    maxRetries: 3,
    retryTimeLimitSeconds: 300,
    escalateOnRepeatedError: true,
    abortOnSameError: 3
};

/**
 * Re-verification Manager
 */
export class ReVerifyManager {
    private config: ReVerifyConfig;
    private taskHistory: Map<string, VerificationFailure[]> = new Map();

    constructor(config: Partial<ReVerifyConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Record a verification failure
     */
    recordFailure(taskId: string, failure: VerificationFailure): void {
        const history = this.taskHistory.get(taskId) || [];
        history.push(failure);
        this.taskHistory.set(taskId, history);

        logInfo(`[ReVerify] Recorded failure #${history.length} for ${taskId}: ${failure.type}`);
    }

    /**
     * Decide what to do after verification failure
     */
    decide(request: ReVerifyRequest): ReVerifyDecision {
        const { taskId, previousFailures, attemptNumber } = request;

        logInfo(`[ReVerify] Deciding for ${taskId}, attempt ${attemptNumber}`);

        // Check max retries
        if (attemptNumber >= this.config.maxRetries) {
            return {
                action: 'abort',
                reason: `Maximum retries (${this.config.maxRetries}) exceeded`,
                hints: [],
                priorityBoost: 0
            };
        }

        // Check for repeated same error
        const repeatedError = this.findRepeatedError(previousFailures);
        if (repeatedError) {
            const repeatCount = repeatedError.count;

            if (repeatCount >= this.config.abortOnSameError) {
                return {
                    action: 'abort',
                    reason: `Same error repeated ${repeatCount} times: ${repeatedError.type}`,
                    hints: [],
                    priorityBoost: 0
                };
            }

            if (this.config.escalateOnRepeatedError && repeatCount >= 2) {
                return {
                    action: 'escalate',
                    reason: `Repeated error needs human review: ${repeatedError.type}`,
                    hints: this.generateHints(previousFailures),
                    priorityBoost: 0
                };
            }
        }

        // Decision based on failure type
        const latestFailure = previousFailures[previousFailures.length - 1];

        if (latestFailure?.type === 'regression') {
            return {
                action: 'manual-review',
                reason: 'Regression detected - needs careful review',
                hints: this.generateHints(previousFailures),
                priorityBoost: 1
            };
        }

        // Default: retry
        return {
            action: 'retry',
            reason: `Attempt ${attemptNumber + 1} of ${this.config.maxRetries}`,
            hints: this.generateHints(previousFailures),
            priorityBoost: attemptNumber, // Increase priority with each retry
            timeLimitSeconds: this.config.retryTimeLimitSeconds
        };
    }

    /**
     * Find if the same error is repeating
     */
    private findRepeatedError(failures: VerificationFailure[]): { type: string; count: number } | null {
        if (failures.length < 2) return null;

        // Count error types
        const counts = new Map<string, number>();
        for (const failure of failures) {
            const key = `${failure.type}:${failure.details.substring(0, 50)}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }

        // Find most repeated
        let maxCount = 0;
        let maxType = '';
        for (const [type, count] of counts) {
            if (count > maxCount) {
                maxCount = count;
                maxType = type;
            }
        }

        return maxCount >= 2 ? { type: maxType, count: maxCount } : null;
    }

    /**
     * Generate hints for retry based on failures
     */
    private generateHints(failures: VerificationFailure[]): string[] {
        const hints: string[] = [];
        const seenTypes = new Set<string>();

        for (const failure of failures) {
            if (seenTypes.has(failure.type)) continue;
            seenTypes.add(failure.type);

            switch (failure.type) {
                case 'test-failure':
                    hints.push('Check the failing test assertions carefully');
                    hints.push('Run the specific failing test in isolation');
                    if (failure.files.length > 0) {
                        hints.push(`Focus on: ${failure.files.join(', ')}`);
                    }
                    break;

                case 'lint-error':
                    hints.push('Run `npm run lint` locally and fix all errors');
                    hints.push('Check for unused imports or variables');
                    break;

                case 'type-error':
                    hints.push('Run `npm run compile` and read error messages carefully');
                    hints.push('Check for type mismatches in function parameters');
                    break;

                case 'coverage-drop':
                    hints.push('Add tests for new code paths');
                    hints.push('Check uncovered lines in coverage report');
                    break;

                case 'regression':
                    hints.push('Review changes that affected existing functionality');
                    hints.push('Check for side effects of modifications');
                    break;
            }
        }

        return hints;
    }

    /**
     * Format failure history
     */
    formatHistory(taskId: string): string {
        const failures = this.taskHistory.get(taskId) || [];

        if (failures.length === 0) {
            return `No failure history for ${taskId}`;
        }

        const lines = [`Failure history for ${taskId}:`, ''];

        for (let i = 0; i < failures.length; i++) {
            const f = failures[i];
            lines.push(`## Attempt ${i + 1} - ${f.type}`);
            lines.push(`Time: ${f.timestamp.toISOString()}`);
            lines.push(`Details: ${f.details}`);
            if (f.errors.length > 0) {
                lines.push('Errors:');
                for (const err of f.errors) {
                    lines.push(`  - ${err}`);
                }
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Clear history for a task
     */
    clearHistory(taskId: string): void {
        this.taskHistory.delete(taskId);
    }

    /**
     * Get failure count for a task
     */
    getFailureCount(taskId: string): number {
        return this.taskHistory.get(taskId)?.length || 0;
    }
}

// Singleton instance
let instance: ReVerifyManager | null = null;

/**
 * Initialize re-verify manager
 */
export function initializeReVerifyManager(config?: Partial<ReVerifyConfig>): ReVerifyManager {
    instance = new ReVerifyManager(config);
    return instance;
}

/**
 * Get re-verify manager
 */
export function getReVerifyManager(): ReVerifyManager {
    if (!instance) {
        instance = new ReVerifyManager();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetReVerifyManager(): void {
    instance = null;
}
