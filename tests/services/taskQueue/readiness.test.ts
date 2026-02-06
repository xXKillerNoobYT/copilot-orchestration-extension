/**
 * @file tests/services/taskQueue/readiness.test.ts
 * @description Comprehensive tests for task readiness calculation (MT-016.7)
 */

import {
    DependencyGraph,
    createDependencyGraph
} from '../../../src/services/taskQueue/dependencyGraph';
import {
    ReadinessCalculator,
    isTaskReady,
    getReadyTasks,
    calculateOverallProgress
} from '../../../src/services/taskQueue/readiness';

describe('readiness', () => {
    let graph: DependencyGraph;

    beforeEach(() => {
        graph = createDependencyGraph();
    });

    describe('ReadinessCalculator', () => {
        it('Test 1: should mark task with no dependencies as ready', () => {
            graph.addNode('A');
            const calculator = new ReadinessCalculator(graph);

            const info = calculator.calculateReadiness('A');
            expect(info.state).toBe('ready');
            expect(info.progress).toBe(100);
        });

        it('Test 2: should mark task with incomplete deps as waiting', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');
            const calculator = new ReadinessCalculator(graph);

            const info = calculator.calculateReadiness('B');
            expect(info.state).toBe('waiting');
            expect(info.waitingOn).toContain('A');
            expect(info.progress).toBe(0);
        });

        it('Test 3: should handle task completion and update dependents', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');
            const calculator = new ReadinessCalculator(graph);

            // Initially B and C are waiting
            expect(calculator.calculateReadiness('B').state).toBe('waiting');

            // Complete A
            const newlyReady = calculator.onTaskCompleted('A');
            expect(newlyReady).toContain('B');
            expect(calculator.calculateReadiness('B').state).toBe('ready');
        });

        it('Test 4: should handle task failure and block dependents', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');
            const calculator = new ReadinessCalculator(graph);

            const nowBlocked = calculator.onTaskFailed('A');
            expect(nowBlocked).toContain('B');
            expect(calculator.calculateReadiness('B').state).toBe('blocked');
        });

        it('Test 5: should track running tasks', () => {
            graph.addNode('A');
            const calculator = new ReadinessCalculator(graph);

            calculator.onTaskStarted('A');
            expect(calculator.calculateReadiness('A').state).toBe('running');
        });

        it('Test 6: should get all ready tasks', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('C', 'B');
            const calculator = new ReadinessCalculator(graph);

            const ready = calculator.getReadyTasks();
            expect(ready).toContain('A');
            expect(ready).toContain('B');
            expect(ready).not.toContain('C');
        });

        it('Test 7: should get summary of all states', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');
            const calculator = new ReadinessCalculator(graph);

            calculator.onTaskStarted('A');

            const summary = calculator.getSummary();
            expect(summary.running).toContain('A');
            expect(summary.waiting).toContain('B');
            expect(summary.waiting).toContain('C');
            expect(summary.totalTasks).toBe(3);
        });

        it('Test 8: should get critical path to a task', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');
            const calculator = new ReadinessCalculator(graph);

            const path = calculator.getCriticalPathTo('C');
            expect(path).toContain('A');
            expect(path).toContain('B');
        });

        it('Test 9: should estimate ready time', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');
            const calculator = new ReadinessCalculator(graph);

            const readyTask = calculator.estimateReadyTime('A', 60000);
            expect(readyTask).toBeDefined();
            expect(readyTask?.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

            const waitingTask = calculator.estimateReadyTime('B', 60000);
            expect(waitingTask).toBeDefined();
            expect(waitingTask!.getTime()).toBeGreaterThan(Date.now());
        });

        it('Test 10: should reset state', () => {
            graph.addNode('A');
            const calculator = new ReadinessCalculator(graph);
            calculator.onTaskCompleted('A');

            calculator.reset();
            expect(calculator.calculateReadiness('A').state).toBe('ready');
        });

        it('Test 11: should initialize from external state', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');
            const calculator = new ReadinessCalculator(graph);

            calculator.initializeFromState(['A'], [], ['B']);

            expect(calculator.calculateReadiness('A').state).toBe('completed');
            expect(calculator.calculateReadiness('B').state).toBe('running');
            expect(calculator.calculateReadiness('C').state).toBe('waiting');
        });
    });

    describe('utility functions', () => {
        it('Test 12: isTaskReady should return true when all deps complete', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');

            const completed = new Set(['A']);
            expect(isTaskReady('B', graph, completed)).toBe(true);
        });

        it('Test 13: isTaskReady should return false when deps incomplete', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');

            const completed = new Set<string>();
            expect(isTaskReady('B', graph, completed)).toBe(false);
        });

        it('Test 14: getReadyTasks should return all ready tasks', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('C', 'B');

            const completed = new Set<string>();
            const ready = getReadyTasks(graph, completed);

            expect(ready).toContain('A');
            expect(ready).toContain('B');
            expect(ready).not.toContain('C');
        });

        it('Test 15: calculateOverallProgress should return percentage', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');

            const completed = new Set(['A', 'B']);
            const progress = calculateOverallProgress(graph, completed);

            expect(progress).toBe(50); // 2/4 = 50%
        });

        it('Test 16: calculateOverallProgress should return 100 for empty graph', () => {
            const completed = new Set<string>();
            const progress = calculateOverallProgress(graph, completed);

            expect(progress).toBe(100);
        });
    });
});
