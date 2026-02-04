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
    it('should return null if conversationHistory is null or undefined', () => {
      const ticket = { conversationHistory: null };
      expect(provider.parseConversationHistory(ticket)).toBeNull();

      ticket.conversationHistory = undefined;
      expect(provider.parseConversationHistory(ticket)).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should return null if conversationHistory is an empty string', () => {
      const ticket = { conversationHistory: '   ' };
      expect(provider.parseConversationHistory(ticket)).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should return parsed messages if conversationHistory is a valid JSON array', () => {
      const ticket = { conversationHistory: '[{"message":"Hello"}]' };
      const result = provider.parseConversationHistory(ticket);
      expect(result).toEqual({ messages: [{ message: 'Hello' }] });
    });

    /** @aiContributed-2026-02-03 */
    it('should return parsed conversation metadata if conversationHistory is a valid JSON object with messages', () => {
      const ticket = {
        conversationHistory: JSON.stringify({
          messages: [{ message: 'Hi' }],
          createdAt: '2023-01-01T00:00:00Z',
          lastActivityAt: '2023-01-02T00:00:00Z',
        }),
      };
      const result = provider.parseConversationHistory(ticket);
      expect(result).toEqual({
        messages: [{ message: 'Hi' }],
        createdAt: '2023-01-01T00:00:00Z',
        lastActivityAt: '2023-01-02T00:00:00Z',
      });
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning and return null for unexpected conversation format', () => {
      const ticket = {
        id: '123',
        conversationHistory: JSON.stringify({ unexpectedKey: 'value' }),
      };
      const result = provider.parseConversationHistory(ticket);
      expect(result).toBeNull();
      expect(logWarn).toHaveBeenCalledWith(
        '[ConversationsTreeProvider] Skipping ticket 123 due to unexpected conversation format'
      );
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning and return null for invalid JSON', () => {
      const ticket = { id: '456', conversationHistory: '{invalidJson}' };
      const result = provider.parseConversationHistory(ticket);
      expect(result).toBeNull();
      expect(logWarn).toHaveBeenCalledWith(
        '[ConversationsTreeProvider] Skipping ticket 456 due to invalid conversation JSON'
      );
    });
  });
});