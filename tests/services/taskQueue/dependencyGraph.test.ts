/**
 * @file taskQueue/dependencyGraph.test.ts
 * @description Tests for DependencyGraph (MT-016.2)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn()
}));

import {
    DependencyGraph,
    createDependencyGraph
} from '../../../src/services/taskQueue/dependencyGraph';

describe('DependencyGraph', () => {
    let graph: DependencyGraph;

    beforeEach(() => {
        graph = createDependencyGraph();
    });

    describe('Test 1: constructor', () => {
        it('should create empty graph', () => {
            expect(graph.size()).toBe(0);
            expect(graph.isEmpty()).toBe(true);
        });
    });

    describe('Test 2: addNode', () => {
        it('should add nodes', () => {
            graph.addNode('A');
            graph.addNode('B');
            expect(graph.size()).toBe(2);
            expect(graph.getNodes()).toContain('A');
            expect(graph.getNodes()).toContain('B');
        });

        it('should not duplicate nodes', () => {
            graph.addNode('A');
            graph.addNode('A');
            expect(graph.size()).toBe(1);
        });
    });

    describe('Test 3: addDependency', () => {
        it('should add dependency relationship', () => {
            graph.addDependency('B', 'A'); // B depends on A

            expect(graph.getDependencies('B')).toContain('A');
            expect(graph.getDependents('A')).toContain('B');
        });

        it('should auto-create nodes', () => {
            graph.addDependency('B', 'A');
            expect(graph.size()).toBe(2);
        });
    });

    describe('Test 4: removeDependency', () => {
        it('should remove dependency', () => {
            graph.addDependency('B', 'A');
            graph.removeDependency('B', 'A');

            expect(graph.getDependencies('B')).not.toContain('A');
            expect(graph.getDependents('A')).not.toContain('B');
        });
    });

    describe('Test 5: removeNode', () => {
        it('should remove node and relationships', () => {
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');

            graph.removeNode('B');

            expect(graph.size()).toBe(2);
            expect(graph.getDependents('A')).not.toContain('B');
            expect(graph.getDependencies('C')).not.toContain('B');
        });
    });

    describe('Test 6: getAllDependencies', () => {
        it('should get transitive dependencies', () => {
            graph.addDependency('D', 'C'); // D -> C
            graph.addDependency('C', 'B'); // C -> B
            graph.addDependency('B', 'A'); // B -> A

            const deps = graph.getAllDependencies('D');
            expect(deps).toContain('C');
            expect(deps).toContain('B');
            expect(deps).toContain('A');
        });
    });

    describe('Test 7: getAllDependents', () => {
        it('should get transitive dependents', () => {
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');
            graph.addDependency('D', 'C');

            const dependents = graph.getAllDependents('A');
            expect(dependents).toContain('B');
            expect(dependents).toContain('C');
            expect(dependents).toContain('D');
        });
    });

    describe('Test 8: getRoots and getLeaves', () => {
        it('should identify roots (no dependencies)', () => {
            graph.addNode('A');
            graph.addDependency('B', 'A');

            const roots = graph.getRoots();
            expect(roots).toContain('A');
            expect(roots).not.toContain('B');
        });

        it('should identify leaves (no dependents)', () => {
            graph.addNode('A');
            graph.addDependency('B', 'A');

            const leaves = graph.getLeaves();
            expect(leaves).toContain('B');
            expect(leaves).not.toContain('A');
        });
    });

    describe('Test 9: clear', () => {
        it('should clear all nodes', () => {
            graph.addNode('A');
            graph.addNode('B');
            graph.clear();

            expect(graph.size()).toBe(0);
            expect(graph.isEmpty()).toBe(true);
        });
    });
});
