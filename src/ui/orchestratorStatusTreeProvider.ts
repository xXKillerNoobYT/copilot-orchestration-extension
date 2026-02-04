/**
 * OrchestratorStatusTreeDataProvider
 *
 * TreeDataProvider that shows live Orchestrator queue stats in the sidebar.
 * - Queue length
 * - Blocked / P1 ticket count
 * - Last picked task title
 *
 * **Simple explanation**: Think of this as a tiny dashboard that tells you
 * how many tasks are waiting, which ones are blocked, and what was last picked.
 */

import * as vscode from 'vscode';
import { getOrchestratorInstance } from '../services/orchestrator';
import { onTicketChange } from '../services/ticketDb';
import { logError, logInfo } from '../logger';

type StatusItemType = 'queue' | 'blocked' | 'lastPicked';

export class OrchestratorStatusTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    // EventEmitter for notifying VS Code when tree data changes (triggers refresh)
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        // Subscribe to orchestrator queue changes (auto-refresh)
        try {
            const orchestrator = getOrchestratorInstance();
            orchestrator.onQueueChange(() => {
                logInfo('[OrchestratorStatusTree] Queue change detected, refreshing');
                this.refresh();
            });
            logInfo('[OrchestratorStatusTree] Subscribed to queue changes');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorStatusTree] Failed to subscribe to queue changes: ${message}`);
        }

        // Safety net: refresh when tickets change (keeps blocked count accurate)
        try {
            onTicketChange(() => {
                this.refresh();
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorStatusTree] Failed to subscribe to ticket changes: ${message}`);
        }
    }

    /**
     * getTreeItem returns the TreeItem as-is (required by TreeDataProvider interface).
     *
     * **Simple explanation**: If VS Code asks for a row, we hand back the same row.
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * getChildren returns the list of status items to display.
     * Called when VS Code needs to populate the tree view.
     *
     * **Simple explanation**: This builds the three lines you see in the sidebar.
     */
    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return [];
        }

        try {
            const orchestrator = getOrchestratorInstance();
            const status = await orchestrator.getQueueStatus();

            const queueItem = this.createStatusItem(
                'Queue',
                `Queue: ${status.queueCount} tasks`,
                `Queue currently has ${status.queueCount} tasks waiting. Click for details.`,
                'list-unordered',
                'queue'
            );

            const blockedItem = this.createStatusItem(
                'Blocked / P1',
                `Blocked / P1: ${status.blockedP1Count}`,
                `Blocked P1 tickets: ${status.blockedP1Count}. Click for details.`,
                'warning',
                'blocked'
            );

            const lastPickedLabel = status.lastPickedTitle ? status.lastPickedTitle : 'Idle';
            const lastPickedItem = this.createStatusItem(
                'Last picked',
                `Last picked: ${lastPickedLabel}`,
                status.lastPickedTitle
                    ? `Last picked task: ${status.lastPickedTitle}. Click for details.`
                    : 'No task picked yet. Click for details.',
                'history',
                'lastPicked'
            );

            return [queueItem, blockedItem, lastPickedItem];
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorStatusTree] Failed to load status: ${message}`);

            const errorItem = new vscode.TreeItem('Error loading orchestrator status', vscode.TreeItemCollapsibleState.None);
            errorItem.iconPath = new vscode.ThemeIcon('error');
            errorItem.tooltip = `Failed to load status: ${message}`;
            return [errorItem];
        }
    }

    /**
     * refresh triggers a tree data change event, causing VS Code to re-query getChildren().
     *
     * **Simple explanation**: This tells VS Code to re-read the dashboard stats.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private createStatusItem(
        title: string,
        label: string,
        tooltip: string,
        iconId: string,
        itemType: StatusItemType
    ): vscode.TreeItem {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.description = '';
        item.tooltip = tooltip;
        item.iconPath = new vscode.ThemeIcon(iconId);
        item.command = {
            command: 'coe.showOrchestratorStatusDetails',
            title: `Show ${title} details`,
            arguments: [itemType]
        };
        return item;
    }
}
