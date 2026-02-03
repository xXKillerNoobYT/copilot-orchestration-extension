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
import { agentStatusTracker } from './agentStatusTracker';
import { onTicketChange } from '../services/ticketDb';
import { logError, logInfo } from '../logger';

export class AgentsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    // EventEmitter for notifying VS Code when tree data changes (triggers refresh)
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        // Subscribe to ticket changes to refresh agent status display
        try {
            onTicketChange(() => {
                this.refresh();
            });
        } catch (err) {
            logError(`[AgentsTreeProvider] Failed to subscribe to ticket changes: ${err}`);
        }

        // Subscribe to agent status changes for real-time updates
        try {
            agentStatusTracker.onStatusChange(() => {
                this.refresh();
            });
            logInfo('[AgentsTreeProvider] Subscribed to agent status changes');
        } catch (err) {
            logError(`[AgentsTreeProvider] Failed to subscribe to status changes: ${err}`);
        }
    }

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
     * Queries live agent status from the tracker
     * @param element Optional parent element (not used for flat lists)
     */
    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        // Only return items at root level (no children for individual agents)
        if (element) {
            return [];
        }

        // Query live agent status from tracker instead of hardcoded values
        const agentNames = ['Planning', 'Orchestrator', 'Answer', 'Verification'];
        return agentNames.map(name => {
            const status = agentStatusTracker.getAgentStatus(name);
            const statusText = status?.status || 'Idle';
            const currentTask = status?.currentTask || '';
            const lastResult = status?.lastResult || '';

            // Build description: prioritize currentTask for active agents, show lastResult for completed
            let description: string;
            if (currentTask) {
                // Show current task (e.g., "Active, Task: Planning requirements...")
                const truncated = currentTask.substring(0, 50);
                description = `${statusText}, Task: ${truncated}${currentTask.length > 50 ? '...' : ''}`;
            } else if (lastResult) {
                // Show last result (e.g., "Waiting, Last: Step 1 completed")
                const truncated = lastResult.substring(0, 50);
                description = `${statusText}, Last: ${truncated}${lastResult.length > 50 ? '...' : ''}`;
            } else {
                // Just show status (e.g., "Idle")
                description = statusText;
            }

            // Map status to appropriate icon with progress indicator for Active
            let icon: vscode.ThemeIcon;
            switch (statusText) {
                case 'Active':
                    // Use spinning loader icon for active agents (progress indicator)
                    icon = new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.green'));
                    break;
                case 'Waiting':
                    icon = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.blue'));
                    break;
                case 'Failed':
                    icon = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
                    break;
                case 'Idle':
                default:
                    icon = new vscode.ThemeIcon('circle-outline');
                    break;
            }

            // Build rich tooltip with all available info
            let tooltip = `${name}: ${statusText}`;
            if (currentTask) {
                tooltip += `\nTask: ${currentTask}`;
            }
            if (lastResult) {
                tooltip += `\nLast Result: ${lastResult}`;
            }
            if (status?.timestamp) {
                tooltip += `\nUpdated: ${new Date(status.timestamp).toLocaleTimeString()}`;
            }

            return this.createAgentItem(name, description, tooltip, icon);
        });
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
