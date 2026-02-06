/**
 * @file taskQueue/topologicalSort.test.ts
 * @description Tests for topological sorting (MT-016.3, MT-016.4)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn()
}));

import { createDependencyGraph } from '../../../src/services/taskQueue/dependencyGraph';
import {
    topologicalSort,
    detectCircularDependencies,
    hasCircularDependencies,
    getCriticalPath,
    getParallelLevels
} from '../../../src/services/taskQueue/topologicalSort';

describe('TopologicalSort', () => {
    describe('Test 1: topologicalSort', () => {
        it('should sort nodes in dependency order', () => {
            const graph = createDependencyGraph();
            graph.addDependency('C', 'B'); // C depends on B
            graph.addDependency('B', 'A'); // B depends on A

            const sorted = topologicalSort(graph);

            expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
            expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
        });

        it('should handle empty graph', () => {
            const graph = createDependencyGraph();
            const sorted = topologicalSort(graph);
            expect(sorted).toEqual([]);
        });

        it('should handle independent nodes', () => {
            const graph = createDependencyGraph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');

            const sorted = topologicalSort(graph);
            expect(sorted).toHaveLength(3);
        });
    });

    describe('Test 2: detectCircularDependencies', () => {
        it('should detect simple cycle', () => {
            const graph = createDependencyGraph();
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'A');

            const cycles = detectCircularDependencies(graph);
            expect(cycles.length).toBeGreaterThan(0);
        });

        it('should detect longer cycles', () => {
            const graph = createDependencyGraph();
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'C');
            graph.addDependency('C', 'A');

            const cycles = detectCircularDependencies(graph);
            expect(cycles.length).toBeGreaterThan(0);
        });

        it('should return empty for acyclic graph', () => {
            const graph = createDependencyGraph();
            graph.addDependency('C', 'B');
            graph.addDependency('B', 'A');

            const cycles = detectCircularDependencies(graph);
            expect(cycles).toEqual([]);
        });
    });

    describe('Test 3: hasCircularDependencies', () => {
        it('should return true for cyclic graph', () => {
            const graph = createDependencyGraph();
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'A');

            expect(hasCircularDependencies(graph)).toBe(true);
        });

        it('should return false for acyclic graph', () => {
            const graph = createDependencyGraph();
            graph.addDependency('B', 'A');

            expect(hasCircularDependencies(graph)).toBe(false);
        });
    });

    describe('Test 4: getCriticalPath', () => {
        it('should find longest path', () => {
            const graph = createDependencyGraph();
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');
            graph.addDependency('D', 'C');
            graph.addNode('X'); // Independent node

            const path = getCriticalPath(graph);
            expect(path.length).toBeGreaterThanOrEqual(4);
        });

        it('should return single node for single-node graph', () => {
            const graph = createDependencyGraph();
            graph.addNode('A');

            const path = getCriticalPath(graph);
            expect(path).toContain('A');
        });
    });

    describe('Test 5: getParallelLevels', () => {
        it('should group tasks that can run in parallel', () => {
            const graph = createDependencyGraph();
            // Level 0: A, B (no deps)
            // Level 1: C (depends on A), D (depends on B)
            // Level 2: E (depends on C, D)
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('C', 'A');
            graph.addDependency('D', 'B');
            graph.addDependency('E', 'C');
            graph.addDependency('E', 'D');

            const levels = getParallelLevels(graph);

            expect(levels[0]).toContain('A');
            expect(levels[0]).toContain('B');
            expect(levels[1]).toContain('C');
            expect(levels[1]).toContain('D');
            expect(levels[2]).toContain('E');
        });
    });
});
