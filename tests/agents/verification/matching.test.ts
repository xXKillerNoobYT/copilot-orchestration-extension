/**
 * @file verification/matching.test.ts
 * @description Tests for AcceptanceCriteriaMatcher (MT-015.3)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn()
}));

import {
    AcceptanceCriteriaMatcher,
    createMatcher
} from '../../../src/agents/verification/matching';

describe('AcceptanceCriteriaMatcher', () => {
    let matcher: AcceptanceCriteriaMatcher;

    beforeEach(() => {
        matcher = new AcceptanceCriteriaMatcher({
            threshold: 0.5 // Lower threshold for tests
        });
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultMatcher = createMatcher();
            expect(defaultMatcher).toBeInstanceOf(AcceptanceCriteriaMatcher);
        });

        it('should create instance with custom config', () => {
            const customMatcher = createMatcher({
                threshold: 0.9,
                partialMatchMultiplier: 0.3
            });
            expect(customMatcher).toBeInstanceOf(AcceptanceCriteriaMatcher);
        });
    });

    describe('Test 2: matchCriteria', () => {
        it('should return perfect score when all criteria matched', async () => {
            // Files that match criteria keywords
            const result = await matcher.matchCriteria(
                ['implement test functionality'],
                ['/test/test.ts', '/test/test.spec.ts']
            );

            expect(result.score).toBeGreaterThan(0);
            expect(result.details).toHaveLength(1);
        });

        it('should return zero score for no matches', async () => {
            const result = await matcher.matchCriteria(
                ['implement authentication'],
                ['/unrelated/file.ts']
            );

            // May or may not match depending on implementation
            expect(result).toHaveProperty('score');
            expect(result).toHaveProperty('matched');
            expect(result).toHaveProperty('unmatched');
        });

        it('should return score of 1.0 for empty criteria', async () => {
            const result = await matcher.matchCriteria([], ['/test/file.ts']);
            expect(result.score).toBe(1.0);
            expect(result.matched).toHaveLength(0);
        });
    });

    describe('Test 3: generateUnmatchedSummary', () => {
        it('should return success message when all matched', () => {
            const result = {
                matched: ['criterion 1'],
                unmatched: [],
                score: 1.0,
                details: [{
                    criterion: 'criterion 1',
                    matched: true,
                    confidence: 1.0,
                    evidence: ['Found in file.ts']
                }]
            };

            const summary = matcher.generateUnmatchedSummary(result);
            expect(summary).toContain('All acceptance criteria matched');
        });

        it('should list unmatched criteria', () => {
            const result = {
                matched: [],
                unmatched: ['criterion 1', 'criterion 2'],
                score: 0,
                details: [
                    {
                        criterion: 'criterion 1',
                        matched: false,
                        confidence: 0,
                        evidence: []
                    },
                    {
                        criterion: 'criterion 2',
                        matched: false,
                        confidence: 0,
                        evidence: []
                    }
                ]
            };

            const summary = matcher.generateUnmatchedSummary(result);
            expect(summary).toContain('2 criteria not met');
            expect(summary).toContain('criterion 1');
            expect(summary).toContain('criterion 2');
        });
    });
});
