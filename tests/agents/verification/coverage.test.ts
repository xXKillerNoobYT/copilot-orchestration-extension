/**
 * Tests for Code Coverage Analysis
 *
 * Tests for coverage threshold checking and reporting.
 */

import {
    CoverageAnalyzer,
    CoverageMetrics,
    FileCoverage,
    CoverageReport,
    CoverageThresholds,
    initializeCoverageAnalyzer,
    getCoverageAnalyzer,
    resetCoverageAnalyzer,
} from '../../../src/agents/verification/coverage';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo } from '../../../src/logger';

describe('CoverageAnalyzer', () => {
    let analyzer: CoverageAnalyzer;

    const createMetrics = (overrides: Partial<CoverageMetrics> = {}): CoverageMetrics => ({
        lines: 80,
        branches: 75,
        functions: 85,
        statements: 82,
        ...overrides,
    });

    const createFileCoverage = (overrides: Partial<FileCoverage> = {}): FileCoverage => ({
        filePath: 'src/test.ts',
        metrics: createMetrics(),
        uncoveredLines: [10, 20, 30],
        uncoveredBranches: [{ line: 15, branch: 1 }],
        ...overrides,
    });

    const createReport = (overrides: Partial<CoverageReport> = {}): CoverageReport => ({
        summary: createMetrics(),
        files: [],
        changedFiles: [],
        meetsThresholds: true,
        violations: [],
        generatedAt: new Date(),
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetCoverageAnalyzer();
        analyzer = new CoverageAnalyzer();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create with default thresholds', () => {
            const analyzer = new CoverageAnalyzer();

            // Default thresholds: lines 80, branches 70, functions 80, statements 80
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 79, branches: 69, functions: 79, statements: 79
            }));

            expect(violations.length).toBe(4);
        });

        it('Test 2: should accept custom thresholds', () => {
            const analyzer = new CoverageAnalyzer({ lines: 50, branches: 50 });

            const violations = analyzer.checkThresholds(createMetrics({
                lines: 60, branches: 60, functions: 85, statements: 85
            }));

            // Should have no violations for lines/branches but passes functions/statements
            expect(violations.length).toBe(0);
        });

        it('Test 3: should merge partial thresholds with defaults', () => {
            const analyzer = new CoverageAnalyzer({ lines: 90 });

            const violations = analyzer.checkThresholds(createMetrics({
                lines: 85, // Below custom 90
                branches: 75, // At default 70
                functions: 85, // At default 80
                statements: 85 // At default 80
            }));

            expect(violations.some(v => v.includes('Line coverage'))).toBe(true);
        });
    });

    // ============================================================================
    // analyzeCoverageFile Tests
    // ============================================================================
    describe('analyzeCoverageFile()', () => {
        it('Test 4: should return coverage report', async () => {
            const report = await analyzer.analyzeCoverageFile('coverage/coverage-final.json');

            expect(report).toBeDefined();
            expect(report.summary).toBeDefined();
            expect(report.generatedAt).toBeInstanceOf(Date);
        });

        it('Test 5: should log analysis', async () => {
            await analyzer.analyzeCoverageFile('coverage/coverage-final.json');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Analyzing coverage/coverage-final.json')
            );
        });

        it('Test 6: should check thresholds', async () => {
            const report = await analyzer.analyzeCoverageFile('coverage/coverage-final.json');

            expect(report.violations).toBeDefined();
            expect(report.meetsThresholds).toBeDefined();
        });
    });

    // ============================================================================
    // checkThresholds Tests
    // ============================================================================
    describe('checkThresholds()', () => {
        it('Test 7: should return empty array when all pass', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 90, branches: 85, functions: 90, statements: 90
            }));

            expect(violations).toEqual([]);
        });

        it('Test 8: should detect line coverage violation', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 50, branches: 85, functions: 90, statements: 90
            }));

            expect(violations.some(v => v.includes('Line coverage'))).toBe(true);
        });

        it('Test 9: should detect branch coverage violation', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 90, branches: 50, functions: 90, statements: 90
            }));

            expect(violations.some(v => v.includes('Branch coverage'))).toBe(true);
        });

        it('Test 10: should detect function coverage violation', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 90, branches: 85, functions: 50, statements: 90
            }));

            expect(violations.some(v => v.includes('Function coverage'))).toBe(true);
        });

        it('Test 11: should detect statement coverage violation', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 90, branches: 85, functions: 90, statements: 50
            }));

            expect(violations.some(v => v.includes('Statement coverage'))).toBe(true);
        });

        it('Test 12: should detect multiple violations', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 50, branches: 50, functions: 50, statements: 50
            }));

            expect(violations.length).toBe(4);
        });
    });

    // ============================================================================
    // compareCoverage Tests
    // ============================================================================
    describe('compareCoverage()', () => {
        it('Test 13: should calculate positive change', () => {
            const before = createMetrics({ lines: 70, branches: 60, functions: 75, statements: 72 });
            const after = createMetrics({ lines: 80, branches: 70, functions: 85, statements: 82 });

            const change = analyzer.compareCoverage(before, after);

            expect(change.lines).toBe(10);
            expect(change.branches).toBe(10);
            expect(change.functions).toBe(10);
            expect(change.statements).toBe(10);
        });

        it('Test 14: should calculate negative change', () => {
            const before = createMetrics({ lines: 80, branches: 70, functions: 85, statements: 82 });
            const after = createMetrics({ lines: 70, branches: 60, functions: 75, statements: 72 });

            const change = analyzer.compareCoverage(before, after);

            expect(change.lines).toBe(-10);
            expect(change.branches).toBe(-10);
        });

        it('Test 15: should handle no change', () => {
            const metrics = createMetrics();

            const change = analyzer.compareCoverage(metrics, metrics);

            expect(change.lines).toBe(0);
            expect(change.branches).toBe(0);
        });
    });

    // ============================================================================
    // recordFileCoverage Tests
    // ============================================================================
    describe('recordFileCoverage()', () => {
        it('Test 16: should store coverage', () => {
            const metrics = createMetrics();

            analyzer.recordFileCoverage('src/test.ts', metrics);

            expect(analyzer.getPreviousCoverage('src/test.ts')).toEqual(metrics);
        });

        it('Test 17: should overwrite previous coverage', () => {
            const metrics1 = createMetrics({ lines: 50 });
            const metrics2 = createMetrics({ lines: 80 });

            analyzer.recordFileCoverage('src/test.ts', metrics1);
            analyzer.recordFileCoverage('src/test.ts', metrics2);

            expect(analyzer.getPreviousCoverage('src/test.ts')?.lines).toBe(80);
        });
    });

    // ============================================================================
    // getPreviousCoverage Tests
    // ============================================================================
    describe('getPreviousCoverage()', () => {
        it('Test 18: should return undefined for unknown file', () => {
            expect(analyzer.getPreviousCoverage('unknown.ts')).toBeUndefined();
        });

        it('Test 19: should return stored metrics', () => {
            const metrics = createMetrics({ lines: 95 });
            analyzer.recordFileCoverage('src/known.ts', metrics);

            expect(analyzer.getPreviousCoverage('src/known.ts')?.lines).toBe(95);
        });
    });

    // ============================================================================
    // findRegressions Tests
    // ============================================================================
    describe('findRegressions()', () => {
        it('Test 20: should detect line coverage regression', () => {
            const current = [createFileCoverage({
                filePath: 'src/test.ts',
                metrics: createMetrics({ lines: 50 }) // Big drop
            })];

            const previous = new Map([
                ['src/test.ts', createMetrics({ lines: 80 })]
            ]);

            const regressions = analyzer.findRegressions(current, previous);

            expect(regressions.length).toBe(1);
            expect(regressions[0].filePath).toBe('src/test.ts');
        });

        it('Test 21: should detect branch coverage regression', () => {
            const current = [createFileCoverage({
                filePath: 'src/test.ts',
                metrics: createMetrics({ branches: 50 })
            })];

            const previous = new Map([
                ['src/test.ts', createMetrics({ branches: 80 })]
            ]);

            const regressions = analyzer.findRegressions(current, previous);

            expect(regressions.length).toBe(1);
        });

        it('Test 22: should detect function coverage regression', () => {
            const current = [createFileCoverage({
                filePath: 'src/test.ts',
                metrics: createMetrics({ functions: 50 })
            })];

            const previous = new Map([
                ['src/test.ts', createMetrics({ functions: 80 })]
            ]);

            const regressions = analyzer.findRegressions(current, previous);

            expect(regressions.length).toBe(1);
        });

        it('Test 23: should allow 5% tolerance', () => {
            const current = [createFileCoverage({
                filePath: 'src/test.ts',
                metrics: createMetrics({ lines: 76 }) // Only 4% drop
            })];

            const previous = new Map([
                ['src/test.ts', createMetrics({ lines: 80 })]
            ]);

            const regressions = analyzer.findRegressions(current, previous);

            expect(regressions.length).toBe(0);
        });

        it('Test 24: should return empty array for new files', () => {
            const current = [createFileCoverage({
                filePath: 'src/new.ts'
            })];

            const previous = new Map();

            const regressions = analyzer.findRegressions(current, previous);

            expect(regressions).toEqual([]);
        });
    });

    // ============================================================================
    // generateBadge Tests
    // ============================================================================
    describe('generateBadge()', () => {
        it('Test 25: should return brightgreen for 90%+', () => {
            const badge = analyzer.generateBadge(createMetrics({
                lines: 95, branches: 95, functions: 95, statements: 95
            }));

            expect(badge.color).toBe('brightgreen');
            expect(badge.label).toContain('95%');
        });

        it('Test 26: should return green for 80-89%', () => {
            const badge = analyzer.generateBadge(createMetrics({
                lines: 84, branches: 84, functions: 84, statements: 84
            }));

            expect(badge.color).toBe('green');
        });

        it('Test 27: should return yellow for 70-79%', () => {
            const badge = analyzer.generateBadge(createMetrics({
                lines: 74, branches: 74, functions: 74, statements: 74
            }));

            expect(badge.color).toBe('yellow');
        });

        it('Test 28: should return orange for 60-69%', () => {
            const badge = analyzer.generateBadge(createMetrics({
                lines: 64, branches: 64, functions: 64, statements: 64
            }));

            expect(badge.color).toBe('orange');
        });

        it('Test 29: should return red for below 60%', () => {
            const badge = analyzer.generateBadge(createMetrics({
                lines: 50, branches: 50, functions: 50, statements: 50
            }));

            expect(badge.color).toBe('red');
        });

        it('Test 30: should calculate average', () => {
            const badge = analyzer.generateBadge(createMetrics({
                lines: 100, branches: 80, functions: 80, statements: 80
            }));

            // (100 + 80 + 80 + 80) / 4 = 85%
            expect(badge.label).toContain('85%');
        });
    });

    // ============================================================================
    // suggestFilesForTesting Tests
    // ============================================================================
    describe('suggestFilesForTesting()', () => {
        it('Test 31: should sort by coverage ascending', () => {
            const files = [
                createFileCoverage({ filePath: 'high.ts', metrics: createMetrics({ lines: 90 }), uncoveredLines: Array(20).fill(0) }),
                createFileCoverage({ filePath: 'low.ts', metrics: createMetrics({ lines: 30 }), uncoveredLines: Array(20).fill(0) }),
                createFileCoverage({ filePath: 'mid.ts', metrics: createMetrics({ lines: 60 }), uncoveredLines: Array(20).fill(0) }),
            ];

            const suggestions = analyzer.suggestFilesForTesting(files);

            expect(suggestions[0].filePath).toBe('low.ts');
        });

        it('Test 32: should limit results', () => {
            const files = Array(10).fill(null).map((_, i) =>
                createFileCoverage({
                    filePath: `file${i}.ts`,
                    metrics: createMetrics({ lines: i * 10 }),
                    uncoveredLines: Array(20).fill(0)
                })
            );

            const suggestions = analyzer.suggestFilesForTesting(files, 3);

            expect(suggestions.length).toBe(3);
        });

        it('Test 33: should use default limit of 5', () => {
            const files = Array(10).fill(null).map((_, i) =>
                createFileCoverage({
                    filePath: `file${i}.ts`,
                    metrics: createMetrics({ lines: i * 10 }),
                    uncoveredLines: Array(20).fill(0)
                })
            );

            const suggestions = analyzer.suggestFilesForTesting(files);

            expect(suggestions.length).toBe(5);
        });

        it('Test 34: should filter files with <10 uncovered lines', () => {
            const files = [
                createFileCoverage({ filePath: 'few.ts', uncoveredLines: [1, 2, 3] }), // Only 3
                createFileCoverage({ filePath: 'many.ts', uncoveredLines: Array(20).fill(0) }), // 20
            ];

            const suggestions = analyzer.suggestFilesForTesting(files);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].filePath).toBe('many.ts');
        });
    });

    // ============================================================================
    // formatReport Tests
    // ============================================================================
    describe('formatReport()', () => {
        it('Test 35: should include title', () => {
            const report = analyzer.formatReport(createReport());

            expect(report).toContain('# Coverage Report');
        });

        it('Test 36: should include summary metrics', () => {
            const report = analyzer.formatReport(createReport({
                summary: createMetrics({ lines: 85, branches: 75, functions: 90, statements: 82 })
            }));

            expect(report).toContain('Lines: 85%');
            expect(report).toContain('Branches: 75%');
            expect(report).toContain('Functions: 90%');
            expect(report).toContain('Statements: 82%');
        });

        it('Test 37: should show success when thresholds met', () => {
            const report = analyzer.formatReport(createReport({
                meetsThresholds: true
            }));

            expect(report).toContain('✅');
            expect(report).toContain('thresholds met');
        });

        it('Test 38: should show failures when thresholds not met', () => {
            const report = analyzer.formatReport(createReport({
                meetsThresholds: false,
                violations: ['Line coverage 50% below threshold 80%']
            }));

            expect(report).toContain('❌');
            expect(report).toContain('Line coverage 50% below threshold 80%');
        });

        it('Test 39: should show changed files', () => {
            const report = analyzer.formatReport(createReport({
                changedFiles: [{
                    filePath: 'src/test.ts',
                    before: createMetrics({ lines: 70 }),
                    after: createMetrics({ lines: 80 }),
                    change: createMetrics({ lines: 10 })
                }]
            }));

            expect(report).toContain('Coverage Changes');
            expect(report).toContain('src/test.ts');
            expect(report).toContain('+10%');
        });

        it('Test 40: should show negative changes', () => {
            const report = analyzer.formatReport(createReport({
                changedFiles: [{
                    filePath: 'src/test.ts',
                    before: createMetrics({ lines: 80 }),
                    after: createMetrics({ lines: 70 }),
                    change: createMetrics({ lines: -10 })
                }]
            }));

            expect(report).toContain('-10%');
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 41: initializeCoverageAnalyzer should create instance', () => {
            const instance = initializeCoverageAnalyzer();

            expect(instance).toBeInstanceOf(CoverageAnalyzer);
        });

        it('Test 42: initializeCoverageAnalyzer should accept thresholds', () => {
            const instance = initializeCoverageAnalyzer({ lines: 50 });

            // Should not violate 50% threshold
            const violations = instance.checkThresholds(createMetrics({ lines: 60 }));
            expect(violations.some(v => v.includes('Line'))).toBe(false);
        });

        it('Test 43: getCoverageAnalyzer should return singleton', () => {
            const instance1 = getCoverageAnalyzer();
            const instance2 = getCoverageAnalyzer();

            expect(instance1).toBe(instance2);
        });

        it('Test 44: getCoverageAnalyzer should create if not initialized', () => {
            resetCoverageAnalyzer();

            const instance = getCoverageAnalyzer();

            expect(instance).toBeInstanceOf(CoverageAnalyzer);
        });

        it('Test 45: resetCoverageAnalyzer should clear instance', () => {
            const instance1 = getCoverageAnalyzer();
            resetCoverageAnalyzer();
            const instance2 = getCoverageAnalyzer();

            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 46: should handle zero coverage', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 0, branches: 0, functions: 0, statements: 0
            }));

            expect(violations.length).toBe(4);
        });

        it('Test 47: should handle 100% coverage', () => {
            const violations = analyzer.checkThresholds(createMetrics({
                lines: 100, branches: 100, functions: 100, statements: 100
            }));

            expect(violations.length).toBe(0);
        });

        it('Test 48: should handle empty file list', () => {
            const suggestions = analyzer.suggestFilesForTesting([]);

            expect(suggestions).toEqual([]);
        });

        it('Test 49: should handle empty previous coverage map', () => {
            const current = [createFileCoverage()];
            const previous = new Map<string, CoverageMetrics>();

            const regressions = analyzer.findRegressions(current, previous);

            expect(regressions).toEqual([]);
        });

        it('Test 50: should handle report with no changed files section', () => {
            const report = analyzer.formatReport(createReport({
                changedFiles: []
            }));

            expect(report).not.toContain('Coverage Changes');
        });
    });
});
