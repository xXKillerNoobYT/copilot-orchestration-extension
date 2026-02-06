/**
 * @file verification/decision.ts
 * @module VerificationDecision
 * @description Makes pass/fail decisions based on test and matching results (MT-015.9)
 * 
 * Combines test results and acceptance criteria matching to determine
 * if a task has been successfully completed.
 * 
 * **Simple explanation**: The judge. Looks at test results and AC matching
 * scores and decides: "Pass" or "Fail" with a clear reason why.
 */

import { logInfo, logWarn } from '../../logger';
import type { TestResult } from './testRunner';
import type { MatchResult } from './matching';

// ============================================================================
// Types
// ============================================================================

export interface DecisionConfig {
    minTestPassRate: number;      // Minimum test pass rate (0-1)
    minACMatchScore: number;      // Minimum AC match score (0-1)
    coverageRequired: boolean;    // Whether coverage threshold must be met
    strictMode: boolean;          // All criteria must pass in strict mode
}

export interface DecisionResult {
    passed: boolean;
    reason: string;
    details: {
        testsPass?: boolean;
        testPassRate?: number;
        acMatchScore?: number;
        coverageMet?: boolean;
        failedCriteria?: string[];
    };
    recommendations?: string[];
}

// ============================================================================
// VerificationDecision Class
// ============================================================================

/**
 * Makes verification decisions based on test and AC matching results.
 * 
 * **Simple explanation**: The final verdict maker.
 * Takes all the evidence (test results, AC matches) and renders a judgment:
 * Did the implementation meet the requirements or not?
 */
export class VerificationDecision {
    private config: DecisionConfig;

    constructor(config: Partial<DecisionConfig> = {}) {
        this.config = {
            minTestPassRate: config.minTestPassRate ?? 1.0,  // 100% tests must pass
            minACMatchScore: config.minACMatchScore ?? 0.85, // 85% AC match
            coverageRequired: config.coverageRequired ?? false,
            strictMode: config.strictMode ?? false
        };
    }

    /**
     * Make a pass/fail decision based on all verification data
     */
    decide(testResult: TestResult, matchResult: MatchResult): DecisionResult {
        const details: DecisionResult['details'] = {};
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Check test pass rate
        const testPassRate = testResult.total > 0
            ? (testResult.total - testResult.failed) / testResult.total
            : 0;
        details.testsPass = testResult.passed;
        details.testPassRate = testPassRate;

        if (testPassRate < this.config.minTestPassRate) {
            issues.push(`Test pass rate (${(testPassRate * 100).toFixed(1)}%) below required (${(this.config.minTestPassRate * 100).toFixed(1)}%)`);
            recommendations.push('Fix failing tests before proceeding');
        }

        // Check AC match score
        details.acMatchScore = matchResult.score;
        if (matchResult.score < this.config.minACMatchScore) {
            issues.push(`AC match score (${(matchResult.score * 100).toFixed(1)}%) below required (${(this.config.minACMatchScore * 100).toFixed(1)}%)`);
            details.failedCriteria = matchResult.unmatched;
            recommendations.push(`Address unmatched criteria: ${matchResult.unmatched.slice(0, 3).join(', ')}`);
        }

        // Check coverage if required
        if (this.config.coverageRequired && testResult.coverage) {
            details.coverageMet = testResult.coverage.meetsThreshold;
            if (!testResult.coverage.meetsThreshold) {
                issues.push(`Coverage (${testResult.coverage.lines.toFixed(1)}%) below threshold`);
                recommendations.push('Add more tests to improve coverage');
            }
        }

        // Make final decision
        const passed = issues.length === 0;
        const reason = passed
            ? 'All verification criteria met'
            : issues.join('; ');

        logInfo(`[Decision] Verdict: ${passed ? 'PASS' : 'FAIL'} - ${reason}`);

        return {
            passed,
            reason,
            details,
            recommendations: passed ? undefined : recommendations
        };
    }

    /**
     * Quick check if tests alone pass
     */
    testsPassing(testResult: TestResult): boolean {
        return testResult.passed && testResult.failed === 0;
    }

    /**
     * Quick check if AC match alone passes
     */
    acMatching(matchResult: MatchResult): boolean {
        return matchResult.score >= this.config.minACMatchScore;
    }

    /**
     * Generate a human-readable summary
     */
    generateSummary(result: DecisionResult): string {
        const lines: string[] = [];
        const icon = result.passed ? '✅' : '❌';

        lines.push(`${icon} Verification ${result.passed ? 'PASSED' : 'FAILED'}`);
        lines.push('');
        lines.push(`**Reason:** ${result.reason}`);
        lines.push('');
        lines.push('**Details:**');

        if (result.details.testPassRate !== undefined) {
            const testIcon = result.details.testsPass ? '✓' : '✗';
            lines.push(`  ${testIcon} Tests: ${(result.details.testPassRate * 100).toFixed(1)}% pass rate`);
        }

        if (result.details.acMatchScore !== undefined) {
            const acIcon = result.details.acMatchScore >= this.config.minACMatchScore ? '✓' : '✗';
            lines.push(`  ${acIcon} Acceptance Criteria: ${(result.details.acMatchScore * 100).toFixed(1)}% matched`);
        }

        if (result.details.coverageMet !== undefined) {
            const covIcon = result.details.coverageMet ? '✓' : '✗';
            lines.push(`  ${covIcon} Coverage: ${result.details.coverageMet ? 'Met' : 'Not met'}`);
        }

        if (result.recommendations && result.recommendations.length > 0) {
            lines.push('');
            lines.push('**Recommendations:**');
            for (const rec of result.recommendations) {
                lines.push(`  - ${rec}`);
            }
        }

        if (result.details.failedCriteria && result.details.failedCriteria.length > 0) {
            lines.push('');
            lines.push('**Unmet Criteria:**');
            for (const criterion of result.details.failedCriteria.slice(0, 5)) {
                lines.push(`  - ${criterion}`);
            }
            if (result.details.failedCriteria.length > 5) {
                lines.push(`  ... and ${result.details.failedCriteria.length - 5} more`);
            }
        }

        return lines.join('\n');
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new VerificationDecision instance
 */
export function createDecision(config?: Partial<DecisionConfig>): VerificationDecision {
    return new VerificationDecision(config);
}
