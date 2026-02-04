/**
 * Tests for reportTaskDone tool
 * 
 * Covers validation, ticket updates, and verification triggering.
 */

import { handleReportTaskDone, validateReportTaskDoneParams } from '../../../src/mcpServer/tools/reportTaskDone';
import * as ticketDb from '../../../src/services/ticketDb';
import * as orchestrator from '../../../src/services/orchestrator';

jest.mock('../../../src/services/ticketDb');
jest.mock('../../../src/services/orchestrator');
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('reportTaskDone Tool', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Parameter Validation', () => {
        it('Test 1: should reject non-object params', () => {
            const result = validateReportTaskDoneParams('invalid');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Parameters must be an object');
        });

        it('Test 2: should require taskId', () => {
            const result = validateReportTaskDoneParams({ status: 'done' });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('taskId');
        });

        it('Test 3: should require valid status', () => {
            const result = validateReportTaskDoneParams({ taskId: 'TASK-1', status: 'invalid' });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('status must be one of');
        });

        it('Test 4: should accept valid params', () => {
            const result = validateReportTaskDoneParams({ taskId: 'TASK-1', status: 'done' });
            expect(result.isValid).toBe(true);
        });
    });

    describe('Task Reporting', () => {
        it('Test 5: should return error when task not found', async () => {
            (ticketDb.getTicket as jest.Mock).mockResolvedValue(null);

            const response = await handleReportTaskDone({
                taskId: 'TASK-404',
                status: 'done'
            });

            expect(response.success).toBe(false);
            expect(response.error?.code).toBe('TASK_NOT_FOUND');
        });

        it('Test 6: should update ticket to done', async () => {
            const mockTicket = {
                id: 'TASK-1',
                title: 'Test Task',
                status: 'in-progress',
                createdAt: '2026-02-03T00:00:00Z',
                updatedAt: '2026-02-03T00:00:00Z'
            };

            (ticketDb.getTicket as jest.Mock).mockResolvedValue(mockTicket);
            (ticketDb.updateTicket as jest.Mock).mockResolvedValue(mockTicket);

            const response = await handleReportTaskDone({
                taskId: 'TASK-1',
                status: 'done'
            });

            expect(response.success).toBe(true);
            expect(ticketDb.updateTicket).toHaveBeenCalled();
        });

        it('Test 7: should append notes to description', async () => {
            const mockTicket = {
                id: 'TASK-1',
                title: 'Test Task',
                status: 'in-progress',
                description: 'Original description',
                createdAt: '2026-02-03T00:00:00Z',
                updatedAt: '2026-02-03T00:00:00Z'
            };

            (ticketDb.getTicket as jest.Mock).mockResolvedValue(mockTicket);
            (ticketDb.updateTicket as jest.Mock).mockResolvedValue(mockTicket);

            await handleReportTaskDone({
                taskId: 'TASK-1',
                status: 'done',
                notes: 'Added new tests'
            });

            const updateArgs = (ticketDb.updateTicket as jest.Mock).mock.calls[0][1];
            expect(updateArgs.description).toContain('Original description');
            expect(updateArgs.description).toContain('Added new tests');
        });

        it('Test 8: should map failed to blocked', async () => {
            const mockTicket = {
                id: 'TASK-1',
                title: 'Test Task',
                status: 'in-progress',
                createdAt: '2026-02-03T00:00:00Z',
                updatedAt: '2026-02-03T00:00:00Z'
            };

            (ticketDb.getTicket as jest.Mock).mockResolvedValue(mockTicket);
            (ticketDb.updateTicket as jest.Mock).mockResolvedValue(mockTicket);

            await handleReportTaskDone({
                taskId: 'TASK-1',
                status: 'failed'
            });

            const updateArgs = (ticketDb.updateTicket as jest.Mock).mock.calls[0][1];
            expect(updateArgs.status).toBe('blocked');
        });
    });

    describe('Verification Trigger', () => {
        it('Test 9: should trigger verification when done with codeDiff', async () => {
            const mockTicket = {
                id: 'TASK-1',
                title: 'Test Task',
                status: 'in-progress',
                createdAt: '2026-02-03T00:00:00Z',
                updatedAt: '2026-02-03T00:00:00Z'
            };

            (ticketDb.getTicket as jest.Mock).mockResolvedValue(mockTicket);
            (ticketDb.updateTicket as jest.Mock).mockResolvedValue(mockTicket);
            (orchestrator.routeToVerificationAgent as jest.Mock).mockResolvedValue({
                passed: true,
                explanation: 'All good'
            });

            const response = await handleReportTaskDone({
                taskId: 'TASK-1',
                status: 'done',
                codeDiff: 'diff --git a/file b/file'
            });

            expect(orchestrator.routeToVerificationAgent).toHaveBeenCalled();
            expect(response.verification?.passed).toBe(true);
        });

        it('Test 10: should mark blocked if verification fails', async () => {
            const mockTicket = {
                id: 'TASK-1',
                title: 'Test Task',
                status: 'in-progress',
                createdAt: '2026-02-03T00:00:00Z',
                updatedAt: '2026-02-03T00:00:00Z'
            };

            (ticketDb.getTicket as jest.Mock).mockResolvedValue(mockTicket);
            (ticketDb.updateTicket as jest.Mock).mockResolvedValue(mockTicket);
            (orchestrator.routeToVerificationAgent as jest.Mock).mockResolvedValue({
                passed: false,
                explanation: 'Tests failed'
            });

            await handleReportTaskDone({
                taskId: 'TASK-1',
                status: 'done',
                codeDiff: 'diff --git a/file b/file'
            });

            const updateCalls = (ticketDb.updateTicket as jest.Mock).mock.calls;
            const lastUpdate = updateCalls[updateCalls.length - 1][1];
            expect(lastUpdate.status).toBe('blocked');
        });
    });

    describe('Error Handling', () => {
        it('Test 11: should return internal error on exception', async () => {
            (ticketDb.getTicket as jest.Mock).mockRejectedValue(new Error('DB failure'));

            const response = await handleReportTaskDone({
                taskId: 'TASK-1',
                status: 'done'
            });

            expect(response.success).toBe(false);
            expect(response.error?.code).toBe('INTERNAL_ERROR');
            expect(response.error?.message).toContain('DB failure');
        });
    });
});
