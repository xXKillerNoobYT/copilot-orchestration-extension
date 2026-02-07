/**
 * @file ticketCleanup.test.ts
 * @description Tests for TicketCleanup service
 */

import * as ticketCleanup from '../../src/services/ticketCleanup';
import * as ticketDb from '../../src/services/ticketDb';
import * as logger from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    listTickets: jest.fn(),
    updateTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

describe('TicketCleanup', () => {
    const listTicketsMock = ticketDb.listTickets as jest.Mock;
    const updateTicketMock = ticketDb.updateTicket as jest.Mock;
    const logInfoMock = logger.logInfo as jest.Mock;
    const logErrorMock = logger.logError as jest.Mock;

    const createTicket = (
        id: string, 
        status: 'open' | 'in-progress' | 'done' | 'blocked' | 'pending' | 'in_review' | 'resolved' | 'rejected' | 'escalated' | 'removed', 
        updates: Partial<ticketDb.Ticket> = {}
    ): ticketDb.Ticket => ({
        id,
        title: `Ticket ${id}`,
        status,
        priority: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creator: 'test',
        assignee: 'agent',
        taskId: `task-${id}`,
        version: 1,
        resolution: null,
        ...updates,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        ticketCleanup.stopPeriodicCleanup();
    });

    afterEach(() => {
        jest.useRealTimers();
        ticketCleanup.stopPeriodicCleanup();
    });

    describe('Test 1: TICKET_STATUS_CATEGORIES constants', () => {
        it('should define expected status categories', () => {
            expect(ticketCleanup.TICKET_STATUS_CATEGORIES.ACTIVE).toContain('open');
            expect(ticketCleanup.TICKET_STATUS_CATEGORIES.RESOLVED).toContain('done');
            expect(ticketCleanup.TICKET_STATUS_CATEGORIES.REMOVED).toContain('removed');
            expect(ticketCleanup.TICKET_STATUS_CATEGORIES.BLOCKED).toContain('blocked');
        });
    });

    describe('Test 2: getDisplayTickets', () => {
        it('should return only active tickets by default', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('1', 'open'),
                createTicket('2', 'done'),
                createTicket('3', 'in-progress'),
                createTicket('4', 'removed'),
                createTicket('5', 'blocked'),
            ]);

            const result = await ticketCleanup.getDisplayTickets();

            expect(result).toHaveLength(3); // open, in-progress, blocked
            expect(result.map(t => t.id)).toContain('1');
            expect(result.map(t => t.id)).toContain('3');
            expect(result.map(t => t.id)).toContain('5');
        });

        it('should exclude blocked when onlyActive=true', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('1', 'open'),
                createTicket('2', 'blocked'),
                createTicket('3', 'in-progress'),
            ]);

            const result = await ticketCleanup.getDisplayTickets(true);

            expect(result).toHaveLength(2);
            expect(result.map(t => t.id)).not.toContain('2');
        });

        it('should return empty array on error', async () => {
            listTicketsMock.mockRejectedValue(new Error('DB error'));

            const result = await ticketCleanup.getDisplayTickets();

            expect(result).toEqual([]);
            expect(logErrorMock).toHaveBeenCalled();
        });
    });

    describe('Test 3: getArchivedTickets', () => {
        it('should return resolved and removed tickets', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('1', 'open'),
                createTicket('2', 'done'),
                createTicket('3', 'removed'),
                createTicket('4', 'rejected'),
            ]);

            const result = await ticketCleanup.getArchivedTickets();

            expect(result).toHaveLength(3);
            expect(result.map(t => t.status)).toEqual(['done', 'removed', 'rejected']);
        });

        it('should return empty array on error', async () => {
            listTicketsMock.mockRejectedValue(new Error('DB error'));

            const result = await ticketCleanup.getArchivedTickets();

            expect(result).toEqual([]);
            expect(logErrorMock).toHaveBeenCalled();
        });
    });

    describe('Test 4: getActiveQueueTickets', () => {
        it('should call getDisplayTickets with onlyActive=true', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('1', 'open'),
                createTicket('2', 'blocked'),
            ]);

            const result = await ticketCleanup.getActiveQueueTickets();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });
    });

    describe('Test 5: cleanupOldTickets', () => {
        it('should remove resolved tickets older than maxAge', async () => {
            const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
            listTicketsMock.mockResolvedValue([
                createTicket('old', 'done', { updatedAt: oldDate }),
                createTicket('new', 'done'),
            ]);
            updateTicketMock.mockResolvedValue(undefined);

            const result = await ticketCleanup.cleanupOldTickets(7);

            expect(result.removedCount).toBe(1);
            expect(updateTicketMock).toHaveBeenCalledWith('old', { status: 'removed' });
        });

        it('should skip already removed tickets', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('removed', 'removed'),
            ]);

            const result = await ticketCleanup.cleanupOldTickets();

            expect(updateTicketMock).not.toHaveBeenCalled();
            expect(result.removedCount).toBe(0);
        });

        it('should remove duplicate when master is resolved', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('master', 'done'),
                createTicket('duplicate', 'open', { linkedTo: 'master' }),
            ]);
            updateTicketMock.mockResolvedValue(undefined);

            const result = await ticketCleanup.cleanupOldTickets();

            expect(updateTicketMock).toHaveBeenCalledWith('duplicate', { status: 'removed' });
            expect(result.removedCount).toBeGreaterThanOrEqual(1);
        });

        it('should handle individual ticket errors', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('fail', 'done', { 
                    updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() 
                }),
            ]);
            updateTicketMock.mockRejectedValue(new Error('Update failed'));

            const result = await ticketCleanup.cleanupOldTickets(7);

            expect(result.errors).toHaveLength(1);
            expect(logErrorMock).toHaveBeenCalled();
        });

        it('should handle overall error', async () => {
            listTicketsMock.mockRejectedValue(new Error('List failed'));

            const result = await ticketCleanup.cleanupOldTickets();

            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Test 6: getCleanupStats', () => {
        it('should return correct counts by category', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('1', 'open'),
                createTicket('2', 'in-progress'),
                createTicket('3', 'blocked'),
                createTicket('4', 'done'),
                createTicket('5', 'removed'),
                createTicket('6', 'open', { linkedTo: '1' }),
            ]);

            const stats = await ticketCleanup.getCleanupStats();

            expect(stats.activeCount).toBe(3); // open, in-progress, and open (linked)
            expect(stats.blockedCount).toBe(1);
            expect(stats.resolvedCount).toBe(1);
            expect(stats.removedCount).toBe(1);
            expect(stats.duplicateCount).toBe(1);
        });

        it('should return zeros on error', async () => {
            listTicketsMock.mockRejectedValue(new Error('DB error'));

            const stats = await ticketCleanup.getCleanupStats();

            expect(stats.activeCount).toBe(0);
            expect(stats.blockedCount).toBe(0);
        });
    });

    describe('Test 7: initializePeriodicCleanup', () => {
        it('should initialize cleanup timer', () => {
            listTicketsMock.mockResolvedValue([]);

            ticketCleanup.initializePeriodicCleanup(1, 7);

            expect(logInfoMock).toHaveBeenCalledWith(
                expect.stringContaining('Periodic cleanup initialized')
            );
        });

        it('should run cleanup immediately on init', () => {
            listTicketsMock.mockResolvedValue([]);

            ticketCleanup.initializePeriodicCleanup();

            expect(listTicketsMock).toHaveBeenCalled();
        });

        it('should run cleanup on interval', () => {
            listTicketsMock.mockResolvedValue([]);

            ticketCleanup.initializePeriodicCleanup(1); // 1 hour

            // Clear initial call
            listTicketsMock.mockClear();

            // Advance 1 hour
            jest.advanceTimersByTime(60 * 60 * 1000);

            expect(listTicketsMock).toHaveBeenCalled();
        });

        it('should clear existing timer when re-initialized', () => {
            listTicketsMock.mockResolvedValue([]);

            ticketCleanup.initializePeriodicCleanup(1);
            ticketCleanup.initializePeriodicCleanup(2);
            
            // Clear mocks AFTER second init (which runs cleanup immediately)
            listTicketsMock.mockClear();

            // Advancing only 1 hour should not trigger (old timer was cleared)
            jest.advanceTimersByTime(60 * 60 * 1000);
            expect(listTicketsMock).not.toHaveBeenCalled();

            // But 2 hours total should trigger the new interval
            jest.advanceTimersByTime(60 * 60 * 1000);
            expect(listTicketsMock).toHaveBeenCalled();
        });
    });

    describe('Test 8: stopPeriodicCleanup', () => {
        it('should stop cleanup timer', () => {
            listTicketsMock.mockResolvedValue([]);

            ticketCleanup.initializePeriodicCleanup(1);
            listTicketsMock.mockClear();

            ticketCleanup.stopPeriodicCleanup();

            jest.advanceTimersByTime(60 * 60 * 1000);
            expect(listTicketsMock).not.toHaveBeenCalled();
            expect(logInfoMock).toHaveBeenCalledWith(
                expect.stringContaining('cleanup stopped')
            );
        });

        it('should handle stop when no timer exists', () => {
            // Should not throw
            ticketCleanup.stopPeriodicCleanup();
        });
    });

    describe('Test 9: formatCleanupStats', () => {
        it('should format stats for display', () => {
            const stats = {
                activeCount: 5,
                blockedCount: 2,
                resolvedCount: 10,
                removedCount: 3,
                duplicateCount: 1,
            };

            const formatted = ticketCleanup.formatCleanupStats(stats);

            expect(formatted).toContain('5 active');
            expect(formatted).toContain('2 blocked');
            expect(formatted).toContain('10 resolved');
            expect(formatted).toContain('1 duplicates');
        });
    });

    describe('Test 10: edge cases', () => {
        it('should handle empty ticket list', async () => {
            listTicketsMock.mockResolvedValue([]);

            const display = await ticketCleanup.getDisplayTickets();
            const archived = await ticketCleanup.getArchivedTickets();
            const stats = await ticketCleanup.getCleanupStats();

            expect(display).toEqual([]);
            expect(archived).toEqual([]);
            expect(stats.activeCount).toBe(0);
        });

        it('should handle non-Error exceptions', async () => {
            listTicketsMock.mockRejectedValue('string error');

            const result = await ticketCleanup.getDisplayTickets();

            expect(result).toEqual([]);
            expect(logErrorMock).toHaveBeenCalled();
        });

        it('should handle linkedTo to non-existent master', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('orphan', 'open', { linkedTo: 'missing-master' }),
            ]);

            const result = await ticketCleanup.cleanupOldTickets();

            // Should not crash, orphan stays unchanged
            expect(updateTicketMock).not.toHaveBeenCalled();
            expect(result.removedCount).toBe(0);
        });

        it('should handle linkedTo to active master', async () => {
            listTicketsMock.mockResolvedValue([
                createTicket('master', 'open'),
                createTicket('duplicate', 'open', { linkedTo: 'master' }),
            ]);

            const result = await ticketCleanup.cleanupOldTickets();

            // Duplicate should not be removed since master is still open
            expect(updateTicketMock).not.toHaveBeenCalled();
        });
    });
});
