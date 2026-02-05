// ./agentsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: { None: 0 },
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
    });

    /** @aiContributed-2026-02-04 */
    describe('createAgentItem', () => {
        /** @aiContributed-2026-02-04 */
        it('should create a TreeItem with the correct properties', () => {
            const mockName = 'Agent 1';
            const mockStatus = 'Active';
            const mockTooltip = 'Agent is active';
            const mockIcon = { id: 'mock-icon' } as vscode.ThemeIcon;
            const mockIsEnabled = true;

            const mockTreeItem = {
                description: '',
                tooltip: '',
                iconPath: null,
                contextValue: '',
            };
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const result = provider['createAgentItem'](
                mockName,
                mockStatus,
                mockTooltip,
                mockIcon,
                mockIsEnabled
            );

            expect(vscode.TreeItem).toHaveBeenCalledWith(mockName, vscode.TreeItemCollapsibleState.None);
            expect(result.description).toBe(mockStatus);
            expect(result.tooltip).toBe(mockTooltip);
            expect(result.iconPath).toBe(mockIcon);
            expect(result.contextValue).toBe('coe-agent-enabled');
        });

        /** @aiContributed-2026-02-04 */
        it('should set contextValue to "coe-agent-disabled" when isEnabled is false', () => {
            const mockName = 'Agent 2';
            const mockStatus = 'Inactive';
            const mockTooltip = 'Agent is inactive';
            const mockIcon = { id: 'mock-icon' } as vscode.ThemeIcon;
            const mockIsEnabled = false;

            const mockTreeItem = {
                description: '',
                tooltip: '',
                iconPath: null,
                contextValue: '',
            };
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const result = provider['createAgentItem'](
                mockName,
                mockStatus,
                mockTooltip,
                mockIcon,
                mockIsEnabled
            );

            expect(vscode.TreeItem).toHaveBeenCalledWith(mockName, vscode.TreeItemCollapsibleState.None);
            expect(result.description).toBe(mockStatus);
            expect(result.tooltip).toBe(mockTooltip);
            expect(result.iconPath).toBe(mockIcon);
            expect(result.contextValue).toBe('coe-agent-disabled');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle null or undefined inputs gracefully', () => {
            const mockIcon = { id: 'mock-icon' } as vscode.ThemeIcon;

            const result = provider['createAgentItem'](
                null,
                undefined,
                null,
                mockIcon,
                true
            );

            expect(result.description).toBeUndefined();
            expect(result.tooltip).toBeNull();
            expect(result.iconPath).toBe(mockIcon);
            expect(result.contextValue).toBe('coe-agent-enabled');
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information during execution', () => {
            const mockName = 'Agent 1';
            const mockStatus = 'Active';
            const mockTooltip = 'Agent is active';
            const mockIcon = { id: 'mock-icon' } as vscode.ThemeIcon;
            const mockIsEnabled = true;

            provider['createAgentItem'](
                mockName,
                mockStatus,
                mockTooltip,
                mockIcon,
                mockIsEnabled
            );

            expect(Logger.debug).toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should create a TreeItem with an empty tooltip if not provided', () => {
            const mockName = 'Agent 2';
            const mockStatus = 'Inactive';
            const mockIcon = { id: 'mock-icon' } as vscode.ThemeIcon;
            const mockIsEnabled = false;

            const mockTreeItem = {
                description: '',
                tooltip: '',
                iconPath: null,
                contextValue: '',
            };
            (vscode.TreeItem as jest.Mock).mockImplementation(() => mockTreeItem);

            const result = provider['createAgentItem'](
                mockName,
                mockStatus,
                '',
                mockIcon,
                mockIsEnabled
            );

            expect(vscode.TreeItem).toHaveBeenCalledWith(mockName, vscode.TreeItemCollapsibleState.None);
            expect(result.description).toBe(mockStatus);
            expect(result.tooltip).toBe('');
            expect(result.iconPath).toBe(mockIcon);
            expect(result.contextValue).toBe('coe-agent-disabled');
        });
    });
});