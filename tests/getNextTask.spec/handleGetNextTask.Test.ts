// ./getNextTask.Test.ts
import { handleGetNextTask } from '../../src/mcpServer/tools/getNextTask';
import { getNextTask as orchestratorGetNextTask } from '../../src/services/orchestrator';
import { logInfo, logWarn, logError } from '../../src/logger';

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    getNextTask: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('handleGetNextTask', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return the next task successfully with default parameters', async () => {
        const mockTask = { id: '1', ticketId: 'T123', title: 'Task 1', status: 'ready', createdAt: '2023-01-01' };
        (orchestratorGetNextTask as jest.Mock).mockResolvedValue(mockTask);

        const result = await handleGetNextTask();

        expect(result).toEqual({
            success: true,
            task: mockTask,
            queueStatus: { isEmpty: false },
        });
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Fetching next task with params'));
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Returning task: 1'));
    });

    /** @aiContributed-2026-02-03 */
    it('should return an error for an invalid filter', async () => {
        const invalidFilter = 'invalid' as unknown as 'ready' | 'blocked' | 'all';
        const result = await handleGetNextTask({ filter: invalidFilter });

        expect(result).toEqual({
            success: false,
            task: null,
            error: {
                code: 'INVALID_FILTER',
                message: "Invalid filter 'invalid'. Valid options: ready, blocked, all",
            },
        });
        expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid filter: invalid'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle an empty queue', async () => {
        (orchestratorGetNextTask as jest.Mock).mockResolvedValue(null);

        const result = await handleGetNextTask();

        expect(result).toEqual({
            success: true,
            task: null,
            queueStatus: {
                isEmpty: true,
                message: 'No tasks available in queue',
            },
        });
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Queue is empty'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle the blocked filter with no blocked tasks', async () => {
        const mockTask = { id: '1', ticketId: 'T123', title: 'Task 1', status: 'ready', createdAt: '2023-01-01' };
        (orchestratorGetNextTask as jest.Mock).mockResolvedValue(mockTask);

        const result = await handleGetNextTask({ filter: 'blocked' });

        expect(result).toEqual({
            success: true,
            task: null,
            queueStatus: {
                isEmpty: true,
                message: 'No blocked tasks available (orchestrator returns ready tasks only)',
            },
        });
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Blocked filter requested but task returned'));
    });

    /** @aiContributed-2026-02-03 */
    it('should exclude context when includeContext is false', async () => {
        const mockTask = { id: '1', ticketId: 'T123', title: 'Task 1', status: 'ready', createdAt: '2023-01-01', extra: 'context' };
        (orchestratorGetNextTask as jest.Mock).mockResolvedValue(mockTask);

        const result = await handleGetNextTask({ includeContext: false });

        expect(result).toEqual({
            success: true,
            task: {
                id: '1',
                ticketId: 'T123',
                title: 'Task 1',
                status: 'ready',
                createdAt: '2023-01-01',
            },
            queueStatus: { isEmpty: false },
        });
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Context excluded from response'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle orchestrator not initialized error', async () => {
        (orchestratorGetNextTask as jest.Mock).mockRejectedValue(new Error('not initialized'));

        const result = await handleGetNextTask();

        expect(result).toEqual({
            success: false,
            task: null,
            error: {
                code: 'ORCHESTRATOR_NOT_INITIALIZED',
                message: 'Orchestrator service is not initialized. Please ensure the extension is fully activated.',
            },
        });
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Error: not initialized'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle generic errors', async () => {
        (orchestratorGetNextTask as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

        const result = await handleGetNextTask();

        expect(result).toEqual({
            success: false,
            task: null,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to get next task: Unexpected error',
            },
        });
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Error: Unexpected error'));
    });
});