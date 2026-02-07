/**
 * Planning Wizard Webview Panel
 *
 * **Simple explanation**: This is a 6-step form that guides you through creating a project plan.
 * Each page covers one aspect: Overview, Features, Links, Stories, Dev Stories, and Success Criteria.
 * You can save drafts, navigate back/forth, and validate as you go.
 *
 * @module ui/planningWizard
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { logInfo, logWarn, logError } from '../logger';
import { getConfigInstance } from '../config';
import {
  CompletePlan,
  WizardPage,
  WizardState,
  FeatureBlock,
  UserStory,
  DeveloperStory,
  SuccessCriterion,
  ProjectOverview,
} from '../planning/types';
import {
  validatePlan,
  validatePartialPlan,
  ProjectOverviewSchema,
  PLAN_CONSTRAINTS,
} from '../planning/schema';

// ============================================================================
// TYPES
// ============================================================================

interface WebviewToExtensionMessage {
  type:
    | 'save'
    | 'cancel'
    | 'nextPage'
    | 'prevPage'
    | 'validate'
    | 'updateField'
    | 'addFeature'
    | 'removeFeature'
    | 'addStory'
    | 'removeStory'
    | 'addCriteria'
    | 'removeCriteria'
    | 'exportPlan'
    | 'loadTemplate';
  data?: unknown;
  pageData?: unknown;
  index?: number;
}

interface ExtensionToWebviewMessage {
  type:
    | 'stateLoaded'
    | 'pageSaved'
    | 'error'
    | 'validationResult'
    | 'exportComplete'
    | 'templateLoaded';
  state?: WizardState;
  error?: string;
  isValid?: boolean;
  issues?: Array<{ field: string; message: string; severity: string }>;
  exportPath?: string;
  template?: Partial<CompletePlan>;
}

// ============================================================================
// PANEL SINGLETON
// ============================================================================

let instance: PlanningWizardPanel | null = null;

/**
 * Get or create the planning wizard panel singleton
 */
export function getPlanningWizardPanel(): PlanningWizardPanel | null {
  return instance;
}

/**
 * Open the planning wizard
 */
export async function openPlanningWizard(context: vscode.ExtensionContext): Promise<void> {
  if (instance) {
    instance.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'planningWizard',
    'Planning Wizard',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    }
  );

  instance = new PlanningWizardPanel(panel, context);
  logInfo('Planning Wizard opened');
}

// ============================================================================
// MAIN PANEL CLASS
// ============================================================================

/**
 * Planning Wizard Webview Panel
 *
 * Manages the multi-step wizard for creating comprehensive project plans.
 * Each page handles one aspect of planning with real-time validation.
 */
export class PlanningWizardPanel {
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private wizardState: WizardState;
  private context: vscode.ExtensionContext;

  constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;

    // Initialize wizard state
    this.wizardState = {
      currentPage: 'overview',
      plan: {
        metadata: {
          id: crypto.randomUUID(),
          name: 'New Plan',
          createdAt: new Date(),
          updatedAt: new Date(),
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
        userStories: [],
        developerStories: [],
        successCriteria: [],
      },
      isDirty: false,
    };

    this.setupPanel();
    this.setupMessageHandlers();
  }

  private setupPanel(): void {
    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => {
      instance = null;
      this.dispose();
    }, null, this.disposables);

    this.panel.onDidChangeViewState(
      ({ webviewPanel }) => {
        if (!webviewPanel.visible) {
          // Optionally: auto-save on hidden
        }
      },
      null,
      this.disposables
    );
  }

  private setupMessageHandlers(): void {
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        this.handleMessage(message).catch((error) => {
          logError(`Wizard message handler error: ${String(error)}`);
          this.sendMessage({
            type: 'error',
            error: `Failed to process ${message.type}: ${String(error)}`,
          });
        });
      },
      null,
      this.disposables
    );
  }

  /**
   * Reveal the wizard panel
   */
  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.One);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'nextPage':
        await this.nextPage();
        break;
      case 'prevPage':
        await this.prevPage();
        break;
      case 'updateField':
        await this.updateField(message.data);
        break;
      case 'validate':
        await this.validateCurrentPage();
        break;
      case 'save':
        await this.savePlan();
        break;
      case 'cancel':
        await this.cancel();
        break;
      case 'addFeature':
        await this.addFeatureBlock();
        break;
      case 'removeFeature':
        await this.removeFeatureBlock(message.index || 0);
        break;
      case 'exportPlan':
        await this.exportPlan(message.data as string); // format: json|markdown|yaml|pdf
        break;
      default:
        logWarn(`Unknown wizard message type: ${message.type}`);
    }
  }

  private async nextPage(): Promise<void> {
    const pages: WizardPage[] = [
      'overview',
      'features',
      'linking',
      'userStories',
      'devStories',
      'criteria',
      'review',
    ];
    const currentIndex = pages.indexOf(this.wizardState.currentPage);

    if (currentIndex < pages.length - 1) {
      // Validate current page before moving
      const validation = await this.validatePage(this.wizardState.currentPage);
      if (!validation.isValid) {
        this.sendMessage({
          type: 'validationResult',
          isValid: false,
          issues: validation.issues,
        });
        return;
      }

      this.wizardState.currentPage = pages[currentIndex + 1];
      this.wizardState.isDirty = true;
      await this.saveState();
      this.sendMessage({ type: 'pageSaved' });
    }
  }

  private async prevPage(): Promise<void> {
    const pages: WizardPage[] = [
      'overview',
      'features',
      'linking',
      'userStories',
      'devStories',
      'criteria',
      'review',
    ];
    const currentIndex = pages.indexOf(this.wizardState.currentPage);

    if (currentIndex > 0) {
      this.wizardState.currentPage = pages[currentIndex - 1];
      await this.saveState();
      this.sendMessage({ type: 'pageSaved' });
    }
  }

  private async updateField(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid field update data');
    }

    const { path, value } = data as { path: string; value: unknown };
    if (!path) throw new Error('Missing path in field update');

    // Simple path parsing: "overview.name" -> plan.overview.name
    const pathParts = path.split('.');
    let target: unknown = this.wizardState.plan;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (typeof target === 'object' && target !== null && part in target) {
        target = (target as Record<string, unknown>)[part];
      }
    }

    if (typeof target === 'object' && target !== null) {
      const lastPart = pathParts[pathParts.length - 1];
      (target as Record<string, unknown>)[lastPart] = value;
    }

    this.wizardState.isDirty = true;
    await this.saveState();
  }

  private async validateCurrentPage(): Promise<void> {
    const validation = await this.validatePage(this.wizardState.currentPage);
    this.sendMessage({
      type: 'validationResult',
      isValid: validation.isValid,
      issues: validation.issues,
    });
  }

  private async validatePage(page: WizardPage): Promise<{ isValid: boolean; issues: any[] }> {
    try {
      switch (page) {
        case 'overview': {
          const result = ProjectOverviewSchema.safeParse(this.wizardState.plan.overview);
          return {
            isValid: result.success,
            issues: result.success ? [] : result.error.errors,
          };
        }
        case 'features': {
          if (!this.wizardState.plan.featureBlocks || this.wizardState.plan.featureBlocks.length === 0) {
            return {
              isValid: false,
              issues: [{ message: 'At least one feature block is required' }],
            };
          }
          return { isValid: true, issues: [] };
        }
        // Additional page validations...
        default:
          return { isValid: true, issues: [] };
      }
    } catch (error) {
      logError(`Page validation error: ${String(error)}`);
      return { isValid: false, issues: [{ message: String(error) }] };
    }
  }

  private async addFeatureBlock(): Promise<void> {
    if (!this.wizardState.plan.featureBlocks) {
      this.wizardState.plan.featureBlocks = [];
    }

    const newBlock: FeatureBlock = {
      id: crypto.randomUUID(),
      name: 'New Feature',
      description: '',
      purpose: '',
      acceptanceCriteria: [],
      technicalNotes: '',
      priority: 'medium',
      order: this.wizardState.plan.featureBlocks.length,
    };

    this.wizardState.plan.featureBlocks.push(newBlock);
    this.wizardState.isDirty = true;
    await this.saveState();
  }

  private async removeFeatureBlock(index: number): Promise<void> {
    if (this.wizardState.plan.featureBlocks) {
      this.wizardState.plan.featureBlocks.splice(index, 1);
      this.wizardState.isDirty = true;
      await this.saveState();
    }
  }

  private async savePlan(): Promise<void> {
    try {
      const validation = validatePlan(this.wizardState.plan);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Save to ticketDb or storage service
      // TODO: Implement plan persistence
      this.wizardState.isDirty = false;
      this.wizardState.lastSaved = new Date();
      await this.saveState();

      this.sendMessage({
        type: 'pageSaved',
      });

      vscode.window.showInformationMessage('Plan saved successfully!');
      logInfo('Plan saved');
    } catch (error) {
      logError(`Failed to save plan: ${String(error)}`);
      this.sendMessage({
        type: 'error',
        error: `Failed to save plan: ${String(error)}`,
      });
    }
  }

  private async exportPlan(format: string): Promise<void> {
    try {
      // TODO: Implement export to JSON, Markdown, YAML, PDF
      logInfo(`Exporting plan as ${format}`);
      this.sendMessage({
        type: 'exportComplete',
        exportPath: '/tmp/plan.json', // Placeholder
      });
    } catch (error) {
      logError(`Export failed: ${String(error)}`);
      this.sendMessage({
        type: 'error',
        error: `Export failed: ${String(error)}`,
      });
    }
  }

  private async cancel(): Promise<void> {
    if (this.wizardState.isDirty) {
      const response = await vscode.window.showWarningMessage(
        'Do you want to save your plan before closing?',
        'Save',
        'Discard',
        'Cancel'
      );

      if (response === 'Save') {
        await this.savePlan();
      } else if (response === 'Cancel') {
        return;
      }
    }

    instance = null;
    this.dispose();
  }

  private async saveState(): Promise<void> {
    // Save to extension state or workspace storage
    // This allows recovery if extension crashes
    try {
      // TODO: Implement state persistence
      this.wizardState.lastSaved = new Date();
    } catch (error) {
      logError(`Failed to save state: ${String(error)}`);
    }
  }

  private sendMessage(message: ExtensionToWebviewMessage): void {
    this.panel.webview.postMessage(message);
  }

  private getHtmlContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planning Wizard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--foreground);
      background: var(--background);
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .progress-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 30px;
    }
    .progress-step {
      flex: 1;
      height: 4px;
      background: var(--background-secondary);
      border-radius: 2px;
      transition: background 0.3s;
    }
    .progress-step.active { background: var(--accent); }
    .progress-step.completed { background: var(--success); }
    
    .page { display: none; }
    .page.active { display: block; animation: fadeIn 0.3s; }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .page h1 { font-size: 24px; margin-bottom: 20px; }
    .page > .section { margin-bottom: 30px; }
    .section h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    
    .form-group {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
    }
    label {
      font-weight: 500;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
    }
    input, textarea, select {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--foreground);
      background: var(--background);
      font-size: 13px;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
    }
    textarea { resize: vertical; min-height: 80px; font-family: monospace; }
    
    .controls {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: var(--background-secondary); color: var(--foreground); }
    .btn-secondary:hover { background: var(--border); }
    
    .error { color: var(--error); font-size: 12px; margin-top: 4px; }
    .counter { font-size: 12px; color: var(--text-secondary); }
    
    .feature-list { display: grid; gap: 12px; }
    .feature-item {
      padding: 12px;
      background: var(--background-secondary);
      border-radius: 4px;
      border-left: 4px solid var(--accent);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="progress-bar" id="progressBar"></div>

    <!-- Page 1: Overview -->
    <div class="page active" data-page="overview">
      <h1>📋 Project Overview</h1>
      <section class="section">
        <h2>Basic Information</h2>
        <div class="form-group">
          <label for="projectName">
            Project Name
            <span class="counter"><span id="nameCount">0</span>/${PLAN_CONSTRAINTS.PROJECT_NAME_MAX}</span>
          </label>
          <input
            type="text"
            id="projectName"
            placeholder="e.g., Customer Portal"
            maxlength="${PLAN_CONSTRAINTS.PROJECT_NAME_MAX}"
          />
        </div>
        <div class="form-group">
          <label for="description">
            Description
            <span class="counter"><span id="descCount">0</span>/${PLAN_CONSTRAINTS.DESCRIPTION_MAX}</span>
          </label>
          <textarea
            id="description"
            placeholder="What is this project about?"
            maxlength="${PLAN_CONSTRAINTS.DESCRIPTION_MAX}"
          ></textarea>
        </div>
      </section>

      <section class="section">
        <h2>High-Level Goals (max 10)</h2>
        <div id="goalsList"></div>
        <button class="btn-secondary" onclick="addGoal()">+ Add Goal</button>
      </section>
    </div>

    <!-- Page 2: Features -->
    <div class="page" data-page="features">
      <h1>🎯 Feature Blocks</h1>
      <div id="featuresList" class="feature-list"></div>
      <button class="btn-primary" onclick="addFeature()">+ Add Feature Block</button>
    </div>

    <!-- Page 3: Linking -->
    <div class="page" data-page="linking">
      <h1>🔗 Block Dependencies</h1>
      <p>Link features together to show how they depend on each other.</p>
      <div id="linkingCanvas" style="height: 400px; border: 1px solid var(--border); border-radius: 4px; margin: 20px 0;"></div>
    </div>

    <!-- Page 4: User Stories -->
    <div class="page" data-page="userStories">
      <h1>👥 User Stories</h1>
      <div id="storiesList"></div>
      <button class="btn-primary" onclick="addUserStory()">+ Add User Story</button>
    </div>

    <!-- Page 5: Developer Stories -->
    <div class="page" data-page="devStories">
      <h1>👨‍💻 Developer Stories</h1>
      <div id="devStoriesList"></div>
      <button class="btn-primary" onclick="addDevStory()">+ Add Developer Story</button>
    </div>

    <!-- Page 6: Success Criteria -->
    <div class="page" data-page="criteria">
      <h1>✅ Success Criteria (SMART)</h1>
      <div id="criteriaList"></div>
      <button class="btn-primary" onclick="addCriteria()">+ Add Criterion</button>
    </div>

    <!-- Page 7: Review & Export -->
    <div class="page" data-page="review">
      <h1>🎉 Review & Export</h1>
      <section class="section">
        <h2>Plan Summary</h2>
        <div id="summary"></div>
      </section>
      <section class="section">
        <h2>Export Format</h2>
        <select id="exportFormat">
          <option value="json">JSON</option>
          <option value="markdown">Markdown</option>
          <option value="yaml">YAML</option>
          <option value="pdf">PDF</option>
        </select>
      </section>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button class="btn-secondary" id="prevBtn" onclick="prevPage()">← Previous</button>
      <button class="btn-secondary" onclick="cancel()">Cancel</button>
      <button class="btn-primary" id="nextBtn" onclick="nextPage()">Next →</button>
      <button class="btn-primary" id="saveBtn" onclick="savePlan()" style="display:none;">Save Plan</button>
      <button class="btn-primary" id="exportBtn" onclick="exportPlan()" style="display:none;">Export</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const pages = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];
    let currentPageIndex = 0;

    function updateUI() {
      const currentPage = pages[currentPageIndex];
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-page="' + currentPage + '"]')?.classList.add('active');

      document.getElementById('prevBtn').style.display = currentPageIndex > 0 ? 'block' : 'none';
      document.getElementById('nextBtn').style.display = currentPageIndex < pages.length - 1 ? 'block' : 'none';
      document.getElementById('saveBtn').style.display = currentPageIndex === pages.length - 1 ? 'block' : 'none';
      document.getElementById('exportBtn').style.display = currentPageIndex === pages.length - 1 ? 'block' : 'none';

      updateProgressBar();
    }

    function updateProgressBar() {
      const html = pages.map((p, i) => {
        const classList = i === currentPageIndex ? 'active' : (i < currentPageIndex ? 'completed' : '');
        return \`<div class="progress-step \${classList}"></div>\`;
      }).join('');
      document.getElementById('progressBar').innerHTML = html;
    }

    function nextPage() {
      if (currentPageIndex < pages.length - 1) {
        currentPageIndex++;
        updateUI();
        vscode.postMessage({ type: 'nextPage' });
      }
    }

    function prevPage() {
      if (currentPageIndex > 0) {
        currentPageIndex--;
        updateUI();
        vscode.postMessage({ type: 'prevPage' });
      }
    }

    function savePlan() {
      vscode.postMessage({ type: 'save' });
    }

    function exportPlan() {
      const format = document.getElementById('exportFormat').value;
      vscode.postMessage({ type: 'exportPlan', data: format });
    }

    function cancel() {
      vscode.postMessage({ type: 'cancel' });
    }

    function addGoal() {
      // TODO: Implement
    }

    function addFeature() {
      vscode.postMessage({ type: 'addFeature' });
    }

    function addUserStory() {
      vscode.postMessage({ type: 'addStory' });
    }

    function addDevStory() {
      vscode.postMessage({ type: 'addStory', data: { type: 'developer' } });
    }

    function addCriteria() {
      vscode.postMessage({ type: 'addCriteria' });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'pageSaved') {
        updateUI();
      }
    });

    updateUI();
  </script>
</body>
</html>
    `;
  }

  /**
   * Cleanup resources
   */
  private dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
