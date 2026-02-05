// ./agentsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    workspace: {
        getConfiguration: jest.fn(),
    },
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: {
        None: 0,
    },
    ThemeIcon: jest.fn(),
    ThemeColor: jest.fn(),
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
describe('AgentsTreeDataProvider', () => {
    let provider: AgentsTreeDataProvider;

    beforeEach(() => {
        provider = new AgentsTreeDataProvider();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('createProcessingToggleItem', () => {
        /** @aiContributed-2026-02-04 */
        it('should create a TreeItem with Auto mode when autoProcessTickets is true', () => {
            const mockConfig = {
                get: jest.fn().mockReturnValue(true),
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            const treeItem = provider['createProcessingToggleItem']();

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('coe');
            expect(mockConfig.get).toHaveBeenCalledWith('autoProcessTickets', false);
            expect(vscode.TreeItem).toHaveBeenCalledWith('Processing', vscode.TreeItemCollapsibleState.None);
            expect(treeItem.description).toBe('Auto');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('play', expect.any(vscode.ThemeColor));
            expect(treeItem.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(treeItem.tooltip).toBe(
                'Auto mode: Tickets are processed automatically. Click to switch to Manual.'
            );
            expect(treeItem.command).toEqual({
                command: 'coe.toggleAutoProcessing',
                title: 'Toggle Auto Processing',
                arguments: [],
            });
        });

        /** @aiContributed-2026-02-04 */
        it('should create a TreeItem with Manual mode when autoProcessTickets is false', () => {
            const mockConfig = {
                get: jest.fn().mockReturnValue(false),
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            const treeItem = provider['createProcessingToggleItem']();

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('coe');
            expect(mockConfig.get).toHaveBeenCalledWith('autoProcessTickets', false);
            expect(vscode.TreeItem).toHaveBeenCalledWith('Processing', vscode.TreeItemCollapsibleState.None);
            expect(treeItem.description).toBe('Manual');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('debug-stop', expect.any(vscode.ThemeColor));
            expect(treeItem.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(treeItem.tooltip).toBe(
                'Manual mode: Tickets wait for manual action. Click to switch to Auto.'
            );
            expect(treeItem.command).toEqual({
                command: 'coe.toggleAutoProcessing',
                title: 'Toggle Auto Processing',
                arguments: [],
            });
        });

        /** @aiContributed-2026-02-04 */
        it('should handle errors gracefully and log them', () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => {
                throw new Error('Configuration error');
            });

            expect(() => provider['createProcessingToggleItem']()).toThrow('Configuration error');
            expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
        });
    });
});