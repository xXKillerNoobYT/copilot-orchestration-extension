/**
 * Tests for Drag-Drop Event Handlers
 * 
 * Tests canvas interactions: dragging blocks, panning, zooming, drawing connections,
 * selection rectangles, alignment guides, and touch support.
 */

import {
    DragState,
    Point,
    DragDropConfig,
    AlignmentGuide,
    DEFAULT_DRAG_CONFIG,
    createDragState,
    startBlockDrag,
    updateBlockDrag,
    endBlockDrag,
    startPan,
    updatePan,
    endPan,
    startConnectionDrag,
    updateConnectionDrag,
    endConnectionDrag,
    startSelectionDrag,
    updateSelectionDrag,
    endSelectionDrag,
    handleZoom,
    fitToView,
    touchToMouse,
    handlePinchZoom,
    renderAlignmentGuides,
    renderSelectionRect,
} from '../../src/ui/dragDropHandlers';
import { CanvasState, CanvasBlock, CanvasConnection } from '../../src/ui/blockCanvas';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockCanvasState(overrides: Partial<CanvasState> = {}): CanvasState {
    return {
        blocks: [],
        connections: [],
        zoom: 1,
        pan: { x: 0, y: 0 },
        selectedBlockIds: [],
        selectedConnectionIds: [],
        gridSnap: true,
        gridSize: 20,
        connectionMode: null,
        ...overrides,
    };
}

function createMockBlock(overrides: Partial<CanvasBlock> = {}): CanvasBlock {
    return {
        id: 'block-1',
        name: 'Test Block',
        type: 'feature',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 150 },
        priority: 'medium',
        selected: false,
        dragging: false,
        criteriaCount: 0,
        ...overrides,
    };
}

describe('DragDropHandlers', () => {
    describe('DEFAULT_DRAG_CONFIG', () => {
        it('Test 1: should have correct default values', () => {
            expect(DEFAULT_DRAG_CONFIG).toEqual({
                dragThreshold: 5,
                enableMultiSelect: true,
                snapWhileDragging: true,
                showAlignmentGuides: true,
                touchEnabled: true,
            });
        });
    });

    describe('createDragState', () => {
        it('Test 2: should create initial drag state', () => {
            const state = createDragState();

            expect(state).toEqual({
                isDragging: false,
                dragType: null,
                startPosition: { x: 0, y: 0 },
                currentPosition: { x: 0, y: 0 },
                offset: { x: 0, y: 0 },
                targetId: null,
                data: {},
            });
        });

        it('Test 3: should return new object each time', () => {
            const state1 = createDragState();
            const state2 = createDragState();

            expect(state1).not.toBe(state2);
        });
    });

    describe('startBlockDrag', () => {
        it('Test 4: should initialize block drag state', () => {
            const dragState = createDragState();
            const block = createMockBlock({ id: 'test-block', position: { x: 100, y: 100 } });
            const canvasState = createMockCanvasState({ blocks: [block] });
            const mousePos = { x: 120, y: 130 };

            startBlockDrag(dragState, canvasState, 'test-block', mousePos);

            expect(dragState.isDragging).toBe(true);
            expect(dragState.dragType).toBe('block');
            expect(dragState.targetId).toBe('test-block');
        });

        it('Test 5: should calculate offset from mouse to block corner', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 } });
            const canvasState = createMockCanvasState({ blocks: [block] });
            const mousePos = { x: 120, y: 130 };

            startBlockDrag(dragState, canvasState, 'block-1', mousePos);

            expect(dragState.offset).toEqual({ x: 20, y: 30 });
        });

        it('Test 6: should store original positions for undo', () => {
            const dragState = createDragState();
            const block = createMockBlock({ id: 'b1', position: { x: 50, y: 60 } });
            const canvasState = createMockCanvasState({ blocks: [block] });

            startBlockDrag(dragState, canvasState, 'b1', { x: 50, y: 60 });

            expect(dragState.data.originalPositions?.get('b1')).toEqual({ x: 50, y: 60 });
        });

        it('Test 7: should select the dragged block', () => {
            const dragState = createDragState();
            const block = createMockBlock({ selected: false });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: [] });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });

            expect(block.selected).toBe(true);
            expect(canvasState.selectedBlockIds).toContain('block-1');
        });

        it('Test 8: should not duplicate selection if already selected', () => {
            const dragState = createDragState();
            const block = createMockBlock({ selected: true });
            const canvasState = createMockCanvasState({
                blocks: [block],
                selectedBlockIds: ['block-1']
            });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });

            expect(canvasState.selectedBlockIds).toHaveLength(1);
        });

        it('Test 9: should clear other selections without multiSelect', () => {
            const dragState = createDragState();
            const block1 = createMockBlock({ id: 'b1', selected: true });
            const block2 = createMockBlock({ id: 'b2', selected: false });
            const canvasState = createMockCanvasState({
                blocks: [block1, block2],
                selectedBlockIds: ['b1']
            });

            startBlockDrag(dragState, canvasState, 'b2', { x: 100, y: 100 }, false);

            expect(block1.selected).toBe(false);
            expect(block2.selected).toBe(true);
            expect(canvasState.selectedBlockIds).toContain('b2');
        });

        it('Test 10: should keep other selections with multiSelect', () => {
            const dragState = createDragState();
            const block1 = createMockBlock({ id: 'b1', selected: true });
            const block2 = createMockBlock({ id: 'b2', selected: false });
            const canvasState = createMockCanvasState({
                blocks: [block1, block2],
                selectedBlockIds: ['b1']
            });

            startBlockDrag(dragState, canvasState, 'b2', { x: 100, y: 100 }, true);

            expect(block1.selected).toBe(true);
            expect(block2.selected).toBe(true);
        });

        it('Test 11: should mark block as dragging', () => {
            const dragState = createDragState();
            const block = createMockBlock();
            const canvasState = createMockCanvasState({ blocks: [block] });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });

            expect(block.dragging).toBe(true);
        });

        it('Test 12: should handle non-existent block', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startBlockDrag(dragState, canvasState, 'non-existent', { x: 100, y: 100 });

            expect(dragState.isDragging).toBe(false);
        });
    });

    describe('updateBlockDrag', () => {
        it('Test 13: should move selected blocks', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 }, selected: true });
            const canvasState = createMockCanvasState({
                blocks: [block],
                selectedBlockIds: ['block-1'],
                gridSnap: false,
            });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            updateBlockDrag(dragState, canvasState, { x: 150, y: 120 }, { ...DEFAULT_DRAG_CONFIG, snapWhileDragging: false });

            expect(block.position.x).toBe(150);
            expect(block.position.y).toBe(120);
        });

        it('Test 14: should snap to grid when enabled', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 }, selected: true });
            const canvasState = createMockCanvasState({
                blocks: [block],
                selectedBlockIds: ['block-1'],
                gridSnap: true,
                gridSize: 20,
            });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            updateBlockDrag(dragState, canvasState, { x: 117, y: 108 }, { ...DEFAULT_DRAG_CONFIG, showAlignmentGuides: false });

            // 117 - 100 = 17 delta, should snap 117 to 120
            expect(block.position.x).toBe(120);
            expect(block.position.y).toBe(100);
        });

        it('Test 15: should return empty array if not dragging', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            const guides = updateBlockDrag(dragState, canvasState, { x: 100, y: 100 });

            expect(guides).toEqual([]);
        });

        it('Test 16: should return empty array for wrong drag type', () => {
            const dragState = createDragState();
            dragState.isDragging = true;
            dragState.dragType = 'pan';
            const canvasState = createMockCanvasState();

            const guides = updateBlockDrag(dragState, canvasState, { x: 100, y: 100 });

            expect(guides).toEqual([]);
        });

        it('Test 17: should update current position', () => {
            const dragState = createDragState();
            const block = createMockBlock({ selected: true });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: ['block-1'], gridSnap: false });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            updateBlockDrag(dragState, canvasState, { x: 200, y: 150 }, { ...DEFAULT_DRAG_CONFIG, snapWhileDragging: false, showAlignmentGuides: false });

            expect(dragState.currentPosition).toEqual({ x: 200, y: 150 });
        });

        it('Test 18: should calculate alignment guides', () => {
            const dragState = createDragState();
            const block1 = createMockBlock({ id: 'b1', position: { x: 100, y: 100 }, selected: true });
            const block2 = createMockBlock({ id: 'b2', position: { x: 100, y: 300 }, selected: false });
            const canvasState = createMockCanvasState({
                blocks: [block1, block2],
                selectedBlockIds: ['b1'],
                gridSnap: false,
            });

            startBlockDrag(dragState, canvasState, 'b1', { x: 100, y: 100 });
            const guides = updateBlockDrag(dragState, canvasState, { x: 102, y: 102 }, { ...DEFAULT_DRAG_CONFIG, snapWhileDragging: false });

            // Should find vertical alignment guide (left edges are close)
            expect(guides.some(g => g.type === 'vertical' && g.edge === 'start')).toBe(true);
        });
    });

    describe('endBlockDrag', () => {
        it('Test 19: should reset drag state', () => {
            const dragState = createDragState();
            const block = createMockBlock({ selected: true });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: ['block-1'] });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            endBlockDrag(dragState, canvasState);

            expect(dragState.isDragging).toBe(false);
            expect(dragState.dragType).toBeNull();
        });

        it('Test 20: should clear dragging flag on blocks', () => {
            const dragState = createDragState();
            const block = createMockBlock({ selected: true });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: ['block-1'] });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            expect(block.dragging).toBe(true);

            endBlockDrag(dragState, canvasState);
            expect(block.dragging).toBe(false);
        });

        it('Test 21: should return moved=true if block position changed', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 }, selected: true });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: ['block-1'], gridSnap: false });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            updateBlockDrag(dragState, canvasState, { x: 200, y: 200 }, { ...DEFAULT_DRAG_CONFIG, snapWhileDragging: false, showAlignmentGuides: false });
            const result = endBlockDrag(dragState, canvasState);

            expect(result.moved).toBe(true);
            expect(result.blockIds).toContain('block-1');
        });

        it('Test 22: should return moved=false if block did not move', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 }, selected: true });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: ['block-1'] });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 100, y: 100 });
            // No updateBlockDrag call, so block stays in place
            const result = endBlockDrag(dragState, canvasState);

            expect(result.moved).toBe(false);
            expect(result.blockIds).toHaveLength(0);
        });

        it('Test 23: should work when not dragging', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            const result = endBlockDrag(dragState, canvasState);

            expect(result.moved).toBe(false);
        });
    });

    describe('startPan', () => {
        it('Test 24: should initialize pan state', () => {
            const dragState = createDragState();

            startPan(dragState, { x: 100, y: 100 });

            expect(dragState.isDragging).toBe(true);
            expect(dragState.dragType).toBe('pan');
            expect(dragState.startPosition).toEqual({ x: 100, y: 100 });
            expect(dragState.currentPosition).toEqual({ x: 100, y: 100 });
        });
    });

    describe('updatePan', () => {
        it('Test 25: should update canvas pan position', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState({ pan: { x: 0, y: 0 }, zoom: 1 });

            startPan(dragState, { x: 100, y: 100 });
            updatePan(dragState, canvasState, { x: 150, y: 120 });

            expect(canvasState.pan.x).toBe(50);
            expect(canvasState.pan.y).toBe(20);
        });

        it('Test 26: should scale pan delta by zoom level', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState({ pan: { x: 0, y: 0 }, zoom: 2 });

            startPan(dragState, { x: 100, y: 100 });
            updatePan(dragState, canvasState, { x: 150, y: 120 });

            expect(canvasState.pan.x).toBe(25); // 50 / 2
            expect(canvasState.pan.y).toBe(10); // 20 / 2
        });

        it('Test 27: should not update if not panning', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState({ pan: { x: 0, y: 0 } });

            updatePan(dragState, canvasState, { x: 150, y: 120 });

            expect(canvasState.pan).toEqual({ x: 0, y: 0 });
        });

        it('Test 28: should not update for wrong drag type', () => {
            const dragState = createDragState();
            dragState.isDragging = true;
            dragState.dragType = 'block';
            const canvasState = createMockCanvasState({ pan: { x: 0, y: 0 } });

            updatePan(dragState, canvasState, { x: 150, y: 120 });

            expect(canvasState.pan).toEqual({ x: 0, y: 0 });
        });
    });

    describe('endPan', () => {
        it('Test 29: should reset drag state when panning', () => {
            const dragState = createDragState();
            startPan(dragState, { x: 100, y: 100 });

            endPan(dragState);

            expect(dragState.isDragging).toBe(false);
            expect(dragState.dragType).toBeNull();
        });

        it('Test 30: should not reset if not panning', () => {
            const dragState = createDragState();
            dragState.isDragging = true;
            dragState.dragType = 'block';

            endPan(dragState);

            expect(dragState.isDragging).toBe(true);
            expect(dragState.dragType).toBe('block');
        });
    });

    describe('startConnectionDrag', () => {
        it('Test 31: should initialize connection drag state', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });

            expect(dragState.isDragging).toBe(true);
            expect(dragState.dragType).toBe('connection');
            expect(dragState.data.connectionSourceId).toBe('source-1');
            expect(dragState.data.connectionType).toBe('requires');
        });

        it('Test 32: should set canvas connection mode', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'blocks', { x: 150, y: 200 });

            expect(canvasState.connectionMode).toEqual({
                sourceId: 'source-1',
                type: 'blocks',
                currentPoint: { x: 150, y: 200 },
            });
        });
    });

    describe('updateConnectionDrag', () => {
        it('Test 33: should update connection current point', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });
            updateConnectionDrag(dragState, canvasState, { x: 200, y: 250 });

            expect(canvasState.connectionMode?.currentPoint).toEqual({ x: 200, y: 250 });
            expect(dragState.currentPosition).toEqual({ x: 200, y: 250 });
        });

        it('Test 34: should not update if not dragging connection', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState({ connectionMode: { sourceId: 'x', type: 'requires', currentPoint: { x: 0, y: 0 } } });

            updateConnectionDrag(dragState, canvasState, { x: 200, y: 250 });

            expect(canvasState.connectionMode?.currentPoint).toEqual({ x: 0, y: 0 });
        });
    });

    describe('endConnectionDrag', () => {
        it('Test 35: should create connection when valid', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });
            const connection = endConnectionDrag(dragState, canvasState, 'target-1');

            expect(connection).not.toBeNull();
            expect(connection?.sourceId).toBe('source-1');
            expect(connection?.targetId).toBe('target-1');
            expect(connection?.type).toBe('requires');
        });

        it('Test 36: should add connection to canvas state', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });
            endConnectionDrag(dragState, canvasState, 'target-1');

            expect(canvasState.connections).toHaveLength(1);
        });

        it('Test 37: should return null for self-connection', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'block-1', 'requires', { x: 100, y: 100 });
            const connection = endConnectionDrag(dragState, canvasState, 'block-1');

            expect(connection).toBeNull();
        });

        it('Test 38: should return null for null target', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });
            const connection = endConnectionDrag(dragState, canvasState, null);

            expect(connection).toBeNull();
        });

        it('Test 39: should return null for duplicate connection', () => {
            const dragState = createDragState();
            const existingConnection: CanvasConnection = {
                id: 'existing',
                sourceId: 'source-1',
                targetId: 'target-1',
                type: 'requires',
                selected: false,
            };
            const canvasState = createMockCanvasState({ connections: [existingConnection] });

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });
            const connection = endConnectionDrag(dragState, canvasState, 'target-1');

            expect(connection).toBeNull();
        });

        it('Test 40: should clear connection mode', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            startConnectionDrag(dragState, canvasState, 'source-1', 'requires', { x: 100, y: 100 });
            endConnectionDrag(dragState, canvasState, 'target-1');

            expect(canvasState.connectionMode).toBeNull();
        });

        it('Test 41: should reset drag state when not dragging', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            const connection = endConnectionDrag(dragState, canvasState, 'target-1');

            expect(connection).toBeNull();
            expect(dragState.isDragging).toBe(false);
        });
    });

    describe('startSelectionDrag', () => {
        it('Test 42: should initialize selection drag state', () => {
            const dragState = createDragState();

            startSelectionDrag(dragState, { x: 50, y: 50 });

            expect(dragState.isDragging).toBe(true);
            expect(dragState.dragType).toBe('selection');
            expect(dragState.startPosition).toEqual({ x: 50, y: 50 });
        });

        it('Test 43: should initialize selection rectangle', () => {
            const dragState = createDragState();

            startSelectionDrag(dragState, { x: 50, y: 50 });

            expect(dragState.data.selectionRect).toEqual({
                x: 50,
                y: 50,
                width: 0,
                height: 0,
            });
        });
    });

    describe('updateSelectionDrag', () => {
        it('Test 44: should update selection rectangle', () => {
            const dragState = createDragState();

            startSelectionDrag(dragState, { x: 50, y: 50 });
            const rect = updateSelectionDrag(dragState, { x: 150, y: 100 });

            expect(rect).toEqual({
                x: 50,
                y: 50,
                width: 100,
                height: 50,
            });
        });

        it('Test 45: should handle negative direction drag', () => {
            const dragState = createDragState();

            startSelectionDrag(dragState, { x: 150, y: 100 });
            const rect = updateSelectionDrag(dragState, { x: 50, y: 50 });

            expect(rect).toEqual({
                x: 50,
                y: 50,
                width: 100,
                height: 50,
            });
        });

        it('Test 46: should return null if not dragging selection', () => {
            const dragState = createDragState();

            const rect = updateSelectionDrag(dragState, { x: 100, y: 100 });

            expect(rect).toBeNull();
        });
    });

    describe('endSelectionDrag', () => {
        it('Test 47: should select intersecting blocks', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 }, size: { width: 50, height: 50 } });
            const canvasState = createMockCanvasState({ blocks: [block] });

            startSelectionDrag(dragState, { x: 50, y: 50 });
            updateSelectionDrag(dragState, { x: 200, y: 200 });
            const selectedIds = endSelectionDrag(dragState, canvasState);

            expect(selectedIds).toContain('block-1');
            expect(block.selected).toBe(true);
        });

        it('Test 48: should not select non-intersecting blocks', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 500, y: 500 } });
            const canvasState = createMockCanvasState({ blocks: [block] });

            startSelectionDrag(dragState, { x: 50, y: 50 });
            updateSelectionDrag(dragState, { x: 200, y: 200 });
            const selectedIds = endSelectionDrag(dragState, canvasState);

            expect(selectedIds).not.toContain('block-1');
            expect(block.selected).toBe(false);
        });

        it('Test 49: should ignore small selection rectangles', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 100, y: 100 } });
            const canvasState = createMockCanvasState({ blocks: [block] });

            startSelectionDrag(dragState, { x: 100, y: 100 });
            updateSelectionDrag(dragState, { x: 102, y: 102 }); // Too small
            const selectedIds = endSelectionDrag(dragState, canvasState);

            expect(selectedIds).toHaveLength(0);
        });

        it('Test 50: should return empty array when not dragging selection', () => {
            const dragState = createDragState();
            const canvasState = createMockCanvasState();

            const result = endSelectionDrag(dragState, canvasState);

            expect(result).toEqual([]);
        });
    });

    describe('handleZoom', () => {
        it('Test 51: should zoom in on negative delta', () => {
            const canvasState = createMockCanvasState({ zoom: 1 });

            handleZoom(canvasState, -100, { x: 400, y: 300 });

            expect(canvasState.zoom).toBeGreaterThan(1);
        });

        it('Test 52: should zoom out on positive delta', () => {
            const canvasState = createMockCanvasState({ zoom: 1 });

            handleZoom(canvasState, 100, { x: 400, y: 300 });

            expect(canvasState.zoom).toBeLessThan(1);
        });

        it('Test 53: should respect minimum zoom', () => {
            const canvasState = createMockCanvasState({ zoom: 0.3 });

            handleZoom(canvasState, 1000, { x: 0, y: 0 }, 0.25, 2);

            expect(canvasState.zoom).toBeGreaterThanOrEqual(0.25);
        });

        it('Test 54: should respect maximum zoom', () => {
            const canvasState = createMockCanvasState({ zoom: 1.9 });

            handleZoom(canvasState, -1000, { x: 0, y: 0 }, 0.25, 2);

            expect(canvasState.zoom).toBeLessThanOrEqual(2);
        });

        it('Test 55: should adjust pan to keep mouse position fixed', () => {
            const canvasState = createMockCanvasState({ zoom: 1, pan: { x: 100, y: 100 } });
            const mousePos = { x: 400, y: 300 };

            handleZoom(canvasState, -10, mousePos);

            // Pan should be adjusted to maintain relationship with mouse position
            expect(canvasState.pan.x).not.toBe(100);
        });
    });

    describe('fitToView', () => {
        it('Test 56: should reset view when no blocks', () => {
            const canvasState = createMockCanvasState({ zoom: 0.5, pan: { x: 200, y: 200 } });

            fitToView(canvasState, 800, 600);

            expect(canvasState.zoom).toBe(1);
            expect(canvasState.pan).toEqual({ x: 0, y: 0 });
        });

        it('Test 57: should fit all blocks in view', () => {
            const block1 = createMockBlock({ position: { x: 0, y: 0 }, size: { width: 100, height: 100 } });
            const block2 = createMockBlock({ id: 'b2', position: { x: 500, y: 400 }, size: { width: 100, height: 100 } });
            const canvasState = createMockCanvasState({ blocks: [block1, block2] });

            fitToView(canvasState, 800, 600);

            // Zoom should be calculated to fit content
            expect(canvasState.zoom).toBeLessThanOrEqual(1);
            expect(canvasState.zoom).toBeGreaterThan(0);
        });

        it('Test 58: should not zoom in past 100%', () => {
            const block = createMockBlock({ position: { x: 0, y: 0 }, size: { width: 50, height: 50 } });
            const canvasState = createMockCanvasState({ blocks: [block] });

            fitToView(canvasState, 2000, 2000); // Large viewport, small content

            expect(canvasState.zoom).toBe(1);
        });

        it('Test 59: should respect padding', () => {
            const block = createMockBlock({ position: { x: 0, y: 0 }, size: { width: 700, height: 500 } });
            const canvasState = createMockCanvasState({ blocks: [block] });

            fitToView(canvasState, 800, 600, 100); // 100px padding

            // With padding, content needs more space, so zoom should be lower
            expect(canvasState.zoom).toBeLessThan(1);
        });
    });

    describe('touchToMouse', () => {
        it('Test 60: should convert single touch to point', () => {
            const touchEvent = {
                touches: [{ clientX: 100, clientY: 200 }],
            };

            const point = touchToMouse(touchEvent);

            expect(point).toEqual({ x: 100, y: 200 });
        });

        it('Test 61: should return null for no touches', () => {
            const touchEvent = { touches: [] };

            const point = touchToMouse(touchEvent);

            expect(point).toBeNull();
        });

        it('Test 62: should use first touch when multiple', () => {
            const touchEvent = {
                touches: [
                    { clientX: 100, clientY: 200 },
                    { clientX: 300, clientY: 400 },
                ],
            };

            const point = touchToMouse(touchEvent);

            expect(point).toEqual({ x: 100, y: 200 });
        });
    });

    describe('handlePinchZoom', () => {
        it('Test 63: should zoom based on pinch distance change', () => {
            const canvasState = createMockCanvasState({ zoom: 1 });
            const touch1 = { x: 100, y: 100 };
            const touch2 = { x: 200, y: 100 };
            const previousDistance = 50; // Was closer together

            handlePinchZoom(canvasState, touch1, touch2, previousDistance);

            expect(canvasState.zoom).toBeGreaterThan(1); // Zoomed in
        });

        it('Test 64: should zoom out when pinching in', () => {
            const canvasState = createMockCanvasState({ zoom: 1 });
            const touch1 = { x: 100, y: 100 };
            const touch2 = { x: 150, y: 100 };
            const previousDistance = 100; // Was farther apart

            handlePinchZoom(canvasState, touch1, touch2, previousDistance);

            expect(canvasState.zoom).toBeLessThan(1); // Zoomed out
        });

        it('Test 65: should return current distance', () => {
            const canvasState = createMockCanvasState();
            const touch1 = { x: 0, y: 0 };
            const touch2 = { x: 100, y: 0 };

            const distance = handlePinchZoom(canvasState, touch1, touch2, 50);

            expect(distance).toBe(100);
        });

        it('Test 66: should skip zoom calculation when previousDistance is 0', () => {
            const canvasState = createMockCanvasState({ zoom: 1 });

            handlePinchZoom(canvasState, { x: 0, y: 0 }, { x: 100, y: 0 }, 0);

            expect(canvasState.zoom).toBe(1); // Unchanged
        });

        it('Test 67: should respect min/max zoom bounds', () => {
            const canvasState = createMockCanvasState({ zoom: 1.9 });

            // Try to zoom in a lot
            handlePinchZoom(canvasState, { x: 0, y: 0 }, { x: 1000, y: 0 }, 10);

            expect(canvasState.zoom).toBeLessThanOrEqual(2);
        });
    });

    describe('renderAlignmentGuides', () => {
        it('Test 68: should render vertical guide as line', () => {
            const guides: AlignmentGuide[] = [{
                type: 'vertical',
                position: 100,
                edge: 'start',
                blockIds: ['a', 'b'],
            }];

            const html = renderAlignmentGuides(guides, 600, 800);

            expect(html).toContain('x1="100"');
            expect(html).toContain('x2="100"');
            expect(html).toContain('y1="0"');
            expect(html).toContain('y2="600"');
        });

        it('Test 69: should render horizontal guide as line', () => {
            const guides: AlignmentGuide[] = [{
                type: 'horizontal',
                position: 200,
                edge: 'center',
                blockIds: ['a', 'b'],
            }];

            const html = renderAlignmentGuides(guides, 600, 800);

            expect(html).toContain('y1="200"');
            expect(html).toContain('y2="200"');
            expect(html).toContain('x1="0"');
            expect(html).toContain('x2="800"');
        });

        it('Test 70: should return empty string for no guides', () => {
            const html = renderAlignmentGuides([], 600, 800);

            expect(html).toBe('');
        });

        it('Test 71: should include alignment-guide class', () => {
            const guides: AlignmentGuide[] = [{
                type: 'vertical',
                position: 50,
                edge: 'end',
                blockIds: [],
            }];

            const html = renderAlignmentGuides(guides, 600, 800);

            expect(html).toContain('class="alignment-guide"');
        });

        it('Test 72: should use dashed stroke style', () => {
            const guides: AlignmentGuide[] = [{
                type: 'vertical',
                position: 50,
                edge: 'start',
                blockIds: [],
            }];

            const html = renderAlignmentGuides(guides, 600, 800);

            expect(html).toContain('stroke-dasharray="5,5"');
        });
    });

    describe('renderSelectionRect', () => {
        it('Test 73: should render selection rectangle', () => {
            const rect = { x: 50, y: 50, width: 100, height: 80 };

            const html = renderSelectionRect(rect);

            expect(html).toContain('x="50"');
            expect(html).toContain('y="50"');
            expect(html).toContain('width="100"');
            expect(html).toContain('height="80"');
        });

        it('Test 74: should return empty string for undefined rect', () => {
            const html = renderSelectionRect(undefined);

            expect(html).toBe('');
        });

        it('Test 75: should include selection-rect class', () => {
            const rect = { x: 0, y: 0, width: 10, height: 10 };

            const html = renderSelectionRect(rect);

            expect(html).toContain('class="selection-rect"');
        });

        it('Test 76: should use semi-transparent fill', () => {
            const rect = { x: 0, y: 0, width: 10, height: 10 };

            const html = renderSelectionRect(rect);

            expect(html).toContain('rgba(');
            expect(html).toContain('0.1)');
        });

        it('Test 77: should use dashed stroke', () => {
            const rect = { x: 0, y: 0, width: 10, height: 10 };

            const html = renderSelectionRect(rect);

            expect(html).toContain('stroke-dasharray="5,5"');
        });
    });

    describe('edge cases', () => {
        it('Test 78: should handle block with zero size for alignment', () => {
            const dragState = createDragState();
            const block1 = createMockBlock({ id: 'b1', position: { x: 100, y: 100 }, size: { width: 0, height: 0 }, selected: true });
            const block2 = createMockBlock({ id: 'b2', position: { x: 100, y: 200 }, size: { width: 100, height: 100 } });
            const canvasState = createMockCanvasState({ blocks: [block1, block2], selectedBlockIds: ['b1'], gridSnap: false });

            startBlockDrag(dragState, canvasState, 'b1', { x: 100, y: 100 });
            const guides = updateBlockDrag(dragState, canvasState, { x: 102, y: 102 }, DEFAULT_DRAG_CONFIG);

            // Should not crash
            expect(Array.isArray(guides)).toBe(true);
        });

        it('Test 79: should handle extreme zoom values', () => {
            const canvasState = createMockCanvasState({ zoom: 0.001 });

            handleZoom(canvasState, -1, { x: 0, y: 0 }, 0.25, 2);

            expect(canvasState.zoom).toBeGreaterThanOrEqual(0.25);
        });

        it('Test 80: should handle large coordinate values', () => {
            const dragState = createDragState();
            const block = createMockBlock({ position: { x: 10000, y: 10000 }, selected: true });
            const canvasState = createMockCanvasState({ blocks: [block], selectedBlockIds: ['block-1'], gridSnap: false });

            startBlockDrag(dragState, canvasState, 'block-1', { x: 10000, y: 10000 });
            updateBlockDrag(dragState, canvasState, { x: 20000, y: 20000 }, { ...DEFAULT_DRAG_CONFIG, snapWhileDragging: false, showAlignmentGuides: false });

            expect(block.position.x).toBe(20000);
            expect(block.position.y).toBe(20000);
        });
    });
});
