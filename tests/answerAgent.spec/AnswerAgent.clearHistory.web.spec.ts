// ./answerAgent.web.spec.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-02 */
describe('AnswerAgent - clearHistory', () => {
  let answerAgent: AnswerAgent;

  beforeEach(() => {
    answerAgent = new AnswerAgent();
  });

  /** @aiContributed-2026-02-02 */
  it('should delete the conversation history for the given chatId and log the action', () => {
    const chatId = 'testChatId';
    const mockConversationMetadata = { lastMessage: 'Hello', timestamp: 1234567890 };
    const conversationHistory = new Map<string, { lastMessage: string; timestamp: number }>([
      [chatId, mockConversationMetadata],
    ]);
    (answerAgent as unknown as { conversationHistory: Map<string, { lastMessage: string; timestamp: number }> }).conversationHistory = conversationHistory;

    answerAgent.clearHistory(chatId);

    expect(conversationHistory.has(chatId)).toBe(false);
    expect(logInfo).toHaveBeenCalledWith(`[Answer Agent] Cleared history for chat ${chatId}`);
  });

  /** @aiContributed-2026-02-02 */
  it('should not log anything if the chatId does not exist in the conversation history', () => {
    const chatId = 'nonExistentChatId';
    const conversationHistory = new Map<string, { lastMessage: string; timestamp: number }>();
    (answerAgent as unknown as { conversationHistory: Map<string, { lastMessage: string; timestamp: number }> }).conversationHistory = conversationHistory;

    answerAgent.clearHistory(chatId);

    expect(logInfo).not.toHaveBeenCalled();
  });
});