// ./orchestratorStatusTreeProvider.Test.ts
import * as vscode from 'vscode';
import { OrchestratorStatusTreeDataProvider } from '../../src/ui/orchestratorStatusTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: { None: 0 },
    ThemeIcon: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorStatusTreeDataProvider', () => {
    let provider: OrchestratorStatusTreeDataProvider;

    beforeEach(() => {
        provider = new OrchestratorStatusTreeDataProvider();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('createStatusItem', () => {
        /** @aiContributed-2026-02-04 */
        it('should create a TreeItem with the correct properties', () => {
            const title = 'Test Title';
            const label = 'Test Label';
            const tooltip = 'Test Tooltip';
            const iconId = 'test-icon';
            const itemType = 'test-item-type';

            const mockTreeItem: vscode.TreeItem = {
                description: '',
                tooltip: '',
                iconPath: null,
                command: null,
            } as vscode.TreeItem;
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const result = (provider as OrchestratorStatusTreeDataProvider & { createStatusItem: (title: string, label: string, tooltip: string, iconId: string, itemType: string) => vscode.TreeItem }).createStatusItem(title, label, tooltip, iconId, itemType);

            expect(vscode.TreeItem).toHaveBeenCalledWith(label, vscode.TreeItemCollapsibleState.None);
            expect(result.description).toBe('');
            expect(result.tooltip).toBe(tooltip);
            expect(result.iconPath).toEqual(new vscode.ThemeIcon(iconId));
            expect(result.command).toEqual({
                command: 'coe.showOrchestratorStatusDetails',
                title: `Show ${title} details`,
                arguments: [itemType],
            });
        });

        /** @aiContributed-2026-02-04 */
        it('should handle null or undefined inputs gracefully', () => {
            const result = (provider as OrchestratorStatusTreeDataProvider & { createStatusItem: (title: string | null, label: string | undefined, tooltip: string | null, iconId: string | undefined, itemType: string | null) => vscode.TreeItem }).createStatusItem(null, undefined, null, undefined, null);

            expect(vscode.TreeItem).toHaveBeenCalledWith(undefined, vscode.TreeItemCollapsibleState.None);
            expect(result.description).toBe('');
            expect(result.tooltip).toBe(null);
            expect(result.iconPath).toEqual(new vscode.ThemeIcon(undefined));
            expect(result.command).toEqual({
                command: 'coe.showOrchestratorStatusDetails',
                title: `Show null details`,
                arguments: [null],
            });
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information during execution', () => {
            const title = 'Debug Title';
            const label = 'Debug Label';
            const tooltip = 'Debug Tooltip';
            const iconId = 'debug-icon';
            const itemType = 'debug-item-type';

            const mockTreeItem: vscode.TreeItem = {} as vscode.TreeItem;
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const loggerSpy = jest.spyOn(Logger, 'debug');

            (provider as OrchestratorStatusTreeDataProvider & { createStatusItem: (title: string, label: string, tooltip: string, iconId: string, itemType: string) => vscode.TreeItem }).createStatusItem(title, label, tooltip, iconId, itemType);

            expect(loggerSpy).toHaveBeenCalledWith('Creating status item with label: Debug Label');
        });
    });
});