# JSDoc Documentation Style

**Purpose**: COE's unique documentation pattern with beginner-friendly "Simple explanation"  
**Related Files**: All `src/**/*.ts` files  
**Keywords**: documentation, jsdoc, comments, simple explanation, metaphor

## Required JSDoc Pattern

**All public functions MUST include**:
1. Technical summary
2. **"Simple explanation"** with beginner-friendly analogy/metaphor
3. Parameter descriptions
4. Return value description

```typescript
/**
 * Brief technical summary of what the function does.
 * 
 * **Simple explanation**: Beginner-friendly analogy or metaphor explaining the concept.
 * 
 * @param paramName - Description of parameter
 * @returns Description of return value
 */
export async function myFunction(paramName: string): Promise<void> {
    // Implementation
}
```

## Real Examples from COE

### Example 1: Status Bar Update (extension.ts)

```typescript
/**
 * Update the status bar with new text and optional tooltip.
 * Called by orchestrator when planning/verification starts/completes.
 * 
 * **Simple explanation**: Status bar is like an elevator floor display.
 * We update the text to show current agent status (Planning..., Verifying..., Ready).
 * This lets users know what COE is doing at a glance.
 * 
 * @param text - The text to display in status bar (e.g., "Planning...")
 * @param tooltip - Optional hover tooltip with more details
 */
export async function updateStatusBar(text: string, tooltip?: string): Promise<void> {
    if (statusBarItem) {
        statusBarItem.text = text;
        if (tooltip) statusBarItem.tooltip = tooltip;
    }
}
```

### Example 2: TreeView Refresh (ticketsTreeProvider.ts)

```typescript
/**
 * Manually refresh the tickets tree view.
 * Triggers VS Code to call getChildren() again to rebuild the tree.
 * 
 * **Simple explanation**: Like hitting the refresh button on a web browser.
 * This tells VS Code "the data changed, please re-render the tree view."
 * EventEmitter is the notification system that makes it all automatic.
 * 
 * @returns void
 */
refresh(): void {
    this._onDidChangeTreeData.fire();
}
```

### Example 3: LLM Streaming (llmService.ts)

```typescript
/**
 * Stream LLM response with inactivity timeout protection.
 * Uses AbortController to cancel request if server stops sending data.
 * 
 * **Simple explanation**: AbortController is like a kill switch.
 * If the LLM server freezes and stops sending chunks for 60 seconds,
 * we flip the switch to cancel the request instead of waiting forever.
 * Like hanging up on a phone call when the other person goes silent.
 * 
 * @param prompt - User's question or task description
 * @param onChunk - Callback fired for each chunk of text received
 * @param onDone - Callback fired when streaming completes
 * @param options - Optional request configuration (timeout, temperature, etc.)
 * @returns LLMResponse with full content and token usage
 */
export async function streamLLM(
    prompt: string,
    onChunk: (chunk: string) => void,
    onDone?: (fullResponse: string) => void,
    options?: LLMRequestOptions
): Promise<LLMResponse> {
    // Implementation...
}
```

### Example 4: Singleton Getter (orchestrator.ts)

```typescript
/**
 * Get the singleton Orchestrator instance.
 * Throws error if called before initializeOrchestrator().
 * 
 * **Simple explanation**: Like asking for the manager at a store.
 * There's only one manager (singleton), and this function gets you that person.
 * If the manager hasn't arrived yet (not initialized), you get an error.
 * 
 * @returns The Orchestrator singleton instance
 * @throws Error if orchestrator not initialized
 */
export function getOrchestratorInstance(): Orchestrator {
    if (!instance) {
        throw new Error('Orchestrator not initialized. Call initializeOrchestrator first.');
    }
    return instance;
}
```

### Example 5: Ticket Creation (ticketDb.ts)

```typescript
/**
 * Create a new ticket in the database and emit change event.
 * Auto-generates ID, timestamps, and default values.
 * 
 * **Simple explanation**: Like filling out a trouble ticket at tech support.
 * You provide the title and description, we stamp it with a unique ID
 * and timestamp, then notify everyone watching (via EventEmitter)
 * that a new ticket arrived.
 * 
 * @param ticket - Partial ticket data (without id, createdAt, updatedAt)
 * @returns Complete ticket with generated fields
 */
async createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    // Implementation...
}
```

## Effective Metaphors & Analogies

### Good Metaphors Used in COE

| Technical Concept | Metaphor | Used In |
|------------------|----------|---------|
| Status bar | Elevator floor display | extension.ts |
| EventEmitter | Notification system / Auto-update alerts | ticketsTreeProvider.ts |
| AbortController | Kill switch | llmService.ts |
| fetch() | Asking internet for data | llmService.ts |
| Singleton | Store manager (only one exists) | orchestrator.ts |
| TreeView refresh | Browser refresh button | agentsTreeProvider.ts |
| Ticket creation | Tech support trouble ticket | ticketDb.ts |
| Token limit | Character limit on tweet/text | llmService.ts |
| Conversation pruning | Clearing old emails to save space | answerAgent.ts |

### Creating Good Metaphors

✅ **Do**:
- Use everyday objects/experiences (elevator, phone, browser)
- Explain **why** the pattern exists (prevent hanging, notify updates)
- Match complexity level (simpler concepts for basic functions)
- Be specific with the analogy (not just "it's like magic")

❌ **Don't**:
- Use technical jargon in "Simple explanation" section
- Create confusing or contradictory metaphors
- Skip the "Simple explanation" for public functions
- Use metaphors that require specialized knowledge

## Documentation for Complex Patterns

### Pattern with Multiple Concepts

```typescript
/**
 * Auto-refresh TreeView when ticket database changes.
 * Registers listener with ticketDb EventEmitter during construction.
 * 
 * **Simple explanation**: Imagine a security camera feed (TreeView) watching
 * a parking lot (ticket database). When a car arrives or leaves (ticket change),
 * the EventEmitter is like a motion sensor that triggers the camera to refresh
 * its display. You never manually update the screen - it happens automatically
 * when the database fires the 'change' event.
 * 
 * Setup: ticketDb.createTicket() → emits 'change' → onTicketChange() listener
 * → calls refresh() → fires _onDidChangeTreeData → VS Code rebuilds tree
 */
constructor() {
    onTicketChange(() => {
        this.refresh();
    });
}
```

### Pattern with Error Handling

```typescript
/**
 * Initialize SQLite database with automatic fallback to in-memory mode.
 * Attempts native SQLite first, falls back if initialization fails.
 * 
 * **Simple explanation**: Like trying to save a file to a USB drive.
 * First, we try the USB drive (SQLite on disk). If that fails (permissions,
 * missing driver, etc.), we automatically save to RAM instead (in-memory Map).
 * You lose persistence, but the app keeps working. We log a warning so you
 * know which mode was selected.
 * 
 * @param context - VS Code extension context for storage paths
 * @throws Never throws - always succeeds with in-memory fallback
 */
private async tryInitializeSQLite(context: vscode.ExtensionContext): Promise<void> {
    // Implementation...
}
```

## Inline Comments Best Practices

For complex logic blocks:

```typescript
export async function streamLLM(prompt: string, onChunk: (chunk: string) => void): Promise<LLMResponse> {
    const controller = new AbortController();
    let lastActivityTime = Date.now();
    
    // Inactivity timeout: abort if server silent for 60s
    const INACTIVITY_TIMEOUT_MS = 60000;
    
    // Check every 5s if we've received data recently
    const inactivityCheckInterval = setInterval(() => {
        const timeSinceLastActivity = Date.now() - lastActivityTime;
        
        if (timeSinceLastActivity > INACTIVITY_TIMEOUT_MS) {
            logWarn(`LLM stream inactive for ${timeSinceLastActivity/1000}s, aborting`);
            controller.abort(); // Kill switch activated
            clearInterval(inactivityCheckInterval);
        }
    }, 5000);
    
    try {
        const response = await fetch(endpoint, { signal: controller.signal });
        
        // Process Server-Sent Events (SSE) stream
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            lastActivityTime = Date.now(); // Reset timeout - we got data!
            
            // ... process chunk
        }
    } finally {
        clearInterval(inactivityCheckInterval); // Cleanup
    }
}
```

## Interface and Type Documentation

```typescript
/**
 * Ticket database record with conversation threading support.
 * 
 * **Simple explanation**: Like a support ticket system. Each ticket tracks
 * a task, who created it (ai_to_human or human_to_ai), current status,
 * and conversation history. Threads allow back-and-forth discussion on the ticket.
 */
export interface Ticket {
    /** Unique identifier (e.g., "TICKET-001") */
    id: string;
    
    /** Human-readable title/summary */
    title: string;
    
    /** Current lifecycle state */
    status: 'open' | 'in-progress' | 'done' | 'blocked' | 'pending';
    
    /** Who initiated: AI suggesting to human, or human commanding AI */
    type?: 'ai_to_human' | 'human_to_ai';
    
    /** ISO 8601 timestamp when created */
    createdAt: string;
    
    /** ISO 8601 timestamp of last modification */
    updatedAt: string;
    
    /** Detailed plan or description (often generated by Planning Agent) */
    description?: string;
    
    /** Conversation messages between human and AI */
    thread?: TicketThreadMessage[];
}
```

## Common Mistakes

❌ **Don't**: Skip "Simple explanation"
```typescript
/**
 * Updates the orchestrator queue.
 * @param task - Task to add
 */
async addTask(task: Task): Promise<void> {
    // Missing: Simple explanation!
}
```

✅ **Do**: Always include metaphor
```typescript
/**
 * Add task to orchestrator queue for processing.
 * 
 * **Simple explanation**: Like adding a customer to a waiting line at a deli.
 * Tasks are processed FIFO (first in, first out) - the queue ensures fairness.
 * 
 * @param task - Task to add to queue
 */
async addTask(task: Task): Promise<void> {
    // Implementation
}
```

❌ **Don't**: Use jargon in "Simple explanation"
```typescript
/**
 * **Simple explanation**: Invokes the dependency injection container
 * to resolve the singleton instance via lazy initialization pattern.
 */
```

✅ **Do**: Use everyday language
```typescript
/**
 * **Simple explanation**: Like asking for the manager - there's only one,
 * and this function finds them for you. If nobody's initialized the manager
 * yet, you get an error.
 */
```

## Related Skills
- **[02-service-patterns.md](02-service-patterns.md)** - Service documentation
- **[05-treeview-providers.md](05-treeview-providers.md)** - UI documentation
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Error docs
