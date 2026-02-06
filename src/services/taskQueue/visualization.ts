/**
 * @file taskQueue/visualization.ts
 * @module TaskVisualization
 * @description Dependency graph visualization and export (MT-016.9, MT-016.10)
 * 
 * Exports dependency graphs as Mermaid diagrams, markdown documentation,
 * and other visualization formats.
 * 
 * **Simple explanation**: Creates pretty pictures and documents showing
 * how tasks connect to each other. Like drawing a map of your to-do list.
 */

import { DependencyGraph } from './dependencyGraph';
import { getCriticalPath, getParallelLevels } from './topologicalSort';
import { Task, TaskStatus } from './index';
import { logInfo } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for visualization generation
 */
export interface VisualizationOptions {
    /** Show task priorities with colors */
    showPriority?: boolean;
    /** Show task status with colors */
    showStatus?: boolean;
    /** Highlight critical path */
    highlightCriticalPath?: boolean;
    /** Show estimated times */
    showEstimates?: boolean;
    /** Maximum width for diagram */
    maxWidth?: number;
    /** Theme: light or dark */
    theme?: 'light' | 'dark';
}

/**
 * Task metadata for visualization
 */
export interface TaskMetadata {
    id: string;
    title?: string;
    priority?: number;
    status?: TaskStatus;
    estimatedMinutes?: number;
    assignee?: string;
}

// ============================================================================
// Mermaid Diagram Generation
// ============================================================================

/**
 * Generate a Mermaid diagram from a dependency graph.
 * 
 * **Simple explanation**: Creates a text diagram you can paste into
 * GitHub, Notion, or any tool that supports Mermaid to see your tasks visually.
 * 
 * @param graph - The dependency graph
 * @param taskMetadata - Optional metadata for tasks
 * @param options - Visualization options
 * @returns Mermaid diagram string
 */
export function generateMermaidDiagram(
    graph: DependencyGraph,
    taskMetadata?: Map<string, TaskMetadata>,
    options: VisualizationOptions = {}
): string {
    const lines: string[] = [];
    const nodes = graph.getNodes();

    // Start diagram
    lines.push('graph TD');

    // Get critical path for highlighting
    const criticalPath = options.highlightCriticalPath
        ? new Set(getCriticalPath(graph))
        : new Set<string>();

    // Add node definitions with styling
    for (const nodeId of nodes) {
        const meta = taskMetadata?.get(nodeId);
        const nodeLabel = formatNodeLabel(nodeId, meta, options);
        const nodeStyle = getNodeStyle(nodeId, meta, criticalPath, options);

        lines.push(`    ${sanitizeId(nodeId)}[${nodeLabel}]${nodeStyle}`);
    }

    // Add edges
    for (const nodeId of nodes) {
        const deps = graph.getDependencies(nodeId);
        for (const depId of deps) {
            const edgeStyle = criticalPath.has(nodeId) && criticalPath.has(depId)
                ? '==>'
                : '-->';
            lines.push(`    ${sanitizeId(depId)} ${edgeStyle} ${sanitizeId(nodeId)}`);
        }
    }

    // Add color definitions for priorities/statuses
    if (options.showPriority || options.showStatus) {
        lines.push('');
        lines.push(...getStyleDefinitions(options));
    }

    logInfo(`[Visualization] Generated Mermaid diagram with ${nodes.length} nodes`);

    return lines.join('\n');
}

/**
 * Format a node label for Mermaid.
 */
function formatNodeLabel(
    nodeId: string,
    meta?: TaskMetadata,
    options?: VisualizationOptions
): string {
    const parts: string[] = [];

    // Title or ID
    parts.push(meta?.title ?? nodeId);

    // Priority badge
    if (options?.showPriority && meta?.priority) {
        parts[0] = `P${meta.priority}: ${parts[0]}`;
    }

    // Estimate
    if (options?.showEstimates && meta?.estimatedMinutes) {
        parts.push(`${meta.estimatedMinutes}m`);
    }

    // Escape special characters
    const label = parts.join('<br>');
    return `"${label.replace(/"/g, "'")}"`;
}

/**
 * Get styling class for a node.
 */
function getNodeStyle(
    nodeId: string,
    meta?: TaskMetadata,
    criticalPath?: Set<string>,
    options?: VisualizationOptions
): string {
    const classes: string[] = [];

    if (criticalPath?.has(nodeId)) {
        classes.push('critical');
    }

    if (options?.showStatus && meta?.status) {
        classes.push(meta.status);
    }

    if (options?.showPriority && meta?.priority) {
        classes.push(`p${meta.priority}`);
    }

    return classes.length > 0 ? `:::${classes.join(' ')}` : '';
}

/**
 * Get style definitions for the diagram.
 */
function getStyleDefinitions(options: VisualizationOptions): string[] {
    const lines: string[] = [];
    const isDark = options.theme === 'dark';

    // Status colors
    lines.push(`    classDef ready fill:${isDark ? '#2e7d32' : '#c8e6c9'},stroke:#2e7d32`);
    lines.push(`    classDef running fill:${isDark ? '#1565c0' : '#bbdefb'},stroke:#1565c0`);
    lines.push(`    classDef completed fill:${isDark ? '#388e3c' : '#a5d6a7'},stroke:#388e3c`);
    lines.push(`    classDef blocked fill:${isDark ? '#c62828' : '#ffcdd2'},stroke:#c62828`);
    lines.push(`    classDef failed fill:${isDark ? '#b71c1c' : '#ef9a9a'},stroke:#b71c1c`);
    lines.push(`    classDef waiting fill:${isDark ? '#616161' : '#e0e0e0'},stroke:#616161`);

    // Priority colors
    lines.push(`    classDef p1 fill:${isDark ? '#d32f2f' : '#ffcdd2'},stroke:#d32f2f`);
    lines.push(`    classDef p2 fill:${isDark ? '#f57c00' : '#ffe0b2'},stroke:#f57c00`);
    lines.push(`    classDef p3 fill:${isDark ? '#fbc02d' : '#fff9c4'},stroke:#fbc02d`);

    // Critical path
    lines.push(`    classDef critical stroke:#d32f2f,stroke-width:3px`);

    return lines;
}

/**
 * Sanitize node ID for Mermaid (alphanumeric only).
 */
function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
}

// ============================================================================
// Markdown Generation (MT-016.10)
// ============================================================================

/**
 * Generate a DEPENDENCY-MAP.md document.
 * 
 * **Simple explanation**: Creates a markdown file documenting all tasks,
 * their dependencies, priorities, and status. Like a table of contents for tasks.
 * 
 * @param tasks - Array of tasks with metadata
 * @param graph - The dependency graph
 * @param options - Visualization options
 * @returns Markdown content
 */
export function generateDependencyMap(
    tasks: Task[],
    graph: DependencyGraph,
    options: VisualizationOptions = {}
): string {
    const lines: string[] = [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    // Header
    lines.push('# Dependency Map');
    lines.push('');
    lines.push(`*Generated: ${new Date().toISOString()}*`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Total Tasks**: ${tasks.length}`);
    lines.push(`- **Completed**: ${tasks.filter(t => t.status === 'completed').length}`);
    lines.push(`- **In Progress**: ${tasks.filter(t => t.status === 'running').length}`);
    lines.push(`- **Ready**: ${tasks.filter(t => t.status === 'ready').length}`);
    lines.push(`- **Blocked**: ${tasks.filter(t => t.status === 'blocked').length}`);
    lines.push('');

    // Visual diagram
    lines.push('## Task Graph');
    lines.push('');
    lines.push('```mermaid');
    const taskMetadata = new Map(tasks.map(t => [t.id, t as TaskMetadata]));
    lines.push(generateMermaidDiagram(graph, taskMetadata, { ...options, showPriority: true }));
    lines.push('```');
    lines.push('');

    // Critical path
    const criticalPath = getCriticalPath(graph);
    if (criticalPath.length > 0) {
        lines.push('## Critical Path');
        lines.push('');
        lines.push('The longest chain of dependencies:');
        lines.push('');
        lines.push(criticalPath.map(id => {
            const task = taskMap.get(id);
            return `1. **${id}**: ${task?.title ?? 'Unknown'}`;
        }).join('\n'));
        lines.push('');
    }

    // Parallel levels
    const levels = getParallelLevels(graph);
    if (levels.length > 0) {
        lines.push('## Parallelization Levels');
        lines.push('');
        lines.push('Tasks that can run concurrently:');
        lines.push('');
        levels.forEach((level, idx) => {
            lines.push(`### Level ${idx + 1}`);
            lines.push('');
            level.forEach(id => {
                const task = taskMap.get(id);
                const status = getStatusEmoji(task?.status);
                lines.push(`- ${status} **${id}**: ${task?.title ?? 'Unknown'}`);
            });
            lines.push('');
        });
    }

    // Task details table
    lines.push('## Task Details');
    lines.push('');
    lines.push('| ID | Title | Priority | Status | Dependencies | Est. Time |');
    lines.push('|----|-------|----------|--------|--------------|-----------|');

    for (const task of tasks) {
        const deps = task.dependencies.length > 0
            ? task.dependencies.join(', ')
            : '-';
        const time = task.estimatedMinutes
            ? `${task.estimatedMinutes}m`
            : '-';
        lines.push(`| ${task.id} | ${task.title} | P${task.priority} | ${task.status} | ${deps} | ${time} |`);
    }
    lines.push('');

    // Dependencies detail
    lines.push('## Dependency Details');
    lines.push('');

    for (const task of tasks) {
        if (task.dependencies.length === 0 && graph.getDependents(task.id).length === 0) {
            continue; // Skip orphan tasks
        }

        lines.push(`### ${task.id}: ${task.title}`);
        lines.push('');

        if (task.dependencies.length > 0) {
            lines.push('**Depends on:**');
            for (const depId of task.dependencies) {
                const depTask = taskMap.get(depId);
                lines.push(`- ${getStatusEmoji(depTask?.status)} ${depId}: ${depTask?.title ?? 'Unknown'}`);
            }
            lines.push('');
        }

        const dependents = graph.getDependents(task.id);
        if (dependents.length > 0) {
            lines.push('**Required by:**');
            for (const depId of dependents) {
                const depTask = taskMap.get(depId);
                lines.push(`- ${depId}: ${depTask?.title ?? 'Unknown'}`);
            }
            lines.push('');
        }
    }

    logInfo(`[Visualization] Generated DEPENDENCY-MAP.md with ${tasks.length} tasks`);

    return lines.join('\n');
}

/**
 * Get status emoji.
 */
function getStatusEmoji(status?: TaskStatus): string {
    switch (status) {
        case 'completed': return '✅';
        case 'running': return '🔄';
        case 'ready': return '🟢';
        case 'blocked': return '🔴';
        case 'failed': return '❌';
        case 'pending': return '⏳';
        default: return '❓';
    }
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export diagram to file.
 */
export async function exportDiagramToFile(
    diagram: string,
    filePath: string,
    format: 'md' | 'mmd' | 'txt' = 'md'
): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    let content: string;

    switch (format) {
        case 'mmd':
            content = diagram;
            break;
        case 'txt':
            content = diagram;
            break;
        case 'md':
        default:
            content = `# Task Dependency Graph\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`;
            break;
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');

    logInfo(`[Visualization] Exported diagram to ${filePath}`);
}

/**
 * Generate SVG from Mermaid (requires mermaid-cli or similar).
 * This is a placeholder - actual SVG generation would need additional tooling.
 */
export function getMermaidSvgUrl(diagram: string): string {
    // Use mermaid.live for quick previews
    const encoded = Buffer.from(diagram).toString('base64');
    return `https://mermaid.live/view#base64:${encoded}`;
}
