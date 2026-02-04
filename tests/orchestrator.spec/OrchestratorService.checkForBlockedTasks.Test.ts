// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { createTicket } from '../../src/services/ticketDb';
import { logWarn, logError } from '../../src/logger';
import * as vscode from 'vscode';
import { llmStatusBar } from '../../src/ui/llmStatusBar';

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  createTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showWarningMessage: jest.fn(),
  },
}));

jest.mock('../../src/ui/llmStatusBar', () => ({
    ...jest.requireActual('../../src/ui/llmStatusBar'),
    llmStatusBar: {
    start: jest.fn(),
  },
}));

interface Task {
  id: string;
  title: string;
  lastPickedAt: string | null;
  blockedAt: string | null;
  status: string;
}

interface OrchestratorServiceExtended extends OrchestratorService {
  taskQueue: Task[];
  pickedTasks: Task[];
  taskTimeoutSeconds: number;
  checkForBlockedTasks: () => Promise<void>;
}

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - checkForBlockedTasks', () => {
  let orchestrator: OrchestratorServiceExtended;

  beforeEach(() => {
    orchestrator = new OrchestratorService() as OrchestratorServiceExtended;
    orchestrator.taskQueue = [];
    orchestrator.pickedTasks = [];
    orchestrator.taskTimeoutSeconds = 300; // 5 minutes
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should block tasks that exceed the timeout and create a ticket', async () => {
    const now = Date.now();
    const task: Task = {
      id: '1',
      title: 'Test Task',
      lastPickedAt: new Date(now - 400000).toISOString(), // Picked 400 seconds ago
      blockedAt: null,
      status: 'in-progress',
    };
    orchestrator.pickedTasks = [task];

    await orchestrator.checkForBlockedTasks();

    expect(task.blockedAt).not.toBeNull();
    expect(task.status).toBe('blocked');
    expect(orchestrator.pickedTasks).toHaveLength(0);
    expect(createTicket).toHaveBeenCalledWith({
      title: `P1 BLOCKED: ${task.title}`,
      status: 'blocked',
      description: `Task idle for 400s (timeout: 300s)`,
    });
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      `⚠️ P1 BLOCKED: ${task.title} (idle 400s)`,
      'Review'
    );
    expect(logWarn).toHaveBeenCalledWith(`Created P1 blocked ticket for task: ${task.id}`);
  });

  /** @aiContributed-2026-02-03 */
    it('should not block tasks that are within the timeout', async () => {
    const now = Date.now();
    const task: Task = {
      id: '2',
      title: 'Test Task 2',
      lastPickedAt: new Date(now - 200000).toISOString(), // Picked 200 seconds ago
      blockedAt: null,
      status: 'in-progress',
    };
    orchestrator.pickedTasks = [task];

    await orchestrator.checkForBlockedTasks();

    expect(task.blockedAt).toBeNull();
    expect(task.status).toBe('in-progress');
    expect(orchestrator.pickedTasks).toHaveLength(1);
    expect(createTicket).not.toHaveBeenCalled();
    expect(llmStatusBar.start).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should skip tasks without lastPickedAt', async () => {
    const task: Task = {
      id: '3',
      title: 'Test Task 3',
      lastPickedAt: null,
      blockedAt: null,
      status: 'pending',
    };
    orchestrator.taskQueue = [task];

    await orchestrator.checkForBlockedTasks();

    expect(task.blockedAt).toBeNull();
    expect(task.status).toBe('pending');
    expect(createTicket).not.toHaveBeenCalled();
    expect(llmStatusBar.start).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should handle errors when creating a ticket', async () => {
    const now = Date.now();
    const task: Task = {
      id: '4',
      title: 'Test Task 4',
      lastPickedAt: new Date(now - 400000).toISOString(), // Picked 400 seconds ago
      blockedAt: null,
      status: 'in-progress',
    };
    orchestrator.pickedTasks = [task];
    (createTicket as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

    await orchestrator.checkForBlockedTasks();

    expect(task.blockedAt).not.toBeNull();
    expect(task.status).toBe('blocked');
    expect(orchestrator.pickedTasks).toHaveLength(0);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to create blocked ticket'));
  });

  /** @aiContributed-2026-02-03 */
    it('should remove blocked tasks from pickedTasks', async () => {
    const now = Date.now();
    const task: Task = {
      id: '5',
      title: 'Test Task 5',
      lastPickedAt: new Date(now - 400000).toISOString(), // Picked 400 seconds ago
      blockedAt: null,
      status: 'in-progress',
    };
    orchestrator.pickedTasks = [task];

    await orchestrator.checkForBlockedTasks();

    expect(orchestrator.pickedTasks).toHaveLength(0);
    expect(task.blockedAt).not.toBeNull();
    expect(task.status).toBe('blocked');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle multiple tasks correctly', async () => {
    const now = Date.now();
    const tasks: Task[] = [
      {
        id: '6',
        title: 'Task 6',
        lastPickedAt: new Date(now - 400000).toISOString(),
        blockedAt: null,
        status: 'in-progress',
      },
      {
        id: '7',
        title: 'Task 7',
        lastPickedAt: new Date(now - 200000).toISOString(),
        blockedAt: null,
        status: 'in-progress',
      },
    ];
    orchestrator.pickedTasks = tasks;

    await orchestrator.checkForBlockedTasks();

    expect(tasks[0].blockedAt).not.toBeNull();
    expect(tasks[0].status).toBe('blocked');
    expect(tasks[1].blockedAt).toBeNull();
    expect(tasks[1].status).toBe('in-progress');
    expect(orchestrator.pickedTasks).toHaveLength(1);
    expect(createTicket).toHaveBeenCalledTimes(1);
  });
});