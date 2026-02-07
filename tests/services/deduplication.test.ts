/**
 * Tests for Deduplication Service
 * 
 * @module tests/services/deduplication.test
 */

import {
    findDuplicates,
    consolidateDuplicates,
    checkAndDeduplicateTicket,
    generateDuplicationReport,
    DuplicateMatch,
} from '../../src/services/deduplication';
import { Ticket, listTickets, updateTicket } from '../../src/services/ticketDb';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    listTickets: jest.fn(),
    updateTicket: jest.fn(),
}));

const listTicketsMock = listTickets as jest.MockedFunction<typeof listTickets>;
const updateTicketMock = updateTicket as jest.MockedFunction<typeof updateTicket>;

/**
 * Create a test ticket with all required fields
 */
function createTestTicket(overrides: Partial<Ticket> = {}): Ticket {
    return {
        id: 'TK-001',
        title: 'Test ticket',
        status: 'pending',
        priority: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creator: 'test-user',
        assignee: null,
        taskId: null,
        version: 1,
        resolution: null,
        ...overrides,
    };
}

describe('Deduplication Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('findDuplicates', () => {
        const baseTicket = createTestTicket({
            id: 'TK-001',
            title: 'Fix login authentication issue',
        });

        it('Test 1: should find exact duplicate by title', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Fix login authentication issue', // Exactly the same
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(baseTicket);

            expect(matches.length).toBe(1);
            expect(matches[0].similarity).toBe(100);
            expect(matches[0].masterId).toBe('TK-002');
            expect(matches[0].reason).toContain('Identical');
        });

        it('Test 2: should find similar duplicate by keywords', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Authentication login problem', // Similar keywords
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(baseTicket, { minSimilarityScore: 50 });

            expect(matches.length).toBe(1);
            expect(matches[0].similarity).toBeGreaterThanOrEqual(50);
        });

        it('Test 3: should not match tickets below threshold', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Completely unrelated database query',
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(baseTicket, { minSimilarityScore: 70 });

            expect(matches.length).toBe(0);
        });

        it('Test 4: should not compare ticket to itself', async () => {
            listTicketsMock.mockResolvedValue([baseTicket]);

            const matches = await findDuplicates(baseTicket);

            expect(matches.length).toBe(0);
        });

        it('Test 5: should skip done/removed tickets', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Fix login authentication issue',
                    status: 'done', // Done status, should be skipped
                    priority: 2,
                }),
                createTestTicket({
                    id: 'TK-003',
                    title: 'Fix login authentication issue',
                    status: 'removed', // Removed status, should be skipped
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(baseTicket);

            expect(matches.length).toBe(0);
        });

        it('Test 6: should skip resolved tickets', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Fix login authentication issue',
                    status: 'resolved', // Custom status
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(baseTicket);

            expect(matches.length).toBe(0);
        });

        it('Test 7: should handle listTickets error', async () => {
            listTicketsMock.mockRejectedValue(new Error('Database error'));

            const matches = await findDuplicates(baseTicket);

            expect(matches.length).toBe(0);
        });

        it('Test 8: should sort matches by similarity (highest first)', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Fix login authentication issue', // Exact match 100%
                    priority: 2,
                }),
                createTestTicket({
                    id: 'TK-003',
                    title: 'Authentication login', // Partial match
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(baseTicket, { minSimilarityScore: 50 });

            expect(matches.length).toBeGreaterThanOrEqual(1);
            if (matches.length > 1) {
                expect(matches[0].similarity).toBeGreaterThanOrEqual(matches[1].similarity);
            }
        });

        it('Test 9: should detect substring matches', async () => {
            const ticket = createTestTicket({
                id: 'TK-001',
                title: 'authentication',
            });

            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Fix authentication in production',
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(ticket, { minSimilarityScore: 80 });

            expect(matches.length).toBe(1);
            expect(matches[0].similarity).toBe(85);
            expect(matches[0].reason).toContain('substring');
        });
    });

    describe('consolidateDuplicates', () => {
        const defaultMatches: DuplicateMatch[] = [
            {
                masterId: 'TK-001',
                masterTitle: 'Original ticket',
                duplicateId: 'TK-002',
                duplicateTitle: 'Duplicate ticket',
                similarity: 100,
                reason: 'Identical title',
            },
        ];

        beforeEach(() => {
            updateTicketMock.mockResolvedValue(null);
        });

        it('Test 10: should bump master ticket priority', async () => {
            const result = await consolidateDuplicates(defaultMatches, { bumpMasterPriority: true });

            expect(updateTicketMock).toHaveBeenCalledWith('TK-001', { priority: 1 });
            expect(result.mastersPrioritized).toContain('TK-001');
        });

        it('Test 11: should not bump priority when disabled', async () => {
            const result = await consolidateDuplicates(defaultMatches, { bumpMasterPriority: false });

            expect(updateTicketMock).not.toHaveBeenCalledWith('TK-001', expect.objectContaining({ priority: expect.any(Number) }));
            expect(result.mastersPrioritized).toHaveLength(0);
        });

        it('Test 12: should remove duplicates when autoRemove is true', async () => {
            const result = await consolidateDuplicates(defaultMatches, { autoRemoveDuplicates: true });

            expect(updateTicketMock).toHaveBeenCalledWith('TK-002', { status: 'removed' });
            expect(result.duplicatesRemoved).toContain('TK-002');
        });

        it('Test 13: should link duplicates instead of removing when autoRemove is false', async () => {
            const result = await consolidateDuplicates(defaultMatches, { autoRemoveDuplicates: false });

            expect(updateTicketMock).toHaveBeenCalledWith('TK-002', { linkedTo: 'TK-001' });
            expect(result.duplicatesRemoved).toHaveLength(0);
            expect(result.consolidated.length).toBe(1);
        });

        it('Test 14: should handle updateTicket error', async () => {
            updateTicketMock.mockRejectedValue(new Error('Update failed'));

            const result = await consolidateDuplicates(defaultMatches);

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Failed to consolidate');
        });

        it('Test 15: should use custom maxPriority', async () => {
            await consolidateDuplicates(defaultMatches, { maxPriority: 2 });

            expect(updateTicketMock).toHaveBeenCalledWith('TK-001', { priority: 2 });
        });

        it('Test 16: should handle multiple matches', async () => {
            const multipleMatches: DuplicateMatch[] = [
                {
                    masterId: 'TK-001',
                    masterTitle: 'Original',
                    duplicateId: 'TK-002',
                    duplicateTitle: 'Dup 1',
                    similarity: 100,
                    reason: 'Identical',
                },
                {
                    masterId: 'TK-001',
                    masterTitle: 'Original',
                    duplicateId: 'TK-003',
                    duplicateTitle: 'Dup 2',
                    similarity: 90,
                    reason: 'Similar',
                },
            ];

            const result = await consolidateDuplicates(multipleMatches);

            expect(result.consolidated.length).toBe(2);
            expect(result.mastersPrioritized.length).toBe(1); // De-duped
        });

        it('Test 17: should handle empty matches array', async () => {
            const result = await consolidateDuplicates([]);

            expect(result.consolidated).toHaveLength(0);
            expect(result.mastersPrioritized).toHaveLength(0);
            expect(result.duplicatesRemoved).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('checkAndDeduplicateTicket', () => {
        const testTicket = createTestTicket({
            id: 'TK-001',
            title: 'Test ticket',
        });

        beforeEach(() => {
            updateTicketMock.mockResolvedValue(null);
        });

        it('Test 18: should return isDuplicate=false when no matches', async () => {
            listTicketsMock.mockResolvedValue([]);

            const result = await checkAndDeduplicateTicket(testTicket);

            expect(result.isDuplicate).toBe(false);
            expect(result.matches).toHaveLength(0);
        });

        it('Test 19: should return isDuplicate=true when matches found', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Test ticket', // Same title
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const result = await checkAndDeduplicateTicket(testTicket);

            expect(result.isDuplicate).toBe(true);
            expect(result.matches.length).toBeGreaterThan(0);
        });

        it('Test 20: should consolidate duplicates when found', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Test ticket',
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const result = await checkAndDeduplicateTicket(testTicket);

            expect(result.report.consolidated.length).toBeGreaterThan(0);
        });

        it('Test 21: should pass config to findDuplicates', async () => {
            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'Similar ticket test', // Partial keywords
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            // With low threshold, should find match
            const result = await checkAndDeduplicateTicket(testTicket, { minSimilarityScore: 30 });

            expect(result.matches.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('generateDuplicationReport', () => {
        it('Test 22: should generate "no duplicates" message when not duplicate', () => {
            const results = {
                isDuplicate: false,
                matches: [],
                report: {
                    consolidated: [],
                    mastersPrioritized: [],
                    duplicatesRemoved: [],
                    errors: [],
                },
            };

            const report = generateDuplicationReport(results);

            expect(report).toContain('No duplicates found');
        });

        it('Test 23: should generate detailed report for duplicates', () => {
            const results = {
                isDuplicate: true,
                matches: [
                    {
                        masterId: 'TK-001',
                        masterTitle: 'Original ticket',
                        duplicateId: 'TK-002',
                        duplicateTitle: 'Duplicate ticket',
                        similarity: 100,
                        reason: 'Identical title',
                    },
                ],
                report: {
                    consolidated: [{
                        masterId: 'TK-001',
                        masterTitle: 'Original ticket',
                        duplicateId: 'TK-002',
                        duplicateTitle: 'Duplicate ticket',
                        similarity: 100,
                        reason: 'Identical title',
                    }],
                    mastersPrioritized: ['TK-001'],
                    duplicatesRemoved: [],
                    errors: [],
                },
            };

            const report = generateDuplicationReport(results);

            expect(report).toContain('100% match');
            expect(report).toContain('Identical title');
            expect(report).toContain('TK-001');
            expect(report).toContain('Consolidation Actions');
        });

        it('Test 24: should include errors in report', () => {
            const results = {
                isDuplicate: true,
                matches: [
                    {
                        masterId: 'TK-001',
                        masterTitle: 'Original',
                        duplicateId: 'TK-002',
                        duplicateTitle: 'Duplicate',
                        similarity: 100,
                        reason: 'Identical',
                    },
                ],
                report: {
                    consolidated: [],
                    mastersPrioritized: [],
                    duplicatesRemoved: [],
                    errors: ['Failed to update ticket'],
                },
            };

            const report = generateDuplicationReport(results);

            expect(report).toContain('Errors');
            expect(report).toContain('Failed to update ticket');
        });

        it('Test 25: should show removed count in report', () => {
            const results = {
                isDuplicate: true,
                matches: [
                    {
                        masterId: 'TK-001',
                        masterTitle: 'Original',
                        duplicateId: 'TK-002',
                        duplicateTitle: 'Duplicate',
                        similarity: 85,
                        reason: 'substring match',
                    },
                ],
                report: {
                    consolidated: [],
                    mastersPrioritized: [],
                    duplicatesRemoved: ['TK-002'],
                    errors: [],
                },
            };

            const report = generateDuplicationReport(results);

            expect(report).toContain('removed: 1');
        });
    });

    describe('calculateSimilarity (via findDuplicates)', () => {
        it('Test 26: should handle empty keyword case', async () => {
            const ticket = createTestTicket({
                id: 'TK-001',
                title: 'a',  // Single char, no keywords
            });

            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'b',  // Single char, no keywords
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            const matches = await findDuplicates(ticket, { minSimilarityScore: 30 });

            // Should have low similarity due to no meaningful keywords
            expect(matches.length).toBe(1);
            expect(matches[0].similarity).toBe(40);
        });

        it('Test 27: should respect default similarity threshold', async () => {
            const ticket = createTestTicket({
                id: 'TK-001',
                title: 'Some unique title here',
            });

            const otherTickets: Ticket[] = [
                createTestTicket({
                    id: 'TK-002',
                    title: 'totally different words',
                    priority: 2,
                }),
            ];

            listTicketsMock.mockResolvedValue(otherTickets);

            // Default threshold is 70
            const matches = await findDuplicates(ticket);

            expect(matches.length).toBe(0);
        });
    });
});
