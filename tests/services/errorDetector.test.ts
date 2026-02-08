/**
 * Tests for Error Detection System (MT-033.34)
 *
 * Validates error parsing, categorization, severity, fixability,
 * security scanning, performance detection, logic analysis, and
 * full detection pipeline.
 */

import {
    // Types
    ErrorCategory,
    ErrorSeverity,
    Fixability,
    DetectedError,
    ErrorDetectionResult,
    ErrorDetectorConfig,

    // Constants
    DEFAULT_ERROR_DETECTOR_CONFIG,

    // Functions
    generateErrorId,
    resetErrorCounter,
    determineSeverity,
    determineFixability,
    parseCompileErrors,
    suggestCompileFix,
    parseLintErrors,
    suggestLintFix,
    parseTestFailures,
    extractLocationFromStack,
    scanForSecurityIssues,
    detectPerformanceIssues,
    detectLogicIssues,
    detectErrors,
    buildCategoryCount,
    buildSeverityCount,
    generateDetectionSummary,
    filterByCategory,
    filterBySeverity,
    getAutoFixableErrors,
    getCompactReport
} from '../../src/services/errorDetector';

import { FileChange, TestResult, HandbackPackage } from '../../src/services/codingHandback';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTestResult(overrides?: Partial<TestResult>): TestResult {
    return {
        suiteName: 'example.test.ts',
        totalTests: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        failures: [],
        durationMs: 500,
        ...overrides
    };
}

function makeFileChange(overrides?: Partial<FileChange>): FileChange {
    return {
        filePath: 'src/example.ts',
        changeType: 'created',
        content: 'export function hello() { return "world"; }',
        linesAdded: 1,
        linesRemoved: 0,
        ...overrides
    };
}

function makeHandback(overrides?: Partial<HandbackPackage>): HandbackPackage {
    return {
        id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'agent-1',
        submittedAt: '', fileChanges: [], testResults: [], issues: [],
        timeSpentMinutes: 30, originalEstimateMinutes: 30,
        confidence: 'high', status: 'success', summary: '',
        ...overrides
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('ErrorDetector', () => {

    beforeEach(() => {
        resetErrorCounter();
    });

    // ── Error ID ─────────────────────────────────────────────────────

    describe('generateErrorId', () => {

        it('Test 1: should generate sequential IDs', () => {
            expect(generateErrorId()).toBe('ERR-001');
            expect(generateErrorId()).toBe('ERR-002');
            expect(generateErrorId()).toBe('ERR-003');
        });

        it('Test 2: should reset counter', () => {
            generateErrorId();
            generateErrorId();
            resetErrorCounter();
            expect(generateErrorId()).toBe('ERR-001');
        });
    });

    // ── Severity ─────────────────────────────────────────────────────

    describe('determineSeverity', () => {

        it('Test 3: should rate compile errors as critical', () => {
            expect(determineSeverity('compile')).toBe('critical');
        });

        it('Test 4: should rate security as high', () => {
            expect(determineSeverity('security')).toBe('high');
        });

        it('Test 5: should rate runtime as high', () => {
            expect(determineSeverity('runtime')).toBe('high');
        });

        it('Test 6: should rate test failures as high by default', () => {
            expect(determineSeverity('test_failure')).toBe('high');
        });

        it('Test 7: should rate blocking test failures as critical', () => {
            expect(determineSeverity('test_failure', { isBlocking: true })).toBe('critical');
        });

        it('Test 8: should rate lint as medium', () => {
            expect(determineSeverity('lint')).toBe('medium');
        });

        it('Test 9: should rate style as low', () => {
            expect(determineSeverity('style')).toBe('low');
        });
    });

    // ── Fixability ───────────────────────────────────────────────────

    describe('determineFixability', () => {

        it('Test 10: should mark style as auto-fixable', () => {
            expect(determineFixability('style')).toBe('auto_fixable');
        });

        it('Test 11: should mark lint with known rule as auto-fixable', () => {
            expect(determineFixability('lint', 'semi')).toBe('auto_fixable');
            expect(determineFixability('lint', 'no-trailing-spaces')).toBe('auto_fixable');
        });

        it('Test 12: should mark lint with unknown rule as agent-fixable', () => {
            expect(determineFixability('lint', 'complex-rule')).toBe('agent_fixable');
        });

        it('Test 13: should mark security as human-required', () => {
            expect(determineFixability('security')).toBe('human_required');
        });

        it('Test 14: should mark test failures as agent-fixable', () => {
            expect(determineFixability('test_failure')).toBe('agent_fixable');
        });

        it('Test 15: should handle compile errors with "expected" as auto-fixable', () => {
            expect(determineFixability('compile', 'TS1005', "';' expected")).toBe('auto_fixable');
        });
    });

    // ── Compile Error Parsing ────────────────────────────────────────

    describe('parseCompileErrors', () => {

        it('Test 16: should parse parenthesized TS error format', () => {
            const output = 'src/index.ts(10,5): error TS2304: Cannot find name \'foo\'';
            const errors = parseCompileErrors(output);
            expect(errors).toHaveLength(1);
            expect(errors[0].category).toBe('compile');
            expect(errors[0].severity).toBe('critical');
            expect(errors[0].filePath).toBe('src/index.ts');
            expect(errors[0].line).toBe(10);
            expect(errors[0].column).toBe(5);
            expect(errors[0].code).toBe('TS2304');
        });

        it('Test 17: should parse colon-separated TS error format', () => {
            const output = 'src/bar.ts:20:3 - error TS2345: Argument type mismatch';
            const errors = parseCompileErrors(output);
            expect(errors).toHaveLength(1);
            expect(errors[0].filePath).toBe('src/bar.ts');
            expect(errors[0].line).toBe(20);
        });

        it('Test 18: should parse multiple errors', () => {
            const output = [
                'src/a.ts(1,1): error TS2304: Cannot find name \'x\'',
                'src/b.ts(2,2): error TS2322: Type mismatch'
            ].join('\n');
            const errors = parseCompileErrors(output);
            expect(errors).toHaveLength(2);
        });

        it('Test 19: should return empty for clean output', () => {
            expect(parseCompileErrors('')).toHaveLength(0);
            expect(parseCompileErrors('Build succeeded')).toHaveLength(0);
        });
    });

    // ── Compile Fix Suggestions ─────────────────────────────────────

    describe('suggestCompileFix', () => {

        it('Test 20: should suggest fixes for known error codes', () => {
            expect(suggestCompileFix('TS2304', '')).toContain('import');
            expect(suggestCompileFix('TS2307', '')).toContain('module');
            expect(suggestCompileFix('TS2322', '')).toContain('type');
        });

        it('Test 21: should provide fallback for unknown codes', () => {
            const fix = suggestCompileFix('TS9999', 'Something broke');
            expect(fix).toContain('TS9999');
        });
    });

    // ── Lint Error Parsing ───────────────────────────────────────────

    describe('parseLintErrors', () => {

        it('Test 22: should parse ESLint error lines', () => {
            const output = [
                'src/file.ts',
                '  10:5  error  Unexpected console statement  no-console'
            ].join('\n');
            const errors = parseLintErrors(output, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors).toHaveLength(1);
            expect(errors[0].category).toBe('lint');
            expect(errors[0].code).toBe('no-console');
            expect(errors[0].line).toBe(10);
        });

        it('Test 23: should parse warnings as style issues', () => {
            const output = [
                'src/file.ts',
                '  5:1  warning  Missing return type  @typescript-eslint/explicit-return'
            ].join('\n');
            const errors = parseLintErrors(output, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors).toHaveLength(1);
            expect(errors[0].category).toBe('style');
        });

        it('Test 24: should skip warnings when includeStyleIssues is false', () => {
            const output = [
                'src/file.ts',
                '  5:1  warning  Missing return type  @typescript-eslint/explicit-return'
            ].join('\n');
            const errors = parseLintErrors(output, {
                ...DEFAULT_ERROR_DETECTOR_CONFIG,
                includeStyleIssues: false
            });
            expect(errors).toHaveLength(0);
        });
    });

    // ── Lint Fix Suggestions ─────────────────────────────────────────

    describe('suggestLintFix', () => {

        it('Test 25: should suggest fixes for known rules', () => {
            expect(suggestLintFix('no-unused-vars', '')).toContain('unused');
            expect(suggestLintFix('prefer-const', '')).toContain('const');
            expect(suggestLintFix('eqeqeq', '')).toContain('===');
        });

        it('Test 26: should provide fallback for unknown rules', () => {
            const fix = suggestLintFix('custom-rule', 'Some custom rule');
            expect(fix).toContain('custom-rule');
        });
    });

    // ── Test Failure Parsing ─────────────────────────────────────────

    describe('parseTestFailures', () => {

        it('Test 27: should extract errors from test failures', () => {
            const results: TestResult[] = [makeTestResult({
                failed: 1,
                passed: 9,
                totalTests: 10,
                failures: [{
                    testName: 'Test 1: should work',
                    message: 'Expected true to be false',
                    stackTrace: 'at Object.<anonymous> (src/foo.test.ts:10:5)'
                }]
            })];

            const errors = parseTestFailures(results);
            expect(errors).toHaveLength(1);
            expect(errors[0].category).toBe('test_failure');
            expect(errors[0].severity).toBe('high');
            expect(errors[0].filePath).toBe('src/foo.test.ts');
            expect(errors[0].line).toBe(10);
        });

        it('Test 28: should handle failures without stack traces', () => {
            const results: TestResult[] = [makeTestResult({
                failed: 1,
                failures: [{ testName: 'Test 1', message: 'Boom' }]
            })];

            const errors = parseTestFailures(results);
            expect(errors).toHaveLength(1);
            expect(errors[0].filePath).toBe('example.test.ts'); // Falls back to suite name
        });

        it('Test 29: should return empty for all-pass results', () => {
            expect(parseTestFailures([makeTestResult()])).toHaveLength(0);
        });
    });

    // ── Stack Trace Extraction ───────────────────────────────────────

    describe('extractLocationFromStack', () => {

        it('Test 30: should extract location from stack trace', () => {
            const stack = 'at Object.<anonymous> (/path/to/file.ts:42:10)';
            const loc = extractLocationFromStack(stack);
            expect(loc?.filePath).toBe('/path/to/file.ts');
            expect(loc?.line).toBe(42);
            expect(loc?.column).toBe(10);
        });

        it('Test 31: should return null for missing stack', () => {
            expect(extractLocationFromStack(undefined)).toBeNull();
            expect(extractLocationFromStack('')).toBeNull();
        });
    });

    // ── Security Scanning ────────────────────────────────────────────

    describe('scanForSecurityIssues', () => {

        it('Test 32: should detect eval usage', () => {
            const changes = [makeFileChange({ content: 'const result = eval("code");' })];
            const errors = scanForSecurityIssues(changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].category).toBe('security');
            expect(errors[0].severity).toBe('high');
        });

        it('Test 33: should detect innerHTML assignment', () => {
            const changes = [makeFileChange({ content: 'el.innerHTML = userInput;' })];
            const errors = scanForSecurityIssues(changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);
        });

        it('Test 34: should detect hardcoded secrets', () => {
            const changes = [makeFileChange({ content: 'const password = "hunter2";' })];
            const errors = scanForSecurityIssues(changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);
        });

        it('Test 35: should return empty for safe code', () => {
            const changes = [makeFileChange({ content: 'const x = 1 + 2;' })];
            const errors = scanForSecurityIssues(changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors).toHaveLength(0);
        });

        it('Test 36: should skip files without content', () => {
            const changes = [makeFileChange({ content: undefined })];
            const errors = scanForSecurityIssues(changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors).toHaveLength(0);
        });
    });

    // ── Performance Issues ───────────────────────────────────────────

    describe('detectPerformanceIssues', () => {

        it('Test 37: should flag slow test suites', () => {
            const results = [makeTestResult({ durationMs: 10000 })];
            const errors = detectPerformanceIssues(results, [], DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].category).toBe('performance');
        });

        it('Test 38: should not flag fast test suites', () => {
            const results = [makeTestResult({ durationMs: 500 })];
            const errors = detectPerformanceIssues(results, [], DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors).toHaveLength(0);
        });

        it('Test 39: should detect async forEach anti-pattern', () => {
            const changes = [makeFileChange({
                content: 'items.forEach(async (item) => { await save(item); });'
            })];
            const errors = detectPerformanceIssues([], changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].title).toContain('async forEach');
        });

        it('Test 40: should detect JSON deep clone', () => {
            const changes = [makeFileChange({
                content: 'const copy = JSON.parse(JSON.stringify(obj));'
            })];
            const errors = detectPerformanceIssues([], changes, DEFAULT_ERROR_DETECTOR_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── Logic Issues ─────────────────────────────────────────────────

    describe('detectLogicIssues', () => {

        it('Test 41: should detect empty catch blocks', () => {
            const changes = [makeFileChange({
                content: 'try { foo(); } catch (e) { }'
            })];
            const errors = detectLogicIssues(changes);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].category).toBe('logic');
        });

        it('Test 42: should detect NaN comparison', () => {
            const changes = [makeFileChange({
                content: 'if (x === NaN) { doStuff(); }'
            })];
            const errors = detectLogicIssues(changes);
            expect(errors.length).toBeGreaterThanOrEqual(1);
        });

        it('Test 43: should return empty for clean code', () => {
            const changes = [makeFileChange({
                content: 'const x = 1;\nconst y = x + 1;'
            })];
            expect(detectLogicIssues(changes)).toHaveLength(0);
        });
    });

    // ── Full Detection Pipeline ──────────────────────────────────────

    describe('detectErrors', () => {

        it('Test 44: should detect errors from multiple sources', () => {
            const handback = makeHandback({
                testResults: [makeTestResult({
                    failed: 1, passed: 9, totalTests: 10,
                    failures: [{ testName: 'Test 1', message: 'Nope' }]
                })],
                fileChanges: [makeFileChange({ content: 'const result = eval("bad");' })]
            });

            const compilerOutput = 'src/x.ts(5,3): error TS2304: Cannot find name \'missing\'';

            const result = detectErrors(handback, compilerOutput);
            expect(result.errors.length).toBeGreaterThanOrEqual(3); // compile + test + security
            expect(result.hasBlockingErrors).toBe(true); // compile error is critical
        });

        it('Test 45: should return clean result for no errors', () => {
            const handback = makeHandback({
                testResults: [makeTestResult()],
                fileChanges: [makeFileChange()]
            });

            const result = detectErrors(handback);
            expect(result.errors).toHaveLength(0);
            expect(result.hasBlockingErrors).toBe(false);
            expect(result.summary).toContain('No errors');
        });

        it('Test 46: should respect maxErrors config', () => {
            // Create many security issues
            const lines = Array.from({ length: 50 }, (_, i) =>
                `const password${i} = "secret${i}";`
            ).join('\n');

            const handback = makeHandback({
                fileChanges: [makeFileChange({ content: lines })]
            });

            const result = detectErrors(handback, undefined, undefined, { maxErrors: 5 });
            expect(result.errors.length).toBeLessThanOrEqual(5);
        });

        it('Test 47: should count categories correctly', () => {
            const handback = makeHandback({
                testResults: [makeTestResult({
                    failed: 2, passed: 8, totalTests: 10,
                    failures: [
                        { testName: 'T1', message: 'Fail 1' },
                        { testName: 'T2', message: 'Fail 2' }
                    ]
                })]
            });

            const result = detectErrors(handback);
            expect(result.countByCategory.test_failure).toBe(2);
        });

        it('Test 48: should count auto-fixable errors', () => {
            const handback = makeHandback({
                fileChanges: [makeFileChange({
                    content: 'try { foo(); } catch (e) { }' // logic issue (agent_fixable)
                })]
            });

            const result = detectErrors(handback);
            // Logic errors are agent_fixable, not auto_fixable
            expect(result.autoFixableCount).toBe(0);
        });
    });

    // ── Helpers ──────────────────────────────────────────────────────

    describe('buildCategoryCount', () => {

        it('Test 49: should count all categories', () => {
            const errors: DetectedError[] = [
                { category: 'compile' } as DetectedError,
                { category: 'compile' } as DetectedError,
                { category: 'lint' } as DetectedError
            ];

            const result = buildCategoryCount(errors);
            expect(result.compile).toBe(2);
            expect(result.lint).toBe(1);
            expect(result.test_failure).toBe(0);
        });
    });

    describe('buildSeverityCount', () => {

        it('Test 50: should count all severities', () => {
            const errors: DetectedError[] = [
                { severity: 'critical' } as DetectedError,
                { severity: 'high' } as DetectedError,
                { severity: 'high' } as DetectedError
            ];

            const result = buildSeverityCount(errors);
            expect(result.critical).toBe(1);
            expect(result.high).toBe(2);
        });
    });

    describe('filterByCategory', () => {

        it('Test 51: should filter by category', () => {
            const errors: DetectedError[] = [
                { category: 'compile' } as DetectedError,
                { category: 'lint' } as DetectedError,
                { category: 'compile' } as DetectedError
            ];

            expect(filterByCategory(errors, 'compile')).toHaveLength(2);
            expect(filterByCategory(errors, 'lint')).toHaveLength(1);
            expect(filterByCategory(errors, 'security')).toHaveLength(0);
        });
    });

    describe('filterBySeverity', () => {

        it('Test 52: should filter by severity', () => {
            const errors: DetectedError[] = [
                { severity: 'critical' } as DetectedError,
                { severity: 'low' } as DetectedError
            ];

            expect(filterBySeverity(errors, 'critical')).toHaveLength(1);
            expect(filterBySeverity(errors, 'low')).toHaveLength(1);
            expect(filterBySeverity(errors, 'medium')).toHaveLength(0);
        });
    });

    describe('getAutoFixableErrors', () => {

        it('Test 53: should return only auto-fixable errors', () => {
            const errors: DetectedError[] = [
                { fixability: 'auto_fixable' } as DetectedError,
                { fixability: 'agent_fixable' } as DetectedError,
                { fixability: 'auto_fixable' } as DetectedError,
                { fixability: 'human_required' } as DetectedError
            ];

            expect(getAutoFixableErrors(errors)).toHaveLength(2);
        });
    });

    // ── Summary & Report ─────────────────────────────────────────────

    describe('generateDetectionSummary', () => {

        it('Test 54: should summarize cleanly for no errors', () => {
            const summary = generateDetectionSummary(
                [], { compile: 0, test_failure: 0, lint: 0, runtime: 0, logic: 0, performance: 0, style: 0, security: 0, dependency: 0 },
                { critical: 0, high: 0, medium: 0, low: 0 }, 0, false
            );
            expect(summary).toContain('No errors');
        });

        it('Test 55: should include blocking indicator', () => {
            const errors = [{ severity: 'critical', category: 'compile' } as DetectedError];
            const summary = generateDetectionSummary(
                errors,
                { compile: 1, test_failure: 0, lint: 0, runtime: 0, logic: 0, performance: 0, style: 0, security: 0, dependency: 0 },
                { critical: 1, high: 0, medium: 0, low: 0 }, 0, true
            );
            expect(summary).toContain('BLOCKING');
            expect(summary).toContain('1 critical');
        });
    });

    describe('getCompactReport', () => {

        it('Test 56: should produce a readable report', () => {
            const result: ErrorDetectionResult = {
                errors: [{
                    id: 'ERR-001', category: 'compile', severity: 'critical',
                    fixability: 'agent_fixable', title: 'Compile error TS2304',
                    message: 'Cannot find name', filePath: 'src/x.ts', line: 10,
                    source: 'tsc', rawText: '', detectedAt: '',
                    suggestedFix: 'Add import'
                }],
                countByCategory: { compile: 1, test_failure: 0, lint: 0, runtime: 0, logic: 0, performance: 0, style: 0, security: 0, dependency: 0 },
                countBySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
                autoFixableCount: 0, hasBlockingErrors: true,
                summary: '', analyzedAt: ''
            };

            const report = getCompactReport(result);
            expect(report).toContain('CRITICAL');
            expect(report).toContain('Compile error');
            expect(report).toContain('src/x.ts:10');
        });

        it('Test 57: should handle empty results', () => {
            const result: ErrorDetectionResult = {
                errors: [],
                countByCategory: { compile: 0, test_failure: 0, lint: 0, runtime: 0, logic: 0, performance: 0, style: 0, security: 0, dependency: 0 },
                countBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
                autoFixableCount: 0, hasBlockingErrors: false,
                summary: '', analyzedAt: ''
            };

            expect(getCompactReport(result)).toContain('No errors');
        });
    });

    // ── Default Config ───────────────────────────────────────────────

    describe('DEFAULT_ERROR_DETECTOR_CONFIG', () => {

        it('Test 58: should have sensible defaults', () => {
            expect(DEFAULT_ERROR_DETECTOR_CONFIG.treatWarningsAsErrors).toBe(false);
            expect(DEFAULT_ERROR_DETECTOR_CONFIG.performanceThresholdMs).toBe(5000);
            expect(DEFAULT_ERROR_DETECTOR_CONFIG.includeStyleIssues).toBe(true);
            expect(DEFAULT_ERROR_DETECTOR_CONFIG.securityPatterns.length).toBeGreaterThan(0);
            expect(DEFAULT_ERROR_DETECTOR_CONFIG.maxErrors).toBe(100);
        });
    });
});
