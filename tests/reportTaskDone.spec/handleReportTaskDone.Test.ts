// ./reportTaskDone.Test.ts
import { handleReportTaskDone } from '../../src/mcpServer/tools/reportTaskDone';
import { getTicket, updateTicket } from '../../src/services/ticketDb';
import { routeToVerificationAgent } from '../../src/services/orchestrator';
import { logError } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    getTicket: jest.fn(),
    updateTicket: jest.fn(),
}));

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    routeToVerificationAgent: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('handleReportTaskDone', () => {
  const mockParams = {
    taskId: '123',
    status: 'done',
    taskDescription: 'Test task',
    codeDiff: 'diff',
    notes: 'Some notes',
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should report task as done and update the ticket', async () => {
    const mockTicket = { id: '123', description: 'Old description', title: 'Test task' };
    (getTicket as jest.Mock).mockResolvedValue(mockTicket);
    (updateTicket as jest.Mock).mockResolvedValue(null);
    (routeToVerificationAgent as jest.Mock).mockResolvedValue({ passed: true, explanation: 'All good' });

    const result = await handleReportTaskDone(mockParams);

    expect(getTicket).toHaveBeenCalledWith('123');
    expect(updateTicket).toHaveBeenCalledWith('123', expect.objectContaining({ status: 'done' }));
    expect(routeToVerificationAgent).toHaveBeenCalledWith('Test task', 'diff');
    expect(result).toEqual({
      success: true,
      taskId: '123',
      status: 'done',
      message: 'Task 123 marked as done',
      verification: { passed: true, explanation: 'All good' },
    });
  });

  /** @aiContributed-2026-02-04 */
  it('should return an error if the task is not found', async () => {
    (getTicket as jest.Mock).mockResolvedValue(null);

    const result = await handleReportTaskDone(mockParams);

    expect(getTicket).toHaveBeenCalledWith('123');
    expect(updateTicket).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      taskId: '123',
      status: 'done',
      message: 'Task not found',
      error: { code: 'TASK_NOT_FOUND', message: 'No task found with ID 123' },
    });
  });

  /** @aiContributed-2026-02-04 */
  it('should handle verification failure and mark the task as blocked', async () => {
    const mockTicket = { id: '123', description: 'Old description', title: 'Test task' };
    (getTicket as jest.Mock).mockResolvedValue(mockTicket);
    (updateTicket as jest.Mock).mockResolvedValue(null);
    (routeToVerificationAgent as jest.Mock).mockResolvedValue({ passed: false, explanation: 'Verification failed' });

    const result = await handleReportTaskDone(mockParams);

    expect(getTicket).toHaveBeenCalledWith('123');
    expect(updateTicket).toHaveBeenCalledWith('123', expect.objectContaining({ status: 'blocked' }));
    expect(result).toEqual({
      success: true,
      taskId: '123',
      status: 'done',
      message: 'Task 123 marked as done',
      verification: { passed: false, explanation: 'Verification failed' },
    });
  });

  /** @aiContributed-2026-02-04 */
  it('should handle unexpected errors gracefully', async () => {
    (getTicket as jest.Mock).mockRejectedValue(new Error('Database error'));

    const result = await handleReportTaskDone(mockParams);

    expect(getTicket).toHaveBeenCalledWith('123');
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Database error'));
    expect(result).toEqual({
      success: false,
      taskId: '123',
      status: 'done',
      message: 'Failed to report task status',
      error: { code: 'INTERNAL_ERROR', message: 'Failed to report task status: Database error' },
    });
  });

  /** @aiContributed-2026-02-04 */
  it('should handle missing codeDiff gracefully', async () => {
    const mockTicket = { id: '123', description: 'Old description', title: 'Test task' };
    (getTicket as jest.Mock).mockResolvedValue(mockTicket);
    (updateTicket as jest.Mock).mockResolvedValue(null);

    const paramsWithoutCodeDiff = { ...mockParams, codeDiff: undefined };
    const result = await handleReportTaskDone(paramsWithoutCodeDiff);

    expect(getTicket).toHaveBeenCalledWith('123');
    expect(updateTicket).toHaveBeenCalledWith('123', expect.objectContaining({ status: 'done' }));
    expect(routeToVerificationAgent).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      taskId: '123',
      status: 'done',
      message: 'Task 123 marked as done',
    });
  });
});