/**
 * Tests for Error Escalation System (MT-033.36)
 *
 * Covers escalation ladder, retry logic, human ticket creation,
 * reporting, and edge cases.
 */

import {
    EscalationLevel,
    EscalationState,
    EscalationAttempt,
    EscalationConfig,
    DEFAULT_ESCALATION_CONFIG,
    generateEscalationId,
    generateHumanTicketId,
    resetEscalationCounters,
    getNextLevel,
    getInitialLevel,
    createEscalation,
    recordAttempt,
    createHumanTicket,
    generateFailureAnalysis,
    generateHumanSuggestion,
    shouldImmediatelyEscalate,
    createEscalationsFromFixResult,
    generateEscalationSummary,
    getEscalationReport,
    areAllEscalationsTerminal,
} from '../../src/services/errorEscalation';

import { DetectedError, ErrorSeverity, ErrorCategory } from '../../src/services/errorDetector';
import { AutoFixResult } from '../../src/services/autoFixer';

// ============================================================================
// Test helpers
// ============================================================================

function makeError(overrides: Partial<DetectedError> = {}): DetectedError {
    return {
        id: 'ERR-001',
        category: 'compile' as ErrorCategory,
        severity: 'high' as ErrorSeverity,
        fixability: 'agent_fixable',
        title: 'TS2304: Cannot find name',
        message: 'Cannot find name \'fooBar\'',
        source: 'compiler',
        rawText: 'error TS2304: Cannot find name fooBar',
        detectedAt: new Date().toISOString(),
        ...overrides
    };
}

function makeAutoFixResult(overrides: Partial<AutoFixResult> = {}): AutoFixResult {
    return {
        attempts: [],
        tickets: [],
        appliedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        ticketCount: 0,
        modifiedFiles: new Map(),
        summary: 'No fixes applied',
        requiresRetest: false,
        completedAt: new Date().toISOString(),
        ...overrides
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('Error Escalation System', () => {

    beforeEach(() => {
        resetEscalationCounters();
    });

    // ----- ID Generation -----

    describe('ID Generation', () => {
        it('Test 1: should generate sequential escalation IDs', () => {
            const id1 = generateEscalationId('TASK-1');
            const id2 = generateEscalationId('TASK-1');
            expect(id1).toBe('ESC-TASK-1-001');
            expect(id2).toBe('ESC-TASK-1-002');
        });

        it('Test 2: should generate sequential human ticket IDs', () => {
            const id1 = generateHumanTicketId();
            const id2 = generateHumanTicketId();
            expect(id1).toBe('HUM-001');
            expect(id2).toBe('HUM-002');
        });

        it('Test 3: should reset counters', () => {
            generateEscalationId('TASK-1');
            generateHumanTicketId();
            resetEscalationCounters();
            expect(generateEscalationId('TASK-2')).toBe('ESC-TASK-2-001');
            expect(generateHumanTicketId()).toBe('HUM-001');
        });
    });

    // ----- getNextLevel -----

    describe('getNextLevel', () => {
        it('Test 4: should stay at retry if retries remain', () => {
            expect(getNextLevel('retry', 1, DEFAULT_ESCALATION_CONFIG)).toBe('retry');
        });

        it('Test 5: should escalate retry → agent_fix after max retries', () => {
            expect(getNextLevel('retry', 3, DEFAULT_ESCALATION_CONFIG)).toBe('agent_fix');
        });

        it('Test 6: should escalate agent_fix → specialist', () => {
            expect(getNextLevel('agent_fix', 1, DEFAULT_ESCALATION_CONFIG)).toBe('specialist');
        });

        it('Test 7: should escalate specialist → human', () => {
            expect(getNextLevel('specialist', 1, DEFAULT_ESCALATION_CONFIG)).toBe('human');
        });

        it('Test 8: should stay at human once there', () => {
            expect(getNextLevel('human', 1, DEFAULT_ESCALATION_CONFIG)).toBe('human');
        });

        it('Test 9: should respect custom maxRetries', () => {
            const cfg = { ...DEFAULT_ESCALATION_CONFIG, maxRetries: 5 };
            expect(getNextLevel('retry', 4, cfg)).toBe('retry');
            expect(getNextLevel('retry', 5, cfg)).toBe('agent_fix');
        });
    });

    // ----- getInitialLevel -----

    describe('getInitialLevel', () => {
        it('Test 10: should start at retry for auto_fixable errors', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            expect(getInitialLevel(err, DEFAULT_ESCALATION_CONFIG)).toBe('retry');
        });

        it('Test 11: should start at agent_fix for critical errors with autoEscalate', () => {
            const err = makeError({ severity: 'critical', fixability: 'agent_fixable' });
            expect(getInitialLevel(err, DEFAULT_ESCALATION_CONFIG)).toBe('agent_fix');
        });

        it('Test 12: should not skip to agent_fix when autoEscalateCritical is false', () => {
            const err = makeError({ severity: 'critical', fixability: 'auto_fixable' });
            const cfg = { ...DEFAULT_ESCALATION_CONFIG, autoEscalateCritical: false };
            expect(getInitialLevel(err, cfg)).toBe('retry');
        });

        it('Test 13: should start at specialist for security errors', () => {
            const err = makeError({ category: 'security', severity: 'high', fixability: 'agent_fixable' });
            expect(getInitialLevel(err, DEFAULT_ESCALATION_CONFIG)).toBe('specialist');
        });

        it('Test 14: should start at human for human_required fixability', () => {
            const err = makeError({ fixability: 'human_required' });
            expect(getInitialLevel(err, DEFAULT_ESCALATION_CONFIG)).toBe('human');
        });

        it('Test 15: should start at agent_fix for agent_fixable non-critical', () => {
            const err = makeError({ fixability: 'agent_fixable', severity: 'medium' });
            expect(getInitialLevel(err, DEFAULT_ESCALATION_CONFIG)).toBe('agent_fix');
        });
    });

    // ----- createEscalation -----

    describe('createEscalation', () => {
        it('Test 16: should create escalation with correct default state', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            const esc = createEscalation(err, 'TASK-42');
            expect(esc.id).toMatch(/^ESC-TASK-42-/);
            expect(esc.taskId).toBe('TASK-42');
            expect(esc.error).toEqual(err);
            expect(esc.status).toBe('pending');
            expect(esc.totalAttempts).toBe(0);
            expect(esc.attempts).toEqual([]);
            expect(esc.currentLevel).toBe('retry');
        });

        it('Test 17: should set initial level based on error properties', () => {
            const err = makeError({ category: 'security', severity: 'high' });
            const esc = createEscalation(err, 'TASK-1');
            expect(esc.currentLevel).toBe('specialist');
        });

        it('Test 18: should accept partial config overrides', () => {
            const err = makeError({ severity: 'critical', fixability: 'agent_fixable' });
            const esc = createEscalation(err, 'TASK-1', { autoEscalateCritical: false });
            // With autoEscalateCritical=false, agent_fixable goes to agent_fix
            expect(esc.currentLevel).toBe('agent_fix');
        });
    });

    // ----- recordAttempt -----

    describe('recordAttempt', () => {
        it('Test 19: should record a successful resolution', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            esc = recordAttempt(esc, 'Applied semicolon fix', true, 'Fixed successfully', 100);
            expect(esc.status).toBe('resolved');
            expect(esc.totalAttempts).toBe(1);
            expect(esc.attempts).toHaveLength(1);
            expect(esc.attempts[0].resolved).toBe(true);
        });

        it('Test 20: should stay at retry level on first failure', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            esc = recordAttempt(esc, 'Tried fix A', false, 'Still broken', 200);
            expect(esc.status).toBe('in_progress');
            expect(esc.currentLevel).toBe('retry');
            expect(esc.totalAttempts).toBe(1);
        });

        it('Test 21: should escalate after max retries', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            // 3 retries ⇒ escalate to agent_fix
            esc = recordAttempt(esc, 'Try 1', false, 'Failed', 100);
            esc = recordAttempt(esc, 'Try 2', false, 'Failed', 100);
            esc = recordAttempt(esc, 'Try 3', false, 'Failed', 100);
            expect(esc.currentLevel).toBe('agent_fix');
        });

        it('Test 22: should escalate to human after max total attempts', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            for (let i = 0; i < 5; i++) {
                esc = recordAttempt(esc, `Try ${i + 1}`, false, 'Failed', 100);
            }
            expect(esc.status).toBe('human_required');
            expect(esc.humanTicket).toBeDefined();
            expect(esc.totalAttempts).toBe(5);
        });

        it('Test 23: should include agentId in attempt when provided', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            esc = recordAttempt(esc, 'Fix attempt', false, 'Failed', 50, 'agent-coding-001');
            expect(esc.attempts[0].agentId).toBe('agent-coding-001');
        });

        it('Test 24: should respect custom maxTotalAttempts', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            const cfg = { maxTotalAttempts: 2 };
            esc = recordAttempt(esc, 'Try 1', false, 'Failed', 100, undefined, cfg);
            expect(esc.status).toBe('in_progress');
            esc = recordAttempt(esc, 'Try 2', false, 'Failed', 100, undefined, cfg);
            expect(esc.status).toBe('human_required');
            expect(esc.totalAttempts).toBe(2);
        });

        it('Test 25: should record timestamps in attempts', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-1');
            esc = recordAttempt(esc, 'Action', true, 'OK', 50);
            expect(esc.attempts[0].timestamp).toBeDefined();
            expect(esc.updatedAt).toBeDefined();
        });
    });

    // ----- Human Ticket Creation -----

    describe('Human Ticket Creation', () => {
        it('Test 26: should create a human ticket with full context', () => {
            const err = makeError({ severity: 'critical' });
            const state = createEscalation(err, 'TASK-99');
            const attempts: EscalationAttempt[] = [
                {
                    attemptNumber: 1, level: 'retry', action: 'Try A',
                    resolved: false, result: 'Error persists', durationMs: 100,
                    timestamp: new Date().toISOString()
                }
            ];
            const ticket = createHumanTicket(state, attempts, DEFAULT_ESCALATION_CONFIG);
            expect(ticket.id).toMatch(/^HUM-/);
            expect(ticket.taskId).toBe('TASK-99');
            expect(ticket.error).toEqual(err);
            expect(ticket.attempts).toHaveLength(1);
            expect(ticket.urgency).toBe('immediate');
            expect(ticket.status).toBe('human_required');
        });

        it('Test 27: should set urgency based on severity', () => {
            const lowErr = makeError({ severity: 'low' });
            const state = createEscalation(lowErr, 'TASK-1');
            const ticket = createHumanTicket(state, [], DEFAULT_ESCALATION_CONFIG);
            expect(ticket.urgency).toBe('low');
        });

        it('Test 28: should set medium severity to normal urgency', () => {
            const err = makeError({ severity: 'medium' });
            const state = createEscalation(err, 'TASK-1');
            const ticket = createHumanTicket(state, [], DEFAULT_ESCALATION_CONFIG);
            expect(ticket.urgency).toBe('normal');
        });

        it('Test 29: should include whatWasTried summary', () => {
            const err = makeError();
            const state = createEscalation(err, 'TASK-1');
            const attempts: EscalationAttempt[] = [
                {
                    attemptNumber: 1, level: 'retry', action: 'Added import',
                    resolved: false, result: 'Wrong import', durationMs: 50,
                    timestamp: new Date().toISOString()
                },
                {
                    attemptNumber: 2, level: 'agent_fix', action: 'Agent rewrote',
                    resolved: false, result: 'Still broken', durationMs: 300,
                    timestamp: new Date().toISOString()
                }
            ];
            const ticket = createHumanTicket(state, attempts, DEFAULT_ESCALATION_CONFIG);
            expect(ticket.whatWasTried).toContain('Added import');
            expect(ticket.whatWasTried).toContain('Agent rewrote');
        });
    });

    // ----- Failure Analysis -----

    describe('generateFailureAnalysis', () => {
        it('Test 30: should handle empty attempts', () => {
            expect(generateFailureAnalysis([])).toBe('No attempts were made.');
        });

        it('Test 31: should handle all-success case', () => {
            const attempts: EscalationAttempt[] = [{
                attemptNumber: 1, level: 'retry', action: 'Fix',
                resolved: true, result: 'OK', durationMs: 10,
                timestamp: new Date().toISOString()
            }];
            expect(generateFailureAnalysis(attempts)).toContain('All attempts succeeded');
        });

        it('Test 32: should report failure details', () => {
            const attempts: EscalationAttempt[] = [
                {
                    attemptNumber: 1, level: 'retry', action: 'Fix A',
                    resolved: false, result: 'Broken', durationMs: 10,
                    timestamp: new Date().toISOString()
                },
                {
                    attemptNumber: 2, level: 'agent_fix', action: 'Fix B',
                    resolved: false, result: 'Still broken', durationMs: 20,
                    timestamp: new Date().toISOString()
                }
            ];
            const analysis = generateFailureAnalysis(attempts);
            expect(analysis).toContain('2 of 2 attempts failed');
            expect(analysis).toContain('retry');
            expect(analysis).toContain('Still broken');
        });
    });

    // ----- Human Suggestion -----

    describe('generateHumanSuggestion', () => {
        it('Test 33: should give compile-specific suggestion', () => {
            const err = makeError({ category: 'compile' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('TypeScript compilation');
        });

        it('Test 34: should give test_failure-specific suggestion', () => {
            const err = makeError({ category: 'test_failure' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('failing test');
        });

        it('Test 35: should give security-specific suggestion', () => {
            const err = makeError({ category: 'security' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('Security review');
        });

        it('Test 36: should include suggestedFix when available', () => {
            const err = makeError({ suggestedFix: 'Add the missing import' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('Add the missing import');
        });

        it('Test 37: should include last attempt result', () => {
            const err = makeError();
            const attempts: EscalationAttempt[] = [{
                attemptNumber: 1, level: 'retry', action: 'Fix',
                resolved: false, result: 'Type mismatch remained', durationMs: 10,
                timestamp: new Date().toISOString()
            }];
            const suggestion = generateHumanSuggestion(err, attempts);
            expect(suggestion).toContain('Type mismatch remained');
        });

        it('Test 38: should handle logic errors', () => {
            const err = makeError({ category: 'logic' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('Logic error');
        });

        it('Test 39: should handle runtime errors', () => {
            const err = makeError({ category: 'runtime' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('Runtime error');
        });

        it('Test 40: should handle performance errors', () => {
            const err = makeError({ category: 'performance' });
            const suggestion = generateHumanSuggestion(err, []);
            expect(suggestion).toContain('Performance');
        });
    });

    // ----- shouldImmediatelyEscalate -----

    describe('shouldImmediatelyEscalate', () => {
        it('Test 41: should escalate human_required fixability', () => {
            const err = makeError({ fixability: 'human_required' });
            expect(shouldImmediatelyEscalate(err)).toBe(true);
        });

        it('Test 42: should escalate critical security errors', () => {
            const err = makeError({
                severity: 'critical', category: 'security', fixability: 'agent_fixable'
            });
            expect(shouldImmediatelyEscalate(err)).toBe(true);
        });

        it('Test 43: should NOT escalate normal agent_fixable', () => {
            const err = makeError({ fixability: 'agent_fixable', severity: 'medium' });
            expect(shouldImmediatelyEscalate(err)).toBe(false);
        });

        it('Test 44: should NOT escalate auto_fixable', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            expect(shouldImmediatelyEscalate(err)).toBe(false);
        });
    });

    // ----- createEscalationsFromFixResult -----

    describe('createEscalationsFromFixResult', () => {
        it('Test 45: should create escalations for remaining errors', () => {
            const result = makeAutoFixResult();
            const errors = [
                makeError({ id: 'E1', fixability: 'agent_fixable' }),
                makeError({ id: 'E2', fixability: 'human_required' })
            ];
            const escalations = createEscalationsFromFixResult(result, 'TASK-5', errors);
            expect(escalations).toHaveLength(2);
            expect(escalations[0].taskId).toBe('TASK-5');
            expect(escalations[1].taskId).toBe('TASK-5');
        });

        it('Test 46: should return empty array when no errors', () => {
            const result = makeAutoFixResult();
            const escalations = createEscalationsFromFixResult(result, 'TASK-1', []);
            expect(escalations).toEqual([]);
        });
    });

    // ----- Summary & Reporting -----

    describe('Reporting', () => {
        it('Test 47: should generate summary for no escalations', () => {
            expect(generateEscalationSummary([])).toBe('No escalations needed');
        });

        it('Test 48: should generate summary with counts', () => {
            const e1 = createEscalation(makeError(), 'T-1');
            e1.status = 'resolved';
            const e2 = createEscalation(makeError(), 'T-1');
            e2.status = 'human_required';
            const summary = generateEscalationSummary([e1, e2]);
            expect(summary).toContain('2 escalation(s)');
            expect(summary).toContain('1 resolved');
            expect(summary).toContain('1 need human review');
        });

        it('Test 49: should include pending count in summary', () => {
            const e1 = createEscalation(makeError(), 'T-1');
            e1.status = 'in_progress';
            const summary = generateEscalationSummary([e1]);
            expect(summary).toContain('1 pending');
        });

        it('Test 50: should include abandoned count', () => {
            const e1 = createEscalation(makeError(), 'T-1');
            e1.status = 'abandoned';
            const summary = generateEscalationSummary([e1]);
            expect(summary).toContain('1 abandoned');
        });

        it('Test 51: should generate empty report when no escalations', () => {
            expect(getEscalationReport([])).toBe('No escalations to report.');
        });

        it('Test 52: should generate report with human-required section', () => {
            const err = makeError({ title: 'Critical Bug', message: 'Cannot compile' });
            const esc = createEscalation(err, 'T-1');
            esc.status = 'human_required';
            esc.humanTicket = {
                id: 'HUM-001',
                taskId: 'T-1',
                error: err,
                attempts: [],
                whatWasTried: 'Tried stuff',
                whyAutoFailed: 'Too complex',
                suggestedApproach: 'Manual fix',
                urgency: 'immediate',
                status: 'human_required',
                createdAt: new Date().toISOString()
            };
            const report = getEscalationReport([esc]);
            expect(report).toContain('Requires Human Intervention');
            expect(report).toContain('Critical Bug');
            expect(report).toContain('HUM-001');
        });

        it('Test 53: should show pending section', () => {
            const err = makeError({ title: 'Pending Fix' });
            const esc = createEscalation(err, 'T-1');
            esc.status = 'in_progress';
            esc.currentLevel = 'agent_fix';
            const report = getEscalationReport([esc]);
            expect(report).toContain('In Progress');
            expect(report).toContain('Pending Fix');
            expect(report).toContain('agent_fix');
        });

        it('Test 54: should show resolved section', () => {
            const err = makeError({ title: 'Fixed Issue' });
            const esc = createEscalation(err, 'T-1');
            esc.status = 'resolved';
            esc.totalAttempts = 2;
            const report = getEscalationReport([esc]);
            expect(report).toContain('Resolved');
            expect(report).toContain('Fixed Issue');
            expect(report).toContain('2 attempt(s)');
        });
    });

    // ----- areAllEscalationsTerminal -----

    describe('areAllEscalationsTerminal', () => {
        it('Test 55: should return true for empty array', () => {
            expect(areAllEscalationsTerminal([])).toBe(true);
        });

        it('Test 56: should return true when all resolved', () => {
            const e1 = createEscalation(makeError(), 'T-1');
            e1.status = 'resolved';
            const e2 = createEscalation(makeError(), 'T-1');
            e2.status = 'human_required';
            expect(areAllEscalationsTerminal([e1, e2])).toBe(true);
        });

        it('Test 57: should return false when some in-progress', () => {
            const e1 = createEscalation(makeError(), 'T-1');
            e1.status = 'resolved';
            const e2 = createEscalation(makeError(), 'T-1');
            e2.status = 'in_progress';
            expect(areAllEscalationsTerminal([e1, e2])).toBe(false);
        });

        it('Test 58: should treat abandoned as terminal', () => {
            const e1 = createEscalation(makeError(), 'T-1');
            e1.status = 'abandoned';
            expect(areAllEscalationsTerminal([e1])).toBe(true);
        });
    });

    // ----- Full escalation path (integration-style) -----

    describe('Full escalation path', () => {
        it('Test 59: should go retry→agent→specialist→human over 5 attempts', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-INT');
            expect(esc.currentLevel).toBe('retry');

            // Attempt 1: retry
            esc = recordAttempt(esc, 'Retry 1', false, 'Still broken', 100);
            expect(esc.currentLevel).toBe('retry');

            // Attempt 2: retry
            esc = recordAttempt(esc, 'Retry 2', false, 'Still broken', 100);
            expect(esc.currentLevel).toBe('retry');

            // Attempt 3: retry → exhausted → agent_fix
            esc = recordAttempt(esc, 'Retry 3', false, 'Out of ideas', 100);
            expect(esc.currentLevel).toBe('agent_fix');

            // Attempt 4: agent_fix → specialist
            esc = recordAttempt(esc, 'Agent fix', false, 'Agent stuck', 200, 'coding-agent');
            expect(esc.currentLevel).toBe('specialist');

            // Attempt 5: max total → human_required
            esc = recordAttempt(esc, 'Specialist review', false, 'Too complex', 500, 'specialist-agent');
            expect(esc.status).toBe('human_required');
            expect(esc.humanTicket).toBeDefined();
            expect(esc.totalAttempts).toBe(5);
        });

        it('Test 60: should resolve mid-escalation if attempt succeeds', () => {
            const err = makeError({ fixability: 'auto_fixable', severity: 'low' });
            let esc = createEscalation(err, 'TASK-RES');

            esc = recordAttempt(esc, 'Retry 1', false, 'Failed', 100);
            esc = recordAttempt(esc, 'Retry 2', false, 'Failed', 100);
            esc = recordAttempt(esc, 'Retry 3', false, 'Failed', 100);
            expect(esc.currentLevel).toBe('agent_fix');

            // Agent fixes it!
            esc = recordAttempt(esc, 'Agent applied import fix', true, 'Error resolved', 300, 'coding-agent');
            expect(esc.status).toBe('resolved');
            expect(esc.totalAttempts).toBe(4);
            expect(esc.humanTicket).toBeUndefined();
        });
    });

    // ----- DEFAULT_ESCALATION_CONFIG -----

    describe('DEFAULT_ESCALATION_CONFIG', () => {
        it('Test 61: should have correct defaults', () => {
            expect(DEFAULT_ESCALATION_CONFIG).toEqual({
                maxRetries: 3,
                maxTotalAttempts: 5,
                autoEscalateCritical: true,
                skipAgentForSimple: false,
                includeFullContext: true
            });
        });
    });
});
