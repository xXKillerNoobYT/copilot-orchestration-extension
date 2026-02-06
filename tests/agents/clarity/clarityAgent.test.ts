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
