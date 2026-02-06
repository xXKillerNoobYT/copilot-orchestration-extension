/**
 * @file verification/index.ts
 * @module VerificationTeam
 * @description Main Verification Team module - orchestrates test execution, AC matching, and verification workflow
 * MT-015: Verification Team Implementation
 * 
 * **Simple explanation**: The Verification Team is like a quality inspector.
 * After coding is done, it waits 60 seconds for files to settle, then runs tests,
 * checks if acceptance criteria are met, and creates investigation tickets if something fails.
 */

import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '../../logger';
import { createTicket, updateTicket } from '../../services/ticketDb';
import { StabilityTimer, createStabilityTimer } from './stabilityTimer';
import { AcceptanceCriteriaMatcher, createMatcher } from './matching';
import { TestRunner, createTestRunner, TestResult } from './testRunner';
import { VerificationDecision, createDecision, DecisionResult } from './decision';
import { InvestigationManager, createInvestigation } from './investigation';

// Re-export all types
export * from './stabilityTimer';
export * from './matching';
export * from './testRunner';
export * from './decision';
export * from './investigation';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Verification Team configuration
 */
export interface VerificationConfig {
    stabilityDelayMs: number;      // Default: 60000 (60s)
    testCommand: string;           // Default: 'npm test'
    coverageThreshold: number;     // Default: 80
    maxRetryCycles: number;        // Default: 3
    matchingThreshold: number;     // Default: 0.85
}

const DEFAULT_CONFIG: VerificationConfig = {
    stabilityDelayMs: 60000,
    testCommand: 'npm test',
    coverageThreshold: 80,
    maxRetryCycles: 3,
    matchingThreshold: 0.85
};

// ============================================================================
// VerificationTeam Class
// ============================================================================

/**
 * Main Verification Team that orchestrates the verification workflow.
 * 
 * **Simple explanation**: The boss of quality control.
 * Coordinates the timer, test runner, AC matcher, and investigation creation
 * to ensure every completed task actually works correctly.
 * 
 * @emits 'verification-start' - When verification begins for a task
 * @emits 'stabilizing' - When waiting for file stability
 * @emits 'tests-running' - When running automated tests
 * @emits 'verification-complete' - When verification finishes (pass or fail)
 * @emits 'investigation-created' - When an investigation ticket is created
 */
export class VerificationTeam extends EventEmitter {
    private config: VerificationConfig;
    private stabilityTimer: StabilityTimer | null = null;
    private matcher: AcceptanceCriteriaMatcher | null = null;
    private testRunner: TestRunner | null = null;
    private decisionMaker: VerificationDecision | null = null;
    private investigationMgr: InvestigationManager | null = null;

    // Track retry counts per task
    private retryCounts: Map<string, number> = new Map();

    // Track tasks currently being verified
    private activeVerifications: Set<string> = new Set();

    constructor(config: Partial<VerificationConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize all verification components
     */
    async initialize(): Promise<void> {
        try {
            this.stabilityTimer = createStabilityTimer({
                delayMs: this.config.stabilityDelayMs
            });

            this.matcher = createMatcher({
                threshold: this.config.matchingThreshold
            });

            this.testRunner = createTestRunner({
                command: this.config.testCommand,
                coverageThreshold: this.config.coverageThreshold
            });

            this.decisionMaker = createDecision();
            this.investigationMgr = createInvestigation();

            logInfo('[VerificationTeam] Initialized successfully');
            this.emit('initialized');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[VerificationTeam] Initialization failed: ${msg}`);
            throw error;
        }
    }

    /**
     * Start verification for a completed task (MT-015.2, MT-015.9)
     * 
     * @param taskId - The task ID to verify
     * @param modifiedFiles - List of files that were modified
     * @param acceptanceCriteria - List of acceptance criteria to check
     */
    async verifyTask(
        taskId: string,
        modifiedFiles: string[],
        acceptanceCriteria: string[]
    ): Promise<DecisionResult> {
        if (this.activeVerifications.has(taskId)) {
            logWarn(`[VerificationTeam] Task ${taskId} is already being verified`);
            return {
                passed: false,
                reason: 'Task already being verified',
                details: {}
            };
        }

        this.activeVerifications.add(taskId);
        this.emit('verification-start', { taskId, modifiedFiles, acceptanceCriteria });

        try {
            // Step 1: Wait for stability (60s) (MT-015.2)
            logInfo(`[VerificationTeam] Waiting ${this.config.stabilityDelayMs}ms for file stability...`);
            this.emit('stabilizing', { taskId });
            await this.stabilityTimer?.waitForStability(modifiedFiles);

            // Step 2: Run automated tests (MT-015.4)
            logInfo(`[VerificationTeam] Running tests for task ${taskId}...`);
            this.emit('tests-running', { taskId });
            const testResults = await this.testRunner?.runTests(modifiedFiles) ?? {
                passed: false,
                total: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                output: 'Test runner not initialized'
            };

            // Step 3: Match acceptance criteria (MT-015.3)
            logInfo(`[VerificationTeam] Matching acceptance criteria...`);
            const matchResults = await this.matcher?.matchCriteria(acceptanceCriteria, modifiedFiles) ?? {
                matched: [],
                unmatched: acceptanceCriteria,
                score: 0,
                details: []
            };

            // Step 4: Make pass/fail decision (MT-015.9)
            const decision = this.decisionMaker?.decide(testResults, matchResults) ?? {
                passed: false,
                reason: 'Decision maker not initialized',
                details: {}
            };

            // Step 5: Handle failure (MT-015.10, MT-015.11)
            if (!decision.passed) {
                await this.handleFailure(taskId, decision, testResults, matchResults);
            }

            this.emit('verification-complete', { taskId, decision });
            return decision;

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[VerificationTeam] Verification failed for ${taskId}: ${msg}`);

            return {
                passed: false,
                reason: `Verification error: ${msg}`,
                details: {}
            };
        } finally {
            this.activeVerifications.delete(taskId);
        }
    }

    /**
     * Handle verification failure - create investigation ticket and fix task (MT-015.10, MT-015.11)
     */
    private async handleFailure(
        taskId: string,
        decision: DecisionResult,
        testResults: TestResult,
        matchResults: { matched: string[]; unmatched: string[]; score: number }
    ): Promise<void> {
        const retryCount = (this.retryCounts.get(taskId) ?? 0) + 1;
        this.retryCounts.set(taskId, retryCount);

        // Check if we've exceeded retry limit (MT-015.20)
        if (retryCount > this.config.maxRetryCycles) {
            logWarn(`[VerificationTeam] Task ${taskId} exceeded max retries (${this.config.maxRetryCycles})`);
            await this.escalateToHuman(taskId, decision);
            return;
        }

        // Create investigation ticket (MT-015.10)
        const investigationTicket = await this.investigationMgr?.createInvestigationTicket(
            taskId,
            decision,
            testResults
        );

        if (investigationTicket) {
            this.emit('investigation-created', {
                taskId,
                investigationId: investigationTicket.id,
                retryCount
            });
            logInfo(`[VerificationTeam] Created investigation ticket: ${investigationTicket.id}`);
        }

        // Create fix task linked to parent (MT-015.11)
        await this.investigationMgr?.createFixTask(taskId, decision, retryCount);
    }

    /**
     * Escalate to human after max retries (MT-015.21)
     */
    private async escalateToHuman(taskId: string, decision: DecisionResult): Promise<void> {
        const escalationTicket = {
            title: `🚨 Manual Intervention Required: ${taskId}`,
            description: [
                `Task ${taskId} failed verification ${this.config.maxRetryCycles} times.`,
                '',
                `**Last failure reason:** ${decision.reason}`,
                '',
                '**Options:**',
                '1. Manually fix the issue',
                '2. Skip this task',
                '3. Change the approach',
                '',
                'Please review and take action.'
            ].join('\n'),
            type: 'ai_to_human' as const,
            priority: 1,
            creator: 'VerificationTeam',
            status: 'open' as const,
            assignee: null,
            taskId: taskId,
            version: 1,
            resolution: null
        };

        await createTicket(escalationTicket);
        this.emit('escalation', { taskId, reason: 'Max retries exceeded' });
    }

    /**
     * Get verification status for a task
     */
    getStatus(taskId: string): {
        isVerifying: boolean;
        retryCount: number
    } {
        return {
            isVerifying: this.activeVerifications.has(taskId),
            retryCount: this.retryCounts.get(taskId) ?? 0
        };
    }

    /**
     * Reset retry count for a task
     */
    resetRetryCount(taskId: string): void {
        this.retryCounts.delete(taskId);
    }

    /**
     * Shutdown the verification team
     */
    async shutdown(): Promise<void> {
        this.activeVerifications.clear();
        this.retryCounts.clear();
        this.emit('shutdown');
        logInfo('[VerificationTeam] Shutdown complete');
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: VerificationTeam | null = null;

/**
 * Initialize the Verification Team singleton
 */
export function initializeVerificationTeam(config?: Partial<VerificationConfig>): VerificationTeam {
    if (instance) {
        throw new Error('VerificationTeam already initialized');
    }
    instance = new VerificationTeam(config);
    return instance;
}

/**
 * Get the Verification Team singleton instance
 */
export function getVerificationTeamInstance(): VerificationTeam {
    if (!instance) {
        throw new Error('VerificationTeam not initialized');
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetVerificationTeamForTests(): void {
    instance = null;
}
