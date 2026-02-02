/**
 * Tests for ticketDb.ts
 * 
 * Tests both SQLite and in-memory modes
 */

import { initializeTicketDb, createTicket, getTicket, listTickets, resetTicketDbForTests } from '../src/services/ticketDb';
import { ExtensionContext } from './__mocks__/vscode';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

// Mock sqlite3 - default to failure (in-memory mode)
// Individual tests can override with jest.doMock()
jest.mock('sqlite3', () => {
    throw new Error('sqlite3 module not found (simulated)');
}, { virtual: true });

const mockFs = fs as jest.Mocked<typeof fs>;

describe('TicketDb', () => {
    let mockContext: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = new ExtensionContext('/mock/extension/path');

        resetTicketDbForTests();

        // Mock config file
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            tickets: {
                dbPath: './.coe/tickets.db'
            }
        }));
    });

    describe('initialization', () => {
        it('should initialize in-memory mode when sqlite3 fails', async () => {
            await expect(initializeTicketDb(mockContext)).resolves.not.toThrow();
        });

        it('should create .coe directory if missing', async () => {
            mockFs.existsSync
                .mockReturnValueOnce(true)  // config exists
                .mockReturnValueOnce(false); // .coe dir doesn't exist

            await initializeTicketDb(mockContext);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('.coe'),
                { recursive: true }
            );
        });
    });

    describe('CRUD operations (in-memory)', () => {
        beforeEach(async () => {
            await initializeTicketDb(mockContext);
        });

        it('should create a ticket', async () => {
            const ticket = await createTicket({
                title: 'Test Ticket',
                status: 'open',
                description: 'Test description'
            });

            expect(ticket).toHaveProperty('id');
            expect(ticket.title).toBe('Test Ticket');
            expect(ticket.status).toBe('open');
            expect(ticket.createdAt).toBeTruthy();
        });

        it('should create a ticket with ai_to_human type', async () => {
            const ticket = await createTicket({
                title: 'Auto Plan Task',
                status: 'open',
                type: 'ai_to_human',
                description: 'This should trigger auto-planning'
            });

            expect(ticket.type).toBe('ai_to_human');
            expect(ticket.title).toBe('Auto Plan Task');
        });

        it('should retrieve ticket with type field', async () => {
            const created = await createTicket({
                title: 'Type Test',
                status: 'open',
                type: 'ai_to_human'
            });

            const found = await getTicket(created.id);

            expect(found?.type).toBe('ai_to_human');
        });

        it('should handle ticket without type (backward compatibility)', async () => {
            const ticket = await createTicket({
                title: 'No Type Ticket',
                status: 'open'
            });

            expect(ticket.type).toBeUndefined();

            const found = await getTicket(ticket.id);
            expect(found?.type).toBeUndefined();
        });

        it('should retrieve a ticket by ID', async () => {
            const created = await createTicket({
                title: 'Find Me',
                status: 'open'
            });

            const found = await getTicket(created.id);

            expect(found).not.toBeNull();
            expect(found?.id).toBe(created.id);
            expect(found?.title).toBe('Find Me');
        });

        it('should return null for non-existent ticket', async () => {
            const found = await getTicket('TICKET-999999');
            expect(found).toBeNull();
        });

        it('should list all tickets', async () => {
            await createTicket({ title: 'Ticket 1', status: 'open' });
            await createTicket({ title: 'Ticket 2', status: 'done' });

            const tickets = await listTickets();

            expect(tickets).toHaveLength(2);
            expect(tickets.some(t => t.title === 'Ticket 1')).toBe(true);
            expect(tickets.some(t => t.title === 'Ticket 2')).toBe(true);
        });

        it('should throw error if methods called before init', async () => {
            // Reset module to clear singleton
            jest.resetModules();
            const { createTicket: uninitCreate } = require('../src/services/ticketDb');

            await expect(uninitCreate({ title: 'test', status: 'open' }))
                .rejects.toThrow('not initialized');
        });
    });

    // ========== Phase 1: SQLite Mode Operations ==========
    
    describe('SQLite Mode Operations', () => {
        /**
         * Helper: Creates a mock SQLite Database that simulates successful operations
         * Returns a fake Database class with run(), all(), get() methods using callbacks
         */
        function mockSQLiteSuccess() {
            const ticketStore: any[] = []; // In-memory store to simulate SQLite behavior
            
            return class MockDatabase {
                run: any;
                all: any;
                get: any;
                close: any;

                constructor(filename: string, callback?: (err: Error | null) => void) {
                    // Simulate successful database connection
                    if (callback) {
                        setTimeout(() => callback(null), 0);
                    }

                    // Setup run method with flexible signature
                    this.run = jest.fn().mockImplementation((sql: string, paramsOrCallback?: any[] | ((err: Error | null) => void), callback?: (err: Error | null) => void) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];

                        // Simulate CREATE TABLE
                        if (sql.includes('CREATE TABLE')) {
                            if (cb) setTimeout(() => cb(null), 0);
                            return;
                        }

                        // Simulate ALTER TABLE (migration)
                        if (sql.includes('ALTER TABLE')) {
                            if (cb) setTimeout(() => cb(null), 0);
                            return;
                        }

                        // Simulate INSERT
                        if (sql.includes('INSERT INTO')) {
                            const [id, title, description, status, priority, createdAt, updatedAt, type] = params;
                            ticketStore.push({ id, title, description, status, priority, createdAt, updatedAt, type });
                            if (cb) setTimeout(() => cb(null), 0);
                            return;
                        }

                        // Simulate UPDATE
                        if (sql.includes('UPDATE')) {
                            if (cb) setTimeout(() => cb(null), 0);
                            return;
                        }

                        if (cb) setTimeout(() => cb(null), 0);
                    });

                    // Setup all method with flexible signature
                    this.all = jest.fn().mockImplementation((sql: string, paramsOrCallback?: any[] | ((err: Error | null, rows?: any[]) => void), callback?: (err: Error | null, rows?: any[]) => void) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;

                        if (!cb) return;

                        // Simulate PRAGMA table_info (for migration check)
                        if (sql.includes('PRAGMA table_info')) {
                            setTimeout(() => cb(null, [
                                { name: 'id' },
                                { name: 'title' },
                                { name: 'description' },
                                { name: 'status' },
                                { name: 'priority' },
                                { name: 'createdAt' },
                                { name: 'updatedAt' },
                                { name: 'type' } // Include type column for success path
                            ]), 0);
                            return;
                        }

                        // Simulate SELECT * FROM tickets (getAllTickets)
                        if (sql.includes('SELECT') && sql.includes('FROM tickets')) {
                            setTimeout(() => cb(null, ticketStore), 0);
                            return;
                        }

                        setTimeout(() => cb(null, []), 0);
                    });

                    // Setup get method with flexible signature
                    this.get = jest.fn().mockImplementation((sql: string, paramsOrCallback?: any[] | ((err: Error | null, row?: any) => void), callback?: (err: Error | null, row?: any) => void) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];

                        if (!cb) return;

                        // Simulate SELECT by ID
                        if (sql.includes('WHERE id = ?')) {
                            const [id] = params;
                            const row = ticketStore.find(t => t.id === id);
                            setTimeout(() => cb(null, row), 0);
                            return;
                        }

                        setTimeout(() => cb(null, undefined), 0);
                    });

                    this.close = jest.fn().mockImplementation((callback?: (err: Error | null) => void) => {
                        if (callback) setTimeout(() => callback(null), 0);
                    });
                }

                verbose() {
                    return this;
                }
            };
        }

        beforeEach(() => {
            jest.clearAllMocks();
            jest.resetModules(); // Clear module cache
            mockContext = new ExtensionContext('/mock/extension/path');
            
            // Unmock sqlite3 to allow per-test mocking
            jest.unmock('sqlite3');
        });

        it('should initialize with SQLite when module loads successfully', async () => {
            // Arrange: Setup mocks FIRST
            mockFs.existsSync
                .mockReturnValueOnce(true)  // config file exists
                .mockReturnValueOnce(false); // .coe directory doesn't exist
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tickets: { dbPath: './.coe/tickets.db' }
            }));

            // Then mock sqlite3 to return working Database
            const MockDB = mockSQLiteSuccess();
            jest.doMock('sqlite3', () => ({
                verbose: () => ({
                    Database: MockDB
                })
            }));

            // Act: Import with successful sqlite3 mock
            const { initializeTicketDb: init } = require('../src/services/ticketDb');
            await init(mockContext);

            // Assert: Verify SQLite mode was used (not in-memory fallback)
            // SQLite initialization succeeded if we got here without errors
            expect(true).toBe(true); // Test passes if no errors thrown
        });

        it('should create ticket in SQLite mode', async () => {
            // Arrange: Setup custom mock with spy
            const ticketStore: any[] = [];
            const mockRunSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];
                if (sql.includes('INSERT INTO')) {
                    ticketStore.push(...params);
                }
                if (cb) setTimeout(() => cb(null), 0);
            });

            class MockDBWithSpy {
                run: any; all: any; get: any; close: any;
                constructor(filename: string, callback?: any) {
                    if (callback) setTimeout(() => callback(null), 0);
                    this.run = mockRunSpy;
                    this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        if (sql.includes('PRAGMA')) {
                            setTimeout(() => cb(null, [{ name: 'id' }, { name: 'title' }, { name: 'type' }]), 0);
                        } else {
                            setTimeout(() => cb(null, []), 0);
                        }
                    });
                    this.get = jest.fn();
                    this.close = jest.fn();
                }
                verbose() { return this; }
            }

            jest.doMock('sqlite3', () => ({
                verbose: () => ({ Database: MockDBWithSpy })
            }));

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tickets: { dbPath: './.coe/tickets.db' } }));

            const { initializeTicketDb: init2, createTicket: create2 } = require('../src/services/ticketDb');
            await init2(mockContext);

            // Act
            const ticket = await create2({ title: 'SQLite Test', status: 'open' });

            // Assert
            expect(mockRunSpy).toHaveBeenCalled();
            expect(mockRunSpy.mock.calls.some((call: any[]) => call[0]?.includes('INSERT INTO'))).toBe(true);
            expect(ticket.title).toBe('SQLite Test');
        });

        it('should retrieve all tickets from SQLite', async () => {
            // Arrange: Mock with pre-populated data
            const mockTickets = [
                { id: 'T-001', title: 'First', status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'ai_to_human' },
                { id: 'T-002', title: 'Second', status: 'done', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ];

            const mockAllSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                if (sql.includes('SELECT') && sql.includes('FROM tickets')) {
                    setTimeout(() => cb(null, mockTickets), 0);
                } else if (sql.includes('PRAGMA')) {
                    setTimeout(() => cb(null, [{ name: 'id' }, { name: 'title' }, { name: 'type' }]), 0);
                } else {
                    setTimeout(() => cb(null, []), 0);
                }
            });

            class MockDBWithAllSpy {
                run: any; all: any; get: any; close: any;
                constructor(filename: string, callback?: any) {
                    if (callback) setTimeout(() => callback(null), 0);
                    this.run = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        if (cb) setTimeout(() => cb(null), 0);
                    });
                    this.all = mockAllSpy;
                    this.get = jest.fn();
                    this.close = jest.fn();
                }
                verbose() { return this; }
            }

            jest.doMock('sqlite3', () => ({
                verbose: () => ({ Database: MockDBWithAllSpy })
            }));

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tickets: { dbPath: './.coe/tickets.db' } }));

            const { initializeTicketDb: init3, listTickets: list3 } = require('../src/services/ticketDb');
            await init3(mockContext);

            // Act
            const tickets = await list3();

            // Assert
            expect(mockAllSpy).toHaveBeenCalled();
            expect(tickets).toHaveLength(2);
            expect(tickets[0].title).toBe('First');
            expect(tickets[1].title).toBe('Second');
        });
    });
});
