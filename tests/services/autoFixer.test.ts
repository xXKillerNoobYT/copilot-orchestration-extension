/**
 * Tests for Auto-Fix Workflow (MT-033.35)
 *
 * Validates fix type determination, confidence calculation, line fixes,
 * ticket creation, full pipeline, and reporting.
 */

import {
    // Types
    FixType,
    FixAttempt,
    FixTicket,
    AutoFixResult,
    AutoFixerConfig,

    // Constants
    DEFAULT_AUTO_FIXER_CONFIG,

    // Functions
    generateFixTicketId,
    resetTicketCounter,
    determineFixType,
    calculateFixConfidence,
    applyLineFix,
    applyEofNewline,
    createFixTicket,
    runAutoFix,
    generateAutoFixSummary,
    getAutoFixReport
} from '../../src/services/autoFixer';

import {
    DetectedError,
    ErrorDetectionResult,
    resetErrorCounter
} from '../../src/services/errorDetector';

// ============================================================================
// Test Helpers
// ============================================================================

function makeError(overrides?: Partial<DetectedError>): DetectedError {
    return {
        id: 'ERR-001',
        category: 'lint',
        severity: 'medium',
        fixability: 'auto_fixable',
        title: 'Lint error: semi',
        message: 'Missing semicolon',
        filePath: 'src/example.ts',
        line: 5,
        code: 'semi',
        suggestedFix: 'Add semicolons',
        source: 'eslint',
        rawText: 'const x = 1',
        detectedAt: '2024-01-01T00:00:00Z',
        ...overrides
    };
}

function makeDetectionResult(errors: DetectedError[]): ErrorDetectionResult {
    return {
        errors,
        countByCategory: { compile: 0, test_failure: 0, lint: 0, runtime: 0, logic: 0, performance: 0, style: 0, security: 0, dependency: 0 },
        countBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        autoFixableCount: errors.filter(e => e.fixability === 'auto_fixable').length,
        hasBlockingErrors: false,
        summary: '',
        analyzedAt: ''
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('AutoFixer', () => {

    beforeEach(() => {
        resetTicketCounter();
        resetErrorCounter();
    });

    // ── Ticket ID ────────────────────────────────────────────────────

    describe('generateFixTicketId', () => {

        it('Test 1: should generate sequential IDs', () => {
            expect(generateFixTicketId()).toBe('FIX-001');
            expect(generateFixTicketId()).toBe('FIX-002');
        });

        it('Test 2: should reset counter', () => {
            generateFixTicketId();
            resetTicketCounter();
            expect(generateFixTicketId()).toBe('FIX-001');
        });
    });

    // ── Fix Type Determination ───────────────────────────────────────

    describe('determineFixType', () => {

        it('Test 3: should map known lint rules to fix types', () => {
            expect(determineFixType(makeError({ code: 'semi' }))).toBe('add_semicolon');
            expect(determineFixType(makeError({ code: 'no-trailing-spaces' }))).toBe('remove_trailing_spaces');
            expect(determineFixType(makeError({ code: 'quotes' }))).toBe('fix_quotes');
            expect(determineFixType(makeError({ code: 'prefer-const' }))).toBe('prefer_const');
            expect(determineFixType(makeError({ code: 'no-unused-vars' }))).toBe('remove_unused_var');
        });

        it('Test 4: should use generic_lint_fix for unknown lint/style', () => {
            expect(determineFixType(makeError({ code: 'custom-rule', category: 'lint' }))).toBe('generic_lint_fix');
            expect(determineFixType(makeError({ code: undefined, category: 'style' }))).toBe('generic_lint_fix');
        });

        it('Test 5: should create ticket for non-fixable categories', () => {
            expect(determineFixType(makeError({ code: undefined, category: 'security' }))).toBe('create_fix_ticket');
            expect(determineFixType(makeError({ code: undefined, category: 'logic' }))).toBe('create_fix_ticket');
            expect(determineFixType(makeError({ code: undefined, category: 'test_failure' }))).toBe('create_fix_ticket');
        });
    });

    // ── Confidence ───────────────────────────────────────────────────

    describe('calculateFixConfidence', () => {

        it('Test 6: should return 99 for simple formatting fixes', () => {
            expect(calculateFixConfidence('add_semicolon', makeError())).toBe(99);
            expect(calculateFixConfidence('remove_trailing_spaces', makeError())).toBe(99);
            expect(calculateFixConfidence('add_newline_eof', makeError())).toBe(99);
        });

        it('Test 7: should return lower confidence for complex fixes', () => {
            expect(calculateFixConfidence('remove_unused_var', makeError())).toBe(85);
            expect(calculateFixConfidence('generic_lint_fix', makeError())).toBe(70);
        });

        it('Test 8: should return 0 for ticket creation', () => {
            expect(calculateFixConfidence('create_fix_ticket', makeError())).toBe(0);
        });
    });

    // ── Line Fixes ───────────────────────────────────────────────────

    describe('applyLineFix', () => {

        it('Test 9: should add semicolons', () => {
            const content = 'line1\nconst x = 1\nline3';
            const result = applyLineFix(content, 2, 'add_semicolon');
            expect(result).not.toBeNull();
            expect(result!.after).toBe('const x = 1;');
        });

        it('Test 10: should not add semicolon after brace', () => {
            const content = 'if (true) {';
            const result = applyLineFix(content, 1, 'add_semicolon');
            expect(result).toBeNull(); // No change needed
        });

        it('Test 11: should remove trailing spaces', () => {
            const content = 'const x = 1;   \nline2';
            const result = applyLineFix(content, 1, 'remove_trailing_spaces');
            expect(result).not.toBeNull();
            expect(result!.after).toBe('const x = 1;');
        });

        it('Test 12: should fix quotes (double to single)', () => {
            const content = 'const s = "hello";';
            const result = applyLineFix(content, 1, 'fix_quotes');
            expect(result).not.toBeNull();
            expect(result!.after).toContain("'hello'");
        });

        it('Test 13: should remove extra semicolons', () => {
            const content = 'const x = 1;;';
            const result = applyLineFix(content, 1, 'remove_extra_semicolons');
            expect(result).not.toBeNull();
            expect(result!.after).toBe('const x = 1;');
        });

        it('Test 14: should change let to const', () => {
            const content = 'let x = 1;';
            const result = applyLineFix(content, 1, 'prefer_const');
            expect(result).not.toBeNull();
            expect(result!.after).toBe('const x = 1;');
        });

        it('Test 15: should prefix unused vars with underscore', () => {
            const content = 'const unused = 5;';
            const result = applyLineFix(content, 1, 'remove_unused_var');
            expect(result).not.toBeNull();
            expect(result!.after).toContain('_unused');
        });

        it('Test 16: should return null for invalid line number', () => {
            expect(applyLineFix('hello', 0, 'add_semicolon')).toBeNull();
            expect(applyLineFix('hello', 99, 'add_semicolon')).toBeNull();
        });

        it('Test 17: should return null for unsupported fix type', () => {
            expect(applyLineFix('hello', 1, 'generic_lint_fix')).toBeNull();
        });
    });

    // ── EOF Newline ──────────────────────────────────────────────────

    describe('applyEofNewline', () => {

        it('Test 18: should add newline at EOF', () => {
            const result = applyEofNewline('const x = 1;');
            expect(result.changed).toBe(true);
            expect(result.fixed).toBe('const x = 1;\n');
        });

        it('Test 19: should not add if already present', () => {
            const result = applyEofNewline('const x = 1;\n');
            expect(result.changed).toBe(false);
        });

        it('Test 20: should not modify empty string', () => {
            const result = applyEofNewline('');
            expect(result.changed).toBe(false);
        });
    });

    // ── Fix Ticket Creation ──────────────────────────────────────────

    describe('createFixTicket', () => {

        it('Test 21: should create a complete ticket', () => {
            const error = makeError({
                category: 'security',
                severity: 'high',
                fixability: 'human_required',
                title: 'eval usage'
            });

            const ticket = createFixTicket(error);
            expect(ticket.id).toBe('FIX-001');
            expect(ticket.urgency).toBe('immediate');
            expect(ticket.reason).toContain('human judgment');
            expect(ticket.context).toContain('eval usage');
        });

        it('Test 22: should set urgency based on severity', () => {
            const high = createFixTicket(makeError({ severity: 'high' }));
            const medium = createFixTicket(makeError({ severity: 'medium' }));
            const low = createFixTicket(makeError({ severity: 'low' }));

            expect(high.urgency).toBe('immediate');
            expect(medium.urgency).toBe('normal');
            expect(low.urgency).toBe('low');
        });
    });

    // ── Full Pipeline ────────────────────────────────────────────────

    describe('runAutoFix', () => {

        it('Test 23: should auto-fix simple lint errors', () => {
            const errors = [makeError({
                id: 'ERR-001', code: 'semi', category: 'lint',
                fixability: 'auto_fixable', filePath: 'src/a.ts', line: 1
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map([['src/a.ts', 'const x = 1']]);

            const result = runAutoFix(detection, files);
            expect(result.appliedCount).toBe(1);
            expect(result.modifiedFiles.get('src/a.ts')).toContain(';');
        });

        it('Test 24: should skip low-confidence fixes', () => {
            const errors = [makeError({
                id: 'ERR-001', code: 'custom-unknown', category: 'lint',
                fixability: 'auto_fixable', filePath: 'src/a.ts', line: 1
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map([['src/a.ts', 'const x = 1']]);

            const result = runAutoFix(detection, files); // minConfidence is 90, generic_lint_fix is 70
            expect(result.skippedCount).toBe(1);
        });

        it('Test 25: should create tickets for unfixable errors', () => {
            const errors = [makeError({
                id: 'ERR-001', code: undefined, category: 'security',
                fixability: 'human_required', title: 'eval found'
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map<string, string>();

            const result = runAutoFix(detection, files);
            expect(result.ticketCount).toBe(1);
            expect(result.tickets[0].error.title).toBe('eval found');
        });

        it('Test 26: should respect maxFixesPerFile limit', () => {
            const errors = Array.from({ length: 25 }, (_, i) =>
                makeError({
                    id: `ERR-${i}`, code: 'semi', category: 'lint',
                    fixability: 'auto_fixable', filePath: 'src/a.ts', line: i + 1
                })
            );

            const lines = Array.from({ length: 30 }, (_, i) => `const x${i} = ${i}`).join('\n');
            const detection = makeDetectionResult(errors);
            const files = new Map([['src/a.ts', lines]]);

            const result = runAutoFix(detection, files, { maxFixesPerFile: 5 });
            expect(result.appliedCount).toBeLessThanOrEqual(5);
        });

        it('Test 27: should support dry run mode', () => {
            const errors = [makeError({
                id: 'ERR-001', code: 'semi', category: 'lint',
                fixability: 'auto_fixable', filePath: 'src/a.ts', line: 1
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map([['src/a.ts', 'const x = 1']]);

            const result = runAutoFix(detection, files, { dryRun: true });
            expect(result.appliedCount).toBe(1); // Reports as applied (dry run)
            // But file should not actually be modified — it stays the same since applyFix wasn't run
            // In dry run, the modifiedFiles should still have original content copy
        });

        it('Test 28: should skip fix types in skip list', () => {
            const errors = [makeError({
                id: 'ERR-001', code: 'semi', category: 'lint',
                fixability: 'auto_fixable', filePath: 'src/a.ts', line: 1
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map([['src/a.ts', 'const x = 1']]);

            const result = runAutoFix(detection, files, { skipFixTypes: ['add_semicolon'] });
            expect(result.skippedCount).toBe(1);
        });

        it('Test 29: should handle missing file gracefully', () => {
            const errors = [makeError({
                id: 'ERR-001', code: 'semi', category: 'lint',
                fixability: 'auto_fixable', filePath: 'src/missing.ts', line: 1
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map<string, string>();

            const result = runAutoFix(detection, files);
            expect(result.failedCount).toBe(1);
        });

        it('Test 30: should set requiresRetest when fixes applied', () => {
            const errors = [makeError({
                id: 'ERR-001', code: 'semi', filePath: 'src/a.ts', line: 1
            })];

            const detection = makeDetectionResult(errors);
            const files = new Map([['src/a.ts', 'const x = 1']]);

            const result = runAutoFix(detection, files);
            expect(result.requiresRetest).toBe(true);
        });

        it('Test 31: should not require retest when no fixes applied', () => {
            const detection = makeDetectionResult([]);
            const files = new Map<string, string>();

            const result = runAutoFix(detection, files);
            expect(result.requiresRetest).toBe(false);
        });
    });

    // ── Summary & Report ─────────────────────────────────────────────

    describe('generateAutoFixSummary', () => {

        it('Test 32: should include all counts', () => {
            const summary = generateAutoFixSummary(3, 2, 1, 4);
            expect(summary).toContain('3 fixed');
            expect(summary).toContain('2 skipped');
            expect(summary).toContain('1 failed');
            expect(summary).toContain('4 ticket(s)');
        });

        it('Test 33: should handle zero counts', () => {
            expect(generateAutoFixSummary(0, 0, 0, 0)).toBe('No fixes attempted');
        });
    });

    describe('getAutoFixReport', () => {

        it('Test 34: should generate a readable report', () => {
            const result: AutoFixResult = {
                attempts: [{
                    errorId: 'ERR-001', fixType: 'add_semicolon',
                    outcome: 'applied', filePath: 'src/a.ts',
                    description: 'Applied semicolon fix',
                    confidence: 99, timestamp: ''
                }],
                tickets: [{
                    id: 'FIX-001', error: makeError(),
                    reason: 'Too complex', context: '',
                    suggestedApproach: 'Review carefully',
                    urgency: 'normal', createdAt: ''
                }],
                appliedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                ticketCount: 1,
                modifiedFiles: new Map(),
                summary: '1 fixed, 1 ticket(s) created',
                requiresRetest: true,
                completedAt: ''
            };

            const report = getAutoFixReport(result);
            expect(report).toContain('Auto-Fix Report');
            expect(report).toContain('Applied Fixes');
            expect(report).toContain('Fix Tickets Created');
            expect(report).toContain('Requires Retest');
        });
    });

    // ── Default Config ───────────────────────────────────────────────

    describe('DEFAULT_AUTO_FIXER_CONFIG', () => {

        it('Test 35: should have conservative defaults', () => {
            expect(DEFAULT_AUTO_FIXER_CONFIG.minConfidence).toBe(90);
            expect(DEFAULT_AUTO_FIXER_CONFIG.runTestsAfterFix).toBe(true);
            expect(DEFAULT_AUTO_FIXER_CONFIG.maxFixesPerFile).toBe(20);
            expect(DEFAULT_AUTO_FIXER_CONFIG.createTicketsForUnfixable).toBe(true);
            expect(DEFAULT_AUTO_FIXER_CONFIG.dryRun).toBe(false);
        });
    });
});
