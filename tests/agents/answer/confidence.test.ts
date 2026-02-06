/**
 * @file tests/agents/answer/confidence.test.ts
 * @description Tests for Answer Team confidence scoring (MT-014.3)
 */

import { ConfidenceScorer, createConfidenceScorer, ConfidenceResult } from '../../../src/agents/answer/confidence';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock LLM service
jest.mock('../../../src/services/llmService', () => ({
    completeLLM: jest.fn()
}));

// Mock ticketDb
jest.mock('../../../src/services/ticketDb', () => ({
    createTicket: jest.fn()
}));

import { completeLLM } from '../../../src/services/llmService';
import { createTicket } from '../../../src/services/ticketDb';

const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;
const mockCreateTicket = createTicket as jest.MockedFunction<typeof createTicket>;

describe('ConfidenceScorer', () => {
    let scorer: ConfidenceScorer;

    beforeEach(() => {
        jest.clearAllMocks();
        scorer = createConfidenceScorer();
    });

    describe('Test 1-5: scoreConfidence', () => {
        it('Test 1: should return high confidence for clear answers', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 98, "reasoning": "Answer is clear and well-supported"}'
            });

            const result = await scorer.scoreConfidence(
                'What is TypeScript?',
                'TypeScript is a strongly typed programming language that builds on JavaScript. It adds static type checking.',
                'Extensive documentation available'
            );

            // Score should be high (above 80), though factor adjustments may lower it slightly
            expect(result.score).toBeGreaterThan(80);
        });

        it('Test 2: should return low confidence for vague answers', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 40, "reasoning": "Answer is vague and uncertain"}'
            });

            const result = await scorer.scoreConfidence(
                'What is the best approach?',
                'I\'m not sure, it could be this or that, possibly maybe something else.',
                'Limited context'
            );

            expect(result.score).toBeLessThan(60);
            expect(result.needsEscalation).toBe(true);
        });

        it('Test 3: should parse JSON response correctly', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 75, "reasoning": "Reasonably confident"}'
            });

            const result = await scorer.scoreConfidence('Q', 'A', '');

            expect(result.reasoning).toBe('Reasonably confident');
        });

        it('Test 4: should handle non-JSON response gracefully', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'Confidence: 80 out of 100. The answer seems reasonable.'
            });

            const result = await scorer.scoreConfidence('Q', 'A', '');

            expect(result.score).toBeGreaterThan(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('Test 5: should return default score on LLM error', async () => {
            mockCompleteLLM.mockRejectedValue(new Error('LLM Failed'));

            const result = await scorer.scoreConfidence('Q', 'A', '');

            expect(result.score).toBe(50);
            expect(result.needsEscalation).toBe(true);
        });
    });

    describe('Test 6-10: confidence factors', () => {
        it('Test 6: should detect hedging language', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 90, "reasoning": "Good"}'
            });

            const result = await scorer.scoreConfidence(
                'How does it work?',
                'I\'m not sure. It might be this. Perhaps it could be that. I cannot say for certain.',
                ''
            );

            // Score should be reduced due to hedging
            const hedgingFactor = result.factors.find(f => f.name === 'Not Hedging');
            expect(hedgingFactor?.present).toBe(false);
        });

        it('Test 7: should check for answer length', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 90, "reasoning": "Good"}'
            });

            const result = await scorer.scoreConfidence('Q', 'Short', '');

            const lengthFactor = result.factors.find(f => f.name === 'Answer Length');
            expect(lengthFactor?.present).toBe(false); // Too short
        });

        it('Test 8: should detect code presence', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 90, "reasoning": "Good"}'
            });

            const result = await scorer.scoreConfidence(
                'How do I create a function?',
                'You can create a function like this: ```function foo() { return 42; }```',
                ''
            );

            const codeFactor = result.factors.find(f => f.name === 'Contains Code');
            expect(codeFactor?.present).toBe(true);
        });

        it('Test 9: should check question terms in answer', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 90, "reasoning": "Good"}'
            });

            const result = await scorer.scoreConfidence(
                'How does TypeScript handle interface inheritance?',
                'TypeScript interfaces can extend other interfaces using the extends keyword for inheritance.',
                ''
            );

            const addressesFactor = result.factors.find(f => f.name === 'Addresses Question');
            expect(addressesFactor?.present).toBe(true);
        });

        it('Test 10: should have multiple factors', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 80, "reasoning": "Good"}'
            });

            const result = await scorer.scoreConfidence('Q', 'A reasonable answer with some detail', '');

            expect(result.factors.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe('Test 11-15: escalation', () => {
        it('Test 11: should create escalation ticket on low confidence', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TK-1234',
                title: 'Test',
                status: 'open',
                description: '',
                priority: 2,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            const confidenceResult: ConfidenceResult = {
                score: 50,
                reasoning: 'Too uncertain',
                needsEscalation: true,
                factors: []
            };

            const ticketId = await scorer.escalate('Test question?', 'Test answer', confidenceResult);

            expect(mockCreateTicket).toHaveBeenCalled();
            expect(ticketId).toBe('TK-1234');
        });

        it('Test 12: should include question in escalation ticket', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TK-1234',
                title: 'Test',
                status: 'open',
                description: '',
                priority: 2,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            await scorer.escalate('My specific question?', 'My answer', {
                score: 40,
                reasoning: 'Low',
                needsEscalation: true,
                factors: []
            });

            expect(mockCreateTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('My specific question?')
                })
            );
        });

        it('Test 13: should skip escalation when disabled', async () => {
            const disabledScorer = createConfidenceScorer({ escalateBelow: false });

            const ticketId = await disabledScorer.escalate('Q', 'A', {
                score: 40,
                reasoning: 'Low',
                needsEscalation: true,
                factors: []
            });

            expect(mockCreateTicket).not.toHaveBeenCalled();
            expect(ticketId).toBe('');
        });

        it('Test 14: should handle ticket creation error', async () => {
            mockCreateTicket.mockRejectedValue(new Error('DB error'));

            const ticketId = await scorer.escalate('Q', 'A', {
                score: 40,
                reasoning: 'Low',
                needsEscalation: true,
                factors: []
            });

            expect(ticketId).toBe('');
        });

        it('Test 15: should set correct ticket priority', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TK-1234',
                title: 'Test',
                status: 'open',
                description: '',
                priority: 2,
                creator: 'test',
                assignee: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                taskId: null,
                version: 1,
                resolution: null
            });

            const customScorer = createConfidenceScorer({ escalationPriority: 1 });

            await customScorer.escalate('Q', 'A', {
                score: 40,
                reasoning: 'Low',
                needsEscalation: true,
                factors: []
            });

            expect(mockCreateTicket).toHaveBeenCalledWith(
                expect.objectContaining({ priority: 1 })
            );
        });
    });

    describe('Test 16-20: configuration', () => {
        it('Test 16: should use default threshold of 95', () => {
            expect(scorer.getThreshold()).toBe(95);
        });

        it('Test 17: should allow custom threshold', () => {
            const customScorer = createConfidenceScorer({ threshold: 80 });
            expect(customScorer.getThreshold()).toBe(80);
        });

        it('Test 18: should update threshold', () => {
            scorer.setThreshold(90);
            expect(scorer.getThreshold()).toBe(90);
        });

        it('Test 19: should clamp threshold to valid range', () => {
            scorer.setThreshold(150);
            expect(scorer.getThreshold()).toBeLessThanOrEqual(100);

            scorer.setThreshold(-10);
            expect(scorer.getThreshold()).toBeGreaterThanOrEqual(0);
        });

        it('Test 20: should determine escalation based on threshold', async () => {
            const lowThresholdScorer = createConfidenceScorer({ threshold: 50 });

            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 60, "reasoning": "Moderate confidence"}'
            });

            const result = await lowThresholdScorer.scoreConfidence('Q', 'A long enough answer.', '');

            // With 50 threshold, 60 should not need escalation
            expect(result.needsEscalation).toBe(false);
        });
    });
});
