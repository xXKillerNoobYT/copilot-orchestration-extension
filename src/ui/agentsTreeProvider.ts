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
import { getAutoModeEnabled } from '../services/autoModeState';

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

        // Create toggle item for Auto/Manual processing mode (appears at top)
        const toggleItem = this.createProcessingToggleItem();

        // Dynamic agent list - add new agents here as they are created
        const agentNames = ['Planning', 'Orchestrator', 'Answer', 'Verification', 'Research'];
        const agentItems = agentNames.map(name => {
            // Check if agent is enabled in settings
            const config = vscode.workspace.getConfiguration('coe');
            const settingKey = `enable${name}Agent`;
            const isEnabled = config.get<boolean>(settingKey, true); // Default to true for most agents

            const status = agentStatusTracker.getAgentStatus(name);
            const statusText = status?.status || 'Idle';
            const currentTask = status?.currentTask || '';
            const lastResult = status?.lastResult || '';

            // Build description: prioritize currentTask for active agents, show lastResult for completed
            // If disabled, show "Disabled" status
            let description: string;
            if (!isEnabled) {
                description = 'Disabled';
            } else if (currentTask) {
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
            // Use gray icon for disabled agents
            let icon: vscode.ThemeIcon;
            if (!isEnabled) {
                // Gray icon for disabled agents
                icon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
            } else {
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
            }

            // Build rich tooltip with all available info
            let tooltip = `${name}: ${isEnabled ? statusText : 'Disabled'}`;
            if (!isEnabled) {
                tooltip += `\nRight-click to enable this agent`;
            } else {
                if (currentTask) {
                    tooltip += `\nTask: ${currentTask}`;
                }
                if (lastResult) {
                    tooltip += `\nLast Result: ${lastResult}`;
                }
                if (status?.timestamp) {
                    tooltip += `\nUpdated: ${new Date(status.timestamp).toLocaleTimeString()}`;
                }
                tooltip += `\nRight-click to disable this agent`;
            }

            return this.createAgentItem(name, description, tooltip, icon, isEnabled);
        });

        // Create separator between built-in agents and custom agents
        const customAgentsSeparator = new vscode.TreeItem('Custom Agents', vscode.TreeItemCollapsibleState.None);
        customAgentsSeparator.iconPath = new vscode.ThemeIcon('folder-open');
        customAgentsSeparator.tooltip = 'Create and manage your own AI agents';

        // Create Custom Agent button
        const createCustomAgentItem = new vscode.TreeItem('+ Create New Agent', vscode.TreeItemCollapsibleState.None);
        createCustomAgentItem.iconPath = new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.green'));
        createCustomAgentItem.tooltip = 'Create a new custom AI agent with your own system prompt, goals, and rules';
        createCustomAgentItem.command = {
            command: 'coe.openCustomAgentBuilder',
            title: 'Create Custom Agent',
            arguments: []
        };

        // Open Agent Gallery button
        const agentGalleryItem = new vscode.TreeItem('📚 Agent Gallery', vscode.TreeItemCollapsibleState.None);
        agentGalleryItem.iconPath = new vscode.ThemeIcon('library', new vscode.ThemeColor('charts.purple'));
        agentGalleryItem.tooltip = 'Browse and install pre-built agent templates from the gallery';
        agentGalleryItem.command = {
            command: 'coe.showAgentGallery',
            title: 'Open Agent Gallery',
            arguments: []
        };

        // Return: toggle item → built-in agents → custom agents section → create/gallery buttons
        return [toggleItem, ...agentItems, customAgentsSeparator, createCustomAgentItem, agentGalleryItem];
    }

    /**
     * Create the Auto/Manual processing mode toggle item
     * Appears at top of tree view with clickable command
     * Green icon + "Auto" when auto-processing enabled
     * Red icon + "Manual" when auto-processing disabled (default)
     */
    private createProcessingToggleItem(): vscode.TreeItem {
        // Get current auto-processing state (runtime override or setting, default: true = Auto mode)
        const isAutoMode = getAutoModeEnabled();

        // Create label and icon based on current mode
        const label = 'Processing';
        const description = isAutoMode ? 'Auto' : 'Manual';
        const icon = isAutoMode
            ? new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.green'))
            : new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('charts.red'));

        const tooltip = isAutoMode
            ? 'Auto mode: Tickets are processed automatically. Click to switch to Manual.'
            : 'Manual mode: Tickets wait for manual action. Click to switch to Auto.';

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.description = description;
        item.iconPath = icon;
        item.tooltip = tooltip;

        // Make item clickable - triggers toggle command
        item.command = {
            command: 'coe.toggleAutoProcessing',
            title: 'Toggle Auto Processing',
            arguments: []
        };

        return item;
    }

    /**
     * Helper to create a TreeItem for an agent
     * @param name Agent name (e.g., "Planning")
     * @param status Agent status (e.g., "Active")
     * @param tooltip Detailed tooltip text
     * @param icon ThemeIcon for the agent
     * @param isEnabled Whether the agent is enabled
     */
    private createAgentItem(
        name: string,
        status: string,
        tooltip: string,
        icon: vscode.ThemeIcon,
        isEnabled: boolean
    ): vscode.TreeItem {
        const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
        item.description = status; // Shows to the right of the label (e.g., "Planning - Active")
        item.tooltip = tooltip; // Hover text
        item.iconPath = icon; // Icon on the left
        // Set contextValue for menu support (enables right-click menu based on enabled/disabled state)
        item.contextValue = isEnabled ? 'coe-agent-enabled' : 'coe-agent-disabled';
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
