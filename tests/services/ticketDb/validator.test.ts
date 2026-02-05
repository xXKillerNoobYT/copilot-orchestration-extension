/**
 * Tests for Ticket Schema Validator
 *
 * Covers: MT-005.6 (Schema Validation)
 *
 * @since MT-005.6
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    validateTicketCreate,
    validateTicketUpdate,
    validateThreadMessage,
    formatValidationErrors,
    validateOrThrow,
    VALID_STATUSES,
    VALID_TYPES,
    TICKET_CONSTRAINTS,
} from '../../../src/services/ticketDb/validator';

describe('Ticket Schema Validator (MT-005.6)', () => {

    // ─── Create Validation ───────────────────────────────────────────────

    describe('validateTicketCreate', () => {
        it('Test 1: should pass for valid ticket data', () => {
            const result = validateTicketCreate({
                title: 'Fix login bug',
                status: 'open',
            });
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('Test 2: should pass for full valid ticket data', () => {
            const result = validateTicketCreate({
                title: 'Fix login bug',
                status: 'open',
                type: 'ai_to_human',
                description: 'The login page crashes on submit',
                priority: 1,
                creator: 'PlanningAgent',
                assignee: 'VerificationAgent',
                version: 1,
                resolution: null,
            });
            expect(result.valid).toBe(true);
        });

        it('Test 3: should fail for missing title', () => {
            const result = validateTicketCreate({
                status: 'open',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'title')).toBe(true);
        });

        it('Test 4: should fail for empty title', () => {
            const result = validateTicketCreate({
                title: '   ',
                status: 'open',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'title' && i.message.includes('empty'))).toBe(true);
        });

        it('Test 5: should fail for missing status', () => {
            const result = validateTicketCreate({
                title: 'Test ticket',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'status')).toBe(true);
        });

        it('Test 6: should fail for invalid status', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'maybe',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'status' && i.message.includes('must be one of'))).toBe(true);
        });

        it('Test 7: should accept all valid statuses', () => {
            for (const status of VALID_STATUSES) {
                const result = validateTicketCreate({
                    title: 'Test',
                    status,
                });
                expect(result.valid).toBe(true);
            }
        });

        it('Test 8: should fail for title exceeding max length', () => {
            const longTitle = 'x'.repeat(TICKET_CONSTRAINTS.TITLE_MAX_LENGTH + 1);
            const result = validateTicketCreate({
                title: longTitle,
                status: 'open',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'title' && i.message.includes('maximum length'))).toBe(true);
        });

        it('Test 9: should fail for description exceeding max length', () => {
            const longDesc = 'x'.repeat(TICKET_CONSTRAINTS.DESCRIPTION_MAX_LENGTH + 1);
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                description: longDesc,
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'description')).toBe(true);
        });

        it('Test 10: should fail for invalid type', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                type: 'invalid_type',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'type')).toBe(true);
        });

        it('Test 11: should accept all valid types', () => {
            for (const type of VALID_TYPES) {
                const result = validateTicketCreate({
                    title: 'Test',
                    status: 'open',
                    type,
                });
                expect(result.valid).toBe(true);
            }
        });

        it('Test 12: should fail for priority out of range', () => {
            const result1 = validateTicketCreate({
                title: 'Test',
                status: 'open',
                priority: 0,
            });
            expect(result1.valid).toBe(false);

            const result2 = validateTicketCreate({
                title: 'Test',
                status: 'open',
                priority: 6,
            });
            expect(result2.valid).toBe(false);
        });

        it('Test 13: should accept valid priority values', () => {
            for (let p = 1; p <= 5; p++) {
                const result = validateTicketCreate({
                    title: 'Test',
                    status: 'open',
                    priority: p,
                });
                expect(result.valid).toBe(true);
            }
        });

        it('Test 14: should fail for non-number priority', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                priority: 'high',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'priority' && i.message.includes('must be a number'))).toBe(true);
        });

        it('Test 15: should fail for version less than 1', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                version: 0,
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'version')).toBe(true);
        });

        it('Test 16: should validate thread array', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                thread: [
                    { role: 'user', content: 'Hello', createdAt: '2026-01-01' },
                ],
            });
            expect(result.valid).toBe(true);
        });

        it('Test 17: should fail for invalid thread structure', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                thread: 'not an array',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'thread')).toBe(true);
        });

        it('Test 18: should fail for thread message with invalid role', () => {
            const result = validateTicketCreate({
                title: 'Test',
                status: 'open',
                thread: [
                    { role: 'admin', content: 'Hello', createdAt: '2026-01-01' },
                ],
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field.includes('thread[0]') && i.message.includes('role'))).toBe(true);
        });

        it('Test 19: should collect multiple validation errors', () => {
            const result = validateTicketCreate({});
            expect(result.valid).toBe(false);
            expect(result.issues.length).toBeGreaterThanOrEqual(2); // title + status missing
        });
    });

    // ─── Update Validation ───────────────────────────────────────────────

    describe('validateTicketUpdate', () => {
        it('Test 20: should pass for valid partial update', () => {
            const result = validateTicketUpdate({
                status: 'in-progress',
            });
            expect(result.valid).toBe(true);
        });

        it('Test 21: should fail when trying to modify id', () => {
            const result = validateTicketUpdate({
                id: 'new-id',
                status: 'open',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'id')).toBe(true);
        });

        it('Test 22: should fail when trying to modify createdAt', () => {
            const result = validateTicketUpdate({
                createdAt: '2026-01-01',
            });
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.field === 'createdAt')).toBe(true);
        });

        it('Test 23: should fail for empty title in update', () => {
            const result = validateTicketUpdate({
                title: '',
            });
            expect(result.valid).toBe(false);
        });

        it('Test 24: should pass for valid status update', () => {
            const result = validateTicketUpdate({
                status: 'resolved',
                resolution: 'Fixed in commit abc123',
            });
            expect(result.valid).toBe(true);
        });
    });

    // ─── Thread Message Validation ───────────────────────────────────────

    describe('validateThreadMessage', () => {
        it('Test 25: should pass for valid thread message', () => {
            const result = validateThreadMessage({
                role: 'user',
                content: 'Hello, I need help',
            });
            expect(result.valid).toBe(true);
        });

        it('Test 26: should fail for missing role', () => {
            const result = validateThreadMessage({
                content: 'Hello',
            });
            expect(result.valid).toBe(false);
        });

        it('Test 27: should fail for missing content', () => {
            const result = validateThreadMessage({
                role: 'user',
            });
            expect(result.valid).toBe(false);
        });

        it('Test 28: should fail for content exceeding max length', () => {
            const longContent = 'x'.repeat(TICKET_CONSTRAINTS.THREAD_MESSAGE_MAX_LENGTH + 1);
            const result = validateThreadMessage({
                role: 'user',
                content: longContent,
            });
            expect(result.valid).toBe(false);
        });

        it('Test 29: should validate optional status field', () => {
            const result = validateThreadMessage({
                role: 'assistant',
                content: 'Working on it',
                status: 'planning',
            });
            expect(result.valid).toBe(true);
        });

        it('Test 30: should fail for invalid message status', () => {
            const result = validateThreadMessage({
                role: 'assistant',
                content: 'Working on it',
                status: 'invalid',
            });
            expect(result.valid).toBe(false);
        });
    });

    // ─── Format Errors ───────────────────────────────────────────────────

    describe('formatValidationErrors', () => {
        it('Test 31: should format empty issues', () => {
            expect(formatValidationErrors([])).toBe('No validation errors');
        });

        it('Test 32: should format single issue', () => {
            const msg = formatValidationErrors([
                { field: 'title', message: 'Too long' },
            ]);
            expect(msg).toBe('Validation failed: title: Too long');
        });

        it('Test 33: should format multiple issues', () => {
            const msg = formatValidationErrors([
                { field: 'title', message: 'Too long' },
                { field: 'status', message: 'Invalid' },
            ]);
            expect(msg).toContain('title: Too long');
            expect(msg).toContain('status: Invalid');
        });
    });

    // ─── validateOrThrow ─────────────────────────────────────────────────

    describe('validateOrThrow', () => {
        it('Test 34: should not throw for valid create data', () => {
            expect(() => validateOrThrow(
                { title: 'Test', status: 'open' },
                'create'
            )).not.toThrow();
        });

        it('Test 35: should throw for invalid create data', () => {
            expect(() => validateOrThrow({}, 'create')).toThrow('Validation failed');
        });

        it('Test 36: should not throw for valid update data', () => {
            expect(() => validateOrThrow(
                { status: 'in-progress' },
                'update'
            )).not.toThrow();
        });

        it('Test 37: should throw for invalid update data', () => {
            expect(() => validateOrThrow(
                { id: 'cannot-change' },
                'update'
            )).toThrow('Validation failed');
        });
    });

    // ─── Constants ───────────────────────────────────────────────────────

    describe('Constants', () => {
        it('Test 38: should export valid statuses', () => {
            expect(VALID_STATUSES).toContain('open');
            expect(VALID_STATUSES).toContain('in-progress');
            expect(VALID_STATUSES).toContain('done');
            expect(VALID_STATUSES).toContain('resolved');
            expect(VALID_STATUSES.length).toBeGreaterThanOrEqual(5);
        });

        it('Test 39: should export valid types', () => {
            expect(VALID_TYPES).toContain('ai_to_human');
            expect(VALID_TYPES).toContain('human_to_ai');
            expect(VALID_TYPES.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 40: should export constraint values', () => {
            expect(TICKET_CONSTRAINTS.TITLE_MAX_LENGTH).toBe(200);
            expect(TICKET_CONSTRAINTS.DESCRIPTION_MAX_LENGTH).toBe(800);
            expect(TICKET_CONSTRAINTS.PRIORITY_MIN).toBe(1);
            expect(TICKET_CONSTRAINTS.PRIORITY_MAX).toBe(5);
            expect(TICKET_CONSTRAINTS.VERSION_MIN).toBe(1);
        });
    });
});
