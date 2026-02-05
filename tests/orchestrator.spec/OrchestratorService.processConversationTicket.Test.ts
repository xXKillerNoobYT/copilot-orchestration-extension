// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { listTickets } from '../../src/services/ticketDb';
import { logWarn } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  describe('processConversationTicket', () => {
    /** @aiContributed-2026-02-04 */
    it('should log a warning if the ticket is not found', async () => {
      (listTickets as jest.Mock).mockResolvedValueOnce([]);

      await orchestrator.processConversationTicket('nonexistent-ticket-id');

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(logWarn).toHaveBeenCalledWith('[ConversationRouting] Ticket nonexistent-ticket-id not found');
    });

    /** @aiContributed-2026-02-04 */
    it('should call processConversationTicketInternal if the ticket is found', async () => {
      const mockTicket = { id: 'ticket-id', title: 'Test Ticket' };
      (listTickets as jest.Mock).mockResolvedValueOnce([mockTicket]);
      const processConversationTicketInternalSpy = jest
        .spyOn(orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof mockTicket) => Promise<void> }, 'processConversationTicketInternal')
        .mockResolvedValueOnce(undefined);

      await orchestrator.processConversationTicket('ticket-id');

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(processConversationTicketInternalSpy).toHaveBeenCalledWith(mockTicket);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle errors thrown during ticket processing', async () => {
      (listTickets as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await expect(orchestrator.processConversationTicket('ticket-id')).rejects.toThrow('Database error');

      expect(listTickets).toHaveBeenCalledTimes(1);
      expect(logWarn).not.toHaveBeenCalled();
    });
  });
});