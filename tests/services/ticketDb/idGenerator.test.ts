/**
 * Tests for Ticket ID Generator
 *
 * Covers: MT-005.4 (Ticket ID generator) and MT-005.5 (Master ticket ID generator)
 *
 * @since MT-005.4
 */

// Mock logger before imports
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    TicketIdGenerator,
    formatTicketId,
    formatMasterTicketId,
    formatSubTicketId,
    parseTicketId,
    isValidTicketId,
    isValidMasterTicketId,
    isValidSubTicketId,
    isValidAnyTicketId,
    getMasterTicketId,
    initializeIdGenerator,
    getIdGenerator,
    resetIdGeneratorForTests,
    ID_PREFIXES,
} from '../../../src/services/ticketDb/idGenerator';

describe('Ticket ID Generator (MT-005.4 & MT-005.5)', () => {
    let generator: TicketIdGenerator;

    beforeEach(() => {
        generator = new TicketIdGenerator();
        resetIdGeneratorForTests();
    });

    // ─── Format Functions ────────────────────────────────────────────────

    describe('Format Functions', () => {
        it('Test 1: should format ticket ID with zero-padding', () => {
            expect(formatTicketId(1)).toBe('TK-0001');
            expect(formatTicketId(42)).toBe('TK-0042');
            expect(formatTicketId(999)).toBe('TK-0999');
            expect(formatTicketId(9999)).toBe('TK-9999');
        });

        it('Test 2: should format master ticket ID with zero-padding', () => {
            expect(formatMasterTicketId(1)).toBe('MT-001');
            expect(formatMasterTicketId(42)).toBe('MT-042');
            expect(formatMasterTicketId(999)).toBe('MT-999');
        });

        it('Test 3: should format sub-ticket ID correctly', () => {
            expect(formatSubTicketId(1, 1)).toBe('MT-001.1');
            expect(formatSubTicketId(1, 3)).toBe('MT-001.3');
            expect(formatSubTicketId(42, 10)).toBe('MT-042.10');
        });
    });

    // ─── Parse Functions ─────────────────────────────────────────────────

    describe('Parse Functions', () => {
        it('Test 4: should parse valid ticket ID', () => {
            const result = parseTicketId('TK-0042');
            expect(result).not.toBeNull();
            expect(result!.prefix).toBe('TK');
            expect(result!.number).toBe(42);
            expect(result!.isSubTicket).toBe(false);
            expect(result!.original).toBe('TK-0042');
        });

        it('Test 5: should parse valid master ticket ID', () => {
            const result = parseTicketId('MT-001');
            expect(result).not.toBeNull();
            expect(result!.prefix).toBe('MT');
            expect(result!.number).toBe(1);
            expect(result!.isSubTicket).toBe(false);
        });

        it('Test 6: should parse valid sub-ticket ID', () => {
            const result = parseTicketId('MT-001.3');
            expect(result).not.toBeNull();
            expect(result!.prefix).toBe('MT');
            expect(result!.number).toBe(1);
            expect(result!.subNumber).toBe(3);
            expect(result!.isSubTicket).toBe(true);
        });

        it('Test 7: should return null for invalid IDs', () => {
            expect(parseTicketId('invalid')).toBeNull();
            expect(parseTicketId('TICKET-123')).toBeNull();
            expect(parseTicketId('TK-01')).toBeNull();    // Too short
            expect(parseTicketId('MT-01')).toBeNull();     // Too short
            expect(parseTicketId('')).toBeNull();
            expect(parseTicketId('MT-')).toBeNull();
        });

        it('Test 8: should return null for legacy format IDs', () => {
            expect(parseTicketId('TICKET-1738500000-abc123')).toBeNull();
        });
    });

    // ─── Validation Functions ────────────────────────────────────────────

    describe('Validation Functions', () => {
        it('Test 9: should validate ticket IDs correctly', () => {
            expect(isValidTicketId('TK-0001')).toBe(true);
            expect(isValidTicketId('TK-9999')).toBe(true);
            expect(isValidTicketId('MT-001')).toBe(false);
            expect(isValidTicketId('TK-01')).toBe(false);
            expect(isValidTicketId('invalid')).toBe(false);
        });

        it('Test 10: should validate master ticket IDs correctly', () => {
            expect(isValidMasterTicketId('MT-001')).toBe(true);
            expect(isValidMasterTicketId('MT-999')).toBe(true);
            expect(isValidMasterTicketId('TK-0001')).toBe(false);
            expect(isValidMasterTicketId('MT-01')).toBe(false);
            expect(isValidMasterTicketId('MT-001.1')).toBe(false);
        });

        it('Test 11: should validate sub-ticket IDs correctly', () => {
            expect(isValidSubTicketId('MT-001.1')).toBe(true);
            expect(isValidSubTicketId('MT-001.10')).toBe(true);
            expect(isValidSubTicketId('MT-999.999')).toBe(true);
            expect(isValidSubTicketId('MT-001')).toBe(false);
            expect(isValidSubTicketId('TK-0001')).toBe(false);
        });

        it('Test 12: should validate any ticket ID format', () => {
            expect(isValidAnyTicketId('TK-0001')).toBe(true);
            expect(isValidAnyTicketId('MT-001')).toBe(true);
            expect(isValidAnyTicketId('MT-001.1')).toBe(true);
            expect(isValidAnyTicketId('invalid')).toBe(false);
            expect(isValidAnyTicketId('TICKET-123-abc')).toBe(false);
        });
    });

    // ─── getMasterTicketId ───────────────────────────────────────────────

    describe('getMasterTicketId', () => {
        it('Test 13: should extract master ID from sub-ticket', () => {
            expect(getMasterTicketId('MT-001.3')).toBe('MT-001');
            expect(getMasterTicketId('MT-042.10')).toBe('MT-042');
        });

        it('Test 14: should return null for non-sub-tickets', () => {
            expect(getMasterTicketId('MT-001')).toBeNull();
            expect(getMasterTicketId('TK-0001')).toBeNull();
            expect(getMasterTicketId('invalid')).toBeNull();
        });
    });

    // ─── TicketIdGenerator Class ─────────────────────────────────────────

    describe('TicketIdGenerator - Regular Tickets', () => {
        it('Test 15: should generate sequential ticket IDs', () => {
            expect(generator.nextTicketId()).toBe('TK-0001');
            expect(generator.nextTicketId()).toBe('TK-0002');
            expect(generator.nextTicketId()).toBe('TK-0003');
        });

        it('Test 16: should generate 100 unique ticket IDs', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generator.nextTicketId());
            }
            expect(ids.size).toBe(100);

            // Verify sequential
            expect(ids.has('TK-0001')).toBe(true);
            expect(ids.has('TK-0050')).toBe(true);
            expect(ids.has('TK-0100')).toBe(true);
        });

        it('Test 17: should start from custom number', () => {
            const customGen = new TicketIdGenerator({ startFrom: 50 });
            expect(customGen.nextTicketId()).toBe('TK-0050');
            expect(customGen.nextTicketId()).toBe('TK-0051');
        });

        it('Test 18: should track counter state', () => {
            generator.nextTicketId();
            generator.nextTicketId();
            const state = generator.getState();
            expect(state.ticketCounter).toBe(2);
            expect(state.totalGenerated).toBe(2);
        });
    });

    describe('TicketIdGenerator - Master Tickets', () => {
        it('Test 19: should generate sequential master ticket IDs', () => {
            expect(generator.nextMasterTicketId()).toBe('MT-001');
            expect(generator.nextMasterTicketId()).toBe('MT-002');
            expect(generator.nextMasterTicketId()).toBe('MT-003');
        });

        it('Test 20: should support up to MT-999', () => {
            // Set counter to 998 by seeding
            generator.seedFromExisting(['MT-998']);
            expect(generator.nextMasterTicketId()).toBe('MT-999');
        });

        it('Test 21: should track master counter state', () => {
            generator.nextMasterTicketId();
            generator.nextMasterTicketId();
            const state = generator.getState();
            expect(state.masterCounter).toBe(2);
        });
    });

    describe('TicketIdGenerator - Sub-Tickets', () => {
        it('Test 22: should generate sequential sub-ticket IDs', () => {
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.1');
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.2');
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.3');
        });

        it('Test 23: should track sub-tickets per master independently', () => {
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.1');
            expect(generator.nextSubTicketId('MT-002')).toBe('MT-002.1');
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.2');
            expect(generator.nextSubTicketId('MT-002')).toBe('MT-002.2');
        });

        it('Test 24: should support up to MT-XXX.999', () => {
            generator.seedFromExisting(['MT-001.998']);
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.999');
        });

        it('Test 25: should throw for invalid master ticket ID', () => {
            expect(() => generator.nextSubTicketId('TK-0001')).toThrow('Invalid master ticket ID');
            expect(() => generator.nextSubTicketId('invalid')).toThrow('Invalid master ticket ID');
            expect(() => generator.nextSubTicketId('MT-001.1')).toThrow('Invalid master ticket ID');
        });

        it('Test 26: should track sub-ticket counters in state', () => {
            generator.nextSubTicketId('MT-001');
            generator.nextSubTicketId('MT-001');
            generator.nextSubTicketId('MT-002');

            const state = generator.getState();
            expect(state.subTicketCounters).toEqual({
                'MT-001': 2,
                'MT-002': 1,
            });
        });
    });

    // ─── Seeding from Existing IDs ───────────────────────────────────────

    describe('Seed from Existing', () => {
        it('Test 27: should seed ticket counter from existing IDs', () => {
            generator.seedFromExisting(['TK-0001', 'TK-0002', 'TK-0005']);
            // Should continue from highest (5)
            expect(generator.nextTicketId()).toBe('TK-0006');
        });

        it('Test 28: should seed master counter from existing IDs', () => {
            generator.seedFromExisting(['MT-001', 'MT-003']);
            // Should continue from highest (3)
            expect(generator.nextMasterTicketId()).toBe('MT-004');
        });

        it('Test 29: should seed sub-ticket counters from existing IDs', () => {
            generator.seedFromExisting(['MT-001.1', 'MT-001.3', 'MT-002.2']);
            // Should continue from highest per master
            expect(generator.nextSubTicketId('MT-001')).toBe('MT-001.4');
            expect(generator.nextSubTicketId('MT-002')).toBe('MT-002.3');
        });

        it('Test 30: should handle mixed ID formats', () => {
            generator.seedFromExisting([
                'TK-0010',
                'MT-005',
                'MT-005.3',
                'MT-002.1',
                'TICKET-12345-abc', // Legacy format - should be skipped
            ]);

            expect(generator.nextTicketId()).toBe('TK-0011');
            expect(generator.nextMasterTicketId()).toBe('MT-006');
            expect(generator.nextSubTicketId('MT-005')).toBe('MT-005.4');
        });

        it('Test 31: should handle empty seed array', () => {
            generator.seedFromExisting([]);
            expect(generator.nextTicketId()).toBe('TK-0001');
            expect(generator.nextMasterTicketId()).toBe('MT-001');
        });

        it('Test 32: should handle gaps gracefully', () => {
            generator.seedFromExisting(['TK-0001', 'TK-0100']);
            // Should continue from highest, not fill gaps
            expect(generator.nextTicketId()).toBe('TK-0101');
        });
    });

    // ─── Reset ───────────────────────────────────────────────────────────

    describe('Reset', () => {
        it('Test 33: should reset all counters', () => {
            generator.nextTicketId();
            generator.nextMasterTicketId();
            generator.nextSubTicketId('MT-001');

            generator.resetForTests();

            expect(generator.nextTicketId()).toBe('TK-0001');
            expect(generator.nextMasterTicketId()).toBe('MT-001');
            expect(generator.getState().totalGenerated).toBe(2);
        });
    });

    // ─── Singleton Functions ─────────────────────────────────────────────

    describe('Singleton Pattern', () => {
        it('Test 34: should initialize and retrieve singleton', () => {
            initializeIdGenerator();
            const instance = getIdGenerator();
            expect(instance).toBeInstanceOf(TicketIdGenerator);
        });

        it('Test 35: should throw when not initialized', () => {
            expect(() => getIdGenerator()).toThrow('ID generator not initialized');
        });

        it('Test 36: should seed singleton from existing IDs', () => {
            initializeIdGenerator(['TK-0010', 'MT-003']);
            const instance = getIdGenerator();
            expect(instance.nextTicketId()).toBe('TK-0011');
            expect(instance.nextMasterTicketId()).toBe('MT-004');
        });

        it('Test 37: should reset singleton', () => {
            initializeIdGenerator();
            resetIdGeneratorForTests();
            expect(() => getIdGenerator()).toThrow('ID generator not initialized');
        });
    });

    // ─── ID Prefixes ─────────────────────────────────────────────────────

    describe('Constants', () => {
        it('Test 38: should export correct prefixes', () => {
            expect(ID_PREFIXES.TICKET).toBe('TK');
            expect(ID_PREFIXES.MASTER).toBe('MT');
        });
    });
});
