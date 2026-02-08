/**
 * Tests for State Conflict Error Handlers
 *
 * Tests the state error creation, throw behavior, state machine validation,
 * and detection functions defined in src/errors/stateErrors.ts.
 *
 * **Simple explanation**: Verifies that all the "conflict" and "locked"
 * error helpers produce correct messages, codes, and resolution steps,
 * and that the ticket state machine enforces valid transitions.
 */

import {
    StateError,
    createTaskInProgressError,
    throwTaskInProgress,
    createInvalidTransitionError,
    throwInvalidTransition,
    createResourceLockedError,
    throwResourceLocked,
    createTicketConflictError,
    throwTicketConflict,
    TICKET_STATE_MACHINE,
    validateTicketTransition,
    isStateConflictError,
} from '../../src/errors/stateErrors';
import { ErrorCode } from '../../src/errors/errorCodes';

describe('stateErrors', () => {
    // ── createTaskInProgressError ──────────────────────────────────────

    describe('createTaskInProgressError', () => {
        it('Test 1: should create error with correct code and message', () => {
            const error = createTaskInProgressError('TICKET-123', 'verify');

            expect(error.code).toBe(ErrorCode.INVALID_STATE);
            expect(error.message).toBe(
                "Cannot verify: task 'TICKET-123' is already in progress"
            );
        });

        it('Test 2: should include resourceId and currentState', () => {
            const error = createTaskInProgressError('TASK-42', 'build');

            expect(error.resourceId).toBe('TASK-42');
            expect(error.currentState).toBe('in-progress');
        });

        it('Test 3: should provide resolution steps that reference the task', () => {
            const error = createTaskInProgressError('TASK-99', 'deploy');

            expect(error.resolutionSteps).toBeDefined();
            expect(error.resolutionSteps!.length).toBe(3);
            expect(error.resolutionSteps![0]).toContain('TASK-99');
            expect(error.resolutionSteps![1]).toContain('task queue');
            expect(error.resolutionSteps![2]).toContain('blocked');
        });

        it('Test 4: should handle special characters in taskId and operation', () => {
            const error = createTaskInProgressError(
                'task/with spaces & symbols!',
                'an operation with "quotes"'
            );

            expect(error.message).toContain('task/with spaces & symbols!');
            expect(error.message).toContain('an operation with "quotes"');
        });
    });

    // ── throwTaskInProgress ───────────────────────────────────────────

    describe('throwTaskInProgress', () => {
        it('Test 5: should throw an Error with code prefix and message', () => {
            expect(() => throwTaskInProgress('T-1', 'start')).toThrow(Error);

            try {
                throwTaskInProgress('T-1', 'start');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_STATE]');
                expect(err.message).toContain("task 'T-1' is already in progress");
            }
        });

        it('Test 6: should have return type never (always throws)', () => {
            // Verify it never returns by ensuring the function always throws
            let didThrow = false;
            try {
                throwTaskInProgress('X', 'op');
            } catch {
                didThrow = true;
            }
            expect(didThrow).toBe(true);
        });
    });

    // ── createInvalidTransitionError ──────────────────────────────────

    describe('createInvalidTransitionError', () => {
        it('Test 7: should create error with transition details', () => {
            const error = createInvalidTransitionError(
                'RES-1',
                'open',
                'done',
                ['in-progress', 'blocked', 'pending']
            );

            expect(error.code).toBe(ErrorCode.INVALID_STATE);
            expect(error.message).toBe(
                "Invalid state transition for 'RES-1': cannot go from 'open' to 'done'"
            );
            expect(error.resourceId).toBe('RES-1');
            expect(error.currentState).toBe('open');
            expect(error.requestedState).toBe('done');
        });

        it('Test 8: should list allowed transitions in resolution steps', () => {
            const allowed = ['in-progress', 'blocked'];
            const error = createInvalidTransitionError('T-5', 'open', 'done', allowed);

            expect(error.resolutionSteps).toBeDefined();
            expect(error.resolutionSteps!.length).toBe(3);
            expect(error.resolutionSteps![1]).toContain('in-progress, blocked');
            expect(error.resolutionSteps![2]).toContain("'done'");
        });

        it('Test 9: should handle empty allowed transitions array', () => {
            const error = createInvalidTransitionError('T-10', 'done', 'open', []);

            expect(error.resolutionSteps![1]).toContain('Allowed transitions: ');
        });
    });

    // ── throwInvalidTransition ────────────────────────────────────────

    describe('throwInvalidTransition', () => {
        it('Test 10: should throw Error with code prefix and transition info', () => {
            expect(() =>
                throwInvalidTransition('R-1', 'open', 'done', ['in-progress'])
            ).toThrow(Error);

            try {
                throwInvalidTransition('R-1', 'open', 'done', ['in-progress']);
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_STATE]');
                expect(err.message).toContain("cannot go from 'open' to 'done'");
            }
        });
    });

    // ── createResourceLockedError ─────────────────────────────────────

    describe('createResourceLockedError', () => {
        it('Test 11: should create locked error with lockedBy info', () => {
            const error = createResourceLockedError('DB-CONN', 'migration-worker');

            expect(error.code).toBe(ErrorCode.INVALID_STATE);
            expect(error.message).toBe(
                "Resource 'DB-CONN' is locked by migration-worker"
            );
            expect(error.resourceId).toBe('DB-CONN');
            expect(error.currentState).toBe('locked');
        });

        it('Test 12: should omit lockedBy clause when not provided', () => {
            const error = createResourceLockedError('FILE-1');

            expect(error.message).toBe("Resource 'FILE-1' is locked");
            expect(error.resolutionSteps![1]).toContain('Check system logs');
        });

        it('Test 13: should include lockedBy in resolution steps when provided', () => {
            const error = createResourceLockedError('FILE-2', 'agent-A');

            expect(error.resolutionSteps![1]).toContain('agent-A');
        });
    });

    // ── throwResourceLocked ───────────────────────────────────────────

    describe('throwResourceLocked', () => {
        it('Test 14: should throw with lockedBy detail', () => {
            try {
                throwResourceLocked('R-LOCK', 'other-process');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_STATE]');
                expect(err.message).toContain('locked by other-process');
            }
        });

        it('Test 15: should throw without lockedBy detail', () => {
            try {
                throwResourceLocked('R-LOCK2');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain("Resource 'R-LOCK2' is locked");
                expect(err.message).not.toContain(' by ');
            }
        });
    });

    // ── createTicketConflictError ─────────────────────────────────────

    describe('createTicketConflictError', () => {
        it('Test 16: should create conflict error with version info', () => {
            const error = createTicketConflictError('TKT-7', '3', '5');

            expect(error.code).toBe(ErrorCode.TICKET_UPDATE_CONFLICT);
            expect(error.message).toContain("ticket 'TKT-7'");
            expect(error.message).toContain('modified by another operation');
            expect(error.currentState).toBe('version 5');
            expect(error.requestedState).toBe('version 3');
        });

        it('Test 17: should handle missing version info gracefully', () => {
            const error = createTicketConflictError('TKT-8');

            expect(error.currentState).toBe('modified');
            expect(error.requestedState).toBe('update');
        });

        it('Test 18: should include recovery-oriented resolution steps', () => {
            const error = createTicketConflictError('TKT-9', '1', '2');

            expect(error.resolutionSteps).toBeDefined();
            expect(error.resolutionSteps!.length).toBe(3);
            expect(error.resolutionSteps![0]).toContain('Refresh ticket');
            expect(error.resolutionSteps![1]).toContain('Re-apply');
            expect(error.resolutionSteps![2]).toContain('retry logic');
        });
    });

    // ── throwTicketConflict ───────────────────────────────────────────

    describe('throwTicketConflict', () => {
        it('Test 19: should throw Error with TICKET_UPDATE_CONFLICT code', () => {
            try {
                throwTicketConflict('TKT-11', '1', '2');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[TICKET_UPDATE_CONFLICT]');
                expect(err.message).toContain("ticket 'TKT-11'");
            }
        });

        it('Test 20: should throw without optional version parameters', () => {
            expect(() => throwTicketConflict('TKT-12')).toThrow(Error);
        });
    });

    // ── TICKET_STATE_MACHINE ──────────────────────────────────────────

    describe('TICKET_STATE_MACHINE', () => {
        it('Test 21: should define transitions for all expected states', () => {
            const states = Object.keys(TICKET_STATE_MACHINE);
            expect(states).toContain('open');
            expect(states).toContain('pending');
            expect(states).toContain('in-progress');
            expect(states).toContain('blocked');
            expect(states).toContain('done');
        });

        it('Test 22: should allow open to transition to in-progress, blocked, pending', () => {
            expect(TICKET_STATE_MACHINE['open']).toEqual(
                expect.arrayContaining(['in-progress', 'blocked', 'pending'])
            );
        });

        it('Test 23: should make done a terminal state with no outgoing transitions', () => {
            expect(TICKET_STATE_MACHINE['done']).toEqual([]);
        });

        it('Test 24: should allow in-progress to transition to done, blocked, pending', () => {
            expect(TICKET_STATE_MACHINE['in-progress']).toEqual(
                expect.arrayContaining(['done', 'blocked', 'pending'])
            );
        });
    });

    // ── validateTicketTransition ──────────────────────────────────────

    describe('validateTicketTransition', () => {
        it('Test 25: should not throw for valid transitions', () => {
            expect(() =>
                validateTicketTransition('T-1', 'open', 'in-progress')
            ).not.toThrow();
            expect(() =>
                validateTicketTransition('T-2', 'in-progress', 'done')
            ).not.toThrow();
            expect(() =>
                validateTicketTransition('T-3', 'blocked', 'open')
            ).not.toThrow();
        });

        it('Test 26: should throw for invalid transitions', () => {
            expect(() =>
                validateTicketTransition('T-4', 'open', 'done')
            ).toThrow('[INVALID_STATE]');
        });

        it('Test 27: should throw for transitions out of terminal state done', () => {
            expect(() =>
                validateTicketTransition('T-5', 'done', 'open')
            ).toThrow('[INVALID_STATE]');
            expect(() =>
                validateTicketTransition('T-5', 'done', 'in-progress')
            ).toThrow('[INVALID_STATE]');
        });

        it('Test 28: should throw for unknown fromState (not in state machine)', () => {
            expect(() =>
                validateTicketTransition('T-6', 'unknown-state', 'open')
            ).toThrow('[INVALID_STATE]');
        });
    });

    // ── isStateConflictError ──────────────────────────────────────────

    describe('isStateConflictError', () => {
        it('Test 29: should detect INVALID_STATE errors', () => {
            const error = new Error('[INVALID_STATE] something failed');
            expect(isStateConflictError(error)).toBe(true);
        });

        it('Test 30: should detect TICKET_UPDATE_CONFLICT errors', () => {
            const error = new Error('[TICKET_UPDATE_CONFLICT] version mismatch');
            expect(isStateConflictError(error)).toBe(true);
        });

        it('Test 31: should detect errors containing "conflict"', () => {
            const error = new Error('There was a conflict during update');
            expect(isStateConflictError(error)).toBe(true);
        });

        it('Test 32: should detect errors containing "locked"', () => {
            const error = new Error('Resource is locked by another process');
            expect(isStateConflictError(error)).toBe(true);
        });

        it('Test 33: should return false for non-Error values', () => {
            expect(isStateConflictError(null)).toBe(false);
            expect(isStateConflictError(undefined)).toBe(false);
            expect(isStateConflictError('some string')).toBe(false);
            expect(isStateConflictError(42)).toBe(false);
            expect(isStateConflictError({})).toBe(false);
        });

        it('Test 34: should return false for unrelated Error messages', () => {
            const error = new Error('Something completely different');
            expect(isStateConflictError(error)).toBe(false);
        });

        it('Test 35: should detect errors thrown by throwTaskInProgress', () => {
            try {
                throwTaskInProgress('T-X', 'op');
            } catch (e: unknown) {
                expect(isStateConflictError(e)).toBe(true);
            }
        });

        it('Test 36: should detect errors thrown by throwResourceLocked', () => {
            try {
                throwResourceLocked('R-X', 'worker');
            } catch (e: unknown) {
                expect(isStateConflictError(e)).toBe(true);
            }
        });

        it('Test 37: should detect errors thrown by throwTicketConflict', () => {
            try {
                throwTicketConflict('TKT-X');
            } catch (e: unknown) {
                expect(isStateConflictError(e)).toBe(true);
            }
        });
    });
});
