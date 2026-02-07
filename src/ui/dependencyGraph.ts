/**
 * Dependency Graph Visualization (MT-033.12)
 *
 * **Simple explanation**: Creates interactive visual graphs showing how features
 * depend on each other. Uses Mermaid diagrams that can be exported as images.
 * Like a family tree but for your project features.
 *
 * @module ui/dependencyGraph
 */

import { CompletePlan, FeatureBlock, BlockLink, DependencyType } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface GraphNode {
    id: string;
    name: string;
    priority: string;
    order: number;
    dependsOn: string[];
    blockedBy: string[];
    isCriticalPath: boolean;
}

export interface GraphOptions {
    /** Show priority colors */
    showPriority?: boolean;
    /** Highlight critical path */
    highlightCriticalPath?: boolean;
    /** Direction: TB (top-bottom), LR (left-right) */
    direction?: 'TB' | 'LR';
    /** Theme: light, dark, or auto */
    theme?: 'light' | 'dark' | 'auto';
}

export interface CriticalPathResult {
    /** Nodes in the critical path */
    path: string[];
    /** Total nodes in graph */
    totalNodes: number;
    /** Longest dependency chain length */
    chainLength: number;
}

// ============================================================================
// Graph Analysis
// ============================================================================

/**
 * Build graph nodes from plan data.
 *
 * **Simple explanation**: Converts your feature blocks and links into
 * a format that's easy to visualize and analyze.
 */
export function buildGraphNodes(plan: CompletePlan): Map<string, GraphNode> {
    const nodes = new Map<string, GraphNode>();

    // Create nodes from feature blocks
    for (const feature of plan.featureBlocks) {
        nodes.set(feature.id, {
            id: feature.id,
            name: feature.name,
            priority: feature.priority,
            order: feature.order,
            dependsOn: [],
            blockedBy: [],
            isCriticalPath: false,
        });
    }

    // Add dependency relationships
    for (const link of plan.blockLinks) {
        const targetNode = nodes.get(link.targetBlockId);
        const sourceNode = nodes.get(link.sourceBlockId);

        if (targetNode && sourceNode) {
            if (link.dependencyType === 'requires') {
                targetNode.dependsOn.push(link.sourceBlockId);
            } else if (link.dependencyType === 'blocks') {
                sourceNode.blockedBy.push(link.targetBlockId);
            }
        }
    }

    // Calculate critical path
    const criticalPath = calculateCriticalPath(nodes);
    for (const nodeId of criticalPath.path) {
        const node = nodes.get(nodeId);
        if (node) {
            node.isCriticalPath = true;
        }
    }

    return nodes;
}

/**
 * Calculate the critical path through the dependency graph.
 *
 * **Simple explanation**: Finds the longest chain of dependencies.
 * This is the sequence that will take the most time and can't be parallelized.
 */
export function calculateCriticalPath(nodes: Map<string, GraphNode>): CriticalPathResult {
    // Find nodes with no dependencies (entry points)
    const entryPoints = Array.from(nodes.values()).filter(n => n.dependsOn.length === 0);

    if (entryPoints.length === 0) {
        return { path: [], totalNodes: nodes.size, chainLength: 0 };
    }

    // DFS to find longest path
    let longestPath: string[] = [];

    function dfs(nodeId: string, currentPath: string[], visited: Set<string>): void {
        if (visited.has(nodeId)) return; // Cycle detection

        visited.add(nodeId);
        currentPath.push(nodeId);

        if (currentPath.length > longestPath.length) {
            longestPath = [...currentPath];
        }

        // Find nodes that depend on this node
        for (const [id, node] of nodes) {
            if (node.dependsOn.includes(nodeId)) {
                dfs(id, currentPath, visited);
            }
        }

        currentPath.pop();
        visited.delete(nodeId);
    }

    for (const entry of entryPoints) {
        dfs(entry.id, [], new Set());
    }

    return {
        path: longestPath,
        totalNodes: nodes.size,
        chainLength: longestPath.length,
    };
}

/**
 * Detect cycles in the dependency graph.
 *
 * **Simple explanation**: Checks if your dependencies form a loop
 * (A depends on B, B depends on C, C depends on A). This is bad and
 * needs to be fixed.
 */
export function detectCycles(plan: CompletePlan): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const nodeIds = plan.featureBlocks.map(f => f.id);

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const feature of plan.featureBlocks) {
        adjacency.set(feature.id, []);
    }
    for (const link of plan.blockLinks) {
        if (link.dependencyType === 'requires') {
            const deps = adjacency.get(link.targetBlockId) || [];
            deps.push(link.sourceBlockId);
            adjacency.set(link.targetBlockId, deps);
        }
    }

    function dfs(nodeId: string, path: string[]): boolean {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);

        const neighbors = adjacency.get(nodeId) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                if (dfs(neighbor, path)) {
                    return true;
                }
            } else if (recursionStack.has(neighbor)) {
                // Found cycle - extract it
                const cycleStart = path.indexOf(neighbor);
                if (cycleStart !== -1) {
                    cycles.push(path.slice(cycleStart));
                }
                return true;
            }
        }

        path.pop();
        recursionStack.delete(nodeId);
        return false;
    }

    for (const nodeId of nodeIds) {
        if (!visited.has(nodeId)) {
            dfs(nodeId, []);
        }
    }

    return cycles;
}

// ============================================================================
// Mermaid Diagram Generation
// ============================================================================

/**
 * Generate a Mermaid diagram from plan dependencies.
 *
 * **Simple explanation**: Creates a text-based diagram that Mermaid can
 * render as a visual flowchart. You can paste this into GitHub, Notion,
 * or any Mermaid-compatible tool.
 */
export function generateMermaidDiagram(plan: CompletePlan, options: GraphOptions = {}): string {
    const { direction = 'TB', showPriority = true, highlightCriticalPath = true } = options;
    const lines: string[] = [];
    const nodes = buildGraphNodes(plan);

    // Diagram header
    lines.push(`graph ${direction}`);

    // Node definitions with styling
    for (const feature of plan.featureBlocks) {
        const node = nodes.get(feature.id);
        const nodeId = sanitizeId(feature.id);
        const label = escapeLabel(truncate(feature.name, 30));

        // Node shape based on characteristics
        let nodeShape = `${nodeId}[${label}]`;
        if (feature.priority === 'critical') {
            nodeShape = `${nodeId}((${label}))`; // Circle for critical
        } else if (node?.dependsOn.length === 0) {
            nodeShape = `${nodeId}([${label}])`; // Stadium for entry points
        }

        lines.push(`    ${nodeShape}`);
    }

    lines.push('');

    // Edge definitions
    for (const link of plan.blockLinks) {
        const sourceId = sanitizeId(link.sourceBlockId);
        const targetId = sanitizeId(link.targetBlockId);
        const sourceNode = nodes.get(link.sourceBlockId);
        const targetNode = nodes.get(link.targetBlockId);

        let arrow = '-->';
        let label = '';

        switch (link.dependencyType) {
            case 'requires':
                arrow = highlightCriticalPath && sourceNode?.isCriticalPath && targetNode?.isCriticalPath ? '==>' : '-->';
                label = '';
                break;
            case 'blocks':
                arrow = '-.->';
                label = '|blocks|';
                break;
            case 'suggests':
                arrow = '-..->';
                label = '|suggests|';
                break;
            case 'triggers':
                arrow = '--o';
                label = '|triggers|';
                break;
        }

        lines.push(`    ${sourceId} ${arrow}${label} ${targetId}`);
    }

    lines.push('');

    // Style definitions
    if (showPriority) {
        lines.push('    %% Priority Styles');

        const critical = plan.featureBlocks.filter(f => f.priority === 'critical').map(f => sanitizeId(f.id));
        const high = plan.featureBlocks.filter(f => f.priority === 'high').map(f => sanitizeId(f.id));
        const medium = plan.featureBlocks.filter(f => f.priority === 'medium').map(f => sanitizeId(f.id));
        const low = plan.featureBlocks.filter(f => f.priority === 'low').map(f => sanitizeId(f.id));

        if (critical.length > 0) {
            lines.push(`    classDef critical fill:#dc3545,stroke:#a71d2a,color:#fff`);
            lines.push(`    class ${critical.join(',')} critical`);
        }
        if (high.length > 0) {
            lines.push(`    classDef high fill:#fd7e14,stroke:#c25e00,color:#fff`);
            lines.push(`    class ${high.join(',')} high`);
        }
        if (medium.length > 0) {
            lines.push(`    classDef medium fill:#0d6efd,stroke:#0b5ed7,color:#fff`);
            lines.push(`    class ${medium.join(',')} medium`);
        }
        if (low.length > 0) {
            lines.push(`    classDef low fill:#6c757d,stroke:#545b62,color:#fff`);
            lines.push(`    class ${low.join(',')} low`);
        }
    }

    // Highlight critical path
    if (highlightCriticalPath) {
        const criticalNodes = Array.from(nodes.values())
            .filter(n => n.isCriticalPath)
            .map(n => sanitizeId(n.id));

        if (criticalNodes.length > 0) {
            lines.push('    %% Critical Path');
            lines.push(`    linkStyle default stroke:#6c757d`);
        }
    }

    return lines.join('\n');
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders the dependency graph panel HTML.
 */
export function renderDependencyGraphPanel(plan: CompletePlan, options: GraphOptions = {}): string {
    const mermaidCode = generateMermaidDiagram(plan, options);
    const criticalPath = calculateCriticalPath(buildGraphNodes(plan));
    const cycles = detectCycles(plan);

    return `
    <div class="dependency-graph-panel">
      <div class="graph-header">
        <h3>🔗 Dependency Graph</h3>
        <div class="graph-controls">
          <button type="button" class="btn-icon" onclick="toggleGraphDirection()" title="Toggle Direction">
            ↔️
          </button>
          <button type="button" class="btn-icon" onclick="exportGraphAsSvg()" title="Export as SVG">
            💾
          </button>
          <button type="button" class="btn-icon" onclick="copyMermaidCode()" title="Copy Mermaid Code">
            📋
          </button>
        </div>
      </div>

      <div class="graph-stats">
        <span class="stat">
          <span class="stat-value">${plan.featureBlocks.length}</span>
          <span class="stat-label">Features</span>
        </span>
        <span class="stat">
          <span class="stat-value">${plan.blockLinks.length}</span>
          <span class="stat-label">Links</span>
        </span>
        <span class="stat">
          <span class="stat-value">${criticalPath.chainLength}</span>
          <span class="stat-label">Chain Depth</span>
        </span>
        ${cycles.length > 0 ? `
          <span class="stat stat-error">
            <span class="stat-value">⚠️ ${cycles.length}</span>
            <span class="stat-label">Cycles Found</span>
          </span>
        ` : ''}
      </div>

      ${cycles.length > 0 ? `
        <div class="graph-warning">
          <strong>⚠️ Circular dependencies detected!</strong>
          <p>Fix these before proceeding:</p>
          <ul>
            ${cycles.map(cycle => {
        const names = cycle.map(id => {
            const f = plan.featureBlocks.find(f => f.id === id);
            return f ? f.name : id;
        });
        return `<li>${names.join(' → ')} → ${names[0]}</li>`;
    }).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="graph-container" id="graphContainer">
        <div class="mermaid" id="mermaidGraph">
          ${mermaidCode}
        </div>
      </div>

      <div class="graph-legend">
        <div class="legend-item">
          <span class="legend-color" style="background: #dc3545"></span>
          <span>Critical</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #fd7e14"></span>
          <span>High</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #0d6efd"></span>
          <span>Medium</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #6c757d"></span>
          <span>Low</span>
        </div>
        <div class="legend-item">
          <span class="legend-line solid"></span>
          <span>Requires</span>
        </div>
        <div class="legend-item">
          <span class="legend-line dashed"></span>
          <span>Blocks</span>
        </div>
      </div>

      <textarea id="mermaidCodeArea" class="hidden">${escapeHtml(mermaidCode)}</textarea>
    </div>
  `;
}

/**
 * Get CSS styles for dependency graph.
 */
export function getDependencyGraphStyles(): string {
    return `
    .dependency-graph-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .graph-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .graph-header h3 {
      margin: 0;
      font-size: 14px;
    }

    .graph-controls {
      display: flex;
      gap: 4px;
    }

    .graph-stats {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      border-radius: 4px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
    }

    .stat-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .stat-error .stat-value {
      color: var(--vscode-errorForeground);
    }

    .graph-warning {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: 13px;
    }

    .graph-warning ul {
      margin: 8px 0 0 20px;
      padding: 0;
    }

    .graph-container {
      background: var(--vscode-input-background);
      border-radius: 4px;
      padding: 16px;
      min-height: 200px;
      overflow: auto;
    }

    .mermaid {
      text-align: center;
    }

    .graph-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-input-border);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    .legend-line {
      width: 20px;
      height: 2px;
      background: var(--vscode-editor-foreground);
    }

    .legend-line.dashed {
      background: repeating-linear-gradient(
        90deg,
        var(--vscode-editor-foreground) 0,
        var(--vscode-editor-foreground) 4px,
        transparent 4px,
        transparent 8px
      );
    }
  `;
}

/**
 * Get JavaScript for dependency graph interactivity.
 */
export function getDependencyGraphScript(): string {
    return `
    let graphDirection = 'TB';

    function toggleGraphDirection() {
      graphDirection = graphDirection === 'TB' ? 'LR' : 'TB';
      vscode.postMessage({ command: 'updateGraphDirection', direction: graphDirection });
    }

    function exportGraphAsSvg() {
      const svg = document.querySelector('#mermaidGraph svg');
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        vscode.postMessage({ command: 'exportGraph', format: 'svg', data: svgData });
      } else {
        vscode.postMessage({ command: 'showError', message: 'Graph not rendered yet' });
      }
    }

    function copyMermaidCode() {
      const code = document.getElementById('mermaidCodeArea').value;
      navigator.clipboard.writeText(code).then(() => {
        vscode.postMessage({ command: 'showInfo', message: 'Mermaid code copied to clipboard' });
      });
    }

    // Initialize Mermaid when loaded
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis'
        }
      });
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function sanitizeId(id: string): string {
    // Mermaid requires IDs without special characters
    return 'N' + id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
}

function escapeLabel(text: string): string {
    return text.replace(/"/g, "'").replace(/\[/g, '(').replace(/\]/g, ')');
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
