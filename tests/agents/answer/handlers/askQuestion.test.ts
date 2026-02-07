/**
 * Tests for askQuestion Handler
 * @module tests/agents/answer/handlers/askQuestion.test
 */

import {
    handleAskQuestion,
    answerQuestion,
    getQuestionStatus,
    getPendingQuestions,
    clearPendingQuestions,
    validateAskQuestionRequest,
    QuestionRequest,
    AskQuestionResponse,
    AskQuestionConfig
} from '../../../../src/agents/answer/handlers/askQuestion';

// Mock logger
jest.mock('../../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('askQuestion Handler', () => {
    beforeEach(() => {
        clearPendingQuestions();
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // Helper to create valid request
    const createValidRequest = (overrides: Partial<QuestionRequest> = {}): QuestionRequest => ({
        agentId: 'test-agent',
        questionType: 'clarification',
        question: 'What is the primary color for buttons?',
        invokeTrigger: 'Will apply this color to Button.tsx',
        priority: 'normal',
        ...overrides
    });

    describe('handleAskQuestion()', () => {
        describe('Request Validation', () => {
            it('Test 1: should accept valid request', async () => {
                const request = createValidRequest();
                const response = await handleAskQuestion(request);
                
                expect(response.sent).toBe(true);
                expect(response.status).toBe('pending');
                expect(response.questionId).toMatch(/^q-\d+-\d+$/);
            });

            it('Test 2: should reject request without agentId', async () => {
                const request = createValidRequest({ agentId: '' });
                const response = await handleAskQuestion(request);
                
                expect(response.sent).toBe(false);
                expect(response.status).toBe('rejected');
                expect(response.message).toContain('Agent ID');
            });

            it('Test 3: should reject request with short question', async () => {
                const request = createValidRequest({ question: 'Hi?' });
                const response = await handleAskQuestion(request);
                
                expect(response.sent).toBe(false);
                expect(response.status).toBe('rejected');
                expect(response.message).toContain('5 characters');
            });

            it('Test 4: should reject request without invokeTrigger when required', async () => {
                const request = createValidRequest({ invokeTrigger: '' });
                const response = await handleAskQuestion(request, { requireInvokeTrigger: true });
                
                expect(response.sent).toBe(false);
                expect(response.status).toBe('rejected');
                expect(response.message).toContain('invoke_trigger');
            });

            it('Test 5: should accept request without invokeTrigger when not required', async () => {
                const request = createValidRequest({ invokeTrigger: '' });
                const response = await handleAskQuestion(request, { requireInvokeTrigger: false });
                
                expect(response.sent).toBe(true);
            });

            it('Test 6: should reject choice question without options', async () => {
                const request = createValidRequest({ 
                    questionType: 'choice',
                    options: undefined
                });
                const response = await handleAskQuestion(request);
                
                expect(response.sent).toBe(false);
                expect(response.message).toContain('at least 2 options');
            });

            it('Test 7: should reject choice question with single option', async () => {
                const request = createValidRequest({ 
                    questionType: 'choice',
                    options: ['only one']
                });
                const response = await handleAskQuestion(request);
                
                expect(response.sent).toBe(false);
            });

            it('Test 8: should accept choice question with valid options', async () => {
                const request = createValidRequest({ 
                    questionType: 'choice',
                    options: ['Option A', 'Option B']
                });
                const response = await handleAskQuestion(request);
                
                expect(response.sent).toBe(true);
            });
        });

        describe('Pending Question Limit', () => {
            it('Test 9: should reject when max pending reached', async () => {
                const config: Partial<AskQuestionConfig> = { maxPendingQuestions: 2 };
                
                await handleAskQuestion(createValidRequest({ question: 'Question 1?' }), config);
                await handleAskQuestion(createValidRequest({ question: 'Question 2?' }), config);
                
                const response = await handleAskQuestion(
                    createValidRequest({ question: 'Question 3?' }),
                    config
                );
                
                expect(response.sent).toBe(false);
                expect(response.message).toContain('Maximum pending questions');
            });

            it('Test 10: should allow new questions after limit when old ones expire', async () => {
                const config: Partial<AskQuestionConfig> = { maxPendingQuestions: 1 };
                
                await handleAskQuestion(
                    createValidRequest({ timeoutSeconds: 5 }),
                    config
                );
                
                // Advance time past the timeout to clean up the question
                jest.advanceTimersByTime(6000);
                
                const second = await handleAskQuestion(
                    createValidRequest({ question: 'Second question?' }),
                    config
                );
                
                expect(second.sent).toBe(true);
            });
        });

        describe('Auto-Answer/Caching', () => {
            it('Test 11: should auto-answer yes/no question with yes for should questions', async () => {
                const request = createValidRequest({ 
                    questionType: 'choice',
                    question: 'Should we proceed with the change?',
                    options: ['yes', 'no'],
                    invokeTrigger: 'Will apply changes'
                });
                
                const response = await handleAskQuestion(request, { allowAutoAnswer: true });
                
                expect(response.status).toBe('answered');
                expect(response.answer).toBe('yes');
            });

            it('Test 12: should use default value for proceed questions', async () => {
                const request = createValidRequest({ 
                    question: 'Do you want to proceed?',
                    defaultValue: 'yes'
                });
                
                const response = await handleAskQuestion(request, { allowAutoAnswer: true });
                
                expect(response.status).toBe('answered');
                expect(response.answer).toBe('yes');
            });

            it('Test 13: should not auto-answer when disabled', async () => {
                const request = createValidRequest({ 
                    questionType: 'choice',
                    question: 'Should we proceed?',
                    options: ['yes', 'no']
                });
                
                const response = await handleAskQuestion(request, { allowAutoAnswer: false });
                
                expect(response.status).toBe('pending');
            });
        });

        describe('Timeout Handling', () => {
            it('Test 14: should use custom timeout', async () => {
                const request = createValidRequest({ timeoutSeconds: 60 });
                const response = await handleAskQuestion(request);
                
                expect(response.message).toContain('60s');
            });

            it('Test 15: should use default timeout when not specified', async () => {
                const request = createValidRequest();
                const response = await handleAskQuestion(request, { defaultTimeoutSeconds: 120 });
                
                expect(response.message).toContain('120s');
            });

            it('Test 16: should clean up question after timeout', async () => {
                const request = createValidRequest({ timeoutSeconds: 10 });
                const response = await handleAskQuestion(request);
                
                expect(getPendingQuestions()).toHaveLength(1);
                
                jest.advanceTimersByTime(15000);
                
                // After timeout, question should be removed
                const status = getQuestionStatus(response.questionId);
                expect(status).toBeNull();
            });
        });

        describe('Error Handling', () => {
            it('Test 17: should handle errors gracefully', async () => {
                // Create a request that might cause issues
                const request = createValidRequest();
                const response = await handleAskQuestion(request);
                
                expect(response).toBeDefined();
                expect(['pending', 'answered', 'rejected']).toContain(response.status);
            });
        });
    });

    describe('answerQuestion()', () => {
        it('Test 18: should answer pending question', async () => {
            const request = createValidRequest();
            const { questionId } = await handleAskQuestion(request);
            
            const result = answerQuestion(questionId, 'Blue is the color');
            
            expect(result).toBe(true);
        });

        it('Test 19: should return false for unknown question', () => {
            const result = answerQuestion('unknown-id', 'answer');
            
            expect(result).toBe(false);
        });

        it('Test 20: should return false for already answered question', async () => {
            const request = createValidRequest();
            const { questionId } = await handleAskQuestion(request);
            
            answerQuestion(questionId, 'First answer');
            const result = answerQuestion(questionId, 'Second answer');
            
            expect(result).toBe(false);
        });

        it('Test 21: should store selected index for choice questions', async () => {
            const request = createValidRequest({
                questionType: 'choice',
                options: ['A', 'B', 'C']
            });
            const { questionId } = await handleAskQuestion(request);
            
            answerQuestion(questionId, 'B', 1);
            
            const status = getQuestionStatus(questionId);
            expect(status?.selectedIndex).toBe(1);
        });
    });

    describe('getQuestionStatus()', () => {
        it('Test 22: should return null for unknown question', () => {
            expect(getQuestionStatus('unknown')).toBeNull();
        });

        it('Test 23: should return pending status', async () => {
            const { questionId } = await handleAskQuestion(createValidRequest());
            
            const status = getQuestionStatus(questionId);
            
            expect(status?.status).toBe('pending');
        });

        it('Test 24: should return answered status with answer', async () => {
            const { questionId } = await handleAskQuestion(createValidRequest());
            answerQuestion(questionId, 'The answer');
            
            const status = getQuestionStatus(questionId);
            
            expect(status?.status).toBe('answered');
            expect(status?.answer).toBe('The answer');
        });

        it('Test 25: should return null after expiration (question is cleaned up)', async () => {
            const { questionId } = await handleAskQuestion(
                createValidRequest({ timeoutSeconds: 5 })
            );
            
            jest.advanceTimersByTime(6000);
            
            // After timeout, the cleanup callback removes the question
            const status = getQuestionStatus(questionId);
            expect(status).toBeNull();
        });
    });

    describe('getPendingQuestions()', () => {
        it('Test 26: should return empty array when no questions', () => {
            expect(getPendingQuestions()).toEqual([]);
        });

        it('Test 27: should return pending questions', async () => {
            await handleAskQuestion(createValidRequest({ question: 'Question 1?' }));
            await handleAskQuestion(createValidRequest({ question: 'Question 2?' }));
            
            const pending = getPendingQuestions();
            
            expect(pending).toHaveLength(2);
        });

        it('Test 28: should not include answered questions', async () => {
            const { questionId } = await handleAskQuestion(createValidRequest());
            answerQuestion(questionId, 'answer');
            
            expect(getPendingQuestions()).toHaveLength(0);
        });

        it('Test 29: should not include expired questions', async () => {
            await handleAskQuestion(createValidRequest({ timeoutSeconds: 5 }));
            
            jest.advanceTimersByTime(6000);
            
            expect(getPendingQuestions()).toHaveLength(0);
        });
    });

    describe('clearPendingQuestions()', () => {
        it('Test 30: should clear all pending questions', async () => {
            await handleAskQuestion(createValidRequest({ question: 'Q1?' }));
            await handleAskQuestion(createValidRequest({ question: 'Q2?' }));
            
            clearPendingQuestions();
            
            expect(getPendingQuestions()).toHaveLength(0);
        });

        it('Test 31: should reset question counter', async () => {
            await handleAskQuestion(createValidRequest());
            clearPendingQuestions();
            
            const { questionId } = await handleAskQuestion(createValidRequest());
            
            expect(questionId).toMatch(/^q-1-/);
        });
    });

    describe('validateAskQuestionRequest()', () => {
        it('Test 32: should return null for non-object', () => {
            expect(validateAskQuestionRequest(null)).toBeNull();
            expect(validateAskQuestionRequest('string')).toBeNull();
            expect(validateAskQuestionRequest(123)).toBeNull();
        });

        it('Test 33: should return null without agentId', () => {
            expect(validateAskQuestionRequest({ question: 'test' })).toBeNull();
        });

        it('Test 34: should return null without question', () => {
            expect(validateAskQuestionRequest({ agentId: 'test' })).toBeNull();
        });

        it('Test 35: should return valid request with required fields', () => {
            const result = validateAskQuestionRequest({
                agentId: 'agent-1',
                question: 'What color?'
            });
            
            expect(result).not.toBeNull();
            expect(result?.agentId).toBe('agent-1');
            expect(result?.question).toBe('What color?');
        });

        it('Test 36: should use defaults for optional fields', () => {
            const result = validateAskQuestionRequest({
                agentId: 'agent-1',
                question: 'What color?'
            });
            
            expect(result?.questionType).toBe('clarification');
            expect(result?.priority).toBe('normal');
            expect(result?.invokeTrigger).toBe('');
        });

        it('Test 37: should preserve optional fields when provided', () => {
            const result = validateAskQuestionRequest({
                agentId: 'agent-1',
                question: 'What color?',
                questionType: 'choice',
                invokeTrigger: 'will use',
                defaultValue: 'blue',
                options: ['red', 'blue'],
                timeoutSeconds: 60,
                context: 'some context',
                priority: 'high'
            });
            
            expect(result?.questionType).toBe('choice');
            expect(result?.invokeTrigger).toBe('will use');
            expect(result?.defaultValue).toBe('blue');
            expect(result?.options).toEqual(['red', 'blue']);
            expect(result?.timeoutSeconds).toBe(60);
            expect(result?.context).toBe('some context');
            expect(result?.priority).toBe('high');
        });

        it('Test 38: should handle invalid option types', () => {
            const result = validateAskQuestionRequest({
                agentId: 'agent-1',
                question: 'What color?',
                options: 'not an array'
            });
            
            expect(result?.options).toBeUndefined();
        });
    });

    describe('Question Types', () => {
        it('Test 39: should handle clarification questions', async () => {
            const request = createValidRequest({ questionType: 'clarification' });
            const response = await handleAskQuestion(request);
            
            expect(response.sent).toBe(true);
        });

        it('Test 40: should handle approval questions', async () => {
            const request = createValidRequest({ questionType: 'approval' });
            const response = await handleAskQuestion(request);
            
            expect(response.sent).toBe(true);
        });

        it('Test 41: should handle information questions', async () => {
            const request = createValidRequest({ questionType: 'information' });
            const response = await handleAskQuestion(request);
            
            expect(response.sent).toBe(true);
        });
    });

    describe('Priority Levels', () => {
        it('Test 42: should accept low priority', async () => {
            const request = createValidRequest({ priority: 'low' });
            const response = await handleAskQuestion(request);
            expect(response.sent).toBe(true);
        });

        it('Test 43: should accept high priority', async () => {
            const request = createValidRequest({ priority: 'high' });
            const response = await handleAskQuestion(request);
            expect(response.sent).toBe(true);
        });

        it('Test 44: should accept urgent priority', async () => {
            const request = createValidRequest({ priority: 'urgent' });
            const response = await handleAskQuestion(request);
            expect(response.sent).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('Test 45: should handle very long questions', async () => {
            const longQuestion = 'What is the correct approach for ' + 'testing '.repeat(100) + '?';
            const request = createValidRequest({ question: longQuestion });
            const response = await handleAskQuestion(request);
            
            expect(response.sent).toBe(true);
        });

        it('Test 46: should handle unicode in questions', async () => {
            const request = createValidRequest({ 
                question: 'What color 🎨 should the button be? (请回答)'
            });
            const response = await handleAskQuestion(request);
            
            expect(response.sent).toBe(true);
        });

        it('Test 47: should handle context parameter', async () => {
            const request = createValidRequest({ 
                context: 'Working on the login page redesign'
            });
            const response = await handleAskQuestion(request);
            
            expect(response.sent).toBe(true);
        });
    });
});
