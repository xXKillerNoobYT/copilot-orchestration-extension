/**
 * Custom Agent Builder Webview Panel
 *
 * A form-based UI for creating and editing custom AI agents.
 * Provides real-time validation, character counts, and variable helpers.
 *
 * **Simple explanation**: This is a form where you design your own AI assistant.
 * Fill in the name, instructions, goals, and checklists. The form validates
 * everything in real-time so you know if something's wrong before saving.
 *
 * @module ui/customAgentBuilder
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../logger';
import {
    CustomAgent,
    CustomAgentSchema,
    CustomList,
    RoutingRule,
    AgentMetadata,
    CUSTOM_AGENT_CONSTRAINTS,
    SYSTEM_PROMPT_VARIABLES,
    RESERVED_AGENT_NAMES,
    createDefaultAgentTemplate,
    validateCustomAgent,
    type AgentPriorityType
} from '../agents/custom/schema';
import {
    saveCustomAgent,
    loadCustomAgent,
    listCustomAgents,
    customAgentExists,
    getWorkspaceFolder,
    AgentListItem
} from '../agents/custom/storage';

// ============================================================================
// Section 1: Type Definitions
// ============================================================================

/**
 * Message types sent from webview to extension
 */
export interface WebviewToExtensionMessage {
    type:
    | 'save'
    | 'cancel'
    | 'validate'
    | 'loadTemplate'
    | 'loadAgent'
    | 'addGoal'
    | 'removeGoal'
    | 'addChecklistItem'
    | 'removeChecklistItem'
    | 'addCustomList'
    | 'removeCustomList'
    | 'addCustomListItem'
    | 'removeCustomListItem'
    | 'fieldChanged'
    | 'insertVariable'
    | 'testAgent';
    agentConfig?: Partial<CustomAgent>;
    agentName?: string;
    templateName?: string;
    fieldName?: string;
    fieldValue?: unknown;
    index?: number;
    listIndex?: number;
    itemIndex?: number;
    variable?: string;
    query?: string;
}

/**
 * Message types sent from extension to webview
 */
export interface ExtensionToWebviewMessage {
    type:
    | 'agentLoaded'
    | 'validationResult'
    | 'saveResult'
    | 'error'
    | 'agentListUpdated'
    | 'constraintsInfo'
    | 'testResult';
    agent?: CustomAgent;
    isValid?: boolean;
    errors?: Array<{ path: string; message: string }>;
    success?: boolean;
    errorMessage?: string;
    agents?: string[];
    constraints?: typeof CUSTOM_AGENT_CONSTRAINTS;
    variables?: readonly string[];
    reservedNames?: readonly string[];
    response?: string;
    tokens?: { prompt: number; completion: number; total: number };
    responseTime?: number;
}

/**
 * Builder mode: creating a new agent or editing existing
 */
export type BuilderMode = 'create' | 'edit';

/**
 * Options for opening the builder
 */
export interface BuilderOptions {
    mode: BuilderMode;
    agentName?: string;
}

// ============================================================================
// Section 2: Panel Management
// ============================================================================

let instance: CustomAgentBuilderPanel | null = null;

/**
 * Custom Agent Builder Webview Panel
 *
 * **Simple explanation**: The main class that manages the form window.
 * It handles opening/closing, sending/receiving messages, and coordinating
 * between the form UI and the agent storage system.
 */
export class CustomAgentBuilderPanel {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private mode: BuilderMode;
    private originalAgentName: string | null = null;
    private currentAgent: Partial<CustomAgent>;

    /**
     * Get workspace folder or throw error if not available
     */
    private getWorkspaceFolderOrThrow(): string {
        const workspaceFolder = getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error('No workspace folder open. Please open a folder first.');
        }
        return workspaceFolder;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        options: BuilderOptions
    ) {
        this.panel = panel;
        this.mode = options.mode;
        this.originalAgentName = options.agentName ?? null;
        this.currentAgent = {};

        // Set HTML content
        this.panel.webview.html = this.getHtmlContent();

        // Handle webview disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            (message: WebviewToExtensionMessage) => this.handleMessage(message),
            null,
            this.disposables
        );

        // Initialize with appropriate content
        this.initialize(options);

        logInfo(`[CustomAgentBuilder] Panel created in ${options.mode} mode`);
    }

    /**
     * Create or show the custom agent builder panel
     *
     * **Simple explanation**: Opens the builder window. If already open,
     * brings it to front. If editing existing agent, loads that agent's config.
     */
    public static createOrShow(
        context: vscode.ExtensionContext,
        options: BuilderOptions = { mode: 'create' }
    ): CustomAgentBuilderPanel {
        // If panel exists, reveal and update
        if (instance) {
            instance.panel.reveal();
            instance.initialize(options);
            return instance;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'coeCustomAgentBuilder',
            options.mode === 'edit'
                ? `Edit Agent: ${options.agentName}`
                : 'New Custom Agent',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        instance = new CustomAgentBuilderPanel(panel, options);
        return instance;
    }

    /**
     * Get the current instance (if any)
     */
    public static getInstance(): CustomAgentBuilderPanel | null {
        return instance;
    }

    /**
     * Initialize panel with agent data
     */
    private async initialize(options: BuilderOptions): Promise<void> {
        this.mode = options.mode;
        this.originalAgentName = options.agentName ?? null;

        // Send constraints info
        this.postMessage({
            type: 'constraintsInfo',
            constraints: CUSTOM_AGENT_CONSTRAINTS,
            variables: SYSTEM_PROMPT_VARIABLES,
            reservedNames: RESERVED_AGENT_NAMES
        });

        // Load agent list for dropdown/reference
        await this.sendAgentList();

        if (options.mode === 'edit' && options.agentName) {
            // Load existing agent
            await this.loadAgent(options.agentName);
        } else {
            // Start with default template
            this.currentAgent = createDefaultAgentTemplate('new-agent');
            this.postMessage({
                type: 'agentLoaded',
                agent: this.currentAgent as CustomAgent
            });
        }

        // Update panel title
        this.panel.title = options.mode === 'edit'
            ? `Edit Agent: ${options.agentName}`
            : 'New Custom Agent';
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'save':
                    await this.handleSave(message.agentConfig);
                    break;

                case 'cancel':
                    this.handleCancel();
                    break;

                case 'validate':
                    this.handleValidate(message.agentConfig);
                    break;

                case 'loadAgent':
                    if (message.agentName) {
                        await this.loadAgent(message.agentName);
                    }
                    break;

                case 'loadTemplate':
                    if (message.templateName) {
                        this.loadTemplate(message.templateName);
                    }
                    break;

                case 'fieldChanged':
                    this.handleFieldChanged(message.fieldName, message.fieldValue);
                    break;

                case 'testAgent':
                    if (message.agentConfig && message.query) {
                        await this.handleTestAgent(message.agentConfig, message.query);
                    }
                    break;

                case 'insertVariable':
                    // No-op on extension side, handled in webview
                    break;

                default:
                    logWarn(`[CustomAgentBuilder] Unknown message type: ${message.type}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[CustomAgentBuilder] Error handling message: ${msg}`);
            this.postMessage({
                type: 'error',
                errorMessage: msg
            });
        }
    }

    /**
     * Handle save action
     */
    private async handleSave(config?: Partial<CustomAgent>): Promise<void> {
        if (!config) {
            this.postMessage({
                type: 'saveResult',
                success: false,
                errorMessage: 'No agent configuration provided'
            });
            return;
        }

        // Validate before saving
        const validation = validateCustomAgent(config);
        if (!validation.success) {
            const errors = validation.errors?.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message
            })) ?? [];
            this.postMessage({
                type: 'validationResult',
                isValid: false,
                errors
            });
            return;
        }

        const agent = validation.data!;

        // Get workspace folder
        let workspaceFolder: string;
        try {
            workspaceFolder = this.getWorkspaceFolderOrThrow();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.postMessage({
                type: 'saveResult',
                success: false,
                errorMessage: msg
            });
            return;
        }

        // Check for name conflicts when creating or renaming
        if (this.mode === 'create' || agent.name !== this.originalAgentName) {
            const exists = customAgentExists(workspaceFolder, agent.name);
            if (exists && agent.name !== this.originalAgentName) {
                this.postMessage({
                    type: 'saveResult',
                    success: false,
                    errorMessage: `An agent named "${agent.name}" already exists`
                });
                return;
            }
        }

        try {
            // Save the agent
            saveCustomAgent(workspaceFolder, agent, { skipBackup: this.mode !== 'edit' });

            logInfo(`[CustomAgentBuilder] Saved agent: ${agent.name}`);

            this.postMessage({
                type: 'saveResult',
                success: true
            });

            // Show success notification
            const action = this.mode === 'create' ? 'created' : 'updated';
            vscode.window.showInformationMessage(
                `Agent "${agent.name}" ${action} successfully!`
            );

            // Update agent list
            await this.sendAgentList();

            // If this was create mode, switch to edit mode
            if (this.mode === 'create') {
                this.mode = 'edit';
                this.originalAgentName = agent.name;
                this.panel.title = `Edit Agent: ${agent.name}`;
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[CustomAgentBuilder] Failed to save agent: ${msg}`);
            this.postMessage({
                type: 'saveResult',
                success: false,
                errorMessage: msg
            });
        }
    }

    /**
     * Handle cancel action
     */
    private handleCancel(): void {
        logInfo('[CustomAgentBuilder] User cancelled');
        this.dispose();
    }

    /**
     * Handle validate action
     */
    private handleValidate(config?: Partial<CustomAgent>): void {
        if (!config) {
            this.postMessage({
                type: 'validationResult',
                isValid: false,
                errors: [{ path: '', message: 'No configuration to validate' }]
            });
            return;
        }

        const validation = validateCustomAgent(config);
        if (validation.success) {
            this.postMessage({
                type: 'validationResult',
                isValid: true,
                errors: []
            });
        } else {
            const errors = validation.errors?.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message
            })) ?? [];
            this.postMessage({
                type: 'validationResult',
                isValid: false,
                errors
            });
        }
    }

    /**
     * Handle agent testing
     */
    private async handleTestAgent(config: Partial<CustomAgent>, query: string): Promise<void> {
        try {
            if (!config.name) {
                this.postMessage({
                    type: 'testResult',
                    success: false,
                    errorMessage: 'Agent name is required'
                });
                return;
            }

            // Validate configuration before testing
            const validation = validateCustomAgent(config);
            if (!validation.success) {
                this.postMessage({
                    type: 'testResult',
                    success: false,
                    errorMessage: 'Agent configuration is invalid'
                });
                return;
            }

            // For now, return a mock response
            // In a real implementation, this would execute the agent
            const agentName = config.name || 'test-agent';
            const prompt = config.systemPrompt || 'You are a helpful assistant.';
            const response = `Test response for query: "${query}"\n\nAgent: ${agentName}\nSystem Prompt: ${prompt.substring(0, 100)}...`;
            
            this.postMessage({
                type: 'testResult',
                success: true,
                response: response,
                tokens: {
                    prompt: Math.floor(Math.random() * 100) + 10,
                    completion: Math.floor(Math.random() * 100) + 10,
                    total: Math.floor(Math.random() * 200) + 20
                },
                responseTime: Math.floor(Math.random() * 2000) + 500
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.postMessage({
                type: 'testResult',
                success: false,
                errorMessage: msg
            });
        }
    }

    /**
     * Load an existing agent for editing
     */
    private async loadAgent(agentName: string): Promise<void> {
        try {
            const workspaceFolder = this.getWorkspaceFolderOrThrow();
            const agent = loadCustomAgent(workspaceFolder, agentName);

            this.currentAgent = agent;
            this.originalAgentName = agentName;
            this.mode = 'edit';
            this.panel.title = `Edit Agent: ${agentName}`;

            this.postMessage({
                type: 'agentLoaded',
                agent
            });

            logInfo(`[CustomAgentBuilder] Loaded agent: ${agentName}`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[CustomAgentBuilder] Failed to load agent: ${msg}`);
            this.postMessage({
                type: 'error',
                errorMessage: `Failed to load agent: ${msg}`
            });
        }
    }

    /**
     * Load a starter template
     */
    private loadTemplate(templateName: string): void {
        // For now, just use the default template
        // MT-030.12 will add more templates
        const agentName = templateName.toLowerCase().replace(/\s+/g, '-');
        const template = createDefaultAgentTemplate(agentName);
        template.description = `Based on ${templateName} template`;

        this.currentAgent = template;
        this.postMessage({
            type: 'agentLoaded',
            agent: template as CustomAgent
        });

        logInfo(`[CustomAgentBuilder] Loaded template: ${templateName}`);
    }

    /**
     * Handle field change for real-time validation
     */
    private handleFieldChanged(fieldName?: string, value?: unknown): void {
        if (!fieldName) return;

        // Update current agent
        const keys = fieldName.split('.');
        let target: any = this.currentAgent;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) {
                target[keys[i]] = {};
            }
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = value;

        // Trigger validation
        this.handleValidate(this.currentAgent);
    }

    /**
     * Send updated agent list to webview
     */
    private async sendAgentList(): Promise<void> {
        try {
            const workspaceFolder = this.getWorkspaceFolderOrThrow();
            const agentItems = listCustomAgents(workspaceFolder);
            const agents = agentItems.map(item => item.name);
            this.postMessage({
                type: 'agentListUpdated',
                agents
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[CustomAgentBuilder] Failed to list agents: ${msg}`);
        }
    }

    /**
     * Post message to webview
     */
    private postMessage(message: ExtensionToWebviewMessage): void {
        this.panel.webview.postMessage(message);
    }

    /**
     * Dispose the panel
     */
    public dispose(): void {
        instance = null;

        // Dispose all disposables
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Dispose the panel
        this.panel.dispose();

        logInfo('[CustomAgentBuilder] Panel disposed');
    }

    /**
     * Generate a nonce for Content Security Policy
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Get the HTML content for the webview
     */
    private getHtmlContent(): string {
        const nonce = this.getNonce();
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
                <title>Custom Agent Builder</title>
                <style nonce="${nonce}">
                    ${this.getCssStyles()}
                </style>
            </head>
            <body>
                <div class="builder-container">
                    <header class="builder-header">
                        <h1>🤖 Custom Agent Builder</h1>
                        <div class="header-actions">
                            <button id="btn-templates" class="btn btn-secondary" title="Start from a template">📋 Templates</button>
                            <button id="btn-validate" class="btn btn-secondary">Validate</button>
                            <button id="btn-test" class="btn btn-info">🧪 Test</button>
                            <button id="btn-save" class="btn btn-primary">Save Agent</button>
                            <button id="btn-cancel" class="btn btn-danger">Cancel</button>
                        </div>
                    </header>
                    
                    <!-- Templates Modal -->
                    <div id="templates-modal" class="test-modal" style="display: none;">
                        <div class="test-modal-content" style="max-width: 600px;">
                            <div class="test-modal-header">
                                <h2>📋 Agent Templates</h2>
                                <button type="button" id="close-templates-modal" class="btn-close">✕</button>
                            </div>
                            <div class="test-modal-body">
                                <div id="templates-list" style="display: flex; flex-direction: column; gap: 8px;">
                                    <span class="form-hint">Loading templates...</span>
                                </div>
                            </div>
                        </div>
                        <div class="test-modal-backdrop"></div>
                    </div>

                    <div class="validation-banner" id="validation-banner" style="display: none;">
                        <span class="validation-icon">⚠️</span>
                        <span class="validation-message" id="validation-message"></span>
                    </div>

                    <form id="agent-form" class="agent-form">
                        ${this.getBasicInfoSection()}
                        ${this.getSystemPromptSection()}
                        ${this.getGoalsSection()}
                        ${this.getChecklistSection()}
                        ${this.getCustomListsSection()}
                        ${this.getMetadataSection()}
                        ${this.getSettingsSection()}
                        ${this.getRoutingSection()}
                    </form>

                    <!-- Test Mode Modal -->
                    <div id="test-mode-modal" class="test-modal" style="display: none;">
                        <div class="test-modal-content">
                            <div class="test-modal-header">
                                <h2>🧪 Test Agent</h2>
                                <button type="button" id="close-test-modal" class="btn-close">✕</button>
                            </div>
                            <div class="test-modal-body">
                                <div class="test-input-section">
                                    <label class="form-label">Sample Query</label>
                                    <textarea id="test-query" placeholder="Enter a sample question to test the agent..." rows="4" maxlength="500"></textarea>
                                    <button type="button" id="submit-test-btn" class="btn btn-primary">Send Test Query</button>
                                </div>
                                <div id="test-status" class="test-status" style="display: none;">
                                    <div class="spinner"></div>
                                    <span>Testing agent... this may take a moment</span>
                                </div>
                                <div id="test-output-section" style="display: none;">
                                    <h3>Agent Response</h3>
                                    <pre id="test-response" class="test-response"></pre>
                                    <div class="test-metrics">
                                        <div class="metric-item">
                                            <span class="metric-label">Prompt Tokens:</span>
                                            <span id="prompt-tokens">0</span>
                                        </div>
                                        <div class="metric-item">
                                            <span class="metric-label">Completion Tokens:</span>
                                            <span id="completion-tokens">0</span>
                                        </div>
                                        <div class="metric-item">
                                            <span class="metric-label">Total Tokens:</span>
                                            <span id="total-tokens">0</span>
                                        </div>
                                        <div class="metric-item">
                                            <span class="metric-label">Response Time:</span>
                                            <span id="response-time">0</span>ms
                                        </div>
                                    </div>
                                </div>
                                <div id="test-error-section" style="display: none;">
                                    <div class="test-error">
                                        <span class="error-icon">⚠️</span>
                                        <span id="test-error-text"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="test-modal-backdrop"></div>
                    </div>
                </div>

                <script nonce="${nonce}">
                    ${this.getJavaScript()}
                </script>
            </body>
            </html>
        `;
    }

    /**
     * CSS styles for the webview
     */
    private getCssStyles(): string {
        return `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: var(--vscode-font-family);
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                padding: 0;
                line-height: 1.5;
            }
            .builder-container {
                max-width: 900px;
                margin: 0 auto;
                padding: 16px;
            }
            .builder-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .builder-header h1 {
                font-size: 1.5em;
                font-weight: 600;
            }
            .header-actions {
                display: flex;
                gap: 8px;
            }
            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: background 0.2s;
            }
            .btn-primary {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            .btn-primary:hover {
                background: var(--vscode-button-hoverBackground);
            }
            .btn-secondary {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            .btn-secondary:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            .btn-danger {
                background: var(--vscode-errorForeground);
                color: white;
            }
            .btn-danger:hover {
                opacity: 0.9;
            }
            .btn-small {
                padding: 4px 8px;
                font-size: 12px;
            }
            .validation-banner {
                padding: 12px 16px;
                background: var(--vscode-inputValidation-warningBackground);
                border: 1px solid var(--vscode-inputValidation-warningBorder);
                border-radius: 4px;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .validation-banner.error {
                background: var(--vscode-inputValidation-errorBackground);
                border-color: var(--vscode-inputValidation-errorBorder);
            }
            .validation-banner.success {
                background: var(--vscode-testing-iconPassed);
                border-color: var(--vscode-testing-iconPassed);
            }
            .section {
                margin-bottom: 24px;
                background: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 8px;
                padding: 16px;
            }
            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                cursor: pointer;
            }
            .section-title {
                font-size: 1.1em;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .section-toggle {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
            }
            .section-content {
                display: block;
            }
            .section-content.collapsed {
                display: none;
            }
            .form-group {
                margin-bottom: 16px;
            }
            .form-group:last-child {
                margin-bottom: 0;
            }
            .form-label {
                display: block;
                margin-bottom: 4px;
                font-weight: 500;
                font-size: 13px;
            }
            .form-label .required {
                color: var(--vscode-errorForeground);
            }
            .form-hint {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                margin-top: 2px;
            }
            .char-count {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                text-align: right;
                margin-top: 2px;
            }
            .char-count.warning {
                color: var(--vscode-editorWarning-foreground);
            }
            .char-count.error {
                color: var(--vscode-errorForeground);
            }
            input[type="text"],
            input[type="number"],
            textarea,
            select {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                font-family: inherit;
                font-size: 13px;
            }
            input:focus,
            textarea:focus,
            select:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
            input.invalid,
            textarea.invalid {
                border-color: var(--vscode-inputValidation-errorBorder);
            }
            textarea {
                min-height: 100px;
                resize: vertical;
            }
            textarea.large {
                min-height: 200px;
            }
            .inline-row {
                display: flex;
                gap: 16px;
            }
            .inline-row .form-group {
                flex: 1;
            }
            .dynamic-list {
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 8px;
                background: var(--vscode-editor-background);
            }
            .dynamic-list-item {
                display: flex;
                gap: 8px;
                align-items: center;
                margin-bottom: 8px;
            }
            .dynamic-list-item:last-child {
                margin-bottom: 0;
            }
            .dynamic-list-item input {
                flex: 1;
            }
            .dynamic-list-item .item-number {
                min-width: 24px;
                text-align: center;
                color: var(--vscode-descriptionForeground);
                font-size: 12px;
            }
            .dynamic-list-actions {
                margin-top: 8px;
                display: flex;
                gap: 8px;
            }
            .custom-list-container {
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                margin-bottom: 12px;
                background: var(--vscode-editor-background);
            }
            .custom-list-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 12px;
                background: var(--vscode-sideBar-background);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .custom-list-body {
                padding: 12px;
            }
            .variable-helper {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-top: 8px;
            }
            .variable-tag {
                padding: 2px 8px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 10px;
                font-size: 11px;
                cursor: pointer;
            }
            .variable-tag:hover {
                opacity: 0.8;
            }
            .routing-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background: var(--vscode-input-background);
                min-height: 40px;
            }
            .routing-tag {
                padding: 2px 8px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 10px;
                font-size: 11px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .routing-tag .remove {
                cursor: pointer;
                opacity: 0.7;
            }
            .routing-tag .remove:hover {
                opacity: 1;
            }
            .empty-state {
                text-align: center;
                padding: 20px;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            }
            .checkbox-group {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
            }
            .checkbox-label {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
            }
            .checkbox-label input[type="checkbox"] {
                width: auto;
            }
            /* Autocomplete dropdown styles */
            .prompt-container {
                position: relative;
            }
            .autocomplete-dropdown {
                position: absolute;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                max-height: 300px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
                min-width: 200px;
            }
            .autocomplete-dropdown.show {
                display: block;
            }
            .autocomplete-item {
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid var(--vscode-panel-border);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .autocomplete-item:hover {
                background: var(--vscode-list-hoverBackground);
            }
            .autocomplete-item.selected {
                background: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
            }
            /* Drag handle styles */
            .drag-handle {
                cursor: grab;
                color: var(--vscode-descriptionForeground);
                font-size: 14px;
                padding: 4px 8px;
                user-select: none;
            }
            .drag-handle:active {
                cursor: grabbing;
            }
            .dynamic-list-item.dragging {
                opacity: 0.5;
                background: var(--vscode-editor-inactiveSelectionBackground);
            }
            .dynamic-list-item.drag-over {
                border-top: 2px solid var(--vscode-focusBorder);
            }
            /* Enhanced checkbox styles */
            .checklist-item {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                margin-bottom: 8px;
                padding: 8px;
                border-radius: 4px;
            }
            .checklist-checkbox {
                margin-top: 4px;
                cursor: pointer;
                width: 16px;
                height: 16px;
                flex-shrink: 0;
            }
            .checklist-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .checklist-text-input {
                width: 100%;
            }
            .checklist-templates {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
            }
            .template-tag {
                padding: 2px 8px;
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border-radius: 3px;
                font-size: 11px;
                cursor: pointer;
            }
            .template-tag:hover {
                opacity: 0.9;
            }
            /* Syntax highlighting container */
            .syntax-highlight-container {
                position: relative;
            }
            .variable-highlight {
                background: var(--vscode-editor-findMatchBackground);
                color: var(--vscode-editor-findMatchForeground);
                padding: 2px 4px;
                border-radius: 2px;
            }
            /* Test Modal Styles */
            .test-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
            }
            .test-modal-content {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 700px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                position: relative;
                z-index: 2001;
            }
            .test-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .test-modal-header h2 {
                margin: 0;
                font-size: 1.2em;
            }
            .btn-close {
                background: none;
                border: none;
                color: var(--vscode-editor-foreground);
                cursor: pointer;
                font-size: 20px;
                padding: 0;
                line-height: 1;
            }
            .btn-close:hover {
                color: var(--vscode-errorForeground);
            }
            .test-modal-body {
                padding: 16px;
                overflow-y: auto;
                flex: 1;
            }
            .test-input-section {
                margin-bottom: 16px;
            }
            .test-input-section textarea {
                width: 100%;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                font-family: var(--vscode-font-family);
                resize: vertical;
            }
            .test-input-section textarea:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
            #submit-test-btn {
                margin-top: 8px;
            }
            .test-status {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px;
                background: var(--vscode-statusBar-background);
                border-radius: 4px;
                margin: 16px 0;
            }
            .spinner {
                width: 16px;
                height: 16px;
                border: 2px solid var(--vscode-panel-border);
                border-top-color: var(--vscode-focusBorder);
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
            }
            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }
            #test-output-section {
                margin: 16px 0;
            }
            #test-output-section h3 {
                margin: 0 0 12px 0;
                font-size: 1em;
            }
            .test-response {
                background: var(--vscode-textCodeBlock-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 12px;
                max-height: 300px;
                overflow-y: auto;
                margin-bottom: 16px;
                font-size: 13px;
                line-height: 1.6;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            .test-metrics {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                padding: 12px;
                background: var(--vscode-input-background);
                border-radius: 4px;
            }
            .metric-item {
                display: flex;
                justify-content: space-between;
                font-size: 13px;
            }
            .metric-label {
                color: var(--vscode-descriptionForeground);
            }
            #test-error-section {
                margin: 16px 0;
            }
            .test-error {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px;
                background: var(--vscode-inputValidation-errorBackground);
                border: 1px solid var(--vscode-inputValidation-errorBorder);
                border-radius: 4px;
                color: var(--vscode-inputValidation-errorForeground);
            }
            .error-icon {
                font-size: 1.2em;
            }
            .test-modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2000;
            }

            /* Template Styles */
            #templates-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .template-card {
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 12px;
                background: var(--vscode-editor-background);
                transition: all 0.2s ease;
            }

            .template-card:hover {
                border-color: var(--vscode-textLink-foreground);
                background: var(--vscode-editorHoverWidget-background);
                box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
            }

            .template-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 8px;
                gap: 8px;
            }

            .template-info {
                flex: 1;
            }

            .template-name {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--vscode-editor-foreground);
            }

            .template-category {
                display: inline-block;
                background: var(--vscode-textCodeBlock-background);
                color: var(--vscode-textCodeBlock-foreground);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: 500;
                margin-top: 4px;
            }

            .template-description {
                margin: 8px 0;
                font-size: 13px;
                color: var(--vscode-descriptionForeground);
                line-height: 1.4;
            }

            .template-meta {
                display: flex;
                gap: 12px;
                font-size: 12px;
                color: var(--vscode-textBlock-background);
                margin-bottom: 8px;
            }

            .template-author,
            .template-version {
                padding: 2px 0;
            }

            .btn-use-template {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: 1px solid var(--vscode-button-border);
                padding: 6px 12px;
                border-radius: 3px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s ease;
            }

            .btn-use-template:hover {
                background: var(--vscode-button-hoverBackground);
            }

            .btn-use-template:active {
                transform: scale(0.98);
            }
        `;
    }

    /**
     * Basic info section (name, description)
     */
    private getBasicInfoSection(): string {
        return `
            <div class="section" id="section-basic">
                <div class="section-header" data-section="basic">
                    <h2 class="section-title">📝 Basic Information</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-basic">
                    <div class="form-group">
                        <label class="form-label">
                            Agent Name <span class="required">*</span>
                        </label>
                        <input type="text" id="agent-name" name="name" 
                            placeholder="my-research-agent" 
                            maxlength="${CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH}"
                            pattern="^[a-z][a-z0-9-]*$">
                        <div class="form-hint">
                            Lowercase letters, numbers, and hyphens only. Must start with a letter.
                        </div>
                        <div class="char-count" id="name-count">
                            0 / ${CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH}
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">
                            Description <span class="required">*</span>
                        </label>
                        <input type="text" id="agent-description" name="description"
                            placeholder="A helpful agent for researching code patterns..."
                            maxlength="${CUSTOM_AGENT_CONSTRAINTS.DESCRIPTION_MAX_LENGTH}">
                        <div class="form-hint">
                            Brief description of what this agent does (shown in agent list).
                        </div>
                        <div class="char-count" id="description-count">
                            0 / ${CUSTOM_AGENT_CONSTRAINTS.DESCRIPTION_MAX_LENGTH}
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Active Status</label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="agent-active" name="isActive" checked>
                            Agent is active and can be selected
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * System prompt section with variable helpers, autocomplete, and syntax highlighting
     */
    private getSystemPromptSection(): string {
        return `
            <div class="section" id="section-prompt">
                <div class="section-header" data-section="prompt">
                    <h2 class="section-title">💬 System Prompt</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-prompt">
                    <div class="form-group">
                        <label class="form-label">
                            Instructions for the Agent <span class="required">*</span>
                        </label>
                        <div class="prompt-container">
                            <textarea id="agent-prompt" name="systemPrompt" class="large"
                                placeholder="You are a helpful research assistant. Your task is to..."></textarea>
                            <div class="autocomplete-dropdown" id="autocomplete-dropdown"></div>
                        </div>
                        <div class="form-hint">
                            The instructions given to the LLM. Use {{variables}} for dynamic content.
                            Start typing {{ to see autocomplete suggestions.
                        </div>
                        <div class="char-count" id="prompt-count">
                            0 / ${CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH}
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Quick Insert Variables</label>
                        <div class="variable-helper" id="variable-helper">
                            ${SYSTEM_PROMPT_VARIABLES.map(v =>
            `<span class="variable-tag" data-variable="${v}">{{${v}}}</span>`
        ).join('')}
                        </div>
                        <div class="form-hint">
                            Click a variable to insert it at the cursor position.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Goals section with dynamic list and drag-to-reorder
     */
    private getGoalsSection(): string {
        return `
            <div class="section" id="section-goals">
                <div class="section-header" data-section="goals">
                    <h2 class="section-title">🎯 Goals</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-goals">
                    <div class="form-group">
                        <label class="form-label">
                            Agent Goals <span class="required">*</span>
                            <span class="form-hint">(${CUSTOM_AGENT_CONSTRAINTS.GOALS_MIN}-${CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX} goals)</span>
                        </label>
                        <div class="dynamic-list" id="goals-list">
                            <div class="empty-state" id="goals-empty">
                                No goals added yet. Click "Add Goal" to start.
                            </div>
                        </div>
                        <div class="dynamic-list-actions">
                            <button type="button" class="btn btn-secondary btn-small" id="btn-add-goal">
                                + Add Goal
                            </button>
                        </div>
                        <div class="form-hint">
                            Drag goals to reorder them. The agent will prioritize goals in this order.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Checklist section with dynamic list and checkbox UI
     */
    private getChecklistSection(): string {
        return `
            <div class="section" id="section-checklist">
                <div class="section-header" data-section="checklist">
                    <h2 class="section-title">✅ Checklist</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-checklist">
                    <div class="form-group">
                        <label class="form-label">
                            Verification Checklist
                            <span class="form-hint">(0-${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX} items)</span>
                        </label>
                        <div class="dynamic-list" id="checklist-list">
                            <div class="empty-state" id="checklist-empty">
                                No checklist items. This is optional.
                            </div>
                        </div>
                        <div class="dynamic-list-actions">
                            <button type="button" class="btn btn-secondary btn-small" id="btn-add-checklist">
                                + Add Checklist Item
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Quick Templates</label>
                        <div class="checklist-templates" id="checklist-templates">
                            <span class="template-tag" data-template="Response complete">Response complete</span>
                            <span class="template-tag" data-template="No errors">No errors</span>
                            <span class="template-tag" data-template="All tests pass">All tests pass</span>
                            <span class="template-tag" data-template="Documentation updated">Documentation updated</span>
                            <span class="template-tag" data-template="Code reviewed">Code reviewed</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Custom lists section
     */
    private getCustomListsSection(): string {
        return `
            <div class="section" id="section-customlists">
                <div class="section-header" data-section="customlists">
                    <h2 class="section-title">📚 Custom Lists</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-customlists">
                    <div class="form-group">
                        <label class="form-label">
                            Custom Lists
                            <span class="form-hint">(0-${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX} lists)</span>
                        </label>
                        <div id="custom-lists-container">
                            <div class="empty-state" id="customlists-empty">
                                No custom lists. Use these for reference data, examples, etc.
                            </div>
                        </div>
                        <div class="dynamic-list-actions">
                            <button type="button" class="btn btn-secondary btn-small" id="btn-add-customlist">
                                + Add Custom List
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Settings section (timeout, tokens, temperature, priority)
     */
    private getSettingsSection(): string {
        return `
            <div class="section" id="section-settings">
                <div class="section-header" data-section="settings">
                    <h2 class="section-title">⚙️ Settings</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-settings">
                    <div class="inline-row">
                        <div class="form-group">
                            <label class="form-label">Priority</label>
                            <select id="agent-priority" name="priority">
                                <option value="P0">P0 - Critical</option>
                                <option value="P1">P1 - High</option>
                                <option value="P2" selected>P2 - Normal</option>
                                <option value="P3">P3 - Low</option>
                            </select>
                            <div class="form-hint">Higher priority agents are selected first</div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Timeout (seconds)</label>
                            <input type="number" id="agent-timeout" name="timeoutSeconds"
                                value="60" min="10" max="300">
                            <div class="form-hint">10-300 seconds</div>
                        </div>
                    </div>

                    <div class="inline-row">
                        <div class="form-group">
                            <label class="form-label">Max Tokens</label>
                            <input type="number" id="agent-tokens" name="maxTokens"
                                value="2048" min="256" max="4096">
                            <div class="form-hint">256-4096 tokens</div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Temperature</label>
                            <input type="number" id="agent-temperature" name="temperature"
                                value="0.7" min="0" max="2" step="0.1">
                            <div class="form-hint">0 = deterministic, 2 = creative</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Routing rules section
     */
    private getRoutingSection(): string {
        return `
            <div class="section" id="section-routing">
                <div class="section-header" data-section="routing">
                    <h2 class="section-title">🔀 Routing Rules</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-routing">
                    <div class="form-group">
                        <label class="form-label">Keywords</label>
                        <input type="text" id="routing-keyword-input" 
                            placeholder="Type a keyword and press Enter">
                        <div class="routing-tags" id="routing-keywords">
                        </div>
                        <div class="form-hint">
                            Tasks containing these keywords will be routed to this agent.
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Patterns (Regex)</label>
                        <input type="text" id="routing-pattern-input"
                            placeholder="Enter a regex pattern and press Enter">
                        <div class="routing-tags" id="routing-patterns">
                        </div>
                        <div class="form-hint">
                            Advanced pattern matching with regular expressions.
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Tags</label>
                        <input type="text" id="routing-tag-input"
                            placeholder="Enter a tag and press Enter">
                        <div class="routing-tags" id="routing-tags">
                        </div>
                        <div class="form-hint">
                            Tickets with these tags will be routed to this agent.
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Ticket Types</label>
                        <div class="checkbox-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="ticketType" value="ai_to_human">
                                AI → Human
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" name="ticketType" value="human_to_ai">
                                Human → AI
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" name="ticketType" value="internal">
                                Internal
                            </label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Priority Boost</label>
                        <select id="routing-boost" name="priorityBoost">
                            <option value="-2">-2 (Significant penalty)</option>
                            <option value="-1">-1 (Minor penalty)</option>
                            <option value="0" selected>0 (No change)</option>
                            <option value="1">+1 (Minor boost)</option>
                            <option value="2">+2 (Significant boost)</option>
                        </select>
                        <div class="form-hint">
                            Adjust priority when routing conditions match.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Metadata section
     */
    private getMetadataSection(): string {
        return `
            <div class="section" id="section-metadata">
                <div class="section-header" data-section="metadata">
                    <h2 class="section-title">📋 Metadata</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content collapsed" id="content-metadata">
                    <div class="inline-row">
                        <div class="form-group">
                            <label class="form-label">Author</label>
                            <input type="text" id="meta-author" name="metadata.author"
                                placeholder="Your name"
                                maxlength="${CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH}">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Version</label>
                            <input type="text" id="meta-version" name="metadata.version"
                                placeholder="1.0.0" value="1.0.0"
                                pattern="^\\d+\\.\\d+\\.\\d+$">
                            <div class="form-hint">Semantic version (e.g., 1.0.0)</div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Tags</label>
                        <input type="text" id="meta-tag-input"
                            placeholder="Enter a tag and press Enter">
                        <div class="routing-tags" id="meta-tags">
                        </div>
                        <div class="form-hint">
                            Categorization tags for this agent (max ${CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX}).
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * JavaScript for webview interactivity
     */
    private getJavaScript(): string {
        return `
            (function() {
                const vscode = acquireVsCodeApi();

                // State
                let agent = null;
                let constraints = null;
                let variables = [];
                let reservedNames = [];
                let goals = [];
                let checklist = [];
                let customLists = [];
                let routingKeywords = [];
                let routingPatterns = [];
                let routingTags = [];
                let metaTags = [];
                let draggedIndex = null;
                let autocompleteSelectedIndex = -1;

                // DOM Elements
                const form = document.getElementById('agent-form');
                const validationBanner = document.getElementById('validation-banner');
                const validationMessage = document.getElementById('validation-message');

                // Initialize
                function init() {
                    setupEventListeners();
                    setupCharCounters();
                    setupSectionToggles();
                    setupDynamicLists();
                    setupRoutingInputs();
                    setupVariableHelper();
                    setupAutocomplete();
                    setupChecklistTemplates();
                }

                // Event Listeners
                function setupEventListeners() {
                    document.getElementById('btn-save').addEventListener('click', handleSave);
                    document.getElementById('btn-cancel').addEventListener('click', handleCancel);
                    document.getElementById('btn-validate').addEventListener('click', handleValidate);
                    
                    // Test modal listeners
                    const testBtn = document.getElementById('btn-test');
                    const testModal = document.getElementById('test-mode-modal');
                    const closeBtn = document.getElementById('close-test-modal');
                    const submitTestBtn = document.getElementById('submit-test-btn');
                    const backdrop = document.querySelector('.test-modal-backdrop');
                    
                    if (testBtn) {
                        testBtn.addEventListener('click', () => {
                            testModal.style.display = 'flex';
                            document.getElementById('test-query').focus();
                        });
                    }
                    
                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => {
                            testModal.style.display = 'none';
                        });
                    }
                    
                    if (backdrop) {
                        backdrop.addEventListener('click', () => {
                            testModal.style.display = 'none';
                        });
                    }
                    
                    if (submitTestBtn) {
                        submitTestBtn.addEventListener('click', () => {
                            handleTestAgent();
                        });
                    }
                    
                    const testQuery = document.getElementById('test-query');
                    if (testQuery) {
                        testQuery.addEventListener('keydown', (e) => {
                            if (e.ctrlKey && e.key === 'Enter') {
                                handleTestAgent();
                            }
                        });
                    }

                    // Templates modal listeners
                    const templatesBtn = document.getElementById('btn-templates');
                    const templatesModal = document.getElementById('templates-modal');
                    const closeTemplatesBtn = document.getElementById('close-templates-modal');
                    
                    if (templatesBtn) {
                        templatesBtn.addEventListener('click', () => {
                            populateTemplatesList();
                            templatesModal.style.display = 'flex';
                        });
                    }
                    
                    if (closeTemplatesBtn) {
                        closeTemplatesBtn.addEventListener('click', () => {
                            templatesModal.style.display = 'none';
                        });
                    }
                    
                    const templatesBackdrop = templatesModal?.querySelector('.test-modal-backdrop');
                    if (templatesBackdrop) {
                        templatesBackdrop.addEventListener('click', () => {
                            templatesModal.style.display = 'none';
                        });
                    }

                    // Field change listeners for real-time validation
                    const inputs = form.querySelectorAll('input, textarea, select');
                    inputs.forEach(input => {
                        input.addEventListener('change', () => {
                            validateForm();
                        });
                    });
                }

                // Character counters
                function setupCharCounters() {
                    const counters = [
                        { input: 'agent-name', counter: 'name-count', max: ${CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH} },
                        { input: 'agent-description', counter: 'description-count', max: ${CUSTOM_AGENT_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} },
                        { input: 'agent-prompt', counter: 'prompt-count', max: ${CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH} }
                    ];

                    counters.forEach(({ input, counter, max }) => {
                        const inputEl = document.getElementById(input);
                        const counterEl = document.getElementById(counter);
                        
                        const updateCounter = () => {
                            const len = inputEl.value.length;
                            counterEl.textContent = len + ' / ' + max;
                            counterEl.className = 'char-count';
                            if (len > max * 0.9) counterEl.classList.add('warning');
                            if (len >= max) counterEl.classList.add('error');
                        };

                        inputEl.addEventListener('input', updateCounter);
                        updateCounter();
                    });
                }

                // Section collapse/expand
                function setupSectionToggles() {
                    document.querySelectorAll('.section-header').forEach(header => {
                        header.addEventListener('click', () => {
                            const section = header.dataset.section;
                            const content = document.getElementById('content-' + section);
                            const toggle = header.querySelector('.section-toggle');
                            
                            content.classList.toggle('collapsed');
                            toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
                        });
                    });
                }

                // Dynamic lists (goals, checklist)
                function setupDynamicLists() {
                    document.getElementById('btn-add-goal').addEventListener('click', () => addGoal());
                    document.getElementById('btn-add-checklist').addEventListener('click', () => addChecklistItem());
                    document.getElementById('btn-add-customlist').addEventListener('click', () => addCustomList());
                }

                function renderGoals() {
                    const container = document.getElementById('goals-list');
                    const empty = document.getElementById('goals-empty');
                    
                    if (goals.length === 0) {
                        empty.style.display = 'block';
                        container.querySelectorAll('.dynamic-list-item').forEach(el => el.remove());
                        return;
                    }
                    
                    empty.style.display = 'none';
                    container.querySelectorAll('.dynamic-list-item').forEach(el => el.remove());
                    
                    goals.forEach((goal, index) => {
                        const item = document.createElement('div');
                        item.className = 'dynamic-list-item';
                        item.draggable = true;
                        item.dataset.index = index;
                        item.innerHTML = \`
                            <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
                            <span class="item-number">\${index + 1}.</span>
                            <input type="text" value="\${escapeHtml(goal)}" 
                                data-index="\${index}" 
                                maxlength="${CUSTOM_AGENT_CONSTRAINTS.GOAL_MAX_LENGTH}"
                                placeholder="Enter a goal...">
                            <button type="button" class="btn btn-danger btn-small" data-remove="goal" data-index="\${index}">×</button>
                        \`;
                        container.insertBefore(item, empty);
                        
                        // Drag listeners
                        item.addEventListener('dragstart', (e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/html', item.innerHTML);
                            item.classList.add('dragging');
                            draggedIndex = index;
                        });
                        
                        item.addEventListener('dragend', () => {
                            item.classList.remove('dragging');
                            document.querySelectorAll('.dynamic-list-item').forEach(el => el.classList.remove('drag-over'));
                        });
                        
                        item.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (index !== draggedIndex) {
                                item.classList.add('drag-over');
                            }
                        });
                        
                        item.addEventListener('dragleave', () => {
                            item.classList.remove('drag-over');
                        });
                        
                        item.addEventListener('drop', (e) => {
                            e.preventDefault();
                            if (draggedIndex !== index) {
                                const [movedGoal] = goals.splice(draggedIndex, 1);
                                goals.splice(index, 0, movedGoal);
                                renderGoals();
                                validateForm();
                            }
                            item.classList.remove('drag-over');
                        });
                        
                        // Input listener
                        item.querySelector('input').addEventListener('input', (e) => {
                            goals[index] = e.target.value;
                        });
                        
                        // Delete button
                        item.querySelector('button').addEventListener('click', () => removeGoal(index));
                    });
                    
                    // Update numbering
                    container.querySelectorAll('.item-number').forEach((el, i) => {
                        el.textContent = (i + 1) + '.';
                    });
                }

                function addGoal(value = '') {
                    if (goals.length >= ${CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX}) {
                        showValidation('Maximum ' + ${CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX} + ' goals allowed', 'error');
                        return;
                    }
                    goals.push(value);
                    renderGoals();
                    validateForm();
                }

                function removeGoal(index) {
                    goals.splice(index, 1);
                    renderGoals();
                    validateForm();
                }

                function renderChecklist() {
                    const container = document.getElementById('checklist-list');
                    const empty = document.getElementById('checklist-empty');
                    
                    if (checklist.length === 0) {
                        empty.style.display = 'block';
                        container.querySelectorAll('.dynamic-list-item').forEach(el => el.remove());
                        return;
                    }
                    
                    empty.style.display = 'none';
                    container.querySelectorAll('.dynamic-list-item').forEach(el => el.remove());
                    
                    checklist.forEach((item, index) => {
                        const el = document.createElement('div');
                        el.className = 'checklist-item';
                        el.innerHTML = \`
                            <input type="checkbox" class="checklist-checkbox" data-index="\${index}">
                            <div class="checklist-content">
                                <input type="text" class="checklist-text-input" value="\${escapeHtml(item)}" 
                                    data-index="\${index}"
                                    maxlength="${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_ITEM_MAX_LENGTH}"
                                    placeholder="Checklist item...">
                            </div>
                            <button type="button" class="btn btn-danger btn-small" data-index="\${index}">×</button>
                        \`;
                        container.appendChild(el);
                        
                        // Checkbox handler
                        el.querySelector('.checklist-checkbox').addEventListener('change', (e) => {
                            el.style.opacity = e.target.checked ? '0.6' : '1';
                        });
                        
                        // Text input handler
                        el.querySelector('.checklist-text-input').addEventListener('input', (e) => {
                            checklist[index] = e.target.value;
                        });
                        
                        // Delete button
                        el.querySelector('button').addEventListener('click', () => removeChecklistItem(index));
                    });
                }

                function addChecklistItem(value = '') {
                    if (checklist.length >= ${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX}) {
                        showValidation('Maximum ' + ${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX} + ' checklist items allowed', 'error');
                        return;
                    }
                    checklist.push(value);
                    renderChecklist();
                }

                function removeChecklistItem(index) {
                    checklist.splice(index, 1);
                    renderChecklist();
                    validateForm();
                }

                // Custom lists
                function renderCustomLists() {
                    const container = document.getElementById('custom-lists-container');
                    const empty = document.getElementById('customlists-empty');
                    
                    if (customLists.length === 0) {
                        empty.style.display = 'block';
                        container.querySelectorAll('.custom-list-container').forEach(el => el.remove());
                        return;
                    }
                    
                    empty.style.display = 'none';
                    container.querySelectorAll('.custom-list-container').forEach(el => el.remove());
                    
                    customLists.forEach((list, listIndex) => {
                        const el = document.createElement('div');
                        el.className = 'custom-list-container';
                        el.innerHTML = \`
                            <div class="custom-list-header">
                                <input type="text" value="\${escapeHtml(list.name)}" 
                                    placeholder="List name"
                                    style="width: 200px; margin-right: 8px;"
                                    data-list="\${listIndex}" data-field="name">
                                <button type="button" class="btn btn-danger btn-small" data-remove-list="\${listIndex}">Remove List</button>
                            </div>
                            <div class="custom-list-body">
                                <div class="form-group">
                                    <input type="text" value="\${escapeHtml(list.description || '')}"
                                        placeholder="Description (optional)"
                                        data-list="\${listIndex}" data-field="description">
                                </div>
                                <div class="dynamic-list" id="custom-list-items-\${listIndex}">
                                </div>
                                <div class="dynamic-list-actions">
                                    <button type="button" class="btn btn-secondary btn-small" data-add-item="\${listIndex}">+ Add Item</button>
                                </div>
                            </div>
                        \`;
                        container.insertBefore(el, empty);
                        
                        // List name/description change handlers
                        el.querySelectorAll('input[data-list]').forEach(input => {
                            input.addEventListener('input', (e) => {
                                const li = parseInt(e.target.dataset.list);
                                const field = e.target.dataset.field;
                                customLists[li][field] = e.target.value;
                            });
                        });
                        
                        // Remove list button
                        el.querySelector('[data-remove-list]').addEventListener('click', () => {
                            customLists.splice(listIndex, 1);
                            renderCustomLists();
                        });
                        
                        // Add item button
                        el.querySelector('[data-add-item]').addEventListener('click', () => {
                            if (customLists[listIndex].items.length >= ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MAX}) {
                                showValidation('Maximum ' + ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MAX} + ' items per list', 'error');
                                return;
                            }
                            customLists[listIndex].items.push('');
                            renderCustomListItems(listIndex);
                        });
                        
                        renderCustomListItems(listIndex);
                    });
                }

                function renderCustomListItems(listIndex) {
                    const container = document.getElementById('custom-list-items-' + listIndex);
                    container.innerHTML = '';
                    
                    const list = customLists[listIndex];
                    list.items.forEach((item, itemIndex) => {
                        const el = document.createElement('div');
                        el.className = 'dynamic-list-item';
                        el.innerHTML = \`
                            <span class="item-number">\${itemIndex + 1}.</span>
                            <input type="text" value="\${escapeHtml(item)}"
                                placeholder="List item..."
                                maxlength="${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEM_MAX_LENGTH}">
                            <button type="button" class="btn btn-danger btn-small">×</button>
                        \`;
                        container.appendChild(el);
                        
                        el.querySelector('input').addEventListener('input', (e) => {
                            customLists[listIndex].items[itemIndex] = e.target.value;
                        });
                        el.querySelector('button').addEventListener('click', () => {
                            customLists[listIndex].items.splice(itemIndex, 1);
                            renderCustomListItems(listIndex);
                        });
                    });
                    
                    if (list.items.length === 0) {
                        container.innerHTML = '<div class="empty-state">No items. Add at least 1 item.</div>';
                    }
                }

                function addCustomList() {
                    if (customLists.length >= ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX}) {
                        showValidation('Maximum ' + ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX} + ' custom lists allowed', 'error');
                        return;
                    }
                    customLists.push({
                        name: 'New List ' + (customLists.length + 1),
                        description: '',
                        items: [''],
                        order: customLists.length,
                        collapsed: false
                    });
                    renderCustomLists();
                }

                // Routing inputs
                function setupRoutingInputs() {
                    setupTagInput('routing-keyword-input', 'routing-keywords', routingKeywords);
                    setupTagInput('routing-pattern-input', 'routing-patterns', routingPatterns);
                    setupTagInput('routing-tag-input', 'routing-tags', routingTags);
                    setupTagInput('meta-tag-input', 'meta-tags', metaTags, ${CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX});
                }

                function setupTagInput(inputId, containerId, array, maxItems = 100) {
                    const input = document.getElementById(inputId);
                    const container = document.getElementById(containerId);
                    
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const value = input.value.trim();
                            if (value && !array.includes(value)) {
                                if (array.length >= maxItems) {
                                    showValidation('Maximum ' + maxItems + ' items allowed', 'error');
                                    return;
                                }
                                array.push(value);
                                renderTags(containerId, array);
                                input.value = '';
                            }
                        }
                    });
                }

                function renderTags(containerId, array) {
                    const container = document.getElementById(containerId);
                    container.innerHTML = '';
                    
                    array.forEach((tag, index) => {
                        const el = document.createElement('span');
                        el.className = 'routing-tag';
                        el.innerHTML = \`\${escapeHtml(tag)} <span class="remove" data-index="\${index}">×</span>\`;
                        container.appendChild(el);
                        
                        el.querySelector('.remove').addEventListener('click', () => {
                            array.splice(index, 1);
                            renderTags(containerId, array);
                        });
                    });
                }

                // Variable helper
                function setupVariableHelper() {
                    document.getElementById('variable-helper').addEventListener('click', (e) => {
                        if (e.target.classList.contains('variable-tag')) {
                            const variable = e.target.dataset.variable;
                            const prompt = document.getElementById('agent-prompt');
                            const start = prompt.selectionStart;
                            const end = prompt.selectionEnd;
                            const text = prompt.value;
                            const insertion = '{{' + variable + '}}';
                            
                            prompt.value = text.substring(0, start) + insertion + text.substring(end);
                            prompt.selectionStart = prompt.selectionEnd = start + insertion.length;
                            prompt.focus();
                            
                            // Trigger input event for char counter
                            prompt.dispatchEvent(new Event('input'));
                        }
                    });
                }

                // Autocomplete for system prompt (MT-030.4)
                function setupAutocomplete() {
                    const prompt = document.getElementById('agent-prompt');
                    const dropdown = document.getElementById('autocomplete-dropdown');
                    
                    prompt.addEventListener('input', () => {
                        const text = prompt.value;
                        const cursorPos = prompt.selectionStart;
                        const textBeforeCursor = text.substring(0, cursorPos);
                        
                        // Check if user is typing a variable
                        const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
                        if (lastOpenBrace === -1) {
                            dropdown.classList.remove('show');
                            return;
                        }
                        
                        const lastCloseBrace = textBeforeCursor.lastIndexOf('}}');
                        if (lastCloseBrace > lastOpenBrace) {
                            dropdown.classList.remove('show');
                            return;
                        }
                        
                        const partial = textBeforeCursor.substring(lastOpenBrace + 2).toLowerCase();
                        const matches = variables.filter(v => v.toLowerCase().includes(partial));
                        
                        if (matches.length === 0) {
                            dropdown.classList.remove('show');
                            return;
                        }
                        
                        // Render autocomplete dropdown
                        dropdown.innerHTML = '';
                        matches.forEach((variable, i) => {
                            const item = document.createElement('div');
                            item.className = 'autocomplete-item';
                            if (i === autocompleteSelectedIndex) {
                                item.classList.add('selected');
                            }
                            item.innerHTML = '{{' + variable + '}}';
                            item.addEventListener('click', () => insertVariable(variable, lastOpenBrace));
                            dropdown.appendChild(item);
                        });
                        
                        dropdown.classList.add('show');
                    });
                    
                    // Keyboard navigation for autocomplete
                    prompt.addEventListener('keydown', (e) => {
                        if (!dropdown.classList.contains('show')) return;
                        
                        const items = dropdown.querySelectorAll('.autocomplete-item');
                        if (items.length === 0) return;
                        
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % items.length;
                            updateAutocompleteSelection(items);
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            autocompleteSelectedIndex = (autocompleteSelectedIndex - 1 + items.length) % items.length;
                            updateAutocompleteSelection(items);
                        } else if (e.key === 'Enter' && autocompleteSelectedIndex >= 0) {
                            e.preventDefault();
                            const selectedItem = items[autocompleteSelectedIndex];
                            const variable = selectedItem.textContent.replace(/{{|}}/g, '');
                            const textBeforeCursor = prompt.value.substring(0, prompt.selectionStart);
                            const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
                            insertVariable(variable, lastOpenBrace);
                        } else if (e.key === 'Escape') {
                            dropdown.classList.remove('show');
                            autocompleteSelectedIndex = -1;
                        }
                    });
                }
                
                function updateAutocompleteSelection(items) {
                    items.forEach((item, i) => {
                        if (i === autocompleteSelectedIndex) {
                            item.classList.add('selected');
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                }
                
                function insertVariable(variable, openBracePos) {
                    const prompt = document.getElementById('agent-prompt');
                    const cursorPos = prompt.selectionStart;
                    const text = prompt.value;
                    const textBeforeBrace = text.substring(0, openBracePos);
                    const textAfterCursor = text.substring(cursorPos);
                    const insertion = '{{' + variable + '}}';
                    
                    prompt.value = textBeforeBrace + insertion + textAfterCursor;
                    prompt.selectionStart = prompt.selectionEnd = openBracePos + insertion.length;
                    prompt.focus();
                    prompt.dispatchEvent(new Event('input'));
                    
                    // Close dropdown
                    document.getElementById('autocomplete-dropdown').classList.remove('show');
                    autocompleteSelectedIndex = -1;
                }

                // Checklist template insertion (MT-030.6)
                function setupChecklistTemplates() {
                    const templates = document.getElementById('checklist-templates');
                    if (!templates) return;
                    
                    templates.addEventListener('click', (e) => {
                        if (e.target.classList.contains('template-tag')) {
                            const template = e.target.dataset.template;
                            addChecklistItem(template);
                        }
                    });
                }

                // Validation
                function validateForm() {
                    const config = buildAgentConfig();
                    vscode.postMessage({ type: 'validate', agentConfig: config });
                }

                function showValidation(message, type = 'warning') {
                    validationBanner.style.display = 'flex';
                    validationBanner.className = 'validation-banner ' + type;
                    validationMessage.textContent = message;
                    
                    if (type === 'success') {
                        setTimeout(() => {
                            validationBanner.style.display = 'none';
                        }, 3000);
                    }
                }

                function hideValidation() {
                    validationBanner.style.display = 'none';
                }

                // Build config from form
                function buildAgentConfig() {
                    const ticketTypes = Array.from(document.querySelectorAll('input[name="ticketType"]:checked'))
                        .map(cb => cb.value);
                    
                    return {
                        name: document.getElementById('agent-name').value,
                        description: document.getElementById('agent-description').value,
                        systemPrompt: document.getElementById('agent-prompt').value,
                        goals: goals.filter(g => g.trim() !== ''),
                        checklist: checklist.filter(c => c.trim() !== ''),
                        customLists: customLists.filter(l => l.name.trim() !== '' && l.items.some(i => i.trim() !== '')),
                        priority: document.getElementById('agent-priority').value,
                        isActive: document.getElementById('agent-active').checked,
                        timeoutSeconds: parseInt(document.getElementById('agent-timeout').value) || 60,
                        maxTokens: parseInt(document.getElementById('agent-tokens').value) || 2048,
                        temperature: parseFloat(document.getElementById('agent-temperature').value) || 0.7,
                        routing: {
                            keywords: routingKeywords,
                            patterns: routingPatterns,
                            tags: routingTags,
                            ticketTypes: ticketTypes,
                            priorityBoost: parseInt(document.getElementById('routing-boost').value) || 0
                        },
                        metadata: {
                            author: document.getElementById('meta-author').value || undefined,
                            version: document.getElementById('meta-version').value || '1.0.0',
                            tags: metaTags
                        }
                    };
                }

                // Load agent data into form
                function loadAgentToForm(agentData) {
                    agent = agentData;
                    
                    document.getElementById('agent-name').value = agentData.name || '';
                    document.getElementById('agent-description').value = agentData.description || '';
                    document.getElementById('agent-prompt').value = agentData.systemPrompt || '';
                    document.getElementById('agent-priority').value = agentData.priority || 'P2';
                    document.getElementById('agent-active').checked = agentData.isActive !== false;
                    document.getElementById('agent-timeout').value = agentData.timeoutSeconds || 60;
                    document.getElementById('agent-tokens').value = agentData.maxTokens || 2048;
                    document.getElementById('agent-temperature').value = agentData.temperature || 0.7;
                    
                    // Goals
                    goals = [...(agentData.goals || [])];
                    renderGoals();
                    
                    // Checklist
                    checklist = [...(agentData.checklist || [])];
                    renderChecklist();
                    
                    // Custom lists
                    customLists = JSON.parse(JSON.stringify(agentData.customLists || []));
                    renderCustomLists();
                    
                    // Routing
                    const routing = agentData.routing || {};
                    routingKeywords = [...(routing.keywords || [])];
                    routingPatterns = [...(routing.patterns || [])];
                    routingTags = [...(routing.tags || [])];
                    renderTags('routing-keywords', routingKeywords);
                    renderTags('routing-patterns', routingPatterns);
                    renderTags('routing-tags', routingTags);
                    
                    document.getElementById('routing-boost').value = routing.priorityBoost || 0;
                    
                    // Ticket types
                    (routing.ticketTypes || []).forEach(type => {
                        const cb = document.querySelector('input[name="ticketType"][value="' + type + '"]');
                        if (cb) cb.checked = true;
                    });
                    
                    // Metadata
                    const meta = agentData.metadata || {};
                    document.getElementById('meta-author').value = meta.author || '';
                    document.getElementById('meta-version').value = meta.version || '1.0.0';
                    metaTags = [...(meta.tags || [])];
                    renderTags('meta-tags', metaTags);
                    
                    // Update char counters
                    ['agent-name', 'agent-description', 'agent-prompt'].forEach(id => {
                        document.getElementById(id).dispatchEvent(new Event('input'));
                    });
                }

                // Actions
                function handleSave() {
                    const config = buildAgentConfig();
                    vscode.postMessage({ type: 'save', agentConfig: config });
                }

                function handleCancel() {
                    vscode.postMessage({ type: 'cancel' });
                }

                function handleValidate() {
                    validateForm();
                }
                
                function handleTestAgent() {
                    const query = document.getElementById('test-query').value.trim();
                    if (!query) {
                        showTestError('Please enter a query to test');
                        return;
                    }
                    
                    const config = buildAgentConfig();
                    showTestStatus(true);
                    hideTestError();
                    
                    vscode.postMessage({
                        type: 'testAgent',
                        query: query,
                        agentConfig: config
                    });
                }
                
                function showTestStatus(show) {
                    const statusEl = document.getElementById('test-status');
                    const outputEl = document.getElementById('test-output-section');
                    if (statusEl) statusEl.style.display = show ? 'flex' : 'none';
                    if (outputEl && !show) outputEl.style.display = 'none';
                }
                
                function hideTestError() {
                    const errorEl = document.getElementById('test-error-section');
                    if (errorEl) errorEl.style.display = 'none';
                }
                
                function showTestError(message) {
                    const errorSectionEl = document.getElementById('test-error-section');
                    const errorTextEl = document.getElementById('test-error-text');
                    if (errorSectionEl && errorTextEl) {
                        errorTextEl.textContent = message;
                        errorSectionEl.style.display = 'block';
                    }
                    showTestStatus(false);
                }

                // Templates functionality
                function populateTemplatesList() {
                    const listContainer = document.getElementById('templates-list');
                    
                    // Template data (would come from templates.ts in production)
                    const templates = [
                        {
                            id: 'research-assistant',
                            name: 'Research Assistant',
                            category: 'Beginner',
                            description: 'Information gathering and synthesis specialist',
                            author: 'COE Team',
                            version: '1.0.0',
                            systemPrompt: 'You are a research assistant specializing in gathering, analyzing, and synthesizing information. Your role is to conduct thorough research on given topics, find reliable sources, and present findings in a clear, organized manner.'
                        },
                        {
                            id: 'code-reviewer',
                            name: 'Code Reviewer',
                            category: 'Intermediate',
                            description: 'Code quality analysis and feedback provider',
                            author: 'COE Team',
                            version: '1.0.0',
                            systemPrompt: 'You are an expert code reviewer. Analyze provided code for quality, security, performance, and maintainability. Provide constructive feedback with specific examples and suggestions for improvement.'
                        },
                        {
                            id: 'doc-writer',
                            name: 'Documentation Writer',
                            category: 'Intermediate',
                            description: 'Technical documentation creator',
                            author: 'COE Team',
                            version: '1.0.0',
                            systemPrompt: 'You are a technical documentation specialist. Create clear, comprehensive, and user-friendly documentation. Focus on accuracy, clarity, and providing practical examples.'
                        },
                        {
                            id: 'test-generator',
                            name: 'Test Case Generator',
                            category: 'Advanced',
                            description: 'Comprehensive test scenario creator',
                            author: 'COE Team',
                            version: '1.0.0',
                            systemPrompt: 'You are a QA specialist expert in test case generation. Create comprehensive test scenarios covering normal cases, edge cases, and error conditions. Organize tests logically and ensure complete coverage.'
                        },
                        {
                            id: 'content-strategist',
                            name: 'Content Strategist',
                            category: 'Intermediate',
                            description: 'Content planning and structure expert',
                            author: 'COE Team',
                            version: '1.0.0',
                            systemPrompt: 'You are a content strategist. Help plan, structure, and create content that resonates with target audiences. Consider audience needs, engagement, and strategic goals.'
                        }
                    ];
                    
                    if (templates.length === 0) {
                        listContainer.innerHTML = '<span class="form-hint">No templates available</span>';
                        return;
                    }
                    
                    listContainer.innerHTML = templates.map((template, idx) => \`
                        <div class="template-card" data-id="\${template.id}">
                            <div class="template-header">
                                <div class="template-info">
                                    <h3 class="template-name">\${escapeHtml(template.name)}</h3>
                                    <span class="template-category">\${escapeHtml(template.category)}</span>
                                </div>
                                <button type="button" class="btn-use-template" data-id="\${template.id}">Use Template</button>
                            </div>
                            <p class="template-description">\${escapeHtml(template.description)}</p>
                            <div class="template-meta">
                                <span class="template-author">Author: \${escapeHtml(template.author)}</span>
                                <span class="template-version">v\${escapeHtml(template.version)}</span>
                            </div>
                        </div>
                    \`).join('');
                    
                    // Add click handlers for use-template buttons
                    listContainer.querySelectorAll('.btn-use-template').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const templateId = e.target.dataset.id;
                            const template = templates.find(t => t.id === templateId);
                            if (template) {
                                applyTemplate(template);
                            }
                        });
                    });
                }
                
                function applyTemplate(template) {
                    // Generate unique name based on template
                    const timestamp = Date.now().toString().slice(-4);
                    const baseName = template.name.replace(/\\s+/g, '');
                    const uniqueName = baseName + '_' + timestamp;
                    
                    // Apply template to form
                    document.getElementById('agent-name').value = uniqueName;
                    document.getElementById('agent-description').value = template.description;
                    document.getElementById('agent-prompt').value = template.systemPrompt;
                    
                    // Set category tag
                    const tagsInput = document.getElementById('agent-tags');
                    tagsInput.value = template.category.toLowerCase();
                    
                    // Clear existing goals and checklist
                    goals = [];
                    checklist = [];
                    
                    // Add template-specific goals
                    const templateGoals = [
                        'Deliver high-quality output',
                        'Follow best practices',
                        'Maintain clarity in communication',
                        'Provide actionable insights'
                    ];
                    goals = templateGoals;
                    
                    // Add template-specific checklist items
                    const templateChecklist = [
                        'Validate input data',
                        'Review output quality',
                        'Ensure consistency',
                        'Test edge cases',
                        'Document findings'
                    ];
                    checklist = templateChecklist;
                    
                    // Render updated content
                    renderGoals();
                    renderChecklist();
                    
                    // Trigger validation
                    validateForm();
                    
                    // Close templates modal
                    const templatesModal = document.getElementById('templates-modal');
                    if (templatesModal) {
                        templatesModal.style.display = 'none';
                    }
                    
                    // Show success message
                    showValidation(\`✓ Applied template: \${template.name}\`, 'success');
                }

                // Message handler from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'agentLoaded':
                            loadAgentToForm(message.agent);
                            break;
                            
                        case 'validationResult':
                            if (message.isValid) {
                                showValidation('✓ Configuration is valid', 'success');
                            } else {
                                const errors = message.errors || [];
                                if (errors.length > 0) {
                                    showValidation(errors[0].message, 'error');
                                }
                            }
                            break;
                            
                        case 'saveResult':
                            if (message.success) {
                                showValidation('✓ Agent saved successfully!', 'success');
                            } else {
                                showValidation(message.errorMessage || 'Failed to save', 'error');
                            }
                            break;
                            
                        case 'error':
                            showValidation(message.errorMessage || 'An error occurred', 'error');
                            break;
                            
                        case 'constraintsInfo':
                            constraints = message.constraints;
                            variables = message.variables || [];
                            reservedNames = message.reservedNames || [];
                            break;
                            
                        case 'testResult':
                            showTestStatus(false);
                            if (message.success) {
                                document.getElementById('test-response').textContent = message.response || 'No response';
                                document.getElementById('prompt-tokens').textContent = message.tokens?.prompt || 0;
                                document.getElementById('completion-tokens').textContent = message.tokens?.completion || 0;
                                const totalTokens = message.tokens?.total || 0;
                                document.getElementById('total-tokens').textContent = totalTokens;
                                document.getElementById('response-time').textContent = message.responseTime || 0;
                                
                                // Update context limit display
                                const maxTokens = parseInt(document.getElementById('agent-tokens')?.value || '2048');
                                const usagePercent = Math.round((totalTokens / maxTokens) * 100);
                                document.getElementById('context-max').textContent = maxTokens;
                                document.getElementById('context-used').textContent = totalTokens;
                                document.getElementById('context-percent').textContent = Math.min(usagePercent, 100) + '%';
                                
                                const contextFill = document.getElementById('context-fill');
                                contextFill.style.width = Math.min(usagePercent, 100) + '%';
                                contextFill.className = 'context-limit-fill';
                                if (usagePercent >= 90) contextFill.classList.add('critical');
                                else if (usagePercent >= 70) contextFill.classList.add('warning');
                                
                                document.getElementById('test-output-section').style.display = 'block';
                                hideTestError();
                            } else {
                                showTestError(message.errorMessage || 'Test failed');
                            }
                            break;
                            
                        case 'agentListUpdated':
                            // Could update a dropdown of existing agents
                            break;
                    }
                });

                // Utility
                function escapeHtml(str) {
                    if (!str) return '';
                    return str.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                }

                // Start
                init();
            })();
        `;
    }
}

// ============================================================================
// Section 3: Public API
// ============================================================================

/**
 * Open the custom agent builder (create mode)
 *
 * **Simple explanation**: Opens a blank form to create a new custom agent.
 */
export function openCustomAgentBuilder(
    context: vscode.ExtensionContext
): CustomAgentBuilderPanel {
    return CustomAgentBuilderPanel.createOrShow(context, { mode: 'create' });
}

/**
 * Open the custom agent builder to edit an existing agent
 *
 * **Simple explanation**: Opens the form pre-filled with an existing agent's config.
 */
export function openCustomAgentEditor(
    context: vscode.ExtensionContext,
    agentName: string
): CustomAgentBuilderPanel {
    return CustomAgentBuilderPanel.createOrShow(context, { mode: 'edit', agentName });
}

/**
 * Reset for tests
 */
export function resetCustomAgentBuilderForTests(): void {
    if (instance) {
        instance.dispose();
    }
    instance = null;
}
