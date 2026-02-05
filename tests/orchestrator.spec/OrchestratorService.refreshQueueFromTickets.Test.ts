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

/** @aiContributed-2026-02-04 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator['taskQueue'] = [];
    orchestrator['pickedTasks'] = [];
    orchestrator['emitQueueChange'] = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    describe('refreshQueueFromTickets', () => {
    /** @aiContributed-2026-02-04 */
        it('should refresh the queue with open tickets', async () => {
      const tickets = [
        { id: '1', title: 'Ticket 1', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' },
        { id: '2', title: 'Ticket 2', status: 'closed', createdAt: '2023-01-03', updatedAt: '2023-01-04' },
        { id: '3', title: 'Ticket 3', status: 'open', createdAt: '2023-01-05', updatedAt: '2023-01-06' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(tickets);

      await orchestrator.refreshQueueFromTickets();

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(orchestrator['taskQueue']).toEqual([
        { id: '1', ticketId: '1', title: 'Ticket 1', status: 'pending', createdAt: '2023-01-01' },
        { id: '3', ticketId: '3', title: 'Ticket 3', status: 'pending', createdAt: '2023-01-05' },
      ]);
      expect(orchestrator['emitQueueChange']).toHaveBeenCalledTimes(1);
      expect(logInfo).toHaveBeenCalledWith('[Orchestrator] Queue refreshed from TicketDb');
    });

    /** @aiContributed-2026-02-04 */
        it('should handle errors and log them', async () => {
      const error = new Error('Failed to fetch tickets');
      (listTickets as jest.Mock).mockRejectedValue(error);

      await orchestrator.refreshQueueFromTickets();

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(orchestrator['taskQueue']).toEqual([]);
      expect(orchestrator['emitQueueChange']).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('[Orchestrator] Queue refresh failed: Failed to fetch tickets');
    });

    /** @aiContributed-2026-02-04 */
        it('should filter out tasks not in open tickets', async () => {
      orchestrator['taskQueue'] = [
        { id: '1', ticketId: '1', title: 'Old Ticket', status: 'pending', createdAt: '2023-01-01' },
      ];
      const tickets = [
        { id: '2', title: 'New Ticket', status: 'open', createdAt: '2023-01-03', updatedAt: '2023-01-04' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(tickets);

      await orchestrator.refreshQueueFromTickets();

      expect(orchestrator['taskQueue']).toEqual([
        { id: '2', ticketId: '2', title: 'New Ticket', status: 'pending', createdAt: '2023-01-03' },
      ]);
    });

    /** @aiContributed-2026-02-04 */
        it('should not add duplicate tasks', async () => {
      orchestrator['taskQueue'] = [
        { id: '1', ticketId: '1', title: 'Existing Ticket', status: 'pending', createdAt: '2023-01-01' },
      ];
      const tickets = [
        { id: '1', title: 'Existing Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(tickets);

      await orchestrator.refreshQueueFromTickets();

      expect(orchestrator['taskQueue']).toEqual([
        { id: '1', ticketId: '1', title: 'Existing Ticket', status: 'pending', createdAt: '2023-01-01' },
      ]);
    });
  });
});