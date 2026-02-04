// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
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
    describe('getTreeItem', () => {
        let provider: ConversationsTreeDataProvider;

        beforeEach(() => {
            provider = new ConversationsTreeDataProvider();
        });

        /** @aiContributed-2026-02-03 */
        it('should return the same TreeItem element passed to it', () => {
            const mockTreeItem = new vscode.TreeItem('Test Item');
            const result = provider.getTreeItem(mockTreeItem);
            expect(result).toBe(mockTreeItem);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null input gracefully', () => {
            const result = provider.getTreeItem(null as unknown as vscode.TreeItem);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined input gracefully', () => {
            const result = provider.getTreeItem(undefined as unknown as vscode.TreeItem);
            expect(result).toBeUndefined();
        });

        /** @aiContributed-2026-02-03 */
        it('should log debug information when called', () => {
            const mockTreeItem = new vscode.TreeItem('Test Item');
            provider.getTreeItem(mockTreeItem);
            expect(Logger.debug).toHaveBeenCalledWith('getTreeItem called with element:', mockTreeItem);
        });
    });
});