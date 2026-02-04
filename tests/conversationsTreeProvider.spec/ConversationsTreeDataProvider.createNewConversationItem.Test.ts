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
    /** @aiContributed-2026-02-03 */
    describe('createNewConversationItem', () => {
        let provider: ConversationsTreeDataProvider;

        beforeEach(() => {
            provider = new ConversationsTreeDataProvider();
        });

        /** @aiContributed-2026-02-03 */
        it('should create a new TreeItem with correct properties', () => {
            const mockTreeItem = { command: null, iconPath: null, tooltip: null };
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const item = (provider as unknown as { createNewConversationItem: () => vscode.TreeItem }).createNewConversationItem();

            expect(vscode.TreeItem).toHaveBeenCalledWith('➕ New Conversation', vscode.TreeItemCollapsibleState.None);
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('add');
            expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(item.tooltip).toBe('Start a new conversation with the Answer Agent');
            expect(item.command).toEqual({
                command: 'coe.startNewConversation',
                title: 'Start New Conversation',
            });
        });

        /** @aiContributed-2026-02-03 */
        it('should log debug information during execution', () => {
            (provider as unknown as { createNewConversationItem: () => void }).createNewConversationItem();
            expect(Logger.debug).toHaveBeenCalledWith('Creating new conversation item');
        });
    });
});