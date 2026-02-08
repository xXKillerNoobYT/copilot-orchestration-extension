/**
 * Tests for Block Property Panel (MT-033.21)
 *
 * Unit tests for the block editor side panel that displays and allows
 * editing of block properties, connections, and metadata.
 */

import {
    createPropertyPanelState,
    selectBlockForEdit,
    clearPropertySelection,
    toggleSection,
    renderPropertyPanel,
    renderBlockConnections,
    getPropertyPanelStyles,
    getPropertyPanelScript,
    PropertyPanelState,
    PropertyChange,
} from '../../src/ui/blockPropertyPanel';
import { CanvasBlock } from '../../src/ui/blockCanvas';
import { FeatureBlock, DependencyType, PriorityLevel } from '../../src/planning/types';

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

function createMockFeatureBlock(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'feature-1',
        name: 'Test Feature',
        description: 'A test feature description',
        purpose: 'Testing the property panel',
        technicalNotes: '',
        priority: 'medium' as PriorityLevel,
        order: 1,
        acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
        ...overrides,
    };
}

// ============================================================================
// PropertyPanelState Tests
// ============================================================================

describe('BlockPropertyPanel', () => {
    describe('PropertyPanelState interface', () => {
        it('Test 1: should define all required properties', () => {
            const state: PropertyPanelState = {
                selectedBlock: null,
                featureData: null,
                isVisible: true,
                expandedSections: new Set(),
            };

            expect(state.selectedBlock).toBeNull();
            expect(state.isVisible).toBe(true);
        });
    });

    describe('PropertyChange interface', () => {
        it('Test 2: should define change tracking structure', () => {
            const change: PropertyChange = {
                blockId: 'block-1',
                propertyPath: 'name',
                oldValue: 'Old Name',
                newValue: 'New Name',
            };

            expect(change.blockId).toBe('block-1');
            expect(change.propertyPath).toBe('name');
        });
    });

    // ========================================================================
    // createPropertyPanelState Tests
    // ========================================================================

    describe('createPropertyPanelState', () => {
        it('Test 3: should create state with null block', () => {
            const state = createPropertyPanelState();

            expect(state.selectedBlock).toBeNull();
        });

        it('Test 4: should create state with null feature data', () => {
            const state = createPropertyPanelState();

            expect(state.featureData).toBeNull();
        });

        it('Test 5: should create state with visible panel', () => {
            const state = createPropertyPanelState();

            expect(state.isVisible).toBe(true);
        });

        it('Test 6: should create state with default expanded sections', () => {
            const state = createPropertyPanelState();

            expect(state.expandedSections.has('basic')).toBe(true);
            expect(state.expandedSections.has('description')).toBe(true);
            expect(state.expandedSections.has('criteria')).toBe(true);
        });

        it('Test 7: should not expand advanced sections by default', () => {
            const state = createPropertyPanelState();

            expect(state.expandedSections.has('connections')).toBe(false);
            expect(state.expandedSections.has('advanced')).toBe(false);
        });
    });

    // ========================================================================
    // selectBlockForEdit Tests
    // ========================================================================

    describe('selectBlockForEdit', () => {
        it('Test 8: should set selected block', () => {
            const state = createPropertyPanelState();
            const block = createMockCanvasBlock();

            selectBlockForEdit(state, block);

            expect(state.selectedBlock).toBe(block);
        });

        it('Test 9: should set feature data when provided', () => {
            const state = createPropertyPanelState();
            const block = createMockCanvasBlock();
            const feature = createMockFeatureBlock();

            selectBlockForEdit(state, block, feature);

            expect(state.featureData).toBe(feature);
        });

        it('Test 10: should set feature data to null when not provided', () => {
            const state = createPropertyPanelState();
            const block = createMockCanvasBlock();

            selectBlockForEdit(state, block);

            expect(state.featureData).toBeNull();
        });

        it('Test 11: should replace previous selection', () => {
            const state = createPropertyPanelState();
            const block1 = createMockCanvasBlock({ id: 'block-1' });
            const block2 = createMockCanvasBlock({ id: 'block-2' });

            selectBlockForEdit(state, block1);
            selectBlockForEdit(state, block2);

            expect(state.selectedBlock).toBe(block2);
        });
    });

    // ========================================================================
    // clearPropertySelection Tests
    // ========================================================================

    describe('clearPropertySelection', () => {
        it('Test 12: should clear selected block', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock();

            clearPropertySelection(state);

            expect(state.selectedBlock).toBeNull();
        });

        it('Test 13: should clear feature data', () => {
            const state = createPropertyPanelState();
            state.featureData = createMockFeatureBlock();

            clearPropertySelection(state);

            expect(state.featureData).toBeNull();
        });

        it('Test 14: should not affect visibility', () => {
            const state = createPropertyPanelState();
            state.isVisible = true;

            clearPropertySelection(state);

            expect(state.isVisible).toBe(true);
        });

        it('Test 15: should not affect expanded sections', () => {
            const state = createPropertyPanelState();
            state.expandedSections.add('advanced');

            clearPropertySelection(state);

            expect(state.expandedSections.has('advanced')).toBe(true);
        });
    });

    // ========================================================================
    // toggleSection Tests
    // ========================================================================

    describe('toggleSection', () => {
        it('Test 16: should expand a collapsed section', () => {
            const state = createPropertyPanelState();
            state.expandedSections.clear();

            toggleSection(state, 'basic');

            expect(state.expandedSections.has('basic')).toBe(true);
        });

        it('Test 17: should collapse an expanded section', () => {
            const state = createPropertyPanelState();
            state.expandedSections.add('basic');

            toggleSection(state, 'basic');

            expect(state.expandedSections.has('basic')).toBe(false);
        });

        it('Test 18: should handle connections section', () => {
            const state = createPropertyPanelState();

            toggleSection(state, 'connections');

            expect(state.expandedSections.has('connections')).toBe(true);
        });

        it('Test 19: should handle advanced section', () => {
            const state = createPropertyPanelState();

            toggleSection(state, 'advanced');
            toggleSection(state, 'advanced');

            expect(state.expandedSections.has('advanced')).toBe(false);
        });
    });

    // ========================================================================
    // renderPropertyPanel Tests
    // ========================================================================

    describe('renderPropertyPanel', () => {
        it('Test 20: should render collapsed panel when not visible', () => {
            const state = createPropertyPanelState();
            state.isVisible = false;

            const html = renderPropertyPanel(state);

            expect(html).toContain('collapsed');
            expect(html).toContain('expand-btn');
        });

        it('Test 21: should render empty panel when no block selected', () => {
            const state = createPropertyPanelState();

            const html = renderPropertyPanel(state);

            expect(html).toContain('Select a block');
        });

        it('Test 22: should render panel header', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock();

            const html = renderPropertyPanel(state);

            expect(html).toContain('Properties');
            expect(html).toContain('panel-header');
        });

        it('Test 23: should render basic section', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ name: 'My Block' });

            const html = renderPropertyPanel(state);

            expect(html).toContain('Basic Info');
            expect(html).toContain('My Block');
        });

        it('Test 24: should render block name input', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ name: 'Test Name' });

            const html = renderPropertyPanel(state);

            expect(html).toContain('blockName');
            expect(html).toContain('Test Name');
        });

        it('Test 25: should render type selector', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ type: 'feature' });

            const html = renderPropertyPanel(state);

            expect(html).toContain('blockType');
            expect(html).toContain('Feature');
            expect(html).toContain('Milestone');
            expect(html).toContain('Note');
        });

        it('Test 26: should render priority selector', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ priority: 'high' });

            const html = renderPropertyPanel(state);

            expect(html).toContain('blockPriority');
            expect(html).toContain('critical');
            expect(html).toContain('high');
            expect(html).toContain('medium');
            expect(html).toContain('low');
        });

        it('Test 27: should render position inputs', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ position: { x: 150, y: 300 } });

            const html = renderPropertyPanel(state);

            expect(html).toContain('blockX');
            expect(html).toContain('blockY');
            expect(html).toContain('150');
            expect(html).toContain('300');
        });

        it('Test 28: should render delete button', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock();

            const html = renderPropertyPanel(state);

            expect(html).toContain('deleteSelectedBlock');
            expect(html).toContain('Delete Block');
        });

        it('Test 29: should escape HTML in block name', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ name: '<script>alert("XSS")</script>' });

            const html = renderPropertyPanel(state);

            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script');
        });

        it('Test 30: should render expanded sections', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock();
            state.expandedSections.add('basic');

            const html = renderPropertyPanel(state);

            expect(html).toContain('expanded');
        });

        it('Test 31: should handle collapsed sections', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock();
            state.expandedSections.clear();

            const html = renderPropertyPanel(state);

            // Section headers should still be present
            expect(html).toContain('Basic Info');
        });
    });

    // ========================================================================
    // renderBlockConnections Tests
    // ========================================================================

    describe('renderBlockConnections', () => {
        it('Test 32: should render no connections message when empty', () => {
            const html = renderBlockConnections('block-1', [], []);

            expect(html).toContain('No connections');
        });

        it('Test 33: should render outgoing connections', () => {
            const outgoing = [
                { targetId: 'block-2', targetName: 'Target Block', type: 'depends_on' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', [], outgoing);

            expect(html).toContain('Outgoing');
            expect(html).toContain('Target Block');
            expect(html).toContain('depends_on');
        });

        it('Test 34: should render incoming connections', () => {
            const incoming = [
                { sourceId: 'block-0', sourceName: 'Source Block', type: 'blocks' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', incoming, []);

            expect(html).toContain('Incoming');
            expect(html).toContain('Source Block');
            expect(html).toContain('blocks');
        });

        it('Test 35: should render both incoming and outgoing', () => {
            const incoming = [
                { sourceId: 'block-0', sourceName: 'Source', type: 'depends_on' as DependencyType },
            ];
            const outgoing = [
                { targetId: 'block-2', targetName: 'Target', type: 'blocks' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', incoming, outgoing);

            expect(html).toContain('Incoming');
            expect(html).toContain('Outgoing');
        });

        it('Test 36: should include remove connection button', () => {
            const outgoing = [
                { targetId: 'block-2', targetName: 'Target', type: 'depends_on' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', [], outgoing);

            expect(html).toContain('removeConnection');
        });

        it('Test 37: should escape HTML in connection names', () => {
            const outgoing = [
                { targetId: 'block-2', targetName: '<b>Bad</b>', type: 'depends_on' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', [], outgoing);

            expect(html).not.toContain('<b>Bad</b>');
            expect(html).toContain('&lt;b');
        });

        it('Test 38: should render multiple connections', () => {
            const outgoing = [
                { targetId: 'block-2', targetName: 'Target 1', type: 'depends_on' as DependencyType },
                { targetId: 'block-3', targetName: 'Target 2', type: 'blocks' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', [], outgoing);

            expect(html).toContain('Target 1');
            expect(html).toContain('Target 2');
        });

        it('Test 39: should apply connection type class', () => {
            const outgoing = [
                { targetId: 'block-2', targetName: 'Target', type: 'depends_on' as DependencyType },
            ];

            const html = renderBlockConnections('block-1', [], outgoing);

            expect(html).toContain('class="connection-item outgoing depends_on"');
        });
    });

    // ========================================================================
    // getPropertyPanelStyles Tests
    // ========================================================================

    describe('getPropertyPanelStyles', () => {
        it('Test 40: should return CSS string', () => {
            const styles = getPropertyPanelStyles();

            expect(typeof styles).toBe('string');
            expect(styles.length).toBeGreaterThan(100);
        });

        it('Test 41: should include property panel styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('.property-panel');
        });

        it('Test 42: should include collapsed state styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('collapsed');
        });

        it('Test 43: should use VS Code theme variables', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('--vscode-');
        });

        it('Test 44: should include section styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('property-section');
        });

        it('Test 45: should include input styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('input');
        });

        it('Test 46: should include button styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('btn-');
        });

        it('Test 47: should include connection styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('connection');
        });

        it('Test 48: should include priority preview styles', () => {
            const styles = getPropertyPanelStyles();

            expect(styles).toContain('priority-preview');
        });
    });

    // ========================================================================
    // getPropertyPanelScript Tests
    // ========================================================================

    describe('getPropertyPanelScript', () => {
        it('Test 49: should return JavaScript string', () => {
            const script = getPropertyPanelScript();

            expect(typeof script).toBe('string');
            expect(script.length).toBeGreaterThan(100);
        });

        it('Test 50: should include togglePropertyPanel function', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('togglePropertyPanel');
        });

        it('Test 51: should include togglePropertySection function', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('togglePropertySection');
        });

        it('Test 52: should include updateBlockProperty function', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('updateBlockProperty');
        });

        it('Test 53: should include deleteSelectedBlock function', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('deleteSelectedBlock');
        });

        it('Test 54: should include removeConnection function', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('removeConnection');
        });

        it('Test 55: should include startNewConnection function', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('startNewConnection');
        });

        it('Test 56: should use VS Code API for messaging', () => {
            const script = getPropertyPanelScript();

            expect(script).toContain('vscode');
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('Test 57: should handle block with empty name', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ name: '' });

            const html = renderPropertyPanel(state);

            expect(html).toBeDefined();
        });

        it('Test 58: should handle very long block names', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ name: 'A'.repeat(500) });

            const html = renderPropertyPanel(state);

            expect(html).toContain('A'.repeat(100)); // Should contain part of long name
        });

        it('Test 59: should handle negative position values', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ position: { x: -100, y: -50 } });

            const html = renderPropertyPanel(state);

            expect(html).toContain('-100');
            expect(html).toContain('-50');
        });

        it('Test 60: should handle fractional position values', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ position: { x: 100.7, y: 200.3 } });

            const html = renderPropertyPanel(state);

            // Positions should be rounded
            expect(html).toContain('101');
            expect(html).toContain('200');
        });

        it('Test 61: should handle unicode in block names', () => {
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock({ name: '日本語 🚀 Feature' });

            const html = renderPropertyPanel(state);

            expect(html).toContain('日本語');
            expect(html).toContain('🚀');
        });

        it('Test 62: should handle special characters in IDs', () => {
            const incoming = [
                { sourceId: 'block-with-special_chars.123', sourceName: 'Source', type: 'depends_on' as DependencyType },
            ];

            const html = renderBlockConnections('my-block_1', incoming, []);

            expect(html).toContain('block-with-special_chars.123');
        });
    });

    // ========================================================================
    // Integration-like Tests
    // ========================================================================

    describe('integration', () => {
        it('Test 63: should maintain section state after selection change', () => {
            const state = createPropertyPanelState();
            const block1 = createMockCanvasBlock({ id: 'block-1' });
            const block2 = createMockCanvasBlock({ id: 'block-2' });

            selectBlockForEdit(state, block1);
            toggleSection(state, 'advanced');
            selectBlockForEdit(state, block2);

            // Section state should be preserved
            expect(state.expandedSections.has('advanced')).toBe(true);
        });

        it('Test 64: should render full panel with feature data', () => {
            const state = createPropertyPanelState();
            const block = createMockCanvasBlock({ name: 'Full Feature' });
            const feature = createMockFeatureBlock({
                description: 'Full feature description',
                acceptanceCriteria: ['AC 1', 'AC 2', 'AC 3'],
            });

            selectBlockForEdit(state, block, feature);
            const html = renderPropertyPanel(state);

            expect(html).toContain('Full Feature');
            expect(html).toContain('Properties');
        });

        it('Test 65: should combine all render functions correctly', () => {
            const styles = getPropertyPanelStyles();
            const script = getPropertyPanelScript();
            const state = createPropertyPanelState();
            state.selectedBlock = createMockCanvasBlock();
            const html = renderPropertyPanel(state);

            // All parts should be non-empty
            expect(styles.length).toBeGreaterThan(0);
            expect(script.length).toBeGreaterThan(0);
            expect(html.length).toBeGreaterThan(0);

            // Styles should match classes used in HTML
            expect(styles).toContain('property-panel');
            expect(html).toContain('property-panel');
        });
    });
});
