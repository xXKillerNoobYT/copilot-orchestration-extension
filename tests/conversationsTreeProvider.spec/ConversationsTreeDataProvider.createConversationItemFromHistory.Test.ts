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
        warn: jest.fn(),
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
            jest.spyOn(provider, 'getConversationTimestamp' as keyof ConversationsTreeDataProvider).mockReturnValue(1672531200000);
            jest.spyOn(provider, 'formatRelativeTime' as keyof ConversationsTreeDataProvider).mockReturnValue('2 days ago');
            jest.spyOn(provider, 'getConversationLabel' as keyof ConversationsTreeDataProvider).mockReturnValue('Test Label');
            jest.spyOn(provider, 'getConversationDescription' as keyof ConversationsTreeDataProvider).mockReturnValue('2 messages, last updated 2 days ago');

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: typeof history) => vscode.TreeItem })
                .createConversationItemFromHistory(ticket, history);

            expect(result).toBeInstanceOf(vscode.TreeItem);
            expect(result.label).toBe('Test Label');
            expect(result.description).toBe('2 messages, last updated 2 days ago');
            expect(result.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(result.tooltip).toBe('Click to open conversation in webview');
            expect((result as { timestamp: number }).timestamp).toBe(1672531200000);
        });

        /** @aiContributed-2026-02-03 */
        it('should return null if history is null', () => {
            const ticket = { id: '1', title: 'Test Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' };

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: null) => vscode.TreeItem | null })
                .createConversationItemFromHistory(ticket, null);

            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-03 */
        it('should log a warning and create an empty TreeItem if messages array is missing', () => {
            const ticket = { id: '1', title: 'Test Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' };
            const history = { messages: null };
            jest.spyOn(provider, 'getConversationTimestamp' as keyof ConversationsTreeDataProvider).mockReturnValue(1672531200000);
            jest.spyOn(provider, 'formatRelativeTime' as keyof ConversationsTreeDataProvider).mockReturnValue('2 days ago');
            jest.spyOn(provider, 'getConversationLabel' as keyof ConversationsTreeDataProvider).mockReturnValue('Test Label');
            jest.spyOn(provider, 'getConversationDescription' as keyof ConversationsTreeDataProvider).mockReturnValue('0 messages, last updated 2 days ago');

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: typeof history) => vscode.TreeItem })
                .createConversationItemFromHistory(ticket, history);

            expect(result).toBeInstanceOf(vscode.TreeItem);
            expect(result.label).toBe('Test Label');
            expect(result.description).toBe('0 messages, last updated 2 days ago');
            expect(Logger.warn).toHaveBeenCalledWith('[ConversationsTreeProvider] Missing messages array for ticket 1; showing empty conversation');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle errors gracefully and log them', () => {
            const ticket = { id: '1', title: 'Test Ticket', status: 'open', createdAt: '2023-01-01', updatedAt: '2023-01-02' };
            const history = {
                messages: [{ content: 'Message 1' }, { content: 'Message 2' }],
            };
            jest.spyOn(provider, 'getConversationTimestamp' as keyof ConversationsTreeDataProvider).mockImplementation(() => {
                throw new Error('Test Error');
            });

            const result = (provider as unknown as { createConversationItemFromHistory: (ticket: typeof ticket, history: typeof history) => vscode.TreeItem | null })
                .createConversationItemFromHistory(ticket, history);

            expect(result).toBeNull();
            expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
        });
    });
});