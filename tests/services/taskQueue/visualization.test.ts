/**
 * @file tests/services/taskQueue/visualization.test.ts
 * @description Comprehensive tests for task visualization (MT-016.9, MT-016.10)
 */

import { 
    DependencyGraph, 
    createDependencyGraph,
    Task
} from '../../../src/services/taskQueue';
import {
    generateMermaidDiagram,
    generateDependencyMap,
    getMermaidSvgUrl
} from '../../../src/services/taskQueue/visualization';

describe('visualization', () => {
    let graph: DependencyGraph;
    let tasks: Task[];

    beforeEach(() => {
        graph = createDependencyGraph();
        graph.addNode('A');
        graph.addNode('B');
        graph.addNode('C');
        graph.addDependency('B', 'A');
        graph.addDependency('C', 'B');

        tasks = [
            { id: 'A', title: 'Task A', priority: 1, dependencies: [], status: 'completed', createdAt: new Date() },
            { id: 'B', title: 'Task B', priority: 2, dependencies: ['A'], status: 'running', createdAt: new Date() },
            { id: 'C', title: 'Task C', priority: 3, dependencies: ['B'], status: 'pending', createdAt: new Date() }
        ];
    });

    describe('generateMermaidDiagram', () => {
        it('Test 1: should generate valid Mermaid syntax', () => {
            const diagram = generateMermaidDiagram(graph);
            
            expect(diagram).toContain('graph TD');
            expect(diagram).toContain('A');
            expect(diagram).toContain('B');
            expect(diagram).toContain('C');
        });

        it('Test 2: should show dependency arrows', () => {
            const diagram = generateMermaidDiagram(graph);
            
            // B depends on A, so A --> B (arrow from dependency to dependent)
            expect(diagram).toMatch(/A.*-->.*B/);
            expect(diagram).toMatch(/B.*-->.*C/);
        });

        it('Test 3: should include task metadata when provided', () => {
            const metadata = new Map([
                ['A', { id: 'A', title: 'Task Alpha', priority: 1 }],
                ['B', { id: 'B', title: 'Task Beta', priority: 2 }]
            ]);

            const diagram = generateMermaidDiagram(graph, metadata, { showPriority: true });
            
            expect(diagram).toContain('Task Alpha');
            expect(diagram).toContain('Task Beta');
        });

        it('Test 4: should include style definitions when requested', () => {
            const metadata = new Map([
                ['A', { id: 'A', status: 'completed' as const }]
            ]);

            const diagram = generateMermaidDiagram(graph, metadata, { showStatus: true });
            
            expect(diagram).toContain('classDef');
        });

        it('Test 5: should handle empty graph', () => {
            const emptyGraph = createDependencyGraph();
            const diagram = generateMermaidDiagram(emptyGraph);
            
            expect(diagram).toContain('graph TD');
        });

        it('Test 6: should support dark theme', () => {
            const diagram = generateMermaidDiagram(graph, undefined, { 
                showStatus: true, 
                theme: 'dark' 
            });
            
            expect(diagram).toContain('classDef');
        });
    });

    describe('generateDependencyMap', () => {
        it('Test 7: should generate markdown document', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('# Dependency Map');
            expect(map).toContain('## Summary');
            expect(map).toContain('## Task Graph');
        });

        it('Test 8: should include summary statistics', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('Total Tasks');
            expect(map).toContain('Completed');
            expect(map).toContain('In Progress');
        });

        it('Test 9: should include Mermaid diagram', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('```mermaid');
            expect(map).toContain('graph TD');
            expect(map).toContain('```');
        });

        it('Test 10: should include critical path section', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('Critical Path');
        });

        it('Test 11: should include parallelization levels', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('Parallelization Levels');
        });

        it('Test 12: should include task details table', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('## Task Details');
            expect(map).toContain('| ID | Title |');
            expect(map).toContain('Task A');
            expect(map).toContain('Task B');
            expect(map).toContain('Task C');
        });

        it('Test 13: should include dependency details', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('## Dependency Details');
            expect(map).toContain('Depends on');
            expect(map).toContain('Required by');
        });

        it('Test 14: should show status emojis', () => {
            const map = generateDependencyMap(tasks, graph);
            
            expect(map).toContain('✅'); // completed
            expect(map).toContain('🔄'); // running
        });
    });

    describe('getMermaidSvgUrl', () => {
        it('Test 15: should generate mermaid.live URL', () => {
            const diagram = 'graph TD\nA --> B';
            const url = getMermaidSvgUrl(diagram);
            
            expect(url).toContain('mermaid.live');
            expect(url).toContain('base64');
        });
    });
});
