/**
 * @file tests/services/taskQueue/blocking.test.ts
 * @description Comprehensive tests for task blocking (MT-016.4)
 */

import {
    DependencyGraph,
    createDependencyGraph
} from '../../../src/services/taskQueue/dependencyGraph';
import {
    BlockingManager,
    getTasksBlockedBy,
    calculateBlastRadius,
    resetBlockingManagerForTests
} from '../../../src/services/taskQueue/blocking';

describe('blocking', () => {
    let graph: DependencyGraph;
    let manager: BlockingManager;

    beforeEach(() => {
        resetBlockingManagerForTests();
        graph = createDependencyGraph();
        manager = new BlockingManager();
    });

    describe('BlockingManager', () => {
        it('Test 1: should block a task and cascade to dependents', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A'); // B depends on A
            graph.addDependency('C', 'B'); // C depends on B

            const result = manager.blockTask('A', graph, 'dependency-failed');

            expect(result.newlyBlocked).toContain('A');
            expect(result.newlyBlocked).toContain('B');
            expect(result.newlyBlocked).toContain('C');
            expect(result.totalAffected).toBe(3);
        });

        it('Test 2: should not re-block already blocked tasks', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');

            // Block first
            manager.blockTask('A', graph);
            // Block again
            const result = manager.blockTask('A', graph);

            expect(result.alreadyBlocked).toContain('A');
        });

        it('Test 3: should track blocking chain', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');

            manager.blockTask('A', graph);

            const chain = manager.getBlockingChain('C');
            expect(chain).toContain('B');
            expect(chain).toContain('A');
        });

        it('Test 4: should unblock when dependencies complete', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');

            manager.blockTask('A', graph, 'dependency-failed');

            const completedTasks = new Set(['A']);
            const result = manager.unblockTask('B', graph, completedTasks);

            expect(result.unblocked).toContain('B');
        });

        it('Test 5: should keep manual holds even when deps complete', () => {
            graph.addNode('A');
            manager.addManualHold('A');

            const completedTasks = new Set<string>();
            const result = manager.unblockTask('A', graph, completedTasks);

            expect(result.stillBlocked).toContain('A');
        });

        it('Test 6: should remove manual hold explicitly', () => {
            graph.addNode('A');
            manager.addManualHold('A');

            expect(manager.isBlocked('A')).toBe(true);
            manager.removeManualHold('A');
            expect(manager.isBlocked('A')).toBe(false);
        });

        it('Test 7: should get block info', () => {
            graph.addNode('A');
            manager.blockTask('A', graph, 'dependency-failed');

            const info = manager.getBlockInfo('A');
            expect(info).toBeDefined();
            expect(info?.reason).toBe('dependency-failed');
            expect(info?.blockedAt).toBeInstanceOf(Date);
        });

        it('Test 8: should list all blocked tasks', () => {
            graph.addNode('A');
            graph.addNode('B');
            manager.blockTask('A', graph);
            manager.addManualHold('B');

            const blocked = manager.getBlockedTasks();
            expect(blocked).toHaveLength(2);
        });

        it('Test 9: should clear all blocks', () => {
            graph.addNode('A');
            manager.blockTask('A', graph);

            manager.clear();
            expect(manager.isBlocked('A')).toBe(false);
        });
    });

    describe('getTasksBlockedBy', () => {
        it('Test 10: should get all tasks blocked by a failure', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'A');
            graph.addDependency('D', 'B');

            const blocked = getTasksBlockedBy('A', graph);

            expect(blocked).toContain('B');
            expect(blocked).toContain('C');
            expect(blocked).toContain('D');
        });
    });

    describe('calculateBlastRadius', () => {
        it('Test 11: should calculate blast radius for leaf task', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');

            expect(calculateBlastRadius('B', graph)).toBe(0); // B has no dependents
        });

        it('Test 12: should calculate blast radius for root task', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'A');

            expect(calculateBlastRadius('A', graph)).toBe(2); // A failing blocks B and C
        });
    });
});
