# COE Architecture Pattern

**Purpose**: Understand COE's 3-layer architecture, singleton pattern, and event-driven updates  
**Related Files**: `src/extension.ts`, `src/services/*.ts`, `src/ui/*.ts`  
**Keywords**: architecture, singleton, event-driven, layers, separation

## 3-Layer Architecture

COE follows strict layer separation to prevent coupling:

```
┌─────────────────────────────────────┐
│ UI Layer                            │
│ - TreeDataProviders                 │
│ - Webview Panels                    │
│ - Status Bar Items                  │
│ - Commands in extension.ts          │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ Services Layer (Singletons)         │
│ - orchestrator.ts                   │
│ - ticketDb.ts                       │
│ - llmService.ts                     │
│ - config/index.ts                   │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ Integration Layer                   │
│ - mcpServer/ (JSON-RPC)             │
│ - agents/ (answerAgent, etc.)       │
└─────────────────────────────────────┘
```

### Key Principle
**UI components NEVER directly touch integration layer** - always route through services.

## Singleton Pattern (Critical)

Every core service uses this exact pattern:

```typescript
// src/services/orchestrator.ts
let instance: Orchestrator | null = null;

export async function initializeOrchestrator(context: vscode.ExtensionContext): Promise<void> {
    if (instance !== null) {
        throw new Error('Orchestrator already initialized');
    }
    instance = new Orchestrator();
    await instance.init(context);
}

export function getOrchestratorInstance(): Orchestrator {
    if (!instance) {
        throw new Error('Orchestrator not initialized. Call initializeOrchestrator first.');
    }
    return instance;
}

// For tests only
export function resetOrchestratorForTests(): void {
    instance = null;
}
```

### Initialization Order (CRITICAL)

In `src/extension.ts activate()`, services MUST be initialized in this order:

```typescript
export async function activate(context: vscode.ExtensionContext) {
    // 1. Logger FIRST (other services need logging)
    initializeLogger(context);
    
    // 2. Config SECOND (services depend on config)
    await initializeConfig(context);
    
    // 3. Database
    await initializeTicketDb(context);
    
    // 4. LLM Service
    await initializeLLMService(context);
    
    // 5. Orchestrator (depends on all above)
    await initializeOrchestrator(context);
    
    // 6. UI providers (last)
    const agentsProvider = new AgentsTreeDataProvider();
    // ... register providers
}
```

## Event-Driven UI Updates

Services notify UI of changes using EventEmitter pattern:

```typescript
// src/services/ticketDb.ts
import { EventEmitter } from 'events';

class TicketDatabase {
    private _changeEmitter = new EventEmitter();
    
    async createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
        // ... create ticket in database
        this._changeEmitter.emit('change');
        return newTicket;
    }
}

export function onTicketChange(listener: () => void): void {
    const db = getTicketDbInstance();
    db._changeEmitter.on('change', listener);
}

// src/ui/ticketsTreeProvider.ts
import { onTicketChange } from '../services/ticketDb';

export class TicketsTreeDataProvider implements vscode.TreeDataProvider<TicketTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    constructor() {
        // Auto-refresh when tickets change
        onTicketChange(() => {
            this.refresh();
        });
    }
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
```

## Circular Dependency Workaround

**Problem**: Orchestrator needs to update status bar, but status bar is created in `extension.ts`.

**Solution**: `extension.ts` exports `updateStatusBar()` function:

```typescript
// src/extension.ts
let statusBarItem: vscode.StatusBarItem | null = null;

export async function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '$(pulse) COE Ready';
    statusBarItem.show();
}

export async function updateStatusBar(text: string, tooltip?: string): Promise<void> {
    if (statusBarItem) {
        statusBarItem.text = text;
        if (tooltip) statusBarItem.tooltip = tooltip;
    }
}

// src/services/orchestrator.ts
import { updateStatusBar } from '../extension';

async routeToPlanningAgent(task: string): Promise<string> {
    await updateStatusBar('$(loading~spin) Planning...', 'Planning Agent active');
    const result = await this.planningAgent.plan(task);
    await updateStatusBar('$(pulse) Ready', 'Idle');
    return result;
}
```

## Design Principles

1. ✅ **Separation of Concerns**: Each layer has clear responsibilities
2. ✅ **Loose Coupling**: Layers communicate through well-defined interfaces
3. ✅ **Testability**: Singletons can be reset for testing
4. ✅ **Event-Driven**: UI updates automatically via EventEmitter
5. ✅ **Fail-Safe**: Services can degrade gracefully (e.g., in-memory DB fallback)

## Common Mistakes

❌ **Don't**: Call agent methods directly from UI
```typescript
// BAD - UI directly calling agent
const plan = await answerAgent.ask('question');
```

✅ **Do**: Route through orchestrator service
```typescript
// GOOD - UI routes through service
const orchestrator = getOrchestratorInstance();
const plan = await orchestrator.routeToAnswerAgent('question');
```

❌ **Don't**: Initialize services in random order
```typescript
// BAD - orchestrator needs config to exist first
await initializeOrchestrator(context);
await initializeConfig(context); // Too late!
```

✅ **Do**: Follow documented initialization order
```typescript
// GOOD - config before services that depend on it
await initializeConfig(context);
await initializeOrchestrator(context);
```

## Related Skills
- **[02-service-patterns.md](02-service-patterns.md)** - Service implementation template
- **[05-treeview-providers.md](05-treeview-providers.md)** - UI layer patterns
- **[12-agent-coordination.md](12-agent-coordination.md)** - Orchestrator routing
