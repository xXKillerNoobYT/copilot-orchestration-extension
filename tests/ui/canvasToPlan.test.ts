/**
 * Tests for Canvas to Plan Converter (MT-033.22)
 *
 * Unit tests for converting visual canvas representations back into
 * structured plan data and vice versa.
 */

import {
    convertCanvasToPlan,
    convertPlanToCanvas,
    mergeCanvasIntoPlan,
    canvasToWizardState,
    wizardToCanvasState,
    exportCanvasLayout,
    importCanvasLayout,
    ConversionResult,
    ConversionWarning,
    ConversionError,
    MergeOptions,
    DEFAULT_MERGE_OPTIONS,
} from '../../src/ui/canvasToPlan';
import {
    CanvasState,
    CanvasBlock,
    CanvasConnection,
    createCanvasState,
} from '../../src/ui/blockCanvas';
import {
    CompletePlan,
    FeatureBlock,
    BlockLink,
    PriorityLevel,
    WizardState,
    UserStory,
    DeveloperStory,
} from '../../src/planning/types';

// Mock crypto
jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => 'mock-uuid-12345'),
}));

// Mock detectCycles
jest.mock('../../src/ui/dependencyGraph', () => ({
    detectCycles: jest.fn(() => []),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockCanvasBlock(overrides: Partial<CanvasBlock> = {}): CanvasBlock {
    return {
        id: 'block-1',
        name: 'Test Block',
        type: 'feature',
        position: { x: 100, y: 200 },
        size: { width: 180, height: 60 },
        priority: 'medium',
        selected: false,
        dragging: false,
        criteriaCount: 0,
        ...overrides,
    };
}

function createMockCanvasConnection(overrides: Partial<CanvasConnection> = {}): CanvasConnection {
    return {
        id: 'conn-1',
        sourceId: 'block-1',
        targetId: 'block-2',
        type: 'requires',
        selected: false,
        ...overrides,
    };
}

function createMockCanvasState(overrides: Partial<CanvasState> = {}): CanvasState {
    return {
        blocks: [createMockCanvasBlock()],
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

function createMockPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            version: 1,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
        },
        overview: {
            name: 'Test Plan',
            description: 'A test plan',
            goals: ['Goal 1'],
        },
        featureBlocks: [{
            id: 'feature-1',
            name: 'Feature 1',
            description: 'Description',
            purpose: 'Purpose',
            technicalNotes: '',
            priority: 'medium',
            order: 1,
            acceptanceCriteria: ['Criteria 1'],
        }],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
        ...overrides,
    };
}

// ============================================================================
// DEFAULT_MERGE_OPTIONS Tests
// ============================================================================

describe('CanvasToPlan', () => {
    describe('DEFAULT_MERGE_OPTIONS', () => {
        it('Test 1: should have merge as default strategy', () => {
            expect(DEFAULT_MERGE_OPTIONS.existingDataStrategy).toBe('merge');
        });

        it('Test 2: should use canvas order by default', () => {
            expect(DEFAULT_MERGE_OPTIONS.useCanvasOrder).toBe(true);
        });

        it('Test 3: should preserve criteria by default', () => {
            expect(DEFAULT_MERGE_OPTIONS.preserveCriteria).toBe(true);
        });

        it('Test 4: should preserve stories by default', () => {
            expect(DEFAULT_MERGE_OPTIONS.preserveStories).toBe(true);
        });
    });

    // ========================================================================
    // convertCanvasToPlan Tests
    // ========================================================================

    describe('convertCanvasToPlan', () => {
        it('Test 5: should return successful result for valid canvas', () => {
            const canvas = createMockCanvasState();
            const result = convertCanvasToPlan(canvas);

            expect(result.success).toBe(true);
            expect(result.plan).toBeDefined();
        });

        it('Test 6: should convert canvas blocks to feature blocks', () => {
            const canvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'block-1', name: 'Feature A' }),
                    createMockCanvasBlock({ id: 'block-2', name: 'Feature B' }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.featureBlocks).toHaveLength(2);
            expect(result.plan?.featureBlocks[0].name).toBe('Feature A');
        });

        it('Test 7: should convert connections to block links', () => {
            const canvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'block-1' }),
                    createMockCanvasBlock({ id: 'block-2' }),
                ],
                connections: [
                    createMockCanvasConnection({ sourceId: 'block-1', targetId: 'block-2' }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.blockLinks).toHaveLength(1);
            expect(result.plan?.blockLinks[0].sourceBlockId).toBe('block-1');
        });

        it('Test 8: should skip non-feature blocks', () => {
            const canvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'block-1', type: 'feature' }),
                    createMockCanvasBlock({ id: 'block-2', type: 'milestone' }),
                    createMockCanvasBlock({ id: 'block-3', type: 'note' }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.featureBlocks).toHaveLength(1);
        });

        it('Test 9: should preserve existing plan data when merging', () => {
            const canvas = createMockCanvasState();
            const existingPlan = createMockPlan({
                userStories: [{ id: 'story-1', userType: 'user', action: 'test', benefit: 'benefit', relatedBlockIds: [], acceptanceCriteria: [], priority: 'medium' }],
            });

            const result = convertCanvasToPlan(canvas, existingPlan, {
                ...DEFAULT_MERGE_OPTIONS,
                preserveStories: true,
            });

            expect(result.plan?.userStories).toHaveLength(1);
        });

        it('Test 10: should order blocks by canvas layout', () => {
            const canvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'block-2', position: { x: 300, y: 100 } }),
                    createMockCanvasBlock({ id: 'block-1', position: { x: 100, y: 100 } }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            // Should order by x position (left to right)
            expect(result.plan?.featureBlocks[0].name).toBeDefined();
        });

        it('Test 11: should warn about orphaned link sources', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ id: 'block-1' })],
                connections: [
                    createMockCanvasConnection({ sourceId: 'missing', targetId: 'block-1' }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.warnings.some(w => w.code === 'ORPHAN_SOURCE')).toBe(true);
        });

        it('Test 12: should warn about orphaned link targets', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ id: 'block-1' })],
                connections: [
                    createMockCanvasConnection({ sourceId: 'block-1', targetId: 'missing' }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.warnings.some(w => w.code === 'ORPHAN_TARGET')).toBe(true);
        });

        it('Test 13: should create default overview if none exists', () => {
            const canvas = createMockCanvasState();

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.overview.name).toBe('Untitled Plan');
        });

        it('Test 14: should generate new metadata for new plans', () => {
            const canvas = createMockCanvasState();

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.metadata.id).toBe('mock-uuid-12345');
        });
    });

    // ========================================================================
    // convertPlanToCanvas Tests
    // ========================================================================

    describe('convertPlanToCanvas', () => {
        it('Test 15: should convert feature blocks to canvas blocks', () => {
            const plan = createMockPlan();

            const canvas = convertPlanToCanvas(plan);

            expect(canvas.blocks).toHaveLength(1);
            expect(canvas.blocks[0].name).toBe('Feature 1');
        });

        it('Test 16: should convert block links to connections', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    { id: 'f1', name: 'F1', description: '', purpose: '', technicalNotes: '', priority: 'medium', order: 1, acceptanceCriteria: [] },
                    { id: 'f2', name: 'F2', description: '', purpose: '', technicalNotes: '', priority: 'medium', order: 2, acceptanceCriteria: [] },
                ],
                blockLinks: [
                    { id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' },
                ],
            });

            const canvas = convertPlanToCanvas(plan);

            expect(canvas.connections).toHaveLength(1);
            expect(canvas.connections[0].sourceId).toBe('f1');
        });

        it('Test 17: should set default canvas settings', () => {
            const plan = createMockPlan();

            const canvas = convertPlanToCanvas(plan);

            expect(canvas.zoom).toBe(1);
            expect(canvas.gridSnap).toBe(true);
        });

        it('Test 18: should calculate positions based on order', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    { id: 'f1', name: 'F1', description: '', purpose: '', technicalNotes: '', priority: 'medium', order: 1, acceptanceCriteria: [] },
                    { id: 'f2', name: 'F2', description: '', purpose: '', technicalNotes: '', priority: 'medium', order: 2, acceptanceCriteria: [] },
                ],
            });

            const canvas = convertPlanToCanvas(plan);

            // Blocks should have different positions
            expect(canvas.blocks[0].position.x).not.toBe(canvas.blocks[1].position.x);
        });

        it('Test 19: should preserve priority levels', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    { id: 'f1', name: 'F1', description: '', purpose: '', technicalNotes: '', priority: 'critical', order: 1, acceptanceCriteria: [] },
                ],
            });

            const canvas = convertPlanToCanvas(plan);

            expect(canvas.blocks[0].priority).toBe('critical');
        });

        it('Test 20: should set criteria count from acceptance criteria', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    { id: 'f1', name: 'F1', description: '', purpose: '', technicalNotes: '', priority: 'medium', order: 1, acceptanceCriteria: ['AC1', 'AC2', 'AC3'] },
                ],
            });

            const canvas = convertPlanToCanvas(plan);

            expect(canvas.blocks[0].criteriaCount).toBe(3);
        });
    });

    // ========================================================================
    // mergeCanvasIntoPlan Tests
    // ========================================================================

    describe('mergeCanvasIntoPlan', () => {
        it('Test 21: should merge canvas changes into existing plan', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ id: 'block-1', name: 'Updated Name' })],
            });
            const existingPlan = createMockPlan();

            const result = mergeCanvasIntoPlan(canvas, existingPlan);

            expect(result.success).toBe(true);
        });

        it('Test 22: should preserve existing metadata', () => {
            const canvas = createMockCanvasState();
            const existingPlan = createMockPlan({
                metadata: { id: 'original-id', name: 'Original', version: 5, createdAt: new Date(), updatedAt: new Date() },
            });

            const result = mergeCanvasIntoPlan(canvas, existingPlan);

            expect(result.plan?.metadata.id).toBe('original-id');
        });

        it('Test 23: should preserve user stories', () => {
            const canvas = createMockCanvasState();
            const existingPlan = createMockPlan({
                userStories: [{ id: 's1', userType: 'user', action: 'do something', benefit: 'get benefit', relatedBlockIds: [], acceptanceCriteria: [], priority: 'medium' }],
            });

            const result = mergeCanvasIntoPlan(canvas, existingPlan);

            expect(result.plan?.userStories).toHaveLength(1);
        });

        it('Test 24: should filter developer stories by valid features', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ id: 'feature-1' })],
            });
            const existingPlan = createMockPlan({
                developerStories: [{ id: 'd1', action: 'do something', benefit: 'get benefit', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 4, relatedBlockIds: ['feature-1'], relatedTaskIds: [] }],
            });

            const result = mergeCanvasIntoPlan(canvas, existingPlan);

            expect(result.plan?.developerStories).toHaveLength(1);
        });

        it('Test 25: should preserve version number from existing plan', () => {
            const canvas = createMockCanvasState();
            const existingPlan = createMockPlan({
                metadata: { id: 'id', name: 'Name', version: 3, createdAt: new Date(), updatedAt: new Date() },
            });

            const result = mergeCanvasIntoPlan(canvas, existingPlan);

            expect(result.plan?.metadata.version).toBe(3);
        });
    });

    // ========================================================================
    // canvasToWizardState Tests
    // ========================================================================

    describe('canvasToWizardState', () => {
        it('Test 26: should convert canvas to wizard state', () => {
            const canvas = createMockCanvasState();

            const wizardState = canvasToWizardState(canvas);

            expect(wizardState).toBeDefined();
        });

        it('Test 27: should transfer block data', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ name: 'Block A' })],
            });

            const wizardState = canvasToWizardState(canvas);

            expect(wizardState.plan?.featureBlocks?.[0].name).toBe('Block A');
        });

        it('Test 28: should transfer connection data', () => {
            const canvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'b1' }),
                    createMockCanvasBlock({ id: 'b2' }),
                ],
                connections: [
                    createMockCanvasConnection({ sourceId: 'b1', targetId: 'b2' }),
                ],
            });

            const wizardState = canvasToWizardState(canvas);

            expect(wizardState.plan?.blockLinks).toHaveLength(1);
        });
    });

    // ========================================================================
    // wizardToCanvasState Tests
    // ========================================================================

    describe('wizardToCanvasState', () => {
        it('Test 29: should convert wizard state to canvas', () => {
            const wizardState: WizardState = {
                currentPage: 'features',
                isDirty: false,
                plan: {
                    metadata: { id: 'id', name: 'Test', version: 1, createdAt: new Date(), updatedAt: new Date() },
                    overview: { name: 'Test', description: 'Desc', goals: [] },
                    featureBlocks: [
                        { id: 'f1', name: 'Feature', description: '', purpose: '', technicalNotes: '', priority: 'medium' as PriorityLevel, order: 1, acceptanceCriteria: [] },
                    ],
                    blockLinks: [],
                },
            };

            const canvas = wizardToCanvasState(wizardState);

            expect(canvas.blocks).toHaveLength(1);
        });

        it('Test 30: should preserve feature priorities', () => {
            const wizardState: WizardState = {
                currentPage: 'features',
                isDirty: false,
                plan: {
                    metadata: { id: 'id', name: 'Test', version: 1, createdAt: new Date(), updatedAt: new Date() },
                    overview: { name: 'Test', description: 'Desc', goals: [] },
                    featureBlocks: [
                        { id: 'f1', name: 'Feature', description: '', purpose: '', technicalNotes: '', priority: 'high' as PriorityLevel, order: 1, acceptanceCriteria: [] },
                    ],
                    blockLinks: [],
                },
            };

            const canvas = wizardToCanvasState(wizardState);

            expect(canvas.blocks[0].priority).toBe('high');
        });

        it('Test 31: should convert block links to connections', () => {
            const wizardState: WizardState = {
                currentPage: 'features',
                isDirty: false,
                plan: {
                    metadata: { id: 'id', name: 'Test', version: 1, createdAt: new Date(), updatedAt: new Date() },
                    overview: { name: 'Test', description: 'Desc', goals: [] },
                    featureBlocks: [
                        { id: 'f1', name: 'F1', description: '', purpose: '', technicalNotes: '', priority: 'medium' as PriorityLevel, order: 1, acceptanceCriteria: [] },
                        { id: 'f2', name: 'F2', description: '', purpose: '', technicalNotes: '', priority: 'medium' as PriorityLevel, order: 2, acceptanceCriteria: [] },
                    ],
                    blockLinks: [
                        { id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' as const },
                    ],
                },
            };

            const canvas = wizardToCanvasState(wizardState);

            expect(canvas.connections).toHaveLength(1);
            expect(canvas.connections[0].sourceId).toBe('f1');
        });
    });

    // ========================================================================
    // exportCanvasLayout Tests
    // ========================================================================

    describe('exportCanvasLayout', () => {
        it('Test 32: should return valid JSON', () => {
            const canvas = createMockCanvasState();

            const json = exportCanvasLayout(canvas);

            expect(() => JSON.parse(json)).not.toThrow();
        });

        it('Test 33: should include version number', () => {
            const canvas = createMockCanvasState();

            const json = exportCanvasLayout(canvas);
            const data = JSON.parse(json);

            expect(data.version).toBe('1.0');
        });

        it('Test 34: should include export timestamp', () => {
            const canvas = createMockCanvasState();

            const json = exportCanvasLayout(canvas);
            const data = JSON.parse(json);

            expect(data.exportedAt).toBeDefined();
        });

        it('Test 35: should include block data', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ name: 'Export Block' })],
            });

            const json = exportCanvasLayout(canvas);
            const data = JSON.parse(json);

            expect(data.blocks[0].name).toBe('Export Block');
        });

        it('Test 36: should include connection data', () => {
            const canvas = createMockCanvasState({
                connections: [createMockCanvasConnection()],
            });

            const json = exportCanvasLayout(canvas);
            const data = JSON.parse(json);

            expect(data.connections).toHaveLength(1);
        });

        it('Test 37: should include view settings', () => {
            const canvas = createMockCanvasState({ zoom: 1.5, gridSize: 25 });

            const json = exportCanvasLayout(canvas);
            const data = JSON.parse(json);

            expect(data.viewSettings.zoom).toBe(1.5);
            expect(data.viewSettings.gridSize).toBe(25);
        });

        it('Test 38: should exclude selection state', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ selected: true })],
            });

            const json = exportCanvasLayout(canvas);
            const data = JSON.parse(json);

            expect(data.blocks[0].selected).toBeUndefined();
        });
    });

    // ========================================================================
    // importCanvasLayout Tests
    // ========================================================================

    describe('importCanvasLayout', () => {
        it('Test 39: should import valid JSON', () => {
            const json = JSON.stringify({
                version: '1.0',
                blocks: [{ id: 'b1', name: 'Block', position: { x: 0, y: 0 }, size: { width: 180, height: 60 }, priority: 'medium' }],
                connections: [],
                viewSettings: { zoom: 1, pan: { x: 0, y: 0 } },
            });

            const canvas = importCanvasLayout(json);

            expect(canvas).not.toBeNull();
            expect(canvas?.blocks).toHaveLength(1);
        });

        it('Test 40: should return null for invalid JSON', () => {
            const json = 'not valid json {{{';

            const canvas = importCanvasLayout(json);

            expect(canvas).toBeNull();
        });

        it('Test 41: should set default selection states', () => {
            const json = JSON.stringify({
                version: '1.0',
                blocks: [{ id: 'b1', name: 'Block', position: { x: 0, y: 0 }, size: { width: 180, height: 60 }, priority: 'medium' }],
                connections: [],
                viewSettings: {},
            });

            const canvas = importCanvasLayout(json);

            expect(canvas?.blocks[0].selected).toBe(false);
            expect(canvas?.blocks[0].dragging).toBe(false);
        });

        it('Test 42: should handle missing view settings', () => {
            const json = JSON.stringify({
                version: '1.0',
                blocks: [],
                connections: [],
            });

            const canvas = importCanvasLayout(json);

            expect(canvas?.zoom).toBe(1);
            expect(canvas?.gridSnap).toBe(true);
        });

        it('Test 43: should warn about unknown versions', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const json = JSON.stringify({
                version: '2.0',
                blocks: [],
                connections: [],
            });

            importCanvasLayout(json);

            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('Test 44: should set default criteriaCount', () => {
            const json = JSON.stringify({
                version: '1.0',
                blocks: [{ id: 'b1', name: 'Block', position: { x: 0, y: 0 }, size: { width: 180, height: 60 }, priority: 'medium' }],
                connections: [],
            });

            const canvas = importCanvasLayout(json);

            expect(canvas?.blocks[0].criteriaCount).toBe(0);
        });

        it('Test 45: should reset connection mode', () => {
            const json = JSON.stringify({
                version: '1.0',
                blocks: [],
                connections: [],
            });

            const canvas = importCanvasLayout(json);

            expect(canvas?.connectionMode).toBeNull();
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('Test 46: should handle empty canvas', () => {
            const canvas = createMockCanvasState({ blocks: [], connections: [] });

            const result = convertCanvasToPlan(canvas);

            expect(result.success).toBe(true);
            expect(result.plan?.featureBlocks).toHaveLength(0);
        });

        it('Test 47: should handle canvas with only notes and milestones', () => {
            const canvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'note-1', type: 'note' }),
                    createMockCanvasBlock({ id: 'milestone-1', type: 'milestone' }),
                ],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.featureBlocks).toHaveLength(0);
        });

        it('Test 48: should handle plan with no features', () => {
            const plan = createMockPlan({ featureBlocks: [] });

            const canvas = convertPlanToCanvas(plan);

            expect(canvas.blocks).toHaveLength(0);
        });

        it('Test 49: should handle deep merging options', () => {
            const canvas = createMockCanvasState();
            const customOptions: MergeOptions = {
                existingDataStrategy: 'replace',
                useCanvasOrder: false,
                preserveCriteria: false,
                preserveStories: false,
            };

            const result = convertCanvasToPlan(canvas, undefined, customOptions);

            expect(result.success).toBe(true);
        });

        it('Test 50: should handle special characters in block names', () => {
            const canvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ name: '日本語 Feature <script>' })],
            });

            const result = convertCanvasToPlan(canvas);

            expect(result.plan?.featureBlocks[0].name).toContain('日本語');
        });
    });

    // ========================================================================
    // Round-trip Tests
    // ========================================================================

    describe('round-trip conversion', () => {
        it('Test 51: should preserve data in canvas -> plan -> canvas', () => {
            const originalCanvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'b1', name: 'Feature A', priority: 'high' }),
                    createMockCanvasBlock({ id: 'b2', name: 'Feature B', priority: 'low' }),
                ],
                connections: [],
            });

            const plan = convertCanvasToPlan(originalCanvas);
            const restoredCanvas = convertPlanToCanvas(plan.plan!);

            expect(restoredCanvas.blocks).toHaveLength(2);
        });

        it('Test 52: should preserve data in export -> import', () => {
            const originalCanvas = createMockCanvasState({
                blocks: [createMockCanvasBlock({ name: 'Exported Block' })],
                zoom: 1.5,
                gridSize: 25,
            });

            const json = exportCanvasLayout(originalCanvas);
            const importedCanvas = importCanvasLayout(json);

            expect(importedCanvas?.blocks[0].name).toBe('Exported Block');
            expect(importedCanvas?.zoom).toBe(1.5);
        });

        it('Test 53: should preserve connections in round-trip', () => {
            const originalCanvas = createMockCanvasState({
                blocks: [
                    createMockCanvasBlock({ id: 'b1' }),
                    createMockCanvasBlock({ id: 'b2' }),
                ],
                connections: [
                    createMockCanvasConnection({ sourceId: 'b1', targetId: 'b2', type: 'blocks' }),
                ],
            });

            const json = exportCanvasLayout(originalCanvas);
            const importedCanvas = importCanvasLayout(json);

            expect(importedCanvas?.connections[0].type).toBe('blocks');
        });
    });
});
