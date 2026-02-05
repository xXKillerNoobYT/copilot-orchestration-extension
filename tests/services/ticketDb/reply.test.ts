/**
 * Tests for Ticket Reply Module
 *
 * Covers: MT-006.11 (addReply)
 *
 * @since MT-006.11
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    createReply,
    parseThread,
    serializeThread,
    getReplyCount,
    getLatestReply,
    getRepliesByRole,
    MAX_REPLY_LENGTH,
    ThreadReply,
} from '../../../src/services/ticketDb/reply';

describe('Ticket Reply Module (MT-006.11)', () => {

    describe('createReply', () => {
        it('Test 1: should create reply with valid data', () => {
            const result = createReply(
                { role: 'user', content: 'Hello' },
                null
            );
            expect(result.success).toBe(true);
            expect(result.reply).toBeDefined();
            expect(result.reply!.replyId).toBe('RPL-001');
            expect(result.reply!.role).toBe('user');
            expect(result.reply!.content).toBe('Hello');
            expect(result.reply!.createdAt).toBeTruthy();
        });

        it('Test 2: should generate sequential reply IDs', () => {
            const thread: ThreadReply[] = [];
            const r1 = createReply({ role: 'user', content: 'First' }, thread);
            thread.push(r1.reply!);

            const r2 = createReply({ role: 'assistant', content: 'Second' }, thread);
            expect(r2.reply!.replyId).toBe('RPL-002');
        });

        it('Test 3: should append to existing thread', () => {
            const existing: ThreadReply[] = [
                { replyId: 'RPL-001', role: 'user', content: 'Hello', createdAt: '2026-01-01' },
            ];
            const result = createReply(
                { role: 'assistant', content: 'Hi there' },
                existing
            );
            expect(result.updatedThread).toHaveLength(2);
            expect(result.updatedThread![1].content).toBe('Hi there');
        });

        it('Test 4: should include author when provided', () => {
            const result = createReply(
                { role: 'assistant', content: 'Working on it', author: 'PlanningAgent' },
                null
            );
            expect(result.reply!.author).toBe('PlanningAgent');
        });

        it('Test 5: should include status when provided', () => {
            const result = createReply(
                { role: 'assistant', content: 'Reviewing', status: 'reviewing' },
                null
            );
            expect(result.reply!.status).toBe('reviewing');
        });

        it('Test 6: should reject empty content', () => {
            const result = createReply({ role: 'user', content: '' }, null);
            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        it('Test 7: should reject content exceeding max length', () => {
            const result = createReply(
                { role: 'user', content: 'x'.repeat(MAX_REPLY_LENGTH + 1) },
                null
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain('maximum length');
        });

        it('Test 8: should reject invalid role', () => {
            const result = createReply(
                { role: 'admin' as any, content: 'Hello' },
                null
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid role');
        });

        it('Test 9: should reject invalid status', () => {
            const result = createReply(
                { role: 'user', content: 'Hello', status: 'invalid' as any },
                null
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid reply status');
        });
    });

    describe('parseThread', () => {
        it('Test 10: should parse valid thread JSON', () => {
            const json = JSON.stringify([
                { replyId: 'RPL-001', role: 'user', content: 'Hello', createdAt: '2026-01-01' },
            ]);
            const thread = parseThread(json);
            expect(thread).toHaveLength(1);
            expect(thread[0].role).toBe('user');
        });

        it('Test 11: should return empty for null/undefined', () => {
            expect(parseThread(null)).toHaveLength(0);
            expect(parseThread(undefined)).toHaveLength(0);
        });

        it('Test 12: should handle corrupted JSON', () => {
            expect(parseThread('not json')).toHaveLength(0);
        });

        it('Test 13: should handle non-array JSON', () => {
            expect(parseThread('{"not":"array"}')).toHaveLength(0);
        });
    });

    describe('serializeThread', () => {
        it('Test 14: should round-trip serialize/parse', () => {
            const thread: ThreadReply[] = [
                { replyId: 'RPL-001', role: 'user', content: 'Hello', createdAt: '2026-01-01' },
            ];
            const json = serializeThread(thread);
            const parsed = parseThread(json);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].content).toBe('Hello');
        });
    });

    describe('getReplyCount', () => {
        it('Test 15: should count replies in array', () => {
            const thread: ThreadReply[] = [
                { replyId: 'RPL-001', role: 'user', content: 'A', createdAt: '2026-01-01' },
                { replyId: 'RPL-002', role: 'assistant', content: 'B', createdAt: '2026-01-01' },
            ];
            expect(getReplyCount(thread)).toBe(2);
        });

        it('Test 16: should count from JSON string', () => {
            const json = JSON.stringify([
                { replyId: 'RPL-001', role: 'user', content: 'A', createdAt: '2026-01-01' },
            ]);
            expect(getReplyCount(json)).toBe(1);
        });

        it('Test 17: should return 0 for null', () => {
            expect(getReplyCount(null)).toBe(0);
            expect(getReplyCount(undefined)).toBe(0);
        });
    });

    describe('getLatestReply', () => {
        it('Test 18: should return last reply', () => {
            const thread: ThreadReply[] = [
                { replyId: 'RPL-001', role: 'user', content: 'First', createdAt: '2026-01-01' },
                { replyId: 'RPL-002', role: 'assistant', content: 'Last', createdAt: '2026-01-02' },
            ];
            const latest = getLatestReply(thread);
            expect(latest!.content).toBe('Last');
        });

        it('Test 19: should return null for empty thread', () => {
            expect(getLatestReply(null)).toBeNull();
            expect(getLatestReply([])).toBeNull();
        });
    });

    describe('getRepliesByRole', () => {
        it('Test 20: should filter by role', () => {
            const thread: ThreadReply[] = [
                { replyId: 'RPL-001', role: 'user', content: 'Q1', createdAt: '2026-01-01' },
                { replyId: 'RPL-002', role: 'assistant', content: 'A1', createdAt: '2026-01-01' },
                { replyId: 'RPL-003', role: 'user', content: 'Q2', createdAt: '2026-01-01' },
            ];
            const userReplies = getRepliesByRole(thread, 'user');
            expect(userReplies).toHaveLength(2);
            expect(userReplies[0].content).toBe('Q1');
        });
    });
});
