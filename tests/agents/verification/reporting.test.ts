/**
 * Tests for Verification Result Reporting
 *
 * Tests for creating structured verification reports.
 */

import {
    VerificationReporter,
    CriterionResult,
    TestResultDetail,
    CoverageResult,
    VerificationReport,
    getVerificationReporter,
    resetVerificationReporterForTests,
} from '../../../src/agents/verification/reporting';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo } from '../../../src/logger';

describe('VerificationReporter', () => {
    let reporter: VerificationReporter;

    const createCriterion = (overrides?: Partial<CriterionResult>): CriterionResult => ({
        criterion: 'Test criterion',
        passed: true,
        evidence: 'Evidence found',
        confidence: 1.0,
        ...overrides,
    });

    const createTestResult = (overrides?: Partial<TestResultDetail>): TestResultDetail => ({
        name: 'Test case',
        file: 'test.ts',
        status: 'passed',
        duration: 100,
        ...overrides,
    });

    const createCoverage = (overrides?: Partial<CoverageResult>): CoverageResult => ({
        metric: 'lines',
        percentage: 85,
        threshold: 80,
        met: true,
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetVerificationReporterForTests();
        reporter = new VerificationReporter();
    });

    afterEach(() => {
        reporter.clear();
    });

    // ============================================================================
    // createReport Tests
    // ============================================================================
    describe('createReport()', () => {
        it('Test 1: should create passing report when all criteria pass', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: true })],
                [createTestResult({ status: 'passed' })],
                ['file.ts'],
                1000
            );

            expect(report.passed).toBe(true);
        });

        it('Test 2: should create failing report when criteria fail', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: false })],
                [createTestResult({ status: 'passed' })],
                [],
                1000
            );

            expect(report.passed).toBe(false);
        });

        it('Test 3: should count criteria correctly', () => {
            const report = reporter.createReport(
                'task-1',
                [
                    createCriterion({ passed: true }),
                    createCriterion({ passed: false }),
                    createCriterion({ passed: true }),
                ],
                [],
                [],
                1000
            );

            expect(report.criteriaPassed).toBe(2);
            expect(report.criteriaTotal).toBe(3);
        });

        it('Test 4: should count tests correctly', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [
                    createTestResult({ status: 'passed' }),
                    createTestResult({ status: 'failed' }),
                    createTestResult({ status: 'skipped' }),
                    createTestResult({ status: 'passed' }),
                ],
                [],
                1000
            );

            expect(report.testsPassed).toBe(2);
            expect(report.testsFailed).toBe(1);
            expect(report.testsSkipped).toBe(1);
        });

        it('Test 5: should identify blocking issues from failed criteria', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: false, criterion: 'Must work' })],
                [],
                [],
                1000
            );

            expect(report.blockingIssues).toContainEqual(expect.stringContaining('Must work'));
        });

        it('Test 6: should identify blocking issues from failed tests', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({ status: 'failed', name: 'myTest', error: 'Assertion error' })],
                [],
                1000
            );

            expect(report.blockingIssues).toContainEqual(expect.stringContaining('myTest'));
        });

        it('Test 7: should identify blocking issues from coverage', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [],
                [],
                1000,
                [createCoverage({ met: false, metric: 'branches', percentage: 50, threshold: 80 })]
            );

            expect(report.blockingIssues).toContainEqual(expect.stringContaining('branches'));
        });

        it('Test 8: should add warning for skipped tests', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({ status: 'skipped' })],
                [],
                1000
            );

            expect(report.warnings).toContainEqual(expect.stringContaining('skipped'));
        });

        it('Test 9: should set timestamp', () => {
            const before = Date.now();
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const after = Date.now();

            expect(report.timestamp).toBeGreaterThanOrEqual(before);
            expect(report.timestamp).toBeLessThanOrEqual(after);
        });

        it('Test 10: should generate passing summary', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: true })],
                [createTestResult({ status: 'passed' })],
                [],
                1000
            );

            expect(report.summary).toContain('✅');
            expect(report.summary).toContain('1 criteria met');
        });

        it('Test 11: should generate failing summary', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: false })],
                [],
                [],
                1000
            );

            expect(report.summary).toContain('❌');
            expect(report.summary).toContain('blocking issues');
        });

        it('Test 12: should store report', () => {
            reporter.createReport('task-1', [], [], [], 1000);

            expect(reporter.getReport('task-1')).toBeDefined();
        });

        it('Test 13: should log creation', () => {
            reporter.createReport('task-1', [], [], [], 1000);

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Created report'));
        });

        it('Test 14: should include coverage in report', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [],
                [],
                1000,
                [createCoverage()]
            );

            expect(report.coverage).toBeDefined();
            expect(report.coverage?.length).toBe(1);
        });

        it('Test 15: should include modified files', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [],
                ['file1.ts', 'file2.ts'],
                1000
            );

            expect(report.modifiedFiles).toEqual(['file1.ts', 'file2.ts']);
        });
    });

    // ============================================================================
    // formatAsText Tests
    // ============================================================================
    describe('formatAsText()', () => {
        it('Test 16: should include task ID', () => {
            const report = reporter.createReport('my-task', [], [], [], 1000);
            const text = reporter.formatAsText(report);

            expect(text).toContain('my-task');
        });

        it('Test 17: should show pass/fail status', () => {
            const passingReport = reporter.createReport('task-1', [], [], [], 1000);
            expect(reporter.formatAsText(passingReport)).toContain('PASSED ✅');

            const failingReport = reporter.createReport('task-2', [createCriterion({ passed: false })], [], [], 1000);
            expect(reporter.formatAsText(failingReport)).toContain('FAILED ❌');
        });

        it('Test 18: should format duration', () => {
            const report = reporter.createReport('task-1', [], [], [], 2500);
            const text = reporter.formatAsText(report);

            expect(text).toContain('2.5s');
        });

        it('Test 19: should show criteria results', () => {
            const report = reporter.createReport(
                'task-1',
                [
                    createCriterion({ criterion: 'Criterion A', passed: true }),
                    createCriterion({ criterion: 'Criterion B', passed: false, evidence: 'Not found' }),
                ],
                [],
                [],
                1000
            );
            const text = reporter.formatAsText(report);

            expect(text).toContain('✓ Criterion A');
            expect(text).toContain('✗ Criterion B');
            expect(text).toContain('Not found');
        });

        it('Test 20: should show test counts', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [
                    createTestResult({ status: 'passed' }),
                    createTestResult({ status: 'failed' }),
                ],
                [],
                1000
            );
            const text = reporter.formatAsText(report);

            expect(text).toContain('Passed: 1');
            expect(text).toContain('Failed: 1');
        });

        it('Test 21: should show failed test details', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({
                    name: 'testX',
                    status: 'failed',
                    error: 'Expected true'
                })],
                [],
                1000
            );
            const text = reporter.formatAsText(report);

            expect(text).toContain('testX');
            expect(text).toContain('Expected true');
        });

        it('Test 22: should show coverage results', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [],
                [],
                1000,
                [createCoverage({ metric: 'statements', percentage: 90, threshold: 80 })]
            );
            const text = reporter.formatAsText(report);

            expect(text).toContain('statements');
            expect(text).toContain('90.0%');
        });

        it('Test 23: should show blocking issues', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: false, criterion: 'Important' })],
                [],
                [],
                1000
            );
            const text = reporter.formatAsText(report);

            expect(text).toContain('BLOCKING ISSUES');
        });

        it('Test 24: should show warnings', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({ status: 'skipped' })],
                [],
                1000
            );
            const text = reporter.formatAsText(report);

            expect(text).toContain('WARNINGS');
            expect(text).toContain('skipped');
        });
    });

    // ============================================================================
    // formatAsMarkdown Tests
    // ============================================================================
    describe('formatAsMarkdown()', () => {
        it('Test 25: should include markdown headers', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const md = reporter.formatAsMarkdown(report);

            expect(md).toContain('# Verification Report');
        });

        it('Test 26: should format criteria as table', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ criterion: 'Test criterion' })],
                [],
                [],
                1000
            );
            const md = reporter.formatAsMarkdown(report);

            expect(md).toContain('| Status | Criterion |');
            expect(md).toContain('|--------|-----------|');
        });

        it('Test 27: should escape pipes in criteria', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ criterion: 'Has | pipe' })],
                [],
                [],
                1000
            );
            const md = reporter.formatAsMarkdown(report);

            expect(md).toContain('Has \\| pipe');
        });

        it('Test 28: should show failed test expected/actual', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({
                    name: 'myTest',
                    status: 'failed',
                    error: 'Mismatch',
                    expected: 'true',
                    actual: 'false'
                })],
                [],
                1000
            );
            const md = reporter.formatAsMarkdown(report);

            expect(md).toContain('Expected: `true`');
            expect(md).toContain('Actual: `false`');
        });

        it('Test 29: should format coverage as table', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [],
                [],
                1000,
                [createCoverage()]
            );
            const md = reporter.formatAsMarkdown(report);

            expect(md).toContain('| Metric | Coverage | Threshold | Status |');
        });

        it('Test 30: should show blocking issues section', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ passed: false })],
                [],
                [],
                1000
            );
            const md = reporter.formatAsMarkdown(report);

            expect(md).toContain('## ⛔ Blocking Issues');
        });
    });

    // ============================================================================
    // formatAsJson Tests
    // ============================================================================
    describe('formatAsJson()', () => {
        it('Test 31: should return valid JSON', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const json = reporter.formatAsJson(report);

            expect(() => JSON.parse(json)).not.toThrow();
        });

        it('Test 32: should include all fields', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const json = reporter.formatAsJson(report);
            const parsed = JSON.parse(json);

            expect(parsed.taskId).toBe('task-1');
            expect(parsed.passed).toBeDefined();
            expect(parsed.timestamp).toBeDefined();
        });
    });

    // ============================================================================
    // format Tests
    // ============================================================================
    describe('format()', () => {
        it('Test 33: should format as text by default', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const output = reporter.format(report, 'text');

            expect(output).toContain('VERIFICATION REPORT');
        });

        it('Test 34: should format as markdown', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const output = reporter.format(report, 'markdown');

            expect(output).toContain('# Verification Report');
        });

        it('Test 35: should format as JSON', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const output = reporter.format(report, 'json');

            expect(() => JSON.parse(output)).not.toThrow();
        });

        it('Test 36: should format as HTML', () => {
            const report = reporter.createReport('task-1', [], [], [], 1000);
            const output = reporter.format(report, 'html');

            expect(output).toContain('<html>');
            expect(output).toContain('</body>');
        });
    });

    // ============================================================================
    // getReport Tests
    // ============================================================================
    describe('getReport()', () => {
        it('Test 37: should return undefined for unknown task', () => {
            expect(reporter.getReport('unknown')).toBeUndefined();
        });

        it('Test 38: should return existing report', () => {
            reporter.createReport('task-1', [], [], [], 1000);

            const report = reporter.getReport('task-1');
            expect(report).toBeDefined();
            expect(report?.taskId).toBe('task-1');
        });
    });

    // ============================================================================
    // getAllReports Tests
    // ============================================================================
    describe('getAllReports()', () => {
        it('Test 39: should return empty array initially', () => {
            expect(reporter.getAllReports()).toEqual([]);
        });

        it('Test 40: should return all reports', () => {
            reporter.createReport('task-1', [], [], [], 1000);
            reporter.createReport('task-2', [], [], [], 1000);

            const reports = reporter.getAllReports();
            expect(reports.length).toBe(2);
        });
    });

    // ============================================================================
    // clear Tests
    // ============================================================================
    describe('clear()', () => {
        it('Test 41: should clear all reports', () => {
            reporter.createReport('task-1', [], [], [], 1000);
            reporter.createReport('task-2', [], [], [], 1000);

            reporter.clear();

            expect(reporter.getAllReports()).toEqual([]);
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 42: getVerificationReporter should return singleton', () => {
            const instance1 = getVerificationReporter();
            const instance2 = getVerificationReporter();

            expect(instance1).toBe(instance2);
        });

        it('Test 43: resetVerificationReporterForTests should reset', () => {
            const instance1 = getVerificationReporter();
            resetVerificationReporterForTests();
            const instance2 = getVerificationReporter();

            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 44: should handle very long criterion text', () => {
            const longCriterion = 'A'.repeat(200);
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ criterion: longCriterion, passed: false })],
                [],
                [],
                1000
            );

            // Should truncate in formatting
            const text = reporter.formatAsText(report);
            expect(text.length).toBeLessThan(longCriterion.length * 3);
        });

        it('Test 45: should handle special characters', () => {
            const report = reporter.createReport(
                'task-1',
                [createCriterion({ criterion: 'Handle <html> & "quotes"' })],
                [],
                [],
                1000
            );

            const json = reporter.formatAsJson(report);
            expect(() => JSON.parse(json)).not.toThrow();
        });

        it('Test 46: should handle zero duration', () => {
            const report = reporter.createReport('task-1', [], [], [], 0);
            const text = reporter.formatAsText(report);

            expect(text).toContain('0.0s');
        });

        it('Test 47: should handle test without error message', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({ status: 'failed', error: undefined })],
                [],
                1000
            );

            expect(report.blockingIssues).toContainEqual(expect.stringContaining('Unknown error'));
        });

        it('Test 48: should handle no warnings', () => {
            const report = reporter.createReport(
                'task-1',
                [],
                [createTestResult({ status: 'passed' })],
                [],
                1000
            );

            expect(report.warnings.length).toBe(0);
            const text = reporter.formatAsText(report);
            expect(text).not.toContain('WARNINGS');
        });
    });
});
