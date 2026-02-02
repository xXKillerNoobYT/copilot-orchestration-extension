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

// Mock sqlite3 - simulate module not found
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
});
