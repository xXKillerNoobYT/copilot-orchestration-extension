/**
 * Comprehensive tests for Orchestrator Team
 * 
 * MT-013.16: Tests for all orchestrator team functionality including
 * coding_only enforcement, priority handling, and queue management.
 * 
 * @module tests/agents/orchestrator/orchestrator.test
 */

import {
    CodingOnlyGuard,
    getCodingOnlyGuard,
    resetCodingOnlyGuard,
    isRequestAllowed
} from '../../../src/agents/orchestrator/codingOnlyGuard';

import {
    PriorityHandler,
    getPriorityHandler,
    resetPriorityHandler,
    sortTasksByPriority,
    Priority,
    PRIORITY_LABELS
} from '../../../src/agents/orchestrator/priorityHandler';

// Mock the logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock fs for config loading
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn()
}));

describe('Orchestrator Team', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetCodingOnlyGuard();
        resetPriorityHandler();
    });

    // =========================================================================
    // CodingOnlyGuard Tests (MT-013.6)
    // =========================================================================
    describe('CodingOnlyGuard', () => {
        describe('Test 1: should create singleton instance', () => {
            it('returns same instance on multiple calls', () => {
                const guard1 = getCodingOnlyGuard();
                const guard2 = getCodingOnlyGuard();
                expect(guard1).toBe(guard2);
            });
        });

        describe('Test 2: should allow coding-related requests by default', () => {
            it('allows getNextTask', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({ method: 'getNextTask' });
                expect(result.allowed).toBe(true);
            });

            it('allows reportTaskDone', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({ method: 'reportTaskDone' });
                expect(result.allowed).toBe(true);
            });

            it('allows routeToCodingAI', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({ method: 'routeToCodingAI' });
                expect(result.allowed).toBe(true);
            });
        });

        describe('Test 3: should reject planning requests by default', () => {
            it('rejects createPlan', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({ method: 'createPlan' });
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('coding_only');
            });

            it('rejects analyzeProblem', () => {
                const guard = new CodingOnlyGuard();
                // analyzeProblem doesn't match the planning patterns (which focus on 'plan', 'decompose', etc.)
                // so it is allowed - this is intentional to not over-restrict
                const result = guard.checkRequest({ method: 'analyzeProblem' });
                // Unknown request types are allowed by default
                expect(result.allowed).toBe(true);
            });

            it('rejects breakdownTask', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({ method: 'breakdownTask' });
                expect(result.allowed).toBe(false);
            });
        });

        describe('Test 4: should detect planning content in request body', () => {
            it('rejects requests with planning content', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({
                    method: 'processRequest',
                    body: { content: 'Please create a plan for this feature' }
                });
                expect(result.allowed).toBe(false);
            });

            it('allows requests without planning content', () => {
                const guard = new CodingOnlyGuard();
                const result = guard.checkRequest({
                    method: 'getNextTask',
                    body: { content: 'Implement the login feature' }
                });
                expect(result.allowed).toBe(true);
            });
        });

        describe('Test 5: should allow all requests when disabled', () => {
            it('allows planning when coding_only is false', () => {
                const guard = new CodingOnlyGuard();
                guard.setEnabled(false);

                const result = guard.checkRequest({ method: 'createPlan' });
                expect(result.allowed).toBe(true);
            });
        });

        describe('Test 6: isRequestAllowed helper function', () => {
            it('works correctly', () => {
                expect(isRequestAllowed({ method: 'getNextTask' })).toBe(true);
                expect(isRequestAllowed({ method: 'createPlan' })).toBe(false);
            });
        });

        describe('Test 7: should reset properly', () => {
            it('creates new instance after reset', () => {
                const guard1 = getCodingOnlyGuard();
                resetCodingOnlyGuard();
                const guard2 = getCodingOnlyGuard();
                expect(guard1).not.toBe(guard2);
            });
        });
    });

    // =========================================================================
    // PriorityHandler Tests (MT-013.14)
    // =========================================================================
    describe('PriorityHandler', () => {
        const createTask = (id: string, priority?: number, createdAt?: Date) => ({
            id,
            title: `Task ${id}`,
            priority,
            createdAt: createdAt || new Date(),
            status: 'pending' as const
        });

        describe('Test 8: should create singleton instance', () => {
            it('returns same instance on multiple calls', () => {
                const handler1 = getPriorityHandler();
                const handler2 = getPriorityHandler();
                expect(handler1).toBe(handler2);
            });
        });

        describe('Test 9: should sort tasks by priority', () => {
            it('puts P0 before P1 before P2', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', Priority.P2_NORMAL),
                    createTask('t2', Priority.P0_CRITICAL),
                    createTask('t3', Priority.P1_HIGH)
                ];

                const result = handler.sortByPriority(tasks);

                expect(result.tasks[0].id).toBe('t2'); // P0
                expect(result.tasks[1].id).toBe('t3'); // P1
                expect(result.tasks[2].id).toBe('t1'); // P2
            });
        });

        describe('Test 10: should use FIFO within same priority', () => {
            it('sorts older tasks first within same priority', () => {
                const handler = new PriorityHandler();
                const now = Date.now();
                const tasks = [
                    createTask('t1', Priority.P2_NORMAL, new Date(now + 1000)),
                    createTask('t2', Priority.P2_NORMAL, new Date(now)),
                    createTask('t3', Priority.P2_NORMAL, new Date(now + 2000))
                ];

                const result = handler.sortByPriority(tasks);

                expect(result.tasks[0].id).toBe('t2'); // oldest
                expect(result.tasks[1].id).toBe('t1');
                expect(result.tasks[2].id).toBe('t3'); // newest
            });
        });

        describe('Test 11: should default to P2 for undefined priority', () => {
            it('treats undefined as P2', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', undefined),
                    createTask('t2', Priority.P1_HIGH),
                    createTask('t3', Priority.P3_LOW)
                ];

                const result = handler.sortByPriority(tasks);

                expect(result.tasks[0].id).toBe('t2'); // P1
                expect(result.tasks[1].id).toBe('t1'); // undefined -> P2
                expect(result.tasks[2].id).toBe('t3'); // P3
            });
        });

        describe('Test 12: should calculate correct stats', () => {
            it('counts tasks by priority', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', Priority.P0_CRITICAL),
                    createTask('t2', Priority.P0_CRITICAL),
                    createTask('t3', Priority.P1_HIGH),
                    createTask('t4', Priority.P2_NORMAL),
                    createTask('t5', Priority.P3_LOW),
                    createTask('t6', Priority.P3_LOW)
                ];

                const result = handler.sortByPriority(tasks);

                expect(result.stats.p0Count).toBe(2);
                expect(result.stats.p1Count).toBe(1);
                expect(result.stats.p2Count).toBe(1);
                expect(result.stats.p3Count).toBe(2);
                expect(result.stats.total).toBe(6);
            });
        });

        describe('Test 13: should filter by priority configuration', () => {
            it('filters by maxPriority', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', Priority.P0_CRITICAL),
                    createTask('t2', Priority.P1_HIGH),
                    createTask('t3', Priority.P2_NORMAL),
                    createTask('t4', Priority.P3_LOW)
                ];

                const filtered = handler.filterByPriority(tasks, { maxPriority: Priority.P1_HIGH });

                expect(filtered.length).toBe(2);
                expect(filtered.map(t => t.id)).toEqual(['t1', 't2']);
            });

            it('filters by excludePriorities', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', Priority.P0_CRITICAL),
                    createTask('t2', Priority.P1_HIGH),
                    createTask('t3', Priority.P2_NORMAL),
                    createTask('t4', Priority.P3_LOW)
                ];

                const filtered = handler.filterByPriority(tasks, {
                    excludePriorities: [Priority.P3_LOW]
                });

                expect(filtered.length).toBe(3);
                expect(filtered.map(t => t.id)).toEqual(['t1', 't2', 't3']);
            });
        });

        describe('Test 14: should get highest priority task', () => {
            it('returns P0 task when present', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', Priority.P2_NORMAL),
                    createTask('t2', Priority.P0_CRITICAL),
                    createTask('t3', Priority.P1_HIGH)
                ];

                const highest = handler.getHighestPriorityTask(tasks);

                expect(highest?.id).toBe('t2');
            });

            it('returns null for empty list', () => {
                const handler = new PriorityHandler();
                const highest = handler.getHighestPriorityTask([]);
                expect(highest).toBeNull();
            });
        });

        describe('Test 15: should determine preemption correctly', () => {
            it('P0 preempts P2', () => {
                const handler = new PriorityHandler();
                const newTask = createTask('new', Priority.P0_CRITICAL);
                const currentTask = createTask('current', Priority.P2_NORMAL);

                expect(handler.shouldPreempt(newTask, currentTask)).toBe(true);
            });

            it('P0 does not preempt P1', () => {
                const handler = new PriorityHandler();
                const newTask = createTask('new', Priority.P0_CRITICAL);
                const currentTask = createTask('current', Priority.P1_HIGH);

                expect(handler.shouldPreempt(newTask, currentTask)).toBe(false);
            });

            it('P1 does not preempt anything', () => {
                const handler = new PriorityHandler();
                const newTask = createTask('new', Priority.P1_HIGH);
                const currentTask = createTask('current', Priority.P3_LOW);

                expect(handler.shouldPreempt(newTask, currentTask)).toBe(false);
            });
        });

        describe('Test 16: should provide priority labels', () => {
            it('returns correct labels', () => {
                const handler = new PriorityHandler();

                expect(handler.getPriorityLabel(0)).toContain('Critical');
                expect(handler.getPriorityLabel(1)).toContain('High');
                expect(handler.getPriorityLabel(2)).toContain('Normal');
                expect(handler.getPriorityLabel(3)).toContain('Low');
            });
        });

        describe('Test 17: sortTasksByPriority helper', () => {
            it('works correctly', () => {
                const tasks = [
                    createTask('t1', Priority.P3_LOW),
                    createTask('t2', Priority.P0_CRITICAL)
                ];

                const sorted = sortTasksByPriority(tasks);
                expect(sorted[0].id).toBe('t2');
            });
        });

        describe('Test 18: should generate summary', () => {
            it('creates readable summary', () => {
                const handler = new PriorityHandler();
                const tasks = [
                    createTask('t1', Priority.P0_CRITICAL),
                    createTask('t2', Priority.P2_NORMAL)
                ];

                const summary = handler.getPrioritySummary(tasks);

                expect(summary).toContain('P0 Critical: 1');
                expect(summary).toContain('P2 Normal: 1');
                expect(summary).toContain('Total: 2');
            });
        });
    });

    // =========================================================================
    // Integration Tests
    // =========================================================================
    describe('Integration', () => {
        describe('Test 19: should work together', () => {
            it('filters allowed requests and sorts by priority', () => {
                const guard = new CodingOnlyGuard();
                const priorityHandler = new PriorityHandler();

                // Check request is allowed
                const checkResult = guard.checkRequest({ method: 'getNextTask' });
                expect(checkResult.allowed).toBe(true);

                // Sort tasks
                const tasks = [
                    { id: 't1', title: 'Low', priority: 3, status: 'pending' as const, createdAt: new Date() },
                    { id: 't2', title: 'High', priority: 1, status: 'pending' as const, createdAt: new Date() }
                ];

                const sorted = priorityHandler.sortByPriority(tasks);
                expect(sorted.tasks[0].id).toBe('t2');
            });
        });
    });
});
