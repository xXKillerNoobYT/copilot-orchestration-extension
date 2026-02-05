/**
 * Ticket Database Service
 * 
 * Provides persistent storage for tickets using SQLite with automatic
 * in-memory fallback if SQLite fails (permissions, missing native module).
 * 
 * Architecture:
 * - Primary: SQLite database at .coe/tickets.db
 * - Fallback: In-memory Map<string, Ticket>
 * - All methods are async (return Promises)
 * 
 * Usage:
 * 1. Call initializeTicketDb(context) in activate()
 * 2. Use createTicket(), getTicket(), listTickets()
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { logInfo, logWarn } from '../logger';
import { getConfigInstance } from '../config';

// Ticket interface - defines what a ticket looks like
export interface TicketThreadMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
    status?: 'reviewing' | 'planning' | 'needs-approval' | 'blocked';
}

export interface Ticket {
    id: string;           // Unique ID (e.g., "TICKET-001")
    title: string;        // Short description
    status: 'open' | 'in-progress' | 'done' | 'blocked' | 'pending' | 'in_review' | 'resolved' | 'rejected' | 'escalated';
    type?: 'ai_to_human' | 'human_to_ai' | 'answer_agent'; // Optional ticket type for routing
    createdAt: string;    // ISO timestamp (e.g., "2026-02-01T10:30:00Z")
    updatedAt: string;    // ISO timestamp
    description?: string; // Optional long description
    conversationHistory?: string; // Optional serialized Answer Agent history (JSON)
    thread?: TicketThreadMessage[]; // Optional threaded conversation messages
    priority: number;      // Priority level (e.g., 1-5)
    creator: string;      // Creator of the ticket
    assignee: string | null; // Assignee of the ticket
    taskId: string | null; // Task ID
    version: number;      // Version of the ticket
    resolution: string | null; // Resolution of the ticket
}

// Database abstraction - works with SQLite OR in-memory
class TicketDatabase {
    private dbPath: string | null = null;
    private db: any = null; // SQLite database instance
    private inMemoryStore: Map<string, Ticket> | null = null;
    private isInMemoryMode: boolean = false;
    private _changeEmitter = new EventEmitter(); // EventEmitter = notification system to auto-update sidebar when data changes

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        // Step 1: Read dbPath from config (or use default)
        // Now using central config system
        const config = getConfigInstance();
        const dbPathFromConfig = config.tickets.dbPath;

        // Step 2: Resolve absolute path (relative to extension root)
        this.dbPath = path.resolve(context.extensionPath, dbPathFromConfig);

        // Step 3: Ensure .coe directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Step 4: Try to initialize SQLite
        await this.tryInitializeSQLite();
    }

    private async tryInitializeSQLite(): Promise<void> {
        try {
            // Import sqlite3 (might fail if native module not built)
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const sqlite3 = require('sqlite3').verbose();

            // Open database (creates file if doesn't exist)
            this.db = await new Promise((resolve, reject) => {
                const db = new sqlite3.Database(this.dbPath!, (err: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(db);
                    }
                });
            });

            // Create tickets table if not exists
            await this.runSQL(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    type TEXT,
                    thread TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    description TEXT,
                    conversationHistory TEXT,
                    priority INTEGER DEFAULT 2,
                    creator TEXT DEFAULT 'system',
                    assignee TEXT DEFAULT 'Clarity Agent',
                    taskId TEXT,
                    version INTEGER DEFAULT 1,
                    resolution TEXT
                )
            `);

            // Migration: Add type column to existing tables that don't have it
            // Uses PRAGMA table_info to check if column exists, adds it if missing
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasTypeColumn = columns.some((col: any) => col.name === 'type');

                if (!hasTypeColumn) {
                    logInfo('Migrating tickets table: adding type column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN type TEXT');
                    logInfo('Migration complete: type column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add conversationHistory column for Answer Agent persistence
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasConversationHistoryColumn = columns.some(
                    (col: any) => col.name === 'conversationHistory'
                );

                if (!hasConversationHistoryColumn) {
                    logInfo('Migrating tickets table: adding conversationHistory column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN conversationHistory TEXT');
                    logInfo('Migration complete: conversationHistory column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add thread column for ticket-based conversation threads
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasThreadColumn = columns.some(
                    (col: any) => col.name === 'thread'
                );

                if (!hasThreadColumn) {
                    logInfo('Migrating tickets table: adding thread column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN thread TEXT');
                    logInfo('Migration complete: thread column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add priority column
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasPriorityColumn = columns.some((col: any) => col.name === 'priority');

                if (!hasPriorityColumn) {
                    logInfo('Migrating tickets table: adding priority column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN priority INTEGER DEFAULT 2');
                    logInfo('Migration complete: priority column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add creator column
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasCreatorColumn = columns.some((col: any) => col.name === 'creator');

                if (!hasCreatorColumn) {
                    logInfo('Migrating tickets table: adding creator column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN creator TEXT DEFAULT "system"');
                    logInfo('Migration complete: creator column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add assignee column
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasAssigneeColumn = columns.some((col: any) => col.name === 'assignee');

                if (!hasAssigneeColumn) {
                    logInfo('Migrating tickets table: adding assignee column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN assignee TEXT DEFAULT "Clarity Agent"');
                    logInfo('Migration complete: assignee column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add taskId column
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasTaskIdColumn = columns.some((col: any) => col.name === 'taskId');

                if (!hasTaskIdColumn) {
                    logInfo('Migrating tickets table: adding taskId column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN taskId TEXT');
                    logInfo('Migration complete: taskId column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add version column
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasVersionColumn = columns.some((col: any) => col.name === 'version');

                if (!hasVersionColumn) {
                    logInfo('Migrating tickets table: adding version column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN version INTEGER DEFAULT 1');
                    logInfo('Migration complete: version column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            // Migration: Add resolution column
            try {
                const columns = await this.querySQL("PRAGMA table_info(tickets)");
                const hasResolutionColumn = columns.some((col: any) => col.name === 'resolution');

                if (!hasResolutionColumn) {
                    logInfo('Migrating tickets table: adding resolution column');
                    await this.runSQL('ALTER TABLE tickets ADD COLUMN resolution TEXT');
                    logInfo('Migration complete: resolution column added');
                }
            } catch (migrationErr) {
                logWarn(`Migration check failed (${migrationErr}), continuing anyway`);
            }

            await this.ensureTicketSchema();
            logInfo(`Ticket DB initialized: SQLite at ${this.dbPath}`);
            this.isInMemoryMode = false;
        } catch (err) {
            logWarn(`SQLite init failed (${err}), using in-memory fallback`);
            this.fallbackToInMemory();
        }
    }

    private fallbackToInMemory(): void {
        this.db = null;
        this.inMemoryStore = new Map<string, Ticket>();
        this.isInMemoryMode = true;
        logInfo('Ticket DB initialized: In-memory mode');
    }

    // Helper: Run SQL command (wrap in Promise)
    private async runSQL(sql: string, params: any[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, (err: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Helper: Query SQL (get all rows)
    private async querySQL(sql: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err: any, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Helper: Query SQL (get one row)
    private async getSQL(sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err: any, row: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Ensures the tickets table schema is up-to-date, adding missing columns as needed.
     *
     * **Simple explanation**: Checks the database for missing fields and adds them if needed, so the table always has the right columns.
     */
    private async ensureTicketSchema(): Promise<void> {
        const columns = await this.querySQL("PRAGMA table_info(tickets)");
        const migrations = [
            { name: 'priority', type: 'INTEGER', default: '2' },
            { name: 'creator', type: 'TEXT', default: "'system'" },
            { name: 'assignee', type: 'TEXT', default: "'Clarity Agent'" },
            { name: 'taskId', type: 'TEXT', default: null },
            { name: 'version', type: 'INTEGER', default: '1' },
            { name: 'resolution', type: 'TEXT', default: null }
        ];
        for (const { name, type, default: def } of migrations) {
            if (!columns.some((col: any) => col.name === name)) {
                const defClause = def !== null ? ` DEFAULT ${def}` : '';
                await this.runSQL(`ALTER TABLE tickets ADD COLUMN ${name} ${type}${defClause}`);
            }
        }
    }

    async createTicket(data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
        const now = new Date().toISOString();
        const id = `TICKET-${Date.now()}`; // Simple ID generation

        const ticket: Ticket = {
            id,
            title: data.title,
            status: data.status,
            type: data.type,
            description: data.description,
            conversationHistory: data.conversationHistory,
            thread: data.thread,
            createdAt: now,
            updatedAt: now,
            priority: data.priority || 2,
            creator: data.creator || 'system',
            assignee: data.assignee || 'Clarity Agent',
            taskId: data.taskId || null,
            version: data.version || 1,
            resolution: data.resolution || null,
        };

        if (this.isInMemoryMode) {
            this.inMemoryStore!.set(id, ticket);
        } else {
            await this.runSQL(
                `INSERT INTO tickets (id, title, status, type, description, conversationHistory, thread, createdAt, updatedAt, priority, creator, assignee, taskId, version, resolution)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ticket.id,
                    ticket.title,
                    ticket.status,
                    ticket.type || null,
                    ticket.description || null,
                    ticket.conversationHistory || null,
                    ticket.thread ? JSON.stringify(ticket.thread) : null,
                    ticket.createdAt,
                    ticket.updatedAt,
                    ticket.priority || 2,
                    ticket.creator || 'system',
                    ticket.assignee || 'Clarity Agent',
                    ticket.taskId || null,
                    ticket.version || 1,
                    ticket.resolution || null,
                ]
            );
        }

        logInfo(`Created ticket: ${id}`);
        logInfo('Emitting change event to refresh sidebar'); // EventEmitter = notification system to auto-update sidebar
        this._changeEmitter.emit('change'); // Emit 'change' event = notify listeners (e.g., sidebar) that data changed
        return ticket;
    }

    async updateTicket(id: string, updates: Partial<Omit<Ticket, 'id' | 'createdAt'>>): Promise<Ticket | null> {
        const existing = await this.getTicket(id);
        if (!existing) {
            logWarn(`Ticket ${id} not found for update`);
            return null;
        }

        // Defensive check for data corruption
        if (!existing.createdAt) {
            logWarn(`Ticket ${id} exists but has null createdAt - data may be corrupted`);
            throw new Error(`Cannot update ticket ${id}: createdAt is missing`);
        }

        const now = new Date().toISOString();
        const updated: Ticket = {
            ...existing,
            ...updates,
            id: existing.id, // Never change ID
            createdAt: existing.createdAt, // Never change createdAt
            updatedAt: now, // Auto-update timestamp
        };

        if (this.isInMemoryMode) {
            this.inMemoryStore!.set(id, updated);
        } else {
            // SQLite UPDATE SET query
            await this.runSQL(
                `UPDATE tickets
                 SET title = ?, status = ?, description = ?, type = ?, conversationHistory = ?, thread = ?, updatedAt = ?
                 WHERE id = ?`,
                [
                    updated.title,
                    updated.status,
                    updated.description || null,
                    updated.type || null,
                    updated.conversationHistory || null,
                    updated.thread ? JSON.stringify(updated.thread) : null,
                    updated.updatedAt,
                    id
                ]
            );
        }

        logInfo(`Updated ticket: ${id}`);
        logInfo('Emitting change event to refresh sidebar'); // EventEmitter = notification system to auto-update sidebar
        this._changeEmitter.emit('change'); // Notify listeners of the change
        return updated;
    }

    // onTicketChange = register a listener that gets called when tickets change (create/update)
    onTicketChange(listener: () => void): void {
        this._changeEmitter.on('change', listener);
    }

    async getTicket(id: string): Promise<Ticket | null> {
        if (this.isInMemoryMode) {
            return this.inMemoryStore!.get(id) || null;
        } else {
            const row = await this.getSQL(`SELECT * FROM tickets WHERE id = ?`, [id]);
            return row ? this.rowToTicket(row) : null;
        }
    }

    async listTickets(): Promise<Ticket[]> {
        if (this.isInMemoryMode) {
            return Array.from(this.inMemoryStore!.values());
        } else {
            const rows = await this.querySQL(`SELECT * FROM tickets ORDER BY createdAt DESC`);
            return rows.map(r => this.rowToTicket(r));
        }
    }

    private rowToTicket(row: any): Ticket {
        let parsedThread: TicketThreadMessage[] | undefined = undefined;
        if (row.thread) {
            try {
                parsedThread = JSON.parse(row.thread) as TicketThreadMessage[];
            } catch (error) {
                logWarn(`Failed to parse thread for ticket ${row.id}: ${error}`);
            }
        }

        return {
            id: row.id,
            title: row.title,
            status: row.status,
            type: row.type || undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            description: row.description || undefined,
            conversationHistory: row.conversationHistory || undefined,
            thread: parsedThread,
            priority: row.priority || 2,
            creator: row.creator || 'system',
            assignee: row.assignee || 'Clarity Agent',
            taskId: row.taskId || null,
            version: row.version || 1,
            resolution: row.resolution || null,
        };
    }

    resetForTests(): void {
        if (this.inMemoryStore) {
            this.inMemoryStore.clear();
        }
    }
}

// Singleton instance (only one DB per extension)
let dbInstance: TicketDatabase | null = null;

// Initialize the database (called once from activate())
export async function initializeTicketDb(context: vscode.ExtensionContext): Promise<void> {
    if (dbInstance) {
        logWarn('TicketDb already initialized');
        return;
    }

    dbInstance = new TicketDatabase();
    await dbInstance.initialize(context);
}

// Create a new ticket
export async function createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    if (!dbInstance) {
        throw new Error('TicketDb not initialized. Call initializeTicketDb() first.');
    }
    return dbInstance.createTicket(ticket);
}

// Get ticket by ID
export async function getTicket(id: string): Promise<Ticket | null> {
    if (!dbInstance) {
        throw new Error('TicketDb not initialized');
    }
    return dbInstance.getTicket(id);
}

// List all tickets
export async function listTickets(): Promise<Ticket[]> {
    if (!dbInstance) {
        throw new Error('TicketDb not initialized');
    }
    return dbInstance.listTickets();
}

// Update ticket with partial changes
export async function updateTicket(id: string, updates: Partial<Omit<Ticket, 'id' | 'createdAt'>>): Promise<Ticket | null> {
    if (!dbInstance) {
        throw new Error('TicketDb not initialized');
    }
    return dbInstance.updateTicket(id, updates);
}

// Register listener for ticket changes (create/update events)
export function onTicketChange(listener: () => void): void {
    if (!dbInstance) {
        throw new Error('TicketDb not initialized');
    }
    dbInstance.onTicketChange(listener);
}

// TEST-ONLY: Expose querySQL for migration/schema tests
export function _test_querySQL(sql: string, params: any[] = []): Promise<any[]> {
    if (!dbInstance) throw new Error('TicketDb not initialized');
    // @ts-ignore
    return dbInstance.querySQL(sql, params);
}

export function resetTicketDbForTests(): void {
    if (dbInstance) {
        dbInstance.resetForTests();
    }
    dbInstance = null;
}
