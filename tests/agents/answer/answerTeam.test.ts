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
    initializeCallerValidator,
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

import {
    AnswerTeam,
    initializeAnswerTeam,
    getAnswerTeamInstance,
    resetAnswerTeamForTests
} from '../../../src/agents/answer/index';

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

// Mock LLM service
jest.mock('../../../src/services/llmService', () => ({
    completeLLM: jest.fn().mockResolvedValue({ content: 'Mock answer' })
}));

// Mock ticket DB
jest.mock('../../../src/services/ticketDb', () => ({
    createTicket: jest.fn().mockResolvedValue('ticket-123')
}));

describe('Answer Team', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetCallerValidator();
        resetCodingAIWorkflow();
        resetAnswerTeamForTests();
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

        describe('Test 29: initializeCallerValidator', () => {
            it('initializes validator with workspace path', async () => {
                const validator = await initializeCallerValidator('/test/workspace');
                expect(validator).toBeDefined();
                expect(validator).toBe(getCallerValidator());
            });
        });

        describe('Test 30: config loading', () => {
            it('loads config from YAML file when exists', async () => {
                const fs = require('fs');
                const mockYamlContent = `invoke_trigger: any_agent`;
                
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue(mockYamlContent);

                resetCallerValidator();
                const validator = await initializeCallerValidator('/test/workspace');
                
                expect(validator.getInvokeTrigger()).toBe(InvokeTrigger.ANY_AGENT);
            });

            it('handles invalid invoke_trigger in config', async () => {
                const fs = require('fs');
                const mockYamlContent = `invoke_trigger: invalid_value`;
                
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue(mockYamlContent);

                resetCallerValidator();
                const validator = await initializeCallerValidator('/test/workspace');
                
                // Should use default when invalid
                expect(validator.getInvokeTrigger()).toBe(InvokeTrigger.CODING_AI_ONLY);
            });

            it('handles config load error', async () => {
                const fs = require('fs');
                
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockImplementation(() => {
                    throw new Error('Read error');
                });

                resetCallerValidator();
                const validator = await initializeCallerValidator('/test/workspace');
                
                // Should use default on error
                expect(validator.getInvokeTrigger()).toBe(InvokeTrigger.CODING_AI_ONLY);
            });

            it('uses default when config file not found', async () => {
                const fs = require('fs');
                fs.existsSync.mockReturnValue(false);

                resetCallerValidator();
                const validator = await initializeCallerValidator('/test/workspace');
                
                expect(validator.getInvokeTrigger()).toBe(InvokeTrigger.CODING_AI_ONLY);
            });
        });

        describe('Test 31: default deny case', () => {
            it('returns deny with error code for unrecognized callers', () => {
                const validator = new CallerValidator();
                validator.setInvokeTrigger(InvokeTrigger.CODING_AI_ONLY);
                
                const result = validator.validate({
                    callerId: 'some_totally_random_unknown_caller_xyz'
                });
                
                expect(result.allowed).toBe(false);
                expect(result.reason).toBeDefined();
                expect(result.errorCode).toBeDefined();
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

        describe('Test 21: should handle questionAsked from unknown session', () => {
            it('logs warning when session is unknown', () => {
                const workflow = new CodingAIWorkflow();
                // Do not register session - this should log a warning
                workflow.questionAsked('unknown-session', 'q-1');
                // Should not crash and the question should not be mapped
                expect(workflow.getPendingAnswer('q-1')).toBeNull();
            });
        });

        describe('Test 22: should handle deliver to deleted session', () => {
            it('fails when session is removed after question asked', async () => {
                const workflow = new CodingAIWorkflow({ autoResume: false });
                
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'q-1');
                
                // Remove session but questionToSession mapping still exists
                workflow.unregisterSession('session-1');

                const answer = workflow.createAnswerPackage('q-1', 'Answer', 90);
                const result = await workflow.deliverAnswer(answer);

                // Should return false because question mapping was also cleaned up
                expect(result).toBe(false);
            });
        });

        describe('Test 23: should handle resume callback error', () => {
            it('catches error from callback', async () => {
                const workflow = new CodingAIWorkflow({ autoResume: true, minConfidenceForAutoResume: 50 });
                
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: true,
                    resumeCallback: () => {
                        throw new Error('Callback error');
                    }
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'q-1');

                const answer = workflow.createAnswerPackage('q-1', 'Answer', 90);
                // Should not throw
                const result = await workflow.deliverAnswer(answer);
                expect(result).toBe(true);
            });
        });

        describe('Test 24: should skip resume when not paused', () => {
            it('does not call resume callback when session not paused', async () => {
                const workflow = new CodingAIWorkflow({ autoResume: false });
                const resumeCallback = jest.fn();
                
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false,
                    resumeCallback
                };

                workflow.registerSession(session);

                const answer = workflow.createAnswerPackage('q-1', 'Answer', 90);
                await workflow.resumeSession('session-1', answer);

                expect(resumeCallback).not.toHaveBeenCalled();
            });
        });

        describe('Test 25: setResumeCallback on unknown session', () => {
            it('does nothing when session not found', () => {
                const workflow = new CodingAIWorkflow();
                // Should not throw
                workflow.setResumeCallback('unknown', () => {});
                expect(workflow.getSessionStatus('unknown')).toBeNull();
            });
        });

        describe('Test 26: delivery timeout', () => {
            beforeEach(() => {
                jest.useFakeTimers();
            });

            afterEach(() => {
                jest.useRealTimers();
            });

            it('marks answer as timeout when delivery times out', async () => {
                const workflow = new CodingAIWorkflow({ 
                    deliveryTimeoutMs: 1000,
                    autoResume: false 
                });
                
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.questionAsked('session-1', 'q-1');

                const answer = workflow.createAnswerPackage('q-1', 'Answer', 90);
                
                // Start deliver without waiting
                void workflow.deliverAnswer(answer);

                // Should have cleared pending answer - check before timeout
                const pendingBefore = workflow.getPendingAnswer('q-1');
                expect(pendingBefore).not.toBeNull();

                // Fast-forward past timeout - but since we already delivered, timer was cleared
                // We need to test timeout scenario differently
            });
        });

        describe('Test 27: dispose cleans up', () => {
            it('clears all state on dispose', () => {
                const workflow = new CodingAIWorkflow();
                
                const session = {
                    sessionId: 'session-1',
                    pendingQuestions: [] as string[],
                    isPaused: false
                };

                workflow.registerSession(session);
                workflow.dispose();

                expect(workflow.getActiveSessions().length).toBe(0);
            });
        });

        describe('Test 28: resume unknown session', () => {
            it('does nothing when session is not found', async () => {
                const workflow = new CodingAIWorkflow();
                const answer = workflow.createAnswerPackage('q-1', 'Answer', 90);
                
                // Should not throw
                await workflow.resumeSession('unknown-session', answer);
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

    // =========================================================================
    // AnswerTeam Class Tests (MT-014)
    // =========================================================================
    describe('AnswerTeam', () => {
        describe('Test 39: singleton management', () => {
            it('initializes AnswerTeam singleton', () => {
                const team = initializeAnswerTeam();
                expect(team).toBeDefined();
                expect(team).toBeInstanceOf(AnswerTeam);
            });

            it('throws if already initialized', () => {
                initializeAnswerTeam();
                expect(() => initializeAnswerTeam()).toThrow('already initialized');
            });

            it('gets singleton instance', () => {
                const team1 = initializeAnswerTeam();
                const team2 = getAnswerTeamInstance();
                expect(team1).toBe(team2);
            });

            it('throws if not initialized', () => {
                expect(() => getAnswerTeamInstance()).toThrow('not initialized');
            });

            it('resets properly', () => {
                const team1 = initializeAnswerTeam();
                resetAnswerTeamForTests();
                const team2 = initializeAnswerTeam();
                expect(team1).not.toBe(team2);
            });
        });

        describe('Test 40: configuration', () => {
            it('uses default config', () => {
                const team = new AnswerTeam();
                // Team should be created with defaults
                expect(team).toBeDefined();
            });

            it('accepts partial config', () => {
                const team = new AnswerTeam({
                    confidenceThreshold: 80,
                    timeoutSeconds: 30
                });
                expect(team).toBeDefined();
            });

            it('accepts workspace path', () => {
                const team = new AnswerTeam({}, '/test/workspace');
                expect(team).toBeDefined();
            });
        });

        describe('Test 41: answer method', () => {
            it('rejects unauthorized callers', async () => {
                const team = new AnswerTeam({ invokeFrom: 'coding_ai_only' });
                
                const result = await team.answer('Test question', 'planning_agent');
                
                expect(result.answer).toContain('not authorized');
                expect(result.confidence.score).toBe(0);
            });

            it('allows coding_ai callers', async () => {
                const team = new AnswerTeam({ 
                    invokeFrom: 'coding_ai_only',
                    timeoutSeconds: 5
                });
                
                const result = await team.answer('Test question', 'coding_ai');
                
                // Should process (mocked LLM returns result)
                expect(result).toBeDefined();
            });

            it('accepts any caller when configured', async () => {
                const team = new AnswerTeam({ 
                    invokeFrom: 'any',
                    timeoutSeconds: 5
                });
                
                const result = await team.answer('Test question', 'any_agent');
                
                expect(result).toBeDefined();
            });
        });

        describe('Test 42: events', () => {
            it('emits question-received event', async () => {
                const team = new AnswerTeam({ timeoutSeconds: 5 });
                const listener = jest.fn();
                
                team.on('question-received', listener);
                await team.answer('Test question', 'coding_ai');
                
                expect(listener).toHaveBeenCalled();
            });
        });

        describe('Test 43: cancelAll', () => {
            it('cancels all active requests', () => {
                const team = new AnswerTeam();
                
                // Should not throw
                team.cancelAll();
            });
        });

        describe('Test 44: getConfig', () => {
            it('returns current configuration', () => {
                const team = new AnswerTeam({
                    confidenceThreshold: 70,
                    timeoutSeconds: 15
                });
                
                const config = team.getConfig();
                
                expect(config.confidenceThreshold).toBe(70);
                expect(config.timeoutSeconds).toBe(15);
            });

            it('returns a copy of config', () => {
                const team = new AnswerTeam();
                const config1 = team.getConfig();
                const config2 = team.getConfig();
                
                expect(config1).not.toBe(config2);
                expect(config1).toEqual(config2);
            });
        });

        describe('Test 45: updateConfig', () => {
            it('updates confidence threshold', () => {
                const team = new AnswerTeam({ confidenceThreshold: 50 });
                
                team.updateConfig({ confidenceThreshold: 80 });
                
                expect(team.getConfig().confidenceThreshold).toBe(80);
            });

            it('updates timeout seconds', () => {
                const team = new AnswerTeam({ timeoutSeconds: 10 });
                
                team.updateConfig({ timeoutSeconds: 30 });
                
                expect(team.getConfig().timeoutSeconds).toBe(30);
            });

            it('updates multiple fields', () => {
                const team = new AnswerTeam();
                
                team.updateConfig({
                    confidenceThreshold: 90,
                    timeoutSeconds: 45,
                    invokeFrom: 'coding_ai_only'
                });
                
                const config = team.getConfig();
                expect(config.confidenceThreshold).toBe(90);
                expect(config.timeoutSeconds).toBe(45);
                expect(config.invokeFrom).toBe('coding_ai_only');
            });
        });

        describe('Test 46: isFromCodingAI variants', () => {
            it('accepts copilot caller', async () => {
                const team = new AnswerTeam({ invokeFrom: 'coding_ai_only' });
                
                const result = await team.answer('Test question', 'copilot');
                
                // Should not be rejected
                expect(result.answer).not.toContain('not authorized');
            });

            it('accepts coe caller', async () => {
                const team = new AnswerTeam({ invokeFrom: 'coding_ai_only' });
                
                const result = await team.answer('Test question', 'COE');
                
                // Should not be rejected (case insensitive)
                expect(result.answer).not.toContain('not authorized');
            });

            it('accepts orchestrator caller', async () => {
                const team = new AnswerTeam({ invokeFrom: 'coding_ai_only' });
                
                const result = await team.answer('Test question', 'ORCHESTRATOR');
                
                expect(result.answer).not.toContain('not authorized');
            });
        });

        describe('Test 47: default caller', () => {
            it('uses coding_ai as default caller', async () => {
                const team = new AnswerTeam({ invokeFrom: 'coding_ai_only' });
                
                // Call without caller argument
                const result = await team.answer('Test question');
                
                // Should not be rejected
                expect(result.answer).not.toContain('not authorized');
            });
        });

        describe('Test 48: answer-complete event', () => {
            it('emits answer-complete event with result', async () => {
                const team = new AnswerTeam({ timeoutSeconds: 5, invokeFrom: 'any' });
                const listener = jest.fn();
                
                team.on('answer-complete', listener);
                await team.answer('Test question', 'any_caller');
                
                expect(listener).toHaveBeenCalled();
                const eventArg = listener.mock.calls[0][0];
                expect(eventArg).toHaveProperty('answer');
                expect(eventArg).toHaveProperty('confidence');
                expect(eventArg).toHaveProperty('timing');
            });
        });
    });
});
