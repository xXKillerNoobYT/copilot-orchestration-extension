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
    | 'insertVariable';
    agentConfig?: Partial<CustomAgent>;
    agentName?: string;
    templateName?: string;
    fieldName?: string;
    fieldValue?: unknown;
    index?: number;
    listIndex?: number;
    itemIndex?: number;
    variable?: string;
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
    | 'constraintsInfo';
    agent?: CustomAgent;
    isValid?: boolean;
    errors?: Array<{ path: string; message: string }>;
    success?: boolean;
    errorMessage?: string;
    agents?: string[];
    constraints?: typeof CUSTOM_AGENT_CONSTRAINTS;
    variables?: readonly string[];
    reservedNames?: readonly string[];
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
                            <button id="btn-validate" class="btn btn-secondary">Validate</button>
                            <button id="btn-save" class="btn btn-primary">Save Agent</button>
                            <button id="btn-cancel" class="btn btn-danger">Cancel</button>
                        </div>
                    </header>

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
                        ${this.getSettingsSection()}
                        ${this.getRoutingSection()}
                        ${this.getMetadataSection()}
                    </form>
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
     * System prompt section with variable helpers
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
                        <textarea id="agent-prompt" name="systemPrompt" class="large"
                            placeholder="You are a helpful research assistant. Your task is to..."></textarea>
                        <div class="form-hint">
                            The instructions given to the LLM. Use {{variables}} for dynamic content.
                        </div>
                        <div class="char-count" id="prompt-count">
                            0 / ${CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH}
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Insert Variable</label>
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
     * Goals section with dynamic list
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
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Checklist section with dynamic list
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
                }

                // Event Listeners
                function setupEventListeners() {
                    document.getElementById('btn-save').addEventListener('click', handleSave);
                    document.getElementById('btn-cancel').addEventListener('click', handleCancel);
                    document.getElementById('btn-validate').addEventListener('click', handleValidate);

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
                        item.innerHTML = \`
                            <span class="item-number">\${index + 1}.</span>
                            <input type="text" value="\${escapeHtml(goal)}" 
                                data-index="\${index}" 
                                maxlength="${CUSTOM_AGENT_CONSTRAINTS.GOAL_MAX_LENGTH}"
                                placeholder="Enter a goal...">
                            <button type="button" class="btn btn-danger btn-small" data-remove="goal" data-index="\${index}">×</button>
                        \`;
                        container.insertBefore(item, empty);
                        
                        item.querySelector('input').addEventListener('input', (e) => {
                            goals[index] = e.target.value;
                        });
                        item.querySelector('button').addEventListener('click', () => removeGoal(index));
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
                        el.className = 'dynamic-list-item';
                        el.innerHTML = \`
                            <span class="item-number">☐</span>
                            <input type="text" value="\${escapeHtml(item)}" 
                                data-index="\${index}"
                                maxlength="${CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_ITEM_MAX_LENGTH}"
                                placeholder="Checklist item...">
                            <button type="button" class="btn btn-danger btn-small" data-index="\${index}">×</button>
                        \`;
                        container.insertBefore(el, empty);
                        
                        el.querySelector('input').addEventListener('input', (e) => {
                            checklist[index] = e.target.value;
                        });
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
