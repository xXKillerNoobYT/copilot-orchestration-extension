// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { onTicketChange } from '../../src/services/ticketDb';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    onTicketChange: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
  });

  /** @aiContributed-2026-02-03 */
    describe('registerConversationThreadListener', () => {
    /** @aiContributed-2026-02-03 */
        it('should register the conversation thread listener and log success', () => {
      orchestrator['registerConversationThreadListener']();

      expect(onTicketChange).toHaveBeenCalledTimes(1);
      expect(onTicketChange).toHaveBeenCalledWith(expect.any(Function));
      expect(logInfo).toHaveBeenCalledWith('Conversation thread listener registered');
    });

    /** @aiContributed-2026-02-03 */
        it('should log an error if an exception occurs', () => {
      (onTicketChange as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      orchestrator['registerConversationThreadListener']();

      expect(logError).toHaveBeenCalledWith(
        'Failed to register conversation thread listener: Test error'
      );
    });

    /** @aiContributed-2026-02-03 */
        it('should handle non-Error exceptions gracefully', () => {
      (onTicketChange as jest.Mock).mockImplementationOnce(() => {
        throw 'Non-error exception';
      });

      orchestrator['registerConversationThreadListener']();

      expect(logError).toHaveBeenCalledWith(
        'Failed to register conversation thread listener: Non-error exception'
      );
    });
  });
});