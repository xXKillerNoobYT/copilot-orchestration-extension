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
     * Includes Clarity score with color coding (red <60, yellow 60-84, green ≥85)
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

        // Build clarity score display string if present
        const clarityDisplay = this.formatClarityScore(ticket.clarityScore);

        // Description = status + clarity score + createdAt date + plan preview (shows to the right of the label)
        const createdDate = new Date(ticket.createdAt).toLocaleDateString();
        item.description = `${ticket.status}${clarityDisplay} • ${createdDate} • Plan: ${planPreview}`;

        // Tooltip = full ticket data for debugging (user hovers to read full plan)
        // Include full description and clarity score breakdown
        let tooltip = ticket.description || 'No plan stored yet';
        if (ticket.clarityScore !== undefined) {
            tooltip += `\n\n📊 Clarity Score: ${ticket.clarityScore}/100`;
        }
        item.tooltip = tooltip;

        // Icon = status-based ThemeIcon with optional clarity color
        item.iconPath = this.getIconForStatus(ticket.status, ticket.clarityScore);

        // Command = make item clickable, passing ticket.id as argument
        // When user clicks this ticket, VS Code will execute 'coe.openTicket' with ticketId
        item.command = {
            command: 'coe.openTicket',
            title: 'Open Ticket',
            arguments: [ticket.id]
        };

        // Context value = enables right-click context menu targeting
        // VS Code uses this to show context menu items with "when": "viewItem == ticket"
        item.contextValue = ticket.status === 'pending' ? 'coe-pending-ticket' : 'ticket';

        return item;
    }

    /**
     * Format clarity score for display in description
     * Returns empty string if no score, or " • 📊 XX" with emoji indicator
     * @param score The clarity score (0-100) or undefined
     */
    private formatClarityScore(score: number | undefined): string {
        if (score === undefined) {
            return '';
        }
        // Add emoji based on score range: 🔴 <60, 🟡 60-84, 🟢 ≥85
        const emoji = score >= 85 ? '🟢' : score >= 60 ? '🟡' : '🔴';
        return ` • ${emoji} ${score}`;
    }

    /**
     * Get ThemeColor based on clarity score
     * red <60, yellow 60-84, green ≥85
     * Returns undefined if no score (no color tint)
     * 
     * **Simple explanation**: Like traffic lights - green means clear, yellow means needs work, red means unclear.
     * @param score The clarity score (0-100) or undefined
     */
    getClarityColor(score: number | undefined): vscode.ThemeColor | undefined {
        if (score === undefined) {
            return undefined;
        }
        // Color thresholds from MT-011.13: red <60, yellow 60-84, green ≥85
        if (score >= 85) {
            return new vscode.ThemeColor('testing.iconPassed'); // Green
        } else if (score >= 60) {
            return new vscode.ThemeColor('testing.iconQueued'); // Yellow
        } else {
            return new vscode.ThemeColor('testing.iconFailed'); // Red
        }
    }

    /**
     * Helper to get icon based on ticket status
     * ThemeIcon = built-in VS Code icon by name
     * ~spin suffix = adds spinning animation
     * Now includes clarity score color tinting
     * @param status The ticket status
     * @param clarityScore Optional clarity score for color tinting
     */
    private getIconForStatus(status: string, clarityScore?: number): vscode.ThemeIcon {
        const color = this.getClarityColor(clarityScore);
        switch (status) {
            case 'open':
                return new vscode.ThemeIcon('issue-opened', color);
            case 'in-progress':
                return new vscode.ThemeIcon('sync~spin', color); // Spinning icon for active work
            case 'blocked':
                return new vscode.ThemeIcon('warning', color);
            default:
                return new vscode.ThemeIcon('circle-outline', color);
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
