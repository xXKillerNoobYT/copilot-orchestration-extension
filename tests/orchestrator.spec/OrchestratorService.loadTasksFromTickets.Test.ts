// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { listTickets } from '../../src/services/ticketDb';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - loadTasksFromTickets', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator.taskQueue = [];
  });

  /** @aiContributed-2026-02-03 */
  it('should load tasks from tickets and log the count (happy path)', async () => {
    const mockTickets = [
      { id: '1', title: 'Ticket 1', status: 'open', createdAt: '2023-01-01' },
      { id: '2', title: 'Ticket 2', status: 'in-progress', createdAt: '2023-01-02' },
    ];
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    await orchestrator.loadTasksFromTickets();

    expect(orchestrator.taskQueue).toEqual([
      { id: '1', ticketId: '1', title: 'Ticket 1', status: 'pending', createdAt: '2023-01-01' },
      { id: '2', ticketId: '2', title: 'Ticket 2', status: 'pending', createdAt: '2023-01-02' },
    ]);
    expect(logInfo).toHaveBeenCalledWith('Loaded 2 tasks from tickets');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle no workable tickets', async () => {
    const mockTickets = [
      { id: '1', title: 'Ticket 1', status: 'closed', createdAt: '2023-01-01' },
    ];
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    await orchestrator.loadTasksFromTickets();

    expect(orchestrator.taskQueue).toEqual([]);
    expect(logInfo).toHaveBeenCalledWith('Loaded 0 tasks from tickets');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle errors from listTickets and log the error', async () => {
    const mockError = new Error('Database error');
    (listTickets as jest.Mock).mockRejectedValue(mockError);

    await orchestrator.loadTasksFromTickets();

    expect(orchestrator.taskQueue).toEqual([]);
    expect(logError).toHaveBeenCalledWith(`Failed to load tasks from tickets: ${mockError}`);
  });

  /** @aiContributed-2026-02-03 */
  it('should handle undefined or null tickets', async () => {
    (listTickets as jest.Mock).mockResolvedValue(null);

    await orchestrator.loadTasksFromTickets();

    expect(orchestrator.taskQueue).toEqual([]);
    expect(logInfo).toHaveBeenCalledWith('Loaded 0 tasks from tickets');
  });
});