/**
 * Tests for Ticket History Module
 *
 * Covers: MT-006.10 (getTicketHistory)
 *
 * @since MT-006.10
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    createChangeRecord,
    createCreatedRecord,
    detectChanges,
    parseTicketHistory,
    serializeTicketHistory,
    appendToHistory,
    filterHistory,
    formatHistorySummary,
} from '../../../src/services/ticketDb/history';

describe('Ticket History Module (MT-006.10)', () => {

    describe('createChangeRecord', () => {
        it('Test 1: should create a status change record', () => {
            const record = createChangeRecord('status', 'open', 'in-progress', 'PlanningAgent');
            expect(record.action).toBe('status_change');
            expect(record.field).toBe('status');
            expect(record.oldValue).toBe('open');
            expect(record.newValue).toBe('in-progress');
            expect(record.changedBy).toBe('PlanningAgent');
            expect(record.changedAt).toBeTruthy();
        });

        it('Test 2: should create an assignment change record', () => {
            const record = createChangeRecord('assignee', 'Agent A', 'Agent B', 'system');
            expect(record.action).toBe('assigned');
        });

        it('Test 3: should create a priority change record', () => {
            const record = createChangeRecord('priority', 2, 1, 'human');
            expect(record.action).toBe('priority_changed');
        });

        it('Test 4: should create a generic update record', () => {
            const record = createChangeRecord('title', 'Old Title', 'New Title', 'agent');
            expect(record.action).toBe('updated');
        });

        it('Test 5: should include optional note', () => {
            const record = createChangeRecord('status', 'open', 'done', 'agent', 'Task completed');
            expect(record.note).toBe('Task completed');
        });
    });

    describe('createCreatedRecord', () => {
        it('Test 6: should create a creation record', () => {
            const record = createCreatedRecord('PlanningAgent');
            expect(record.action).toBe('created');
            expect(record.changedBy).toBe('PlanningAgent');
            expect(record.note).toBe('Ticket created');
        });
    });

    describe('detectChanges', () => {
        it('Test 7: should detect field changes', () => {
            const oldTicket = { title: 'Old', status: 'open', priority: 2 };
            const newTicket = { title: 'New', status: 'open', priority: 2 };

            const changes = detectChanges(oldTicket, newTicket, 'agent');
            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('title');
            expect(changes[0].oldValue).toBe('Old');
            expect(changes[0].newValue).toBe('New');
        });

        it('Test 8: should detect multiple changes', () => {
            const oldTicket = { title: 'Old', status: 'open', priority: 2 };
            const newTicket = { title: 'New', status: 'in-progress', priority: 1 };

            const changes = detectChanges(oldTicket, newTicket, 'agent');
            expect(changes).toHaveLength(3);
        });

        it('Test 9: should ignore specified fields', () => {
            const oldTicket = { title: 'Same', updatedAt: '2026-01-01', version: 1 };
            const newTicket = { title: 'Same', updatedAt: '2026-01-02', version: 2 };

            const changes = detectChanges(oldTicket, newTicket, 'agent');
            expect(changes).toHaveLength(0); // updatedAt and version ignored by default
        });

        it('Test 10: should return empty when no changes', () => {
            const ticket = { title: 'Same', status: 'open' };
            const changes = detectChanges(ticket, { ...ticket }, 'agent');
            expect(changes).toHaveLength(0);
        });

        it('Test 11: should handle null/undefined value changes', () => {
            const oldTicket = { resolution: null };
            const newTicket = { resolution: 'Fixed' };
            const changes = detectChanges(oldTicket as any, newTicket, 'agent');
            expect(changes).toHaveLength(1);
        });
    });

    describe('parseTicketHistory', () => {
        it('Test 12: should parse valid history', () => {
            const json = JSON.stringify({
                changes: [
                    { action: 'created', changedBy: 'system', changedAt: '2026-01-01' },
                    { action: 'status_change', field: 'status', changedBy: 'agent', changedAt: '2026-01-02' },
                ],
            });
            const history = parseTicketHistory(json);
            expect(history.changes).toHaveLength(2);
            expect(history.totalChanges).toBe(2);
            expect(history.firstChange).toBe('2026-01-01');
            expect(history.lastChange).toBe('2026-01-02');
        });

        it('Test 13: should handle empty/null history', () => {
            expect(parseTicketHistory(null).totalChanges).toBe(0);
            expect(parseTicketHistory('{}').totalChanges).toBe(0);
            expect(parseTicketHistory(undefined).totalChanges).toBe(0);
        });

        it('Test 14: should count reopens', () => {
            const json = JSON.stringify({
                changes: [
                    { action: 'reopened', changedBy: 'a', changedAt: '2026-01-01' },
                    { action: 'reopened', changedBy: 'b', changedAt: '2026-01-02' },
                    { action: 'resolved', changedBy: 'c', changedAt: '2026-01-03' },
                ],
            });
            const history = parseTicketHistory(json);
            expect(history.reopenCount).toBe(2);
        });

        it('Test 15: should handle corrupted JSON', () => {
            expect(parseTicketHistory('not json').totalChanges).toBe(0);
        });
    });

    describe('serializeTicketHistory', () => {
        it('Test 16: should round-trip serialize/parse', () => {
            const history = {
                changes: [
                    { action: 'created' as const, changedBy: 'system', changedAt: '2026-01-01' },
                ],
                reopenCount: 0,
                totalChanges: 1,
                firstChange: '2026-01-01',
                lastChange: '2026-01-01',
            };
            const json = serializeTicketHistory(history);
            const parsed = parseTicketHistory(json);
            expect(parsed.totalChanges).toBe(1);
        });
    });

    describe('appendToHistory', () => {
        it('Test 17: should append to existing history', () => {
            const existing = JSON.stringify({ changes: [
                { action: 'created', changedBy: 'system', changedAt: '2026-01-01' },
            ]});
            const updated = appendToHistory(existing, {
                action: 'status_change',
                field: 'status',
                oldValue: 'open',
                newValue: 'in-progress',
                changedBy: 'agent',
                changedAt: '2026-01-02',
            });
            const parsed = parseTicketHistory(updated);
            expect(parsed.totalChanges).toBe(2);
        });

        it('Test 18: should append to null history', () => {
            const updated = appendToHistory(null, {
                action: 'created',
                changedBy: 'system',
                changedAt: '2026-01-01',
            });
            const parsed = parseTicketHistory(updated);
            expect(parsed.totalChanges).toBe(1);
        });
    });

    describe('filterHistory', () => {
        const history = {
            changes: [
                { action: 'created' as const, changedBy: 'system', changedAt: '2026-01-01' },
                { action: 'status_change' as const, field: 'status', changedBy: 'agent', changedAt: '2026-01-02' },
                { action: 'assigned' as const, field: 'assignee', changedBy: 'human', changedAt: '2026-01-03' },
                { action: 'status_change' as const, field: 'status', changedBy: 'agent', changedAt: '2026-01-04' },
            ],
            reopenCount: 0,
            totalChanges: 4,
            firstChange: '2026-01-01',
            lastChange: '2026-01-04',
        };

        it('Test 19: should filter by action', () => {
            const result = filterHistory(history, { action: 'status_change' });
            expect(result).toHaveLength(2);
        });

        it('Test 20: should filter by changedBy', () => {
            const result = filterHistory(history, { changedBy: 'agent' });
            expect(result).toHaveLength(2);
        });

        it('Test 21: should filter by since date', () => {
            const result = filterHistory(history, { since: '2026-01-03' });
            expect(result).toHaveLength(2);
        });

        it('Test 22: should filter by field', () => {
            const result = filterHistory(history, { field: 'assignee' });
            expect(result).toHaveLength(1);
        });
    });

    describe('formatHistorySummary', () => {
        it('Test 23: should format empty history', () => {
            const summary = formatHistorySummary({
                changes: [],
                reopenCount: 0,
                totalChanges: 0,
            });
            expect(summary).toBe('No changes recorded');
        });

        it('Test 24: should format history with changes', () => {
            const summary = formatHistorySummary({
                changes: [
                    { action: 'created', changedBy: 'system', changedAt: '2026-01-01' },
                ],
                reopenCount: 0,
                totalChanges: 1,
                firstChange: '2026-01-01',
                lastChange: '2026-01-01',
            });
            expect(summary).toContain('1 change(s)');
        });

        it('Test 25: should include reopen count', () => {
            const summary = formatHistorySummary({
                changes: [],
                reopenCount: 2,
                totalChanges: 5,
                firstChange: '2026-01-01',
                lastChange: '2026-01-05',
            });
            expect(summary).toContain('Reopened 2 time(s)');
        });
    });
});
