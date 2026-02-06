/**
 * Comprehensive tests for Answer Team
 * 
 * MT-014.15: Tests for all answer team functionality including
 * caller validation, invoke_trigger enforcement, and workflow integration.
 * 
 * @module tests/agents/answer/answerTeam.test
 */

import {
    CallerValidator,
    getCallerValidator,
    resetCallerValidator,
    validateCaller,
    InvokeTrigger,
    ValidCaller
} from '../../../src/agents/answer/callerValidation';

import {
    CodingAIWorkflow,
    getCodingAIWorkflow,
    resetCodingAIWorkflow,
    DeliveryStatus,
    WORKFLOW_EVENTS
} from '../../../src/agents/answer/codingAIWorkflow';

// Mock the logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock fs for config loading
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn()
}));

describe('Answer Team', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetCallerValidator();
        resetCodingAIWorkflow();
    });

    // =========================================================================
    // CallerValidator Tests (MT-014.11)
    // =========================================================================
    describe('CallerValidator', () => {
        describe('Test 1: should create singleton instance', () => {
            it('returns same instance on multiple calls', () => {
                const validator1 = getCallerValidator();
                const validator2 = getCallerValidator();
                expect(validator1).toBe(validator2);
            });
        });

        describe('Test 2: should allow Coding AI callers by default', () => {
            it('allows coding_ai caller', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'coding_ai' });
                expect(result.allowed).toBe(true);
            });

            it('allows copilot_coding caller', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'copilot_coding' });
                expect(result.allowed).toBe(true);
            });

            it('allows vscode_copilot caller', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'vscode_copilot' });
                expect(result.allowed).toBe(true);
            });
        });

        describe('Test 3: should reject non-Coding AI callers', () => {
            it('rejects planning_agent caller', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'planning_agent' });
                expect(result.allowed).toBe(false);
                expect(result.errorCode).toBe('E_UNAUTHORIZED_CALLER');
            });

            it('rejects unknown caller', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'unknown_agent' });
                expect(result.allowed).toBe(false);
            });

            it('rejects verification_agent caller', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'verification_agent' });
                expect(result.allowed).toBe(false);
            });
        });

        describe('Test 4: should handle pattern matching', () => {
            it('allows caller with coding_ai in name', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'my_coding_ai_v2' });
                expect(result.allowed).toBe(true);
            });

            it('allows caller with copilot in name', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'github_copilot_agent' });
                expect(result.allowed).toBe(true);
            });
        });

        describe('Test 5: should respect invoke_trigger setting', () => {
            it('allows any agent when set to any_agent', () => {
                const validator = new CallerValidator();
                validator.setInvokeTrigger(InvokeTrigger.ANY_AGENT);

                const result = validator.validate({
                    callerId: 'planning_agent',
                    sourceType: 'mcp'
                });
                expect(result.allowed).toBe(true);
            });

            it('rejects programmatic callers in manual_only mode', () => {
                const validator = new CallerValidator();
                validator.setInvokeTrigger(InvokeTrigger.MANUAL_ONLY);

                const result = validator.validate({
                    callerId: 'coding_ai',
                    sourceType: 'mcp'
                });
                expect(result.allowed).toBe(false);
                expect(result.errorCode).toBe('E_MANUAL_ONLY');
            });

            it('allows manual callers in manual_only mode', () => {
                const validator = new CallerValidator();
                validator.setInvokeTrigger(InvokeTrigger.MANUAL_ONLY);

                const result = validator.validate({
                    callerId: 'user',
                    sourceType: 'manual'
                });
                expect(result.allowed).toBe(true);
            });
        });

        describe('Test 6: should track invoke_trigger in result', () => {
            it('includes invokeTrigger in result', () => {
                const validator = new CallerValidator();
                const result = validator.validate({ callerId: 'coding_ai' });
                expect(result.invokeTrigger).toBe(InvokeTrigger.CODING_AI_ONLY);
            });
        });

        describe('Test 7: isCallerAllowed helper', () => {
            it('returns correct result', () => {
                const validator = new CallerValidator();
                expect(validator.isCallerAllowed('coding_ai')).toBe(true);
                expect(validator.isCallerAllowed('planning_agent')).toBe(false);
            });
        });

        describe('Test 8: validateCaller helper function', () => {
            it('works correctly', () => {
                expect(validateCaller({ callerId: 'coding_ai' }).allowed).toBe(true);
                expect(validateCaller({ callerId: 'unknown' }).allowed).toBe(false);
            });
        });

        describe('Test 9: should reset properly', () => {
            it('creates new instance after reset', () => {
                const validator1 = getCallerValidator();
                resetCallerValidator();
                const validator2 = getCallerValidator();
                expect(validator1).not.toBe(validator2);
            });
        });
    });

    // =========================================================================
    // CodingAIWorkflow Tests (MT-014.14)
    // =========================================================================
    describe('CodingAIWorkflow', () => {
        describe('Test 10: should create singleton instance', () => {
            it('returns same instance on multiple calls', () => {
                const workflow1 = getCodingAIWorkflow();
                const workflow2 = getCodingAIWorkflow();
                expect(workflow1).toBe(workflow2);
            });
        });

        describe('Test 11: should register and unregister sessions', () => {
            it('registers a session', () => {
                const workflow = new CodingAIWorkflow();
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [],
                    isPaused: false
                };

                workflow.registerSession(session);

                expect(workflow.getSessionStatus('session-1')).toBe(session);
            });

            it('unregisters a session', () => {
                const workflow = new CodingAIWorkflow();
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.unregisterSession('session-1');

                expect(workflow.getSessionStatus('session-1')).toBeNull();
            });
        });

        describe('Test 12: should track questions', () => {
            it('records question for session', () => {
                const workflow = new CodingAIWorkflow();
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'question-1');

                expect(session.pendingQuestions).toContain('question-1');
                expect(session.isPaused).toBe(true);
            });
        });

        describe('Test 13: should deliver answers', () => {
            it('delivers answer to correct session', async () => {
                const workflow = new CodingAIWorkflow({ autoResume: false });
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'question-1');

                const answer = workflow.createAnswerPackage('question-1', 'The answer', 95);
                const delivered = await workflow.deliverAnswer(answer);

                expect(delivered).toBe(true);
                expect(answer.status).toBe(DeliveryStatus.DELIVERED);
            });

            it('fails to deliver to unknown question', async () => {
                const workflow = new CodingAIWorkflow();
                const answer = workflow.createAnswerPackage('unknown-q', 'The answer', 95);
                const delivered = await workflow.deliverAnswer(answer);

                expect(delivered).toBe(false);
                expect(answer.status).toBe(DeliveryStatus.FAILED);
            });
        });

        describe('Test 14: should auto-resume session', () => {
            it('resumes when confidence meets threshold', async () => {
                const workflow = new CodingAIWorkflow({
                    autoResume: true,
                    minConfidenceForAutoResume: 80
                });

                let resumed = false;
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false,
                    resumeCallback: () => { resumed = true; }
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'question-1');

                const answer = workflow.createAnswerPackage('question-1', 'The answer', 95);
                await workflow.deliverAnswer(answer);

                // Wait for stability delay
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(resumed).toBe(true);
            });

            it('does not resume when confidence below threshold', async () => {
                const workflow = new CodingAIWorkflow({
                    autoResume: true,
                    minConfidenceForAutoResume: 80
                });

                let resumed = false;
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false,
                    resumeCallback: () => { resumed = true; }
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'question-1');

                const answer = workflow.createAnswerPackage('question-1', 'The answer', 50);
                await workflow.deliverAnswer(answer);

                expect(resumed).toBe(false);
            });
        });

        describe('Test 15: should emit events', () => {
            it('emits ANSWER_READY event', async () => {
                const workflow = new CodingAIWorkflow({ autoResume: false });
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                let eventReceived = false;
                workflow.on(WORKFLOW_EVENTS.ANSWER_READY, () => {
                    eventReceived = true;
                });

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'question-1');

                const answer = workflow.createAnswerPackage('question-1', 'The answer', 95);
                await workflow.deliverAnswer(answer);

                expect(eventReceived).toBe(true);
            });
        });

        describe('Test 16: should check session waiting status', () => {
            it('returns true when session is paused', () => {
                const workflow = new CodingAIWorkflow();
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'question-1');

                expect(workflow.isSessionWaiting('session-1')).toBe(true);
            });

            it('returns false for unknown session', () => {
                const workflow = new CodingAIWorkflow();
                expect(workflow.isSessionWaiting('unknown')).toBe(false);
            });
        });

        describe('Test 17: should get active sessions', () => {
            it('returns all registered sessions', () => {
                const workflow = new CodingAIWorkflow();

                workflow.registerSession({
                    sessionId: 'session-1',
                    pendingQuestions: [],
                    isPaused: false
                });
                workflow.registerSession({
                    sessionId: 'session-2',
                    pendingQuestions: [],
                    isPaused: false
                });

                const sessions = workflow.getActiveSessions();
                expect(sessions.length).toBe(2);
            });
        });

        describe('Test 18: should create answer packages', () => {
            it('creates package with all fields', () => {
                const workflow = new CodingAIWorkflow();
                const answer = workflow.createAnswerPackage(
                    'q-1',
                    'The answer',
                    95,
                    { context: ['ref1', 'ref2'] }
                );

                expect(answer.questionId).toBe('q-1');
                expect(answer.answer).toBe('The answer');
                expect(answer.confidence).toBe(95);
                expect(answer.context).toEqual(['ref1', 'ref2']);
                expect(answer.answerId).toMatch(/^ans_/);
                expect(answer.status).toBe(DeliveryStatus.PENDING);
            });
        });

        describe('Test 19: should reset properly', () => {
            it('disposes and creates new instance', () => {
                const workflow1 = getCodingAIWorkflow();
                workflow1.registerSession({
                    sessionId: 'session-1',
                    pendingQuestions: [],
                    isPaused: false
                });

                resetCodingAIWorkflow();

                const workflow2 = getCodingAIWorkflow();
                expect(workflow1).not.toBe(workflow2);
                expect(workflow2.getActiveSessions().length).toBe(0);
            });
        });
    });

    // =========================================================================
    // Integration Tests
    // =========================================================================
    describe('Integration', () => {
        describe('Test 20: caller validation and workflow integration', () => {
            it('validates caller before delivering answer', async () => {
                const validator = new CallerValidator();
                const workflow = new CodingAIWorkflow({ autoResume: false });

                // Validate the caller first
                const validationResult = validator.validate({ callerId: 'coding_ai' });
                expect(validationResult.allowed).toBe(true);

                // Then use workflow
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'q-1');

                const answer = workflow.createAnswerPackage('q-1', 'Answer', 90);
                await workflow.deliverAnswer(answer);

                expect(answer.status).toBe(DeliveryStatus.DELIVERED);
            });
        });
    });
});
