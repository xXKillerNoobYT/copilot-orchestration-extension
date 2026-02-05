# TreeView Provider Pattern

**Purpose**: Implement VS Code TreeView providers with auto-refresh and event-driven updates  
**Related Files**: `src/ui/agentsTreeProvider.ts`, `src/ui/ticketsTreeProvider.ts`, `src/ui/orchestratorStatusTreeProvider.ts`  
**Keywords**: treeview, provider, eventEmitter, refresh, sidebar

## TreeDataProvider Interface

All TreeView providers implement `vscode.TreeDataProvider<T>`:

```typescript
import * as vscode from 'vscode';

export class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    // 1. EventEmitter for auto-refresh (required)
    private _onDidChangeTreeData = new vscode.EventEmitter<MyTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    constructor() {
        // 2. Register for data change events
        this.setupEventListeners();
    }
    
    // 3. Refresh trigger (public API)
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    // 4. Get tree item representation (required)
    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }
    
    // 5. Get children (required)
    async getChildren(element?: MyTreeItem): Promise<MyTreeItem[]> {
        if (!element) {
            // Return root-level items
            return this.getRootItems();
        }
        
        // Return children of element
        return element.children || [];
    }
    
    private setupEventListeners(): void {
        // Auto-refresh when data changes
        onDataChange(() => {
            this.refresh();
        });
    }
    
    private async getRootItems(): Promise<MyTreeItem[]> {
        // Fetch data from service
        const data = await getSomeData();
        return data.map(item => new MyTreeItem(item));
    }
}
```

## Real Example: Tickets TreeView Provider

```typescript
// src/ui/ticketsTreeProvider.ts
export class TicketsTreeDataProvider implements vscode.TreeDataProvider<TicketTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TicketTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        // Auto-refresh when tickets change in database
        onTicketChange(() => {
            logInfo('[TicketsTreeProvider] Ticket change detected, refreshing tree');
            this.refresh();
        });
    }

    /**
     * Manually refresh the tickets tree view.
     * 
     * **Simple explanation**: Like hitting the refresh button on a web browser.
     * This tells VS Code "the data changed, please re-render the tree view."
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TicketTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TicketTreeItem): Promise<TicketTreeItem[]> {
        if (element) {
            // Tickets have no children in this tree
            return [];
        }

        try {
            const tickets = await listTickets();
            
            if (tickets.length === 0) {
                const item = new vscode.TreeItem('No tickets');
                item.description = 'Create a ticket to get started';
                item.iconPath = new vscode.ThemeIcon('info');
                return [item as any];
            }

            return tickets.map(ticket => new TicketTreeItem(ticket));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[TicketsTreeProvider] Failed to load tickets: ${msg}`);
            return [];
        }
    }
}
```

## TreeItem Implementation

TreeItems define how each node appears in the tree:

```typescript
export class TicketTreeItem extends vscode.TreeItem {
    constructor(public readonly ticket: Ticket) {
        super(ticket.title, vscode.TreeItemCollapsibleState.None);
        
        // Description (shown dimmed to the right)
        this.description = ticket.status;
        
        // Tooltip (hover text)
        this.tooltip = `${ticket.title}\nStatus: ${ticket.status}\nID: ${ticket.id}`;
        
        // Icon (uses VS Code theme icons)
        this.iconPath = this.getIconForStatus(ticket.status);
        
        // Context value (enables context menu filtering)
        this.contextValue = 'ticket';
        
        // Command (runs when item clicked)
        this.command = {
            command: 'coe.openTicket',
            title: 'Open Ticket',
            arguments: [ticket.id]
        };
    }
    
    private getIconForStatus(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'open': return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
            case 'in-progress': return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
            case 'done': return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'blocked': return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            default: return new vscode.ThemeIcon('circle-outline');
        }
    }
}
```

## Registration in extension.ts

```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
    // Create provider instance
    const ticketsProvider = new TicketsTreeDataProvider();
    
    // Register with VS Code
    const ticketsTree = vscode.window.createTreeView('coe-tickets', {
        treeDataProvider: ticketsProvider,
        showCollapseAll: true
    });
    
    // Add to subscriptions for cleanup
    context.subscriptions.push(ticketsTree);
    
    // Register refresh command (optional)
    context.subscriptions.push(
        vscode.commands.registerCommand('coe.refreshTickets', () => {
            ticketsProvider.refresh();
        })
    );
}
```

## package.json Configuration

```json
{
    "contributes": {
        "viewsContainers": {
            "activitybar": [
                {
                    "id": "coe-sidebar",
                    "title": "COE",
                    "icon": "media/icon.svg"
                }
            ]
        },
        "views": {
            "coe-sidebar": [
                {
                    "id": "coe-tickets",
                    "name": "Tickets"
                },
                {
                    "id": "coe-agents",
                    "name": "Agents"
                }
            ]
        },
        "commands": [
            {
                "command": "coe.refreshTickets",
                "title": "Refresh Tickets",
                "icon": "$(refresh)"
            }
        ],
        "menus": {
            "view/title": [
                {
                    "command": "coe.refreshTickets",
                    "when": "view == coe-tickets",
                    "group": "navigation"
                }
            ]
        }
    }
}
```

## Context Menus (Right-Click Actions)

```typescript
// TreeItem with context value
export class TicketTreeItem extends vscode.TreeItem {
    constructor(ticket: Ticket) {
        super(ticket.title);
        this.contextValue = 'ticket'; // Enables targeting in menus
    }
}

// package.json menu configuration
{
    "menus": {
        "view/item/context": [
            {
                "command": "coe.processTicket",
                "when": "view == coe-tickets && viewItem == ticket",
                "group": "processing@1"
            },
            {
                "command": "coe.deleteTicket",
                "when": "view == coe-tickets && viewItem == ticket",
                "group": "management@2"
            }
        ]
    }
}

// Command handler in extension.ts
context.subscriptions.push(
    vscode.commands.registerCommand('coe.processTicket', async (item: TicketTreeItem) => {
        const orchestrator = getOrchestratorInstance();
        await orchestrator.processTicket(item.ticket.id);
        
        vscode.window.showInformationMessage(`Processing ticket: ${item.ticket.title}`);
    })
);
```

## Collapsible Trees (Parent-Child)

```typescript
export class AgentsTreeDataProvider implements vscode.TreeDataProvider<AgentTreeItem> {
    async getChildren(element?: AgentTreeItem): Promise<AgentTreeItem[]> {
        if (!element) {
            // Root level: agent categories
            return [
                new AgentTreeItem('Planning Agent', vscode.TreeItemCollapsibleState.Collapsed, [
                    new AgentTreeItem('Status: Active', vscode.TreeItemCollapsibleState.None),
                    new AgentTreeItem('Tasks: 3', vscode.TreeItemCollapsibleState.None)
                ])
            ];
        }
        
        // Return children of element
        return element.children || [];
    }
}

export class AgentTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly children?: AgentTreeItem[]
    ) {
        super(label, collapsibleState);
    }
}
```

## Auto-Refresh Pattern with Services

```typescript
export class TicketsTreeDataProvider implements vscode.TreeDataProvider<TicketTreeItem> {
    constructor() {
        // Pattern 1: Service event listeners
        onTicketChange(() => this.refresh());
        
        // Pattern 2: Watch configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('coe.autoProcessTickets')) {
                this.refresh();
            }
        });
        
        // Pattern 3: Periodic refresh (use sparingly)
        setInterval(() => {
            this.refresh();
        }, 30000); // Every 30 seconds
    }
}
```

## Dynamic Icons and Colors

```typescript
private getIconForAgent(status: string): vscode.ThemeIcon {
    const iconMap: Record<string, { icon: string, color: string }> = {
        'active': { icon: 'pulse', color: 'charts.green' },
        'idle': { icon: 'circle-outline', color: 'charts.gray' },
        'error': { icon: 'error', color: 'charts.red' },
        'processing': { icon: 'sync~spin', color: 'charts.yellow' }
    };
    
    const config = iconMap[status] || iconMap['idle'];
    return new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
}
```

**Available Codicons**: https://microsoft.github.io/vscode-codicons/dist/codicon.html

## Common Patterns

### 1. Loading State

```typescript
async getChildren(): Promise<TreeItem[]> {
    try {
        const data = await fetchData();
        
        if (data.length === 0) {
            return [this.createEmptyStateItem()];
        }
        
        return data.map(item => new MyTreeItem(item));
    } catch (error: unknown) {
        return [this.createErrorStateItem(error)];
    }
}

private createEmptyStateItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('No items found');
    item.description = 'Click + to add one';
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
}

private createErrorStateItem(error: unknown): vscode.TreeItem {
    const msg = error instanceof Error ? error.message : String(error);
    const item = new vscode.TreeItem('Error loading data');
    item.description = msg;
    item.iconPath = new vscode.ThemeIcon('error');
    return item;
}
```

### 2. Toggle Items (Enable/Disable)

```typescript
export class ToggleTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        private enabled: boolean,
        private onToggle: () => void
    ) {
        super(label);
        
        this.description = enabled ? 'Enabled' : 'Disabled';
        this.iconPath = new vscode.ThemeIcon(
            enabled ? 'check' : 'circle-slash',
            new vscode.ThemeColor(enabled ? 'charts.green' : 'charts.red')
        );
        
        this.command = {
            command: 'coe.toggleItem',
            title: 'Toggle',
            arguments: [this]
        };
    }
}

// In extension.ts
context.subscriptions.push(
    vscode.commands.registerCommand('coe.toggleItem', (item: ToggleTreeItem) => {
        item.onToggle();
        provider.refresh(); // Re-render tree
    })
);
```

## Common Mistakes

❌ **Don't**: Forget to call `fire()` on EventEmitter
```typescript
refresh(): void {
    // BAD - tree won't update
    this._onDidChangeTreeData;
}
```

✅ **Do**: Always fire the event
```typescript
refresh(): void {
    this._onDidChangeTreeData.fire();
}
```

❌ **Don't**: Create new EventEmitter on each call
```typescript
// BAD - creates new emitter each time
get onDidChangeTreeData() {
    return new vscode.EventEmitter<void>().event;
}
```

✅ **Do**: Create once, expose event property
```typescript
private _onDidChangeTreeData = new vscode.EventEmitter<void>();
readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
```

❌ **Don't**: Call refresh() in tight loops
```typescript
// BAD - causes excessive re-renders
for (const ticket of tickets) {
    await updateTicket(ticket.id);
    provider.refresh(); // Don't refresh per item!
}
```

✅ **Do**: Batch updates, then refresh once
```typescript
// GOOD - single refresh after all updates
for (const ticket of tickets) {
    await updateTicket(ticket.id);
}
provider.refresh();
```

## Related Skills
- **[01-coe-architecture.md](01-coe-architecture.md)** - Event-driven UI updates
- **[09-vscode-api-patterns.md](09-vscode-api-patterns.md)** - Command registration
- **[04-jsdoc-style.md](04-jsdoc-style.md)** - Documentation
