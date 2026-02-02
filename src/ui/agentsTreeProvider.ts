/**
 * AgentsTreeDataProvider
 * 
 * TreeDataProvider = class that tells VS Code what items to show in the Agents sidebar tab.
 * TreeItem = each row in the list with label, icon, and tooltip.
 * ThemeIcon = built-in VS Code icon by name (e.g., 'pulse', 'gear').
 * ThemeColor = optional color tint for icons (e.g., green for success).
 * EventEmitter = notification system to auto-update the sidebar when data changes.
 */

import * as vscode from 'vscode';

export class AgentsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    // EventEmitter for notifying VS Code when tree data changes (triggers refresh)
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /**
     * getTreeItem returns the TreeItem as-is (required by TreeDataProvider interface)
     * @param element The tree item to return
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * getChildren returns the list of agents to display
     * Called when VS Code needs to populate the tree view
     * @param element Optional parent element (not used for flat lists)
     */
    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        // Only return items at root level (no children for individual agents)
        if (element) {
            return [];
        }

        // Static hardcoded agents for MVP
        return [
            this.createAgentItem(
                'Planning',
                'Active',
                'Planning agent is actively generating plans',
                new vscode.ThemeIcon('pulse', new vscode.ThemeColor('testing.iconPassed'))
            ),
            this.createAgentItem(
                'Orchestrator',
                'Ready',
                'Orchestrator is ready to route tasks',
                new vscode.ThemeIcon('gear')
            ),
            this.createAgentItem(
                'Answer',
                'Idle',
                'Answer agent is idle, waiting for questions',
                new vscode.ThemeIcon('comment')
            ),
            this.createAgentItem(
                'Verification',
                'Waiting',
                'Verification agent is waiting for work',
                new vscode.ThemeIcon('check')
            ),
        ];
    }

    /**
     * Helper to create a TreeItem for an agent
     * @param name Agent name (e.g., "Planning")
     * @param status Agent status (e.g., "Active")
     * @param tooltip Detailed tooltip text
     * @param icon ThemeIcon for the agent
     */
    private createAgentItem(
        name: string,
        status: string,
        tooltip: string,
        icon: vscode.ThemeIcon
    ): vscode.TreeItem {
        const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
        item.description = status; // Shows to the right of the label (e.g., "Planning - Active")
        item.tooltip = tooltip; // Hover text
        item.iconPath = icon; // Icon on the left
        return item;
    }

    /**
     * refresh triggers a tree data change event, causing VS Code to re-query getChildren()
     * Used for manual refresh command
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
