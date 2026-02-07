/**
 * Drag-Drop Event Handlers (MT-033.20)
 *
 * **Simple explanation**: Handles all mouse and touch events for the canvas -
 * dragging blocks, panning, zooming, and drawing connections. Makes the canvas
 * feel responsive and intuitive.
 *
 * @module ui/dragDropHandlers
 */

import { CanvasState, CanvasBlock, CanvasConnection } from './blockCanvas';

// ============================================================================
// Browser Types (for touch events used in webview)
// ============================================================================

/** Touch object from browser TouchEvent */
interface TouchItem {
    clientX: number;
    clientY: number;
}

/** Minimal TouchEvent interface for webview touch handling */
interface WebViewTouchEvent {
    touches: TouchItem[];
}

// ============================================================================
// Types
// ============================================================================

export interface DragState {
    /** Whether currently dragging */
    isDragging: boolean;
    /** What type of drag operation */
    dragType: 'block' | 'pan' | 'connection' | 'selection' | null;
    /** Start position of drag */
    startPosition: Point;
    /** Current position */
    currentPosition: Point;
    /** Offset from block origin */
    offset: Point;
    /** Target element ID */
    targetId: string | null;
    /** Additional drag data */
    data: DragData;
}

export interface Point {
    x: number;
    y: number;
}

export interface DragData {
    /** Original block positions for undo */
    originalPositions?: Map<string, Point>;
    /** Selection rectangle */
    selectionRect?: { x: number; y: number; width: number; height: number };
    /** Connection source ID */
    connectionSourceId?: string;
    /** Connection type */
    connectionType?: string;
}

export interface DragDropConfig {
    /** Minimum distance to start drag */
    dragThreshold: number;
    /** Enable multi-select with drag */
    enableMultiSelect: boolean;
    /** Enable snapping while dragging */
    snapWhileDragging: boolean;
    /** Show guides while dragging */
    showAlignmentGuides: boolean;
    /** Touch support */
    touchEnabled: boolean;
}

export interface AlignmentGuide {
    /** Guide type */
    type: 'horizontal' | 'vertical';
    /** Position (x for vertical, y for horizontal) */
    position: number;
    /** Which block edge this aligns to */
    edge: 'start' | 'center' | 'end';
    /** IDs of blocks that align */
    blockIds: string[];
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_DRAG_CONFIG: DragDropConfig = {
    dragThreshold: 5,
    enableMultiSelect: true,
    snapWhileDragging: true,
    showAlignmentGuides: true,
    touchEnabled: true,
};

const ALIGNMENT_THRESHOLD = 10; // Pixels

// ============================================================================
// Drag State Management
// ============================================================================

/**
 * Create initial drag state.
 */
export function createDragState(): DragState {
    return {
        isDragging: false,
        dragType: null,
        startPosition: { x: 0, y: 0 },
        currentPosition: { x: 0, y: 0 },
        offset: { x: 0, y: 0 },
        targetId: null,
        data: {},
    };
}

/**
 * Start a block drag operation.
 */
export function startBlockDrag(
    dragState: DragState,
    canvasState: CanvasState,
    blockId: string,
    mousePosition: Point,
    multiSelect: boolean = false
): void {
    const block = canvasState.blocks.find(b => b.id === blockId);
    if (!block) return;

    dragState.isDragging = true;
    dragState.dragType = 'block';
    dragState.startPosition = { ...mousePosition };
    dragState.currentPosition = { ...mousePosition };
    dragState.targetId = blockId;

    // Calculate offset from block corner to mouse position
    dragState.offset = {
        x: mousePosition.x - block.position.x,
        y: mousePosition.y - block.position.y,
    };

    // Store original positions for undo
    dragState.data.originalPositions = new Map();
    canvasState.blocks.forEach(b => {
        dragState.data.originalPositions!.set(b.id, { ...b.position });
    });

    // Select this block if not already selected
    if (!canvasState.selectedBlockIds.includes(blockId)) {
        if (!multiSelect) {
            canvasState.selectedBlockIds = [];
            canvasState.blocks.forEach(b => b.selected = false);
        }
        canvasState.selectedBlockIds.push(blockId);
        block.selected = true;
    }

    // Mark as dragging
    block.dragging = true;
    canvasState.blocks
        .filter(b => canvasState.selectedBlockIds.includes(b.id))
        .forEach(b => b.dragging = true);
}

/**
 * Update block drag position.
 */
export function updateBlockDrag(
    dragState: DragState,
    canvasState: CanvasState,
    mousePosition: Point,
    config: DragDropConfig = DEFAULT_DRAG_CONFIG
): AlignmentGuide[] {
    if (!dragState.isDragging || dragState.dragType !== 'block') return [];

    dragState.currentPosition = { ...mousePosition };

    // Calculate delta from start
    const delta = {
        x: mousePosition.x - dragState.startPosition.x,
        y: mousePosition.y - dragState.startPosition.y,
    };

    // Move all selected blocks
    const selectedBlocks = canvasState.blocks.filter(b => b.selected);
    const guides: AlignmentGuide[] = [];

    selectedBlocks.forEach(block => {
        const originalPos = dragState.data.originalPositions?.get(block.id);
        if (!originalPos) return;

        let newX = originalPos.x + delta.x;
        let newY = originalPos.y + delta.y;

        // Apply snapping if enabled
        if (config.snapWhileDragging && canvasState.gridSnap) {
            newX = snapToGrid(newX, canvasState.gridSize);
            newY = snapToGrid(newY, canvasState.gridSize);
        }

        // Calculate alignment guides if enabled
        if (config.showAlignmentGuides) {
            const blockGuides = calculateAlignmentGuides(
                block,
                { x: newX, y: newY },
                canvasState.blocks.filter(b => !b.selected)
            );
            guides.push(...blockGuides);

            // Snap to alignment guides
            for (const guide of blockGuides) {
                if (guide.type === 'vertical') {
                    if (guide.edge === 'start') newX = guide.position;
                    else if (guide.edge === 'center') newX = guide.position - block.size.width / 2;
                    else if (guide.edge === 'end') newX = guide.position - block.size.width;
                } else {
                    if (guide.edge === 'start') newY = guide.position;
                    else if (guide.edge === 'center') newY = guide.position - block.size.height / 2;
                    else if (guide.edge === 'end') newY = guide.position - block.size.height;
                }
            }
        }

        block.position = { x: newX, y: newY };
    });

    return guides;
}

/**
 * End block drag operation.
 */
export function endBlockDrag(
    dragState: DragState,
    canvasState: CanvasState
): { moved: boolean; blockIds: string[] } {
    const result = {
        moved: false,
        blockIds: [] as string[],
    };

    if (!dragState.isDragging || dragState.dragType !== 'block') {
        resetDragState(dragState);
        return result;
    }

    // Check if blocks actually moved
    const selectedBlockIds = canvasState.selectedBlockIds;
    for (const blockId of selectedBlockIds) {
        const block = canvasState.blocks.find(b => b.id === blockId);
        const originalPos = dragState.data.originalPositions?.get(blockId);
        if (block && originalPos) {
            if (block.position.x !== originalPos.x || block.position.y !== originalPos.y) {
                result.moved = true;
                result.blockIds.push(blockId);
            }
        }
    }

    // Clear dragging state on blocks
    canvasState.blocks.forEach(b => b.dragging = false);

    resetDragState(dragState);
    return result;
}

/**
 * Start a pan operation.
 */
export function startPan(
    dragState: DragState,
    mousePosition: Point
): void {
    dragState.isDragging = true;
    dragState.dragType = 'pan';
    dragState.startPosition = { ...mousePosition };
    dragState.currentPosition = { ...mousePosition };
}

/**
 * Update pan position.
 */
export function updatePan(
    dragState: DragState,
    canvasState: CanvasState,
    mousePosition: Point
): void {
    if (!dragState.isDragging || dragState.dragType !== 'pan') return;

    const delta = {
        x: mousePosition.x - dragState.currentPosition.x,
        y: mousePosition.y - dragState.currentPosition.y,
    };

    canvasState.pan.x += delta.x / canvasState.zoom;
    canvasState.pan.y += delta.y / canvasState.zoom;

    dragState.currentPosition = { ...mousePosition };
}

/**
 * End pan operation.
 */
export function endPan(dragState: DragState): void {
    if (dragState.dragType === 'pan') {
        resetDragState(dragState);
    }
}

/**
 * Start drawing a connection.
 */
export function startConnectionDrag(
    dragState: DragState,
    canvasState: CanvasState,
    sourceBlockId: string,
    connectionType: string,
    mousePosition: Point
): void {
    dragState.isDragging = true;
    dragState.dragType = 'connection';
    dragState.startPosition = { ...mousePosition };
    dragState.currentPosition = { ...mousePosition };
    dragState.data.connectionSourceId = sourceBlockId;
    dragState.data.connectionType = connectionType;

    // Update canvas connection mode
    canvasState.connectionMode = {
        sourceId: sourceBlockId,
        type: connectionType as 'requires' | 'blocks' | 'suggests' | 'triggers',
        currentPoint: { ...mousePosition },
    };
}

/**
 * Update connection drag position.
 */
export function updateConnectionDrag(
    dragState: DragState,
    canvasState: CanvasState,
    mousePosition: Point
): void {
    if (!dragState.isDragging || dragState.dragType !== 'connection') return;

    dragState.currentPosition = { ...mousePosition };

    if (canvasState.connectionMode) {
        canvasState.connectionMode.currentPoint = { ...mousePosition };
    }
}

/**
 * End connection drag and create connection if valid target.
 */
export function endConnectionDrag(
    dragState: DragState,
    canvasState: CanvasState,
    targetBlockId: string | null
): CanvasConnection | null {
    if (!dragState.isDragging || dragState.dragType !== 'connection') {
        resetDragState(dragState);
        return null;
    }

    const sourceId = dragState.data.connectionSourceId;
    const type = dragState.data.connectionType;

    canvasState.connectionMode = null;
    resetDragState(dragState);

    if (!sourceId || !type || !targetBlockId || sourceId === targetBlockId) {
        return null;
    }

    // Check for duplicate
    const exists = canvasState.connections.some(
        c => c.sourceId === sourceId && c.targetId === targetBlockId
    );
    if (exists) return null;

    // Create new connection
    const connection: CanvasConnection = {
        id: 'conn_' + Math.random().toString(36).substring(2, 11),
        sourceId,
        targetId: targetBlockId,
        type: type as 'requires' | 'blocks' | 'suggests' | 'triggers',
        selected: false,
    };

    canvasState.connections.push(connection);
    return connection;
}

/**
 * Start selection rectangle drag.
 */
export function startSelectionDrag(
    dragState: DragState,
    mousePosition: Point
): void {
    dragState.isDragging = true;
    dragState.dragType = 'selection';
    dragState.startPosition = { ...mousePosition };
    dragState.currentPosition = { ...mousePosition };
    dragState.data.selectionRect = {
        x: mousePosition.x,
        y: mousePosition.y,
        width: 0,
        height: 0,
    };
}

/**
 * Update selection rectangle.
 */
export function updateSelectionDrag(
    dragState: DragState,
    mousePosition: Point
): { x: number; y: number; width: number; height: number } | null {
    if (!dragState.isDragging || dragState.dragType !== 'selection') return null;

    dragState.currentPosition = { ...mousePosition };

    const rect = {
        x: Math.min(dragState.startPosition.x, mousePosition.x),
        y: Math.min(dragState.startPosition.y, mousePosition.y),
        width: Math.abs(mousePosition.x - dragState.startPosition.x),
        height: Math.abs(mousePosition.y - dragState.startPosition.y),
    };

    dragState.data.selectionRect = rect;
    return rect;
}

/**
 * End selection rectangle and select intersecting blocks.
 */
export function endSelectionDrag(
    dragState: DragState,
    canvasState: CanvasState
): string[] {
    if (!dragState.isDragging || dragState.dragType !== 'selection') {
        resetDragState(dragState);
        return [];
    }

    const rect = dragState.data.selectionRect;
    const selectedIds: string[] = [];

    if (rect && rect.width > 5 && rect.height > 5) {
        // Find blocks that intersect with selection rectangle
        canvasState.blocks.forEach(block => {
            if (blocksIntersect(
                { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                { x: block.position.x, y: block.position.y, width: block.size.width, height: block.size.height }
            )) {
                block.selected = true;
                selectedIds.push(block.id);
            }
        });

        canvasState.selectedBlockIds = selectedIds;
    }

    resetDragState(dragState);
    return selectedIds;
}

/**
 * Reset drag state to initial.
 */
function resetDragState(dragState: DragState): void {
    dragState.isDragging = false;
    dragState.dragType = null;
    dragState.startPosition = { x: 0, y: 0 };
    dragState.currentPosition = { x: 0, y: 0 };
    dragState.offset = { x: 0, y: 0 };
    dragState.targetId = null;
    dragState.data = {};
}

// ============================================================================
// Zoom Handling
// ============================================================================

/**
 * Handle mouse wheel zoom.
 */
export function handleZoom(
    canvasState: CanvasState,
    delta: number,
    mousePosition: Point,
    minZoom: number = 0.25,
    maxZoom: number = 2
): void {
    const oldZoom = canvasState.zoom;

    // Calculate new zoom level
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    let newZoom = oldZoom * zoomFactor;
    newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

    if (newZoom === oldZoom) return;

    // Adjust pan to keep mouse position fixed
    const zoomRatio = newZoom / oldZoom;
    canvasState.pan.x = mousePosition.x - (mousePosition.x - canvasState.pan.x) * zoomRatio;
    canvasState.pan.y = mousePosition.y - (mousePosition.y - canvasState.pan.y) * zoomRatio;

    canvasState.zoom = newZoom;
}

/**
 * Reset view to fit all blocks.
 */
export function fitToView(
    canvasState: CanvasState,
    viewportWidth: number,
    viewportHeight: number,
    padding: number = 50
): void {
    if (canvasState.blocks.length === 0) {
        canvasState.zoom = 1;
        canvasState.pan = { x: 0, y: 0 };
        return;
    }

    // Calculate bounding box of all blocks
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    canvasState.blocks.forEach(block => {
        minX = Math.min(minX, block.position.x);
        minY = Math.min(minY, block.position.y);
        maxX = Math.max(maxX, block.position.x + block.size.width);
        maxY = Math.max(maxY, block.position.y + block.size.height);
    });

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    // Calculate zoom to fit
    const zoomX = viewportWidth / contentWidth;
    const zoomY = viewportHeight / contentHeight;
    canvasState.zoom = Math.min(zoomX, zoomY, 1); // Don't zoom in past 100%

    // Center the content
    canvasState.pan = {
        x: -minX + padding + (viewportWidth / canvasState.zoom - contentWidth) / 2,
        y: -minY + padding + (viewportHeight / canvasState.zoom - contentHeight) / 2,
    };
}

// ============================================================================
// Alignment Helpers
// ============================================================================

/**
 * Calculate alignment guides for a block being dragged.
 */
function calculateAlignmentGuides(
    draggingBlock: CanvasBlock,
    newPosition: Point,
    otherBlocks: CanvasBlock[]
): AlignmentGuide[] {
    const guides: AlignmentGuide[] = [];
    const dragEdges = {
        left: newPosition.x,
        centerX: newPosition.x + draggingBlock.size.width / 2,
        right: newPosition.x + draggingBlock.size.width,
        top: newPosition.y,
        centerY: newPosition.y + draggingBlock.size.height / 2,
        bottom: newPosition.y + draggingBlock.size.height,
    };

    for (const block of otherBlocks) {
        const blockEdges = {
            left: block.position.x,
            centerX: block.position.x + block.size.width / 2,
            right: block.position.x + block.size.width,
            top: block.position.y,
            centerY: block.position.y + block.size.height / 2,
            bottom: block.position.y + block.size.height,
        };

        // Vertical alignment (left, center, right edges)
        if (Math.abs(dragEdges.left - blockEdges.left) < ALIGNMENT_THRESHOLD) {
            guides.push({
                type: 'vertical',
                position: blockEdges.left,
                edge: 'start',
                blockIds: [draggingBlock.id, block.id],
            });
        }
        if (Math.abs(dragEdges.centerX - blockEdges.centerX) < ALIGNMENT_THRESHOLD) {
            guides.push({
                type: 'vertical',
                position: blockEdges.centerX,
                edge: 'center',
                blockIds: [draggingBlock.id, block.id],
            });
        }
        if (Math.abs(dragEdges.right - blockEdges.right) < ALIGNMENT_THRESHOLD) {
            guides.push({
                type: 'vertical',
                position: blockEdges.right,
                edge: 'end',
                blockIds: [draggingBlock.id, block.id],
            });
        }

        // Horizontal alignment (top, center, bottom edges)
        if (Math.abs(dragEdges.top - blockEdges.top) < ALIGNMENT_THRESHOLD) {
            guides.push({
                type: 'horizontal',
                position: blockEdges.top,
                edge: 'start',
                blockIds: [draggingBlock.id, block.id],
            });
        }
        if (Math.abs(dragEdges.centerY - blockEdges.centerY) < ALIGNMENT_THRESHOLD) {
            guides.push({
                type: 'horizontal',
                position: blockEdges.centerY,
                edge: 'center',
                blockIds: [draggingBlock.id, block.id],
            });
        }
        if (Math.abs(dragEdges.bottom - blockEdges.bottom) < ALIGNMENT_THRESHOLD) {
            guides.push({
                type: 'horizontal',
                position: blockEdges.bottom,
                edge: 'end',
                blockIds: [draggingBlock.id, block.id],
            });
        }
    }

    return guides;
}

/**
 * Check if two rectangles intersect.
 */
function blocksIntersect(
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number }
): boolean {
    return !(
        rect1.x + rect1.width < rect2.x ||
        rect2.x + rect2.width < rect1.x ||
        rect1.y + rect1.height < rect2.y ||
        rect2.y + rect2.height < rect1.y
    );
}

/**
 * Snap value to grid.
 */
function snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
}

// ============================================================================
// Touch Event Support
// ============================================================================

/**
 * Convert touch event to mouse-like coordinates.
 */
export function touchToMouse(touchEvent: WebViewTouchEvent): Point | null {
    if (touchEvent.touches.length === 0) return null;
    const touch = touchEvent.touches[0];
    return { x: touch.clientX, y: touch.clientY };
}

/**
 * Handle pinch zoom gesture.
 */
export function handlePinchZoom(
    canvasState: CanvasState,
    touch1: Point,
    touch2: Point,
    previousDistance: number
): number {
    const currentDistance = Math.hypot(
        touch2.x - touch1.x,
        touch2.y - touch1.y
    );

    if (previousDistance > 0) {
        const scale = currentDistance / previousDistance;
        const midpoint = {
            x: (touch1.x + touch2.x) / 2,
            y: (touch1.y + touch2.y) / 2,
        };

        const newZoom = Math.max(0.25, Math.min(2, canvasState.zoom * scale));

        if (newZoom !== canvasState.zoom) {
            const zoomRatio = newZoom / canvasState.zoom;
            canvasState.pan.x = midpoint.x - (midpoint.x - canvasState.pan.x) * zoomRatio;
            canvasState.pan.y = midpoint.y - (midpoint.y - canvasState.pan.y) * zoomRatio;
            canvasState.zoom = newZoom;
        }
    }

    return currentDistance;
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Render alignment guides overlay.
 */
export function renderAlignmentGuides(guides: AlignmentGuide[], canvasHeight: number, canvasWidth: number): string {
    return guides.map(guide => {
        if (guide.type === 'vertical') {
            return `<line x1="${guide.position}" y1="0" x2="${guide.position}" y2="${canvasHeight}" 
                          stroke="#0d6efd" stroke-width="1" stroke-dasharray="5,5" class="alignment-guide" />`;
        } else {
            return `<line x1="0" y1="${guide.position}" x2="${canvasWidth}" y2="${guide.position}" 
                          stroke="#0d6efd" stroke-width="1" stroke-dasharray="5,5" class="alignment-guide" />`;
        }
    }).join('');
}

/**
 * Render selection rectangle.
 */
export function renderSelectionRect(rect: { x: number; y: number; width: number; height: number } | undefined): string {
    if (!rect) return '';
    return `
    <rect 
      x="${rect.x}" 
      y="${rect.y}" 
      width="${rect.width}" 
      height="${rect.height}"
      fill="rgba(13, 110, 253, 0.1)"
      stroke="#0d6efd"
      stroke-width="1"
      stroke-dasharray="5,5"
      class="selection-rect"
    />
  `;
}
