/**
 * Canvas to Plan Converter (MT-033.22)
 *
 * **Simple explanation**: Converts the visual canvas representation back into
 * plan data structure. When you're done designing with drag-drop, this
 * converts everything back to a proper plan format for saving and export.
 *
 * @module ui/canvasToPlan
 */

import * as crypto from 'crypto';
import {
    CanvasState,
    CanvasBlock,
    CanvasConnection,
} from './blockCanvas';
import {
    CompletePlan,
    FeatureBlock,
    BlockLink,
    UserStory,
    DeveloperStory,
    SuccessCriterion,
    WizardState,
    PlanMetadata,
    ConditionalLogic,
} from '../planning/types';
import { detectCycles } from './dependencyGraph';

// ============================================================================
// Types
// ============================================================================

export interface ConversionResult {
    /** Whether conversion was successful */
    success: boolean;
    /** Converted plan (if successful) */
    plan?: CompletePlan;
    /** Validation warnings */
    warnings: ConversionWarning[];
    /** Conversion errors (if unsuccessful) */
    errors: ConversionError[];
}

export interface ConversionWarning {
    code: string;
    message: string;
    blockId?: string;
}

export interface ConversionError {
    code: string;
    message: string;
    blockId?: string;
    connectionId?: string;
}

export interface MergeOptions {
    /** How to handle existing data */
    existingDataStrategy: 'keep' | 'replace' | 'merge';
    /** Preserve order from canvas layout */
    useCanvasOrder: boolean;
    /** Preserve acceptance criteria from existing plan */
    preserveCriteria: boolean;
    /** Preserve user stories from existing plan */
    preserveStories: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
    existingDataStrategy: 'merge',
    useCanvasOrder: true,
    preserveCriteria: true,
    preserveStories: true,
};

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert canvas state to a complete plan.
 *
 * **Simple explanation**: Takes your visual design and turns it into
 * structured plan data that can be saved, exported, or executed.
 */
export function convertCanvasToPlan(
    canvasState: CanvasState,
    existingPlan?: CompletePlan,
    options: MergeOptions = DEFAULT_MERGE_OPTIONS
): ConversionResult {
    const warnings: ConversionWarning[] = [];
    const errors: ConversionError[] = [];

    // Validate canvas state
    const validationErrors = validateCanvasState(canvasState);
    if (validationErrors.length > 0) {
        return {
            success: false,
            warnings,
            errors: validationErrors,
        };
    }

    // Get ordered blocks based on canvas layout
    const orderedBlocks = options.useCanvasOrder
        ? orderBlocksByLayout(canvasState.blocks)
        : canvasState.blocks;

    // Convert canvas blocks to feature blocks
    const featureBlocks: FeatureBlock[] = orderedBlocks
        .filter(b => b.type === 'feature')
        .map((block, index) => {
            const existingFeature = existingPlan?.featureBlocks.find(f => f.id === block.id);
            return convertBlockToFeature(block, index + 1, existingFeature, options);
        });

    // Convert connections to block links
    const blockLinks: BlockLink[] = canvasState.connections.map(conn => ({
        id: conn.id,
        sourceBlockId: conn.sourceId,
        targetBlockId: conn.targetId,
        dependencyType: conn.type,
    }));

    // Check for orphaned references
    const featureIds = new Set(featureBlocks.map(f => f.id));
    for (const link of blockLinks) {
        if (!featureIds.has(link.sourceBlockId)) {
            warnings.push({
                code: 'ORPHAN_SOURCE',
                message: `Link references non-existent source block: ${link.sourceBlockId}`,
                blockId: link.sourceBlockId,
            });
        }
        if (!featureIds.has(link.targetBlockId)) {
            warnings.push({
                code: 'ORPHAN_TARGET',
                message: `Link references non-existent target block: ${link.targetBlockId}`,
                blockId: link.targetBlockId,
            });
        }
    }

    // Merge or create overview
    const overview = existingPlan?.overview || {
        name: 'Untitled Plan',
        description: 'Created from canvas designer',
        goals: [],
    };

    // Preserve or create stories and criteria
    const userStories = options.preserveStories && existingPlan
        ? existingPlan.userStories
        : [];
    const developerStories = options.preserveStories && existingPlan
        ? existingPlan.developerStories
        : [];
    const successCriteria = options.preserveCriteria && existingPlan
        ? existingPlan.successCriteria
        : [];

    // Preserve or create metadata
    const now = new Date();
    const metadata: PlanMetadata = existingPlan?.metadata || {
        id: crypto.randomUUID(),
        name: overview.name || 'Untitled Plan',
        createdAt: now,
        updatedAt: now,
        version: 1,
    };

    // Preserve conditional logic
    const conditionalLogic: ConditionalLogic[] = existingPlan?.conditionalLogic || [];

    // Build final plan
    const plan: CompletePlan = {
        metadata,
        overview,
        featureBlocks,
        blockLinks,
        conditionalLogic,
        userStories,
        developerStories,
        successCriteria,
    };

    // Check for circular dependencies
    const cycles = detectCycles(plan);
    if (cycles.length > 0) {
        warnings.push({
            code: 'CIRCULAR_DEPENDENCY',
            message: `Found ${cycles.length} circular dependency chain(s)`,
        });
    }

    return {
        success: true,
        plan,
        warnings,
        errors,
    };
}

/**
 * Convert a canvas block to a feature block.
 */
function convertBlockToFeature(
    block: CanvasBlock,
    order: number,
    existingFeature?: FeatureBlock,
    options: MergeOptions = DEFAULT_MERGE_OPTIONS
): FeatureBlock {
    // Start with existing feature or create new
    const base: FeatureBlock = existingFeature ? { ...existingFeature } : {
        id: block.id,
        name: block.name,
        description: block.description || '',
        purpose: '',
        technicalNotes: '',
        priority: block.priority,
        order,
        acceptanceCriteria: [],
    };

    // Always update from canvas
    base.name = block.name;
    base.priority = block.priority;
    base.order = order;

    // Optionally update description
    if (block.description && options.existingDataStrategy !== 'keep') {
        base.description = block.description;
    }

    return base;
}

/**
 * Order blocks by their visual layout (left-to-right, top-to-bottom).
 */
function orderBlocksByLayout(blocks: CanvasBlock[]): CanvasBlock[] {
    return [...blocks].sort((a, b) => {
        // Primary sort by row (y position in 100px increments)
        const rowA = Math.floor(a.position.y / 100);
        const rowB = Math.floor(b.position.y / 100);
        if (rowA !== rowB) return rowA - rowB;

        // Secondary sort by column (x position)
        return a.position.x - b.position.x;
    });
}

/**
 * Validate canvas state before conversion.
 */
function validateCanvasState(canvasState: CanvasState): ConversionError[] {
    const errors: ConversionError[] = [];

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const block of canvasState.blocks) {
        if (ids.has(block.id)) {
            errors.push({
                code: 'DUPLICATE_ID',
                message: `Duplicate block ID: ${block.id}`,
                blockId: block.id,
            });
        }
        ids.add(block.id);
    }

    // Check for unnamed blocks
    for (const block of canvasState.blocks) {
        if (!block.name || block.name.trim() === '') {
            errors.push({
                code: 'UNNAMED_BLOCK',
                message: `Block ${block.id} has no name`,
                blockId: block.id,
            });
        }
    }

    // Check for self-referencing connections
    for (const conn of canvasState.connections) {
        if (conn.sourceId === conn.targetId) {
            errors.push({
                code: 'SELF_REFERENCE',
                message: `Block cannot depend on itself`,
                blockId: conn.sourceId,
                connectionId: conn.id,
            });
        }
    }

    return errors;
}

// ============================================================================
// Reverse Conversion (Plan to Canvas)
// ============================================================================

/**
 * Convert a plan back to canvas state for editing.
 *
 * **Simple explanation**: Takes an existing plan and converts it to the
 * visual canvas format so you can edit it with drag-drop.
 */
export function convertPlanToCanvas(plan: CompletePlan): CanvasState {
    // Convert feature blocks to canvas blocks with auto-layout
    const blocks: CanvasBlock[] = plan.featureBlocks.map((feature, index) => ({
        id: feature.id,
        name: feature.name,
        type: 'feature' as const,
        position: calculateAutoPosition(index, plan.featureBlocks.length),
        size: { width: 200, height: 100 },
        priority: feature.priority,
        selected: false,
        dragging: false,
        description: feature.description?.slice(0, 100),
        criteriaCount: feature.acceptanceCriteria.length,
    }));

    // Convert block links to connections
    const connections: CanvasConnection[] = plan.blockLinks.map(link => ({
        id: link.id,
        sourceId: link.sourceBlockId,
        targetId: link.targetBlockId,
        type: link.dependencyType,
        selected: false,
    }));

    return {
        blocks,
        connections,
        zoom: 1,
        pan: { x: 0, y: 0 },
        selectedBlockIds: [],
        selectedConnectionIds: [],
        gridSnap: true,
        gridSize: 20,
        connectionMode: null,
    };
}

/**
 * Calculate auto-layout position for a block.
 */
function calculateAutoPosition(
    index: number,
    totalBlocks: number
): { x: number; y: number } {
    // Arrange in a grid pattern
    const cols = Math.ceil(Math.sqrt(totalBlocks));
    const col = index % cols;
    const row = Math.floor(index / cols);

    const spacing = { x: 250, y: 150 };
    const offset = { x: 50, y: 50 };

    return {
        x: offset.x + col * spacing.x,
        y: offset.y + row * spacing.y,
    };
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Merge canvas changes into an existing plan.
 *
 * **Simple explanation**: Updates an existing plan with changes made on
 * the canvas while preserving data that wasn't changed.
 */
export function mergeCanvasIntoPlan(
    canvasState: CanvasState,
    existingPlan: CompletePlan,
    options: MergeOptions = DEFAULT_MERGE_OPTIONS
): ConversionResult {
    const result = convertCanvasToPlan(canvasState, existingPlan, options);

    if (!result.success || !result.plan) {
        return result;
    }

    const mergedPlan = result.plan;

    // Merge feature details that weren't on canvas
    for (const feature of mergedPlan.featureBlocks) {
        const existing = existingPlan.featureBlocks.find(f => f.id === feature.id);
        if (existing) {
            // Preserve acceptance criteria if not on canvas
            if (options.preserveCriteria && feature.acceptanceCriteria.length === 0) {
                feature.acceptanceCriteria = existing.acceptanceCriteria;
            }
        }
    }

    // Update developer stories to reference correct feature IDs
    if (options.preserveStories) {
        const validFeatureIds = new Set(mergedPlan.featureBlocks.map(f => f.id));

        // Filter out developer stories that reference deleted features
        mergedPlan.developerStories = mergedPlan.developerStories.filter(
            s => s.relatedBlockIds.some(id => validFeatureIds.has(id))
        );

        // Add warning for removed stories
        const removedCount = existingPlan.developerStories.length - mergedPlan.developerStories.length;
        if (removedCount > 0) {
            result.warnings.push({
                code: 'STORIES_REMOVED',
                message: `${removedCount} developer story(ies) removed due to deleted features`,
            });
        }
    }

    return {
        ...result,
        plan: mergedPlan,
    };
}

// ============================================================================
// Wizard Integration
// ============================================================================

/**
 * Create a wizard state from canvas state.
 *
 * **Simple explanation**: Converts canvas data to the format needed by
 * the wizard UI for display on the review page.
 */
export function canvasToWizardState(
    canvasState: CanvasState,
    existingPlan?: CompletePlan
): WizardState {
    const result = convertCanvasToPlan(canvasState, existingPlan);
    const plan = result.plan || createEmptyPlan();

    return {
        currentPage: 'review',
        plan: plan,
        isDirty: true,
    };
}

/**
 * Create a canvas state from wizard state.
 */
export function wizardToCanvasState(wizardState: WizardState): CanvasState {
    const plan: CompletePlan = {
        metadata: wizardState.plan?.metadata || createEmptyPlan().metadata,
        overview: wizardState.plan?.overview || { name: '', description: '', goals: [] },
        featureBlocks: wizardState.plan?.featureBlocks || [],
        blockLinks: wizardState.plan?.blockLinks || [],
        conditionalLogic: wizardState.plan?.conditionalLogic || [],
        userStories: wizardState.plan?.userStories || [],
        developerStories: wizardState.plan?.developerStories || [],
        successCriteria: wizardState.plan?.successCriteria || [],
    };

    return convertPlanToCanvas(plan);
}

/**
 * Create an empty plan with defaults.
 */
function createEmptyPlan(): CompletePlan {
    const now = new Date();
    return {
        metadata: {
            id: crypto.randomUUID(),
            name: 'Untitled Plan',
            createdAt: now,
            updatedAt: now,
            version: 1,
        },
        overview: {
            name: 'Untitled Plan',
            description: '',
            goals: [],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
    };
}

// ============================================================================
// Export/Import
// ============================================================================

/**
 * Export canvas state to JSON format.
 *
 * **Simple explanation**: Saves canvas layout data to a file that can be
 * loaded later to restore the exact visual arrangement.
 */
export function exportCanvasLayout(canvasState: CanvasState): string {
    const layoutData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        blocks: canvasState.blocks.map(block => ({
            id: block.id,
            name: block.name,
            type: block.type,
            position: block.position,
            size: block.size,
            priority: block.priority,
            color: block.color,
        })),
        connections: canvasState.connections.map(conn => ({
            id: conn.id,
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            type: conn.type,
        })),
        viewSettings: {
            zoom: canvasState.zoom,
            pan: canvasState.pan,
            gridSnap: canvasState.gridSnap,
            gridSize: canvasState.gridSize,
        },
    };

    return JSON.stringify(layoutData, null, 2);
}

/**
 * Import canvas layout from JSON.
 */
export function importCanvasLayout(json: string): CanvasState | null {
    try {
        const data = JSON.parse(json);

        if (data.version !== '1.0') {
            console.warn('Unknown canvas layout version:', data.version);
        }

        return {
            blocks: data.blocks.map((b: { id: string; name: string; type?: string; position: { x: number; y: number }; size: { width: number; height: number }; priority: 'critical' | 'high' | 'medium' | 'low'; color?: string; description?: string; criteriaCount?: number }) => ({
                ...b,
                type: b.type || 'feature',
                selected: false,
                dragging: false,
                criteriaCount: b.criteriaCount || 0,
            })),
            connections: data.connections.map((c: { id: string; sourceId: string; targetId: string; type: 'requires' | 'blocks' | 'suggests' | 'triggers' }) => ({
                ...c,
                selected: false,
            })),
            zoom: data.viewSettings?.zoom || 1,
            pan: data.viewSettings?.pan || { x: 0, y: 0 },
            gridSnap: data.viewSettings?.gridSnap ?? true,
            gridSize: data.viewSettings?.gridSize || 20,
            selectedBlockIds: [],
            selectedConnectionIds: [],
            connectionMode: null,
        };
    } catch (error) {
        console.error('Failed to import canvas layout:', error);
        return null;
    }
}
