// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { updateTicket } from '../../src/services/ticketDb';
import { Logger } from '../../utils/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    updateTicket: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator.resetForTests();
  });

  /** @aiContributed-2026-02-03 */
  describe('appendThreadMessage', () => {
    /** @aiContributed-2026-02-03 */
    it('should append a message to the ticket thread and update the ticket', async () => {
      const ticket = {
        id: '1',
        thread: [{ content: 'Existing message', createdAt: '2023-01-01T00:00:00Z' }],
      };
      const message = { content: 'New message' };

      await (orchestrator as unknown as { appendThreadMessage: (ticket: typeof ticket, message: typeof message) => Promise<void> })
        .appendThreadMessage(ticket, message);

      expect(updateTicket).toHaveBeenCalledWith('1', {
        thread: [
          { content: 'Existing message', createdAt: '2023-01-01T00:00:00Z' },
          expect.objectContaining({ content: 'New message', createdAt: expect.any(String) }),
        ],
      });
      expect(orchestrator['conversationThreadLengths'].get('1')).toBe(2);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle tickets with no existing thread', async () => {
      const ticket = { id: '2', thread: null };
      const message = { content: 'First message' };

      await (orchestrator as unknown as { appendThreadMessage: (ticket: typeof ticket, message: typeof message) => Promise<void> })
        .appendThreadMessage(ticket, message);

      expect(updateTicket).toHaveBeenCalledWith('2', {
        thread: [expect.objectContaining({ content: 'First message', createdAt: expect.any(String) })],
      });
      expect(orchestrator['conversationThreadLengths'].get('2')).toBe(1);
    });

    /** @aiContributed-2026-02-03 */
    it('should log an error if updateTicket throws an error', async () => {
      const ticket = { id: '3', thread: [] };
      const message = { content: 'Error message' };
      (updateTicket as jest.Mock).mockRejectedValueOnce(new Error('Update failed'));
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();

      await expect((orchestrator as unknown as { appendThreadMessage: (ticket: typeof ticket, message: typeof message) => Promise<void> })
        .appendThreadMessage(ticket, message)).rejects.toThrow('Update failed');
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});