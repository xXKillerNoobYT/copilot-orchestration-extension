// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import * as vscode from 'vscode';
import { listTickets } from '../../src/services/ticketDb';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  TreeItem: jest.fn(),
  ThemeIcon: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  listTickets: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
  let provider: ConversationsTreeDataProvider;

  beforeEach(() => {
    provider = new ConversationsTreeDataProvider();
  });

  /** @aiContributed-2026-02-04 */
  describe('getChildren', () => {
    /** @aiContributed-2026-02-04 */
    it('should return an empty array if an element is provided', async () => {
      const result = await provider.getChildren(new vscode.TreeItem('Test Item'));
      expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-04 */
    it('should return placeholder item if no tickets are available', async () => {
      (listTickets as jest.Mock).mockResolvedValue([]);
      const createEmptyItemSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createEmptyItem')
        .mockReturnValue(new vscode.TreeItem('No Conversations'));

      const result = await provider.getChildren();

      expect(listTickets).toHaveBeenCalled();
      expect(createEmptyItemSpy).toHaveBeenCalled();
      expect(result).toEqual([new vscode.TreeItem('No Conversations')]);
    });

    /** @aiContributed-2026-02-04 */
    it('should return error item if listTickets throws an error', async () => {
      const error = new Error('Database error');
      (listTickets as jest.Mock).mockRejectedValue(error);

      const result = await provider.getChildren();

      expect(Logger.error).toHaveBeenCalledWith(`[ConversationsTreeProvider] Failed to load conversations: ${error}`);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Error loading conversations');
    });

    /** @aiContributed-2026-02-04 */
    it('should return sorted TreeItems for valid conversations', async () => {
      const tickets = [
        { id: '1', conversationHistory: 'history1', createdAt: '2023-01-01', updatedAt: '2023-01-02' },
        { id: '2', conversationHistory: 'history2', createdAt: '2023-01-03', updatedAt: '2023-01-04' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(tickets);

      const isConversationTicketSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'isConversationTicket')
        .mockImplementation(() => true);
      const parseConversationHistorySpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'parseConversationHistory')
        .mockImplementation(() => ({ messages: [] }));
      const buildEmptyHistorySpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'buildEmptyHistory')
        .mockImplementation(() => ({ messages: [] }));
      const createNewConversationItemSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createNewConversationItem')
        .mockReturnValue(new vscode.TreeItem('New Conversation'));
      const createConversationItemFromHistorySpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createConversationItemFromHistory')
        .mockImplementation((ticket) => new vscode.TreeItem((ticket as { id: string }).id));
      const getItemTimestampSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'getItemTimestamp')
        .mockImplementation((item) => parseInt(item.label as string));

      const result = await provider.getChildren();

      expect(listTickets).toHaveBeenCalled();
      expect(isConversationTicketSpy).toHaveBeenCalledTimes(2);
      expect(parseConversationHistorySpy).toHaveBeenCalledTimes(2);
      expect(buildEmptyHistorySpy).not.toHaveBeenCalled(); // Parsed history is always valid
      expect(createNewConversationItemSpy).toHaveBeenCalled();
      expect(createConversationItemFromHistorySpy).toHaveBeenCalledTimes(2);
      expect(getItemTimestampSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
      expect(result[0].label).toBe('New Conversation');
      expect(result[1].label).toBe('2');
      expect(result[2].label).toBe('1');
    });

    /** @aiContributed-2026-02-04 */
    it('should include "New Conversation" and placeholder if no valid conversations exist', async () => {
      const tickets = [
        { id: '1', conversationHistory: null, createdAt: '2023-01-01', updatedAt: '2023-01-02' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(tickets);

      const isConversationTicketSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'isConversationTicket')
        .mockImplementation(() => false);
      const createNewConversationItemSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createNewConversationItem')
        .mockReturnValue(new vscode.TreeItem('New Conversation'));
      const createEmptyItemSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createEmptyItem')
        .mockReturnValue(new vscode.TreeItem('No Conversations'));

      const result = await provider.getChildren();

      expect(listTickets).toHaveBeenCalled();
      expect(isConversationTicketSpy).toHaveBeenCalledTimes(1);
      expect(createNewConversationItemSpy).toHaveBeenCalled();
      expect(createEmptyItemSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('New Conversation');
      expect(result[1].label).toBe('No Conversations');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle tickets with invalid conversation history gracefully', async () => {
      const tickets = [
        { id: '1', conversationHistory: 'invalid', createdAt: '2023-01-01', updatedAt: '2023-01-02' },
      ];
      (listTickets as jest.Mock).mockResolvedValue(tickets);

      const isConversationTicketSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'isConversationTicket')
        .mockImplementation(() => true);
      const parseConversationHistorySpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'parseConversationHistory')
        .mockImplementation(() => null);
      const buildEmptyHistorySpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'buildEmptyHistory')
        .mockImplementation(() => null);
      const createNewConversationItemSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createNewConversationItem')
        .mockReturnValue(new vscode.TreeItem('New Conversation'));
      const createEmptyItemSpy = jest
        .spyOn(provider as ConversationsTreeDataProvider, 'createEmptyItem')
        .mockReturnValue(new vscode.TreeItem('No Conversations'));

      const result = await provider.getChildren();

      expect(listTickets).toHaveBeenCalled();
      expect(isConversationTicketSpy).toHaveBeenCalledTimes(1);
      expect(parseConversationHistorySpy).toHaveBeenCalledTimes(1);
      expect(buildEmptyHistorySpy).toHaveBeenCalledTimes(1);
      expect(createNewConversationItemSpy).toHaveBeenCalled();
      expect(createEmptyItemSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('New Conversation');
      expect(result[1].label).toBe('No Conversations');
    });
  });
});