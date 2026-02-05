// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator.ts';

interface Ticket {
    status: string;
    title: string | null | undefined;
}

/** @aiContributed-2026-02-04 */
describe('OrchestratorService - isBlockedP1Ticket', () => {
    let orchestratorService: OrchestratorService;

    beforeEach(() => {
        orchestratorService = new OrchestratorService();
    });

    /** @aiContributed-2026-02-04 */
    it('should return false if ticket status is not "blocked"', () => {
        const ticket: Ticket = { status: 'open', title: 'P1 Blocked Issue' };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(false);
    });

    /** @aiContributed-2026-02-04 */
    it('should return true if ticket title starts with "p1 blocked"', () => {
        const ticket: Ticket = { status: 'blocked', title: 'P1 Blocked Issue' };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(true);
    });

    /** @aiContributed-2026-02-04 */
    it('should return true if ticket title starts with "[p1]"', () => {
        const ticket: Ticket = { status: 'blocked', title: '[P1] Critical Bug' };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(true);
    });

    /** @aiContributed-2026-02-04 */
    it('should return true if ticket title starts with "p1:"', () => {
        const ticket: Ticket = { status: 'blocked', title: 'P1: Major Outage' };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(true);
    });

    /** @aiContributed-2026-02-04 */
    it('should return false if ticket title does not match any P1 patterns', () => {
        const ticket: Ticket = { status: 'blocked', title: 'Critical Bug' };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(false);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle case-insensitive title matching', () => {
        const ticket: Ticket = { status: 'blocked', title: 'p1 blocked Issue' };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(true);
    });

    /** @aiContributed-2026-02-04 */
    it('should return false if ticket is null', () => {
        const result = orchestratorService.isBlockedP1Ticket(null);
        expect(result).toBe(false);
    });

    /** @aiContributed-2026-02-04 */
    it('should return false if ticket is undefined', () => {
        const result = orchestratorService.isBlockedP1Ticket(undefined);
        expect(result).toBe(false);
    });

    /** @aiContributed-2026-02-04 */
    it('should return false if ticket title is null', () => {
        const ticket: Ticket = { status: 'blocked', title: null };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(false);
    });

    /** @aiContributed-2026-02-04 */
    it('should return false if ticket title is undefined', () => {
        const ticket: Ticket = { status: 'blocked', title: undefined };
        const result = orchestratorService.isBlockedP1Ticket(ticket);
        expect(result).toBe(false);
    });
});