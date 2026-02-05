// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { listTickets } from '../../src/services/ticketDb';
import { logError } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  listTickets: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logError: jest.fn(),
}));

interface Task {
  id: string;
}

interface OrchestratorServiceWithPrivateProps extends OrchestratorService {
  taskQueue: Task[];
  lastPickedTaskTitle: string | null;
  isBlockedP1Ticket: (ticket: { status: string }) => boolean;
}

/** @aiContributed-2026-02-04 */
describe('OrchestratorService - getQueueStatus', () => {
  let orchestrator: OrchestratorServiceWithPrivateProps;

  beforeEach(() => {
    orchestrator = new OrchestratorService() as OrchestratorServiceWithPrivateProps;
    orchestrator.taskQueue = [];
    orchestrator.lastPickedTaskTitle = null;
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should return correct queue status on happy path', async () => {
    orchestrator.taskQueue = [{ id: '1' }, { id: '2' }];
    orchestrator.lastPickedTaskTitle = 'Task 1';
    orchestrator.isBlockedP1Ticket = jest.fn((ticket) => ticket.status === 'blockedP1');

    (listTickets as jest.Mock).mockResolvedValue([
      { id: '1', status: 'blockedP1' },
      { id: '2', status: 'open' },
    ]);

    const result = await orchestrator.getQueueStatus();

    expect(result).toEqual({
      queueCount: 2,
      blockedP1Count: 1,
      lastPickedTitle: 'Task 1',
    });
    expect(listTickets).toHaveBeenCalledTimes(1);
    expect(orchestrator.isBlockedP1Ticket).toHaveBeenCalledTimes(2);
  });

  /** @aiContributed-2026-02-04 */
  it('should handle errors and return fallback queue status', async () => {
    orchestrator.taskQueue = [{ id: '1' }];
    orchestrator.lastPickedTaskTitle = 'Task 1';

    (listTickets as jest.Mock).mockRejectedValue(new Error('Database error'));

    const result = await orchestrator.getQueueStatus();

    expect(result).toEqual({
      queueCount: 1,
      blockedP1Count: 0,
      lastPickedTitle: 'Task 1',
    });
    expect(listTickets).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      '[Orchestrator] Failed to get queue status: Database error'
    );
  });

  /** @aiContributed-2026-02-04 */
  it('should handle empty ticket list gracefully', async () => {
    orchestrator.taskQueue = [];
    orchestrator.lastPickedTaskTitle = null;
    orchestrator.isBlockedP1Ticket = jest.fn();

    (listTickets as jest.Mock).mockResolvedValue([]);

    const result = await orchestrator.getQueueStatus();

    expect(result).toEqual({
      queueCount: 0,
      blockedP1Count: 0,
      lastPickedTitle: null,
    });
    expect(listTickets).toHaveBeenCalledTimes(1);
    expect(orchestrator.isBlockedP1Ticket).not.toHaveBeenCalled();
  });
});