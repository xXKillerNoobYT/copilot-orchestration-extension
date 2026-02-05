// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('AnswerAgent', () => {
  let answerAgent: AnswerAgent;

  beforeEach(() => {
    answerAgent = new AnswerAgent();
    (answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory = new Map();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    describe('clearHistory', () => {
    /** @aiContributed-2026-02-04 */
        it('should delete the chat history for the given chatId and log the action', () => {
      const chatId = 'chat123';
      (answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.set(chatId, {});

      answerAgent.clearHistory(chatId);

      expect((answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.has(chatId)).toBe(false);
      expect(logInfo).toHaveBeenCalledWith(`[Answer Agent] Cleared history for chat ${chatId}`);
    });

    /** @aiContributed-2026-02-04 */
        it('should not log anything if the chatId does not exist in the history', () => {
      const chatId = 'nonexistentChat';

      answerAgent.clearHistory(chatId);

      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
        it('should handle undefined chatId gracefully', () => {
      expect(() => answerAgent.clearHistory(undefined as unknown as string)).not.toThrow();
      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
        it('should handle null chatId gracefully', () => {
      expect(() => answerAgent.clearHistory(null as unknown as string)).not.toThrow();
      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
        it('should not throw an error if conversationHistory is empty', () => {
      const chatId = 'chat123';

      expect(() => answerAgent.clearHistory(chatId)).not.toThrow();
      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
        it('should handle multiple deletions of the same chatId gracefully', () => {
      const chatId = 'chat123';
      (answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.set(chatId, {});

      answerAgent.clearHistory(chatId);
      answerAgent.clearHistory(chatId);

      expect((answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.has(chatId)).toBe(false);
      expect(logInfo).toHaveBeenCalledTimes(1);
      expect(logInfo).toHaveBeenCalledWith(`[Answer Agent] Cleared history for chat ${chatId}`);
    });

    /** @aiContributed-2026-02-04 */
        it('should not throw an error if chatId is an empty string', () => {
      const chatId = '';

      expect(() => answerAgent.clearHistory(chatId)).not.toThrow();
      expect(logInfo).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
        it('should handle special characters in chatId gracefully', () => {
      const chatId = '@#$%^&*()';
      (answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.set(chatId, {});

      answerAgent.clearHistory(chatId);

      expect((answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.has(chatId)).toBe(false);
      expect(logInfo).toHaveBeenCalledWith(`[Answer Agent] Cleared history for chat ${chatId}`);
    });

    /** @aiContributed-2026-02-04 */
        it('should handle chatId with leading/trailing spaces gracefully', () => {
      const chatId = '  chat123  ';
      (answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.set(chatId.trim(), {});

      answerAgent.clearHistory(chatId);

      expect((answerAgent as unknown as { conversationHistory: Map<string, object> }).conversationHistory.has(chatId.trim())).toBe(false);
      expect(logInfo).toHaveBeenCalledWith(`[Answer Agent] Cleared history for chat ${chatId}`);
    });
  });
});