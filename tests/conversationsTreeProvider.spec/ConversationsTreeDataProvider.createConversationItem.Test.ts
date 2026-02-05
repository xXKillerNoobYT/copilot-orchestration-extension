// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    EventEmitter: jest.fn(() => ({
        event: jest.fn(),
        fire: jest.fn(),
    })),
}));

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
    conversationHistory: string | null;
}

interface ParsedConversation {
    messages: { role: string; content: string }[];
}

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('createConversationItem', () => {
        /** @aiContributed-2026-02-04 */
        it('should return null if parseConversationHistory returns null', () => {
            const ticket: Ticket = { id: '1', title: 'Test Ticket', conversationHistory: null };
            jest.spyOn(provider, 'parseConversationHistory' as keyof ConversationsTreeDataProvider).mockReturnValue(null);

            const result = (provider as unknown as { createConversationItem(ticket: Ticket): vscode.TreeItem | null }).createConversationItem(ticket);

            expect(result).toBeNull();
            expect(Logger.debug).toHaveBeenCalledWith('parseConversationHistory returned null for ticket: 1');
        });

        /** @aiContributed-2026-02-04 */
        it('should call createConversationItemFromHistory with correct arguments if history is valid', () => {
            const ticket: Ticket = { id: '1', title: 'Test Ticket', conversationHistory: 'history' };
            const history: ParsedConversation = { messages: [] };
            const treeItem = new vscode.TreeItem('Test Item');
            jest.spyOn(provider, 'parseConversationHistory' as keyof ConversationsTreeDataProvider).mockReturnValue(history);
            const createConversationItemFromHistoryMock = jest
                .spyOn(provider, 'createConversationItemFromHistory' as keyof ConversationsTreeDataProvider)
                .mockReturnValue(treeItem);

            const result = (provider as unknown as { createConversationItem(ticket: Ticket): vscode.TreeItem | null }).createConversationItem(ticket);

            expect(result).toBe(treeItem);
            expect(createConversationItemFromHistoryMock).toHaveBeenCalledWith(ticket, history);
            expect(Logger.debug).toHaveBeenCalledWith('Successfully created conversation item for ticket: 1');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle errors thrown by parseConversationHistory gracefully', () => {
            const ticket: Ticket = { id: '1', title: 'Test Ticket', conversationHistory: null };
            jest.spyOn(provider, 'parseConversationHistory' as keyof ConversationsTreeDataProvider).mockImplementation(() => {
                throw new Error('Test Error');
            });

            expect(() => (provider as unknown as { createConversationItem(ticket: Ticket): vscode.TreeItem | null }).createConversationItem(ticket)).not.toThrow();
            expect(Logger.error).toHaveBeenCalledWith('Error in createConversationItem for ticket: 1', new Error('Test Error'));
        });

        /** @aiContributed-2026-02-04 */
        it('should return null if createConversationItemFromHistory returns null', () => {
            const ticket: Ticket = { id: '1', title: 'Test Ticket', conversationHistory: 'history' };
            const history: ParsedConversation = { messages: [] };
            jest.spyOn(provider, 'parseConversationHistory' as keyof ConversationsTreeDataProvider).mockReturnValue(history);
            jest.spyOn(provider, 'createConversationItemFromHistory' as keyof ConversationsTreeDataProvider).mockReturnValue(null);

            const result = (provider as unknown as { createConversationItem(ticket: Ticket): vscode.TreeItem | null }).createConversationItem(ticket);

            expect(result).toBeNull();
            expect(Logger.debug).toHaveBeenCalledWith('createConversationItemFromHistory returned null for ticket: 1');
        });

        /** @aiContributed-2026-02-04 */
        it('should return null if ticket is undefined', () => {
            jest.spyOn(provider, 'parseConversationHistory' as keyof ConversationsTreeDataProvider).mockReturnValue(null);

            const result = (provider as unknown as { createConversationItem(ticket: Ticket | undefined): vscode.TreeItem | null }).createConversationItem(undefined);

            expect(result).toBeNull();
            expect(Logger.debug).toHaveBeenCalledWith('parseConversationHistory returned null for ticket: undefined');
        });
    });
});