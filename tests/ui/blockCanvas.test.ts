/**
 * Tests for Block Canvas Component (MT-033.19)
 *
 * Unit tests for the visual drag-and-drop canvas that allows users to
 * create, position, and connect feature blocks. Tests cover canvas state
 * management, block CRUD, connection logic, layout algorithms,
 * rendering output, serialization, and edge cases.
 *
 * @module tests/ui/blockCanvas
 */

import {
    CanvasBlock,
    CanvasConnection,
    CanvasState,
    CanvasConfig,
    ConnectionMode,
    DEFAULT_CANVAS_CONFIG,
    PRIORITY_COLORS,
    CONNECTION_COLORS,
    createCanvasState,
    featureToCanvasBlock,
    linkToConnection,
    canvasToFeatures,
    addBlock,
    removeBlock,
    moveBlock,
    addConnection,
    removeConnection,
    selectBlock,
    clearSelection,
    setZoom,
    setPan,
    startConnection,
    endConnection,
    autoLayout,
    autoLayoutByDependency,
    renderCanvas,
    getCanvasStyles,
    getCanvasScript,
} from '../../src/ui/blockCanvas';

import { FeatureBlock, BlockLink, DependencyType } from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal FeatureBlock for testing.
 */
function makeFeatureBlock(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: overrides.id ?? 'fb-1',
        name: overrides.name ?? 'Test Feature',
        description: overrides.description ?? 'A test feature description',
        purpose: overrides.purpose ?? 'Testing',
        acceptanceCriteria: overrides.acceptanceCriteria ?? ['Criterion A', 'Criterion B'],
        technicalNotes: overrides.technicalNotes ?? '',
        priority: overrides.priority ?? 'medium',
        order: overrides.order ?? 1,
    };
}

/**
 * Create a minimal BlockLink for testing.
 */
function makeBlockLink(overrides: Partial<BlockLink> = {}): BlockLink {
    return {
        id: overrides.id ?? 'link-1',
        sourceBlockId: overrides.sourceBlockId ?? 'fb-1',
        targetBlockId: overrides.targetBlockId ?? 'fb-2',
        dependencyType: overrides.dependencyType ?? 'requires',
    };
}

/**
 * Create a pre-populated canvas state for multi-block tests.
 */
function makePopulatedState(): CanvasState {
    const features = [
        makeFeatureBlock({ id: 'fb-1', name: 'Auth' }),
        makeFeatureBlock({ id: 'fb-2', name: 'Dashboard' }),
        makeFeatureBlock({ id: 'fb-3', name: 'Settings' }),
    ];
    const links = [
        makeBlockLink({ id: 'link-1', sourceBlockId: 'fb-1', targetBlockId: 'fb-2', dependencyType: 'requires' }),
    ];
    return createCanvasState(features, links);
}

// ============================================================================
// Tests
// ============================================================================

describe('BlockCanvas', () => {

    // =========================================================================
    // Section 1: Canvas State Creation
    // =========================================================================

    describe('Canvas State Creation', () => {
        it('Test 1: should create empty canvas state with defaults', () => {
            const state = createCanvasState();

            expect(state.blocks).toEqual([]);
            expect(state.connections).toEqual([]);
            expect(state.zoom).toBe(1);
            expect(state.pan).toEqual({ x: 0, y: 0 });
            expect(state.selectedBlockIds).toEqual([]);
            expect(state.selectedConnectionIds).toEqual([]);
            expect(state.gridSnap).toBe(true);
            expect(state.gridSize).toBe(DEFAULT_CANVAS_CONFIG.gridSize);
            expect(state.connectionMode).toBeNull();
        });

        it('Test 2: should create canvas state from feature blocks and links', () => {
            const features = [
                makeFeatureBlock({ id: 'fb-1', name: 'Feature A' }),
                makeFeatureBlock({ id: 'fb-2', name: 'Feature B' }),
            ];
            const links = [
                makeBlockLink({ id: 'link-1', sourceBlockId: 'fb-1', targetBlockId: 'fb-2' }),
            ];

            const state = createCanvasState(features, links);

            expect(state.blocks).toHaveLength(2);
            expect(state.connections).toHaveLength(1);
            expect(state.blocks[0].id).toBe('fb-1');
            expect(state.blocks[1].id).toBe('fb-2');
            expect(state.connections[0].sourceId).toBe('fb-1');
            expect(state.connections[0].targetId).toBe('fb-2');
        });
    });

    // =========================================================================
    // Section 2: Feature-to-Canvas Conversion
    // =========================================================================

    describe('Feature-to-Canvas Block Conversion', () => {
        it('Test 3: should convert FeatureBlock to CanvasBlock with correct properties', () => {
            const feature = makeFeatureBlock({
                id: 'fb-99',
                name: 'Login',
                description: 'User login feature',
                priority: 'high',
                acceptanceCriteria: ['AC1', 'AC2', 'AC3'],
            });

            const canvas = featureToCanvasBlock(feature, 0);

            expect(canvas.id).toBe('fb-99');
            expect(canvas.name).toBe('Login');
            expect(canvas.type).toBe('feature');
            expect(canvas.priority).toBe('high');
            expect(canvas.selected).toBe(false);
            expect(canvas.dragging).toBe(false);
            expect(canvas.description).toBe('User login feature');
            expect(canvas.criteriaCount).toBe(3);
            expect(canvas.size).toEqual(DEFAULT_CANVAS_CONFIG.defaultBlockSize);
        });

        it('Test 4: should auto-layout blocks in a grid pattern based on index', () => {
            const feature = makeFeatureBlock({ id: 'fb-1' });
            const spacing = { x: 250, y: 150 };
            const offset = { x: 50, y: 50 };

            // Index 0 => col 0, row 0
            const b0 = featureToCanvasBlock(feature, 0);
            expect(b0.position).toEqual({ x: offset.x, y: offset.y });

            // Index 1 => col 1, row 0
            const b1 = featureToCanvasBlock(feature, 1);
            expect(b1.position).toEqual({ x: offset.x + spacing.x, y: offset.y });

            // Index 4 => col 0, row 1 (wraps at 4 columns)
            const b4 = featureToCanvasBlock(feature, 4);
            expect(b4.position).toEqual({ x: offset.x, y: offset.y + spacing.y });

            // Index 5 => col 1, row 1
            const b5 = featureToCanvasBlock(feature, 5);
            expect(b5.position).toEqual({ x: offset.x + spacing.x, y: offset.y + spacing.y });
        });

        it('Test 5: should truncate description to 100 characters', () => {
            const longDesc = 'A'.repeat(150);
            const feature = makeFeatureBlock({ description: longDesc });
            const canvas = featureToCanvasBlock(feature, 0);

            expect(canvas.description).toHaveLength(100);
            expect(canvas.description).toBe(longDesc.slice(0, 100));
        });
    });

    // =========================================================================
    // Section 3: Link-to-Connection Conversion
    // =========================================================================

    describe('Link-to-Connection Conversion', () => {
        it('Test 6: should convert BlockLink to CanvasConnection', () => {
            const link = makeBlockLink({
                id: 'link-42',
                sourceBlockId: 'fb-A',
                targetBlockId: 'fb-B',
                dependencyType: 'blocks',
            });

            const conn = linkToConnection(link);

            expect(conn.id).toBe('link-42');
            expect(conn.sourceId).toBe('fb-A');
            expect(conn.targetId).toBe('fb-B');
            expect(conn.type).toBe('blocks');
            expect(conn.selected).toBe(false);
        });
    });

    // =========================================================================
    // Section 4: Canvas-to-Feature Serialization
    // =========================================================================

    describe('Canvas to Features Serialization', () => {
        it('Test 7: should convert canvas state back to partial feature blocks and links', () => {
            const state = makePopulatedState();
            const result = canvasToFeatures(state);

            expect(result.blocks).toHaveLength(3);
            expect(result.links).toHaveLength(1);

            // Check block structure
            expect(result.blocks[0].id).toBe('fb-1');
            expect(result.blocks[0].name).toBe('Auth');
            expect(result.blocks[0].order).toBe(1);
            expect(result.blocks[0].acceptanceCriteria).toEqual([]);

            // Check link structure
            expect(result.links[0].sourceBlockId).toBe('fb-1');
            expect(result.links[0].targetBlockId).toBe('fb-2');
            expect(result.links[0].dependencyType).toBe('requires');
        });

        it('Test 8: should filter out non-feature blocks when serializing', () => {
            const state = createCanvasState();
            addBlock(state, 'Feature Block', { x: 10, y: 10 }, 'feature');
            addBlock(state, 'Note Block', { x: 100, y: 100 }, 'note');
            addBlock(state, 'Milestone Block', { x: 200, y: 200 }, 'milestone');

            const result = canvasToFeatures(state);

            // Only the feature block should be in the result
            expect(result.blocks).toHaveLength(1);
            expect(result.blocks[0].name).toBe('Feature Block');
        });
    });

    // =========================================================================
    // Section 5: Block Operations
    // =========================================================================

    describe('Block Operations', () => {
        it('Test 9: should add a block to the canvas with snapped position', () => {
            const state = createCanvasState();
            const block = addBlock(state, 'New Block', { x: 115, y: 87 });

            expect(state.blocks).toHaveLength(1);
            expect(block.name).toBe('New Block');
            expect(block.type).toBe('feature');
            expect(block.priority).toBe('medium');
            expect(block.criteriaCount).toBe(0);
            // Grid snap is true by default (gridSize=20): 115 rounds to 120, 87 rounds to 80
            expect(block.position).toEqual({ x: 120, y: 80 });
        });

        it('Test 10: should add a block without grid snap when disabled', () => {
            const state = createCanvasState();
            state.gridSnap = false;
            const block = addBlock(state, 'Free Block', { x: 115, y: 87 });

            // With gridSize=1, snap doesn't change values
            expect(block.position).toEqual({ x: 115, y: 87 });
        });

        it('Test 11: should add a milestone block', () => {
            const state = createCanvasState();
            const block = addBlock(state, 'V1 Release', { x: 0, y: 0 }, 'milestone');

            expect(block.type).toBe('milestone');
            expect(block.name).toBe('V1 Release');
        });

        it('Test 12: should remove a block and its connections', () => {
            const state = makePopulatedState();

            expect(state.blocks).toHaveLength(3);
            expect(state.connections).toHaveLength(1);

            // Remove fb-1 which is the source of link-1
            removeBlock(state, 'fb-1');

            expect(state.blocks).toHaveLength(2);
            expect(state.blocks.find(b => b.id === 'fb-1')).toBeUndefined();
            // The connection referencing fb-1 should also be removed
            expect(state.connections).toHaveLength(0);
        });

        it('Test 13: should remove block from selectedBlockIds', () => {
            const state = makePopulatedState();
            selectBlock(state, 'fb-2');
            expect(state.selectedBlockIds).toContain('fb-2');

            removeBlock(state, 'fb-2');

            expect(state.selectedBlockIds).not.toContain('fb-2');
        });

        it('Test 14: should move a block to a new snapped position', () => {
            const state = makePopulatedState();

            moveBlock(state, 'fb-1', { x: 333, y: 222 });

            const block = state.blocks.find(b => b.id === 'fb-1');
            // gridSnap is true, gridSize=20: 333 -> 340, 222 -> 220
            expect(block!.position).toEqual({ x: 340, y: 220 });
        });

        it('Test 15: should not throw when moving a non-existent block', () => {
            const state = createCanvasState();
            expect(() => moveBlock(state, 'nonexistent', { x: 0, y: 0 })).not.toThrow();
        });
    });

    // =========================================================================
    // Section 6: Connection Operations
    // =========================================================================

    describe('Connection Operations', () => {
        it('Test 16: should add a connection between two blocks', () => {
            const state = makePopulatedState();
            const conn = addConnection(state, 'fb-2', 'fb-3', 'triggers');

            expect(conn).not.toBeNull();
            expect(conn!.sourceId).toBe('fb-2');
            expect(conn!.targetId).toBe('fb-3');
            expect(conn!.type).toBe('triggers');
            expect(conn!.selected).toBe(false);
            // Original connection plus this one
            expect(state.connections).toHaveLength(2);
        });

        it('Test 17: should prevent self-connections', () => {
            const state = makePopulatedState();
            const conn = addConnection(state, 'fb-1', 'fb-1', 'requires');

            expect(conn).toBeNull();
            // Only original connection should remain
            expect(state.connections).toHaveLength(1);
        });

        it('Test 18: should prevent duplicate connections', () => {
            const state = makePopulatedState();
            // fb-1 -> fb-2 already exists
            const conn = addConnection(state, 'fb-1', 'fb-2', 'blocks');

            expect(conn).toBeNull();
            expect(state.connections).toHaveLength(1);
        });

        it('Test 19: should remove a connection and clean up selection', () => {
            const state = makePopulatedState();
            const connId = state.connections[0].id;
            state.selectedConnectionIds.push(connId);
            state.connections[0].selected = true;

            removeConnection(state, connId);

            expect(state.connections).toHaveLength(0);
            expect(state.selectedConnectionIds).not.toContain(connId);
        });

        it('Test 20: should allow reverse connection (B->A when A->B exists)', () => {
            const state = makePopulatedState();
            // fb-1 -> fb-2 exists, try fb-2 -> fb-1
            const conn = addConnection(state, 'fb-2', 'fb-1', 'suggests');

            expect(conn).not.toBeNull();
            expect(state.connections).toHaveLength(2);
        });
    });

    // =========================================================================
    // Section 7: Selection
    // =========================================================================

    describe('Selection', () => {
        it('Test 21: should select a single block and deselect others', () => {
            const state = makePopulatedState();

            selectBlock(state, 'fb-1');
            expect(state.selectedBlockIds).toEqual(['fb-1']);
            expect(state.blocks.find(b => b.id === 'fb-1')!.selected).toBe(true);

            // Selecting another block should deselect the first
            selectBlock(state, 'fb-2');
            expect(state.selectedBlockIds).toEqual(['fb-2']);
            expect(state.blocks.find(b => b.id === 'fb-1')!.selected).toBe(false);
            expect(state.blocks.find(b => b.id === 'fb-2')!.selected).toBe(true);
        });

        it('Test 22: should support multi-select', () => {
            const state = makePopulatedState();

            selectBlock(state, 'fb-1');
            selectBlock(state, 'fb-2', true);

            expect(state.selectedBlockIds).toEqual(['fb-1', 'fb-2']);
            expect(state.blocks.find(b => b.id === 'fb-1')!.selected).toBe(true);
            expect(state.blocks.find(b => b.id === 'fb-2')!.selected).toBe(true);
        });

        it('Test 23: should clear all selections', () => {
            const state = makePopulatedState();
            selectBlock(state, 'fb-1');
            selectBlock(state, 'fb-2', true);
            state.selectedConnectionIds.push('link-1');
            state.connections[0].selected = true;

            clearSelection(state);

            expect(state.selectedBlockIds).toEqual([]);
            expect(state.selectedConnectionIds).toEqual([]);
            expect(state.blocks.every(b => b.selected === false)).toBe(true);
            expect(state.connections.every(c => c.selected === false)).toBe(true);
        });

        it('Test 24: should not duplicate block in selectedBlockIds on re-select', () => {
            const state = makePopulatedState();

            selectBlock(state, 'fb-1');
            selectBlock(state, 'fb-1', true);

            // Should only appear once
            expect(state.selectedBlockIds.filter(id => id === 'fb-1')).toHaveLength(1);
        });
    });

    // =========================================================================
    // Section 8: Zoom and Pan
    // =========================================================================

    describe('Zoom and Pan', () => {
        it('Test 25: should set zoom within bounds', () => {
            const state = createCanvasState();

            setZoom(state, 1.5);
            expect(state.zoom).toBe(1.5);

            setZoom(state, 0.5);
            expect(state.zoom).toBe(0.5);
        });

        it('Test 26: should clamp zoom to minimum', () => {
            const state = createCanvasState();

            setZoom(state, 0.01); // Below default minZoom of 0.25
            expect(state.zoom).toBe(DEFAULT_CANVAS_CONFIG.minZoom);
        });

        it('Test 27: should clamp zoom to maximum', () => {
            const state = createCanvasState();

            setZoom(state, 10); // Above default maxZoom of 2
            expect(state.zoom).toBe(DEFAULT_CANVAS_CONFIG.maxZoom);
        });

        it('Test 28: should respect custom canvas config zoom bounds', () => {
            const state = createCanvasState();
            const customConfig: CanvasConfig = {
                ...DEFAULT_CANVAS_CONFIG,
                minZoom: 0.1,
                maxZoom: 5,
            };

            setZoom(state, 0.05, customConfig);
            expect(state.zoom).toBe(0.1);

            setZoom(state, 4.5, customConfig);
            expect(state.zoom).toBe(4.5);

            setZoom(state, 6, customConfig);
            expect(state.zoom).toBe(5);
        });

        it('Test 29: should set pan offset', () => {
            const state = createCanvasState();

            setPan(state, { x: -100, y: -200 });

            expect(state.pan).toEqual({ x: -100, y: -200 });
        });
    });

    // =========================================================================
    // Section 9: Connection Mode (Drawing)
    // =========================================================================

    describe('Connection Mode', () => {
        it('Test 30: should start connection mode', () => {
            const state = makePopulatedState();

            startConnection(state, 'fb-1', 'requires');

            expect(state.connectionMode).not.toBeNull();
            expect(state.connectionMode!.sourceId).toBe('fb-1');
            expect(state.connectionMode!.type).toBe('requires');
            expect(state.connectionMode!.currentPoint).toEqual({ x: 0, y: 0 });
        });

        it('Test 31: should end connection mode and create connection', () => {
            const state = makePopulatedState();
            startConnection(state, 'fb-2', 'triggers');

            const conn = endConnection(state, 'fb-3');

            expect(conn).not.toBeNull();
            expect(conn!.sourceId).toBe('fb-2');
            expect(conn!.targetId).toBe('fb-3');
            expect(conn!.type).toBe('triggers');
            expect(state.connectionMode).toBeNull();
        });

        it('Test 32: should end connection mode without target and create no connection', () => {
            const state = makePopulatedState();
            startConnection(state, 'fb-1', 'requires');

            const conn = endConnection(state);

            expect(conn).toBeNull();
            expect(state.connectionMode).toBeNull();
        });

        it('Test 33: should not create connection when ending on the source block', () => {
            const state = makePopulatedState();
            startConnection(state, 'fb-1', 'requires');

            const conn = endConnection(state, 'fb-1');

            expect(conn).toBeNull();
            expect(state.connectionMode).toBeNull();
        });

        it('Test 34: should return null from endConnection when not in connection mode', () => {
            const state = createCanvasState();

            const conn = endConnection(state, 'fb-1');

            expect(conn).toBeNull();
        });
    });

    // =========================================================================
    // Section 10: Auto-Layout Algorithms
    // =========================================================================

    describe('Auto-Layout', () => {
        it('Test 35: should auto-layout blocks in a grid pattern', () => {
            const state = makePopulatedState();

            autoLayout(state);

            // 3 blocks => ceil(sqrt(3)) = 2 columns
            const spacing = { x: 250, y: 150 };
            expect(state.blocks[0].position).toEqual({ x: 50, y: 50 });
            expect(state.blocks[1].position).toEqual({ x: 50 + spacing.x, y: 50 });
            expect(state.blocks[2].position).toEqual({ x: 50, y: 50 + spacing.y });
        });

        it('Test 36: should not throw on empty state for autoLayout', () => {
            const state = createCanvasState();
            expect(() => autoLayout(state)).not.toThrow();
        });

        it('Test 37: should arrange blocks by dependency levels using topological sort', () => {
            const state = makePopulatedState();
            // fb-1 requires-> fb-2, fb-3 has no dependencies
            // Level 0: fb-1, fb-3 (no incoming "requires")
            // Level 1: fb-2 (depends on fb-1)

            autoLayoutByDependency(state);

            const fb1 = state.blocks.find(b => b.id === 'fb-1')!;
            const fb2 = state.blocks.find(b => b.id === 'fb-2')!;
            const fb3 = state.blocks.find(b => b.id === 'fb-3')!;

            // fb-1 and fb-3 should be in level 0 (lower y), fb-2 in level 1 (higher y)
            expect(fb1.position.y).toBeLessThan(fb2.position.y);
            expect(fb3.position.y).toBeLessThan(fb2.position.y);
        });

        it('Test 38: should not throw on empty state for autoLayoutByDependency', () => {
            const state = createCanvasState();
            expect(() => autoLayoutByDependency(state)).not.toThrow();
        });
    });

    // =========================================================================
    // Section 11: Rendering
    // =========================================================================

    describe('Rendering', () => {
        it('Test 39: should render canvas HTML with blocks and connections', () => {
            const state = makePopulatedState();
            const html = renderCanvas(state);

            expect(html).toContain('canvasContainer');
            expect(html).toContain('canvasViewport');
            expect(html).toContain('canvasSvg');
            expect(html).toContain('blocksLayer');
            expect(html).toContain('connectionsLayer');
        });

        it('Test 40: should render block data attributes', () => {
            const state = makePopulatedState();
            const html = renderCanvas(state);

            expect(html).toContain('data-block-id="fb-1"');
            expect(html).toContain('data-block-id="fb-2"');
            expect(html).toContain('data-block-id="fb-3"');
        });

        it('Test 41: should render zoom percentage in canvas info', () => {
            const state = createCanvasState();
            state.zoom = 0.75;
            const html = renderCanvas(state);

            expect(html).toContain('Zoom: 75%');
        });

        it('Test 42: should render grid when showGrid is true', () => {
            const state = createCanvasState();
            const config = { ...DEFAULT_CANVAS_CONFIG, showGrid: true };
            const html = renderCanvas(state, config);

            expect(html).toContain('pattern id="grid"');
            expect(html).toContain('fill="url(#grid)"');
        });

        it('Test 43: should not render grid when showGrid is false', () => {
            const state = createCanvasState();
            const config = { ...DEFAULT_CANVAS_CONFIG, showGrid: false };
            const html = renderCanvas(state, config);

            expect(html).not.toContain('pattern id="grid"');
            expect(html).not.toContain('fill="url(#grid)"');
        });

        it('Test 44: should render minimap when showMinimap is true', () => {
            const state = makePopulatedState();
            const config = { ...DEFAULT_CANVAS_CONFIG, showMinimap: true };
            const html = renderCanvas(state, config);

            expect(html).toContain('canvas-minimap');
            expect(html).toContain('minimap-viewport');
        });

        it('Test 45: should not render minimap when showMinimap is false', () => {
            const state = makePopulatedState();
            const config = { ...DEFAULT_CANVAS_CONFIG, showMinimap: false };
            const html = renderCanvas(state, config);

            expect(html).not.toContain('canvas-minimap');
        });

        it('Test 46: should render block and connection counts in canvas info', () => {
            const state = makePopulatedState();
            const html = renderCanvas(state);

            expect(html).toContain('Blocks: 3');
            expect(html).toContain('Connections: 1');
        });

        it('Test 47: should render toolbar buttons', () => {
            const state = createCanvasState();
            const html = renderCanvas(state);

            expect(html).toContain('addNewBlock()');
            expect(html).toContain('autoLayoutBlocks()');
            expect(html).toContain('zoomIn()');
            expect(html).toContain('zoomOut()');
            expect(html).toContain('resetView()');
            expect(html).toContain('toggleGridSnap()');
        });

        it('Test 48: should render grid snap checkbox as checked when enabled', () => {
            const state = createCanvasState();
            state.gridSnap = true;
            const html = renderCanvas(state);

            expect(html).toContain('checked');
        });
    });

    // =========================================================================
    // Section 12: CSS and Script Helpers
    // =========================================================================

    describe('CSS and Script Helpers', () => {
        it('Test 49: should return canvas styles containing expected CSS classes', () => {
            const css = getCanvasStyles();

            expect(css).toContain('.canvas-container');
            expect(css).toContain('.canvas-toolbar');
            expect(css).toContain('.canvas-viewport');
            expect(css).toContain('.canvas-block');
            expect(css).toContain('.canvas-connection');
            expect(css).toContain('.canvas-minimap');
            expect(css).toContain('.connection-handle');
        });

        it('Test 50: should return canvas script with event handlers', () => {
            const script = getCanvasScript();

            expect(script).toContain('initCanvas');
            expect(script).toContain('setupCanvasEvents');
            expect(script).toContain('onSvgMouseDown');
            expect(script).toContain('onViewportMouseDown');
            expect(script).toContain('onWheel');
            expect(script).toContain('addNewBlock');
            expect(script).toContain('autoLayoutBlocks');
        });
    });

    // =========================================================================
    // Section 13: Constants and Configuration
    // =========================================================================

    describe('Constants and Configuration', () => {
        it('Test 51: should define default canvas config with expected values', () => {
            expect(DEFAULT_CANVAS_CONFIG.width).toBe(3000);
            expect(DEFAULT_CANVAS_CONFIG.height).toBe(2000);
            expect(DEFAULT_CANVAS_CONFIG.minZoom).toBe(0.25);
            expect(DEFAULT_CANVAS_CONFIG.maxZoom).toBe(2);
            expect(DEFAULT_CANVAS_CONFIG.gridSize).toBe(20);
            expect(DEFAULT_CANVAS_CONFIG.defaultBlockSize).toEqual({ width: 200, height: 100 });
            expect(DEFAULT_CANVAS_CONFIG.showGrid).toBe(true);
            expect(DEFAULT_CANVAS_CONFIG.showMinimap).toBe(true);
        });

        it('Test 52: should define priority colors for all levels', () => {
            expect(PRIORITY_COLORS.critical).toBeDefined();
            expect(PRIORITY_COLORS.high).toBeDefined();
            expect(PRIORITY_COLORS.medium).toBeDefined();
            expect(PRIORITY_COLORS.low).toBeDefined();
        });

        it('Test 53: should define connection colors for all dependency types', () => {
            const types: DependencyType[] = ['requires', 'blocks', 'suggests', 'triggers'];
            types.forEach(type => {
                expect(CONNECTION_COLORS[type]).toBeDefined();
                expect(typeof CONNECTION_COLORS[type]).toBe('string');
            });
        });
    });

    // =========================================================================
    // Section 14: Edge Cases
    // =========================================================================

    describe('Edge Cases', () => {
        it('Test 54: should handle removing a non-existent block gracefully', () => {
            const state = makePopulatedState();
            const originalLength = state.blocks.length;

            removeBlock(state, 'nonexistent-id');

            expect(state.blocks).toHaveLength(originalLength);
        });

        it('Test 55: should handle removing a non-existent connection gracefully', () => {
            const state = makePopulatedState();
            const originalLength = state.connections.length;

            removeConnection(state, 'nonexistent-id');

            expect(state.connections).toHaveLength(originalLength);
        });

        it('Test 56: should handle selecting a non-existent block gracefully', () => {
            const state = createCanvasState();

            expect(() => selectBlock(state, 'nonexistent-id')).not.toThrow();
            expect(state.selectedBlockIds).toEqual([]);
        });

        it('Test 57: should handle feature block with undefined description', () => {
            const feature = makeFeatureBlock();
            (feature as any).description = undefined;
            const canvas = featureToCanvasBlock(feature, 0);

            expect(canvas.description).toBeUndefined();
        });

        it('Test 58: should handle feature block with empty acceptance criteria', () => {
            const feature = makeFeatureBlock({ acceptanceCriteria: [] });
            const canvas = featureToCanvasBlock(feature, 0);

            expect(canvas.criteriaCount).toBe(0);
        });

        it('Test 59: should add multiple blocks with unique generated IDs', () => {
            const state = createCanvasState();
            const block1 = addBlock(state, 'Block A', { x: 0, y: 0 });
            const block2 = addBlock(state, 'Block B', { x: 100, y: 100 });
            const block3 = addBlock(state, 'Block C', { x: 200, y: 200 });

            const ids = [block1.id, block2.id, block3.id];
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(3);
        });

        it('Test 60: should render empty canvas without errors', () => {
            const state = createCanvasState();
            const html = renderCanvas(state);

            expect(html).toContain('canvasContainer');
            expect(html).toContain('Blocks: 0');
            expect(html).toContain('Connections: 0');
        });

        it('Test 61: should snap negative coordinates to grid', () => {
            const state = createCanvasState();
            const block = addBlock(state, 'Negative Pos', { x: -35, y: -47 });

            // -35 / 20 = -1.75, round = -2, * 20 = -40
            // -47 / 20 = -2.35, round = -2, * 20 = -40
            expect(block.position).toEqual({ x: -40, y: -40 });
        });

        it('Test 62: should handle autoLayout with a single block', () => {
            const features = [makeFeatureBlock({ id: 'only-one' })];
            const state = createCanvasState(features);

            autoLayout(state);

            // 1 block => ceil(sqrt(1)) = 1 column, index 0 => col 0, row 0
            expect(state.blocks[0].position).toEqual({ x: 50, y: 50 });
        });

        it('Test 63: should handle autoLayoutByDependency with no requires connections', () => {
            const features = [
                makeFeatureBlock({ id: 'fb-1' }),
                makeFeatureBlock({ id: 'fb-2' }),
            ];
            const links = [
                makeBlockLink({ id: 'link-1', sourceBlockId: 'fb-1', targetBlockId: 'fb-2', dependencyType: 'suggests' }),
            ];
            const state = createCanvasState(features, links);

            // "suggests" is not "requires", so all blocks have 0 in-degree
            autoLayoutByDependency(state);

            // Both blocks should be in level 0 (same y)
            const fb1 = state.blocks.find(b => b.id === 'fb-1')!;
            const fb2 = state.blocks.find(b => b.id === 'fb-2')!;
            expect(fb1.position.y).toBe(fb2.position.y);
        });

        it('Test 64: should render connection with missing source block as empty string', () => {
            const state = createCanvasState();
            // Manually add a connection with non-existent source
            state.connections.push({
                id: 'orphan-conn',
                sourceId: 'missing-source',
                targetId: 'missing-target',
                type: 'requires',
                selected: false,
            });

            // Should not throw
            const html = renderCanvas(state);
            expect(html).toContain('connectionsLayer');
        });

        it('Test 65: should render connection preview when in connection mode', () => {
            const state = makePopulatedState();
            startConnection(state, 'fb-1', 'requires');
            state.connectionMode!.currentPoint = { x: 500, y: 300 };

            const html = renderCanvas(state);

            expect(html).toContain('connection-preview');
        });
    });
});
