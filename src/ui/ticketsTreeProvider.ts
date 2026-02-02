/**
 * TicketsTreeDataProvider
 * 
 * TreeDataProvider for displaying open tickets from TicketDb in the sidebar.
 * - Queries TicketDb.listTickets() asynchronously
 * - Filters out 'done' tickets (only shows open/in-progress/blocked)
 * - Auto-refreshes when tickets change via EventEmitter subscription
 * - Shows error item if database query fails
 * 
 * TreeItem format:
 * - Label: ticket.title
 * - Description: status + createdAt date
 * - Tooltip: Full ticket JSON for debugging
 * - Icon: Status-based ThemeIcon
 */

import * as vscode from 'vscode';
import { listTickets, onTicketChange, Ticket } from '../services/ticketDb';
import { logInfo, logError } from '../logger';

export class TicketsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    // EventEmitter for notifying VS Code when tree data changes (triggers refresh)
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        // Subscribe to ticket changes from TicketDb (auto-refresh on create/update)
        // EventEmitter = notification system: when TicketDb emits 'change', this callback runs and refreshes the sidebar
        try {
            logInfo('TicketsTreeProvider subscribing to ticket changes');
            onTicketChange(() => {
                logInfo('Ticket change event received, refreshing tree view');
                this.refresh();
            });
        } catch (err) {
            logError(`Failed to subscribe to ticket changes: ${err}`);
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
     * getChildren returns the list of open tickets to display
     * Called when VS Code needs to populate the tree view
     * Async = waits for database to return results before building list
     * @param element Optional parent element (not used for flat lists)
     */
    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        // Only return items at root level (no children for individual tickets)
        if (element) {
            return [];
        }

        try {
            // Query database for all tickets (async/await = wait for database)
            const tickets = await listTickets();

            // Filter to only open tickets (status !== 'done')
            const openTickets = tickets.filter(t => t.status !== 'done');

            // If no open tickets, show placeholder message
            if (openTickets.length === 0) {
                const emptyItem = new vscode.TreeItem('No open tickets', vscode.TreeItemCollapsibleState.None);
                emptyItem.iconPath = new vscode.ThemeIcon('inbox');
                emptyItem.tooltip = 'All tickets are completed or no tickets exist';
                return [emptyItem];
            }

            // Map tickets to TreeItems
            return openTickets.map(ticket => this.createTicketItem(ticket));
        } catch (err) {
            // Error handling: Show error item if database query fails
            logError(`Failed to load tickets: ${err}`);
            const errorItem = new vscode.TreeItem('Error loading tickets', vscode.TreeItemCollapsibleState.None);
            errorItem.iconPath = new vscode.ThemeIcon('error');
            errorItem.tooltip = `Database error: ${err}`;
            return [errorItem];
        }
    }

    /**
     * Helper to create a TreeItem for a ticket
     * Now includes plan preview extracted from ticket.description
     * @param ticket The ticket data from database
     */
    private createTicketItem(ticket: Ticket): vscode.TreeItem {
        // TreeItem label = ticket title
        const item = new vscode.TreeItem(ticket.title, vscode.TreeItemCollapsibleState.None);

        // Extract plan preview from description (200 char limit)
        let planPreview = '—';
        if (ticket.description) {
            // Clean whitespace: replace newlines/tabs/carriage returns with spaces
            const cleaned = ticket.description.replace(/[\r\n\t]/g, ' ').trim();
            // Take first 200 chars
            planPreview = cleaned.substring(0, 200);
            // Append "..." if original was longer
            if (cleaned.length > 200) {
                planPreview += '...';
            }
        }

        // Description = status + createdAt date + plan preview (shows to the right of the label)
        const createdDate = new Date(ticket.createdAt).toLocaleDateString();
        item.description = `${ticket.status} • ${createdDate} • Plan: ${planPreview}`;

        // Tooltip = full ticket data for debugging (user hovers to read full plan)
        // Include full description so users can hover to see complete plan text
        item.tooltip = ticket.description || 'No plan stored yet';

        // Icon = status-based ThemeIcon
        item.iconPath = this.getIconForStatus(ticket.status);

        return item;
    }

    /**
     * Helper to get icon based on ticket status
     * ThemeIcon = built-in VS Code icon by name
     * ~spin suffix = adds spinning animation
     */
    private getIconForStatus(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'open':
                return new vscode.ThemeIcon('issue-opened');
            case 'in-progress':
                return new vscode.ThemeIcon('sync~spin'); // Spinning icon for active work
            case 'blocked':
                return new vscode.ThemeIcon('warning');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    /**
     * refresh triggers a tree data change event, causing VS Code to re-query getChildren()
     * Used for manual refresh command and auto-refresh on ticket changes
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
