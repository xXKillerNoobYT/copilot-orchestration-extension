/**
 * Tests for askQuestion tool
 *
 * Covers validation, success responses, timeouts, and error handling.
 */

import { handleAskQuestion, validateAskQuestionParams } from '../../../src/mcpServer/tools/askQuestion';
import * as orchestrator from '../../../src/services/orchestrator';
import * as ticketDb from '../../../src/services/ticketDb';

jest.mock('../../../src/services/orchestrator');
jest.mock('../../../src/services/ticketDb');
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('askQuestion Tool', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Parameter Validation', () => {
        it('Test 1: should reject non-object params', () => {
            const result = validateAskQuestionParams('invalid');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Parameters must be an object');
        });

        it('Test 2: should require non-empty question', () => {
            const result = validateAskQuestionParams({ question: '' });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('question is required');
        });

        it('Test 3: should reject non-string chatId', () => {
            const result = validateAskQuestionParams({ question: 'Hello', chatId: 123 });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('chatId must be a string');
        });

        it('Test 4: should accept valid parameters', () => {
            const result = validateAskQuestionParams({ question: 'Hello', chatId: 'chat-1' });
            expect(result.isValid).toBe(true);
        });
    });

    describe('Answer Handling', () => {
        it('Test 5: should return answer on success', async () => {
            (orchestrator.routeToAnswerAgent as jest.Mock).mockResolvedValue('Answer text');

            const response = await handleAskQuestion({ question: 'What is this?' });

            expect(response.success).toBe(true);
            expect(response.answer).toBe('Answer text');
        });

        it('Test 6: should create ticket on timeout', async () => {
            jest.useFakeTimers();

            (orchestrator.routeToAnswerAgent as jest.Mock).mockImplementation(
                () => new Promise(() => {
                    // Never resolves
                })
            );

            (ticketDb.createTicket as jest.Mock).mockResolvedValue({
                id: 'TICKET-001',
                title: 'Timeout',
                status: 'blocked',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const responsePromise = handleAskQuestion({ question: 'Slow question', chatId: 'chat-2' });
            jest.advanceTimersByTime(45_000);
            await Promise.resolve();

            const response = await responsePromise;

            expect(response.success).toBe(false);
            expect(response.error?.code).toBe('ANSWER_TIMEOUT');
            expect(response.ticketId).toBe('TICKET-001');
        });

        it('Test 7: should return internal error on failure', async () => {
            (orchestrator.routeToAnswerAgent as jest.Mock).mockRejectedValue(new Error('LLM failure'));

            const response = await handleAskQuestion({ question: 'Fail question' });

            expect(response.success).toBe(false);
            expect(response.error?.code).toBe('INTERNAL_ERROR');
            expect(response.error?.message).toContain('LLM failure');
        });
    });
});
