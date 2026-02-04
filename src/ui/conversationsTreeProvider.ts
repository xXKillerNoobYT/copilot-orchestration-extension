/**
 * ConversationsTreeDataProvider
 * 
 * TreeDataProvider for displaying active Answer Agent conversations in the sidebar.
 * - Queries TicketDb for tickets with conversationHistory
 * - Parses history JSON to display last activity + message preview
 * - Auto-refreshes when tickets change via EventEmitter subscription
 * 
 * TreeItem format:
 * - Label: First user message preview or "Conversation {ticketId}"
 * - Description: Relative time since last activity (e.g., "3 minutes ago")
 * - Tooltip: Message count + last active summary
 * - Icon: comment-discussion
 */

import * as vscode from 'vscode';
import { listTickets, onTicketChange, Ticket } from '../services/ticketDb';
import { getOrchestratorInstance } from '../services/orchestrator';
import { logError, logInfo, logWarn } from '../logger';

interface ConversationMessage {
    role: string;
    content: string;
}

interface ConversationMetadata {
    chatId: string;
    createdAt: string;
    lastActivityAt: string;
    messages: ConversationMessage[];
}

interface ParsedConversation {
    messages?: ConversationMessage[]; // Made optional since it can be undefined
    createdAt?: string;
    lastActivityAt?: string;
}

interface ConversationTreeItem extends vscode.TreeItem {
    timestamp: number;
}

export class ConversationsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    // EventEmitter for notifying VS Code when tree data changes (triggers refresh)
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        // Subscribe to ticket changes so the Conversations tab stays in sync
        try {
            logInfo('[ConversationsTreeProvider] Subscribing to ticket changes');
            onTicketChange(() => {
                logInfo('[ConversationsTreeProvider] Ticket change received, refreshing');
                this.refresh();
            });
        } catch (err) {
            logError(`[ConversationsTreeProvider] Failed to subscribe to ticket changes: ${err}`);
        }

        logInfo('[ConversationsTreeProvider] Initialized');
    }

    /**
     * getTreeItem returns the TreeItem as-is (required by TreeDataProvider interface)
     * @param element The tree item to return
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * getChildren returns the list of conversations to display
     * Called when VS Code needs to populate the tree view
     * Queries TicketDb and builds a list of conversation TreeItems
     * @param element Optional parent element (not used for flat lists)
     */
    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        // Only return items at root level (no children for individual conversations)
        if (element) {
            return [];
        }

        try {
            // Load all tickets from TicketDb
            const tickets = await listTickets();

            const ticketMap = new Map<string, Ticket>(tickets.map(ticket => [ticket.id, ticket]));
            const conversationEntries = new Map<string, { ticket: Ticket; history: ParsedConversation }>();

            // Keep only tickets that look like Answer Agent conversations
            for (const ticket of tickets) {
                if (!this.isConversationTicket(ticket)) {
                    continue;
                }

                const parsedHistory = this.parseConversationHistory(ticket);
                if (ticket.conversationHistory && !parsedHistory) {
                    continue;
                }

                const history = parsedHistory ?? this.buildEmptyHistory(ticket);
                if (!history) {
                    continue;
                }

                conversationEntries.set(ticket.id, { ticket, history });
            }

            // Merge in-memory AnswerAgent conversations (overrides any DB entry)
            const activeConversations = this.getActiveConversations();
            for (const conversation of activeConversations) {
                const ticket = ticketMap.get(conversation.chatId) || this.createMemoryTicket(conversation);
                const history: ParsedConversation = {
                    messages: conversation.messages,
                    createdAt: conversation.createdAt,
                    lastActivityAt: conversation.lastActivityAt
                };
                conversationEntries.set(conversation.chatId, { ticket, history });
            }

            // Build TreeItems
            const items: vscode.TreeItem[] = [];
            for (const entry of conversationEntries.values()) {
                const item = this.createConversationItemFromHistory(entry.ticket, entry.history);
                if (item) {
                    items.push(item);
                }
            }

            // Sort by most recent activity (newest first)
            items.sort((a, b) => {
                const aTimestamp = this.getItemTimestamp(a);
                const bTimestamp = this.getItemTimestamp(b);
                return bTimestamp - aTimestamp;
            });

            // If no valid conversations, show placeholder
            if (items.length === 0) {
                return [this.createEmptyItem()];
            }

            return items;
        } catch (err) {
            logError(`[ConversationsTreeProvider] Failed to load conversations: ${err}`);
            const errorItem = new vscode.TreeItem('Error loading conversations', vscode.TreeItemCollapsibleState.None);
            errorItem.iconPath = new vscode.ThemeIcon('error');
            errorItem.tooltip = `Database error: ${err}`;
            return [errorItem];
        }
    }

    /**
     * Manual refresh method (can be called from command or event handler)
     * Fires the EventEmitter to tell VS Code to re-query getChildren()
     */
    refresh(): void {
        logInfo('[ConversationsTreeProvider] Refreshing...');
        this._onDidChangeTreeData.fire();
    }

    /**
     * Builds a TreeItem for a conversation ticket.
     * Returns null if the JSON is invalid or missing required fields.
     */
    private createConversationItem(ticket: Ticket): vscode.TreeItem | null {
        const history = this.parseConversationHistory(ticket);
        if (!history) {
            return null;
        }

        return this.createConversationItemFromHistory(ticket, history);
    }

    private createConversationItemFromHistory(ticket: Ticket, history: ParsedConversation): vscode.TreeItem | null {
        // Defensive check: ensure messages array exists
        if (!history || !history.messages || !Array.isArray(history.messages)) {
            logWarn(`[ConversationsTreeProvider] Skipping ticket ${ticket.id} - invalid messages array`);
            return null;
        }
        
        const messageCount = history.messages.length;
        const lastActivityTimestamp = this.getConversationTimestamp(history, ticket);
        const relativeTime = this.formatRelativeTime(lastActivityTimestamp);
        const label = this.getConversationLabel(ticket, history);

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None) as ConversationTreeItem;
        item.description = this.getConversationDescription(relativeTime, messageCount);
        item.iconPath = new vscode.ThemeIcon('comment-discussion');
        item.tooltip = 'Click to continue chat';

        // Set contextValue for right-click menu (enables context menu items)
        item.contextValue = 'coe-conversation';

        // Store ticket.id for command handlers (used by context menu commands)
        item.command = {
            command: 'coe.openTicket',
            title: 'Continue Chat',
            arguments: [ticket.id]
        };

        // Store timestamp for sorting (not shown to users)
        item.timestamp = lastActivityTimestamp;

        return item;
    }

    /**
     * Creates a simple placeholder when there are no conversations.
     */
    private createEmptyItem(): vscode.TreeItem {
        const emptyItem = new vscode.TreeItem('No active conversations', vscode.TreeItemCollapsibleState.None);
        emptyItem.iconPath = new vscode.ThemeIcon('comment-discussion');
        emptyItem.tooltip = 'Start a conversation with the Answer Agent to see it here';
        return emptyItem;
    }

    /**
     * Picks a readable label for a conversation TreeItem.
     */
    private getConversationLabel(ticket: Ticket, history: ParsedConversation): string {
        // Defensive check: ensure messages array exists
        if (!history.messages || !Array.isArray(history.messages)) {
            return `Chat (${ticket.id})`;
        }
        
        const firstUserMessage = history.messages.find(message => message.role === 'user');
        const preview = firstUserMessage?.content?.trim();

        if (preview) {
            return `User: ${this.truncateText(preview, 60)}`;
        }

        return `New chat (${ticket.id})`;
    }

    /**
     * Convert a timestamp string to a number for sorting.
     */
    private getConversationTimestamp(history: ParsedConversation, ticket: Ticket): number {
        const lastActivity = history.lastActivityAt || history.createdAt || ticket.updatedAt || ticket.createdAt;
        const parsed = lastActivity ? Date.parse(lastActivity) : Number.NaN;
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Extract the timestamp saved on a TreeItem (used for sorting).
     */
    private getItemTimestamp(item: vscode.TreeItem): number {
        const conversationItem = item as ConversationTreeItem;
        return typeof conversationItem.timestamp === 'number' ? conversationItem.timestamp : 0;
    }

    /**
     * Simple relative time helper (e.g., "2 minutes ago").
     */
    private formatRelativeTime(timestamp: number): string {
        if (!timestamp) {
            return 'Unknown time';
        }

        const now = Date.now();
        const diffMs = Math.max(now - timestamp, 0);
        const diffSeconds = Math.floor(diffMs / 1000);

        if (diffSeconds < 60) {
            return 'just now';
        }

        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) {
            return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
        }

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) {
            return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
        }

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    }

    /**
     * Truncate long text for labels.
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }

        return `${text.slice(0, maxLength)}...`;
    }

    /**
     * Decide if a ticket should appear in the Conversations view.
     */
    private isConversationTicket(ticket: Ticket): boolean {
        if (ticket.type === 'answer_agent') {
            return true;
        }

        const history = ticket.conversationHistory?.trim();
        return Boolean(history && history !== '[]');
    }

    /**
     * Parse conversation history safely and normalize its shape.
     */
    private parseConversationHistory(ticket: Ticket): ParsedConversation | null {
        const rawHistory = ticket.conversationHistory?.trim();
        if (!rawHistory) {
            return null;
        }

        try {
            const parsed = JSON.parse(rawHistory) as ConversationMetadata | ConversationMessage[];

            if (Array.isArray(parsed)) {
                return {
                    messages: parsed,
                };
            }

            if (parsed && Array.isArray(parsed.messages)) {
                return {
                    messages: parsed.messages,
                    createdAt: parsed.createdAt,
                    lastActivityAt: parsed.lastActivityAt,
                };
            }

            logWarn(`[ConversationsTreeProvider] Skipping ticket ${ticket.id} due to unexpected conversation format`);
            return null;
        } catch (err) {
            logWarn(`[ConversationsTreeProvider] Skipping ticket ${ticket.id} due to invalid conversation JSON`);
            return null;
        }
    }

    private buildEmptyHistory(ticket: Ticket): ParsedConversation | null {
        if (ticket.type === 'answer_agent') {
            return { messages: [] };
        }

        return null;
    }

    private getActiveConversations(): ConversationMetadata[] {
        try {
            const orchestrator = getOrchestratorInstance();
            return orchestrator.getAnswerAgent().getActiveConversations();
        } catch (error: unknown) {
            logWarn(`[ConversationsTreeProvider] Unable to read active conversations: ${error}`);
            return [];
        }
    }

    private createMemoryTicket(metadata: ConversationMetadata): Ticket {
        const timestamp = metadata.lastActivityAt || metadata.createdAt || new Date().toISOString();
        const ticket: Ticket = {
            id: metadata.chatId,
            title: 'Answer Agent Conversation',
            status: 'open',
            type: 'answer_agent',
            createdAt: metadata.createdAt || timestamp,
            updatedAt: metadata.lastActivityAt || timestamp,
            conversationHistory: undefined
        };

        return ticket;
    }

    /**
     * Build a beginner-friendly description for each conversation row.
     */
    private getConversationDescription(relativeTime: string, messageCount: number): string {
        const messageLabel = `${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`;

        if (relativeTime === 'Unknown time') {
            return messageLabel;
        }

        return `Last active: ${relativeTime} | ${messageLabel}`;
    }
}
