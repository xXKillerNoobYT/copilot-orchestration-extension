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

/** @aiContributed-2026-02-04 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  describe('handleConversationThreadUpdates', () => {
    /** @aiContributed-2026-02-04 */
    it('should process all tickets successfully', async () => {
      const mockTickets = [
        { id: '1', title: 'Ticket 1', status: 'open', createdAt: '', updatedAt: '' },
        { id: '2', title: 'Ticket 2', status: 'open', createdAt: '', updatedAt: '' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(mockTickets);
      jest.spyOn(orchestrator, 'processConversationTicketInternal' as keyof OrchestratorService).mockResolvedValue(undefined);

      await orchestrator.handleConversationThreadUpdates();

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(orchestrator.processConversationTicketInternal).toHaveBeenCalledTimes(mockTickets.length);
      expect(orchestrator.processConversationTicketInternal).toHaveBeenCalledWith(mockTickets[0]);
      expect(orchestrator.processConversationTicketInternal).toHaveBeenCalledWith(mockTickets[1]);
    });

    /** @aiContributed-2026-02-04 */
    it('should log an error if listTickets throws an error', async () => {
      const error = new Error('Failed to fetch tickets');
      (listTickets as jest.Mock).mockRejectedValue(error);

      await orchestrator.handleConversationThreadUpdates();

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith(`Failed to handle conversation updates: ${error.message}`);
    });

    /** @aiContributed-2026-02-04 */
    it('should log an error if processConversationTicketInternal throws an error', async () => {
      const mockTickets = [
        { id: '1', title: 'Ticket 1', status: 'open', createdAt: '', updatedAt: '' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(mockTickets);
      jest.spyOn(orchestrator, 'processConversationTicketInternal' as keyof OrchestratorService).mockRejectedValue(new Error('Processing error'));

      await orchestrator.handleConversationThreadUpdates();

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(orchestrator.processConversationTicketInternal).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith('Failed to handle conversation updates: Processing error');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle empty ticket list gracefully', async () => {
      (listTickets as jest.Mock).mockResolvedValue([]);

      await orchestrator.handleConversationThreadUpdates();

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(orchestrator.processConversationTicketInternal).not.toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
    });
  });
});