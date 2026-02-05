// ./agentsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('AgentsTreeDataProvider', () => {
    let dataProvider: AgentsTreeDataProvider;

    beforeEach(() => {
        dataProvider = new AgentsTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('getTreeItem', () => {
        /** @aiContributed-2026-02-04 */
        it('should return the same TreeItem object passed as input', () => {
            const mockTreeItem = new vscode.TreeItem('Test Item');
            const result = dataProvider.getTreeItem(mockTreeItem);
            expect(result).toBe(mockTreeItem);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle null input gracefully', () => {
            Logger.debug('Testing getTreeItem with null input');
            const result = dataProvider.getTreeItem(null as unknown as vscode.TreeItem);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-04 */
        it('should handle undefined input gracefully', () => {
            Logger.debug('Testing getTreeItem with undefined input');
            const result = dataProvider.getTreeItem(undefined as unknown as vscode.TreeItem);
            expect(result).toBeUndefined();
        });

        /** @aiContributed-2026-02-04 */
        it('should log an error if an invalid object is passed', () => {
            const invalidInput = {} as vscode.TreeItem;
            const logErrorSpy = jest.spyOn(Logger, 'error');
            expect(() => dataProvider.getTreeItem(invalidInput)).toThrow();
            expect(logErrorSpy).toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should handle TreeItem with missing properties gracefully', () => {
            const incompleteTreeItem = { label: 'Incomplete Item' } as vscode.TreeItem;
            const logErrorSpy = jest.spyOn(Logger, 'error');
            expect(() => dataProvider.getTreeItem(incompleteTreeItem)).toThrow();
            expect(logErrorSpy).toHaveBeenCalled();
        });
    });
});