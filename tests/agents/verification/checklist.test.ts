/**
 * Tests for Verification Checklist System
 *
 * Tests for checklist management and verification status tracking.
 */

import {
    VerificationChecklist,
    ChecklistItem,
    ChecklistCategory,
    ChecklistStatus,
    ChecklistResult,
    createChecklist,
} from '../../../src/agents/verification/checklist';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo, logWarn } from '../../../src/logger';

describe('VerificationChecklist', () => {
    const testTaskId = 'task-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create with default items', () => {
            const checklist = new VerificationChecklist(testTaskId);
            const items = checklist.getItems();

            expect(items.length).toBeGreaterThan(0);
            expect(items.every(i => i.status === 'pending')).toBe(true);
        });

        it('Test 2: should log creation', () => {
            new VerificationChecklist(testTaskId);

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Created checklist for task-123')
            );
        });

        it('Test 3: should accept custom items', () => {
            const customItems = [
                {
                    id: 'custom-1',
                    category: 'tests' as ChecklistCategory,
                    description: 'Custom test',
                    required: true,
                    checkType: 'automatic' as const
                }
            ];

            const checklist = new VerificationChecklist(testTaskId, customItems);
            const items = checklist.getItems();

            expect(items.some(i => i.id === 'custom-1')).toBe(true);
        });

        it('Test 4: should merge default and custom items', () => {
            const customItems = [
                {
                    id: 'custom-1',
                    category: 'security' as ChecklistCategory,
                    description: 'Security check',
                    required: true,
                    checkType: 'manual' as const
                }
            ];

            const checklist = new VerificationChecklist(testTaskId, customItems);
            const items = checklist.getItems();

            // Should have default + custom
            expect(items.some(i => i.id === 'tests-pass')).toBe(true);
            expect(items.some(i => i.id === 'custom-1')).toBe(true);
        });
    });

    // ============================================================================
    // markPassed Tests
    // ============================================================================
    describe('markPassed()', () => {
        it('Test 5: should mark item as passed', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markPassed('tests-pass');

            expect(result).toBe(true);
            const item = checklist.getItems().find(i => i.id === 'tests-pass');
            expect(item?.status).toBe('passed');
        });

        it('Test 6: should set evidence', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass', 'All 100 tests passed');

            const item = checklist.getItems().find(i => i.id === 'tests-pass');
            expect(item?.evidence).toBe('All 100 tests passed');
        });

        it('Test 7: should set checkedAt timestamp', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');

            const item = checklist.getItems().find(i => i.id === 'tests-pass');
            expect(item?.checkedAt).toBeInstanceOf(Date);
        });

        it('Test 8: should return false for unknown item', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markPassed('unknown-item');

            expect(result).toBe(false);
        });

        it('Test 9: should log warning for unknown item', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('unknown-item');

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('unknown-item not found')
            );
        });

        it('Test 10: should log pass', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('tests-pass PASSED')
            );
        });
    });

    // ============================================================================
    // markFailed Tests
    // ============================================================================
    describe('markFailed()', () => {
        it('Test 11: should mark item as failed', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markFailed('tests-pass', '3 tests failed');

            expect(result).toBe(true);
            const item = checklist.getItems().find(i => i.id === 'tests-pass');
            expect(item?.status).toBe('failed');
            expect(item?.evidence).toBe('3 tests failed');
        });

        it('Test 12: should return false for unknown item', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markFailed('unknown');

            expect(result).toBe(false);
        });

        it('Test 13: should log failure', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markFailed('tests-pass', 'Error details');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('tests-pass FAILED: Error details')
            );
        });

        it('Test 14: should log failure with no details', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markFailed('tests-pass');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('tests-pass FAILED: no details')
            );
        });
    });

    // ============================================================================
    // markSkipped Tests
    // ============================================================================
    describe('markSkipped()', () => {
        it('Test 15: should mark item as skipped', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markSkipped('tests-new', 'No new functionality');

            expect(result).toBe(true);
            const item = checklist.getItems().find(i => i.id === 'tests-new');
            expect(item?.status).toBe('skipped');
            expect(item?.evidence).toBe('No new functionality');
        });

        it('Test 16: should return false for unknown item', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markSkipped('unknown');

            expect(result).toBe(false);
        });

        it('Test 17: should set checkedAt timestamp', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markSkipped('tests-new');

            const item = checklist.getItems().find(i => i.id === 'tests-new');
            expect(item?.checkedAt).toBeInstanceOf(Date);
        });
    });

    // ============================================================================
    // markNA Tests
    // ============================================================================
    describe('markNA()', () => {
        it('Test 18: should mark item as not applicable', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markNA('coverage-threshold', 'No coverage tool');

            expect(result).toBe(true);
            const item = checklist.getItems().find(i => i.id === 'coverage-threshold');
            expect(item?.status).toBe('n/a');
            expect(item?.evidence).toBe('No coverage tool');
        });

        it('Test 19: should return false for unknown item', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.markNA('unknown');

            expect(result).toBe(false);
        });
    });

    // ============================================================================
    // getItems Tests
    // ============================================================================
    describe('getItems()', () => {
        it('Test 20: should return copy of items', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const items1 = checklist.getItems();
            const items2 = checklist.getItems();

            expect(items1).not.toBe(items2);
        });

        it('Test 21: should return all items', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const items = checklist.getItems();

            expect(items.length).toBeGreaterThan(5);
        });
    });

    // ============================================================================
    // getItemsByCategory Tests
    // ============================================================================
    describe('getItemsByCategory()', () => {
        it('Test 22: should return items for category', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const testItems = checklist.getItemsByCategory('tests');

            expect(testItems.length).toBeGreaterThan(0);
            expect(testItems.every(i => i.category === 'tests')).toBe(true);
        });

        it('Test 23: should return empty array for unused category', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const securityItems = checklist.getItemsByCategory('security');

            expect(securityItems).toEqual([]);
        });

        it('Test 24: should return documentation items', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const docItems = checklist.getItemsByCategory('documentation');

            expect(docItems.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // getPendingItems Tests
    // ============================================================================
    describe('getPendingItems()', () => {
        it('Test 25: should return all initially', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const pending = checklist.getPendingItems();

            expect(pending.length).toBe(checklist.getItems().length);
        });

        it('Test 26: should exclude passed items', () => {
            const checklist = new VerificationChecklist(testTaskId);
            checklist.markPassed('tests-pass');

            const pending = checklist.getPendingItems();

            expect(pending.some(i => i.id === 'tests-pass')).toBe(false);
        });

        it('Test 27: should exclude failed items', () => {
            const checklist = new VerificationChecklist(testTaskId);
            checklist.markFailed('tests-pass');

            const pending = checklist.getPendingItems();

            expect(pending.some(i => i.id === 'tests-pass')).toBe(false);
        });
    });

    // ============================================================================
    // getResult Tests
    // ============================================================================
    describe('getResult()', () => {
        it('Test 28: should return passed when all checks complete', () => {
            const checklist = new VerificationChecklist(testTaskId);

            // Mark all items as passed
            for (const item of checklist.getItems()) {
                checklist.markPassed(item.id);
            }

            const result = checklist.getResult();

            expect(result.passed).toBe(true);
            expect(result.passPercent).toBe(100);
        });

        it('Test 29: should return failed when required item fails', () => {
            const checklist = new VerificationChecklist(testTaskId);

            // Mark required item as failed
            checklist.markFailed('tests-pass');
            // Mark others as passed
            for (const item of checklist.getItems()) {
                if (item.id !== 'tests-pass' && item.status === 'pending') {
                    checklist.markPassed(item.id);
                }
            }

            const result = checklist.getResult();

            expect(result.passed).toBe(false);
            expect(result.failedRequired.length).toBeGreaterThan(0);
        });

        it('Test 30: should return pending when items not checked', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.getResult();

            expect(result.passed).toBe(false);
            expect(result.byStatus.pending).toBeGreaterThan(0);
        });

        it('Test 31: should calculate pass percentage', () => {
            const checklist = new VerificationChecklist(testTaskId);
            const items = checklist.getItems();

            // Pass half, fail half
            items.forEach((item, i) => {
                if (i % 2 === 0) {
                    checklist.markPassed(item.id);
                } else {
                    checklist.markFailed(item.id);
                }
            });

            const result = checklist.getResult();

            expect(result.passPercent).toBeLessThanOrEqual(60);
            expect(result.passPercent).toBeGreaterThanOrEqual(40);
        });

        it('Test 32: should track byStatus counts', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');
            checklist.markFailed('build-success');
            checklist.markSkipped('tests-new');
            checklist.markNA('coverage-threshold');

            const result = checklist.getResult();

            expect(result.byStatus.passed).toBe(1);
            expect(result.byStatus.failed).toBe(1);
            expect(result.byStatus.skipped).toBe(1);
            expect(result.byStatus['n/a']).toBe(1);
        });

        it('Test 33: should track byCategory stats', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');
            checklist.markPassed('tests-new');

            const result = checklist.getResult();

            expect(result.byCategory.tests.passed).toBe(2);
            expect(result.byCategory.tests.total).toBe(2);
        });

        it('Test 34: should exclude n/a from category total', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markNA('coverage-threshold');

            const result = checklist.getResult();

            expect(result.byCategory.coverage.total).toBe(0);
        });

        it('Test 35: should generate passed summary', () => {
            const checklist = new VerificationChecklist(testTaskId);

            for (const item of checklist.getItems()) {
                checklist.markPassed(item.id);
            }

            const result = checklist.getResult();

            expect(result.summary).toContain('✅');
            expect(result.summary).toContain('passed');
        });

        it('Test 36: should generate failed summary', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markFailed('tests-pass');
            for (const item of checklist.getItems()) {
                if (item.id !== 'tests-pass' && item.status === 'pending') {
                    checklist.markPassed(item.id);
                }
            }

            const result = checklist.getResult();

            expect(result.summary).toContain('❌');
            expect(result.summary).toContain('tests-pass');
        });

        it('Test 37: should generate pending summary', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const result = checklist.getResult();

            expect(result.summary).toContain('⏳');
            expect(result.summary).toContain('pending');
        });

        it('Test 38: should return 100% when no applicable items', () => {
            const checklist = new VerificationChecklist(testTaskId);

            // Mark all as N/A or skipped
            for (const item of checklist.getItems()) {
                checklist.markNA(item.id);
            }

            const result = checklist.getResult();

            expect(result.passPercent).toBe(100);
        });
    });

    // ============================================================================
    // format Tests
    // ============================================================================
    describe('format()', () => {
        it('Test 39: should include task ID', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const formatted = checklist.format();

            expect(formatted).toContain('task-123');
        });

        it('Test 40: should include category headers', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const formatted = checklist.format();

            expect(formatted).toContain('## Tests');
            expect(formatted).toContain('## Build');
        });

        it('Test 41: should include status icons', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');
            checklist.markFailed('build-success');

            const formatted = checklist.format();

            expect(formatted).toContain('✅');
            expect(formatted).toContain('❌');
        });

        it('Test 42: should include evidence', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass', 'All 50 tests pass');

            const formatted = checklist.format();

            expect(formatted).toContain('Evidence: All 50 tests pass');
        });

        it('Test 43: should include required marker', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const formatted = checklist.format();

            expect(formatted).toContain('(required)');
        });

        it('Test 44: should include summary', () => {
            const checklist = new VerificationChecklist(testTaskId);

            const formatted = checklist.format();

            expect(formatted).toContain('---');
            expect(formatted).toContain('pending');
        });

        it('Test 45: should show all status icons', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');
            checklist.markFailed('build-success');
            checklist.markSkipped('tests-new');
            checklist.markNA('coverage-threshold');

            const formatted = checklist.format();

            expect(formatted).toContain('✅');
            expect(formatted).toContain('❌');
            expect(formatted).toContain('⏭️');
            expect(formatted).toContain('➖');
            expect(formatted).toContain('⏳'); // pending items
        });
    });

    // ============================================================================
    // createChecklist Tests
    // ============================================================================
    describe('createChecklist()', () => {
        it('Test 46: should create new checklist', () => {
            const checklist = createChecklist('task-456');

            expect(checklist).toBeInstanceOf(VerificationChecklist);
        });

        it('Test 47: should accept custom items', () => {
            const customItems = [
                {
                    id: 'custom-check',
                    category: 'security' as ChecklistCategory,
                    description: 'Security scan',
                    required: true,
                    checkType: 'automatic' as const
                }
            ];

            const checklist = createChecklist('task-456', customItems);
            const items = checklist.getItems();

            expect(items.some(i => i.id === 'custom-check')).toBe(true);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 48: should handle empty custom items', () => {
            const checklist = new VerificationChecklist(testTaskId, []);

            expect(checklist.getItems().length).toBeGreaterThan(0);
        });

        it('Test 49: should handle marking same item multiple times', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass');
            checklist.markFailed('tests-pass');

            const item = checklist.getItems().find(i => i.id === 'tests-pass');
            expect(item?.status).toBe('failed'); // Last status wins
        });

        it('Test 50: should handle special characters in evidence', () => {
            const checklist = new VerificationChecklist(testTaskId);

            checklist.markPassed('tests-pass', 'Test with <html> & "quotes"');

            const item = checklist.getItems().find(i => i.id === 'tests-pass');
            expect(item?.evidence).toBe('Test with <html> & "quotes"');
        });
    });
});
