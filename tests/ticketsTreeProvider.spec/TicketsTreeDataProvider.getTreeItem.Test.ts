// ./ticketsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-04 */
describe('TicketsTreeDataProvider', () => {
    let provider: TicketsTreeDataProvider;

    beforeEach(() => {
        provider = new TicketsTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('getTreeItem', () => {
        /** @aiContributed-2026-02-04 */
        it('should return the same TreeItem element passed to it', () => {
            const mockTreeItem = new vscode.TreeItem('Test Item');
            const result = provider.getTreeItem(mockTreeItem);
            expect(result).toBe(mockTreeItem);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle null input gracefully', () => {
            Logger.debug('Testing getTreeItem with null input');
            const result = provider.getTreeItem(null as unknown as vscode.TreeItem);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-04 */
        it('should handle undefined input gracefully', () => {
            Logger.debug('Testing getTreeItem with undefined input');
            const result = provider.getTreeItem(undefined as unknown as vscode.TreeItem);
            expect(result).toBeUndefined();
        });

        /** @aiContributed-2026-02-04 */
        it('should throw an error if an invalid object is passed', () => {
            const invalidInput = {} as vscode.TreeItem;
            const logErrorSpy = jest.spyOn(Logger, 'error');
            expect(() => provider.getTreeItem(invalidInput)).toThrow();
            expect(logErrorSpy).toHaveBeenCalled();
        });
    });
});