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

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
  let orchestratorService: OrchestratorService;

  beforeEach(() => {
    orchestratorService = new OrchestratorService();
  });

  /** @aiContributed-2026-02-03 */
  describe('processConversationTicket', () => {
    /** @aiContributed-2026-02-03 */
    it('should log a warning if the ticket is not found', async () => {
      (listTickets as jest.Mock).mockResolvedValueOnce([]);

      await orchestratorService.processConversationTicket('nonexistent-ticket-id');

      expect(logWarn).toHaveBeenCalledWith('[ConversationRouting] Ticket nonexistent-ticket-id not found');
    });

    /** @aiContributed-2026-02-03 */
    it('should call processConversationTicketInternal if the ticket is found', async () => {
      const mockTicket = { id: 'ticket-id', title: 'Test Ticket' };
      (listTickets as jest.Mock).mockResolvedValueOnce([mockTicket]);
      const processConversationTicketInternalSpy = jest
        .spyOn(orchestratorService as unknown as { processConversationTicketInternal: (ticket: typeof mockTicket) => Promise<void> }, 'processConversationTicketInternal')
        .mockResolvedValueOnce(undefined);

      await orchestratorService.processConversationTicket('ticket-id');

      expect(processConversationTicketInternalSpy).toHaveBeenCalledWith(mockTicket);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors thrown during ticket processing', async () => {
      const mockTicket = { id: 'ticket-id', title: 'Test Ticket' };
      (listTickets as jest.Mock).mockResolvedValueOnce([mockTicket]);
      jest.spyOn(orchestratorService as unknown as { processConversationTicketInternal: (ticket: typeof mockTicket) => Promise<void> }, 'processConversationTicketInternal')
        .mockRejectedValueOnce(new Error('Processing error'));

      await expect(orchestratorService.processConversationTicket('ticket-id')).rejects.toThrow('Processing error');
    });
  });
});