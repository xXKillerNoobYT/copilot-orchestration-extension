// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-02 */
describe('AnswerAgent.cleanupInactiveConversations', () => {
  let answerAgent: AnswerAgent;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    answerAgent = new AnswerAgent();
    (answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory = new Map();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-02 */
  it('should remove inactive conversations and log the cleanup', async () => {
    const now = Date.now();
    const activeChatId = 'activeChat';
    const inactiveChatId = 'inactiveChat';

    (answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.set(activeChatId, {
      lastActivityAt: new Date(now - 10 * MS_PER_DAY).toISOString(),
    });
    (answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.set(inactiveChatId, {
      lastActivityAt: new Date(now - 40 * MS_PER_DAY).toISOString(),
    });

    await answerAgent.cleanupInactiveConversations();

    expect((answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.has(activeChatId)).toBe(true);
    expect((answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.has(inactiveChatId)).toBe(false);
    expect(logInfo).toHaveBeenCalledWith(
      `[Answer Agent] Auto-closed inactive chat ${inactiveChatId} (40 days old, last active: ${(answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.get(inactiveChatId)?.lastActivityAt})`
    );
    expect(logInfo).toHaveBeenCalledWith(
      '[Answer Agent] Auto-close cleanup: removed 1 inactive conversation(s)'
    );
  });

  /** @aiContributed-2026-02-02 */
  it('should log when no inactive conversations are found', async () => {
    const now = Date.now();
    const activeChatId = 'activeChat';

    (answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.set(activeChatId, {
      lastActivityAt: new Date(now - 10 * MS_PER_DAY).toISOString(),
    });

    await answerAgent.cleanupInactiveConversations();

    expect((answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory.has(activeChatId)).toBe(true);
    expect(logInfo).toHaveBeenCalledWith('[Answer Agent] Auto-close cleanup: no inactive conversations found');
  });

  /** @aiContributed-2026-02-02 */
  it('should handle errors gracefully and log them', async () => {
    jest.spyOn((answerAgent as unknown as { conversationHistory: Map<string, { lastActivityAt: string }> }).conversationHistory, 'entries').mockImplementation(() => {
      throw new Error('Test error');
    });

    await answerAgent.cleanupInactiveConversations();

    expect(logError).toHaveBeenCalledWith('[Answer Agent] Auto-close cleanup failed: Test error');
  });
});