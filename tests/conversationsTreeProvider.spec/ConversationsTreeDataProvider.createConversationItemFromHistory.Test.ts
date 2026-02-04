// ./conversationsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: { None: 0 },
    ThemeIcon: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
    });

    /** @aiContributed-2026-02-03 */
    describe('createConversationItemFromHistory', () => {
        /** @aiContributed-2026-02-03 */
        it('should create a TreeItem with correct properties for valid inputs', () => {
            const ticket = { id: '1', title: 'Test Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' };
            const history = {
                messages: [{ content: 'Message 1' }, { content: 'Message 2' }],
            };
            const mockGetConversationTimestamp = jest.spyOn(provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }, 'getConversationTimestamp').mockReturnValue(1672531200000);
            const mockFormatRelativeTime = jest.spyOn(provider as unknown as { formatRelativeTime: (timestamp: number) => string }, 'formatRelativeTime').mockReturnValue('2 days ago');
            const mockGetConversationLabel = jest.spyOn(provider as unknown as { getConversationLabel: (ticket: typeof ticket, history: typeof history) => string }, 'getConversationLabel').mockReturnValue('Test Label');
            const mockGetConversationDescription = jest.spyOn(provider as unknown as { getConversationDescription: (relativeTime: string, messageCount: number) => string }, 'getConversationDescription').mockReturnValue('2 messages, last updated 2 days ago');

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: typeof history) => vscode.TreeItem }).createConversationItemFromHistory(ticket, history);

            expect(result).toBeInstanceOf(vscode.TreeItem);
            expect(result.label).toBe('Test Label');
            expect(result.description).toBe('2 messages, last updated 2 days ago');
            expect(result.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(result.tooltip).toBe('Click to continue chat');
            expect(result.timestamp).toBe(1672531200000);

            expect(mockGetConversationTimestamp).toHaveBeenCalledWith(history, ticket);
            expect(mockFormatRelativeTime).toHaveBeenCalledWith(1672531200000);
            expect(mockGetConversationLabel).toHaveBeenCalledWith(ticket, history);
            expect(mockGetConversationDescription).toHaveBeenCalledWith('2 days ago', 2);
        });

        /** @aiContributed-2026-02-03 */
        it('should return null if history is null', () => {
            const ticket = { id: '1', title: 'Test Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' };

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: null) => vscode.TreeItem | null }).createConversationItemFromHistory(ticket, null);

            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-03 */
        it('should handle errors gracefully and log them', () => {
            const ticket = { id: '1', title: 'Test Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' };
            const history = {
                messages: [{ content: 'Message 1' }, { content: 'Message 2' }],
            };
            jest.spyOn(provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }, 'getConversationTimestamp').mockImplementation(() => {
                throw new Error('Test Error');
            });

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: typeof history) => vscode.TreeItem | null }).createConversationItemFromHistory(ticket, history);

            expect(result).toBeNull();
            expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
        });
    });
});