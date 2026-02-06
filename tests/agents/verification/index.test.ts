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
});
