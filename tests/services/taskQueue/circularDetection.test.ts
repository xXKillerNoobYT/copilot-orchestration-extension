/**
 * @file tests/services/taskQueue/circularDetection.test.ts
 * @description Comprehensive tests for circular dependency detection (MT-016.3)
 */

import {
    DependencyGraph,
    createDependencyGraph
} from '../../../src/services/taskQueue/dependencyGraph';
import {
    analyzeCircularDependencies,
    findMinimumCycleBreakers,
    wouldCreateCycle,
    formatCycleReport
} from '../../../src/services/taskQueue/circularDetection';

describe('circularDetection', () => {
    let graph: DependencyGraph;

    beforeEach(() => {
        graph = createDependencyGraph();
    });

    describe('analyzeCircularDependencies', () => {
        it('Test 1: should detect no cycles in empty graph', () => {
            const result = analyzeCircularDependencies(graph);
            expect(result.hasCycles).toBe(false);
            expect(result.cycleCount).toBe(0);
            expect(result.cycles).toHaveLength(0);
        });

        it('Test 2: should detect no cycles in linear chain A→B→C', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A'); // B depends on A
            graph.addDependency('C', 'B'); // C depends on B

            const result = analyzeCircularDependencies(graph);
            expect(result.hasCycles).toBe(false);
            expect(result.safeTasks).toContain('A');
            expect(result.safeTasks).toContain('B');
            expect(result.safeTasks).toContain('C');
        });

        it('Test 3: should detect simple cycle A→B→A', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B'); // A depends on B
            graph.addDependency('B', 'A'); // B depends on A

            const result = analyzeCircularDependencies(graph);
            expect(result.hasCycles).toBe(true);
            expect(result.cycleCount).toBeGreaterThan(0);
            expect(result.affectedTasks).toContain('A');
            expect(result.affectedTasks).toContain('B');
        });

        it('Test 4: should detect three-way cycle A→B→C→A', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('A', 'C'); // A depends on C
            graph.addDependency('B', 'A'); // B depends on A
            graph.addDependency('C', 'B'); // C depends on B

            const result = analyzeCircularDependencies(graph);
            expect(result.hasCycles).toBe(true);
            expect(result.affectedTasks).toHaveLength(3);
        });

        it('Test 5: should identify safe tasks outside cycles', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');
            // A→B→A cycle
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'A');
            // D depends on C (no cycle)
            graph.addDependency('D', 'C');

            const result = analyzeCircularDependencies(graph);
            expect(result.hasCycles).toBe(true);
            expect(result.safeTasks).toContain('C');
            expect(result.safeTasks).toContain('D');
        });

        it('Test 6: should provide suggestions for resolution', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'A');

            const result = analyzeCircularDependencies(graph);
            expect(result.cycles[0].suggestion).toBeDefined();
            expect(result.cycles[0].suggestion.length).toBeGreaterThan(0);
        });
    });

    describe('wouldCreateCycle', () => {
        it('Test 7: should return false for valid new dependency', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');

            // Adding D depends on C would not create cycle
            graph.addNode('D');
            expect(wouldCreateCycle(graph, 'D', 'C')).toBe(false);
        });

        it('Test 8: should return true for cycle-creating dependency', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');

            // Adding A depends on C would create cycle
            expect(wouldCreateCycle(graph, 'A', 'C')).toBe(true);
        });

        it('Test 9: should return true for self-dependency', () => {
            graph.addNode('A');
            // A depends on A would be a self-loop
            expect(wouldCreateCycle(graph, 'A', 'A')).toBe(true);
        });
    });

    describe('findMinimumCycleBreakers', () => {
        it('Test 10: should return empty array for acyclic graph', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('B', 'A');

            const breakers = findMinimumCycleBreakers(graph);
            expect(breakers).toHaveLength(0);
        });

        it('Test 11: should suggest breaking simple cycle', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'A');

            const breakers = findMinimumCycleBreakers(graph);
            expect(breakers.length).toBeGreaterThan(0);
        });
    });

    describe('formatCycleReport', () => {
        it('Test 12: should format positive report for no cycles', () => {
            const result = analyzeCircularDependencies(graph);
            const report = formatCycleReport(result);
            expect(report).toContain('No circular dependencies');
        });

        it('Test 13: should format detailed report for cycles', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'A');

            const result = analyzeCircularDependencies(graph);
            const report = formatCycleReport(result);
            expect(report).toContain('circular dependency');
            expect(report).toContain('Affected tasks');
        });
    });
});
