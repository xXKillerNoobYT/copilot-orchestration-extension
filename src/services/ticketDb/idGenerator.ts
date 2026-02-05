/**
 * Ticket ID Generator
 *
 * Generates unique, sequential ticket IDs in standardized formats.
 * Supports both regular ticket IDs (TK-0001) and master ticket IDs (MT-001).
 *
 * **Simple explanation**: Like a deli counter that gives each customer a
 * unique number. Regular tickets get "TK-0001", "TK-0002", etc.
 * Master tickets get "MT-001" and their sub-tasks get "MT-001.1", "MT-001.2".
 *
 * @module ticketDb/idGenerator
 * @since MT-005.4
 */

import { logInfo, logWarn } from '../../logger';

/**
 * ID format prefixes
 */
export const ID_PREFIXES = {
    /** Regular ticket prefix */
    TICKET: 'TK',
    /** Master ticket prefix */
    MASTER: 'MT',
} as const;

/**
 * Configuration for ID generation
 */
export interface IdGeneratorConfig {
    /** Starting number for ticket IDs (default: 1) */
    startFrom?: number;
    /** Padding length for ticket numbers (default: 4 for TK, 3 for MT) */
    padLength?: number;
}

/**
 * Result of parsing a ticket ID
 */
export interface ParsedTicketId {
    /** The prefix (TK or MT) */
    prefix: string;
    /** The main numeric part */
    number: number;
    /** Sub-ticket number (only for MT sub-tickets like MT-001.3) */
    subNumber?: number;
    /** Whether this is a sub-ticket */
    isSubTicket: boolean;
    /** The full original ID string */
    original: string;
}

/**
 * Ticket ID Generator
 *
 * Manages sequential ID generation for tickets and master tickets.
 * Thread-safe through synchronous counter increments.
 *
 * **Simple explanation**: Keeps track of the last number used for each
 * type of ticket and hands out the next number when asked.
 */
export class TicketIdGenerator {
    /** Current counter for regular tickets (TK-XXXX) */
    private ticketCounter: number;
    /** Current counter for master tickets (MT-XXX) */
    private masterCounter: number;
    /** Track sub-ticket counters per master ticket (MT-XXX -> next sub number) */
    private subTicketCounters: Map<string, number>;
    /** Set of all generated IDs for uniqueness checking */
    private generatedIds: Set<string>;

    constructor(config?: IdGeneratorConfig) {
        this.ticketCounter = (config?.startFrom ?? 1) - 1;
        this.masterCounter = 0;
        this.subTicketCounters = new Map();
        this.generatedIds = new Set();
    }

    /**
     * Generate the next regular ticket ID.
     *
     * **Simple explanation**: Like taking the next number from a deli counter.
     * Returns IDs like "TK-0001", "TK-0002", "TK-0003".
     *
     * @returns A unique ticket ID in format TK-XXXX (zero-padded to 4 digits)
     *
     * @example
     * const gen = new TicketIdGenerator();
     * gen.nextTicketId(); // "TK-0001"
     * gen.nextTicketId(); // "TK-0002"
     */
    nextTicketId(): string {
        this.ticketCounter++;
        const id = formatTicketId(this.ticketCounter);

        // Safety check: if somehow we generated a duplicate, skip ahead
        while (this.generatedIds.has(id)) {
            this.ticketCounter++;
            logWarn(`ID collision detected, skipping to TK-${String(this.ticketCounter).padStart(4, '0')}`);
        }

        const finalId = formatTicketId(this.ticketCounter);
        this.generatedIds.add(finalId);
        logInfo(`Generated ticket ID: ${finalId}`);
        return finalId;
    }

    /**
     * Generate the next master ticket ID.
     *
     * **Simple explanation**: Master tickets are like project folders.
     * Returns IDs like "MT-001", "MT-002", "MT-003".
     *
     * @returns A unique master ticket ID in format MT-XXX (zero-padded to 3 digits)
     *
     * @example
     * const gen = new TicketIdGenerator();
     * gen.nextMasterTicketId(); // "MT-001"
     * gen.nextMasterTicketId(); // "MT-002"
     */
    nextMasterTicketId(): string {
        this.masterCounter++;
        const id = formatMasterTicketId(this.masterCounter);

        while (this.generatedIds.has(id)) {
            this.masterCounter++;
            logWarn(`Master ID collision detected, skipping to MT-${String(this.masterCounter).padStart(3, '0')}`);
        }

        const finalId = formatMasterTicketId(this.masterCounter);
        this.generatedIds.add(finalId);
        logInfo(`Generated master ticket ID: ${finalId}`);
        return finalId;
    }

    /**
     * Generate the next sub-ticket ID for a given master ticket.
     *
     * **Simple explanation**: Sub-tickets are tasks within a project.
     * For master ticket MT-001, sub-tickets are "MT-001.1", "MT-001.2", etc.
     *
     * @param masterTicketId - The parent master ticket ID (e.g., "MT-001")
     * @returns A unique sub-ticket ID in format MT-XXX.Y
     * @throws Error if masterTicketId is not a valid master ticket format
     *
     * @example
     * const gen = new TicketIdGenerator();
     * gen.nextSubTicketId('MT-001'); // "MT-001.1"
     * gen.nextSubTicketId('MT-001'); // "MT-001.2"
     * gen.nextSubTicketId('MT-002'); // "MT-002.1"
     */
    nextSubTicketId(masterTicketId: string): string {
        // Validate the master ticket ID format
        if (!isValidMasterTicketId(masterTicketId)) {
            throw new Error(
                `Invalid master ticket ID: '${masterTicketId}'. Expected format: MT-XXX (e.g., MT-001)`
            );
        }

        // Get or initialize the sub-ticket counter for this master
        const currentCount = this.subTicketCounters.get(masterTicketId) ?? 0;
        const nextCount = currentCount + 1;

        const id = `${masterTicketId}.${nextCount}`;

        // Safety: skip collisions
        let counter = nextCount;
        while (this.generatedIds.has(`${masterTicketId}.${counter}`)) {
            counter++;
            logWarn(`Sub-ticket ID collision detected, skipping to ${masterTicketId}.${counter}`);
        }

        const finalId = `${masterTicketId}.${counter}`;
        this.subTicketCounters.set(masterTicketId, counter);
        this.generatedIds.add(finalId);
        logInfo(`Generated sub-ticket ID: ${finalId}`);
        return finalId;
    }

    /**
     * Seed the generator with existing IDs from the database.
     *
     * **Simple explanation**: When the app restarts, we look at what IDs
     * already exist in the database and set our counters to continue
     * from where we left off.
     *
     * @param existingIds - Array of existing ticket IDs from the database
     *
     * @example
     * const gen = new TicketIdGenerator();
     * gen.seedFromExisting(['TK-0001', 'TK-0002', 'MT-001', 'MT-001.1']);
     * gen.nextTicketId(); // "TK-0003" (continues from highest)
     */
    seedFromExisting(existingIds: string[]): void {
        let maxTicket = 0;
        let maxMaster = 0;
        const subMaxes: Map<string, number> = new Map();

        for (const id of existingIds) {
            this.generatedIds.add(id);

            const parsed = parseTicketId(id);
            if (!parsed) {
                // Skip IDs that don't match our format (e.g., legacy TICKET-xxx-xxx)
                continue;
            }

            if (parsed.prefix === ID_PREFIXES.TICKET) {
                maxTicket = Math.max(maxTicket, parsed.number);
            } else if (parsed.prefix === ID_PREFIXES.MASTER) {
                if (parsed.isSubTicket && parsed.subNumber !== undefined) {
                    // Track sub-ticket max per master
                    const masterPart = `${ID_PREFIXES.MASTER}-${String(parsed.number).padStart(3, '0')}`;
                    const currentMax = subMaxes.get(masterPart) ?? 0;
                    subMaxes.set(masterPart, Math.max(currentMax, parsed.subNumber));
                } else {
                    maxMaster = Math.max(maxMaster, parsed.number);
                }
            }
        }

        this.ticketCounter = maxTicket;
        this.masterCounter = maxMaster;

        for (const [masterId, maxSub] of subMaxes) {
            this.subTicketCounters.set(masterId, maxSub);
        }

        logInfo(
            `ID generator seeded: TK counter=${maxTicket}, MT counter=${maxMaster}, ` +
            `${subMaxes.size} master ticket(s) with sub-tickets`
        );
    }

    /**
     * Get the current state of counters (for debugging/testing).
     *
     * @returns Current counter values
     */
    getState(): {
        ticketCounter: number;
        masterCounter: number;
        subTicketCounters: Record<string, number>;
        totalGenerated: number;
    } {
        const subCounters: Record<string, number> = {};
        for (const [key, value] of this.subTicketCounters) {
            subCounters[key] = value;
        }
        return {
            ticketCounter: this.ticketCounter,
            masterCounter: this.masterCounter,
            subTicketCounters: subCounters,
            totalGenerated: this.generatedIds.size,
        };
    }

    /**
     * Reset the generator (for testing only).
     *
     * @internal
     */
    resetForTests(): void {
        this.ticketCounter = 0;
        this.masterCounter = 0;
        this.subTicketCounters.clear();
        this.generatedIds.clear();
    }
}

// ─── Pure Functions ──────────────────────────────────────────────────────────

/**
 * Format a number as a ticket ID (TK-XXXX).
 *
 * @param num - The ticket number (1-9999)
 * @returns Formatted ticket ID
 *
 * @example
 * formatTicketId(1);   // "TK-0001"
 * formatTicketId(42);  // "TK-0042"
 * formatTicketId(999); // "TK-0999"
 */
export function formatTicketId(num: number): string {
    return `${ID_PREFIXES.TICKET}-${String(num).padStart(4, '0')}`;
}

/**
 * Format a number as a master ticket ID (MT-XXX).
 *
 * @param num - The master ticket number (1-999)
 * @returns Formatted master ticket ID
 *
 * @example
 * formatMasterTicketId(1);   // "MT-001"
 * formatMasterTicketId(42);  // "MT-042"
 */
export function formatMasterTicketId(num: number): string {
    return `${ID_PREFIXES.MASTER}-${String(num).padStart(3, '0')}`;
}

/**
 * Format a sub-ticket ID (MT-XXX.Y).
 *
 * @param masterNum - The master ticket number
 * @param subNum - The sub-ticket number
 * @returns Formatted sub-ticket ID
 *
 * @example
 * formatSubTicketId(1, 3); // "MT-001.3"
 */
export function formatSubTicketId(masterNum: number, subNum: number): string {
    return `${formatMasterTicketId(masterNum)}.${subNum}`;
}

/**
 * Parse a ticket ID string into its components.
 *
 * **Simple explanation**: Takes a ticket ID like "MT-001.3" and breaks it
 * apart so you can see the prefix (MT), number (1), and sub-number (3).
 *
 * @param id - The ticket ID to parse
 * @returns Parsed components or null if format is invalid
 *
 * @example
 * parseTicketId('TK-0042'); // { prefix: 'TK', number: 42, isSubTicket: false, ... }
 * parseTicketId('MT-001.3'); // { prefix: 'MT', number: 1, subNumber: 3, isSubTicket: true, ... }
 * parseTicketId('invalid');  // null
 */
export function parseTicketId(id: string): ParsedTicketId | null {
    // Match TK-XXXX format
    const ticketMatch = id.match(/^(TK)-(\d{4})$/);
    if (ticketMatch) {
        return {
            prefix: ticketMatch[1],
            number: parseInt(ticketMatch[2], 10),
            isSubTicket: false,
            original: id,
        };
    }

    // Match MT-XXX format (master ticket without sub-ticket)
    const masterMatch = id.match(/^(MT)-(\d{3})$/);
    if (masterMatch) {
        return {
            prefix: masterMatch[1],
            number: parseInt(masterMatch[2], 10),
            isSubTicket: false,
            original: id,
        };
    }

    // Match MT-XXX.Y format (sub-ticket)
    const subTicketMatch = id.match(/^(MT)-(\d{3})\.(\d+)$/);
    if (subTicketMatch) {
        return {
            prefix: subTicketMatch[1],
            number: parseInt(subTicketMatch[2], 10),
            subNumber: parseInt(subTicketMatch[3], 10),
            isSubTicket: true,
            original: id,
        };
    }

    return null;
}

/**
 * Validate that a string is a valid ticket ID (TK-XXXX format).
 *
 * @param id - The string to validate
 * @returns true if valid ticket ID format
 */
export function isValidTicketId(id: string): boolean {
    return /^TK-\d{4}$/.test(id);
}

/**
 * Validate that a string is a valid master ticket ID (MT-XXX format).
 *
 * @param id - The string to validate
 * @returns true if valid master ticket ID format
 */
export function isValidMasterTicketId(id: string): boolean {
    return /^MT-\d{3}$/.test(id);
}

/**
 * Validate that a string is a valid sub-ticket ID (MT-XXX.Y format).
 *
 * @param id - The string to validate
 * @returns true if valid sub-ticket ID format
 */
export function isValidSubTicketId(id: string): boolean {
    return /^MT-\d{3}\.\d+$/.test(id);
}

/**
 * Validate any ticket ID format (TK-XXXX, MT-XXX, or MT-XXX.Y).
 *
 * @param id - The string to validate
 * @returns true if any valid ticket ID format
 */
export function isValidAnyTicketId(id: string): boolean {
    return isValidTicketId(id) || isValidMasterTicketId(id) || isValidSubTicketId(id);
}

/**
 * Get the master ticket ID from a sub-ticket ID.
 *
 * **Simple explanation**: Given "MT-001.3", returns "MT-001" (the parent).
 *
 * @param subTicketId - The sub-ticket ID
 * @returns The parent master ticket ID, or null if not a sub-ticket
 *
 * @example
 * getMasterTicketId('MT-001.3'); // "MT-001"
 * getMasterTicketId('MT-001');   // null (already a master)
 * getMasterTicketId('TK-0001'); // null (not a master ticket)
 */
export function getMasterTicketId(subTicketId: string): string | null {
    const parsed = parseTicketId(subTicketId);
    if (parsed && parsed.isSubTicket) {
        return formatMasterTicketId(parsed.number);
    }
    return null;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let generatorInstance: TicketIdGenerator | null = null;

/**
 * Initialize the global ID generator.
 *
 * **Simple explanation**: Sets up the number counter so the app can
 * start handing out ticket IDs.
 *
 * @param existingIds - Optional array of existing IDs to seed from
 */
export function initializeIdGenerator(existingIds?: string[]): void {
    generatorInstance = new TicketIdGenerator();
    if (existingIds && existingIds.length > 0) {
        generatorInstance.seedFromExisting(existingIds);
    }
    logInfo('Ticket ID generator initialized');
}

/**
 * Get the global ID generator instance.
 *
 * @returns The generator instance
 * @throws Error if not initialized
 */
export function getIdGenerator(): TicketIdGenerator {
    if (!generatorInstance) {
        throw new Error('ID generator not initialized. Call initializeIdGenerator() first.');
    }
    return generatorInstance;
}

/**
 * Reset the generator for testing.
 *
 * @internal
 */
export function resetIdGeneratorForTests(): void {
    generatorInstance = null;
}
