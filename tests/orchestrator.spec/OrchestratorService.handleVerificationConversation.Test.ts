// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

interface Ticket {
  id: string;
  title: string;
}

describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    jest.spyOn(orchestrator as unknown as { appendThreadMessage: (ticket: Ticket, message: { role: string; content: string }) => Promise<void> }, 'appendThreadMessage').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleVerificationConversation', () => {
    it('should append a thread message with the correct content', async () => {
      const ticket: Ticket = { id: '1', title: 'Test Ticket' };
      const userMessage = 'Verify this code';

      await (orchestrator as unknown as { handleVerificationConversation: (ticket: Ticket, userMessage: string) => Promise<void> }).handleVerificationConversation(ticket, userMessage);

      expect(orchestrator['appendThreadMessage']).toHaveBeenCalledWith(ticket, {
        role: 'assistant',
        content: 'Please provide the code diff or changes you want verified.',
      });
    });

    it('should handle null ticket gracefully', async () => {
      const userMessage = 'Verify this code';

      await expect((orchestrator as unknown as { handleVerificationConversation: (ticket: Ticket | null, userMessage: string) => Promise<void> }).handleVerificationConversation(null, userMessage)).rejects.toThrow();
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should handle undefined userMessage gracefully', async () => {
      const ticket: Ticket = { id: '1', title: 'Test Ticket' };

      await expect((orchestrator as unknown as { handleVerificationConversation: (ticket: Ticket, userMessage: string | undefined) => Promise<void> }).handleVerificationConversation(ticket, undefined)).rejects.toThrow();
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should log an error if appendThreadMessage fails', async () => {
      const ticket: Ticket = { id: '1', title: 'Test Ticket' };
      const userMessage = 'Verify this code';
      jest.spyOn(orchestrator as unknown as { appendThreadMessage: (ticket: Ticket, message: { role: string; content: string }) => Promise<void> }, 'appendThreadMessage').mockRejectedValue(new Error('Mock Error'));

      await expect((orchestrator as unknown as { handleVerificationConversation: (ticket: Ticket, userMessage: string) => Promise<void> }).handleVerificationConversation(ticket, userMessage)).rejects.toThrow('Mock Error');
      expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});