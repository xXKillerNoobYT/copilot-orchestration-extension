/**
 * Verification Team Router
 * 
 * **Simple explanation**: Routes completed tasks to the Verification Team
 * which runs tests, checks for regressions, and decides if work passes.
 * 
 * @module agents/orchestrator/routing/verification
 */

import { logInfo, logWarn, logError } from '../../../logger';
import { getTaskStatusManager, TRIGGERS } from '../status';

/**
 * Verification request
 */
export interface VerificationRequest {
    /** Task identifier */
    taskId: string;
    /** Files that were modified */
    modifiedFiles: string[];
    /** Summary of changes */
    changeSummary: string;
    /** Original acceptance criteria */
    acceptanceCriteria: string[];
    /** Test files to run */
    testFiles: string[];
    /** Whether to run full test suite */
    fullSuite: boolean;
    /** Priority of verification */
    priority: 'immediate' | 'normal' | 'low';
}

/**
 * Verification result
 */
export interface VerificationResult {
    /** Task identifier */
    taskId: string;
    /** Overall pass/fail */
    passed: boolean;
    /** Test results summary */
    testResults: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    /** Failed test details */
    failures: {
        testName: string;
        error: string;
        file: string;
    }[];
    /** Acceptance criteria results */
    criteriaResults: {
        criterion: string;
        met: boolean;
        evidence?: string;
    }[];
    /** Regression detected */
    regressionDetected: boolean;
    /** Coverage metrics */
    coverage?: {
        lines: number;
        branches: number;
        functions: number;
    };
    /** Recommendations */
    recommendations: string[];
}

/**
 * Router configuration
 */
export interface VerificationRouterConfig {
    /** Stability wait time (ms) before running tests */
    stabilityWaitMs: number;
    /** Max retries on verification failure */
    maxRetries: number;
    /** Run coverage analysis */
    collectCoverage: boolean;
    /** Required coverage thresholds */
    coverageThresholds: {
        lines: number;
        branches: number;
        functions: number;
    };
    /** Automatically re-verify on file watch changes */
    autoReVerify: boolean;
}

const DEFAULT_CONFIG: VerificationRouterConfig = {
    stabilityWaitMs: 60000, // 60 seconds
    maxRetries: 3,
    collectCoverage: true,
    coverageThresholds: {
        lines: 80,
        branches: 70,
        functions: 80
    },
    autoReVerify: true
};

/**
 * Pending verification tracking
 */
interface PendingVerification {
    request: VerificationRequest;
    queuedAt: Date;
    retryCount: number;
    lastResult?: VerificationResult;
}

/**
 * Verification Team Router
 */
export class VerificationRouter {
    private config: VerificationRouterConfig;
    private pendingVerifications: Map<string, PendingVerification> = new Map();
    private stabilityTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(config: Partial<VerificationRouterConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Queue a verification request (waits for stability)
     */
    async queueVerification(request: VerificationRequest): Promise<void> {
        logInfo(`[VerificationRouter] Queuing verification for ${request.taskId}`);

        // Cancel existing timer if any
        const existingTimer = this.stabilityTimers.get(request.taskId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Track pending verification
        this.pendingVerifications.set(request.taskId, {
            request,
            queuedAt: new Date(),
            retryCount: 0
        });

        // Set stability timer
        const timer = setTimeout(
            () => this.runVerification(request.taskId),
            this.config.stabilityWaitMs
        );
        this.stabilityTimers.set(request.taskId, timer);

        logInfo(`[VerificationRouter] Will verify ${request.taskId} in ${this.config.stabilityWaitMs}ms`);
    }

    /**
     * Reset stability timer (file changed)
     */
    resetStabilityTimer(taskId: string): void {
        const pending = this.pendingVerifications.get(taskId);
        if (!pending) {
            return;
        }

        // Clear existing timer
        const existingTimer = this.stabilityTimers.get(taskId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(
            () => this.runVerification(taskId),
            this.config.stabilityWaitMs
        );
        this.stabilityTimers.set(taskId, timer);

        logInfo(`[VerificationRouter] Stability timer reset for ${taskId}`);
    }

    /**
     * Run verification immediately (skip stability wait)
     */
    async runVerificationNow(taskId: string): Promise<VerificationResult | null> {
        // Cancel stability timer
        const timer = this.stabilityTimers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.stabilityTimers.delete(taskId);
        }

        return this.runVerification(taskId);
    }

    /**
     * Run verification for a task
     */
    private async runVerification(taskId: string): Promise<VerificationResult | null> {
        const pending = this.pendingVerifications.get(taskId);
        if (!pending) {
            logWarn(`[VerificationRouter] No pending verification for ${taskId}`);
            return null;
        }

        logInfo(`[VerificationRouter] Running verification for ${taskId}`);
        this.stabilityTimers.delete(taskId);

        try {
            // Simulate verification (actual implementation calls testRunner)
            const result = await this.executeVerification(pending.request);
            pending.lastResult = result;

            // Process result
            if (result.passed) {
                await this.handleVerificationPassed(taskId, result);
            } else {
                await this.handleVerificationFailed(taskId, result, pending.retryCount);
            }

            return result;

        } catch (error: unknown) {
            logError(`[VerificationRouter] Verification error: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Execute verification (runs tests, checks criteria)
     */
    private async executeVerification(request: VerificationRequest): Promise<VerificationResult> {
        // This would integrate with testRunner.ts and decision.ts
        // For now, return a placeholder result structure
        return {
            taskId: request.taskId,
            passed: false, // Will be determined by actual test results
            testResults: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            },
            failures: [],
            criteriaResults: request.acceptanceCriteria.map(c => ({
                criterion: c,
                met: false
            })),
            regressionDetected: false,
            coverage: this.config.collectCoverage ? {
                lines: 0,
                branches: 0,
                functions: 0
            } : undefined,
            recommendations: []
        };
    }

    /**
     * Handle verification passed
     */
    private async handleVerificationPassed(taskId: string, result: VerificationResult): Promise<void> {
        logInfo(`[VerificationRouter] Verification PASSED for ${taskId}`);

        const statusManager = getTaskStatusManager();
        statusManager.transition(taskId, TRIGGERS.VERIFICATION_PASSED);

        // Clean up
        this.pendingVerifications.delete(taskId);
    }

    /**
     * Handle verification failed
     */
    private async handleVerificationFailed(
        taskId: string,
        result: VerificationResult,
        retryCount: number
    ): Promise<void> {
        logWarn(`[VerificationRouter] Verification FAILED for ${taskId} (retry ${retryCount}/${this.config.maxRetries})`);

        const statusManager = getTaskStatusManager();

        if (retryCount >= this.config.maxRetries) {
            // Max retries exceeded
            statusManager.transition(taskId, TRIGGERS.MAX_RETRIES_EXCEEDED);
            this.pendingVerifications.delete(taskId);
            logError(`[VerificationRouter] Max retries exceeded for ${taskId}, marking as failed`);
        } else {
            // Queue for revision
            statusManager.transition(taskId, TRIGGERS.VERIFICATION_FAILED);

            // Keep in pending with incremented retry count
            const pending = this.pendingVerifications.get(taskId);
            if (pending) {
                pending.retryCount = retryCount + 1;
            }
        }
    }

    /**
     * Get pending verification count
     */
    getPendingCount(): number {
        return this.pendingVerifications.size;
    }

    /**
     * Get verification status for a task
     */
    getVerificationStatus(taskId: string): { pending: boolean; retryCount: number; lastResult?: VerificationResult } | null {
        const pending = this.pendingVerifications.get(taskId);
        if (!pending) {
            return null;
        }
        return {
            pending: true,
            retryCount: pending.retryCount,
            lastResult: pending.lastResult
        };
    }

    /**
     * Cancel verification
     */
    cancelVerification(taskId: string): boolean {
        const timer = this.stabilityTimers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.stabilityTimers.delete(taskId);
        }

        const hadPending = this.pendingVerifications.has(taskId);
        this.pendingVerifications.delete(taskId);

        if (hadPending) {
            logInfo(`[VerificationRouter] Cancelled verification for ${taskId}`);
        }

        return hadPending;
    }

    /**
     * Clean up all timers (for shutdown)
     */
    dispose(): void {
        for (const timer of this.stabilityTimers.values()) {
            clearTimeout(timer);
        }
        this.stabilityTimers.clear();
        this.pendingVerifications.clear();
    }
}

// Singleton instance
let instance: VerificationRouter | null = null;

/**
 * Initialize the router
 */
export function initializeVerificationRouter(config: Partial<VerificationRouterConfig> = {}): VerificationRouter {
    instance = new VerificationRouter(config);
    return instance;
}

/**
 * Get singleton instance
 */
export function getVerificationRouter(): VerificationRouter {
    if (!instance) {
        instance = new VerificationRouter();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetVerificationRouter(): void {
    if (instance) {
        instance.dispose();
    }
    instance = null;
}
