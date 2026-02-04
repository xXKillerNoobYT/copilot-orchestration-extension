/**
 * Tests for getNextTask tool
 * 
 * Tests the getNextTask MCP tool including:
 * - Parameter validation
 * - Filter handling (ready, blocked, all)
 * - Edge cases (empty queue, orchestrator errors)
 * - Context inclusion/exclusion
 * - Error responses
 */

import { handleGetNextTask, validateGetNextTaskParams } from '../../../src/mcpServer/tools/getNextTask';
import * as orchestrator from '../../../src/services/orchestrator';

// Mock the orchestrator module
jest.mock('../../../src/services/orchestrator');

// Mock the logger module
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('getNextTask Tool', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Parameter Validation', () => {
        it('Test 1: should accept undefined parameters', () => {
            const result = validateGetNextTaskParams(undefined);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 2: should accept null parameters', () => {
            const result = validateGetNextTaskParams(null);
            expect(result.isValid).toBe(true);
        });

        it('Test 3: should accept empty object', () => {
            const result = validateGetNextTaskParams({});
            expect(result.isValid).toBe(true);
        });

        it('Test 4: should accept valid filter: ready', () => {
            const result = validateGetNextTaskParams({ filter: 'ready' });
            expect(result.isValid).toBe(true);
        });

        it('Test 5: should accept valid filter: blocked', () => {
            const result = validateGetNextTaskParams({ filter: 'blocked' });
            expect(result.isValid).toBe(true);
        });

        it('Test 6: should accept valid filter: all', () => {
            const result = validateGetNextTaskParams({ filter: 'all' });
            expect(result.isValid).toBe(true);
        });

        it('Test 7: should reject invalid filter', () => {
            const result = validateGetNextTaskParams({ filter: 'invalid' });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid filter');
        });

        it('Test 8: should accept boolean includeContext', () => {
            const result = validateGetNextTaskParams({ includeContext: true });
            expect(result.isValid).toBe(true);
        });

        it('Test 9: should reject non-boolean includeContext', () => {
            const result = validateGetNextTaskParams({ includeContext: 'yes' });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('must be a boolean');
        });

        it('Test 10: should reject non-object parameters', () => {
            const result = validateGetNextTaskParams('invalid');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('must be an object');
        });
    });

    describe('Task Retrieval', () => {
        it('Test 11: should return task when queue has items', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask();

            expect(response.success).toBe(true);
            expect(response.task).toEqual(mockTask);
            expect(response.queueStatus?.isEmpty).toBe(false);
        });

        it('Test 12: should return null task when queue is empty', async () => {
            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(null);

            const response = await handleGetNextTask();

            expect(response.success).toBe(true);
            expect(response.task).toBeNull();
            expect(response.queueStatus?.isEmpty).toBe(true);
            expect(response.queueStatus?.message).toContain('No tasks available');
        });

        it('Test 13: should include full context by default', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z',
                lastPickedAt: '2026-02-03T01:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask();

            expect(response.task).toEqual(mockTask);
            expect(response.task.lastPickedAt).toBeDefined();
        });

        it('Test 14: should exclude context when includeContext is false', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z',
                lastPickedAt: '2026-02-03T01:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask({ includeContext: false });

            expect(response.task).toEqual({
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending',
                createdAt: '2026-02-03T00:00:00Z'
            });
            expect(response.task.lastPickedAt).toBeUndefined();
        });
    });

    describe('Filter Handling', () => {
        it('Test 15: should handle "ready" filter (default behavior)', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask({ filter: 'ready' });

            expect(response.success).toBe(true);
            expect(response.task).toEqual(mockTask);
        });

        it('Test 16: should return empty for "blocked" filter', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask({ filter: 'blocked' });

            expect(response.success).toBe(true);
            expect(response.task).toBeNull();
            expect(response.queueStatus?.message).toContain('blocked tasks');
        });

        it('Test 17: should reject invalid filter', async () => {
            const response = await handleGetNextTask({ filter: 'invalid' as any });

            expect(response.success).toBe(false);
            expect(response.error?.code).toBe('INVALID_FILTER');
            expect(response.error?.message).toContain('Invalid filter');
        });
    });

    describe('Error Handling', () => {
        it('Test 18: should handle orchestrator not initialized error', async () => {
            (orchestrator.getNextTask as jest.Mock).mockRejectedValue(
                new Error('Orchestrator not initialized. Call initializeOrchestrator() first.')
            );

            const response = await handleGetNextTask();

            expect(response.success).toBe(false);
            expect(response.task).toBeNull();
            expect(response.error?.code).toBe('ORCHESTRATOR_NOT_INITIALIZED');
            expect(response.error?.message).toContain('not initialized');
        });

        it('Test 19: should handle generic orchestrator errors', async () => {
            (orchestrator.getNextTask as jest.Mock).mockRejectedValue(
                new Error('Database connection failed')
            );

            const response = await handleGetNextTask();

            expect(response.success).toBe(false);
            expect(response.task).toBeNull();
            expect(response.error?.code).toBe('INTERNAL_ERROR');
            expect(response.error?.message).toContain('Database connection failed');
        });

        it('Test 20: should handle non-Error exceptions', async () => {
            (orchestrator.getNextTask as jest.Mock).mockRejectedValue('String error');

            const response = await handleGetNextTask();

            expect(response.success).toBe(false);
            expect(response.task).toBeNull();
            expect(response.error?.code).toBe('INTERNAL_ERROR');
        });
    });

    describe('Edge Cases', () => {
        it('Test 21: should handle all blocked tasks scenario', async () => {
            // Orchestrator returns null when all tasks are blocked
            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(null);

            const response = await handleGetNextTask({ filter: 'all' });

            expect(response.success).toBe(true);
            expect(response.task).toBeNull();
            expect(response.queueStatus?.isEmpty).toBe(true);
        });

        it('Test 22: should work with default parameters (no params provided)', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask();

            expect(response.success).toBe(true);
            expect(response.task).toEqual(mockTask);
        });

        it('Test 23: should handle task with minimal fields', async () => {
            const mockTask = {
                id: 'TASK-001',
                ticketId: 'TICKET-001',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: '2026-02-03T00:00:00Z'
            };

            (orchestrator.getNextTask as jest.Mock).mockResolvedValue(mockTask);

            const response = await handleGetNextTask({ includeContext: false });

            expect(response.task).toBeDefined();
            expect(response.task.id).toBe('TASK-001');
            expect(response.task.title).toBe('Test Task');
        });
    });
});
