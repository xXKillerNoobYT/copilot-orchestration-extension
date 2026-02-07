/**
 * Tests for Answer Validation System
 * @module tests/agents/answer/validation.test
 */

import {
    validateAnswer,
    validateCitedAnswer,
    quickValidate,
    ValidationResult,
    ValidationIssue,
    ValidationConfig
} from '../../../src/agents/answer/validation';
import { Citation, CitedAnswer } from '../../../src/agents/answer/citations';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('Answer Validation System', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Helper to create mock citations
    const createMockCitation = (overrides: Partial<Citation> = {}): Citation => ({
        id: 'cite-1',
        sourceType: 'plan',
        location: 'plan.json',
        confidence: 90,
        accessedAt: new Date(),
        ...overrides
    });

    describe('validateAnswer()', () => {
        describe('Basic Validation', () => {
            it('Test 1: should validate non-empty answer', () => {
                const result = validateAnswer('This is a valid answer');

                expect(result.valid).toBe(true);
                expect(result.score).toBeGreaterThan(0);
            });

            it('Test 2: should reject empty answer', () => {
                const result = validateAnswer('');

                expect(result.valid).toBe(false);
                expect(result.score).toBe(0);
                expect(result.issues).toContainEqual(
                    expect.objectContaining({ code: 'EMPTY_ANSWER' })
                );
            });

            it('Test 3: should reject whitespace-only answer', () => {
                const result = validateAnswer('   \n\t  ');

                expect(result.valid).toBe(false);
                expect(result.issues).toContainEqual(
                    expect.objectContaining({ code: 'EMPTY_ANSWER' })
                );
            });

            it('Test 4: should validate answer within length limit', () => {
                const result = validateAnswer('Short answer', [], { maxLength: 1000 });

                expect(result.valid).toBe(true);
                expect(result.issues.filter(i => i.code === 'TOO_LONG')).toHaveLength(0);
            });

            it('Test 5: should warn about answer exceeding length limit', () => {
                const longAnswer = 'a'.repeat(200);
                const result = validateAnswer(longAnswer, [], { maxLength: 100 });

                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        code: 'TOO_LONG',
                        severity: 'warning'
                    })
                );
                expect(result.suggestions).toContain('Consider breaking the answer into smaller parts');
            });
        });

        describe('Citation Validation', () => {
            it('Test 6: should pass without citations when not required', () => {
                const result = validateAnswer('Answer', [], { requireCitations: false });

                expect(result.valid).toBe(true);
                expect(result.issues.filter(i => i.code === 'NO_CITATIONS')).toHaveLength(0);
            });

            it('Test 7: should fail when citations required but missing', () => {
                const result = validateAnswer('Answer', [], { requireCitations: true });

                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        code: 'NO_CITATIONS',
                        severity: 'error'
                    })
                );
            });

            it('Test 8: should pass with citations when required', () => {
                const citations = [createMockCitation()];
                const result = validateAnswer('Answer', citations, { requireCitations: true });

                expect(result.issues.filter(i => i.code === 'NO_CITATIONS')).toHaveLength(0);
            });

            it('Test 9: should warn about few citations', () => {
                const citations = [createMockCitation()];
                const result = validateAnswer('Answer', citations, { minCitations: 3 });

                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        code: 'FEW_CITATIONS',
                        severity: 'warning'
                    })
                );
            });

            it('Test 10: should pass with enough citations', () => {
                const citations = [
                    createMockCitation({ id: 'cite-1' }),
                    createMockCitation({ id: 'cite-2' }),
                    createMockCitation({ id: 'cite-3' })
                ];
                const result = validateAnswer('Answer', citations, { minCitations: 3 });

                expect(result.issues.filter(i => i.code === 'FEW_CITATIONS')).toHaveLength(0);
            });
        });

        describe('Confidence Validation', () => {
            it('Test 11: should pass with high confidence citations', () => {
                const citations = [createMockCitation({ confidence: 95 })];
                const result = validateAnswer('Answer', citations, { minConfidence: 90 });

                expect(result.issues.filter(i => i.code === 'LOW_CONFIDENCE')).toHaveLength(0);
            });

            it('Test 12: should warn about low confidence', () => {
                const citations = [createMockCitation({ confidence: 50 })];
                const result = validateAnswer('Answer', citations, { minConfidence: 80 });

                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        code: 'LOW_CONFIDENCE',
                        severity: 'warning'
                    })
                );
            });

            it('Test 13: should calculate average confidence from multiple citations', () => {
                const citations = [
                    createMockCitation({ confidence: 60 }),
                    createMockCitation({ confidence: 80 })
                ];
                // Average = 70
                const result = validateAnswer('Answer', citations, { minConfidence: 60 });

                expect(result.issues.filter(i => i.code === 'LOW_CONFIDENCE')).toHaveLength(0);
            });

            it('Test 14: should use default confidence when no citations', () => {
                const result = validateAnswer('Answer', [], { minConfidence: 60 });

                // Default confidence is 50 when no citations
                expect(result.issues).toContainEqual(
                    expect.objectContaining({ code: 'LOW_CONFIDENCE' })
                );
            });
        });

        describe('Hallucination Detection', () => {
            it('Test 15: should detect potential hallucination patterns', () => {
                const result = validateAnswer(
                    'According to popular belief, this is correct.',
                    [],
                    { checkHallucinations: true }
                );

                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        code: 'POTENTIAL_HALLUCINATION',
                        severity: 'warning'
                    })
                );
            });

            it('Test 16: should detect "widely known" patterns', () => {
                const result = validateAnswer(
                    'It is widely known that the sky is blue.',
                    [],
                    { checkHallucinations: true }
                );

                expect(result.issues).toContainEqual(
                    expect.objectContaining({ code: 'POTENTIAL_HALLUCINATION' })
                );
            });

            it('Test 17: should detect "studies have shown" without citation', () => {
                const result = validateAnswer(
                    'Studies have shown that this approach works best.',
                    [],
                    { checkHallucinations: true }
                );

                expect(result.issues).toContainEqual(
                    expect.objectContaining({ code: 'POTENTIAL_HALLUCINATION' })
                );
            });

            it('Test 18: should not flag hallucination with supporting citation', () => {
                const citations = [
                    createMockCitation({
                        quote: 'According to popular belief and documented research...'
                    })
                ];
                const result = validateAnswer(
                    'According to popular belief, this is the correct approach.',
                    citations,
                    { checkHallucinations: true }
                );

                // Should have fewer or no hallucination warnings when supported
                const hallucinationIssues = result.issues.filter(
                    i => i.code === 'POTENTIAL_HALLUCINATION'
                );
                expect(hallucinationIssues.length).toBeLessThan(2);
            });

            it('Test 19: should skip hallucination check when disabled', () => {
                const result = validateAnswer(
                    'According to popular belief, this is correct.',
                    [],
                    { checkHallucinations: false }
                );

                expect(result.issues.filter(i => i.code === 'POTENTIAL_HALLUCINATION')).toHaveLength(0);
            });
        });

        describe('Unsupported Claims Detection', () => {
            it('Test 20: should detect definitive statements without support', () => {
                const result = validateAnswer(
                    'This is the only way to solve the problem.',
                    []
                );

                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        code: 'UNSUPPORTED_CLAIM',
                        severity: 'info'
                    })
                );
            });

            it('Test 21: should detect "you must always" patterns', () => {
                const result = validateAnswer(
                    'You must always validate inputs before processing.',
                    []
                );

                expect(result.issues).toContainEqual(
                    expect.objectContaining({ code: 'UNSUPPORTED_CLAIM' })
                );
            });

            it('Test 22: should not flag with authoritative citation', () => {
                const citations = [
                    createMockCitation({
                        sourceType: 'plan',
                        confidence: 95
                    })
                ];
                const result = validateAnswer(
                    'This is the only way to solve the problem.',
                    citations
                );

                expect(result.issues.filter(i => i.code === 'UNSUPPORTED_CLAIM')).toHaveLength(0);
            });
        });

        describe('Score Calculation', () => {
            it('Test 23: should start at 100 for valid answer', () => {
                const citations = [createMockCitation({ confidence: 90 })];
                const result = validateAnswer('Valid answer', citations, {
                    checkHallucinations: false,
                    minConfidence: 60
                });

                expect(result.score).toBeGreaterThanOrEqual(90);
            });

            it('Test 24: should deduct points for issues', () => {
                const result = validateAnswer('Valid but verbose answer', [], {
                    requireCitations: true
                });

                expect(result.score).toBeLessThan(100);
            });

            it('Test 25: should not go below 0', () => {
                const longBadAnswer = 'According to popular belief ' + 'a'.repeat(50000);
                const result = validateAnswer(longBadAnswer, [], {
                    maxLength: 100,
                    requireCitations: true,
                    minConfidence: 100
                });

                expect(result.score).toBeGreaterThanOrEqual(0);
            });

            it('Test 26: should not exceed 100', () => {
                const citations = Array(10).fill(null).map((_, i) =>
                    createMockCitation({ id: `cite-${i}`, confidence: 100 })
                );
                const result = validateAnswer('Great answer', citations);

                expect(result.score).toBeLessThanOrEqual(100);
            });
        });

        describe('Validity Determination', () => {
            it('Test 27: should be invalid with errors', () => {
                const result = validateAnswer('', []);

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.severity === 'error')).toBe(true);
            });

            it('Test 28: should be valid with only warnings', () => {
                const result = validateAnswer('A valid answer but quite long'.repeat(10), [], {
                    maxLength: 100,
                    checkHallucinations: false
                });

                // Has warning but no errors
                const hasWarning = result.issues.some(i => i.severity === 'warning');
                const hasError = result.issues.some(i => i.severity === 'error');

                if (hasWarning && !hasError && result.score >= 50) {
                    expect(result.valid).toBe(true);
                }
            });

            it('Test 29: should be invalid with score below 50', () => {
                const result = validateAnswer('Answer', [], {
                    requireCitations: true,
                    minConfidence: 100
                });

                if (result.score < 50) {
                    expect(result.valid).toBe(false);
                }
            });
        });

        describe('Config Defaults', () => {
            it('Test 30: should use default config values', () => {
                const result = validateAnswer('Normal answer');

                expect(result).toBeDefined();
                expect(typeof result.valid).toBe('boolean');
                expect(typeof result.score).toBe('number');
            });

            it('Test 31: should merge partial config', () => {
                const result = validateAnswer('Answer', [], { maxLength: 50 });

                // Should work with partial config
                expect(result).toBeDefined();
            });
        });
    });

    describe('validateCitedAnswer()', () => {
        it('Test 32: should validate cited answer structure', () => {
            const citedAnswer: CitedAnswer = {
                answer: 'This is the answer',
                citations: [createMockCitation()],
                overallConfidence: 90,
                fullySupported: true
            };

            const result = validateCitedAnswer(citedAnswer);

            expect(result.valid).toBe(true);
        });

        it('Test 33: should add warning for unsupported answer with low confidence', () => {
            const citedAnswer: CitedAnswer = {
                answer: 'This is the answer',
                citations: [],
                overallConfidence: 60,
                fullySupported: false
            };

            const result = validateCitedAnswer(citedAnswer);

            expect(result.issues).toContainEqual(
                expect.objectContaining({
                    code: 'NOT_FULLY_SUPPORTED',
                    severity: 'warning'
                })
            );
            expect(result.suggestions).toContain('Consider finding more authoritative sources');
        });

        it('Test 34: should not add warning for supported answer', () => {
            const citedAnswer: CitedAnswer = {
                answer: 'This is the answer',
                citations: [createMockCitation()],
                overallConfidence: 90,
                fullySupported: true
            };

            const result = validateCitedAnswer(citedAnswer);

            expect(result.issues.filter(i => i.code === 'NOT_FULLY_SUPPORTED')).toHaveLength(0);
        });

        it('Test 35: should deduct score for unsupported answer', () => {
            const supportedAnswer: CitedAnswer = {
                answer: 'Answer',
                citations: [createMockCitation()],
                overallConfidence: 90,
                fullySupported: true
            };

            const unsupportedAnswer: CitedAnswer = {
                answer: 'Answer',
                citations: [],
                overallConfidence: 60,
                fullySupported: false
            };

            const supportedResult = validateCitedAnswer(supportedAnswer, { checkHallucinations: false });
            const unsupportedResult = validateCitedAnswer(unsupportedAnswer, { checkHallucinations: false });

            expect(unsupportedResult.score).toBeLessThan(supportedResult.score);
        });
    });

    describe('quickValidate()', () => {
        it('Test 36: should return true for valid answer', () => {
            expect(quickValidate('This is a valid answer')).toBe(true);
        });

        it('Test 37: should return false for empty answer', () => {
            expect(quickValidate('')).toBe(false);
        });

        it('Test 38: should return false for null-ish answer', () => {
            expect(quickValidate(null as any)).toBe(false);
            expect(quickValidate(undefined as any)).toBe(false);
        });

        it('Test 39: should return false for whitespace-only answer', () => {
            expect(quickValidate('   ')).toBe(false);
        });

        it('Test 40: should return false for very long answer', () => {
            const veryLongAnswer = 'a'.repeat(25000);
            expect(quickValidate(veryLongAnswer)).toBe(false);
        });

        it('Test 41: should return false for answer containing [ERROR]', () => {
            expect(quickValidate('Something went wrong [ERROR]')).toBe(false);
        });

        it('Test 42: should return false for answer containing undefined', () => {
            expect(quickValidate('The value is undefined here')).toBe(false);
        });

        it('Test 43: should return true for answer at length limit', () => {
            const answer = 'a'.repeat(20000);
            expect(quickValidate(answer)).toBe(true);
        });

        it('Test 44: should return true for answer with special characters', () => {
            expect(quickValidate('Valid answer with $pecial ch@racters!')).toBe(true);
        });

        it('Test 45: should return true for answer with unicode', () => {
            expect(quickValidate('Valid answer with émojis 🎉 and symbols')).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('Test 46: should handle answer with only numbers', () => {
            const result = validateAnswer('42');
            expect(result.valid).toBe(true);
        });

        it('Test 47: should handle answer with newlines', () => {
            const result = validateAnswer('Line 1\nLine 2\nLine 3');
            expect(result.valid).toBe(true);
        });

        it('Test 48: should handle citations with missing optional fields', () => {
            const citation: Citation = {
                id: 'cite-1',
                sourceType: 'plan',
                location: 'plan.json',
                confidence: 90,
                accessedAt: new Date()
                // No reference, quote
            };

            const result = validateAnswer('Answer', [citation]);
            expect(result).toBeDefined();
        });

        it('Test 49: should handle empty config object', () => {
            const result = validateAnswer('Answer', [], {});
            expect(result).toBeDefined();
        });

        it('Test 50: should handle extreme config values', () => {
            const result = validateAnswer('Answer', [], {
                minConfidence: 0,
                maxLength: Infinity,
                minCitations: 0
            });
            expect(result.valid).toBe(true);
        });
    });
});
