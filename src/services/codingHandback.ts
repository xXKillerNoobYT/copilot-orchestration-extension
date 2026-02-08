/**
 * Coding Agent Handback Workflow (MT-033.33)
 *
 * Handles the return/handback from a coding agent after task execution.
 * The coding agent reports back with code changes, test results, issues,
 * time spent, and confidence level. The orchestrator then validates the
 * return: tests pass, acceptance criteria met, no lint errors, changes
 * within scope.
 *
 * **Simple explanation**: After the contractor finishes the job, they submit
 * a report. The project manager (orchestrator) reviews it — did they follow
 * the spec? Do the tests pass? Is it on budget? Then either accepts or
 * sends it back for fixes.
 *
 * @module services/codingHandback
 */

import {
    AtomicTask,
    MasterTicket,
    TaskStatus
} from '../generators/taskBreakdown';

import {
    HandoffPackage
} from './codingHandoff';

// ============================================================================
// Types
// ============================================================================

/** Confidence level reported by the coding agent */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Overall handback result status */
export type HandbackStatus = 'success' | 'partial' | 'failed' | 'blocked';

/** Individual validation check result */
export type CheckResult = 'pass' | 'fail' | 'skip' | 'warning';

/** Scope violation type */
export type ScopeViolationType = 'out_of_scope_file' | 'unrelated_change' | 'missing_file';

/**
 * A file change reported by the coding agent.
 *
 * **Simple explanation**: What the coding agent changed in a file —
 * the before (if modifying) and the after.
 */
export interface FileChange {
    /** File path */
    filePath: string;
    /** Type of change */
    changeType: 'created' | 'modified' | 'deleted';
    /** New content (for created/modified files) */
    content?: string;
    /** Diff (unified diff format, optional) */
    diff?: string;
    /** Lines added */
    linesAdded: number;
    /** Lines removed */
    linesRemoved: number;
}

/**
 * Test result from the coding agent.
 *
 * **Simple explanation**: Did the tests pass? How many? Any failures?
 */
export interface TestResult {
    /** Test suite name */
    suiteName: string;
    /** Total tests run */
    totalTests: number;
    /** Tests that passed */
    passed: number;
    /** Tests that failed */
    failed: number;
    /** Tests that were skipped */
    skipped: number;
    /** Failure details */
    failures: TestFailure[];
    /** Coverage percentage (if available) */
    coveragePercent?: number;
    /** Duration in milliseconds */
    durationMs: number;
}

/**
 * Details of a test failure.
 */
export interface TestFailure {
    /** Test name */
    testName: string;
    /** Error message */
    message: string;
    /** Stack trace (optional) */
    stackTrace?: string;
}

/**
 * An issue discovered during task execution.
 *
 * **Simple explanation**: Something the coding agent found that needs attention —
 * a blocker, a question, or a discovery.
 */
export interface DiscoveredIssue {
    /** Issue type */
    type: 'blocker' | 'question' | 'discovery' | 'suggestion';
    /** Issue title */
    title: string;
    /** Detailed description */
    description: string;
    /** Affected files */
    affectedFiles: string[];
    /** Severity (1-5, 1 = critical) */
    severity: number;
}

/**
 * The return package from a coding agent.
 *
 * **Simple explanation**: The contractor's report — what they did, test results,
 * issues found, time spent, and how confident they are in the work.
 */
export interface HandbackPackage {
    /** Unique handback ID */
    id: string;
    /** Original handoff package ID */
    handoffId: string;
    /** Task ID */
    taskId: string;
    /** Agent that performed the work */
    agentId: string;
    /** Timestamp of submission */
    submittedAt: string;

    // ── Code Changes ─────────────────────────────────────────────────
    /** Files changed */
    fileChanges: FileChange[];

    // ── Test Results ─────────────────────────────────────────────────
    /** Test results */
    testResults: TestResult[];

    // ── Issues ───────────────────────────────────────────────────────
    /** Issues discovered during execution */
    issues: DiscoveredIssue[];

    // ── Execution Metrics ────────────────────────────────────────────
    /** Time spent in minutes */
    timeSpentMinutes: number;
    /** Original estimate in minutes */
    originalEstimateMinutes: number;
    /** Confidence level */
    confidence: ConfidenceLevel;

    // ── Status ───────────────────────────────────────────────────────
    /** Overall handback status */
    status: HandbackStatus;
    /** Summary of what was done */
    summary: string;
}

/**
 * Result of a single validation check.
 *
 * **Simple explanation**: One line in the checklist — pass/fail with details.
 */
export interface ValidationCheck {
    /** Check name */
    name: string;
    /** Check result */
    result: CheckResult;
    /** Details or reason */
    details: string;
}

/**
 * Scope violation found during validation.
 */
export interface ScopeViolation {
    /** Type of violation */
    type: ScopeViolationType;
    /** File path */
    filePath: string;
    /** Explanation */
    reason: string;
}

/**
 * Complete validation result for a handback.
 *
 * **Simple explanation**: The project manager's review — all checks ran,
 * here's what passed and what didn't, and whether to accept or reject.
 */
export interface ValidationResult {
    /** Overall pass/fail */
    accepted: boolean;
    /** All validation checks performed */
    checks: ValidationCheck[];
    /** Scope violations (files changed that weren't in the handoff) */
    scopeViolations: ScopeViolation[];
    /** Acceptance criteria met */
    criteriaMatched: number;
    /** Total acceptance criteria */
    criteriaTotal: number;
    /** Summary of validation */
    summary: string;
    /** Suggested task status after validation */
    suggestedStatus: TaskStatus;
}

/**
 * Configuration for handback validation.
 *
 * **Simple explanation**: Settings that control how strictly handbacks are validated.
 */
export interface HandbackConfig {
    /** Require all tests to pass (default: true) */
    requireAllTestsPass: boolean;
    /** Require all acceptance criteria met (default: true) */
    requireAllCriteriaMet: boolean;
    /** Allow out-of-scope file changes (default: false) */
    allowOutOfScopeChanges: boolean;
    /** Minimum confidence level to auto-accept (default: 'medium') */
    minAutoAcceptConfidence: ConfidenceLevel;
    /** Maximum allowed time overrun percentage (default: 50) */
    maxTimeOverrunPercent: number;
    /** Minimum test coverage to accept (default: 80) */
    minTestCoverage: number;
}

/**
 * Default handback validation configuration.
 *
 * **Simple explanation**: Standard settings — strict by default.
 */
export const DEFAULT_HANDBACK_CONFIG: HandbackConfig = {
    requireAllTestsPass: true,
    requireAllCriteriaMet: true,
    allowOutOfScopeChanges: false,
    minAutoAcceptConfidence: 'medium',
    maxTimeOverrunPercent: 50,
    minTestCoverage: 80
};

// ============================================================================
// Handback Package ID Generation
// ============================================================================

/**
 * Generate a unique handback package ID.
 *
 * **Simple explanation**: Creates an ID like "HB-MT-1.3-20240115T143022"
 * combining the task ID and a timestamp.
 */
export function generateHandbackId(taskId: string): string {
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
    return `HB-${taskId}-${ts}`;
}

// ============================================================================
// Handback Package Creation
// ============================================================================

/**
 * Create a handback package from agent results.
 *
 * **Simple explanation**: The coding agent fills out their return report
 * with everything they did.
 */
export function createHandbackPackage(
    handoffId: string,
    taskId: string,
    agentId: string,
    fileChanges: FileChange[],
    testResults: TestResult[],
    issues: DiscoveredIssue[],
    timeSpentMinutes: number,
    originalEstimateMinutes: number,
    confidence: ConfidenceLevel,
    summary: string
): HandbackPackage {
    const status = determineHandbackStatus(fileChanges, testResults, issues, confidence);

    return {
        id: generateHandbackId(taskId),
        handoffId,
        taskId,
        agentId,
        submittedAt: new Date().toISOString(),
        fileChanges,
        testResults,
        issues,
        timeSpentMinutes,
        originalEstimateMinutes,
        confidence,
        status,
        summary
    };
}

/**
 * Determine the overall status of a handback based on results.
 *
 * **Simple explanation**: If everything worked → success. If some things
 * worked → partial. If blockers found → blocked. Otherwise → failed.
 */
export function determineHandbackStatus(
    fileChanges: FileChange[],
    testResults: TestResult[],
    issues: DiscoveredIssue[],
    confidence: ConfidenceLevel
): HandbackStatus {
    // Blockers → blocked
    const hasBlockers = issues.some(i => i.type === 'blocker');
    if (hasBlockers) {
        return 'blocked';
    }

    // No file changes → failed (nothing was done)
    if (fileChanges.length === 0) {
        return 'failed';
    }

    // All tests pass and confidence >= medium → success
    const allTestsPass = testResults.every(r => r.failed === 0);
    if (allTestsPass && confidence !== 'low') {
        return 'success';
    }

    // Some tests fail or low confidence → partial
    return 'partial';
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that all tests pass.
 *
 * **Simple explanation**: Checks the test results — did any tests fail?
 */
export function validateTestResults(testResults: TestResult[]): ValidationCheck {
    if (testResults.length === 0) {
        return {
            name: 'Tests Pass',
            result: 'skip',
            details: 'No test results provided'
        };
    }

    const totalFailed = testResults.reduce((sum, r) => sum + r.failed, 0);
    const totalPassed = testResults.reduce((sum, r) => sum + r.passed, 0);
    const totalTests = testResults.reduce((sum, r) => sum + r.totalTests, 0);

    if (totalFailed === 0) {
        return {
            name: 'Tests Pass',
            result: 'pass',
            details: `All ${totalPassed}/${totalTests} tests passed`
        };
    }

    return {
        name: 'Tests Pass',
        result: 'fail',
        details: `${totalFailed} test(s) failed out of ${totalTests}`
    };
}

/**
 * Validate acceptance criteria are met.
 *
 * **Simple explanation**: Checks if the coding agent addressed each
 * acceptance criterion in the handoff. Uses keyword matching against
 * the handback summary and file changes.
 */
export function validateAcceptanceCriteria(
    handoff: HandoffPackage,
    handback: HandbackPackage
): ValidationCheck {
    const criteria = handoff.acceptanceCriteria;
    if (criteria.length === 0) {
        return {
            name: 'Acceptance Criteria',
            result: 'skip',
            details: 'No acceptance criteria defined'
        };
    }

    // Simple keyword matching: check if handback summary or file paths
    // reference concepts from each criterion
    const contextText = [
        handback.summary,
        ...handback.fileChanges.map(f => f.filePath)
    ].join(' ').toLowerCase();

    let matched = 0;
    for (const criterion of criteria) {
        const keywords = criterion.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
        const hasMatch = keywords.some(kw => contextText.includes(kw));
        if (hasMatch) {
            matched++;
        }
    }

    const allMet = matched === criteria.length;
    return {
        name: 'Acceptance Criteria',
        result: allMet ? 'pass' : (matched > 0 ? 'warning' : 'fail'),
        details: `${matched}/${criteria.length} criteria appear to be addressed`
    };
}

/**
 * Validate that changes are within scope.
 *
 * **Simple explanation**: Checks that the agent only modified files
 * that were listed in the handoff — no rogue changes.
 */
export function validateScope(
    handoff: HandoffPackage,
    handback: HandbackPackage,
    config: HandbackConfig
): { check: ValidationCheck; violations: ScopeViolation[] } {
    const allowedFiles = new Set(handoff.fileReferences.map(r => r.path));
    const violations: ScopeViolation[] = [];

    for (const change of handback.fileChanges) {
        if (!allowedFiles.has(change.filePath)) {
            violations.push({
                type: 'out_of_scope_file',
                filePath: change.filePath,
                reason: `File ${change.filePath} was not listed in the handoff file references`
            });
        }
    }

    // Check for expected files not changed
    for (const ref of handoff.fileReferences) {
        const wasChanged = handback.fileChanges.some(c => c.filePath === ref.path);
        if (!wasChanged && ref.action !== 'delete') {
            violations.push({
                type: 'missing_file',
                filePath: ref.path,
                reason: `Expected file ${ref.path} to be ${ref.action}d but it was not changed`
            });
        }
    }

    const hasViolations = violations.length > 0;
    const result: CheckResult = hasViolations
        ? (config.allowOutOfScopeChanges ? 'warning' : 'fail')
        : 'pass';

    return {
        check: {
            name: 'Scope Compliance',
            result,
            details: hasViolations
                ? `${violations.length} scope violation(s) found`
                : 'All changes within scope'
        },
        violations
    };
}

/**
 * Validate test coverage meets minimum threshold.
 *
 * **Simple explanation**: Checks that code coverage is above the required minimum.
 */
export function validateCoverage(
    testResults: TestResult[],
    config: HandbackConfig
): ValidationCheck {
    const resultsWithCoverage = testResults.filter(r => r.coveragePercent !== undefined);

    if (resultsWithCoverage.length === 0) {
        return {
            name: 'Test Coverage',
            result: 'skip',
            details: 'No coverage data available'
        };
    }

    const avgCoverage = resultsWithCoverage.reduce(
        (sum, r) => sum + (r.coveragePercent ?? 0), 0
    ) / resultsWithCoverage.length;

    if (avgCoverage >= config.minTestCoverage) {
        return {
            name: 'Test Coverage',
            result: 'pass',
            details: `Coverage ${avgCoverage.toFixed(1)}% meets minimum ${config.minTestCoverage}%`
        };
    }

    return {
        name: 'Test Coverage',
        result: 'fail',
        details: `Coverage ${avgCoverage.toFixed(1)}% below minimum ${config.minTestCoverage}%`
    };
}

/**
 * Validate time spent is within acceptable overrun.
 *
 * **Simple explanation**: Checks if the task took way longer than estimated.
 */
export function validateTimeSpent(
    handback: HandbackPackage,
    config: HandbackConfig
): ValidationCheck {
    if (handback.originalEstimateMinutes <= 0) {
        return {
            name: 'Time Budget',
            result: 'skip',
            details: 'No time estimate provided'
        };
    }

    const overrunPercent = ((handback.timeSpentMinutes - handback.originalEstimateMinutes)
        / handback.originalEstimateMinutes) * 100;

    if (overrunPercent <= 0) {
        return {
            name: 'Time Budget',
            result: 'pass',
            details: `Completed in ${handback.timeSpentMinutes}/${handback.originalEstimateMinutes} min (under budget)`
        };
    }

    if (overrunPercent <= config.maxTimeOverrunPercent) {
        return {
            name: 'Time Budget',
            result: 'warning',
            details: `Overrun ${overrunPercent.toFixed(0)}% (${handback.timeSpentMinutes}/${handback.originalEstimateMinutes} min)`
        };
    }

    return {
        name: 'Time Budget',
        result: 'fail',
        details: `Overrun ${overrunPercent.toFixed(0)}% exceeds max ${config.maxTimeOverrunPercent}% (${handback.timeSpentMinutes}/${handback.originalEstimateMinutes} min)`
    };
}

/**
 * Validate confidence level.
 *
 * **Simple explanation**: If the agent says they're not confident,
 * that's a red flag worth reviewing.
 */
export function validateConfidence(
    handback: HandbackPackage,
    config: HandbackConfig
): ValidationCheck {
    const levels: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };
    const required = levels[config.minAutoAcceptConfidence];
    const actual = levels[handback.confidence];

    if (actual >= required) {
        return {
            name: 'Confidence Level',
            result: 'pass',
            details: `Agent confidence: ${handback.confidence}`
        };
    }

    return {
        name: 'Confidence Level',
        result: 'warning',
        details: `Agent confidence ${handback.confidence} is below minimum ${config.minAutoAcceptConfidence}`
    };
}

// ============================================================================
// Full Validation
// ============================================================================

/**
 * Run all validation checks on a handback package.
 *
 * **Simple explanation**: The project manager's full review checklist —
 * runs every check and produces a final accept/reject decision.
 *
 * @param handoff - The original handoff package
 * @param handback - The return package from the coding agent
 * @param config - Optional configuration overrides
 * @returns Complete ValidationResult
 */
export function validateHandback(
    handoff: HandoffPackage,
    handback: HandbackPackage,
    config?: Partial<HandbackConfig>
): ValidationResult {
    const cfg: HandbackConfig = { ...DEFAULT_HANDBACK_CONFIG, ...config };

    const checks: ValidationCheck[] = [];

    // 1. Tests pass
    const testCheck = validateTestResults(handback.testResults);
    checks.push(testCheck);

    // 2. Acceptance criteria
    const criteriaCheck = validateAcceptanceCriteria(handoff, handback);
    checks.push(criteriaCheck);

    // 3. Scope compliance
    const { check: scopeCheck, violations: scopeViolations } = validateScope(handoff, handback, cfg);
    checks.push(scopeCheck);

    // 4. Test coverage
    const coverageCheck = validateCoverage(handback.testResults, cfg);
    checks.push(coverageCheck);

    // 5. Time budget
    const timeCheck = validateTimeSpent(handback, cfg);
    checks.push(timeCheck);

    // 6. Confidence level
    const confidenceCheck = validateConfidence(handback, cfg);
    checks.push(confidenceCheck);

    // Determine acceptance
    const failedChecks = checks.filter(c => c.result === 'fail');
    const mustPassTests = cfg.requireAllTestsPass && testCheck.result === 'fail';
    const mustPassCriteria = cfg.requireAllCriteriaMet && criteriaCheck.result === 'fail';

    const accepted = failedChecks.length === 0 && !mustPassTests && !mustPassCriteria;

    // Count criteria matched
    const criteriaMatch = criteriaCheck.details.match(/(\d+)\/(\d+)/);
    const criteriaMatched = criteriaMatch ? parseInt(criteriaMatch[1], 10) : 0;
    const criteriaTotal = criteriaMatch ? parseInt(criteriaMatch[2], 10) : handoff.acceptanceCriteria.length;

    // Determine suggested status
    const suggestedStatus = determineSuggestedStatus(accepted, handback, failedChecks);

    // Generate summary
    const summary = generateValidationSummary(accepted, checks, scopeViolations);

    return {
        accepted,
        checks,
        scopeViolations,
        criteriaMatched,
        criteriaTotal,
        summary,
        suggestedStatus
    };
}

/**
 * Determine the suggested task status after validation.
 *
 * **Simple explanation**: Based on validation results, suggest what status
 * the task should move to.
 */
export function determineSuggestedStatus(
    accepted: boolean,
    handback: HandbackPackage,
    failedChecks: ValidationCheck[]
): TaskStatus {
    if (accepted) {
        return 'done';
    }

    if (handback.status === 'blocked') {
        return 'blocked';
    }

    if (failedChecks.some(c => c.name === 'Tests Pass')) {
        return 'in_progress'; // Send back for fixes
    }

    return 'verification'; // Needs review
}

/**
 * Generate a human-readable validation summary.
 */
export function generateValidationSummary(
    accepted: boolean,
    checks: ValidationCheck[],
    violations: ScopeViolation[]
): string {
    const passed = checks.filter(c => c.result === 'pass').length;
    const failed = checks.filter(c => c.result === 'fail').length;
    const warnings = checks.filter(c => c.result === 'warning').length;
    const skipped = checks.filter(c => c.result === 'skip').length;

    const parts: string[] = [];
    parts.push(accepted ? 'ACCEPTED' : 'REJECTED');
    parts.push(`${passed} passed, ${failed} failed, ${warnings} warnings, ${skipped} skipped`);

    if (violations.length > 0) {
        parts.push(`${violations.length} scope violation(s)`);
    }

    return parts.join(' — ');
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a handback package to JSON.
 *
 * **Simple explanation**: Converts the return report to a JSON string
 * for storage or transmission.
 */
export function serializeHandback(pkg: HandbackPackage): string {
    return JSON.stringify(pkg, null, 2);
}

/**
 * Deserialize a handback package from JSON.
 *
 * **Simple explanation**: Converts a JSON string back into a return report.
 */
export function deserializeHandback(json: string): HandbackPackage {
    try {
        return JSON.parse(json) as HandbackPackage;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to deserialize handback package: ${msg}`);
    }
}
