/**
 * Tests for Ticket Resolution & Reopening
 *
 * Covers: MT-006.8 (resolveTicket), MT-006.9 (reopenTicket)
 *
 * @since MT-006.8
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    createResolution,
    createReopen,
    parseHistory,
    serializeHistory,
    appendHistory,
    RESOLVABLE_STATUSES,
    REOPENABLE_STATUSES,
} from '../../../src/services/ticketDb/resolve';

describe('Ticket Resolution & Reopening (MT-006.8/006.9)', () => {

    describe('createResolution', () => {
        it('Test 1: should resolve from open status', () => {
            const result = createResolution('open', {
                resolution: 'Fixed the bug',
                resolvedBy: 'VerificationAgent',
            });
            expect(result.success).toBe(true);
            expect(result.newStatus).toBe('resolved');
            expect(result.historyEntry).toBeDefined();
            expect(result.historyEntry!.action).toBe('resolved');
        });

        it('Test 2: should resolve from all valid statuses', () => {
            for (const status of RESOLVABLE_STATUSES) {
                const result = createResolution(status, {
                    resolution: 'Done',
                    resolvedBy: 'agent',
                });
                expect(result.success).toBe(true);
            }
        });

        it('Test 3: should reject resolution from done status', () => {
            const result = createResolution('done', {
                resolution: 'Already done',
                resolvedBy: 'agent',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot resolve');
        });

        it('Test 4: should reject resolution from resolved status', () => {
            const result = createResolution('resolved', {
                resolution: 'Already resolved',
                resolvedBy: 'agent',
            });
            expect(result.success).toBe(false);
        });

        it('Test 5: should require resolution text', () => {
            const result = createResolution('open', {
                resolution: '',
                resolvedBy: 'agent',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        it('Test 6: should reject overly long resolution', () => {
            const result = createResolution('open', {
                resolution: 'x'.repeat(2001),
                resolvedBy: 'agent',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('maximum length');
        });

        it('Test 7: should include history entry with details', () => {
            const result = createResolution('in-progress', {
                resolution: 'Completed implementation',
                resolvedBy: 'PlanningAgent',
                resolvedAt: '2026-02-05T10:00:00Z',
            });
            expect(result.historyEntry!.from).toBe('in-progress');
            expect(result.historyEntry!.to).toBe('resolved');
            expect(result.historyEntry!.by).toBe('PlanningAgent');
            expect(result.historyEntry!.at).toBe('2026-02-05T10:00:00Z');
            expect(result.historyEntry!.note).toContain('Completed implementation');
        });
    });

    describe('createReopen', () => {
        it('Test 8: should reopen from resolved status', () => {
            const result = createReopen('resolved', {
                reason: 'Bug still occurs',
                reopenedBy: 'human',
            });
            expect(result.success).toBe(true);
            expect(result.newStatus).toBe('open');
            expect(result.historyEntry!.action).toBe('reopened');
        });

        it('Test 9: should reopen from all valid statuses', () => {
            for (const status of REOPENABLE_STATUSES) {
                const result = createReopen(status, {
                    reason: 'Needs more work',
                    reopenedBy: 'agent',
                });
                expect(result.success).toBe(true);
            }
        });

        it('Test 10: should reject reopen from open status', () => {
            const result = createReopen('open', {
                reason: 'Already open',
                reopenedBy: 'agent',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot reopen');
        });

        it('Test 11: should require reason', () => {
            const result = createReopen('resolved', {
                reason: '',
                reopenedBy: 'agent',
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        it('Test 12: should track reopen count', () => {
            const result = createReopen('resolved', {
                reason: 'Third time reopening',
                reopenedBy: 'human',
            }, 2);
            expect(result.historyEntry!.note).toContain('Reopen #3');
        });
    });

    describe('History Parsing', () => {
        it('Test 13: should parse empty history', () => {
            const history = parseHistory('{}');
            expect(history.changes).toHaveLength(0);
            expect(history.reopenCount).toBe(0);
        });

        it('Test 14: should parse null history', () => {
            expect(parseHistory(null).changes).toHaveLength(0);
            expect(parseHistory(undefined).changes).toHaveLength(0);
        });

        it('Test 15: should parse history with changes', () => {
            const json = JSON.stringify({
                changes: [
                    { action: 'resolved', from: 'open', to: 'resolved', by: 'agent', at: '2026-01-01' },
                    { action: 'reopened', from: 'resolved', to: 'open', by: 'human', at: '2026-01-02' },
                ],
            });
            const history = parseHistory(json);
            expect(history.changes).toHaveLength(2);
            expect(history.reopenCount).toBe(1);
        });

        it('Test 16: should handle corrupted JSON', () => {
            const history = parseHistory('not json');
            expect(history.changes).toHaveLength(0);
        });
    });

    describe('History Serialization', () => {
        it('Test 17: should round-trip serialize/parse', () => {
            const changes = [
                { action: 'resolved' as const, from: 'open', to: 'resolved', by: 'agent', at: '2026-01-01' },
            ];
            const json = serializeHistory(changes);
            const parsed = parseHistory(json);
            expect(parsed.changes).toHaveLength(1);
            expect(parsed.changes[0].action).toBe('resolved');
        });

        it('Test 18: should append to existing history', () => {
            const existing = JSON.stringify({ changes: [
                { action: 'created', by: 'system', at: '2026-01-01' },
            ]});
            const updated = appendHistory(existing, {
                action: 'resolved',
                from: 'open',
                to: 'resolved',
                by: 'agent',
                at: '2026-01-02',
            });
            const parsed = parseHistory(updated);
            expect(parsed.changes).toHaveLength(2);
        });

        it('Test 19: should append to null history', () => {
            const updated = appendHistory(null, {
                action: 'created',
                from: '',
                to: 'open',
                by: 'system',
                at: '2026-01-01',
            });
            const parsed = parseHistory(updated);
            expect(parsed.changes).toHaveLength(1);
        });
    });
});
