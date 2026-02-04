// ./orchestrator.Test.ts
import { OrchestratorService, Task } from '../../src/services/orchestrator';
import { logInfo, logWarn } from '../../src/logger';
import { updateTicket } from '../../src/services/ticketDb';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    updateTicket: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - getNextTask', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    (orchestrator as unknown as { taskQueue: Task[] }).taskQueue = [];
    (orchestrator as unknown as { pickedTasks: Task[] }).pickedTasks = [];
    jest.spyOn(orchestrator as unknown as { checkForBlockedTasks: () => Promise<void> }, 'checkForBlockedTasks').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should return null if the task queue is empty', async () => {
    const result = await orchestrator.getNextTask();
    expect(result).toBeNull();
    expect(logInfo).toHaveBeenCalledWith('No pending tasks in queue');
  });

  /** @aiContributed-2026-02-03 */
    it('should return the next task and update its properties', async () => {
    const mockTask: Task = { id: '1', title: 'Test Task', status: 'pending', lastPickedAt: null };
    (orchestrator as unknown as { taskQueue: Task[] }).taskQueue.push(mockTask);
    (updateTicket as jest.Mock).mockResolvedValue({ ...mockTask, status: 'in-progress' });

    const result = await orchestrator.getNextTask();

    expect(result).toEqual(expect.objectContaining({ id: '1', title: 'Test Task', status: 'picked' }));
    expect(result?.lastPickedAt).not.toBeNull();
    expect((orchestrator as unknown as { pickedTasks: Task[] }).pickedTasks).toContain(result);
    expect(logInfo).toHaveBeenCalledWith('Task picked atomically: 1 - Test Task');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle concurrent access to the task queue', async () => {
    const mockTask1: Task = { id: '1', title: 'Task 1', status: 'pending', lastPickedAt: null };
    const mockTask2: Task = { id: '2', title: 'Task 2', status: 'pending', lastPickedAt: null };
    (orchestrator as unknown as { taskQueue: Task[] }).taskQueue.push(mockTask1, mockTask2);
    (updateTicket as jest.Mock).mockResolvedValueOnce({ ...mockTask1, status: 'in-progress' });
    (updateTicket as jest.Mock).mockResolvedValueOnce({ ...mockTask2, status: 'in-progress' });

    const [task1, task2] = await Promise.all([orchestrator.getNextTask(), orchestrator.getNextTask()]);

    expect(task1).not.toEqual(task2);
    expect((orchestrator as unknown as { pickedTasks: Task[] }).pickedTasks).toHaveLength(2);
  });

  /** @aiContributed-2026-02-03 */
    it('should log a warning and return null if updateTicket fails', async () => {
    const mockTask: Task = { id: '1', title: 'Test Task', status: 'pending', lastPickedAt: null };
    (orchestrator as unknown as { taskQueue: Task[] }).taskQueue.push(mockTask);
    (updateTicket as jest.Mock).mockRejectedValue(new Error('Database error'));

    const result = await orchestrator.getNextTask();

    expect(result).toBeNull();
    expect(logWarn).toHaveBeenCalledWith(
      'Failed to atomically pick task 1: Database error. Leaving in queue for retry.'
    );
    expect((orchestrator as unknown as { taskQueue: Task[] }).taskQueue).toContain(mockTask);
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if checkForBlockedTasks fails', async () => {
    jest.spyOn(orchestrator as unknown as { checkForBlockedTasks: () => Promise<void> }, 'checkForBlockedTasks').mockRejectedValue(new Error('Blocked tasks check failed'));

    await expect(orchestrator.getNextTask()).rejects.toThrow('Blocked tasks check failed');
  });

  /** @aiContributed-2026-02-03 */
    it('should correctly handle tasks with existing timestamps', async () => {
    const mockTask: Task = { id: '1', title: 'Test Task', status: 'pending', lastPickedAt: '2023-01-01T00:00:00.000Z' };
    (orchestrator as unknown as { taskQueue: Task[] }).taskQueue.push(mockTask);
    (updateTicket as jest.Mock).mockResolvedValue({ ...mockTask, status: 'in-progress' });

    const result = await orchestrator.getNextTask();

    expect(result).toEqual(expect.objectContaining({ id: '1', title: 'Test Task', status: 'picked' }));
    expect(result?.lastPickedAt).not.toBe('2023-01-01T00:00:00.000Z');
    expect((orchestrator as unknown as { pickedTasks: Task[] }).pickedTasks).toContain(result);
    expect(logInfo).toHaveBeenCalledWith('Task picked atomically: 1 - Test Task');
  });

  /** @aiContributed-2026-02-03 */
    it('should not modify the task queue if an error occurs', async () => {
    const mockTask: Task = { id: '1', title: 'Test Task', status: 'pending', lastPickedAt: null };
    (orchestrator as unknown as { taskQueue: Task[] }).taskQueue.push(mockTask);
    jest.spyOn(orchestrator as unknown as { checkForBlockedTasks: () => Promise<void> }, 'checkForBlockedTasks').mockRejectedValue(new Error('Blocked tasks check failed'));

    await expect(orchestrator.getNextTask()).rejects.toThrow('Blocked tasks check failed');
    expect((orchestrator as unknown as { taskQueue: Task[] }).taskQueue).toContain(mockTask);
    expect((orchestrator as unknown as { pickedTasks: Task[] }).pickedTasks).toHaveLength(0);
  });
});