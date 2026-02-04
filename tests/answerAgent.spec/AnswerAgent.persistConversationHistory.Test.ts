// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { updateTicket } from '../../src/services/ticketDb';
import { logInfo, logWarn } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  updateTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('AnswerAgent', () => {
  let agent: AnswerAgent;

  beforeEach(() => {
    agent = new AnswerAgent();
    (agent as unknown as { conversationHistory: Map<string, unknown> }).conversationHistory = new Map();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  describe('persistConversationHistory', () => {
    const chatId = 'testChatId';
    const metadata = { messages: [{ text: 'Hello' }] };

    /** @aiContributed-2026-02-03 */
    it('should persist conversation history successfully', async () => {
      (agent as unknown as { conversationHistory: Map<string, unknown> }).conversationHistory.set(chatId, metadata);
      (updateTicket as jest.Mock).mockResolvedValue(true);

      await (agent as unknown as { persistConversationHistory: (id: string) => Promise<void> }).persistConversationHistory(chatId);

      expect(updateTicket).toHaveBeenCalledWith(chatId, {
        conversationHistory: JSON.stringify(metadata),
      });
      expect(logInfo).toHaveBeenCalledWith(
        `[Answer Agent] Persisted history for chat ${chatId}`
      );
      expect(logWarn).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning if metadata is not found', async () => {
      await (agent as unknown as { persistConversationHistory: (id: string) => Promise<void> }).persistConversationHistory(chatId);

      expect(updateTicket).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        `[Answer Agent] Could not persist history for chat ${chatId} (ticket not found)`
      );
      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning if updateTicket returns null', async () => {
      (agent as unknown as { conversationHistory: Map<string, unknown> }).conversationHistory.set(chatId, metadata);
      (updateTicket as jest.Mock).mockResolvedValue(null);

      await (agent as unknown as { persistConversationHistory: (id: string) => Promise<void> }).persistConversationHistory(chatId);

      expect(updateTicket).toHaveBeenCalledWith(chatId, {
        conversationHistory: JSON.stringify(metadata),
      });
      expect(logWarn).toHaveBeenCalledWith(
        `[Answer Agent] Could not persist history for chat ${chatId} (ticket not found)`
      );
      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors thrown by updateTicket', async () => {
      const errorMessage = 'Database error';
      (agent as unknown as { conversationHistory: Map<string, unknown> }).conversationHistory.set(chatId, metadata);
      (updateTicket as jest.Mock).mockRejectedValue(new Error(errorMessage));

      await (agent as unknown as { persistConversationHistory: (id: string) => Promise<void> }).persistConversationHistory(chatId);

      expect(updateTicket).toHaveBeenCalledWith(chatId, {
        conversationHistory: JSON.stringify(metadata),
      });
      expect(logWarn).toHaveBeenCalledWith(
        `[Answer Agent] Failed to persist history for chat ${chatId}: ${errorMessage}`
      );
      expect(logInfo).not.toHaveBeenCalled();
    });
  });
});