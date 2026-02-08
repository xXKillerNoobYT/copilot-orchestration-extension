/**
 * Tests for Planning Wizard Integration
 *
 * Tests the integration layer that connects all planning components.
 * Focus areas: message handling, state management, mode switching, rendering.
 */

import * as vscode from 'vscode';
import {
    WizardIntegration,
    MessageHandler,
    createWizardIntegration,
    MESSAGE_HANDLERS,
    processMessage,
    getCompleteStyles,
    getCompleteScripts,
    renderToolbar,
    renderSidebar,
} from '../../src/ui/planningWizardIntegration';
import { CompletePlan, FeatureBlock, WizardPage } from '../../src/planning/types';

// Mock dependencies
jest.mock('../../src/planning/schema', () => ({
    validatePlan: jest.fn(() => ({ valid: true, errors: [] })),
}));

jest.mock('../../src/planning/orchestratorIntegration', () => ({
    submitPlanToOrchestrator: jest.fn(() => ({ success: true, executionPlan: { tasks: [], status: 'pending' } })),
    calculateProgress: jest.fn(() => ({ completed: 0, total: 0, percentage: 0 })),
    renderProgressSummary: jest.fn(() => '<div class="progress">Progress</div>'),
}));

jest.mock('../../src/planning/errorHandler', () => ({
    getErrorHandler: jest.fn(() => ({
        getErrors: jest.fn(() => []),
        addError: jest.fn(),
        attemptAutoFix: jest.fn(),
        attemptAutoFixAll: jest.fn(),
    })),
    validatePlanWithErrors: jest.fn(),
    renderErrorList: jest.fn(() => ''),
    getErrorStyles: jest.fn(() => '.error {}'),
}));

jest.mock('../../src/planning/driftDetection', () => ({
    detectDrift: jest.fn(() => ({ hasDrift: false })),
    renderDriftReport: jest.fn(() => ''),
    getDriftStyles: jest.fn(() => '.drift {}'),
}));

jest.mock('../../src/planning/documentationSync', () => ({
    generateDocumentation: jest.fn(() => []),
    renderSyncStatus: jest.fn(() => ''),
}));

jest.mock('../../src/ui/detailedTextBox', () => ({
    renderDetailedTextBox: jest.fn(() => '<div class="textbox"></div>'),
    getDetailedTextBoxStyles: jest.fn(() => '.textbox {}'),
    getDetailedTextBoxScript: jest.fn(() => '// textbox script'),
}));

jest.mock('../../src/ui/planTemplates', () => ({
    renderTemplateSelector: jest.fn(() => '<div class="templates"></div>'),
    getTemplateSelectorStyles: jest.fn(() => '.templates {}'),
}));

jest.mock('../../src/ui/planExport', () => ({
    exportPlan: jest.fn(() => 'exported content'),
    renderExportDropdown: jest.fn(() => '<div class="export"></div>'),
}));

jest.mock('../../src/ui/dependencyGraph', () => ({
    renderDependencyGraphPanel: jest.fn(() => '<svg></svg>'),
    getDependencyGraphStyles: jest.fn(() => '.graph {}'),
}));

jest.mock('../../src/ui/planValidator', () => ({
    validatePlan: jest.fn(() => ({ valid: true, issues: [], counts: { errors: 0, warnings: 0, suggestions: 0 } })),
    renderValidationPanel: jest.fn(() => '<div class="validation"></div>'),
    getValidationPanelStyles: jest.fn(() => '.validation {}'),
}));

jest.mock('../../src/ui/planCollaboration', () => ({
    getCollaborationStyles: jest.fn(() => '.collab {}'),
    getCollaborationScript: jest.fn(() => '// collab script'),
    createCollaborationData: jest.fn(() => ({})),
}));

jest.mock('../../src/ui/planVersioning', () => ({
    createVersioningState: jest.fn(() => ({ versions: [], historyLimit: 50 })),
    renderVersionHistoryPanel: jest.fn(() => '<div class="versions"></div>'),
    getVersioningStyles: jest.fn(() => '.versioning {}'),
    getVersion: jest.fn(() => null),
}));

jest.mock('../../src/ui/planAnalytics', () => ({
    renderAnalyticsDashboard: jest.fn(() => '<div class="analytics"></div>'),
    getAnalyticsStyles: jest.fn(() => '.analytics {}'),
}));

jest.mock('../../src/ui/aiSuggestions', () => ({
    generateSuggestions: jest.fn(() => []),
    renderSuggestionsPanel: jest.fn(() => '<div class="suggestions"></div>'),
    getSuggestionsStyles: jest.fn(() => '.suggestions {}'),
}));

jest.mock('../../src/ui/planHealth', () => ({
    calculateHealthScore: jest.fn(() => ({ score: 85, grade: 'B', breakdown: {} })),
    renderHealthPanel: jest.fn(() => '<div class="health"></div>'),
    getHealthStyles: jest.fn(() => '.health {}'),
}));

jest.mock('../../src/ui/blockCanvas', () => ({
    renderCanvas: jest.fn(() => '<div class="canvas"></div>'),
    getCanvasStyles: jest.fn(() => '.canvas {}'),
    getCanvasScript: jest.fn(() => '// canvas script'),
    createCanvasState: jest.fn(() => ({
        blocks: [],
        connections: [],
        zoom: 1,
        pan: { x: 0, y: 0 },
        selectedBlockIds: [],
        selectedConnectionIds: [],
        gridSnap: true,
        gridSize: 20,
        connectionMode: null,
    })),
}));

jest.mock('../../src/ui/dragDropHandlers', () => ({
    createDragState: jest.fn(() => ({ isDragging: false })),
}));

jest.mock('../../src/ui/blockPropertyPanel', () => ({
    renderPropertyPanel: jest.fn(() => '<div class="property-panel"></div>'),
    getPropertyPanelStyles: jest.fn(() => '.property-panel {}'),
    getPropertyPanelScript: jest.fn(() => '// property panel script'),
    createPropertyPanelState: jest.fn(() => ({ selectedBlockId: null, expandedSections: [] })),
}));

jest.mock('../../src/ui/canvasToPlan', () => ({
    convertCanvasToPlan: jest.fn(() => ({ success: true, plan: {} })),
    convertPlanToCanvas: jest.fn(() => ({
        blocks: [],
        connections: [],
        zoom: 1,
        pan: { x: 0, y: 0 },
        selectedBlockIds: [],
        selectedConnectionIds: [],
        gridSnap: true,
        gridSize: 20,
        connectionMode: null,
    })),
    mergeCanvasIntoPlan: jest.fn(() => ({ success: true, plan: {} })),
}));

import { getErrorHandler, validatePlanWithErrors } from '../../src/planning/errorHandler';
import { submitPlanToOrchestrator } from '../../src/planning/orchestratorIntegration';
import { generateDocumentation } from '../../src/planning/documentationSync';
import { exportPlan } from '../../src/ui/planExport';
import { convertCanvasToPlan, convertPlanToCanvas } from '../../src/ui/canvasToPlan';
import { getVersion } from '../../src/ui/planVersioning';
import { calculateHealthScore } from '../../src/ui/planHealth';
import { validatePlan } from '../../src/ui/planValidator';

describe('PlanningWizardIntegration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createWizardIntegration', () => {
        it('Test 1: should create initial wizard integration', () => {
            const integration = createWizardIntegration();

            expect(integration).toBeDefined();
            expect(integration.state).toBeDefined();
            expect(integration.plan).toBeDefined();
            expect(integration.canvasState).toBeDefined();
        });

        it('Test 2: should start in wizard mode', () => {
            const integration = createWizardIntegration();

            expect(integration.mode).toBe('wizard');
        });

        it('Test 3: should start on overview page', () => {
            const integration = createWizardIntegration();

            expect(integration.state.currentPage).toBe('overview');
        });

        it('Test 4: should start with isDirty=false', () => {
            const integration = createWizardIntegration();

            expect(integration.state.isDirty).toBe(false);
        });

        it('Test 5: should initialize plan with metadata', () => {
            const integration = createWizardIntegration();

            expect(integration.plan.metadata).toBeDefined();
            expect(integration.plan.metadata.id).toBeDefined();
            expect(integration.plan.metadata.name).toBe('New Plan');
            expect(integration.plan.metadata.version).toBe(1);
        });

        it('Test 6: should initialize plan with empty arrays', () => {
            const integration = createWizardIntegration();

            expect(integration.plan.featureBlocks).toEqual([]);
            expect(integration.plan.blockLinks).toEqual([]);
            expect(integration.plan.userStories).toEqual([]);
            expect(integration.plan.developerStories).toEqual([]);
        });

        it('Test 7: should initialize error handler', () => {
            const integration = createWizardIntegration();

            expect(integration.errorHandler).toBeDefined();
            expect(getErrorHandler).toHaveBeenCalled();
        });

        it('Test 8: should initialize versioning state', () => {
            const integration = createWizardIntegration();

            expect(integration.versioningState).toBeDefined();
        });

        it('Test 9: should initialize property panel state', () => {
            const integration = createWizardIntegration();

            expect(integration.propertyPanelState).toBeDefined();
        });

        it('Test 10: should create unique plan IDs', () => {
            const integration1 = createWizardIntegration();
            const integration2 = createWizardIntegration();

            expect(integration1.plan.metadata.id).not.toBe(integration2.plan.metadata.id);
        });
    });

    describe('MESSAGE_HANDLERS', () => {
        it('Test 11: should have handlers for navigation', () => {
            const types = MESSAGE_HANDLERS.map(h => h.type);

            expect(types).toContain('nextPage');
            expect(types).toContain('prevPage');
            expect(types).toContain('goToPage');
        });

        it('Test 12: should have handlers for plan updates', () => {
            const types = MESSAGE_HANDLERS.map(h => h.type);

            expect(types).toContain('updateOverview');
            expect(types).toContain('addFeature');
            expect(types).toContain('updateFeature');
            expect(types).toContain('deleteFeature');
        });

        it('Test 13: should have handlers for validation', () => {
            const types = MESSAGE_HANDLERS.map(h => h.type);

            expect(types).toContain('validate');
            expect(types).toContain('autoFix');
            expect(types).toContain('autoFixAll');
        });

        it('Test 14: should have handlers for export', () => {
            const types = MESSAGE_HANDLERS.map(h => h.type);

            expect(types).toContain('export');
        });

        it('Test 15: should have handlers for mode switching', () => {
            const types = MESSAGE_HANDLERS.map(h => h.type);

            expect(types).toContain('switchToCanvas');
            expect(types).toContain('switchToWizard');
        });
    });

    describe('processMessage - Navigation', () => {
        it('Test 16: should handle nextPage message', () => {
            const integration = createWizardIntegration();
            integration.state.currentPage = 'overview';

            processMessage({ type: 'nextPage' }, integration);

            expect(integration.state.currentPage).toBe('features');
        });

        it('Test 17: should handle prevPage message', () => {
            const integration = createWizardIntegration();
            integration.state.currentPage = 'features';

            processMessage({ type: 'prevPage' }, integration);

            expect(integration.state.currentPage).toBe('overview');
        });

        it('Test 18: should not go before first page', () => {
            const integration = createWizardIntegration();
            integration.state.currentPage = 'overview';

            processMessage({ type: 'prevPage' }, integration);

            expect(integration.state.currentPage).toBe('overview');
        });

        it('Test 19: should not go after last page', () => {
            const integration = createWizardIntegration();
            integration.state.currentPage = 'review';

            processMessage({ type: 'nextPage' }, integration);

            expect(integration.state.currentPage).toBe('review');
        });

        it('Test 20: should handle goToPage message', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'goToPage', page: 'criteria' }, integration);

            expect(integration.state.currentPage).toBe('criteria');
        });

        it('Test 21: should ignore invalid page in goToPage', () => {
            const integration = createWizardIntegration();
            integration.state.currentPage = 'overview';

            processMessage({ type: 'goToPage', page: 'invalid' }, integration);

            expect(integration.state.currentPage).toBe('overview');
        });
    });

    describe('processMessage - Plan Updates', () => {
        it('Test 22: should handle updateOverview message', () => {
            const integration = createWizardIntegration();

            processMessage({
                type: 'updateOverview',
                updates: { name: 'My Plan', description: 'A test plan' },
            }, integration);

            expect(integration.plan.overview.name).toBe('My Plan');
            expect(integration.plan.overview.description).toBe('A test plan');
            expect(integration.state.isDirty).toBe(true);
        });

        it('Test 23: should handle addFeature message', () => {
            const integration = createWizardIntegration();
            const feature: FeatureBlock = {
                id: 'feature-1',
                name: 'Test Feature',
                description: 'A test feature',
                purpose: 'Testing',
                acceptanceCriteria: [],
                technicalNotes: '',
                priority: 'high',
                order: 1,
            };

            processMessage({ type: 'addFeature', feature }, integration);

            expect(integration.plan.featureBlocks).toHaveLength(1);
            expect(integration.plan.featureBlocks[0].id).toBe('feature-1');
            expect(integration.state.isDirty).toBe(true);
        });

        it('Test 24: should handle updateFeature message', () => {
            const integration = createWizardIntegration();
            integration.plan.featureBlocks = [{
                id: 'feature-1',
                name: 'Original',
                description: '',
                purpose: '',
                acceptanceCriteria: [],
                technicalNotes: '',
                priority: 'low',
                order: 1,
            }];

            processMessage({
                type: 'updateFeature',
                feature: { id: 'feature-1', name: 'Updated', description: '', purpose: '', acceptanceCriteria: [], technicalNotes: '', priority: 'high', order: 1 },
            }, integration);

            expect(integration.plan.featureBlocks[0].name).toBe('Updated');
            expect(integration.plan.featureBlocks[0].priority).toBe('high');
        });

        it('Test 25: should not update non-existent feature', () => {
            const integration = createWizardIntegration();
            integration.state.isDirty = false;

            processMessage({
                type: 'updateFeature',
                feature: { id: 'non-existent', name: 'Test', description: '', purpose: '', acceptanceCriteria: [], technicalNotes: '', priority: 'low', order: 1 },
            }, integration);

            expect(integration.state.isDirty).toBe(false);
        });

        it('Test 26: should handle deleteFeature message', () => {
            const integration = createWizardIntegration();
            integration.plan.featureBlocks = [
                { id: 'feature-1', name: 'F1', description: '', purpose: '', acceptanceCriteria: [], technicalNotes: '', priority: 'low', order: 1 },
                { id: 'feature-2', name: 'F2', description: '', purpose: '', acceptanceCriteria: [], technicalNotes: '', priority: 'low', order: 2 },
            ];

            processMessage({ type: 'deleteFeature', featureId: 'feature-1' }, integration);

            expect(integration.plan.featureBlocks).toHaveLength(1);
            expect(integration.plan.featureBlocks[0].id).toBe('feature-2');
        });

        it('Test 27: should delete related block links when deleting feature', () => {
            const integration = createWizardIntegration();
            integration.plan.featureBlocks = [
                { id: 'f1', name: 'F1', description: '', purpose: '', acceptanceCriteria: [], technicalNotes: '', priority: 'low', order: 1 },
            ];
            integration.plan.blockLinks = [
                { id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' },
                { id: 'link-2', sourceBlockId: 'f2', targetBlockId: 'f1', dependencyType: 'blocks' },
                { id: 'link-3', sourceBlockId: 'f2', targetBlockId: 'f3', dependencyType: 'suggests' },
            ];

            processMessage({ type: 'deleteFeature', featureId: 'f1' }, integration);

            expect(integration.plan.blockLinks).toHaveLength(1);
            expect(integration.plan.blockLinks[0].id).toBe('link-3');
        });
    });

    describe('processMessage - Validation', () => {
        it('Test 28: should handle validate message', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'validate' }, integration);

            expect(validatePlanWithErrors).toHaveBeenCalledWith(
                integration.plan,
                integration.errorHandler
            );
        });

        it('Test 29: should handle autoFix message', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'autoFix', errorId: 'error-1' }, integration);

            expect(integration.errorHandler.attemptAutoFix).toHaveBeenCalledWith(
                'error-1',
                integration.plan
            );
        });

        it('Test 30: should handle autoFixAll message', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'autoFixAll' }, integration);

            expect(integration.errorHandler.attemptAutoFixAll).toHaveBeenCalledWith(
                integration.plan
            );
        });
    });

    describe('processMessage - Export', () => {
        it('Test 31: should handle export message with json format', async () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'export', format: 'json' }, integration);

            expect(exportPlan).toHaveBeenCalledWith(
                integration.plan,
                { format: 'json' }
            );
        });

        it('Test 32: should handle export message with markdown format', async () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'export', format: 'markdown' }, integration);

            expect(exportPlan).toHaveBeenCalledWith(
                integration.plan,
                { format: 'markdown' }
            );
        });
    });

    describe('processMessage - Mode Switching', () => {
        it('Test 33: should handle switchToCanvas message', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'switchToCanvas' }, integration);

            expect(integration.mode).toBe('canvas');
            expect(convertPlanToCanvas).toHaveBeenCalledWith(integration.plan);
        });

        it('Test 34: should handle switchToWizard message', () => {
            const integration = createWizardIntegration();
            integration.mode = 'canvas';
            (convertCanvasToPlan as jest.Mock).mockReturnValue({
                success: true,
                plan: { ...integration.plan, overview: { name: 'From Canvas' } },
            });

            processMessage({ type: 'switchToWizard' }, integration);

            expect(integration.mode).toBe('wizard');
        });

        it('Test 35: should convert canvas to plan when switching to wizard', () => {
            const integration = createWizardIntegration();
            integration.mode = 'canvas';
            integration.canvasState = { blocks: [], connections: [], zoom: 1, pan: { x: 0, y: 0 }, selectedBlockIds: [], selectedConnectionIds: [], gridSnap: true, gridSize: 20, connectionMode: null };

            processMessage({ type: 'switchToWizard' }, integration);

            expect(convertCanvasToPlan).toHaveBeenCalled();
        });
    });

    describe('processMessage - Versioning', () => {
        it('Test 36: should handle restoreVersion message', () => {
            const integration = createWizardIntegration();
            const restoredPlan = { ...integration.plan, overview: { ...integration.plan.overview, name: 'Restored' } };
            (getVersion as jest.Mock).mockReturnValue({ plan: restoredPlan });

            processMessage({ type: 'restoreVersion', versionId: 'v1' }, integration);

            expect(getVersion).toHaveBeenCalledWith(integration.versioningState, 'v1');
            expect(integration.plan.overview.name).toBe('Restored');
        });

        it('Test 37: should not restore if version not found', () => {
            const integration = createWizardIntegration();
            const originalName = integration.plan.overview.name;
            (getVersion as jest.Mock).mockReturnValue(null);

            processMessage({ type: 'restoreVersion', versionId: 'invalid' }, integration);

            expect(integration.plan.overview.name).toBe(originalName);
        });
    });

    describe('processMessage - Orchestrator', () => {
        it('Test 38: should handle submitToOrchestrator message', () => {
            const integration = createWizardIntegration();
            (submitPlanToOrchestrator as jest.Mock).mockReturnValue({
                success: true,
                executionPlan: { id: 'exec-1', tasks: [], status: 'pending' },
            });

            processMessage({ type: 'submitToOrchestrator', config: { parallel: true } }, integration);

            expect(submitPlanToOrchestrator).toHaveBeenCalledWith(
                integration.plan,
                { parallel: true }
            );
            expect(integration.executionPlan).toBeDefined();
        });

        it('Test 39: should handle submitToOrchestrator without config', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'submitToOrchestrator' }, integration);

            expect(submitPlanToOrchestrator).toHaveBeenCalledWith(
                integration.plan,
                {}
            );
        });
    });

    describe('processMessage - Documentation', () => {
        it('Test 40: should handle generateDocs message', () => {
            const integration = createWizardIntegration();

            processMessage({ type: 'generateDocs' }, integration);

            expect(generateDocumentation).toHaveBeenCalledWith(integration.plan);
        });
    });

    describe('processMessage - Unknown Type', () => {
        it('Test 41: should warn on unknown message type', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const integration = createWizardIntegration();

            processMessage({ type: 'unknownType' }, integration);

            expect(consoleSpy).toHaveBeenCalledWith('Unknown message type: unknownType');
            consoleSpy.mockRestore();
        });
    });

    describe('getCompleteStyles', () => {
        it('Test 42: should return combined CSS styles', () => {
            const styles = getCompleteStyles();

            expect(styles).toContain('.textbox');
            expect(styles).toContain('.templates');
            expect(styles).toContain('.canvas');
            expect(styles).toContain('.property-panel');
        });

        it('Test 43: should include integration-specific styles', () => {
            const styles = getCompleteStyles();

            expect(styles).toContain('.wizard-integration');
            expect(styles).toContain('.wizard-toolbar');
            expect(styles).toContain('.mode-indicator');
        });

        it('Test 44: should include split-view styles', () => {
            const styles = getCompleteStyles();

            expect(styles).toContain('.split-view');
            expect(styles).toContain('grid-template-columns');
        });
    });

    describe('getCompleteScripts', () => {
        it('Test 45: should return combined JavaScript', () => {
            const scripts = getCompleteScripts();

            expect(scripts).toContain('textbox script');
            expect(scripts).toContain('canvas script');
            expect(scripts).toContain('property panel script');
        });

        it('Test 46: should include navigation functions', () => {
            const scripts = getCompleteScripts();

            expect(scripts).toContain('function nextPage()');
            expect(scripts).toContain('function prevPage()');
            expect(scripts).toContain('function goToPage(page)');
        });

        it('Test 47: should include mode switching functions', () => {
            const scripts = getCompleteScripts();

            expect(scripts).toContain('function switchToCanvas()');
            expect(scripts).toContain('function switchToWizard()');
        });

        it('Test 48: should include validation functions', () => {
            const scripts = getCompleteScripts();

            expect(scripts).toContain('function validatePlan()');
            expect(scripts).toContain('function fixError(errorId)');
            expect(scripts).toContain('function fixAllErrors()');
        });

        it('Test 49: should include feature management functions', () => {
            const scripts = getCompleteScripts();

            expect(scripts).toContain('function addFeature(feature)');
            expect(scripts).toContain('function updateFeature(feature)');
            expect(scripts).toContain('function deleteFeature(featureId)');
        });

        it('Test 50: should include message event listener', () => {
            const scripts = getCompleteScripts();

            expect(scripts).toContain("window.addEventListener('message'");
        });
    });

    describe('renderToolbar', () => {
        it('Test 51: should render toolbar container', () => {
            const integration = createWizardIntegration();

            const html = renderToolbar(integration);

            expect(html).toContain('class="wizard-toolbar"');
        });

        it('Test 52: should render mode buttons', () => {
            const integration = createWizardIntegration();

            const html = renderToolbar(integration);

            expect(html).toContain('onclick="switchToWizard()"');
            expect(html).toContain('onclick="switchToCanvas()"');
        });

        it('Test 53: should disable wizard button in wizard mode', () => {
            const integration = createWizardIntegration();
            integration.mode = 'wizard';

            const html = renderToolbar(integration);

            expect(html).toMatch(/onclick="switchToWizard\(\)"[^>]*disabled/);
        });

        it('Test 54: should disable canvas button in canvas mode', () => {
            const integration = createWizardIntegration();
            integration.mode = 'canvas';

            const html = renderToolbar(integration);

            expect(html).toMatch(/onclick="switchToCanvas\(\)"[^>]*disabled/);
        });

        it('Test 55: should show validate button', () => {
            const integration = createWizardIntegration();

            const html = renderToolbar(integration);

            expect(html).toContain('onclick="validatePlan()"');
            expect(html).toContain('Validate');
        });

        it('Test 56: should show generate docs button', () => {
            const integration = createWizardIntegration();

            const html = renderToolbar(integration);

            expect(html).toContain('onclick="generateDocumentation()"');
            expect(html).toContain('Generate Docs');
        });

        it('Test 57: should display mode indicator with wizard mode', () => {
            const integration = createWizardIntegration();
            integration.mode = 'wizard';

            const html = renderToolbar(integration);

            expect(html).toContain('Wizard Mode');
        });

        it('Test 58: should display mode indicator with canvas mode', () => {
            const integration = createWizardIntegration();
            integration.mode = 'canvas';

            const html = renderToolbar(integration);

            expect(html).toContain('Canvas Mode');
        });
    });

    describe('renderSidebar', () => {
        it('Test 59: should render sidebar container', () => {
            const integration = createWizardIntegration();

            const html = renderSidebar(integration);

            expect(html).toContain('class="sidebar"');
        });

        it('Test 60: should render health section', () => {
            const integration = createWizardIntegration();

            const html = renderSidebar(integration);

            expect(html).toContain('Health');
            expect(calculateHealthScore).toHaveBeenCalledWith(integration.plan);
        });

        it('Test 61: should display health score', () => {
            const integration = createWizardIntegration();
            (calculateHealthScore as jest.Mock).mockReturnValue({ score: 85, grade: 'B' });

            const html = renderSidebar(integration);

            expect(html).toContain('85');
            expect(html).toContain('B');
        });

        it('Test 62: should render issues section', () => {
            const integration = createWizardIntegration();

            const html = renderSidebar(integration);

            expect(html).toContain('Issues');
        });

        it('Test 63: should show no issues message when no errors', () => {
            const integration = createWizardIntegration();
            integration.errorHandler.getErrors = jest.fn(() => []);

            const html = renderSidebar(integration);

            expect(html).toContain('No issues');
        });

        it('Test 64: should show error list when errors exist', () => {
            const integration = createWizardIntegration();
            integration.errorHandler.getErrors = jest.fn(() => [
                { id: 'e1', message: 'Error 1', severity: 'error' as const, code: 'MISSING_REQUIRED_FIELD' as const, suggestions: [], autoFixAvailable: false, timestamp: new Date().toISOString() },
                { id: 'e2', message: 'Error 2', severity: 'warning' as const, code: 'MISSING_REQUIRED_FIELD' as const, suggestions: [], autoFixAvailable: false, timestamp: new Date().toISOString() },
            ]);

            const html = renderSidebar(integration);

            expect(html).toContain('Error 1');
            expect(html).toContain('Error 2');
        });

        it('Test 65: should limit displayed errors to 3', () => {
            const integration = createWizardIntegration();
            integration.errorHandler.getErrors = jest.fn(() => [
                { id: 'e1', message: 'Error 1', severity: 'error' as const, code: 'MISSING_REQUIRED_FIELD' as const, suggestions: [], autoFixAvailable: false, timestamp: new Date().toISOString() },
                { id: 'e2', message: 'Error 2', severity: 'error' as const, code: 'MISSING_REQUIRED_FIELD' as const, suggestions: [], autoFixAvailable: false, timestamp: new Date().toISOString() },
                { id: 'e3', message: 'Error 3', severity: 'error' as const, code: 'MISSING_REQUIRED_FIELD' as const, suggestions: [], autoFixAvailable: false, timestamp: new Date().toISOString() },
                { id: 'e4', message: 'Error 4', severity: 'error' as const, code: 'MISSING_REQUIRED_FIELD' as const, suggestions: [], autoFixAvailable: false, timestamp: new Date().toISOString() },
            ]);

            const html = renderSidebar(integration);

            expect(html).toContain('+1 more');
        });

        it('Test 66: should render validation section', () => {
            const integration = createWizardIntegration();

            const html = renderSidebar(integration);

            expect(html).toContain('Validation');
            expect(validatePlan).toHaveBeenCalledWith(integration.plan);
        });

        it('Test 67: should show valid status when validation passes', () => {
            const integration = createWizardIntegration();
            (validatePlan as jest.Mock).mockReturnValue({ valid: true, counts: { errors: 0 } });

            const html = renderSidebar(integration);

            expect(html).toContain('Valid');
        });

        it('Test 68: should show error count when validation fails', () => {
            const integration = createWizardIntegration();
            (validatePlan as jest.Mock).mockReturnValue({ valid: false, counts: { errors: 3 } });

            const html = renderSidebar(integration);

            expect(html).toContain('3 errors');
        });

        it('Test 69: should show execution section when executionPlan exists', () => {
            const integration = createWizardIntegration();
            integration.executionPlan = { id: 'exec-1', tasks: [], status: 'running' } as any;

            const html = renderSidebar(integration);

            expect(html).toContain('Execution');
        });

        it('Test 70: should not show execution section when no executionPlan', () => {
            const integration = createWizardIntegration();
            integration.executionPlan = undefined;

            const html = renderSidebar(integration);

            // Should not contain execution section header (outside of other sections)
            expect(html.match(/<h4>Execution<\/h4>/g)).toBeNull();
        });
    });

    describe('Page Navigation Order', () => {
        it('Test 71: should follow correct page order for nextPage', () => {
            const integration = createWizardIntegration();
            const pages: WizardPage[] = [];

            pages.push(integration.state.currentPage);
            for (let i = 0; i < 7; i++) {
                processMessage({ type: 'nextPage' }, integration);
                pages.push(integration.state.currentPage);
            }

            expect(pages).toEqual([
                'overview',
                'features',
                'linking',
                'userStories',
                'devStories',
                'criteria',
                'review',
                'review', // Should not advance past review
            ]);
        });

        it('Test 72: should follow correct page order for prevPage', () => {
            const integration = createWizardIntegration();
            integration.state.currentPage = 'review';
            const pages: WizardPage[] = [];

            pages.push(integration.state.currentPage);
            for (let i = 0; i < 7; i++) {
                processMessage({ type: 'prevPage' }, integration);
                pages.push(integration.state.currentPage);
            }

            expect(pages).toEqual([
                'review',
                'criteria',
                'devStories',
                'userStories',
                'linking',
                'features',
                'overview',
                'overview', // Should not go before overview
            ]);
        });
    });

    describe('Edge Cases', () => {
        it('Test 73: should handle loadTemplate message', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const integration = createWizardIntegration();

            processMessage({ type: 'loadTemplate', templateId: 'template-1' }, integration);

            expect(consoleSpy).toHaveBeenCalledWith('Load template:', 'template-1');
            expect(integration.state.isDirty).toBe(true);
            consoleSpy.mockRestore();
        });

        it('Test 74: should handle canvasAction message', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const integration = createWizardIntegration();

            processMessage({ type: 'canvasAction', action: 'select', blockId: 'b1' }, integration);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('Test 75: should handle propertyUpdate message', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const integration = createWizardIntegration();

            processMessage({ type: 'propertyUpdate', property: 'name', value: 'New Name' }, integration);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});
