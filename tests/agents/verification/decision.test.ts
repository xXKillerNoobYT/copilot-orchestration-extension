/**
 * @file verification/decision.test.ts
 * @description Tests for VerificationDecision (MT-015.9)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn()
}));

import {
    VerificationDecision,
    createDecision
} from '../../../src/agents/verification/decision';
import type { TestResult } from '../../../src/agents/verification/testRunner';
import type { MatchResult } from '../../../src/agents/verification/matching';

describe('VerificationDecision', () => {
    let decision: VerificationDecision;

    beforeEach(() => {
        decision = new VerificationDecision({
            minTestPassRate: 1.0,
            minACMatchScore: 0.85
        });
    });

    const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
        passed: true,
        total: 10,
        failed: 0,
        skipped: 0,
        duration: 1000,
        output: 'All tests passed',
        ...overrides
    });

    const createMatchResult = (overrides: Partial<MatchResult> = {}): MatchResult => ({
        matched: ['criterion 1', 'criterion 2'],
        unmatched: [],
        score: 1.0,
        details: [],
        ...overrides
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultDecision = createDecision();
            expect(defaultDecision).toBeInstanceOf(VerificationDecision);
        });

        it('should create instance with custom config', () => {
            const customDecision = createDecision({
                minTestPassRate: 0.9,
                minACMatchScore: 0.7,
                coverageRequired: true
            });
            expect(customDecision).toBeInstanceOf(VerificationDecision);
        });
    });

    describe('Test 2: decide - passing scenarios', () => {
        it('should pass when tests pass and AC matches', () => {
            const result = decision.decide(
                createTestResult(),
                createMatchResult()
            );

            expect(result.passed).toBe(true);
            expect(result.reason).toContain('All verification criteria met');
        });

        it('should include details in result', () => {
            const result = decision.decide(
                createTestResult(),
                createMatchResult()
            );

            expect(result.details.testsPass).toBe(true);
            expect(result.details.testPassRate).toBe(1.0);
            expect(result.details.acMatchScore).toBe(1.0);
        });
    });

    describe('Test 3: decide - failing scenarios', () => {
        it('should fail when tests fail', () => {
            const result = decision.decide(
                createTestResult({ passed: false, failed: 2, total: 10 }),
                createMatchResult()
            );

            expect(result.passed).toBe(false);
            expect(result.reason).toContain('Test pass rate');
            expect(result.recommendations).toBeDefined();
        });

        it('should fail when AC match score too low', () => {
            const result = decision.decide(
                createTestResult(),
                createMatchResult({
                    score: 0.5,
                    unmatched: ['missing criterion']
                })
            );

            expect(result.passed).toBe(false);
            expect(result.reason).toContain('AC match score');
            expect(result.details.failedCriteria).toContain('missing criterion');
        });
    });

    describe('Test 4: testsPassing helper', () => {
        it('should return true for passing tests', () => {
            expect(decision.testsPassing(createTestResult())).toBe(true);
        });

        it('should return false for failing tests', () => {
            expect(decision.testsPassing(createTestResult({ passed: false, failed: 1 }))).toBe(false);
        });
    });

    describe('Test 5: acMatching helper', () => {
        it('should return true for high match score', () => {
            expect(decision.acMatching(createMatchResult())).toBe(true);
        });

        it('should return false for low match score', () => {
            expect(decision.acMatching(createMatchResult({ score: 0.5 }))).toBe(false);
        });
    });

    describe('Test 6: generateSummary', () => {
        it('should generate passing summary', () => {
            const result = decision.decide(
                createTestResult(),
                createMatchResult()
            );

            const summary = decision.generateSummary(result);
            expect(summary).toContain('✅');
            expect(summary).toContain('PASSED');
        });

        it('should generate failing summary with recommendations', () => {
            const result = decision.decide(
                createTestResult({ passed: false, failed: 5, total: 10 }),
                createMatchResult({ score: 0.5, unmatched: ['criterion'] })
            );

            const summary = decision.generateSummary(result);
            expect(summary).toContain('❌');
            expect(summary).toContain('FAILED');
            expect(summary).toContain('Recommendations');
        });
    });
});
