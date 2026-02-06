/**
 * @file verification/investigation.test.ts
 * @description Tests for InvestigationManager (MT-015.10, MT-015.11)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn()
}));

const mockCreateTicket = jest.fn().mockResolvedValue({ id: 'TICKET-1' });
const mockUpdateTicket = jest.fn().mockResolvedValue(true);
const mockGetTicket = jest.fn().mockResolvedValue(null);

jest.mock('../../../src/services/ticketDb', () => ({
    createTicket: mockCreateTicket,
    updateTicket: mockUpdateTicket,
    getTicket: mockGetTicket
}));

import {
    InvestigationManager,
    createInvestigation
} from '../../../src/agents/verification/investigation';
import type { DecisionResult } from '../../../src/agents/verification/decision';
import type { TestResult } from '../../../src/agents/verification/testRunner';

describe('InvestigationManager', () => {
    let manager: InvestigationManager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = createInvestigation();
    });

    const createDecisionResult = (overrides: Partial<DecisionResult> = {}): DecisionResult => ({
        passed: false,
        reason: 'Test failures detected',
        details: {
            testsPass: false,
            testPassRate: 0.8,
            failedCriteria: ['criterion 1', 'criterion 2']
        },
        recommendations: ['Fix the failing tests'],
        ...overrides
    });

    const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
        passed: false,
        total: 10,
        failed: 2,
        skipped: 0,
        duration: 1000,
        output: 'Test output',
        errorOutput: 'Error: test failed\nTypeError: undefined is not a function',
        ...overrides
    });

    describe('Test 1: constructor', () => {
        it('should create instance', () => {
            expect(manager).toBeInstanceOf(InvestigationManager);
        });
    });

    describe('Test 2: createInvestigationTicket', () => {
        it('should create investigation ticket for failure', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult()
            );

            expect(ticket).toBeDefined();
            expect(ticket?.parentTaskId).toBe('TASK-1');
            expect(ticket?.type).toBe('investigation');
            expect(mockCreateTicket).toHaveBeenCalled();
        });

        it('should include failure analysis', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult()
            );

            expect(ticket?.failureAnalysis).toBeDefined();
            expect(ticket?.failureAnalysis.testsFailed).toBe(2);
            expect(ticket?.failureAnalysis.testsTotal).toBe(10);
        });

        it('should return null on error', async () => {
            mockCreateTicket.mockRejectedValueOnce(new Error('DB error'));

            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult()
            );

            expect(ticket).toBeNull();
        });
    });

    describe('Test 3: createFixTask', () => {
        it('should create fix task for failure', async () => {
            const fixTask = await manager.createFixTask(
                'TASK-1',
                createDecisionResult(),
                1
            );

            expect(fixTask).toBeDefined();
            expect(fixTask?.parentTaskId).toBe('TASK-1');
            expect(fixTask?.retryNumber).toBe(1);
            expect(mockCreateTicket).toHaveBeenCalled();
        });

        it('should include retry number in title', async () => {
            const fixTask = await manager.createFixTask(
                'TASK-1',
                createDecisionResult(),
                3
            );

            expect(fixTask?.title).toContain('attempt 3');
        });

        it('should return null on error', async () => {
            mockCreateTicket.mockRejectedValueOnce(new Error('DB error'));

            const fixTask = await manager.createFixTask(
                'TASK-1',
                createDecisionResult(),
                1
            );

            expect(fixTask).toBeNull();
        });
    });

    describe('Test 4: failure analysis', () => {
        it('should categorize test failures', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult({ failed: 5 })
            );

            expect(ticket?.failureAnalysis.likelyCategories).toContain('test_failure');
        });

        it('should categorize incomplete implementation', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult({
                    details: {
                        failedCriteria: ['missing feature']
                    }
                }),
                createTestResult({ failed: 0, passed: true })
            );

            expect(ticket?.failureAnalysis.likelyCategories).toContain('incomplete_implementation');
        });

        it('should extract error messages', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult()
            );

            expect(ticket?.failureAnalysis.errorMessages.length).toBeGreaterThan(0);
        });
    });

    describe('Test 5: priority calculation', () => {
        it('should set high priority for many failures', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult({ failed: 10 })
            );

            expect(ticket?.priority).toBe(1);
        });

        it('should set normal priority for few failures', async () => {
            const ticket = await manager.createInvestigationTicket(
                'TASK-1',
                createDecisionResult(),
                createTestResult({ failed: 0, passed: true })
            );

            // Should be 2 or 3 depending on other factors
            expect(ticket?.priority).toBeGreaterThanOrEqual(2);
        });
    });
});
