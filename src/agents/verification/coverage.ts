/**
 * Code Coverage Analysis
 * 
 * **Simple explanation**: Tracks how much of the code is tested.
 * Like a map showing which parts of a building have been inspected.
 * 
 * @module agents/verification/coverage
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Coverage metrics
 */
export interface CoverageMetrics {
    /** Line coverage percentage */
    lines: number;
    /** Branch coverage percentage */
    branches: number;
    /** Function coverage percentage */
    functions: number;
    /** Statement coverage percentage */
    statements: number;
}

/**
 * File coverage details
 */
export interface FileCoverage {
    /** File path */
    filePath: string;
    /** Coverage metrics */
    metrics: CoverageMetrics;
    /** Uncovered line numbers */
    uncoveredLines: number[];
    /** Uncovered branches */
    uncoveredBranches: { line: number; branch: number }[];
}

/**
 * Coverage report
 */
export interface CoverageReport {
    /** Summary metrics */
    summary: CoverageMetrics;
    /** Per-file coverage */
    files: FileCoverage[];
    /** Files with coverage changes */
    changedFiles: {
        filePath: string;
        before: CoverageMetrics;
        after: CoverageMetrics;
        change: CoverageMetrics;
    }[];
    /** Meets thresholds */
    meetsThresholds: boolean;
    /** Threshold violations */
    violations: string[];
    /** Generated at */
    generatedAt: Date;
}

/**
 * Coverage thresholds configuration
 */
export interface CoverageThresholds {
    /** Minimum line coverage */
    lines: number;
    /** Minimum branch coverage */
    branches: number;
    /** Minimum function coverage */
    functions: number;
    /** Minimum statement coverage */
    statements: number;
}

const DEFAULT_THRESHOLDS: CoverageThresholds = {
    lines: 80,
    branches: 70,
    functions: 80,
    statements: 80
};

/**
 * Coverage Analyzer
 */
export class CoverageAnalyzer {
    private thresholds: CoverageThresholds;
    private history: Map<string, CoverageMetrics> = new Map();

    constructor(thresholds: Partial<CoverageThresholds> = {}) {
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    }

    /**
     * Analyze coverage from a coverage-final.json file
     */
    async analyzeCoverageFile(coveragePath: string): Promise<CoverageReport> {
        logInfo(`[Coverage] Analyzing ${coveragePath}`);

        // This would load and parse the coverage file
        // For now, return a placeholder structure
        const summary: CoverageMetrics = {
            lines: 0,
            branches: 0,
            functions: 0,
            statements: 0
        };

        const violations = this.checkThresholds(summary);

        return {
            summary,
            files: [],
            changedFiles: [],
            meetsThresholds: violations.length === 0,
            violations,
            generatedAt: new Date()
        };
    }

    /**
     * Check coverage against thresholds
     */
    checkThresholds(metrics: CoverageMetrics): string[] {
        const violations: string[] = [];

        if (metrics.lines < this.thresholds.lines) {
            violations.push(`Line coverage ${metrics.lines}% below threshold ${this.thresholds.lines}%`);
        }
        if (metrics.branches < this.thresholds.branches) {
            violations.push(`Branch coverage ${metrics.branches}% below threshold ${this.thresholds.branches}%`);
        }
        if (metrics.functions < this.thresholds.functions) {
            violations.push(`Function coverage ${metrics.functions}% below threshold ${this.thresholds.functions}%`);
        }
        if (metrics.statements < this.thresholds.statements) {
            violations.push(`Statement coverage ${metrics.statements}% below threshold ${this.thresholds.statements}%`);
        }

        return violations;
    }

    /**
     * Compare coverage with previous run
     */
    compareCoverage(before: CoverageMetrics, after: CoverageMetrics): CoverageMetrics {
        return {
            lines: after.lines - before.lines,
            branches: after.branches - before.branches,
            functions: after.functions - before.functions,
            statements: after.statements - before.statements
        };
    }

    /**
     * Record coverage for a file
     */
    recordFileCoverage(filePath: string, metrics: CoverageMetrics): void {
        this.history.set(filePath, metrics);
    }

    /**
     * Get previous coverage for a file
     */
    getPreviousCoverage(filePath: string): CoverageMetrics | undefined {
        return this.history.get(filePath);
    }

    /**
     * Identify files with decreased coverage
     */
    findRegressions(
        currentFiles: FileCoverage[],
        previousFiles: Map<string, CoverageMetrics>
    ): FileCoverage[] {
        const regressions: FileCoverage[] = [];

        for (const file of currentFiles) {
            const previous = previousFiles.get(file.filePath);
            if (previous) {
                // Check for coverage decrease
                if (file.metrics.lines < previous.lines - 5 || // 5% tolerance
                    file.metrics.branches < previous.branches - 5 ||
                    file.metrics.functions < previous.functions - 5) {
                    regressions.push(file);
                }
            }
        }

        return regressions;
    }

    /**
     * Generate coverage badge text
     */
    generateBadge(metrics: CoverageMetrics): { label: string; color: string } {
        const avg = (metrics.lines + metrics.branches + metrics.functions + metrics.statements) / 4;

        let color: string;
        if (avg >= 90) color = 'brightgreen';
        else if (avg >= 80) color = 'green';
        else if (avg >= 70) color = 'yellow';
        else if (avg >= 60) color = 'orange';
        else color = 'red';

        return {
            label: `coverage: ${Math.round(avg)}%`,
            color
        };
    }

    /**
     * Suggest files to add tests for
     */
    suggestFilesForTesting(files: FileCoverage[], limit: number = 5): FileCoverage[] {
        // Sort by coverage (lowest first) and filter to files with significant code
        return files
            .filter(f => f.uncoveredLines.length > 10) // At least 10 uncovered lines
            .sort((a, b) => a.metrics.lines - b.metrics.lines)
            .slice(0, limit);
    }

    /**
     * Format coverage report as text
     */
    formatReport(report: CoverageReport): string {
        const lines = ['# Coverage Report', ''];

        // Summary
        lines.push('## Summary');
        lines.push(`- Lines: ${report.summary.lines}%`);
        lines.push(`- Branches: ${report.summary.branches}%`);
        lines.push(`- Functions: ${report.summary.functions}%`);
        lines.push(`- Statements: ${report.summary.statements}%`);
        lines.push('');

        // Thresholds
        if (report.meetsThresholds) {
            lines.push('✅ All coverage thresholds met');
        } else {
            lines.push('❌ Coverage thresholds not met:');
            for (const v of report.violations) {
                lines.push(`  - ${v}`);
            }
        }
        lines.push('');

        // Changed files
        if (report.changedFiles.length > 0) {
            lines.push('## Coverage Changes');
            for (const change of report.changedFiles) {
                const delta = change.change.lines >= 0 ? `+${change.change.lines}` : `${change.change.lines}`;
                lines.push(`- ${change.filePath}: ${delta}%`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}

// Singleton instance
let instance: CoverageAnalyzer | null = null;

/**
 * Initialize coverage analyzer
 */
export function initializeCoverageAnalyzer(thresholds?: Partial<CoverageThresholds>): CoverageAnalyzer {
    instance = new CoverageAnalyzer(thresholds);
    return instance;
}

/**
 * Get coverage analyzer
 */
export function getCoverageAnalyzer(): CoverageAnalyzer {
    if (!instance) {
        instance = new CoverageAnalyzer();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetCoverageAnalyzer(): void {
    instance = null;
}
