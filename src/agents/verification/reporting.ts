/**
 * Verification Result Reporting
 * 
 * **Simple explanation**: Creates structured reports of verification results,
 * including what passed, what failed, and why. Like a test results summary
 * that tells you exactly what you need to fix.
 * 
 * @module agents/verification/reporting
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Individual criterion result
 */
export interface CriterionResult {
    /** Criterion text */
    criterion: string;
    /** Whether it passed */
    passed: boolean;
    /** Evidence or reason */
    evidence: string;
    /** Match confidence (0-1) */
    confidence: number;
}

/**
 * Test result detail
 */
export interface TestResultDetail {
    /** Test name */
    name: string;
    /** Test file */
    file: string;
    /** Pass/fail status */
    status: 'passed' | 'failed' | 'skipped';
    /** Duration in ms */
    duration?: number;
    /** Error message if failed */
    error?: string;
    /** Expected value */
    expected?: string;
    /** Actual value */
    actual?: string;
}

/**
 * Coverage result
 */
export interface CoverageResult {
    /** Metric name (lines, branches, functions, statements) */
    metric: string;
    /** Percentage covered */
    percentage: number;
    /** Threshold required */
    threshold: number;
    /** Whether threshold is met */
    met: boolean;
}

/**
 * Full verification report
 */
export interface VerificationReport {
    /** Task ID being verified */
    taskId: string;
    /** Overall pass/fail */
    passed: boolean;
    /** Timestamp */
    timestamp: number;
    /** Summary message */
    summary: string;
    /** Acceptance criteria results */
    criteriaResults: CriterionResult[];
    /** Criteria passed count */
    criteriaPassed: number;
    /** Criteria total count */
    criteriaTotal: number;
    /** Test results */
    testResults: TestResultDetail[];
    /** Tests passed count */
    testsPassed: number;
    /** Tests failed count */
    testsFailed: number;
    /** Tests skipped count */
    testsSkipped: number;
    /** Coverage results */
    coverage?: CoverageResult[];
    /** Files modified */
    modifiedFiles: string[];
    /** Duration of verification (ms) */
    duration: number;
    /** Blocking issues */
    blockingIssues: string[];
    /** Warnings (non-blocking) */
    warnings: string[];
}

/**
 * Report format options
 */
export type ReportFormat = 'text' | 'markdown' | 'json' | 'html';

/**
 * Verification Reporter
 * 
 * **Simple explanation**: Collects verification results and generates
 * human-readable reports in various formats.
 */
export class VerificationReporter {
    private reports: Map<string, VerificationReport> = new Map();

    /**
     * Create a new report
     */
    public createReport(
        taskId: string,
        criteriaResults: CriterionResult[],
        testResults: TestResultDetail[],
        modifiedFiles: string[],
        duration: number,
        coverage?: CoverageResult[]
    ): VerificationReport {
        const criteriaPassed = criteriaResults.filter(c => c.passed).length;
        const testsPassed = testResults.filter(t => t.status === 'passed').length;
        const testsFailed = testResults.filter(t => t.status === 'failed').length;
        const testsSkipped = testResults.filter(t => t.status === 'skipped').length;

        // Check for blocking issues
        const blockingIssues: string[] = [];
        const warnings: string[] = [];

        // Failed criteria are blocking
        for (const c of criteriaResults) {
            if (!c.passed) {
                blockingIssues.push(`Criterion not met: "${c.criterion.substring(0, 100)}..."`);
            }
        }

        // Failed tests are blocking
        for (const t of testResults) {
            if (t.status === 'failed') {
                blockingIssues.push(`Test failed: ${t.name} - ${t.error?.substring(0, 100) || 'Unknown error'}`);
            }
        }

        // Coverage below threshold is blocking
        if (coverage) {
            for (const c of coverage) {
                if (!c.met) {
                    blockingIssues.push(`Coverage threshold not met: ${c.metric} at ${c.percentage.toFixed(1)}% (need ${c.threshold}%)`);
                }
            }
        }

        // Skipped tests are warnings
        if (testsSkipped > 0) {
            warnings.push(`${testsSkipped} tests were skipped`);
        }

        const passed = blockingIssues.length === 0;

        const report: VerificationReport = {
            taskId,
            passed,
            timestamp: Date.now(),
            summary: passed
                ? `✅ All ${criteriaPassed} criteria met, ${testsPassed} tests passed`
                : `❌ ${blockingIssues.length} blocking issues found`,
            criteriaResults,
            criteriaPassed,
            criteriaTotal: criteriaResults.length,
            testResults,
            testsPassed,
            testsFailed,
            testsSkipped,
            coverage,
            modifiedFiles,
            duration,
            blockingIssues,
            warnings
        };

        this.reports.set(taskId, report);
        logInfo(`[Reporter] Created report for task ${taskId}: ${report.summary}`);

        return report;
    }

    /**
     * Format report as text
     */
    public formatAsText(report: VerificationReport): string {
        const lines: string[] = [
            `============================================`,
            `VERIFICATION REPORT: ${report.taskId}`,
            `============================================`,
            `Status: ${report.passed ? 'PASSED ✅' : 'FAILED ❌'}`,
            `Time: ${new Date(report.timestamp).toISOString()}`,
            `Duration: ${(report.duration / 1000).toFixed(1)}s`,
            ``,
            `--- ACCEPTANCE CRITERIA ---`,
            `${report.criteriaPassed}/${report.criteriaTotal} passed`,
        ];

        for (const c of report.criteriaResults) {
            lines.push(`  ${c.passed ? '✓' : '✗'} ${c.criterion.substring(0, 80)}`);
            if (!c.passed) {
                lines.push(`    → ${c.evidence}`);
            }
        }

        lines.push(``, `--- TESTS ---`, `Passed: ${report.testsPassed}, Failed: ${report.testsFailed}, Skipped: ${report.testsSkipped}`);

        if (report.testsFailed > 0) {
            lines.push(``, `Failed tests:`);
            for (const t of report.testResults.filter(t => t.status === 'failed')) {
                lines.push(`  ✗ ${t.name}`);
                if (t.error) lines.push(`    Error: ${t.error.substring(0, 100)}`);
            }
        }

        if (report.coverage) {
            lines.push(``, `--- COVERAGE ---`);
            for (const c of report.coverage) {
                lines.push(`  ${c.met ? '✓' : '✗'} ${c.metric}: ${c.percentage.toFixed(1)}% (threshold: ${c.threshold}%)`);
            }
        }

        if (report.blockingIssues.length > 0) {
            lines.push(``, `--- BLOCKING ISSUES ---`);
            for (const issue of report.blockingIssues) {
                lines.push(`  • ${issue}`);
            }
        }

        if (report.warnings.length > 0) {
            lines.push(``, `--- WARNINGS ---`);
            for (const warning of report.warnings) {
                lines.push(`  ⚠ ${warning}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Format report as Markdown
     */
    public formatAsMarkdown(report: VerificationReport): string {
        const lines: string[] = [
            `# Verification Report: ${report.taskId}`,
            ``,
            `**Status**: ${report.passed ? '✅ PASSED' : '❌ FAILED'}  `,
            `**Time**: ${new Date(report.timestamp).toISOString()}  `,
            `**Duration**: ${(report.duration / 1000).toFixed(1)}s`,
            ``,
            `## Acceptance Criteria`,
            ``,
            `| Status | Criterion |`,
            `|--------|-----------|`,
        ];

        for (const c of report.criteriaResults) {
            lines.push(`| ${c.passed ? '✅' : '❌'} | ${c.criterion.replace(/\|/g, '\\|').substring(0, 80)} |`);
        }

        lines.push(``, `## Test Results`, ``, `- **Passed**: ${report.testsPassed}`, `- **Failed**: ${report.testsFailed}`, `- **Skipped**: ${report.testsSkipped}`);

        if (report.testsFailed > 0) {
            lines.push(``, `### Failed Tests`, ``);
            for (const t of report.testResults.filter(t => t.status === 'failed')) {
                lines.push(`- **${t.name}**`);
                if (t.error) lines.push(`  - Error: \`${t.error.substring(0, 100)}\``);
                if (t.expected && t.actual) {
                    lines.push(`  - Expected: \`${t.expected}\``);
                    lines.push(`  - Actual: \`${t.actual}\``);
                }
            }
        }

        if (report.coverage) {
            lines.push(``, `## Coverage`, ``, `| Metric | Coverage | Threshold | Status |`, `|--------|----------|-----------|--------|`);
            for (const c of report.coverage) {
                lines.push(`| ${c.metric} | ${c.percentage.toFixed(1)}% | ${c.threshold}% | ${c.met ? '✅' : '❌'} |`);
            }
        }

        if (report.blockingIssues.length > 0) {
            lines.push(``, `## ⛔ Blocking Issues`, ``);
            for (const issue of report.blockingIssues) {
                lines.push(`- ${issue}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Format report as JSON
     */
    public formatAsJson(report: VerificationReport): string {
        return JSON.stringify(report, null, 2);
    }

    /**
     * Get report by task ID
     */
    public getReport(taskId: string): VerificationReport | undefined {
        return this.reports.get(taskId);
    }

    /**
     * Get all reports
     */
    public getAllReports(): VerificationReport[] {
        return Array.from(this.reports.values());
    }

    /**
     * Format report in requested format
     */
    public format(report: VerificationReport, format: ReportFormat): string {
        switch (format) {
            case 'markdown':
                return this.formatAsMarkdown(report);
            case 'json':
                return this.formatAsJson(report);
            case 'html':
                // For now, wrap markdown in basic HTML
                return `<html><body><pre>${this.formatAsMarkdown(report)}</pre></body></html>`;
            case 'text':
            default:
                return this.formatAsText(report);
        }
    }

    /**
     * Clear all reports
     */
    public clear(): void {
        this.reports.clear();
    }
}

// Singleton instance
let reporterInstance: VerificationReporter | null = null;

/**
 * Get the singleton VerificationReporter instance
 */
export function getVerificationReporter(): VerificationReporter {
    if (!reporterInstance) {
        reporterInstance = new VerificationReporter();
    }
    return reporterInstance;
}

/**
 * Reset for testing
 */
export function resetVerificationReporterForTests(): void {
    reporterInstance = null;
}
