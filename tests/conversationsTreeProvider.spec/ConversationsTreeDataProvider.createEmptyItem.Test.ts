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

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
    /** @aiContributed-2026-02-04 */
    describe('createEmptyItem', () => {
        let provider: ConversationsTreeDataProvider;

        beforeEach(() => {
            provider = new ConversationsTreeDataProvider();
        });

        /** @aiContributed-2026-02-04 */
        it('should create a TreeItem with correct label, collapsible state, icon, and tooltip', () => {
            const mockTreeItem = { iconPath: null, tooltip: null };
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const result = (provider as unknown as { createEmptyItem: () => vscode.TreeItem }).createEmptyItem();

            expect(vscode.TreeItem).toHaveBeenCalledWith(
                'No active conversations',
                vscode.TreeItemCollapsibleState.None
            );
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('comment-discussion');
            expect(result).toBe(mockTreeItem);
            expect(result.iconPath).toEqual(expect.any(vscode.ThemeIcon));
            expect(result.tooltip).toBe(
                'Start a conversation with the Answer Agent to see it here'
            );
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information during execution', () => {
            (provider as unknown as { createEmptyItem: () => void }).createEmptyItem();
            expect(Logger.debug).toHaveBeenCalledWith(
                'Creating empty TreeItem for ConversationsTreeDataProvider'
            );
        });
    });
});