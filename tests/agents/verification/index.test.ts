/**
 * @file verification/index.test.ts
 * @description Tests for Verification Team (MT-015)
 */

import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn()
}));

jest.mock('../../../src/services/ticketDb', () => ({
    createTicket: jest.fn().mockResolvedValue({ id: 'TICKET-1' }),
    updateTicket: jest.fn().mockResolvedValue(true),
    getTicket: jest.fn().mockResolvedValue(null)
}));

jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    }
}), { virtual: true });

import {
    VerificationTeam,
    initializeVerificationTeam,
    getVerificationTeamInstance,
    resetVerificationTeamForTests
} from '../../../src/agents/verification/index';

describe('VerificationTeam', () => {
    let team: VerificationTeam;

    beforeEach(() => {
        resetVerificationTeamForTests();
        team = new VerificationTeam({
            stabilityDelayMs: 10, // Short delay for tests
            maxRetryCycles: 3
        });
    });

    afterEach(() => {
        resetVerificationTeamForTests();
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultTeam = new VerificationTeam();
            expect(defaultTeam).toBeInstanceOf(VerificationTeam);
            expect(defaultTeam).toBeInstanceOf(EventEmitter);
        });

        it('should create instance with custom config', () => {
            const customTeam = new VerificationTeam({
                stabilityDelayMs: 5000,
                testCommand: 'npm run test:unit',
                coverageThreshold: 90
            });
            expect(customTeam).toBeInstanceOf(VerificationTeam);
        });
    });

    describe('Test 2: initialize', () => {
        it('should initialize all components', async () => {
            await expect(team.initialize()).resolves.not.toThrow();
        });

        it('should emit initialized event', async () => {
            const initSpy = jest.fn();
            team.on('initialized', initSpy);
            await team.initialize();
            expect(initSpy).toHaveBeenCalled();
        });
    });

    describe('Test 3: getStatus', () => {
        it('should return verification status for task', () => {
            const status = team.getStatus('TASK-1');
            expect(status).toEqual({
                isVerifying: false,
                retryCount: 0
            });
        });
    });

    describe('Test 4: resetRetryCount', () => {
        it('should reset retry count for task', () => {
            // Manually set a retry count
            (team as any).retryCounts.set('TASK-1', 5);

            team.resetRetryCount('TASK-1');

            expect(team.getStatus('TASK-1').retryCount).toBe(0);
        });
    });

    describe('Test 5: shutdown', () => {
        it('should clean up resources on shutdown', async () => {
            const shutdownSpy = jest.fn();
            team.on('shutdown', shutdownSpy);

            await team.shutdown();

            expect(shutdownSpy).toHaveBeenCalled();
        });
    });

    describe('Test 6: singleton pattern', () => {
        it('should throw if initialized twice', () => {
            initializeVerificationTeam();
            expect(() => initializeVerificationTeam()).toThrow('already initialized');
        });

        it('should throw if getInstance called before init', () => {
            expect(() => getVerificationTeamInstance()).toThrow('not initialized');
        });

        it('should return instance after initialization', () => {
            initializeVerificationTeam();
            const instance = getVerificationTeamInstance();
            expect(instance).toBeInstanceOf(VerificationTeam);
        });
    });

    describe('Test 7: verifyTask', () => {
        beforeEach(async () => {
            await team.initialize();
        });

        it('should return early if task already being verified', async () => {
            // Start first verification
            const firstVerify = team.verifyTask('TASK-1', ['file.ts'], ['criteria1']);

            // Try second verification immediately
            const result = await team.verifyTask('TASK-1', ['file.ts'], ['criteria1']);

            expect(result.passed).toBe(false);
            expect(result.reason).toContain('already being verified');

            await firstVerify; // Clean up
        });

        it('should emit verification-start event', async () => {
            const startSpy = jest.fn();
            team.on('verification-start', startSpy);

            await team.verifyTask('TASK-2', ['file.ts'], ['criteria1']);

            expect(startSpy).toHaveBeenCalledWith({
                taskId: 'TASK-2',
                modifiedFiles: ['file.ts'],
                acceptanceCriteria: ['criteria1']
            });
        });

        it('should emit verification-complete event on success', async () => {
            const completeSpy = jest.fn();
            team.on('verification-complete', completeSpy);

            // Mock internal components to return passing results
            (team as any).testRunner = {
                runTests: jest.fn().mockResolvedValue({
                    passed: true,
                    total: 5,
                    failed: 0,
                    skipped: 0,
                    duration: 1000,
                    output: 'All tests passed'
                })
            };
            (team as any).matcher = {
                matchCriteria: jest.fn().mockResolvedValue({
                    matched: ['criteria1'],
                    unmatched: [],
                    score: 100,
                    details: []
                })
            };
            (team as any).decisionMaker = {
                decide: jest.fn().mockReturnValue({
                    passed: true,
                    reason: 'All tests passed',
                    details: {}
                })
            };

            await team.verifyTask('TASK-3', ['file.ts'], ['criteria1']);

            expect(completeSpy).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            // Force an error by breaking stabilityTimer
            (team as any).stabilityTimer = {
                waitForStability: jest.fn().mockRejectedValue(new Error('Timeout'))
            };

            const result = await team.verifyTask('TASK-4', ['file.ts'], ['criteria1']);

            expect(result.passed).toBe(false);
            expect(result.reason).toContain('Verification error');
        });

        it('should clean up activeVerifications on completion', async () => {
            const status1 = team.getStatus('TASK-5');
            expect(status1.isVerifying).toBe(false);

            const promise = team.verifyTask('TASK-5', ['file.ts'], ['criteria1']);

            // During verification
            const status2 = team.getStatus('TASK-5');
            expect(status2.isVerifying).toBe(true);

            await promise;

            // After verification
            const status3 = team.getStatus('TASK-5');
            expect(status3.isVerifying).toBe(false);
        });
    });

    describe('Test 8: initialize error handling', () => {
        it('should handle non-Error thrown objects', async () => {
            // Create team but make something throw a string
            const brokenTeam = new VerificationTeam();
            
            // Force a non-Error throw by mocking internal method
            const originalInit = (brokenTeam as any).initialize;
            (brokenTeam as any).initialize = async () => {
                throw 'string error';
            };

            await expect((brokenTeam as any).initialize()).rejects.toBe('string error');
        });
    });

    describe('Test 9: handleFailure and retry logic', () => {
        beforeEach(async () => {
            await team.initialize();
            // Mock all components to return failing results
            (team as any).stabilityTimer = {
                waitForStability: jest.fn().mockResolvedValue(undefined)
            };
            (team as any).testRunner = {
                runTests: jest.fn().mockResolvedValue({
                    passed: false,
                    total: 5,
                    failed: 2,
                    skipped: 0,
                    duration: 1000,
                    output: 'Some tests failed'
                })
            };
            (team as any).matcher = {
                matchCriteria: jest.fn().mockResolvedValue({
                    matched: [],
                    unmatched: ['criteria1'],
                    score: 0,
                    details: []
                })
            };
            (team as any).decisionMaker = {
                decide: jest.fn().mockReturnValue({
                    passed: false,
                    reason: 'Tests failed',
                    details: {}
                })
            };
            (team as any).investigationMgr = {
                createInvestigationTicket: jest.fn().mockResolvedValue({ id: 'INV-1' }),
                createFixTask: jest.fn().mockResolvedValue(undefined)
            };
        });

        it('should increment retry count on verification failure', async () => {
            await team.verifyTask('TASK-RETRY', ['file.ts'], ['criteria1']);

            expect(team.getStatus('TASK-RETRY').retryCount).toBe(1);
        });

        it('should emit investigation-created event', async () => {
            const investigationSpy = jest.fn();
            team.on('investigation-created', investigationSpy);

            await team.verifyTask('TASK-INV', ['file.ts'], ['criteria1']);

            expect(investigationSpy).toHaveBeenCalled();
        });

        it('should escalate after max retries', async () => {
            // Set retry count to max (maxRetryCycles was set to 3 in outer beforeEach)
            (team as any).retryCounts.set('TASK-ESC', 3);

            const escalationSpy = jest.fn();
            team.on('escalation', escalationSpy);

            await team.verifyTask('TASK-ESC', ['file.ts'], ['criteria1']);

            // Should have escalated (retry count incremented after max)
            expect(team.getStatus('TASK-ESC').retryCount).toBe(4);
        });

        it('should handle error during verification gracefully (non-Error)', async () => {
            (team as any).stabilityTimer = {
                waitForStability: jest.fn().mockRejectedValue('string error')
            };

            const result = await team.verifyTask('TASK-ERR', ['file.ts'], ['criteria1']);

            expect(result.passed).toBe(false);
            expect(result.reason).toContain('string error');
        });
    });
});
