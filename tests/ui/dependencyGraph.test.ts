/**
 * Tests for Dependency Graph Visualization (MT-033.12)
 *
 * Unit tests for graph construction, cycle detection, topological analysis,
 * Mermaid diagram generation, panel rendering, styles, scripts, and edge cases.
 *
 * @module tests/ui/dependencyGraph
 */

import {
    buildGraphNodes,
    calculateCriticalPath,
    detectCycles,
    generateMermaidDiagram,
    renderDependencyGraphPanel,
    getDependencyGraphStyles,
    getDependencyGraphScript,
    GraphNode,
    GraphOptions,
    CriticalPathResult
} from '../../src/ui/dependencyGraph';
import { CompletePlan, FeatureBlock, BlockLink } from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a minimal CompletePlan for testing.
 *
 * **Simple explanation**: Builds a fake plan with the given features and links
 * so we can test graph functions without needing a real plan.
 */
function createTestPlan(
    featureBlocks: FeatureBlock[] = [],
    blockLinks: BlockLink[] = []
): CompletePlan {
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            version: 1,
        },
        overview: {
            name: 'Test Project',
            description: 'A test project for dependency graph tests',
            goals: ['Test graph functionality'],
        },
        featureBlocks,
        blockLinks,
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
    };
}

/**
 * Creates a test feature block with sensible defaults.
 */
function createFeature(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: overrides.id ?? 'feat-1',
        name: overrides.name ?? 'Feature One',
        description: 'Test feature',
        purpose: 'Testing',
        acceptanceCriteria: ['It works'],
        technicalNotes: 'None',
        priority: overrides.priority ?? 'medium',
        order: overrides.order ?? 1,
    };
}

/**
 * Creates a test block link with sensible defaults.
 */
function createLink(overrides: Partial<BlockLink> = {}): BlockLink {
    return {
        id: overrides.id ?? 'link-1',
        sourceBlockId: overrides.sourceBlockId ?? 'feat-1',
        targetBlockId: overrides.targetBlockId ?? 'feat-2',
        dependencyType: overrides.dependencyType ?? 'requires',
    };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DependencyGraph', () => {
    // ========================================================================
    // buildGraphNodes
    // ========================================================================
    describe('buildGraphNodes', () => {
        it('Test 1: should return empty map for plan with no feature blocks', () => {
            const plan = createTestPlan([], []);
            const nodes = buildGraphNodes(plan);

            expect(nodes.size).toBe(0);
        });

        it('Test 2: should create a node for each feature block', () => {
            const features = [
                createFeature({ id: 'a', name: 'Alpha', priority: 'high', order: 1 }),
                createFeature({ id: 'b', name: 'Beta', priority: 'low', order: 2 }),
                createFeature({ id: 'c', name: 'Gamma', priority: 'critical', order: 3 }),
            ];
            const plan = createTestPlan(features, []);
            const nodes = buildGraphNodes(plan);

            expect(nodes.size).toBe(3);
            expect(nodes.get('a')).toBeDefined();
            expect(nodes.get('b')).toBeDefined();
            expect(nodes.get('c')).toBeDefined();
        });

        it('Test 3: should populate node fields from feature data', () => {
            const features = [
                createFeature({ id: 'x', name: 'Xray', priority: 'critical', order: 5 }),
            ];
            const plan = createTestPlan(features, []);
            const nodes = buildGraphNodes(plan);
            const node = nodes.get('x')!;

            expect(node.id).toBe('x');
            expect(node.name).toBe('Xray');
            expect(node.priority).toBe('critical');
            expect(node.order).toBe(5);
            expect(node.dependsOn).toEqual([]);
            expect(node.blockedBy).toEqual([]);
        });

        it('Test 4: should add dependsOn entries for "requires" links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const nodes = buildGraphNodes(plan);

            // "requires" means target depends on source
            expect(nodes.get('b')!.dependsOn).toContain('a');
            expect(nodes.get('a')!.dependsOn).toEqual([]);
        });

        it('Test 5: should add blockedBy entries for "blocks" links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'blocks' }),
            ];
            const plan = createTestPlan(features, links);
            const nodes = buildGraphNodes(plan);

            // "blocks" means source is blockedBy target
            expect(nodes.get('a')!.blockedBy).toContain('b');
        });

        it('Test 6: should ignore links with non-existent source or target', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'nonexistent', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'nonexistent', targetBlockId: 'a', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const nodes = buildGraphNodes(plan);

            expect(nodes.get('a')!.dependsOn).toEqual([]);
            expect(nodes.get('a')!.blockedBy).toEqual([]);
        });

        it('Test 7: should mark critical path nodes with isCriticalPath true', () => {
            // Linear chain: a -> b -> c (a is required by b, b is required by c)
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
                createFeature({ id: 'c', name: 'C', order: 3 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'b', targetBlockId: 'c', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const nodes = buildGraphNodes(plan);

            // All three should be on the critical path (chain of 3)
            expect(nodes.get('a')!.isCriticalPath).toBe(true);
            expect(nodes.get('b')!.isCriticalPath).toBe(true);
            expect(nodes.get('c')!.isCriticalPath).toBe(true);
        });
    });

    // ========================================================================
    // calculateCriticalPath
    // ========================================================================
    describe('calculateCriticalPath', () => {
        it('Test 8: should return empty path for empty graph', () => {
            const nodes = new Map<string, GraphNode>();
            const result = calculateCriticalPath(nodes);

            expect(result.path).toEqual([]);
            expect(result.totalNodes).toBe(0);
            expect(result.chainLength).toBe(0);
        });

        it('Test 9: should return single node when graph has one independent node', () => {
            const nodes = new Map<string, GraphNode>();
            nodes.set('solo', {
                id: 'solo',
                name: 'Solo',
                priority: 'medium',
                order: 1,
                dependsOn: [],
                blockedBy: [],
                isCriticalPath: false,
            });
            const result = calculateCriticalPath(nodes);

            expect(result.path).toEqual(['solo']);
            expect(result.totalNodes).toBe(1);
            expect(result.chainLength).toBe(1);
        });

        it('Test 10: should find longest chain in a linear dependency graph', () => {
            const nodes = new Map<string, GraphNode>();
            // Chain: a -> b -> c
            nodes.set('a', { id: 'a', name: 'A', priority: 'medium', order: 1, dependsOn: [], blockedBy: [], isCriticalPath: false });
            nodes.set('b', { id: 'b', name: 'B', priority: 'medium', order: 2, dependsOn: ['a'], blockedBy: [], isCriticalPath: false });
            nodes.set('c', { id: 'c', name: 'C', priority: 'medium', order: 3, dependsOn: ['b'], blockedBy: [], isCriticalPath: false });

            const result = calculateCriticalPath(nodes);

            expect(result.path).toEqual(['a', 'b', 'c']);
            expect(result.chainLength).toBe(3);
            expect(result.totalNodes).toBe(3);
        });

        it('Test 11: should pick the longer branch when graph has parallel paths', () => {
            const nodes = new Map<string, GraphNode>();
            // Two branches from root: root -> a -> b (length 3) and root -> c (length 2)
            nodes.set('root', { id: 'root', name: 'Root', priority: 'medium', order: 1, dependsOn: [], blockedBy: [], isCriticalPath: false });
            nodes.set('a', { id: 'a', name: 'A', priority: 'medium', order: 2, dependsOn: ['root'], blockedBy: [], isCriticalPath: false });
            nodes.set('b', { id: 'b', name: 'B', priority: 'medium', order: 3, dependsOn: ['a'], blockedBy: [], isCriticalPath: false });
            nodes.set('c', { id: 'c', name: 'C', priority: 'medium', order: 4, dependsOn: ['root'], blockedBy: [], isCriticalPath: false });

            const result = calculateCriticalPath(nodes);

            expect(result.chainLength).toBe(3);
            expect(result.path).toEqual(['root', 'a', 'b']);
        });

        it('Test 12: should return empty path when all nodes have dependencies (no entry points)', () => {
            // Every node depends on another - forming a cycle (no entry points)
            const nodes = new Map<string, GraphNode>();
            nodes.set('a', { id: 'a', name: 'A', priority: 'medium', order: 1, dependsOn: ['b'], blockedBy: [], isCriticalPath: false });
            nodes.set('b', { id: 'b', name: 'B', priority: 'medium', order: 2, dependsOn: ['a'], blockedBy: [], isCriticalPath: false });

            const result = calculateCriticalPath(nodes);

            expect(result.path).toEqual([]);
            expect(result.chainLength).toBe(0);
            expect(result.totalNodes).toBe(2);
        });

        it('Test 13: should handle multiple independent entry points', () => {
            const nodes = new Map<string, GraphNode>();
            // Two independent nodes
            nodes.set('a', { id: 'a', name: 'A', priority: 'medium', order: 1, dependsOn: [], blockedBy: [], isCriticalPath: false });
            nodes.set('b', { id: 'b', name: 'B', priority: 'medium', order: 2, dependsOn: [], blockedBy: [], isCriticalPath: false });

            const result = calculateCriticalPath(nodes);

            expect(result.chainLength).toBe(1);
            expect(result.totalNodes).toBe(2);
            // Path should contain one of the entry points
            expect(result.path.length).toBe(1);
        });
    });

    // ========================================================================
    // detectCycles
    // ========================================================================
    describe('detectCycles', () => {
        it('Test 14: should return empty array for acyclic graph', () => {
            const features = [
                createFeature({ id: 'a', order: 1 }),
                createFeature({ id: 'b', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);

            const cycles = detectCycles(plan);

            expect(cycles).toEqual([]);
        });

        it('Test 15: should detect a simple two-node cycle', () => {
            const features = [
                createFeature({ id: 'a', order: 1 }),
                createFeature({ id: 'b', order: 2 }),
            ];
            // a requires b, b requires a => cycle
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'b', targetBlockId: 'a', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);

            const cycles = detectCycles(plan);

            expect(cycles.length).toBeGreaterThan(0);
            // The cycle should contain both a and b
            const flatCycles = cycles.flat();
            expect(flatCycles).toContain('a');
            expect(flatCycles).toContain('b');
        });

        it('Test 16: should detect a three-node cycle', () => {
            const features = [
                createFeature({ id: 'a', order: 1 }),
                createFeature({ id: 'b', order: 2 }),
                createFeature({ id: 'c', order: 3 }),
            ];
            // a->b->c->a cycle via "requires"
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'b', targetBlockId: 'c', dependencyType: 'requires' }),
                createLink({ id: 'l3', sourceBlockId: 'c', targetBlockId: 'a', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);

            const cycles = detectCycles(plan);

            expect(cycles.length).toBeGreaterThan(0);
            const flatCycles = cycles.flat();
            expect(flatCycles).toContain('a');
            expect(flatCycles).toContain('b');
            expect(flatCycles).toContain('c');
        });

        it('Test 17: should return empty array for plan with no links', () => {
            const features = [
                createFeature({ id: 'a', order: 1 }),
                createFeature({ id: 'b', order: 2 }),
            ];
            const plan = createTestPlan(features, []);

            const cycles = detectCycles(plan);

            expect(cycles).toEqual([]);
        });

        it('Test 18: should return empty array for empty plan', () => {
            const plan = createTestPlan([], []);

            const cycles = detectCycles(plan);

            expect(cycles).toEqual([]);
        });

        it('Test 19: should only consider "requires" links for cycle detection', () => {
            const features = [
                createFeature({ id: 'a', order: 1 }),
                createFeature({ id: 'b', order: 2 }),
            ];
            // "blocks" and "suggests" links should not create a cycle in adjacency
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'blocks' }),
                createLink({ id: 'l2', sourceBlockId: 'b', targetBlockId: 'a', dependencyType: 'suggests' }),
            ];
            const plan = createTestPlan(features, links);

            const cycles = detectCycles(plan);

            expect(cycles).toEqual([]);
        });

        it('Test 20: should detect self-referencing cycle', () => {
            const features = [
                createFeature({ id: 'a', order: 1 }),
            ];
            // a requires itself
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'a', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);

            const cycles = detectCycles(plan);

            expect(cycles.length).toBeGreaterThan(0);
            const flatCycles = cycles.flat();
            expect(flatCycles).toContain('a');
        });
    });

    // ========================================================================
    // generateMermaidDiagram
    // ========================================================================
    describe('generateMermaidDiagram', () => {
        it('Test 21: should produce a valid mermaid graph header with default TB direction', () => {
            const plan = createTestPlan([createFeature({ id: 'a', name: 'A' })], []);
            const diagram = generateMermaidDiagram(plan);

            expect(diagram).toContain('graph TB');
        });

        it('Test 22: should use LR direction when specified in options', () => {
            const plan = createTestPlan([createFeature({ id: 'a', name: 'A' })], []);
            const diagram = generateMermaidDiagram(plan, { direction: 'LR' });

            expect(diagram).toContain('graph LR');
        });

        it('Test 23: should include node definitions for each feature block', () => {
            const features = [
                createFeature({ id: 'feat-1', name: 'Auth Module', priority: 'medium' }),
                createFeature({ id: 'feat-2', name: 'API Layer', priority: 'high' }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan);

            // Sanitized IDs should appear (N + alphanumeric)
            expect(diagram).toContain('Auth Module');
            expect(diagram).toContain('API Layer');
        });

        it('Test 24: should use circle shape for critical priority features', () => {
            const features = [
                createFeature({ id: 'crit1', name: 'Core Engine', priority: 'critical' }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan);

            // Critical features get (( )) shape
            expect(diagram).toMatch(/\(\(.*Core Engine.*\)\)/);
        });

        it('Test 25: should use stadium shape for entry point features (no dependencies)', () => {
            const features = [
                createFeature({ id: 'entry1', name: 'Setup', priority: 'high' }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan);

            // Entry points (no dependsOn) get ([ ]) shape, but only for non-critical
            expect(diagram).toMatch(/\(\[.*Setup.*\]\)/);
        });

        it('Test 26: should generate edges for "requires" links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan);

            // Should contain an arrow between sanitized node IDs
            expect(diagram).toMatch(/Na\s+(-->|==>)\s+Nb/);
        });

        it('Test 27: should generate dashed arrows for "blocks" links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'blocks' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan);

            expect(diagram).toContain('-.->');
            expect(diagram).toContain('|blocks|');
        });

        it('Test 28: should generate dotted arrows for "suggests" links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'suggests' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan);

            expect(diagram).toContain('-..->');
            expect(diagram).toContain('|suggests|');
        });

        it('Test 29: should generate circle-end arrows for "triggers" links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'triggers' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan);

            expect(diagram).toContain('--o');
            expect(diagram).toContain('|triggers|');
        });

        it('Test 30: should include priority style definitions when showPriority is true', () => {
            const features = [
                createFeature({ id: 'c1', name: 'Critical', priority: 'critical' }),
                createFeature({ id: 'h1', name: 'High', priority: 'high' }),
                createFeature({ id: 'm1', name: 'Medium', priority: 'medium' }),
                createFeature({ id: 'l1', name: 'Low', priority: 'low' }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan, { showPriority: true });

            expect(diagram).toContain('classDef critical fill:#dc3545');
            expect(diagram).toContain('classDef high fill:#fd7e14');
            expect(diagram).toContain('classDef medium fill:#0d6efd');
            expect(diagram).toContain('classDef low fill:#6c757d');
        });

        it('Test 31: should omit priority styles when showPriority is false', () => {
            const features = [
                createFeature({ id: 'c1', name: 'Critical', priority: 'critical' }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan, { showPriority: false });

            expect(diagram).not.toContain('classDef critical');
            expect(diagram).not.toContain('%% Priority Styles');
        });

        it('Test 32: should truncate long feature names to 30 characters', () => {
            const longName = 'A Very Long Feature Name That Exceeds Thirty Characters Easily';
            const features = [
                createFeature({ id: 'long1', name: longName, priority: 'medium' }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan);

            // Should not contain the full long name
            expect(diagram).not.toContain(longName);
            // Should contain truncated version ending in "..."
            expect(diagram).toContain('...');
        });

        it('Test 33: should produce diagram with no node or edge definitions for plan with no features', () => {
            const plan = createTestPlan([], []);
            const diagram = generateMermaidDiagram(plan);

            expect(diagram).toContain('graph TB');
            // Should not contain any node shape patterns ([ ], ([ ]), (( )))
            expect(diagram).not.toMatch(/N\w+\[/);
            expect(diagram).not.toMatch(/N\w+\(\[/);
            expect(diagram).not.toMatch(/N\w+\(\(/);
            // Should not contain any edge arrows
            expect(diagram).not.toContain('-->');
            expect(diagram).not.toContain('==>');
            expect(diagram).not.toContain('-.->');
        });

        it('Test 34: should use thick arrows (==>) for critical path "requires" links when highlightCriticalPath is true', () => {
            // Chain: a -> b where both are on critical path
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan, { highlightCriticalPath: true });

            // Both nodes should be on critical path, so the edge should be ==>
            expect(diagram).toContain('==>');
        });

        it('Test 35: should include linkStyle and critical path comment when highlightCriticalPath is true', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan, { highlightCriticalPath: true });

            expect(diagram).toContain('%% Critical Path');
            expect(diagram).toContain('linkStyle default stroke:#6c757d');
        });
    });

    // ========================================================================
    // renderDependencyGraphPanel
    // ========================================================================
    describe('renderDependencyGraphPanel', () => {
        it('Test 36: should render HTML containing graph stats for features and links', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const html = renderDependencyGraphPanel(plan);

            // Feature count
            expect(html).toContain('<span class="stat-value">2</span>');
            // Link count
            expect(html).toContain('<span class="stat-value">1</span>');
        });

        it('Test 37: should include cycle warnings when cycles are detected', () => {
            const features = [
                createFeature({ id: 'a', name: 'Alpha', order: 1 }),
                createFeature({ id: 'b', name: 'Beta', order: 2 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'b', targetBlockId: 'a', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);
            const html = renderDependencyGraphPanel(plan);

            expect(html).toContain('Circular dependencies detected');
            expect(html).toContain('graph-warning');
        });

        it('Test 38: should not include cycle warnings when there are no cycles', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
            ];
            const plan = createTestPlan(features, []);
            const html = renderDependencyGraphPanel(plan);

            expect(html).not.toContain('Circular dependencies detected');
            expect(html).not.toContain('graph-warning');
        });

        it('Test 39: should include mermaid diagram code in the output', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
            ];
            const plan = createTestPlan(features, []);
            const html = renderDependencyGraphPanel(plan);

            expect(html).toContain('mermaidGraph');
            expect(html).toContain('graph TB');
        });

        it('Test 40: should include export controls (SVG, copy, direction toggle)', () => {
            const plan = createTestPlan([createFeature({ id: 'a', name: 'A' })], []);
            const html = renderDependencyGraphPanel(plan);

            expect(html).toContain('exportGraphAsSvg()');
            expect(html).toContain('copyMermaidCode()');
            expect(html).toContain('toggleGraphDirection()');
        });

        it('Test 41: should include legend items for all priority levels', () => {
            const plan = createTestPlan([createFeature({ id: 'a', name: 'A' })], []);
            const html = renderDependencyGraphPanel(plan);

            expect(html).toContain('#dc3545'); // Critical color
            expect(html).toContain('#fd7e14'); // High color
            expect(html).toContain('#0d6efd'); // Medium color
            expect(html).toContain('#6c757d'); // Low color
        });

        it('Test 42: should escape HTML in mermaid code textarea', () => {
            // Feature name containing characters that need HTML escaping
            const features = [
                createFeature({ id: 'a', name: '<script>alert("xss")</script>', order: 1 }),
            ];
            const plan = createTestPlan(features, []);
            const html = renderDependencyGraphPanel(plan);

            // The mermaid code textarea should have escaped < and > from the script tags
            expect(html).toContain('&lt;');
            expect(html).toContain('&gt;');
            // The escapeLabel converts " to ' before escapeHtml runs, so &amp; may appear
            // but the key protection is that < and > are escaped
            const textarea = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? '';
            expect(textarea).toContain('&lt;script&gt;');
            expect(textarea).not.toContain('<script>');
        });
    });

    // ========================================================================
    // getDependencyGraphStyles
    // ========================================================================
    describe('getDependencyGraphStyles', () => {
        it('Test 43: should return CSS containing key class selectors', () => {
            const styles = getDependencyGraphStyles();

            expect(styles).toContain('.dependency-graph-panel');
            expect(styles).toContain('.graph-header');
            expect(styles).toContain('.graph-stats');
            expect(styles).toContain('.graph-container');
            expect(styles).toContain('.graph-legend');
            expect(styles).toContain('.graph-warning');
            expect(styles).toContain('.mermaid');
        });

        it('Test 44: should use VS Code CSS variables for theming', () => {
            const styles = getDependencyGraphStyles();

            expect(styles).toContain('var(--vscode-editor-background)');
            expect(styles).toContain('var(--vscode-input-border)');
            expect(styles).toContain('var(--vscode-input-background)');
        });
    });

    // ========================================================================
    // getDependencyGraphScript
    // ========================================================================
    describe('getDependencyGraphScript', () => {
        it('Test 45: should contain toggleGraphDirection function', () => {
            const script = getDependencyGraphScript();

            expect(script).toContain('function toggleGraphDirection()');
            expect(script).toContain("graphDirection === 'TB' ? 'LR' : 'TB'");
        });

        it('Test 46: should contain exportGraphAsSvg function', () => {
            const script = getDependencyGraphScript();

            expect(script).toContain('function exportGraphAsSvg()');
            expect(script).toContain('XMLSerializer');
        });

        it('Test 47: should contain copyMermaidCode function', () => {
            const script = getDependencyGraphScript();

            expect(script).toContain('function copyMermaidCode()');
            expect(script).toContain('navigator.clipboard.writeText');
        });

        it('Test 48: should contain mermaid initialization config', () => {
            const script = getDependencyGraphScript();

            expect(script).toContain('mermaid.initialize');
            expect(script).toContain("theme: 'dark'");
            expect(script).toContain("securityLevel: 'loose'");
        });
    });

    // ========================================================================
    // Edge Cases and Integration
    // ========================================================================
    describe('Edge Cases', () => {
        it('Test 49: should handle feature IDs with special characters in sanitization', () => {
            const features = [
                createFeature({ id: 'feat-123-abc!@#', name: 'Special', order: 1 }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan);

            // sanitizeId should strip special chars and prefix with N
            expect(diagram).toContain('Nfeat123abc');
            // The node definition line should not contain the original special characters
            // (Note: '#' appears in CSS color codes elsewhere, so we check the node line specifically)
            const nodeLines = diagram.split('\n').filter(l => l.includes('Nfeat123abc'));
            expect(nodeLines.length).toBeGreaterThan(0);
            // The sanitized ID itself should not contain !, @, or - from the original
            const nodeDefLine = nodeLines[0];
            expect(nodeDefLine).not.toContain('!');
            expect(nodeDefLine).not.toContain('@');
        });

        it('Test 50: should escape special characters in feature labels', () => {
            const features = [
                createFeature({ id: 'a', name: 'Auth [v2] "beta"', order: 1 }),
            ];
            const plan = createTestPlan(features, []);
            const diagram = generateMermaidDiagram(plan);

            // Brackets should be replaced with parentheses, quotes with single quotes
            expect(diagram).not.toContain('[v2]');
            expect(diagram).not.toContain('"beta"');
            expect(diagram).toContain('(v2)');
            expect(diagram).toContain("'beta'");
        });

        it('Test 51: should handle large graphs without errors', () => {
            const features: FeatureBlock[] = [];
            const links: BlockLink[] = [];

            // Create 50 features in a chain
            for (let i = 0; i < 50; i++) {
                features.push(createFeature({ id: `f${i}`, name: `Feature ${i}`, order: i }));
                if (i > 0) {
                    links.push(createLink({
                        id: `l${i}`,
                        sourceBlockId: `f${i - 1}`,
                        targetBlockId: `f${i}`,
                        dependencyType: 'requires',
                    }));
                }
            }

            const plan = createTestPlan(features, links);

            expect(() => buildGraphNodes(plan)).not.toThrow();
            expect(() => generateMermaidDiagram(plan)).not.toThrow();
            expect(() => detectCycles(plan)).not.toThrow();

            const nodes = buildGraphNodes(plan);
            expect(nodes.size).toBe(50);

            const cycles = detectCycles(plan);
            expect(cycles).toEqual([]);
        });

        it('Test 52: should handle diamond dependency pattern correctly', () => {
            //   a
            //  / \
            // b   c
            //  \ /
            //   d
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
                createFeature({ id: 'c', name: 'C', order: 3 }),
                createFeature({ id: 'd', name: 'D', order: 4 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'a', targetBlockId: 'c', dependencyType: 'requires' }),
                createLink({ id: 'l3', sourceBlockId: 'b', targetBlockId: 'd', dependencyType: 'requires' }),
                createLink({ id: 'l4', sourceBlockId: 'c', targetBlockId: 'd', dependencyType: 'requires' }),
            ];
            const plan = createTestPlan(features, links);

            const cycles = detectCycles(plan);
            expect(cycles).toEqual([]);

            const nodes = buildGraphNodes(plan);
            // d should depend on both b and c
            expect(nodes.get('d')!.dependsOn).toContain('b');
            expect(nodes.get('d')!.dependsOn).toContain('c');

            const criticalPath = calculateCriticalPath(nodes);
            // Longest path is 3 (a -> b -> d or a -> c -> d)
            expect(criticalPath.chainLength).toBe(3);
        });

        it('Test 53: should handle mixed dependency types in same graph', () => {
            const features = [
                createFeature({ id: 'a', name: 'A', order: 1 }),
                createFeature({ id: 'b', name: 'B', order: 2 }),
                createFeature({ id: 'c', name: 'C', order: 3 }),
            ];
            const links = [
                createLink({ id: 'l1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                createLink({ id: 'l2', sourceBlockId: 'b', targetBlockId: 'c', dependencyType: 'blocks' }),
                createLink({ id: 'l3', sourceBlockId: 'a', targetBlockId: 'c', dependencyType: 'suggests' }),
            ];
            const plan = createTestPlan(features, links);
            const diagram = generateMermaidDiagram(plan);

            // Should contain different arrow types
            expect(diagram).toMatch(/(-->|==>)/);   // requires
            expect(diagram).toContain('-.->');       // blocks
            expect(diagram).toContain('-..->');      // suggests
        });
    });
});
