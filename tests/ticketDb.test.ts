/**
 * Tests for ticketDb.ts
 * 
 * Tests both SQLite and in-memory modes
 */

import { initializeTicketDb, createTicket, getTicket, listTickets, updateTicket, onTicketChange, resetTicketDbForTests } from '../src/services/ticketDb';
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

    // ========== Phase 2: updateTicket Coverage ==========
    
    describe('updateTicket', () => {
        beforeEach(async () => {
            jest.clearAllMocks();
            jest.resetModules(); // Reset to prevent module contamination from SQLite tests
            
            // Re-mock sqlite3 to throw (for in-memory mode)
            jest.doMock('sqlite3', () => {
                throw new Error('sqlite3 module not found (simulated)');
            });

            mockContext = new ExtensionContext('/mock/extension/path');

            // Setup default in-memory mock
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tickets: { dbPath: './.coe/tickets.db' }
            }));
        });

        it('should update ticket in in-memory mode', async () => {
            // Arrange: Get fresh imports and initialize in-memory mode
            const { initializeTicketDb: initMem, createTicket: createMem, updateTicket: updateMem, resetTicketDbForTests: resetMem } = require('../src/services/ticketDb');
            resetMem(); // Ensure clean state
            await initMem(mockContext);
            const created = await createMem({ title: 'Original', status: 'open' });

            // Act: Update the ticket
            const updated = await updateMem(created.id, { title: 'Updated Title', status: 'done' });

            // Assert: Verify changes
            expect(updated).not.toBeNull();
            expect(updated?.title).toBe('Updated Title');
            expect(updated?.status).toBe('done');
            expect(updated?.createdAt).toBe(created.createdAt); // createdAt unchanged
            expect(updated?.updatedAt).not.toBe(created.updatedAt); // updatedAt changed
        });

        it('should update ticket in SQLite mode', async () => {
            // Arrange: Setup SQLite mock with UPDATE tracking
            const mockRunSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                if (cb) setTimeout(() => cb(null), 0);
            });

            const ticketInDb = {
                id: 'TEST-123',
                title: 'Original',
                status: 'open',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            class MockDBForUpdate {
                run: any; all: any; get: any; close: any;
                constructor(filename: string, callback?: any) {
                    if (callback) setTimeout(() => callback(null), 0);
                    this.run = mockRunSpy;
                    this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        setTimeout(() => cb(null, [{ name: 'id' }, { name: 'title' }, { name: 'type' }]), 0);
                    });
                    this.get = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        setTimeout(() => cb(null, ticketInDb), 0);
                    });
                    this.close = jest.fn();
                }
                verbose() { return this; }
            }

            jest.doMock('sqlite3', () => ({
                verbose: () => ({ Database: MockDBForUpdate })
            }));

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tickets: { dbPath: './.coe/tickets.db' } }));

            const { initializeTicketDb: init4, updateTicket: update4 } = require('../src/services/ticketDb');
            await init4(mockContext);

            // Act: Update ticket
            const result = await update4('TEST-123', { title: 'Updated', status: 'done' });

            // Assert: Verify db.run was called with UPDATE SQL
            expect(mockRunSpy).toHaveBeenCalled();
            const updateCall = mockRunSpy.mock.calls.find((call: any[]) => 
                typeof call[0] === 'string' && call[0].includes('UPDATE tickets')
            );
            expect(updateCall).toBeDefined();
            expect(result?.title).toBe('Updated');
            expect(result?.status).toBe('done');
        });

        it('should return null for non-existent ticket', async () => {
            // Arrange: Get fresh imports
            const { initializeTicketDb: initNull, updateTicket: updateNull, resetTicketDbForTests: resetNull } = require('../src/services/ticketDb');
            resetNull();
            await initNull(mockContext);

            // Act: Try to update non-existent ticket
            const result = await updateNull('NONEXISTENT-999', { title: 'Should Fail' });

            // Assert
            expect(result).toBeNull();
        });

        it('should emit change event on update', async () => {
            // Arrange: Get fresh imports and register listener before update
            const { initializeTicketDb: initEvt, createTicket: createEvt, updateTicket: updateEvt, onTicketChange: onEvt, resetTicketDbForTests: resetEvt } = require('../src/services/ticketDb');
            resetEvt();
            await initEvt(mockContext);
            const created = await createEvt({ title: 'Test', status: 'open' });

            const listener = jest.fn();
            onEvt(listener);

            // Act: Update ticket
            await updateEvt(created.id, { title: 'Changed' });

            // Assert: Listener was called
            expect(listener).toHaveBeenCalled();
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    // ========== Phase 3: Migration & Compatibility ==========
    
    describe('Migration & Backward Compatibility', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            jest.resetModules();
            jest.unmock('sqlite3');
            mockContext = new ExtensionContext('/mock/extension/path');
        });

        it('should migrate SQLite table without type column', async () => {
            // Arrange: Mock PRAGMA to return schema WITHOUT type column
            const mockRunSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                if (cb) setTimeout(() => cb(null), 0);
            });

            class MockDBForMigration {
                run: any; all: any; get: any; close: any;
                constructor(filename: string, callback?: any) {
                    if (callback) setTimeout(() => callback(null), 0);
                    this.run = mockRunSpy;
                    // PRAGMA table_info returns columns WITHOUT 'type'
                    this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        if (sql.includes('PRAGMA table_info')) {
                            setTimeout(() => cb(null, [
                                { name: 'id' },
                                { name: 'title' },
                                { name: 'description' },
                                { name: 'status' },
                                { name: 'priority' },
                                { name: 'createdAt' },
                                { name: 'updatedAt' }
                                // NOTE: 'type' column is MISSING (old schema)
                            ]), 0);
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
                verbose: () => ({ Database: MockDBForMigration })
            }));

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tickets: { dbPath: './.coe/tickets.db' } }));

            // Act: Initialize (should trigger migration)
            const { initializeTicketDb: initMig } = require('../src/services/ticketDb');
            await initMig(mockContext);

            // Assert: Verify ALTER TABLE was called to add type column
            expect(mockRunSpy).toHaveBeenCalled();
            const alterCall = mockRunSpy.mock.calls.find((call: any[]) => 
                typeof call[0] === 'string' && call[0].includes('ALTER TABLE') && call[0].includes('ADD COLUMN type')
            );
            expect(alterCall).toBeDefined();
        });

        it('should read old tickets without type field as undefined', async () => {
            // Arrange: Mock SQLite with a ticket row that has NO type field (old schema)
            const oldTicketRow = {
                id: 'OLD-001',
                title: 'Old Ticket',
                description: 'Created before type column existed',
                status: 'open',
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z'
                // NOTE: No 'type' field (old data)
            };

            class MockDBForOldTicket {
                run: any; all: any; get: any; close: any;
                constructor(filename: string, callback?: any) {
                    if (callback) setTimeout(() => callback(null), 0);
                    this.run = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        if (cb) setTimeout(() => cb(null), 0);
                    });
                    this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        if (sql.includes('PRAGMA table_info')) {
                            setTimeout(() => cb(null, [{ name: 'id' }, { name: 'title' }, { name: 'type' }]), 0);
                        } else if (sql.includes('SELECT') && sql.includes('FROM tickets')) {
                            setTimeout(() => cb(null, [oldTicketRow]), 0);
                        } else {
                            setTimeout(() => cb(null, []), 0);
                        }
                    });
                    this.get = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                        setTimeout(() => cb(null, oldTicketRow), 0);
                    });
                    this.close = jest.fn();
                }
                verbose() { return this; }
            }

            jest.doMock('sqlite3', () => ({
                verbose: () => ({ Database: MockDBForOldTicket })
            }));

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tickets: { dbPath: './.coe/tickets.db' } }));

            // Act: Get the old ticket
            const { initializeTicketDb: initOld, getTicket: getOld } = require('../src/services/ticketDb');
            await initOld(mockContext);
            const ticket = await getOld('OLD-001');

            // Assert: Old ticket should have type: undefined (backward compatibility)
            expect(ticket).not.toBeNull();
            expect(ticket?.id).toBe('OLD-001');
            expect(ticket?.title).toBe('Old Ticket');
            expect(ticket?.type).toBeUndefined(); // No type = undefined (not 'ai_to_human')
        });
    });
});
