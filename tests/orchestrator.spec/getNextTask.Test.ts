// ./orchestrator.Test.ts
import { OrchestratorService, Task } from '../../src/services/orchestrator';
import { updateTicket } from '../../src/services/ticketDb';
import { Logger } from '../../utils/logger';

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  updateTicket: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorService - getNextTask', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator.resetForTests();
  });

  /** @aiContributed-2026-02-04 */
  it('should return null if the task queue is empty', async () => {
    const task = await orchestrator.getNextTask();
    expect(task).toBeNull();
    expect(Logger.info).toHaveBeenCalledWith('No pending tasks in queue');
  });

  /** @aiContributed-2026-02-04 */
  it('should return the next task and update its status to "picked"', async () => {
    const mockTask: Task = {
      id: 'TICKET-001',
      ticketId: 'TICKET-001',
      title: 'Test Task',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    orchestrator['taskQueue'].push(mockTask);

    const task = await orchestrator.getNextTask();

    expect(task).toEqual({
      ...mockTask,
      status: 'picked',
      lastPickedAt: expect.any(String),
    });
    expect(orchestrator['taskQueue']).toHaveLength(0);
    expect(orchestrator['pickedTasks']).toContainEqual(task);
    expect(updateTicket).toHaveBeenCalledWith(mockTask.id, {
      status: 'in-progress',
      updatedAt: expect.any(String),
    });
    expect(Logger.info).toHaveBeenCalledWith(
      `Task picked atomically: ${mockTask.id} - ${mockTask.title}`
    );
  });

  /** @aiContributed-2026-02-04 */
  it('should return null if updating the task in the database fails', async () => {
    const mockTask: Task = {
      id: 'TICKET-002',
      ticketId: 'TICKET-002',
      title: 'Test Task 2',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    orchestrator['taskQueue'].push(mockTask);
    (updateTicket as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

    const task = await orchestrator.getNextTask();

    expect(task).toBeNull();
    expect(orchestrator['taskQueue']).toHaveLength(1);
    expect(Logger.warn).toHaveBeenCalledWith(
      `Failed to atomically pick task ${mockTask.id}: DB error. Leaving in queue for retry.`
    );
  });

  /** @aiContributed-2026-02-04 */
  it('should check for blocked tasks before returning the next task', async () => {
    const mockTask: Task = {
      id: 'TICKET-003',
      ticketId: 'TICKET-003',
      title: 'Blocked Task',
      status: 'picked',
      createdAt: new Date().toISOString(),
      lastPickedAt: new Date(Date.now() - 40 * 1000).toISOString(), // Picked 40 seconds ago
    };

    orchestrator['pickedTasks'].push(mockTask);

    const createTicket = jest.fn();
    jest
      .spyOn(orchestrator as unknown as { checkForBlockedTasks: () => Promise<void> }, 'checkForBlockedTasks')
      .mockImplementation(async () => {
        await createTicket({
          title: `P1 BLOCKED: ${mockTask.title}`,
          status: 'blocked',
          description: expect.any(String),
        });
        mockTask.status = 'blocked';
      });

    const task = await orchestrator.getNextTask();

    expect(createTicket).toHaveBeenCalled();
    expect(mockTask.status).toBe('blocked');
    expect(task).toBeNull();
  });
});