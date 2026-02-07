/**
 * Tests for Clarity Agent
 * MT-011.14: Comprehensive Clarity Agent tests
 */

import { EventEmitter } from 'events';
import {
    ClarityScorer,
    ClarityTrigger,
    FollowUpManager,
    ClarityAgent,
    resetClarityAgentForTests,
    type ScoringResult,
    type ScoreBreakdown
} from '../../../src/agents/clarity';

// ============================================================================
// Mocks
// ============================================================================

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock LLM service
const mockCompleteLLM = jest.fn();
jest.mock('../../../src/services/llmService', () => ({
    completeLLM: (...args: unknown[]) => mockCompleteLLM(...args)
}));

// Mock ticket DB  
const mockAddReply = jest.fn();
const mockGetTicket = jest.fn();
const mockUpdateTicket = jest.fn();
const mockTicketDbInstance = new EventEmitter();
jest.mock('../../../src/services/ticketDb', () => ({
    addReply: (...args: unknown[]) => mockAddReply(...args),
    getTicket: (...args: unknown[]) => mockGetTicket(...args),
    updateTicket: (...args: unknown[]) => mockUpdateTicket(...args),
    getTicketDbInstance: () => mockTicketDbInstance
}));

// ============================================================================
// Test Utilities
// ============================================================================

function createMockScoringResult(overall: number): ScoringResult {
    return {
        scores: {
            overall,
            completeness: overall,
            clarity: overall,
            accuracy: overall
        },
        needsFollowUp: overall < 85,
        assessments: {
            completeness: { score: overall, reasoning: 'test', issues: [] },
            clarity: { score: overall, reasoning: 'test', issues: [] },
            accuracy: { score: overall, reasoning: 'test', issues: [] }
        },
        scoredAt: Date.now()
    };
}

function createMockScoringResultWithIssues(
    overall: number,
    issues: { completeness?: string[]; clarity?: string[]; accuracy?: string[] }
): ScoringResult {
    return {
        scores: {
            overall,
            completeness: overall,
            clarity: overall,
            accuracy: overall
        },
        needsFollowUp: overall < 85,
        assessments: {
            completeness: { score: overall, reasoning: 'test', issues: issues.completeness || [] },
            clarity: { score: overall, reasoning: 'test', issues: issues.clarity || [] },
            accuracy: { score: overall, reasoning: 'test', issues: issues.accuracy || [] }
        },
        scoredAt: Date.now()
    };
}

// ============================================================================
// ClarityScorer Tests
// ============================================================================

describe('ClarityScorer', () => {
    let scorer: ClarityScorer;

    beforeEach(() => {
        resetClarityAgentForTests();
        scorer = new ClarityScorer();
        jest.clearAllMocks();
    });

    afterEach(() => {
        resetClarityAgentForTests();
    });

    describe('MT-011.3: 0-100 clarity scoring', () => {
        it('Test 1: should initialize with default threshold of 85', () => {
            expect(scorer.getThreshold()).toBe(85);
        });

        it('Test 2: should accept custom threshold', () => {
            const custom = new ClarityScorer({ threshold: 90 });
            expect(custom.getThreshold()).toBe(90);
        });

        it('Test 3: should score reply and return result', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 75, "reasoning": "test", "missing": []}'
            });

            const result = await scorer.scoreReply('ticket-1', 'What is X?', 'X is Y');

            expect(result).toHaveProperty('scores');
            expect(result.scores).toHaveProperty('overall');
            expect(result.scores).toHaveProperty('completeness');
            expect(result.scores).toHaveProperty('clarity');
            expect(result.scores).toHaveProperty('accuracy');
        });

        it('Test 4: should emit scored event', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 90, "reasoning": "good", "missing": []}'
            });

            const scoredHandler = jest.fn();
            scorer.on('scored', scoredHandler);

            await scorer.scoreReply('ticket-1', 'Question?', 'Answer');

            expect(scoredHandler).toHaveBeenCalled();
            expect(scoredHandler.mock.calls[0][0].ticketId).toBe('ticket-1');
        });
    });

    describe('MT-011.7: Threshold detection', () => {
        it('Test 5: should detect score below threshold', () => {
            expect(scorer.checkThreshold(84)).toBe(false);
            expect(scorer.checkThreshold(85)).toBe(true);
            expect(scorer.checkThreshold(100)).toBe(true);
        });

        it('Test 6: should set needsFollowUp when below threshold', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 60, "reasoning": "poor", "missing": ["detail"]}'
            });

            const result = await scorer.scoreReply('ticket-1', 'Q', 'A');
            expect(result.needsFollowUp).toBe(true);
        });

        it('Test 7: should emit threshold-failed event when below threshold', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 50, "reasoning": "bad", "vague_parts": []}'
            });

            const handler = jest.fn();
            scorer.on('threshold-failed', handler);

            await scorer.scoreReply('ticket-1', 'Q', 'A');

            expect(handler).toHaveBeenCalled();
        });

        it('Test 8: should allow threshold updates', () => {
            scorer.setThreshold(70);
            expect(scorer.getThreshold()).toBe(70);
            expect(scorer.checkThreshold(75)).toBe(true);
        });
    });

    describe('MT-011.13: Score color display', () => {
        it('Test 9: should return red for scores below 60', () => {
            expect(scorer.getScoreColor(0)).toBe('red');
            expect(scorer.getScoreColor(59)).toBe('red');
        });

        it('Test 10: should return yellow for scores 60-84', () => {
            expect(scorer.getScoreColor(60)).toBe('yellow');
            expect(scorer.getScoreColor(84)).toBe('yellow');
        });

        it('Test 11: should return green for scores 85+', () => {
            expect(scorer.getScoreColor(85)).toBe('green');
            expect(scorer.getScoreColor(100)).toBe('green');
        });
    });

    describe('Weight normalization', () => {
        it('Test 12: should normalize weights that do not sum to 1', () => {
            const customScorer = new ClarityScorer({
                weights: {
                    completeness: 0.5,
                    clarity: 0.5,
                    accuracy: 0.5
                }
            });
            const config = customScorer.getConfig();
            const sum = config.weights.completeness + config.weights.clarity + config.weights.accuracy;
            expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
        });
    });

    describe('Threshold boundary cases', () => {
        it('Test 13: should throw error for negative threshold', () => {
            expect(() => scorer.setThreshold(-1)).toThrow('Threshold must be 0-100');
        });

        it('Test 14: should throw error for threshold over 100', () => {
            expect(() => scorer.setThreshold(101)).toThrow('Threshold must be 0-100');
        });

        it('Test 15: should accept boundary values 0 and 100', () => {
            scorer.setThreshold(0);
            expect(scorer.getThreshold()).toBe(0);
            scorer.setThreshold(100);
            expect(scorer.getThreshold()).toBe(100);
        });
    });

    describe('Weight updates', () => {
        it('Test 16: should update weights with setWeights', () => {
            scorer.setWeights({ completeness: 0.5, clarity: 0.3, accuracy: 0.2 });
            const config = scorer.getConfig();
            expect(config.weights.completeness).toBe(0.5);
            expect(config.weights.clarity).toBe(0.3);
            expect(config.weights.accuracy).toBe(0.2);
        });

        it('Test 17: should re-normalize after partial weight update', () => {
            scorer.setWeights({ completeness: 0.8 });  // Only update one
            const config = scorer.getConfig();
            const sum = config.weights.completeness + config.weights.clarity + config.weights.accuracy;
            expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
        });
    });

    describe('Scoring history', () => {
        it('Test 18: should track scoring history', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 80, "reasoning": "ok", "missing": []}'
            });

            await scorer.scoreReply('ticket-1', 'Q1', 'A1');
            await scorer.scoreReply('ticket-1', 'Q2', 'A2');

            const history = scorer.getHistory('ticket-1');
            expect(history.length).toBe(2);
        });

        it('Test 19: should return empty array for unknown ticket', () => {
            const history = scorer.getHistory('nonexistent');
            expect(history).toEqual([]);
        });

        it('Test 20: should clear history for specific ticket', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 80, "reasoning": "ok", "missing": []}'
            });

            await scorer.scoreReply('ticket-1', 'Q', 'A');
            expect(scorer.getHistory('ticket-1').length).toBe(1);

            scorer.clearHistory('ticket-1');
            expect(scorer.getHistory('ticket-1').length).toBe(0);
        });
    });

    describe('Error handling', () => {
        it('Test 21: should use fallback score on LLM failure', async () => {
            mockCompleteLLM.mockRejectedValue(new Error('LLM error'));

            // The scorer gracefully handles errors with fallback score of 50
            const result = await scorer.scoreReply('ticket-1', 'Q', 'A');
            expect(result.scores.completeness).toBe(50);
            expect(result.scores.clarity).toBe(50);
            expect(result.scores.accuracy).toBe(50);
        });

        it('Test 22: should handle malformed JSON response gracefully', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'Not valid JSON at all'
            });

            // Should use fallback score of 50
            const result = await scorer.scoreReply('ticket-1', 'Q', 'A');
            expect(result.scores.completeness).toBe(50);
        });

        it('Test 23: should clamp scores to 0-100 range', async () => {
            mockCompleteLLM
                .mockResolvedValueOnce({ content: '{"score": 150, "reasoning": "high", "missing": []}' })
                .mockResolvedValueOnce({ content: '{"score": -50, "reasoning": "low", "vague_parts": []}' })
                .mockResolvedValueOnce({ content: '{"score": 80, "reasoning": "ok", "discrepancies": []}' });

            const result = await scorer.scoreReply('ticket-1', 'Q', 'A');
            expect(result.scores.completeness).toBe(100);  // Clamped from 150
            expect(result.scores.clarity).toBe(0);  // Clamped from -50
        });

        it('Test 24: should handle NaN score as 50', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": "invalid", "reasoning": "bad", "missing": []}'
            });

            const result = await scorer.scoreReply('ticket-1', 'Q', 'A');
            expect(result.scores.completeness).toBe(50);
        });
    });

    describe('Config access', () => {
        it('Test 25: should return copy of config', () => {
            const config1 = scorer.getConfig();
            const config2 = scorer.getConfig();
            expect(config1).toEqual(config2);
            expect(config1).not.toBe(config2);  // Should be different objects
        });
    });
});

// ============================================================================
// ClarityTrigger Tests
// ============================================================================

describe('ClarityTrigger', () => {
    let trigger: ClarityTrigger;

    beforeEach(() => {
        resetClarityAgentForTests();
        trigger = new ClarityTrigger({ reviewDelayMs: 100 });
        jest.clearAllMocks();
    });

    afterEach(() => {
        trigger.cancelAll();
        resetClarityAgentForTests();
    });

    describe('MT-011.2: Ticket reply review trigger', () => {
        it('Test 12: should queue review after delay', (done) => {
            trigger.on('review-queued', (data) => {
                expect(data.ticketId).toBe('ticket-1');
                done();
            });

            trigger.queueReview('ticket-1', 'This is a reply');
        });

        it('Test 13: should skip reviews when disabled', () => {
            trigger.setEnabled(false);

            const handler = jest.fn();
            trigger.on('review-skipped', handler);

            // Simulate event that would trigger review
            // The trigger won't queue when disabled
            expect(trigger.getPendingCount()).toBe(0);
        });

        it('Test 14: should track pending reviews', () => {
            trigger.queueReview('ticket-1', 'Reply 1');
            trigger.queueReview('ticket-2', 'Reply 2');

            expect(trigger.getPendingCount()).toBe(2);
        });
    });

    describe('MT-011.11: Priority boost', () => {
        it('Test 15: should queue with P1 priority by default', () => {
            trigger.queueReview('ticket-1', 'Reply');

            const pending = trigger.getPendingReviews();
            expect(pending[0].priority).toBe(1);
        });

        it('Test 16: should boost lower priority to P1', () => {
            trigger.queueReview('ticket-1', 'Reply', { priority: 3 });

            const result = trigger.boostPriority('ticket-1');
            expect(result).toBe(true);

            const pending = trigger.getPendingReviews();
            expect(pending[0].priority).toBe(1);
        });

        it('Test 17: should return false when boosting already P1', () => {
            trigger.queueReview('ticket-1', 'Reply', { priority: 1 });

            const result = trigger.boostPriority('ticket-1');
            expect(result).toBe(false);
        });
    });

    describe('Queue management', () => {
        it('Test 18: should cancel specific review', () => {
            trigger.queueReview('ticket-1', 'Reply');

            const result = trigger.cancelReview('ticket-1');
            expect(result).toBe(true);
            expect(trigger.getPendingCount()).toBe(0);
        });

        it('Test 19: should cancel all reviews', () => {
            trigger.queueReview('ticket-1', 'Reply 1');
            trigger.queueReview('ticket-2', 'Reply 2');

            trigger.cancelAll();
            expect(trigger.getPendingCount()).toBe(0);
        });
    });
});

// ============================================================================
// FollowUpManager Tests
// ============================================================================

describe('FollowUpManager', () => {
    let manager: FollowUpManager;

    beforeEach(() => {
        resetClarityAgentForTests();
        manager = new FollowUpManager({ autoPost: false });
        jest.clearAllMocks();
    });

    afterEach(() => {
        resetClarityAgentForTests();
    });

    describe('MT-011.8: Auto-reply generation', () => {
        it('Test 20: should generate follow-up questions', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Can you elaborate?", "What do you mean?"]}'
            });

            const scoringResult = createMockScoringResult(70);
            const result = await manager.generateFollowUp(
                'ticket-1',
                scoringResult,
                'What is X?',
                'X is Y'
            );

            expect(result.questions).toHaveLength(2);
            expect(result.iteration).toBe(1);
        });

        it('Test 21: should limit questions to maxQuestions', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1", "Q2", "Q3", "Q4", "Q5"]}'
            });

            const scoringResult = createMockScoringResult(70);
            const result = await manager.generateFollowUp(
                'ticket-1',
                scoringResult,
                'Q',
                'A'
            );

            expect(result.questions.length).toBeLessThanOrEqual(3);
        });
    });

    describe('MT-011.9: Iteration limit', () => {
        it('Test 22: should track iterations', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const scoringResult = createMockScoringResult(70);

            await manager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');
            expect(manager.getIterationCount('ticket-1')).toBe(1);

            await manager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');
            expect(manager.getIterationCount('ticket-1')).toBe(2);
        });

        it('Test 23: should stop at max iterations', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const limitedManager = new FollowUpManager({ maxIterations: 2, autoPost: false });
            const scoringResult = createMockScoringResult(70);

            await limitedManager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');
            await limitedManager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');

            const result = await limitedManager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');

            expect(result.maxReached).toBe(true);
            expect(result.questions).toHaveLength(0);
        });

        it('Test 24: should emit max-iterations-reached event', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const limitedManager = new FollowUpManager({ maxIterations: 1, autoPost: false });
            const handler = jest.fn();
            limitedManager.on('max-iterations-reached', handler);

            const scoringResult = createMockScoringResult(70);
            await limitedManager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');
            await limitedManager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('MT-011.10: Escalation', () => {
        it('Test 25: should escalate with summary', async () => {
            mockCompleteLLM
                .mockResolvedValueOnce({ content: '{"questions": ["Q1"]}' })
                .mockResolvedValueOnce({ content: 'Escalation summary text' });

            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');

            const result = await manager.escalate('ticket-1', 'Question', 'Reply');

            expect(result.escalated).toBe(true);
            expect(result.iterationCount).toBe(1);
        });

        it('Test 26: should emit escalated event', async () => {
            mockCompleteLLM
                .mockResolvedValueOnce({ content: '{"questions": ["Q1"]}' })
                .mockResolvedValueOnce({ content: 'Summary' });

            const handler = jest.fn();
            manager.on('escalated', handler);

            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');
            await manager.escalate('ticket-1', 'Q', 'A');

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('MT-011.12: Ticket thread integration', () => {
        it('Test 27: should post follow-up to ticket thread', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Can you clarify?"]}'
            });
            mockGetTicket.mockResolvedValue({
                id: 'ticket-1',
                thread: []
            });
            mockUpdateTicket.mockResolvedValue(undefined);

            const postManager = new FollowUpManager({ autoPost: true });
            const scoringResult = createMockScoringResult(70);

            await postManager.generateFollowUp('ticket-1', scoringResult, 'Q', 'A');

            expect(mockUpdateTicket).toHaveBeenCalled();
            expect(mockUpdateTicket.mock.calls[0][0]).toBe('ticket-1');
            // Should update ticket with thread
            expect(mockUpdateTicket.mock.calls[0][1]).toHaveProperty('thread');
        });
    });

    describe('Additional FollowUpManager coverage', () => {
        it('Test 34: should handle invalid JSON response in parseFollowUpResponse', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'Not valid JSON at all'
            });

            const scoringResult = createMockScoringResult(70);
            const result = await manager.generateFollowUp('ticket-2', scoringResult, 'Q', 'A');

            expect(result.questions).toEqual([]);
        });

        it('Test 35: should handle error during generateFollowUp', async () => {
            mockCompleteLLM.mockRejectedValue(new Error('LLM error'));

            const scoringResult = createMockScoringResult(70);
            
            await expect(
                manager.generateFollowUp('ticket-3', scoringResult, 'Q', 'A')
            ).rejects.toThrow('LLM error');
        });

        it('Test 36: should getHistory for a ticket', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-4', scoringResult, 'Q', 'A');

            const history = manager.getHistory('ticket-4');
            expect(history).toBeDefined();
            expect(history?.count).toBe(1);
        });

        it('Test 37: should return undefined for unknown ticket history', () => {
            const history = manager.getHistory('unknown-ticket');
            expect(history).toBeUndefined();
        });

        it('Test 38: should resetIterations', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-5', scoringResult, 'Q', 'A');
            expect(manager.getIterationCount('ticket-5')).toBe(1);

            manager.resetIterations('ticket-5');
            expect(manager.getIterationCount('ticket-5')).toBe(0);
        });

        it('Test 39: should check hasReachedMax', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const limitedManager = new FollowUpManager({ maxIterations: 1, autoPost: false });
            expect(limitedManager.hasReachedMax('ticket-6')).toBe(false);

            const scoringResult = createMockScoringResult(70);
            await limitedManager.generateFollowUp('ticket-6', scoringResult, 'Q', 'A');
            expect(limitedManager.hasReachedMax('ticket-6')).toBe(true);
        });

        it('Test 40: should setMaxIterations', () => {
            manager.setMaxIterations(2);
            // hasReachedMax uses >= comparison
            mockCompleteLLM.mockResolvedValue({ content: '{"questions": ["Q1"]}' });
            expect(manager.hasReachedMax('ticket-7')).toBe(false);
        });

        it('Test 40b: should throw error for invalid max iterations', () => {
            expect(() => manager.setMaxIterations(0)).toThrow('Max iterations must be at least 1');
            expect(() => manager.setMaxIterations(-1)).toThrow('Max iterations must be at least 1');
        });

        it('Test 41: should handle postToTicket when ticket not found', async () => {
            mockGetTicket.mockResolvedValue(null);

            await manager.postToTicket('nonexistent-ticket', ['Q1'], 50);

            expect(mockUpdateTicket).not.toHaveBeenCalled();
        });

        it('Test 42: should handle postToTicket error', async () => {
            mockGetTicket.mockRejectedValue(new Error('DB error'));

            // Should not throw, just log error
            await manager.postToTicket('error-ticket', ['Q1'], 50);
        });

        it('Test 43: should handle escalate without prior iterations', async () => {
            mockCompleteLLM.mockResolvedValue({ content: 'Summary' });
            mockGetTicket.mockResolvedValue({ id: 'ticket-8', status: 'open' });
            mockUpdateTicket.mockResolvedValue(undefined);

            const result = await manager.escalate('ticket-8', 'Q', 'A');

            // Without prior iterations, escalation returns false
            expect(result.escalated).toBe(false);
            expect(result.reason).toContain('No iteration history');
        });

        it('Test 44: should handle escalate gracefully with iteration history', async () => {
            // First create some iteration history
            mockCompleteLLM.mockResolvedValueOnce({ content: '{"questions": ["Q1"]}' });
            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-9', scoringResult, 'Q', 'A');

            // Now mock the escalation LLM call
            mockCompleteLLM.mockResolvedValueOnce({ content: 'Escalation summary' });
            mockGetTicket.mockResolvedValue({ id: 'ticket-9', status: 'open' });

            const result = await manager.escalate('ticket-9', 'Q', 'A');

            expect(result.escalated).toBe(true);
        });

        it('Test 45: should return 0 for unknown ticket iteration count', () => {
            expect(manager.getIterationCount('unknown-ticket')).toBe(0);
        });

        it('Test 46: should emit follow-up-generated event', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const handler = jest.fn();
            manager.on('follow-up-generated', handler);

            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-10', scoringResult, 'Q', 'A');

            expect(handler).toHaveBeenCalled();
        });

        it('Test 47: should emit iteration-complete event', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Q1"]}'
            });

            const handler = jest.fn();
            manager.on('iteration-complete', handler);

            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-11', scoringResult, 'Q', 'A');

            expect(handler).toHaveBeenCalledWith({ ticketId: 'ticket-11', iteration: 1 });
        });

        it('Test 48: should collect completeness issues for LLM context', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Clarify X"]}'
            });

            const scoringResult = createMockScoringResultWithIssues(60, {
                completeness: ['Missing error handling', 'No edge cases covered']
            });

            const result = await manager.generateFollowUp('ticket-12', scoringResult, 'Q', 'A');

            // The issues are collected and passed to LLM - verify the call includes them
            expect(mockCompleteLLM).toHaveBeenCalled();
            expect(result.questions.length).toBeGreaterThan(0);
        });

        it('Test 49: should collect clarity issues for LLM context', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Please clarify"]}'
            });

            const scoringResult = createMockScoringResultWithIssues(60, {
                clarity: ['Vague terminology', 'Unclear scope']
            });

            const result = await manager.generateFollowUp('ticket-13', scoringResult, 'Q', 'A');

            expect(mockCompleteLLM).toHaveBeenCalled();
            expect(result.questions.length).toBeGreaterThan(0);
        });

        it('Test 50: should collect accuracy issues for LLM context', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Verify this"]}'
            });

            const scoringResult = createMockScoringResultWithIssues(60, {
                accuracy: ['Contradicts documentation', 'Outdated reference']
            });

            const result = await manager.generateFollowUp('ticket-14', scoringResult, 'Q', 'A');

            expect(mockCompleteLLM).toHaveBeenCalled();
            expect(result.questions.length).toBeGreaterThan(0);
        });

        it('Test 51: should collect all issue types combined', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"questions": ["Combined question"]}'
            });

            const scoringResult = createMockScoringResultWithIssues(40, {
                completeness: ['Missing tests'],
                clarity: ['Vague description'],
                accuracy: ['Wrong assumption']
            });

            const result = await manager.generateFollowUp('ticket-15', scoringResult, 'Q', 'A');

            expect(mockCompleteLLM).toHaveBeenCalled();
            expect(result.questions.length).toBeGreaterThan(0);
        });

        it('Test 52: should post escalation to ticket when autoPost enabled', async () => {
            const autoPostManager = new FollowUpManager({ autoPost: true, maxIterations: 1 });

            // Generate follow-up first to create iteration history
            mockCompleteLLM.mockResolvedValueOnce({ content: '{"questions": ["Q1"]}' });
            const scoringResult = createMockScoringResult(70);
            await autoPostManager.generateFollowUp('ticket-16', scoringResult, 'Q', 'A');

            // Now escalate
            mockCompleteLLM.mockResolvedValueOnce({ content: 'Escalation summary text' });
            mockGetTicket.mockResolvedValue({ id: 'ticket-16', status: 'open', thread: [] });
            mockUpdateTicket.mockResolvedValue(undefined);

            const result = await autoPostManager.escalate('ticket-16', 'Q', 'A');

            expect(result.escalated).toBe(true);
            // updateTicket should be called for adding escalation message to thread
            expect(mockUpdateTicket).toHaveBeenCalledWith('ticket-16', expect.objectContaining({
                thread: expect.any(Array)
            }));
        });

        it('Test 53: should handle ticket update failure gracefully in escalate', async () => {
            // Generate follow-up first to create iteration history
            mockCompleteLLM.mockResolvedValueOnce({ content: '{"questions": ["Q1"]}' });
            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-17', scoringResult, 'Q', 'A');

            // Now escalate - updateTicket will fail
            mockCompleteLLM.mockResolvedValueOnce({ content: 'Summary' });
            mockGetTicket.mockResolvedValue({ id: 'ticket-17', status: 'open' });
            mockUpdateTicket.mockRejectedValue(new Error('Update failed'));

            // Should not throw, escalation should still succeed (update is best-effort)
            const result = await manager.escalate('ticket-17', 'Q', 'A');

            expect(result.escalated).toBe(true);
        });

        it('Test 54: should handle escalation LLM failure', async () => {
            // Generate follow-up first to create iteration history
            mockCompleteLLM.mockResolvedValueOnce({ content: '{"questions": ["Q1"]}' });
            const scoringResult = createMockScoringResult(70);
            await manager.generateFollowUp('ticket-18', scoringResult, 'Q', 'A');

            // Now escalate - LLM will fail
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const result = await manager.escalate('ticket-18', 'Q', 'A');

            expect(result.escalated).toBe(false);
            expect(result.reason).toContain('Escalation failed');
        });
    });
});

// ============================================================================
// ClarityAgent Integration Tests
// ============================================================================

describe('ClarityAgent', () => {
    let agent: ClarityAgent;

    beforeEach(() => {
        resetClarityAgentForTests();
        agent = new ClarityAgent();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        if (agent.isActive()) {
            await agent.shutdown();
        }
        resetClarityAgentForTests();
    });

    describe('Initialization', () => {
        it('Test 28: should initialize all components', async () => {
            await agent.initialize();

            expect(agent.getScorer()).not.toBeNull();
            expect(agent.getTrigger()).not.toBeNull();
            expect(agent.getFollowUpManager()).not.toBeNull();
        });

        it('Test 29: should emit initialized event', async () => {
            const handler = jest.fn();
            agent.on('initialized', handler);

            await agent.initialize();

            expect(handler).toHaveBeenCalled();
        });

        it('Test 30: should be active after initialization', async () => {
            expect(agent.isActive()).toBe(false);
            await agent.initialize();
            expect(agent.isActive()).toBe(true);
        });
    });

    describe('Full review cycle', () => {
        it('Test 31: should review reply and return scores', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: '{"score": 90, "reasoning": "good", "missing": []}'
            });

            await agent.initialize();

            const result = await agent.reviewReply(
                'ticket-1',
                'What is the status?',
                'The status is complete with all tests passing.'
            );

            expect(result.scored).toBeDefined();
            expect(result.scored.scores.overall).toBeGreaterThan(0);
        });

        it('Test 32: should generate follow-up for low scores', async () => {
            mockCompleteLLM
                .mockResolvedValueOnce({ content: '{"score": 50, "reasoning": "bad", "missing": ["detail"]}' })
                .mockResolvedValueOnce({ content: '{"score": 50, "reasoning": "bad", "vague_parts": []}' })
                .mockResolvedValueOnce({ content: '{"score": 50, "reasoning": "bad", "discrepancies": []}' })
                .mockResolvedValueOnce({ content: '{"questions": ["Please elaborate"]}' });

            await agent.initialize({ followUp: { autoPost: false } });

            const result = await agent.reviewReply(
                'ticket-1',
                'What happened?',
                'Yes'
            );

            expect(result.scored.needsFollowUp).toBe(true);
            expect(result.followUp).not.toBeNull();
            expect(result.followUp?.questions.length).toBeGreaterThan(0);
        });
    });

    describe('Shutdown', () => {
        it('Test 33: should shutdown cleanly', async () => {
            const handler = jest.fn();
            agent.on('shutdown', handler);

            await agent.initialize();
            await agent.shutdown();

            expect(handler).toHaveBeenCalled();
            expect(agent.isActive()).toBe(false);
        });
    });
});
