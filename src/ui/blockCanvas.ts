/**
 * Block Canvas Component (MT-033.19)
 *
 * **Simple explanation**: A visual drag-and-drop canvas where you can
 * create, position, and connect feature blocks. Like a flowchart editor
 * for planning your project.
 *
 * @module ui/blockCanvas
 */

import { FeatureBlock, BlockLink, DependencyType } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface CanvasBlock {
    /** Unique block ID */
    id: string;
    /** Block name */
    name: string;
    /** Block type (feature, milestone, note) */
    type: 'feature' | 'milestone' | 'note';
    /** Position on canvas */
    position: { x: number; y: number };
    /** Size of the block */
    size: { width: number; height: number };
    /** Priority level */
    priority: 'critical' | 'high' | 'medium' | 'low';
    /** Block color (optional override) */
    color?: string;
    /** Whether block is selected */
    selected: boolean;
    /** Whether block is being dragged */
    dragging: boolean;
    /** Block description snippet */
    description?: string;
    /** Acceptance criteria count */
    criteriaCount: number;
}

export interface CanvasConnection {
    /** Connection ID */
    id: string;
    /** Source block ID */
    sourceId: string;
    /** Target block ID */
    targetId: string;
    /** Connection type */
    type: DependencyType;
    /** Path points for curved lines */
    path?: { x: number; y: number }[];
    /** Whether connection is selected */
    selected: boolean;
}

export interface CanvasState {
    /** All blocks on canvas */
    blocks: CanvasBlock[];
    /** All connections between blocks */
    connections: CanvasConnection[];
    /** Current zoom level (0.5-2.0) */
    zoom: number;
    /** Pan offset */
    pan: { x: number; y: number };
    /** Currently selected block IDs */
    selectedBlockIds: string[];
    /** Currently selected connection IDs */
    selectedConnectionIds: string[];
    /** Grid snap enabled */
    gridSnap: boolean;
    /** Grid size in pixels */
    gridSize: number;
    /** Connection mode (for drawing new connections) */
    connectionMode: ConnectionMode | null;
}

export interface ConnectionMode {
    /** Source block ID */
    sourceId: string;
    /** Connection type being drawn */
    type: DependencyType;
    /** Current mouse position */
    currentPoint: { x: number; y: number };
}

export interface CanvasConfig {
    /** Canvas width */
    width: number;
    /** Canvas height */
    height: number;
    /** Minimum zoom */
    minZoom: number;
    /** Maximum zoom */
    maxZoom: number;
    /** Grid size */
    gridSize: number;
    /** Default block size */
    defaultBlockSize: { width: number; height: number };
    /** Show grid */
    showGrid: boolean;
    /** Show minimap */
    showMinimap: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
    width: 3000,
    height: 2000,
    minZoom: 0.25,
    maxZoom: 2,
    gridSize: 20,
    defaultBlockSize: { width: 200, height: 100 },
    showGrid: true,
    showMinimap: true,
};

export const PRIORITY_COLORS: Record<string, string> = {
    critical: '#dc3545',
    high: '#fd7e14',
    medium: '#0d6efd',
    low: '#6c757d',
};

export const CONNECTION_COLORS: Record<DependencyType, string> = {
    requires: '#0d6efd',
    blocks: '#dc3545',
    suggests: '#6c757d',
    triggers: '#28a745',
};

// ============================================================================
// Canvas State Management
// ============================================================================

/**
 * Create initial canvas state.
 */
export function createCanvasState(
    blocks: FeatureBlock[] = [],
    links: BlockLink[] = []
): CanvasState {
    // Convert feature blocks to canvas blocks with auto-layout
    const canvasBlocks = blocks.map((block, index) => featureToCanvasBlock(block, index));

    // Convert links to connections
    const connections = links.map(link => linkToConnection(link));

    return {
        blocks: canvasBlocks,
        connections,
        zoom: 1,
        pan: { x: 0, y: 0 },
        selectedBlockIds: [],
        selectedConnectionIds: [],
        gridSnap: true,
        gridSize: DEFAULT_CANVAS_CONFIG.gridSize,
        connectionMode: null,
    };
}

/**
 * Convert a FeatureBlock to a CanvasBlock.
 */
export function featureToCanvasBlock(feature: FeatureBlock, index: number): CanvasBlock {
    // Auto-layout: arrange in a grid pattern
    const col = index % 4;
    const row = Math.floor(index / 4);
    const spacing = { x: 250, y: 150 };
    const offset = { x: 50, y: 50 };

    return {
        id: feature.id,
        name: feature.name,
        type: 'feature',
        position: {
            x: offset.x + col * spacing.x,
            y: offset.y + row * spacing.y,
        },
        size: { ...DEFAULT_CANVAS_CONFIG.defaultBlockSize },
        priority: feature.priority,
        selected: false,
        dragging: false,
        description: feature.description?.slice(0, 100),
        criteriaCount: feature.acceptanceCriteria.length,
    };
}

/**
 * Convert a BlockLink to a CanvasConnection.
 */
export function linkToConnection(link: BlockLink): CanvasConnection {
    return {
        id: link.id,
        sourceId: link.sourceBlockId,
        targetId: link.targetBlockId,
        type: link.dependencyType,
        selected: false,
    };
}

/**
 * Convert canvas state back to feature blocks and links.
 */
export function canvasToFeatures(state: CanvasState): { blocks: Partial<FeatureBlock>[]; links: BlockLink[] } {
    const blocks = state.blocks
        .filter(b => b.type === 'feature')
        .map((block, index) => ({
            id: block.id,
            name: block.name,
            priority: block.priority,
            order: index + 1,
            description: block.description || '',
            acceptanceCriteria: [], // Will need to be filled from original data
        }));

    const links = state.connections.map(conn => ({
        id: conn.id,
        sourceBlockId: conn.sourceId,
        targetBlockId: conn.targetId,
        dependencyType: conn.type,
    }));

    return { blocks, links };
}

// ============================================================================
// Canvas Operations
// ============================================================================

/**
 * Add a new block to the canvas.
 */
export function addBlock(
    state: CanvasState,
    name: string,
    position: { x: number; y: number },
    type: CanvasBlock['type'] = 'feature'
): CanvasBlock {
    const newBlock: CanvasBlock = {
        id: generateId(),
        name,
        type,
        position: snapToGrid(position, state.gridSnap ? state.gridSize : 1),
        size: { ...DEFAULT_CANVAS_CONFIG.defaultBlockSize },
        priority: 'medium',
        selected: false,
        dragging: false,
        criteriaCount: 0,
    };

    state.blocks.push(newBlock);
    return newBlock;
}

/**
 * Remove a block and its connections.
 */
export function removeBlock(state: CanvasState, blockId: string): void {
    state.blocks = state.blocks.filter(b => b.id !== blockId);
    state.connections = state.connections.filter(
        c => c.sourceId !== blockId && c.targetId !== blockId
    );
    state.selectedBlockIds = state.selectedBlockIds.filter(id => id !== blockId);
}

/**
 * Move a block to a new position.
 */
export function moveBlock(
    state: CanvasState,
    blockId: string,
    newPosition: { x: number; y: number }
): void {
    const block = state.blocks.find(b => b.id === blockId);
    if (block) {
        block.position = snapToGrid(newPosition, state.gridSnap ? state.gridSize : 1);
    }
}

/**
 * Add a connection between blocks.
 */
export function addConnection(
    state: CanvasState,
    sourceId: string,
    targetId: string,
    type: DependencyType
): CanvasConnection | null {
    // Prevent self-connections
    if (sourceId === targetId) return null;

    // Prevent duplicates
    const exists = state.connections.some(
        c => c.sourceId === sourceId && c.targetId === targetId
    );
    if (exists) return null;

    const connection: CanvasConnection = {
        id: generateId(),
        sourceId,
        targetId,
        type,
        selected: false,
    };

    state.connections.push(connection);
    return connection;
}

/**
 * Remove a connection.
 */
export function removeConnection(state: CanvasState, connectionId: string): void {
    state.connections = state.connections.filter(c => c.id !== connectionId);
    state.selectedConnectionIds = state.selectedConnectionIds.filter(id => id !== connectionId);
}

/**
 * Select a block.
 */
export function selectBlock(state: CanvasState, blockId: string, multi: boolean = false): void {
    if (!multi) {
        state.selectedBlockIds = [];
        state.selectedConnectionIds = [];
        state.blocks.forEach(b => b.selected = false);
        state.connections.forEach(c => c.selected = false);
    }

    const block = state.blocks.find(b => b.id === blockId);
    if (block) {
        block.selected = true;
        if (!state.selectedBlockIds.includes(blockId)) {
            state.selectedBlockIds.push(blockId);
        }
    }
}

/**
 * Clear all selections.
 */
export function clearSelection(state: CanvasState): void {
    state.selectedBlockIds = [];
    state.selectedConnectionIds = [];
    state.blocks.forEach(b => b.selected = false);
    state.connections.forEach(c => c.selected = false);
}

/**
 * Zoom the canvas.
 */
export function setZoom(state: CanvasState, zoom: number, config: CanvasConfig = DEFAULT_CANVAS_CONFIG): void {
    state.zoom = Math.max(config.minZoom, Math.min(config.maxZoom, zoom));
}

/**
 * Pan the canvas.
 */
export function setPan(state: CanvasState, pan: { x: number; y: number }): void {
    state.pan = pan;
}

/**
 * Start connection mode.
 */
export function startConnection(state: CanvasState, sourceId: string, type: DependencyType): void {
    state.connectionMode = {
        sourceId,
        type,
        currentPoint: { x: 0, y: 0 },
    };
}

/**
 * End connection mode.
 */
export function endConnection(state: CanvasState, targetId?: string): CanvasConnection | null {
    if (!state.connectionMode) return null;

    let connection: CanvasConnection | null = null;
    if (targetId && targetId !== state.connectionMode.sourceId) {
        connection = addConnection(state, state.connectionMode.sourceId, targetId, state.connectionMode.type);
    }

    state.connectionMode = null;
    return connection;
}

// ============================================================================
// Auto-Layout Algorithms
// ============================================================================

/**
 * Auto-arrange blocks in a force-directed layout.
 */
export function autoLayout(state: CanvasState): void {
    if (state.blocks.length === 0) return;

    // Simple grid layout for now
    const spacing = { x: 250, y: 150 };
    const cols = Math.ceil(Math.sqrt(state.blocks.length));

    state.blocks.forEach((block, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        block.position = {
            x: 50 + col * spacing.x,
            y: 50 + row * spacing.y,
        };
    });
}

/**
 * Auto-arrange blocks based on dependencies (topological sort).
 */
export function autoLayoutByDependency(state: CanvasState): void {
    if (state.blocks.length === 0) return;

    // Build dependency graph
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();

    state.blocks.forEach(b => {
        inDegree.set(b.id, 0);
        outEdges.set(b.id, []);
    });

    state.connections.forEach(c => {
        if (c.type === 'requires') {
            inDegree.set(c.targetId, (inDegree.get(c.targetId) || 0) + 1);
            const edges = outEdges.get(c.sourceId) || [];
            edges.push(c.targetId);
            outEdges.set(c.sourceId, edges);
        }
    });

    // Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    const levels: string[][] = [];

    state.blocks.forEach(b => {
        if ((inDegree.get(b.id) || 0) === 0) {
            queue.push(b.id);
        }
    });

    while (queue.length > 0) {
        const currentLevel = [...queue];
        levels.push(currentLevel);
        queue.length = 0;

        for (const nodeId of currentLevel) {
            const edges = outEdges.get(nodeId) || [];
            for (const targetId of edges) {
                const newDegree = (inDegree.get(targetId) || 1) - 1;
                inDegree.set(targetId, newDegree);
                if (newDegree === 0) {
                    queue.push(targetId);
                }
            }
        }
    }

    // Position blocks by level
    const spacing = { x: 300, y: 150 };

    levels.forEach((level, levelIndex) => {
        level.forEach((blockId, blockIndex) => {
            const block = state.blocks.find(b => b.id === blockId);
            if (block) {
                const levelWidth = level.length * spacing.x;
                const startX = (DEFAULT_CANVAS_CONFIG.width - levelWidth) / 2;
                block.position = {
                    x: startX + blockIndex * spacing.x,
                    y: 100 + levelIndex * spacing.y,
                };
            }
        });
    });
}

// ============================================================================
// UI Rendering
// ============================================================================

/**
 * Renders the canvas HTML.
 */
export function renderCanvas(state: CanvasState, config: CanvasConfig = DEFAULT_CANVAS_CONFIG): string {
    const gridPattern = config.showGrid ? renderGridPattern(config.gridSize) : '';

    return `
    <div class="canvas-container" id="canvasContainer">
      <div class="canvas-toolbar">
        <button type="button" class="btn-icon" onclick="addNewBlock()" title="Add Block">➕</button>
        <button type="button" class="btn-icon" onclick="autoLayoutBlocks()" title="Auto Layout">📐</button>
        <span class="separator"></span>
        <button type="button" class="btn-icon" onclick="zoomIn()" title="Zoom In">🔍+</button>
        <button type="button" class="btn-icon" onclick="zoomOut()" title="Zoom Out">🔍-</button>
        <button type="button" class="btn-icon" onclick="resetView()" title="Reset View">🔄</button>
        <span class="separator"></span>
        <label class="toggle-label">
          <input type="checkbox" id="gridSnapToggle" ${state.gridSnap ? 'checked' : ''} onchange="toggleGridSnap()">
          Grid Snap
        </label>
      </div>

      <div class="canvas-viewport" id="canvasViewport">
        <svg 
          class="canvas-svg" 
          id="canvasSvg"
          width="${config.width}" 
          height="${config.height}"
          style="transform: scale(${state.zoom}) translate(${state.pan.x}px, ${state.pan.y}px)"
        >
          <defs>
            ${gridPattern}
            ${renderArrowMarkers()}
          </defs>

          ${config.showGrid ? `<rect width="100%" height="100%" fill="url(#grid)" />` : ''}

          <g id="connectionsLayer">
            ${state.connections.map(conn => renderConnection(conn, state.blocks)).join('')}
            ${state.connectionMode ? renderConnectionPreview(state.connectionMode, state.blocks) : ''}
          </g>

          <g id="blocksLayer">
            ${state.blocks.map(block => renderBlock(block)).join('')}
          </g>
        </svg>
      </div>

      ${config.showMinimap ? renderMinimap(state, config) : ''}

      <div class="canvas-info">
        <span>Zoom: ${Math.round(state.zoom * 100)}%</span>
        <span>Blocks: ${state.blocks.length}</span>
        <span>Connections: ${state.connections.length}</span>
      </div>
    </div>
  `;
}

function renderGridPattern(gridSize: number): string {
    return `
    <pattern id="grid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
      <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" 
            fill="none" 
            stroke="var(--vscode-editorLineNumber-foreground)" 
            stroke-width="0.5" 
            stroke-opacity="0.3"/>
    </pattern>
  `;
}

function renderArrowMarkers(): string {
    return Object.entries(CONNECTION_COLORS).map(([type, color]) => `
    <marker 
      id="arrow-${type}" 
      markerWidth="10" 
      markerHeight="10" 
      refX="9" 
      refY="3" 
      orient="auto" 
      markerUnits="strokeWidth"
    >
      <path d="M0,0 L0,6 L9,3 z" fill="${color}" />
    </marker>
  `).join('');
}

function renderBlock(block: CanvasBlock): string {
    const color = block.color || PRIORITY_COLORS[block.priority];
    const typeIcon = block.type === 'feature' ? '📦' : block.type === 'milestone' ? '🚩' : '📝';

    return `
    <g class="canvas-block ${block.selected ? 'selected' : ''} ${block.dragging ? 'dragging' : ''}"
       data-block-id="${block.id}"
       transform="translate(${block.position.x}, ${block.position.y})">
      
      <rect 
        class="block-bg"
        width="${block.size.width}" 
        height="${block.size.height}" 
        rx="8" 
        fill="var(--vscode-editor-background)"
        stroke="${color}"
        stroke-width="${block.selected ? 3 : 2}"
      />
      
      <rect 
        class="block-header"
        width="${block.size.width}" 
        height="30" 
        rx="8" 
        fill="${color}"
      />
      <rect 
        width="${block.size.width}" 
        height="8" 
        y="22"
        fill="${color}"
      />
      
      <text class="block-icon" x="10" y="22" font-size="14">${typeIcon}</text>
      <text class="block-name" x="30" y="20" font-size="12" fill="white" font-weight="600">
        ${truncate(block.name, 20)}
      </text>
      
      <text class="block-priority" x="${block.size.width - 10}" y="20" text-anchor="end" font-size="10" fill="white">
        ${block.priority}
      </text>

      ${block.description ? `
        <text class="block-description" x="10" y="50" font-size="10" fill="var(--vscode-editor-foreground)">
          ${truncate(block.description, 30)}
        </text>
      ` : ''}

      ${block.criteriaCount > 0 ? `
        <text class="block-criteria" x="10" y="${block.size.height - 10}" font-size="10" fill="var(--vscode-descriptionForeground)">
          ✓ ${block.criteriaCount} criteria
        </text>
      ` : ''}

      <!-- Connection handles -->
      <circle class="connection-handle output" cx="${block.size.width}" cy="${block.size.height / 2}" r="8" 
              fill="${color}" stroke="white" stroke-width="2"
              data-handle="output" />
      <circle class="connection-handle input" cx="0" cy="${block.size.height / 2}" r="8" 
              fill="white" stroke="${color}" stroke-width="2"
              data-handle="input" />
    </g>
  `;
}

function renderConnection(conn: CanvasConnection, blocks: CanvasBlock[]): string {
    const source = blocks.find(b => b.id === conn.sourceId);
    const target = blocks.find(b => b.id === conn.targetId);
    if (!source || !target) return '';

    const startX = source.position.x + source.size.width;
    const startY = source.position.y + source.size.height / 2;
    const endX = target.position.x;
    const endY = target.position.y + target.size.height / 2;

    // Calculate control points for bezier curve
    const dx = endX - startX;
    const cp1x = startX + dx * 0.4;
    const cp2x = startX + dx * 0.6;

    const color = CONNECTION_COLORS[conn.type];
    const dashArray = conn.type === 'suggests' ? '5,5' : 'none';

    return `
    <g class="canvas-connection ${conn.selected ? 'selected' : ''}" data-connection-id="${conn.id}">
      <path 
        d="M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}"
        fill="none"
        stroke="${color}"
        stroke-width="${conn.selected ? 3 : 2}"
        stroke-dasharray="${dashArray}"
        marker-end="url(#arrow-${conn.type})"
        class="connection-path"
      />
      <text 
        x="${(startX + endX) / 2}" 
        y="${(startY + endY) / 2 - 10}"
        font-size="10"
        fill="var(--vscode-descriptionForeground)"
        text-anchor="middle"
      >
        ${conn.type}
      </text>
    </g>
  `;
}

function renderConnectionPreview(mode: ConnectionMode, blocks: CanvasBlock[]): string {
    const source = blocks.find(b => b.id === mode.sourceId);
    if (!source) return '';

    const startX = source.position.x + source.size.width;
    const startY = source.position.y + source.size.height / 2;
    const color = CONNECTION_COLORS[mode.type];

    return `
    <line 
      x1="${startX}" 
      y1="${startY}" 
      x2="${mode.currentPoint.x}" 
      y2="${mode.currentPoint.y}"
      stroke="${color}"
      stroke-width="2"
      stroke-dasharray="5,5"
      class="connection-preview"
    />
  `;
}

function renderMinimap(state: CanvasState, config: CanvasConfig): string {
    const scale = 0.1;
    const width = config.width * scale;
    const height = config.height * scale;

    return `
    <div class="canvas-minimap" style="width: ${width}px; height: ${height}px;">
      <svg width="${width}" height="${height}">
        ${state.blocks.map(block => `
          <rect 
            x="${block.position.x * scale}" 
            y="${block.position.y * scale}"
            width="${block.size.width * scale}"
            height="${block.size.height * scale}"
            fill="${PRIORITY_COLORS[block.priority]}"
            opacity="0.7"
          />
        `).join('')}
        <rect 
          class="minimap-viewport"
          x="${-state.pan.x * scale}"
          y="${-state.pan.y * scale}"
          width="${config.width * scale / state.zoom}"
          height="${config.height * scale / state.zoom}"
          fill="none"
          stroke="white"
          stroke-width="2"
        />
      </svg>
    </div>
  `;
}

/**
 * Get CSS styles for the canvas.
 */
export function getCanvasStyles(): string {
    return `
    .canvas-container {
      position: relative;
      width: 100%;
      height: 500px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .canvas-toolbar {
      position: absolute;
      top: 10px;
      left: 10px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px;
      background: var(--vscode-input-background);
      border-radius: 6px;
      z-index: 10;
    }

    .canvas-toolbar .separator {
      width: 1px;
      height: 20px;
      background: var(--vscode-input-border);
      margin: 0 4px;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .canvas-viewport {
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: grab;
    }

    .canvas-viewport:active {
      cursor: grabbing;
    }

    .canvas-svg {
      transform-origin: 0 0;
    }

    .canvas-block {
      cursor: move;
    }

    .canvas-block:hover .block-bg {
      filter: brightness(1.1);
    }

    .canvas-block.selected .block-bg {
      filter: drop-shadow(0 0 8px var(--vscode-focusBorder));
    }

    .canvas-block.dragging {
      opacity: 0.8;
    }

    .block-name {
      font-family: var(--vscode-font-family);
    }

    .connection-handle {
      cursor: crosshair;
      opacity: 0.5;
      transition: opacity 0.2s;
    }

    .canvas-block:hover .connection-handle {
      opacity: 1;
    }

    .canvas-connection {
      cursor: pointer;
    }

    .canvas-connection:hover .connection-path {
      stroke-width: 4;
    }

    .canvas-connection.selected .connection-path {
      stroke-width: 4;
      filter: drop-shadow(0 0 4px currentColor);
    }

    .connection-preview {
      pointer-events: none;
    }

    .canvas-minimap {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      opacity: 0.8;
    }

    .canvas-info {
      position: absolute;
      bottom: 10px;
      left: 10px;
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-input-background);
      padding: 4px 8px;
      border-radius: 4px;
    }
  `;
}

/**
 * Get JavaScript for canvas interactivity.
 */
export function getCanvasScript(): string {
    return `
    let canvasState = null;
    let isDragging = false;
    let dragTarget = null;
    let dragOffset = { x: 0, y: 0 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    function initCanvas(state) {
      canvasState = state;
      setupCanvasEvents();
    }

    function setupCanvasEvents() {
      const viewport = document.getElementById('canvasViewport');
      const svg = document.getElementById('canvasSvg');

      // Block events
      svg.addEventListener('mousedown', onSvgMouseDown);
      svg.addEventListener('mousemove', onSvgMouseMove);
      svg.addEventListener('mouseup', onSvgMouseUp);

      // Pan events
      viewport.addEventListener('mousedown', onViewportMouseDown);
      viewport.addEventListener('mousemove', onViewportMouseMove);
      viewport.addEventListener('mouseup', onViewportMouseUp);

      // Zoom events
      viewport.addEventListener('wheel', onWheel);
    }

    function onSvgMouseDown(e) {
      const block = e.target.closest('.canvas-block');
      if (block) {
        const blockId = block.dataset.blockId;
        const isMultiSelect = e.ctrlKey || e.metaKey;
        
        // Check if clicking connection handle
        const handle = e.target.closest('.connection-handle');
        if (handle && handle.dataset.handle === 'output') {
          startConnectionDraw(blockId);
          return;
        }

        selectBlock(blockId, isMultiSelect);
        startDrag(block, e);
        e.stopPropagation();
      }
    }

    function onSvgMouseMove(e) {
      if (canvasState.connectionMode) {
        updateConnectionPreview(e);
      }
    }

    function onSvgMouseUp(e) {
      if (canvasState.connectionMode) {
        const block = e.target.closest('.canvas-block');
        const targetId = block ? block.dataset.blockId : null;
        endConnectionDraw(targetId);
      }
    }

    function onViewportMouseDown(e) {
      if (e.target === e.currentTarget || e.target.tagName === 'svg') {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
      }
    }

    function onViewportMouseMove(e) {
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        panStart = { x: e.clientX, y: e.clientY };
        vscode.postMessage({ command: 'pan', dx, dy });
      }
      
      if (isDragging && dragTarget) {
        const dx = e.clientX - dragOffset.x;
        const dy = e.clientY - dragOffset.y;
        dragOffset = { x: e.clientX, y: e.clientY };
        vscode.postMessage({ command: 'moveBlock', blockId: dragTarget, dx, dy });
      }
    }

    function onViewportMouseUp(e) {
      isPanning = false;
      if (isDragging) {
        isDragging = false;
        dragTarget = null;
      }
    }

    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      vscode.postMessage({ command: 'zoom', delta });
    }

    function selectBlock(blockId, multi) {
      vscode.postMessage({ command: 'selectBlock', blockId, multi });
    }

    function startDrag(block, e) {
      isDragging = true;
      dragTarget = block.dataset.blockId;
      dragOffset = { x: e.clientX, y: e.clientY };
    }

    function addNewBlock() {
      const name = prompt('Enter block name:');
      if (name) {
        vscode.postMessage({ command: 'addBlock', name });
      }
    }

    function autoLayoutBlocks() {
      vscode.postMessage({ command: 'autoLayout' });
    }

    function zoomIn() {
      vscode.postMessage({ command: 'zoom', delta: 0.1 });
    }

    function zoomOut() {
      vscode.postMessage({ command: 'zoom', delta: -0.1 });
    }

    function resetView() {
      vscode.postMessage({ command: 'resetView' });
    }

    function toggleGridSnap() {
      vscode.postMessage({ command: 'toggleGridSnap' });
    }

    function startConnectionDraw(sourceId) {
      vscode.postMessage({ command: 'startConnection', sourceId, type: 'requires' });
    }

    function updateConnectionPreview(e) {
      const svg = document.getElementById('canvasSvg');
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvasState.zoom;
      const y = (e.clientY - rect.top) / canvasState.zoom;
      vscode.postMessage({ command: 'updateConnectionPreview', x, y });
    }

    function endConnectionDraw(targetId) {
      vscode.postMessage({ command: 'endConnection', targetId });
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
    return 'block_' + Math.random().toString(36).substring(2, 11);
}

function snapToGrid(position: { x: number; y: number }, gridSize: number): { x: number; y: number } {
    return {
        x: Math.round(position.x / gridSize) * gridSize,
        y: Math.round(position.y / gridSize) * gridSize,
    };
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}
