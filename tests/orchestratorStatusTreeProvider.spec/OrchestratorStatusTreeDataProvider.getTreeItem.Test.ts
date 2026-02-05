// ./orchestratorStatusTreeProvider.Test.ts
import { OrchestratorStatusTreeDataProvider } from '../../src/ui/orchestratorStatusTreeProvider';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorStatusTreeDataProvider', () => {
    let provider: OrchestratorStatusTreeDataProvider;

    beforeEach(() => {
        provider = new OrchestratorStatusTreeDataProvider();
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
            const result = provider.getTreeItem(null as unknown as vscode.TreeItem);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-04 */
        it('should handle undefined input gracefully', () => {
            const result = provider.getTreeItem(undefined as unknown as vscode.TreeItem);
            expect(result).toBeUndefined();
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information when called', () => {
            const mockTreeItem = new vscode.TreeItem('Test Item');
            const debugSpy = jest.spyOn(Logger, 'debug');
            provider.getTreeItem(mockTreeItem);
            expect(debugSpy).toHaveBeenCalledWith('getTreeItem called with element:', mockTreeItem);
        });
    });
});