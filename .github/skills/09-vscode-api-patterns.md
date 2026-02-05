# VS Code API Patterns

**Purpose**: Common VS Code extension API patterns for commands, configuration, and UI  
**Related Files**: `src/extension.ts`, `package.json`  
**Keywords**: vscode, commands, configuration, status-bar, output-channel

## Command Registration

### package.json Declaration

```json
{
  "contributes": {
    "commands": [
      {
        "command": "coe.planTask",
        "title": "COE: Plan Task",
        "icon": "$(lightbulb)"
      },
      {
        "command": "coe.processTicket",
        "title": "COE: Process Ticket",
        "icon": "$(play)"
      }
    ]
  }
}
```

### Command Handler Registration

```typescript
// src/extension.ts

export async function activate(context: vscode.ExtensionContext) {
    // Register command handlers
    context.subscriptions.push(
        vscode.commands.registerCommand('coe.planTask', async () => {
            try {
                const orchestrator = getOrchestratorInstance();
                const plan = await orchestrator.routeToPlanningAgent('User task');
                vscode.window.showInformationMessage(`Plan created: ${plan.substring(0, 50)}...`);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to plan: ${msg}`);
            }
        })
    );
    
    // Command with arguments (from context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('coe.processTicket', async (item: TicketTreeItem) => {
            const ticketId = item.ticket.id;
            await processTicket(ticketId);
        })
    );
}
```

## Configuration Management

### Define Settings (package.json)

```json
{
  "contributes": {
    "configuration": {
      "title": "COE",
      "properties": {
        "coe.autoProcessTickets": {
          "type": "boolean",
          "default": false,
          "description": "Automatically process tickets when created (autonomous mode)"
        },
        "coe.enableResearchAgent": {
          "type": "boolean",
          "default": false,
          "description": "Enable Research Agent for deep dives (~10 min operations)"
        }
      }
    }
  }
}
```

### Read Configuration

```typescript
/**
 * Get COE configuration value.
 * 
 * **Simple explanation**: Like checking app settings on your phone.
 * We ask VS Code for the current value, with a fallback default if not set.
 * 
 * @param key - Configuration key (e.g., 'autoProcessTickets')
 * @param defaultValue - Fallback value if not configured
 * @returns Current configuration value
 */
function getCOEConfig<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration('coe');
    return config.get<T>(key, defaultValue);
}

// Usage
const autoProcess = getCOEConfig('autoProcessTickets', false);
const enableResearch = getCOEConfig('enableResearchAgent', false);
```

### Watch Configuration Changes

```typescript
export async function activate(context: vscode.ExtensionContext) {
    // React to config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('coe.autoProcessTickets')) {
                const newValue = getCOEConfig('autoProcessTickets', false);
                logInfo(`Auto-process mode changed: ${newValue}`);
                
                // Update UI
                agentsProvider.refresh();
            }
        })
    );
}
```

## Status Bar Integration

```typescript
// src/extension.ts

let statusBarItem: vscode.StatusBarItem | null = null;

export async function activate(context: vscode.ExtensionContext) {
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100 // Priority (higher = more left)
    );
    
    statusBarItem.text = '$(pulse) COE Ready';
    statusBarItem.tooltip = 'Copilot Orchestration Extension';
    statusBarItem.command = 'coe.showMenu'; // Click action
    statusBarItem.show();
    
    context.subscriptions.push(statusBarItem);
}

/**
 * Update status bar with current agent status.
 * 
 * **Simple explanation**: Status bar is like an elevator floor display.
 * Shows current state at a glance. We update it when agents start/stop.
 * 
 * @param text - Display text (with Codicon support)
 * @param tooltip - Hover tooltip
 */
export async function updateStatusBar(text: string, tooltip?: string): Promise<void> {
    if (statusBarItem) {
        statusBarItem.text = text;
        if (tooltip) {
            statusBarItem.tooltip = tooltip;
        }
    }
}

// Usage from services
await updateStatusBar('$(loading~spin) Planning...', 'Planning Agent active');
await updateStatusBar('$(pulse) Ready', 'Idle');
```

### Codicons for Status Bar

```typescript
// Available Codicons (https://microsoft.github.io/vscode-codicons/dist/codicon.html)
statusBarItem.text = '$(pulse) Ready';        // Heartbeat
statusBarItem.text = '$(loading~spin) Wait';  // Spinning loader
statusBarItem.text = '$(check) Done';         // Checkmark
statusBarItem.text = '$(error) Failed';       // Error symbol
statusBarItem.text = '$(warning) Warning';    // Warning triangle
statusBarItem.text = '$(sync~spin) Sync';     // Syncing animation
```

## Output Channel (Logging)

```typescript
// src/logger.ts

let outputChannel: vscode.OutputChannel | null = null;

export function initializeLogger(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('COE Logs');
    context.subscriptions.push(outputChannel);
}

/**
 * Log info message to VS Code Output panel.
 * 
 * **Simple explanation**: Like writing to a log file, but shows in VS Code's
 * Output panel instead. Users can view it by selecting "COE Logs" from dropdown.
 */
export function logInfo(message: string): void {
    const timestamp = new Date().toISOString();
    outputChannel?.appendLine(`[${timestamp}] [INFO] ${message}`);
}

export function logError(message: string): void {
    const timestamp = new Date().toISOString();
    outputChannel?.appendLine(`[${timestamp}] [ERROR] ${message}`);
}

export function logWarn(message: string): void {
    const timestamp = new Date().toISOString();
    outputChannel?.appendLine(`[${timestamp}] [WARN] ${message}`);
}

// Show output panel
export function showLogs(): void {
    outputChannel?.show();
}
```

## User Messages

```typescript
/**
 * Show information message with optional actions.
 * 
 * **Simple explanation**: Like a notification popup. Shows at bottom-right
 * of screen with optional buttons for user actions.
 */
async function notifyUser(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
        'Planning complete. Process ticket now?',
        'Yes',
        'No',
        'View Plan'
    );
    
    if (choice === 'Yes') {
        await processTicket();
    } else if (choice === 'View Plan') {
        await showPlan();
    }
}

// Warning message
vscode.window.showWarningMessage('LLM service unavailable, using fallback');

// Error message
vscode.window.showErrorMessage('Failed to create ticket: Invalid title');
```

## Input Prompts

```typescript
/**
 * Prompt user for input.
 * 
 * @returns User input or undefined if cancelled
 */
async function promptForTicketTitle(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
        prompt: 'Enter ticket title',
        placeHolder: 'Add user authentication',
        validateInput: (value: string) => {
            if (!value || value.trim().length === 0) {
                return 'Title cannot be empty';
            }
            if (value.length > 100) {
                return 'Title too long (max 100 characters)';
            }
            return null; // Valid
        }
    });
}

// Usage
const title = await promptForTicketTitle();
if (title) {
    await createTicket({ title });
}
```

## Quick Pick (Selection Menu)

```typescript
/**
 * Show selection menu to user.
 * 
 * **Simple explanation**: Like a dropdown menu. Shows list of options
 * for user to choose from.
 */
async function selectTicket(): Promise<Ticket | undefined> {
    const tickets = await listTickets();
    
    const items = tickets.map(ticket => ({
        label: ticket.title,
        description: ticket.status,
        detail: ticket.description?.substring(0, 100),
        ticket: ticket
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a ticket to process',
        matchOnDescription: true,
        matchOnDetail: true
    });
    
    return selected?.ticket;
}
```

## Context Menu Integration

### Menu Contributions (package.json)

```json
{
  "menus": {
    "view/title": [
      {
        "command": "coe.refreshTickets",
        "when": "view == coe-tickets",
        "group": "navigation"
      }
    ],
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
    ],
    "commandPalette": [
      {
        "command": "coe.processTicket",
        "when": "false"
      }
    ]
  }
}
```

**When clause conditions**:
- `view == coe-tickets` - Only show in tickets view
- `viewItem == ticket` - Only show for items with `contextValue = 'ticket'`
- `when: false` - Hide from command palette

## Extension Context Storage

```typescript
/**
 * Store data in extension context (persists across sessions).
 * 
 * **Simple explanation**: Like browser localStorage for extensions.
 * Data saved here survives VS Code restarts.
 */
async function saveLastUsedChatId(context: vscode.ExtensionContext, chatId: string): Promise<void> {
    await context.globalState.update('lastChatId', chatId);
}

async function getLastUsedChatId(context: vscode.ExtensionContext): Promise<string | undefined> {
    return context.globalState.get<string>('lastChatId');
}

// Workspace-specific storage (per-project)
await context.workspaceState.update('projectConfig', { setting: 'value' });
const projectConfig = context.workspaceState.get('projectConfig');
```

## File System Operations

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Get workspace root path.
 * 
 * @returns Absolute path to workspace folder or undefined
 */
function getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    return workspaceFolders[0].uri.fsPath;
}

/**
 * Read file from workspace.
 * 
 * @param relativePath - Path relative to workspace root
 * @returns File contents as string
 */
async function readWorkspaceFile(relativePath: string): Promise<string> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        throw new Error('No workspace opened');
    }
    
    const filePath = path.join(workspaceRoot, relativePath);
    const uri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(uri);
    
    return Buffer.from(content).toString('utf-8');
}

/**
 * Write file to workspace.
 */
async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        throw new Error('No workspace opened');
    }
    
    const filePath = path.join(workspaceRoot, relativePath);
    const uri = vscode.Uri.file(filePath);
    const buffer = Buffer.from(content, 'utf-8');
    
    await vscode.workspace.fs.writeFile(uri, buffer);
}
```

## Activation Events

```json
{
  "activationEvents": [
    "onStartupFinished",
    "onCommand:coe.planTask",
    "onView:coe-tickets"
  ]
}
```

**Activation triggers**:
- `onStartupFinished` - After VS Code fully loaded (recommended)
- `onCommand:X` - When command X invoked
- `onView:X` - When tree view X shown
- `*` - On VS Code startup (avoid - slows startup)

## Common Patterns

### Progress Notification

```typescript
await vscode.window.withProgress(
    {
        location: vscode.ProgressLocation.Notification,
        title: 'Processing ticket',
        cancellable: true
    },
    async (progress, token) => {
        progress.report({ increment: 0, message: 'Planning...' });
        await planTask();
        
        progress.report({ increment: 50, message: 'Executing...' });
        await executeTask();
        
        progress.report({ increment: 100, message: 'Done!' });
    }
);
```

### Open File in Editor

```typescript
async function openFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
}
```

## Common Mistakes

❌ **Don't**: Log to console.log (goes nowhere)
```typescript
// BAD - not visible to users
console.log('Debug message');
```

✅ **Do**: Use Output channel
```typescript
// GOOD - shows in Output panel
logInfo('Debug message');
```

❌ **Don't**: Show error without logging
```typescript
// BAD - user sees error but no debugging info
vscode.window.showErrorMessage('Failed');
```

✅ **Do**: Log then show
```typescript
// GOOD - logged for debugging
logError(`Operation failed: ${error.message}`);
vscode.window.showErrorMessage(`Failed: ${error.message}`);
```

## Related Skills
- **[05-treeview-providers.md](05-treeview-providers.md)** - TreeView registration
- **[01-coe-architecture.md](01-coe-architecture.md)** - Status bar pattern
- **[10-configuration-management.md](10-configuration-management.md)** - Config access
