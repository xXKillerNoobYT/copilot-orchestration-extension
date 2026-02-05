# Database Pattern

**Purpose**: SQLite with in-memory fallback and EventEmitter integration  
**Related Files**: `src/services/ticketDb.ts`  
**Keywords**: sqlite, database, in-memory, fallback, migration, eventEmitter

## Database Architecture

COE uses SQLite with automatic fallback to in-memory storage:

```
┌─────────────────────────┐
│ Try SQLite on disk      │
│ (.coe/tickets.db)       │
└───────────┬─────────────┘
            │
            ├─ Success → Use SQLite
            │
            └─ Failure → Fallback to in-memory Map
                         (data not persisted)
```

## TicketDb Service Pattern

```typescript
// src/services/ticketDb.ts

import { EventEmitter } from 'events';

class TicketDatabase {
    private db: any = null;
    private inMemoryStore: Map<string, Ticket> | null = null;
    private isInMemoryMode: boolean = false;
    private _changeEmitter = new EventEmitter();
    private dbPath: string | null = null;
    
    /**
     * Initialize database with automatic fallback.
     * 
     * **Simple explanation**: Like trying to save to a USB drive first,
     * then falling back to RAM if the USB doesn't work. One way or another,
     * we successfully start up - never fail activation.
     */
    async init(context: vscode.ExtensionContext): Promise<void> {
        const workspaceRoot = getWorkspaceRoot();
        
        if (!workspaceRoot) {
            logWarn('No workspace opened, using in-memory storage');
            await this.initializeInMemory();
            return;
        }
        
        const coeDir = path.join(workspaceRoot, '.coe');
        this.dbPath = path.join(coeDir, 'tickets.db');
        
        // Try SQLite first
        try {
            await this.tryInitializeSQLite(context);
            this.isInMemoryMode = false;
            logInfo('TicketDb using SQLite persistence');
        } catch (sqliteError: unknown) {
            const msg = sqliteError instanceof Error ? sqliteError.message : String(sqliteError);
            logWarn(`SQLite init failed (${msg}), falling back to in-memory`);
            
            // Fallback to in-memory
            await this.initializeInMemory();
            this.isInMemoryMode = true;
            logInfo('TicketDb using in-memory storage (data will not persist)');
        }
    }
    
    private async tryInitializeSQLite(context: vscode.ExtensionContext): Promise<void> {
        const sqlite3 = require('sqlite3').verbose();
        
        // Create .coe directory if missing
        const coeDir = path.dirname(this.dbPath!);
        if (!fs.existsSync(coeDir)) {
            fs.mkdirSync(coeDir, { recursive: true });
        }
        
        // Open database
        this.db = await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath!, (err: any) => {
                if (err) reject(err);
                else resolve(db);
            });
        });
        
        // Create tables
        await this.runSQL(`
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                type TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                description TEXT,
                conversationHistory TEXT
            )
        `);
        
        // Run migrations
        await this.runMigrations();
    }
    
    private async initializeInMemory(): Promise<void> {
        this.inMemoryStore = new Map();
    }
}
```

## Migration Pattern

```typescript
/**
 * Run database migrations for schema changes.
 * 
 * **Simple explanation**: Like updating an app. We check what version
 * the database is at, then apply any missing updates to bring it current.
 */
private async runMigrations(): Promise<void> {
    // Check if columns exist before adding (idempotent migrations)
    const columns = await this.querySQL("PRAGMA table_info(tickets)");
    
    // Migration 1: Add type column
    const hasTypeColumn = columns.some((col: any) => col.name === 'type');
    if (!hasTypeColumn) {
        logInfo('[Migration] Adding type column to tickets table');
        await this.runSQL('ALTER TABLE tickets ADD COLUMN type TEXT');
    }
    
    // Migration 2: Add conversationHistory column
    const hasConversationColumn = columns.some((col: any) => col.name === 'conversationHistory');
    if (!hasConversationColumn) {
        logInfo('[Migration] Adding conversationHistory column to tickets table');
        await this.runSQL('ALTER TABLE tickets ADD COLUMN conversationHistory TEXT');
    }
    
    logInfo('[Migration] All migrations applied');
}
```

## CRUD Operations with Dual Storage

```typescript
/**
 * Create ticket in database (SQLite or in-memory).
 * 
 * @param ticket - Partial ticket (without id, timestamps)
 * @returns Complete ticket with generated fields
 */
async createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    if (this.isInMemoryMode) {
        return this.createTicketInMemory(ticket);
    }
    return this.createTicketSQLite(ticket);
}

private async createTicketSQLite(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    const id = `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullTicket: Ticket = {
        id,
        title: ticket.title,
        status: ticket.status || 'open',
        type: ticket.type,
        createdAt: now,
        updatedAt: now,
        description: ticket.description,
        conversationHistory: ticket.conversationHistory
    };
    
    await this.runSQL(
        `INSERT INTO tickets (id, title, status, type, createdAt, updatedAt, description, conversationHistory)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            fullTicket.id,
            fullTicket.title,
            fullTicket.status,
            fullTicket.type || null,
            fullTicket.createdAt,
            fullTicket.updatedAt,
            fullTicket.description || null,
            fullTicket.conversationHistory || null
        ]
    );
    
    // Emit change event (triggers UI refresh)
    this._changeEmitter.emit('change');
    
    logInfo(`[TicketDb] Created ticket: ${fullTicket.id}`);
    return fullTicket;
}

private async createTicketInMemory(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    const id = `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullTicket: Ticket = {
        id,
        title: ticket.title,
        status: ticket.status || 'open',
        type: ticket.type,
        createdAt: now,
        updatedAt: now,
        description: ticket.description,
        conversationHistory: ticket.conversationHistory
    };
    
    this.inMemoryStore!.set(id, fullTicket);
    this._changeEmitter.emit('change');
    
    logInfo(`[TicketDb] Created ticket (in-memory): ${fullTicket.id}`);
    return fullTicket;
}

/**
 * List all tickets (sorted by createdAt desc).
 */
async listTickets(): Promise<Ticket[]> {
    if (this.isInMemoryMode) {
        const tickets = Array.from(this.inMemoryStore!.values());
        // Sort by createdAt descending (newest first)
        return tickets.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
    
    const rows = await this.querySQL('SELECT * FROM tickets ORDER BY createdAt DESC');
    return rows.map(row => this.rowToTicket(row));
}

/**
 * Update ticket by ID.
 */
async updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket> {
    if (this.isInMemoryMode) {
        return this.updateTicketInMemory(id, updates);
    }
    return this.updateTicketSQLite(id, updates);
}

/**
 * Delete ticket by ID.
 */
async deleteTicket(id: string): Promise<void> {
    if (this.isInMemoryMode) {
        this.inMemoryStore!.delete(id);
    } else {
        await this.runSQL('DELETE FROM tickets WHERE id = ?', [id]);
    }
    
    this._changeEmitter.emit('change');
    logInfo(`[TicketDb] Deleted ticket: ${id}`);
}
```

## SQL Helper Methods

```typescript
/**
 * Run SQL command (INSERT, UPDATE, DELETE).
 */
private async runSQL(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
        this.db.run(sql, params, (err: any) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Query SQL (SELECT).
 */
private async querySQL(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err: any, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

/**
 * Convert database row to Ticket object.
 */
private rowToTicket(row: any): Ticket {
    return {
        id: row.id,
        title: row.title,
        status: row.status,
        type: row.type || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        description: row.description || undefined,
        conversationHistory: row.conversationHistory || undefined
    };
}
```

## EventEmitter Integration

```typescript
/**
 * Register listener for ticket changes.
 * 
 * **Simple explanation**: Like subscribing to notifications. When any ticket
 * changes (create, update, delete), all registered listeners get notified
 * so they can refresh their UI.
 */
export function onTicketChange(listener: () => void): void {
    const db = getTicketDbInstance();
    db._changeEmitter.on('change', listener);
}

// Usage in UI providers
constructor() {
    onTicketChange(() => {
        this.refresh(); // Auto-refresh tree view
    });
}
```

## Backup and Export

```typescript
/**
 * Export all tickets to JSON file.
 * 
 * @param filePath - Destination file path
 */
async exportTickets(filePath: string): Promise<void> {
    const tickets = await this.listTickets();
    const json = JSON.stringify(tickets, null, 2);
    
    fs.writeFileSync(filePath, json, 'utf-8');
    logInfo(`[TicketDb] Exported ${tickets.length} tickets to ${filePath}`);
}

/**
 * Import tickets from JSON file.
 * 
 * @param filePath - Source file path
 */
async importTickets(filePath: string): Promise<void> {
    const json = fs.readFileSync(filePath, 'utf-8');
    const tickets: Ticket[] = JSON.parse(json);
    
    for (const ticket of tickets) {
        await this.createTicket({
            title: ticket.title,
            status: ticket.status,
            type: ticket.type,
            description: ticket.description,
            conversationHistory: ticket.conversationHistory
        });
    }
    
    logInfo(`[TicketDb] Imported ${tickets.length} tickets from ${filePath}`);
}
```

## Transaction Support (SQLite Only)

```typescript
/**
 * Execute multiple operations in a transaction.
 * 
 * **Simple explanation**: Like a shopping cart checkout. All operations
 * succeed together, or all fail together - no partial completion.
 */
async transaction(operations: () => Promise<void>): Promise<void> {
    if (this.isInMemoryMode) {
        // In-memory doesn't need transactions (single-threaded)
        await operations();
        return;
    }
    
    try {
        await this.runSQL('BEGIN TRANSACTION');
        await operations();
        await this.runSQL('COMMIT');
    } catch (error: unknown) {
        await this.runSQL('ROLLBACK');
        throw error;
    }
}

// Usage
await ticketDb.transaction(async () => {
    await ticketDb.createTicket({ title: 'Task 1' });
    await ticketDb.createTicket({ title: 'Task 2' });
    await ticketDb.createTicket({ title: 'Task 3' });
});
```

## Common Mistakes

❌ **Don't**: Throw if SQLite fails
```typescript
// BAD - extension fails to activate
async init() {
    const db = new sqlite3.Database(dbPath);
    // If this throws, extension crashes!
}
```

✅ **Do**: Fallback to in-memory
```typescript
// GOOD - always succeeds
async init() {
    try {
        await this.tryInitializeSQLite();
    } catch (error: unknown) {
        await this.initializeInMemory();
    }
}
```

❌ **Don't**: Forget to emit change events
```typescript
// BAD - UI won't refresh
async createTicket(ticket) {
    this.inMemoryStore.set(id, ticket);
    // Missing: this._changeEmitter.emit('change');
}
```

✅ **Do**: Always emit after modifications
```typescript
// GOOD - UI auto-refreshes
async createTicket(ticket) {
    this.inMemoryStore.set(id, ticket);
    this._changeEmitter.emit('change');
}
```

❌ **Don't**: Run migrations every time
```typescript
// BAD - adds column repeatedly
async runMigrations() {
    await this.runSQL('ALTER TABLE tickets ADD COLUMN type TEXT');
}
```

✅ **Do**: Check if migration already applied
```typescript
// GOOD - idempotent migrations
async runMigrations() {
    const columns = await this.querySQL("PRAGMA table_info(tickets)");
    if (!columns.some(col => col.name === 'type')) {
        await this.runSQL('ALTER TABLE tickets ADD COLUMN type TEXT');
    }
}
```

## Related Skills
- **[02-service-patterns.md](02-service-patterns.md)** - Singleton database service
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Graceful fallback
- **[05-treeview-providers.md](05-treeview-providers.md)** - EventEmitter integration
