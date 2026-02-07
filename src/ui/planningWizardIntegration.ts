/**
 * Planning Wizard Integration (MT-033.47)
 *
 * **Simple explanation**: Connects all planning components to the wizard UI.
 * This is the glue that makes the planning wizard work end-to-end.
 *
 * @module ui/planningWizardIntegration
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { CompletePlan, WizardState, FeatureBlock, WizardPage, ProjectOverview } from '../planning/types';
import { validatePlan as validatePlanSchema } from '../planning/schema';
import { 
    submitPlanToOrchestrator, 
    ExecutionPlan, 
    calculateProgress,
    renderProgressSummary 
} from '../planning/orchestratorIntegration';
import { 
    getErrorHandler, 
    validatePlanWithErrors, 
    renderErrorList,
    getErrorStyles,
    PlanError 
} from '../planning/errorHandler';
import { 
    detectDrift, 
    renderDriftReport, 
    getDriftStyles,
    CodebaseMarkers,
    DriftReport 
} from '../planning/driftDetection';
import { 
    generateDocumentation, 
    renderSyncStatus,
    GeneratedDoc 
} from '../planning/documentationSync';

// Import UI components
import { renderDetailedTextBox, getDetailedTextBoxStyles, getDetailedTextBoxScript } from './detailedTextBox';
import { renderTemplateSelector, getTemplateSelectorStyles } from './planTemplates';
import { exportPlan, renderExportDropdown } from './planExport';
import { renderDependencyGraphPanel, getDependencyGraphStyles } from './dependencyGraph';
import { validatePlan, renderValidationPanel, getValidationPanelStyles, ValidationResult } from './planValidator';
import { getCollaborationStyles, getCollaborationScript, createCollaborationData } from './planCollaboration';
import { createVersioningState, renderVersionHistoryPanel, getVersioningStyles, getVersion } from './planVersioning';
import { renderAnalyticsDashboard, getAnalyticsStyles } from './planAnalytics';
import { generateSuggestions, renderSuggestionsPanel, getSuggestionsStyles } from './aiSuggestions';
import { calculateHealthScore, renderHealthPanel, getHealthStyles, HealthScore } from './planHealth';

// Import canvas components (for GUI layout designer)
import { renderCanvas, getCanvasStyles, getCanvasScript, CanvasState, CanvasBlock, createCanvasState } from './blockCanvas';
import { createDragState, DragState } from './dragDropHandlers';
import { renderPropertyPanel, getPropertyPanelStyles, getPropertyPanelScript, createPropertyPanelState } from './blockPropertyPanel';
import { convertCanvasToPlan, convertPlanToCanvas, mergeCanvasIntoPlan, ConversionResult } from './canvasToPlan';

// ============================================================================
// Types
// ============================================================================

import { VersioningState } from './planVersioning';
import { PropertyPanelState } from './blockPropertyPanel';

export interface WizardIntegration {
    /** Current wizard state */
    state: WizardState;
    /** Current plan being edited */
    plan: CompletePlan;
    /** Current execution plan (if submitted) */
    executionPlan?: ExecutionPlan;
    /** Canvas state (for GUI mode) */
    canvasState: CanvasState;
    /** Versioning state */
    versioningState: VersioningState;
    /** Property panel state */
    propertyPanelState: PropertyPanelState;
    /** Error handler */
    errorHandler: ReturnType<typeof getErrorHandler>;
    /** Current mode */
    mode: 'wizard' | 'canvas' | 'hybrid';
}

export interface MessageHandler {
    type: string;
    handler: (message: Record<string, unknown>, integration: WizardIntegration) => void | Promise<void>;
}

// ============================================================================
// Integration Factory
// ============================================================================

/**
 * Create a new wizard integration instance.
 */
export function createWizardIntegration(): WizardIntegration {
    const emptyPlan = createEmptyPlan();
    return {
        state: {
            currentPage: 'overview',
            plan: emptyPlan,
            isDirty: false,
        },
        plan: emptyPlan,
        canvasState: createCanvasState(),
        versioningState: createVersioningState(emptyPlan),
        propertyPanelState: createPropertyPanelState(),
        errorHandler: getErrorHandler(),
        mode: 'wizard',
    };
}

function createEmptyPlan(): CompletePlan {
    const now = new Date();
    return {
        metadata: {
            id: crypto.randomUUID(),
            name: 'New Plan',
            createdAt: now,
            updatedAt: now,
            version: 1,
        },
        overview: {
            name: '',
            description: '',
            goals: [],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        developerStories: [],
        userStories: [],
        successCriteria: [],
    };
}

// ============================================================================
// Message Handling
// ============================================================================

const PAGE_ORDER: WizardPage[] = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];

function nextPage(current: WizardPage): WizardPage {
    const idx = PAGE_ORDER.indexOf(current);
    return PAGE_ORDER[Math.min(idx + 1, PAGE_ORDER.length - 1)];
}

function prevPage(current: WizardPage): WizardPage {
    const idx = PAGE_ORDER.indexOf(current);
    return PAGE_ORDER[Math.max(idx - 1, 0)];
}

/**
 * All message handlers for the wizard webview.
 */
export const MESSAGE_HANDLERS: MessageHandler[] = [
    // Navigation
    {
        type: 'nextPage',
        handler: (_, integration) => {
            integration.state.currentPage = nextPage(integration.state.currentPage);
        },
    },
    {
        type: 'prevPage',
        handler: (_, integration) => {
            integration.state.currentPage = prevPage(integration.state.currentPage);
        },
    },
    {
        type: 'goToPage',
        handler: (message, integration) => {
            const page = message.page as WizardPage;
            if (PAGE_ORDER.includes(page)) {
                integration.state.currentPage = page;
            }
        },
    },

    // Plan updates
    {
        type: 'updateOverview',
        handler: (message, integration) => {
            const updates = message.updates as Partial<CompletePlan['overview']>;
            integration.plan.overview = { ...integration.plan.overview, ...updates };
            integration.state.isDirty = true;
        },
    },
    {
        type: 'addFeature',
        handler: (message, integration) => {
            const feature = message.feature as FeatureBlock;
            integration.plan.featureBlocks.push(feature);
            integration.state.isDirty = true;
        },
    },
    {
        type: 'updateFeature',
        handler: (message, integration) => {
            const feature = message.feature as FeatureBlock;
            const index = integration.plan.featureBlocks.findIndex(f => f.id === feature.id);
            if (index >= 0) {
                integration.plan.featureBlocks[index] = feature;
                integration.state.isDirty = true;
            }
        },
    },
    {
        type: 'deleteFeature',
        handler: (message, integration) => {
            const featureId = message.featureId as string;
            integration.plan.featureBlocks = integration.plan.featureBlocks.filter(f => f.id !== featureId);
            integration.plan.blockLinks = integration.plan.blockLinks.filter(
                l => l.sourceBlockId !== featureId && l.targetBlockId !== featureId
            );
            integration.state.isDirty = true;
        },
    },

    // Template handling
    {
        type: 'loadTemplate',
        handler: (message, integration) => {
            const templateId = message.templateId as string;
            // Template loading would be handled by the template service
            console.log('Load template:', templateId);
            integration.state.isDirty = true;
        },
    },

    // Validation
    {
        type: 'validate',
        handler: (_, integration) => {
            validatePlanWithErrors(integration.plan, integration.errorHandler);
        },
    },
    {
        type: 'autoFix',
        handler: (message, integration) => {
            const errorId = message.errorId as string;
            integration.errorHandler.attemptAutoFix(errorId, integration.plan);
        },
    },
    {
        type: 'autoFixAll',
        handler: (_, integration) => {
            integration.errorHandler.attemptAutoFixAll(integration.plan);
        },
    },

    // Export
    {
        type: 'export',
        handler: async (message, integration) => {
            const format = message.format as 'json' | 'markdown' | 'yaml';
            const result = exportPlan(integration.plan, { format });
            // In real implementation, would save to file or clipboard
            console.log(`Exported plan as ${format}:`, result);
        },
    },

    // Canvas mode
    {
        type: 'switchToCanvas',
        handler: (_, integration) => {
            integration.canvasState = convertPlanToCanvas(integration.plan);
            integration.mode = 'canvas';
        },
    },
    {
        type: 'switchToWizard',
        handler: (_, integration) => {
            if (integration.canvasState) {
                const result = convertCanvasToPlan(integration.canvasState, integration.plan);
                if (result.success && result.plan) {
                    integration.plan = result.plan;
                }
            }
            integration.mode = 'wizard';
        },
    },
    {
        type: 'canvasAction',
        handler: (message, _integration) => {
            // Canvas actions are handled via state updates
            console.log('Canvas action:', message);
        },
    },
    {
        type: 'propertyUpdate',
        handler: (message, _integration) => {
            // Property updates are handled via state updates
            console.log('Property update:', message);
        },
    },

    // Versioning
    {
        type: 'restoreVersion',
        handler: (message, integration) => {
            const versionId = message.versionId as string;
            const restored = getVersion(integration.versioningState, versionId);
            if (restored) {
                integration.plan = restored.plan;
            }
        },
    },

    // Orchestrator
    {
        type: 'submitToOrchestrator',
        handler: (message, integration) => {
            const config = message.config as Record<string, unknown> || {};
            const result = submitPlanToOrchestrator(integration.plan, config);
            if (result.success && result.executionPlan) {
                integration.executionPlan = result.executionPlan;
            }
        },
    },

    // Documentation
    {
        type: 'generateDocs',
        handler: (_, integration) => {
            const docs = generateDocumentation(integration.plan);
            // In real implementation, would save to file system
            console.log('Generated documentation:', docs);
        },
    },
];

/**
 * Process an incoming message from the webview.
 */
export function processMessage(
    message: Record<string, unknown>,
    integration: WizardIntegration
): void {
    const handler = MESSAGE_HANDLERS.find(h => h.type === message.type);
    if (handler) {
        handler.handler(message, integration);
    } else {
        console.warn(`Unknown message type: ${message.type}`);
    }
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Get complete CSS for the wizard.
 */
export function getCompleteStyles(): string {
    return `
    /* Base styles */
    ${getDetailedTextBoxStyles()}
    ${getTemplateSelectorStyles()}
    ${getDependencyGraphStyles()}
    ${getValidationPanelStyles()}
    ${getCollaborationStyles()}
    ${getVersioningStyles()}
    ${getAnalyticsStyles()}
    ${getSuggestionsStyles()}
    ${getHealthStyles()}
    ${getCanvasStyles()}
    ${getPropertyPanelStyles()}
    ${getErrorStyles()}
    ${getDriftStyles()}

    /* Integration-specific styles */
    .wizard-integration {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .wizard-toolbar {
      display: flex;
      gap: 8px;
      padding: 8px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-input-border);
    }

    .wizard-toolbar button {
      padding: 4px 12px;
      font-size: 12px;
    }

    .mode-indicator {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mode-indicator span {
      font-size: 11px;
      opacity: 0.7;
    }

    .wizard-content {
      flex: 1;
      overflow: auto;
    }

    .split-view {
      display: grid;
      grid-template-columns: 1fr 300px;
      height: 100%;
    }

    .split-view .main-content {
      overflow: auto;
      padding: 16px;
    }

    .split-view .sidebar {
      border-left: 1px solid var(--vscode-input-border);
      overflow: auto;
      padding: 12px;
      background: var(--vscode-sideBar-background);
    }
  `;
}

/**
 * Get complete JavaScript for the wizard.
 */
export function getCompleteScripts(): string {
    return `
    ${getDetailedTextBoxScript()}
    ${getCollaborationScript()}
    ${getCanvasScript()}
    ${getPropertyPanelScript()}
    
    const vscode = acquireVsCodeApi();

    function sendMessage(type, data = {}) {
      vscode.postMessage({ type, ...data });
    }

    // Navigation
    function nextPage() { sendMessage('nextPage'); }
    function prevPage() { sendMessage('prevPage'); }
    function goToPage(page) { sendMessage('goToPage', { page }); }

    // Mode switching
    function switchToCanvas() { sendMessage('switchToCanvas'); }
    function switchToWizard() { sendMessage('switchToWizard'); }

    // Validation
    function validatePlan() { sendMessage('validate'); }
    function fixError(errorId) { sendMessage('autoFix', { errorId }); }
    function fixAllErrors() { sendMessage('autoFixAll'); }

    // Export
    function exportPlan(format) { sendMessage('export', { format }); }

    // Templates
    function loadTemplate(templateId) { sendMessage('loadTemplate', { templateId }); }

    // Orchestrator
    function submitToOrchestrator(config) { sendMessage('submitToOrchestrator', { config }); }

    // Documentation
    function generateDocumentation() { sendMessage('generateDocs'); }

    // Versioning
    function restoreVersion(versionId) { sendMessage('restoreVersion', { versionId }); }

    // Feature management
    function addFeature(feature) { sendMessage('addFeature', { feature }); }
    function updateFeature(feature) { sendMessage('updateFeature', { feature }); }
    function deleteFeature(featureId) { sendMessage('deleteFeature', { featureId }); }

    // Canvas
    function canvasAction(action, data) { sendMessage('canvasAction', { action, ...data }); }
    function updateProperty(property, value) { sendMessage('propertyUpdate', { property, value }); }

    // Message handling
    window.addEventListener('message', event => {
      const message = event.data;
      // Handle incoming messages from extension
      console.log('Received message:', message);
    });
  `;
}

/**
 * Render the complete wizard toolbar.
 */
export function renderToolbar(integration: WizardIntegration): string {
    const modeLabels = {
        wizard: '📝 Wizard Mode',
        canvas: '🎨 Canvas Mode',
        hybrid: '🔀 Hybrid Mode',
    };

    return `
    <div class="wizard-toolbar">
      <button onclick="switchToWizard()" ${integration.mode === 'wizard' ? 'disabled' : ''}>
        📝 Wizard
      </button>
      <button onclick="switchToCanvas()" ${integration.mode === 'canvas' ? 'disabled' : ''}>
        🎨 Canvas
      </button>
      <button onclick="validatePlan()">✅ Validate</button>
      <button onclick="generateDocumentation()">📄 Generate Docs</button>
      
      <div class="mode-indicator">
        <span>${modeLabels[integration.mode]}</span>
      </div>
    </div>
  `;
}

/**
 * Render the sidebar with status panels.
 */
export function renderSidebar(integration: WizardIntegration): string {
    const errors = integration.errorHandler.getErrors();
    const health = calculateHealthScore(integration.plan);
    const validation = validatePlan(integration.plan);

    return `
    <div class="sidebar">
      <h3>Plan Status</h3>
      
      <!-- Health Score -->
      <div class="sidebar-section">
        <h4>Health</h4>
        <div class="health-mini">
          <span class="score">${health.score}</span>
          <span class="grade">${health.grade}</span>
        </div>
      </div>

      <!-- Errors -->
      <div class="sidebar-section">
        <h4>Issues (${errors.length})</h4>
        ${errors.length > 0 ? `
          <ul class="error-mini-list">
            ${errors.slice(0, 3).map(e => `<li class="${e.severity}">${e.message}</li>`).join('')}
            ${errors.length > 3 ? `<li>+${errors.length - 3} more...</li>` : ''}
          </ul>
        ` : '<div class="no-issues">✓ No issues</div>'}
      </div>

      <!-- Validation -->
      <div class="sidebar-section">
        <h4>Validation</h4>
        <div class="validation-mini">
          ${validation.valid ? '✓ Valid' : `❌ ${validation.counts.errors} errors`}
        </div>
      </div>

      <!-- Progress -->
      ${integration.executionPlan ? `
        <div class="sidebar-section">
          <h4>Execution</h4>
          ${renderProgressSummary(calculateProgress(integration.executionPlan))}
        </div>
      ` : ''}
    </div>
  `;
}
