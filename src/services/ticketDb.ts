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
import { logInfo, logWarn, logError } from '../logger';

// Ticket interface - defines what a ticket looks like
export interface Ticket {
    id: string;           // Unique ID (e.g., "TICKET-001")
    title: string;        // Short description
    status: 'open' | 'in-progress' | 'done' | 'blocked';
    createdAt: string;    // ISO timestamp (e.g., "2026-02-01T10:30:00Z")
    updatedAt: string;    // ISO timestamp
    description?: string; // Optional long description
}

// Database abstraction - works with SQLite OR in-memory
class TicketDatabase {
    private dbPath: string | null = null;
    private db: any = null; // SQLite database instance
    private inMemoryStore: Map<string, Ticket> | null = null;
    private isInMemoryMode: boolean = false;

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        // Step 1: Read dbPath from config (or use default)
        const configPath = path.join(context.extensionPath, '.coe', 'config.json');
        let dbPathFromConfig = './.coe/tickets.db'; // default

        try {
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(configContent);
                if (config.tickets?.dbPath) {
                    dbPathFromConfig = config.tickets.dbPath;
                }
            }
        } catch (err) {
            logWarn(`Failed to read config for dbPath: ${err}`);
        }

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
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    description TEXT
                )
            `);

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

    async createTicket(data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
        const now = new Date().toISOString();
        const id = `TICKET-${Date.now()}`; // Simple ID generation

        const ticket: Ticket = {
            id,
            title: data.title,
            status: data.status,
            description: data.description,
            createdAt: now,
            updatedAt: now,
        };

        if (this.isInMemoryMode) {
            this.inMemoryStore!.set(id, ticket);
        } else {
            await this.runSQL(
                `INSERT INTO tickets (id, title, status, description, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [ticket.id, ticket.title, ticket.status, ticket.description || null, ticket.createdAt, ticket.updatedAt]
            );
        }

        logInfo(`Created ticket: ${id}`);
        return ticket;
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
        return {
            id: row.id,
            title: row.title,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            description: row.description || undefined,
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

export function resetTicketDbForTests(): void {
    if (dbInstance) {
        dbInstance.resetForTests();
    }
    dbInstance = null;
}
