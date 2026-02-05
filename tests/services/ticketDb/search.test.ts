/**
 * Tests for Ticket Search Module
 *
 * Covers: MT-006.6 (searchTickets)
 *
 * @since MT-006.6
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    searchTickets,
    buildSearchSQL,
    highlightMatches,
} from '../../../src/services/ticketDb/search';

const mockTickets = [
    { id: 'TK-0001', title: 'Fix login page crash', description: 'Login page throws error on submit', status: 'open', creator: 'PlanningAgent' },
    { id: 'TK-0002', title: 'Add dark mode toggle', description: 'Users want dark theme support', status: 'open', creator: 'human' },
    { id: 'TK-0003', title: 'Login timeout too short', description: 'Session expires after 5 minutes', status: 'done', creator: 'PlanningAgent' },
    { id: 'TK-0004', title: 'Database migration script', description: 'Need to migrate schema', status: 'in-progress', creator: 'system' },
    { id: 'TK-0005', title: 'Update README', description: 'Documentation needs refresh', status: 'open', creator: 'human' },
];

describe('Ticket Search (MT-006.6)', () => {

    describe('searchTickets', () => {
        it('Test 1: should find tickets by title keyword', () => {
            const results = searchTickets(mockTickets, 'login');
            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results[0].item.id).toBe('TK-0001'); // title match ranks higher
        });

        it('Test 2: should return empty for empty query', () => {
            expect(searchTickets(mockTickets, '')).toHaveLength(0);
            expect(searchTickets(mockTickets, '   ')).toHaveLength(0);
        });

        it('Test 3: should be case-insensitive by default', () => {
            const results = searchTickets(mockTickets, 'LOGIN');
            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 4: should find tickets by description keyword', () => {
            const results = searchTickets(mockTickets, 'schema');
            expect(results.length).toBe(1);
            expect(results[0].item.id).toBe('TK-0004');
            expect(results[0].matchedFields).toContain('description');
        });

        it('Test 5: should rank title matches higher', () => {
            const results = searchTickets(mockTickets, 'login');
            // TK-0001 has "login" in title AND description
            // TK-0003 has "Login" in title
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        });

        it('Test 6: should support multi-word queries', () => {
            const results = searchTickets(mockTickets, 'login page');
            expect(results.length).toBeGreaterThanOrEqual(1);
            // TK-0001 matches both words
            expect(results[0].item.id).toBe('TK-0001');
        });

        it('Test 7: should respect limit option', () => {
            const results = searchTickets(mockTickets, 'login', { limit: 1 });
            expect(results.length).toBe(1);
        });

        it('Test 8: should return empty when no matches', () => {
            const results = searchTickets(mockTickets, 'zzzznonexistent');
            expect(results).toHaveLength(0);
        });

        it('Test 9: should track matched fields', () => {
            const results = searchTickets(mockTickets, 'login');
            expect(results[0].matchedFields).toContain('title');
        });

        it('Test 10: should handle special characters in query', () => {
            // Should not throw
            expect(() => searchTickets(mockTickets, 'test [bracket]')).not.toThrow();
            expect(() => searchTickets(mockTickets, 'test (paren)')).not.toThrow();
        });
    });

    describe('buildSearchSQL', () => {
        it('Test 11: should build LIKE clause for single term', () => {
            const { whereClause, params } = buildSearchSQL('login');
            expect(whereClause).toContain('LIKE ?');
            expect(params.length).toBeGreaterThan(0);
            expect(params[0]).toBe('%login%');
        });

        it('Test 12: should build clause for multiple terms', () => {
            const { whereClause, params } = buildSearchSQL('login page');
            expect(whereClause).toContain('AND');
            expect(params.length).toBe(4); // 2 terms * 2 fields
        });

        it('Test 13: should handle empty query', () => {
            const { whereClause, params } = buildSearchSQL('');
            expect(whereClause).toBe('1=1');
            expect(params).toHaveLength(0);
        });

        it('Test 14: should support custom search fields', () => {
            const { params } = buildSearchSQL('test', ['title', 'description', 'creator']);
            expect(params.length).toBe(3); // 1 term * 3 fields
        });
    });

    describe('highlightMatches', () => {
        it('Test 15: should highlight matching terms', () => {
            const result = highlightMatches('Fix login page crash', 'login');
            expect(result).toContain('**login**');
        });

        it('Test 16: should highlight multiple terms', () => {
            const result = highlightMatches('Fix login page crash', 'login crash');
            expect(result).toContain('**login**');
            expect(result).toContain('**crash**');
        });

        it('Test 17: should be case-insensitive', () => {
            const result = highlightMatches('Fix Login Page', 'login');
            expect(result).toContain('**Login**');
        });

        it('Test 18: should handle empty inputs', () => {
            expect(highlightMatches('', 'test')).toBe('');
            expect(highlightMatches('test', '')).toBe('test');
        });

        it('Test 19: should support custom markers', () => {
            const result = highlightMatches('Fix login page', 'login', '`');
            expect(result).toContain('`login`');
        });
    });
});
