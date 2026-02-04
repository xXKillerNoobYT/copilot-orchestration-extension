// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { logWarn } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider', () => {
  let provider: ConversationsTreeDataProvider;

  beforeEach(() => {
    provider = new ConversationsTreeDataProvider();
  });

  /** @aiContributed-2026-02-03 */
  describe('parseConversationHistory', () => {
    /** @aiContributed-2026-02-03 */
    it('should return null if ticket.thread is not an array and conversationHistory is null or undefined', () => {
      const ticket = { thread: undefined, conversationHistory: null };
      expect((provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket)).toBeNull();

      ticket.conversationHistory = undefined;
      expect((provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket)).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should return null if ticket.thread is not an array and conversationHistory is an empty string', () => {
      const ticket = { thread: undefined, conversationHistory: '   ' };
      expect((provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket)).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should return parsed thread if ticket.thread is an array', () => {
      const ticket = {
        thread: [{ role: 'user', content: 'Hello', createdAt: '2023-01-01T00:00:00Z' }],
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
      };
      const result = (provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket);
      expect(result).toEqual({
        messages: ticket.thread,
        createdAt: ticket.createdAt,
        lastActivityAt: ticket.updatedAt,
      });
    });

    /** @aiContributed-2026-02-03 */
    it('should return parsed messages if conversationHistory is a valid JSON array', () => {
      const ticket = { thread: undefined, conversationHistory: '[{"role":"user","content":"Hello"}]' };
      const result = (provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket);
      expect(result).toEqual({
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning and return null for unexpected conversation format', () => {
      const ticket = {
        id: '123',
        thread: undefined,
        conversationHistory: JSON.stringify({ unexpectedKey: 'value' }),
      };
      const result = (provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket);
      expect(result).toBeNull();
      expect(logWarn).toHaveBeenCalledWith(
        '[ConversationsTreeProvider] Skipping ticket 123 due to unexpected conversation format'
      );
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning and return null for invalid JSON', () => {
      const ticket = { id: '456', thread: undefined, conversationHistory: '{invalidJson}' };
      const result = (provider as unknown as { parseConversationHistory: (ticket: typeof ticket) => unknown }).parseConversationHistory(ticket);
      expect(result).toBeNull();
      expect(logWarn).toHaveBeenCalledWith(
        '[ConversationsTreeProvider] Skipping ticket 456 due to invalid conversation JSON'
      );
    });
  });
});