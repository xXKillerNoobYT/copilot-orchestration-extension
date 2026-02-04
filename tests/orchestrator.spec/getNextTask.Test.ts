// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../src/logger';
import { createTicket, updateTicket } from '../../src/services/ticketDb';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    createTicket: jest.fn(),
    updateTicket: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('getNextTask', () => {
  let orchestrator: OrchestratorService;

  beforeEach(async () => {
    orchestrator = new OrchestratorService();
    await orchestrator.initialize({ extensionPath: '/mock/path' } as vscode.ExtensionContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
    orchestrator.resetForTests();
  });

  /** @aiContributed-2026-02-03 */
    it('should return null if the task queue is empty', async () => {
    const task = await orchestrator.getNextTask();
    expect(task).toBeNull();
    expect(logInfo).toHaveBeenCalledWith('No pending tasks in queue');
  });

  /** @aiContributed-2026-02-03 */
    it('should return the next task and update its status in the database', async () => {
    const mockTask = {
      id: 'TICKET-001',
      ticketId: 'TICKET-001',
      title: 'Test Task',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    orchestrator['taskQueue'] = [mockTask];

    const task = await orchestrator.getNextTask();

    expect(task).toEqual({
      ...mockTask,
      status: 'picked',
      lastPickedAt: expect.any(String),
    });
    expect(orchestrator['pickedTasks']).toContainEqual({
      ...mockTask,
      status: 'picked',
      lastPickedAt: expect.any(String),
    });
    expect(updateTicket).toHaveBeenCalledWith(mockTask.id, {
      status: 'in-progress',
      updatedAt: expect.any(String),
    });
    expect(logInfo).toHaveBeenCalledWith(`Task picked atomically: ${mockTask.id} - ${mockTask.title}`);
  });

  /** @aiContributed-2026-02-03 */
    it('should check for blocked tasks before returning the next task', async () => {
    const mockTask = {
      id: 'TICKET-002',
      ticketId: 'TICKET-002',
      title: 'Blocked Task',
      status: 'picked',
      createdAt: new Date().toISOString(),
      lastPickedAt: new Date(Date.now() - 31000).toISOString(), // 31 seconds ago
    };
    orchestrator['pickedTasks'] = [mockTask];

    await orchestrator.getNextTask();

    expect(createTicket).toHaveBeenCalledWith({
      title: `BLOCKED: ${mockTask.title}`,
      status: 'blocked',
      description: expect.stringContaining('Task idle for 31s'),
    });
    expect(logWarn).toHaveBeenCalledWith(`Created P1 blocked ticket for task: ${mockTask.id}`);
  });

  /** @aiContributed-2026-02-03 */
    it('should handle errors during blocked task detection gracefully', async () => {
    const mockTask = {
      id: 'TICKET-003',
      ticketId: 'TICKET-003',
      title: 'Error Task',
      status: 'picked',
      createdAt: new Date().toISOString(),
      lastPickedAt: new Date(Date.now() - 31000).toISOString(), // 31 seconds ago
    };
    orchestrator['pickedTasks'] = [mockTask];
    (createTicket as jest.Mock).mockRejectedValue(new Error('Database error'));

    await orchestrator.getNextTask();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to create blocked ticket'));
  });

  /** @aiContributed-2026-02-03 */
    it('should not update lastPickedAt if the task queue is empty', async () => {
    orchestrator['taskQueue'] = [];
    const task = await orchestrator.getNextTask();
    expect(task).toBeNull();
    expect(logInfo).toHaveBeenCalledWith('No pending tasks in queue');
  });

  /** @aiContributed-2026-02-03 */
    it('should correctly handle tasks with undefined lastPickedAt', async () => {
    const mockTask = {
      id: 'TICKET-004',
      ticketId: 'TICKET-004',
      title: 'Undefined LastPickedAt Task',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    orchestrator['taskQueue'] = [mockTask];

    const task = await orchestrator.getNextTask();

    expect(task).toEqual({
      ...mockTask,
      status: 'picked',
      lastPickedAt: expect.any(String),
    });
    expect(orchestrator['pickedTasks']).toContainEqual({
      ...mockTask,
      status: 'picked',
      lastPickedAt: expect.any(String),
    });
    expect(updateTicket).toHaveBeenCalledWith(mockTask.id, {
      status: 'in-progress',
      updatedAt: expect.any(String),
    });
    expect(logInfo).toHaveBeenCalledWith(`Task picked atomically: ${mockTask.id} - ${mockTask.title}`);
  });

  /** @aiContributed-2026-02-03 */
    it('should return null and leave the task in the queue if database update fails', async () => {
    const mockTask = {
      id: 'TICKET-005',
      ticketId: 'TICKET-005',
      title: 'DB Update Fail Task',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    orchestrator['taskQueue'] = [mockTask];
    (updateTicket as jest.Mock).mockRejectedValue(new Error('Database error'));

    const task = await orchestrator.getNextTask();

    expect(task).toBeNull();
    expect(orchestrator['taskQueue']).toContainEqual(mockTask);
    expect(logWarn).toHaveBeenCalledWith(
      `Failed to atomically pick task ${mockTask.id}: Database error. Leaving in queue for retry.`
    );
  });
});