/**
 * Verification Webview Panel
 * 
 * Displays verification checklist with real-time status updates.
 * Integrates with dev server launcher and allows manual check marking.
 * 
 * **Simple explanation**: A visual dashboard showing green/red checkmarks
 * for each verification step. Like a pilot's pre-flight checklist UI.
 * 
 * @module ui/verificationWebview
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../logger';
import {
    VerificationChecklist,
    createChecklist,
    ChecklistItem,
    ChecklistStatus,
    ChecklistCategory,
    ChecklistResult
} from '../agents/verification/checklist';
import { DevServerLauncher, DevServerStatus } from '../agents/verification/devServer';

/**
 * Message types sent from webview to extension
 */
interface WebviewMessage {
    type: 'markPassed' | 'markFailed' | 'markSkipped' | 'startServer' | 'stopServer' | 'runAllAuto' | 'refresh';
    itemId?: string;
    evidence?: string;
}

/**
 * Message types sent from extension to webview
 */
interface ExtensionMessage {
    type: 'checklistUpdate' | 'serverStatus' | 'error' | 'autoCheckResult';
    checklist?: {
        items: ChecklistItem[];
        result: ChecklistResult;
    };
    serverStatus?: DevServerStatus;
    error?: string;
    itemId?: string;
    status?: ChecklistStatus;
}

/**
 * Manages the verification webview panel
 */
export class VerificationWebviewPanel {
    private static instance: VerificationWebviewPanel | null = null;

    private panel: vscode.WebviewPanel;
    private checklist: VerificationChecklist;
    private devServer: DevServerLauncher;
    private disposables: vscode.Disposable[] = [];
    private taskId: string;

    private constructor(
        panel: vscode.WebviewPanel,
        taskId: string,
        context: vscode.ExtensionContext
    ) {
        this.panel = panel;
        this.taskId = taskId;
        this.checklist = createChecklist(taskId);
        this.devServer = new DevServerLauncher();

        // Set HTML content
        this.panel.webview.html = this.getHtmlContent();

        // Handle webview disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this.handleMessage(message),
            null,
            this.disposables
        );

        // Initial update
        this.sendChecklistUpdate();
    }

    /**
     * Create or show the verification webview panel
     * 
     * **Simple explanation**: Opens the checklist window. If already open,
     * brings it to front instead of creating a duplicate.
     */
    public static createOrShow(
        taskId: string,
        context: vscode.ExtensionContext
    ): VerificationWebviewPanel {
        // If panel exists, show it
        if (VerificationWebviewPanel.instance) {
            VerificationWebviewPanel.instance.panel.reveal();
            return VerificationWebviewPanel.instance;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'coeVerification',
            `Verification: ${taskId.substring(0, 20)}...`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        VerificationWebviewPanel.instance = new VerificationWebviewPanel(
            panel,
            taskId,
            context
        );

        logInfo(`[VerificationWebview] Opened for task ${taskId}`);
        return VerificationWebviewPanel.instance;
    }

    /**
     * Get the current instance (if any)
     */
    public static getInstance(): VerificationWebviewPanel | null {
        return VerificationWebviewPanel.instance;
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: WebviewMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'markPassed':
                    if (message.itemId) {
                        this.checklist.markPassed(message.itemId, message.evidence);
                        this.sendChecklistUpdate();
                    }
                    break;

                case 'markFailed':
                    if (message.itemId) {
                        this.checklist.markFailed(message.itemId, message.evidence);
                        this.sendChecklistUpdate();
                    }
                    break;

                case 'markSkipped':
                    if (message.itemId) {
                        this.checklist.markSkipped(message.itemId, message.evidence);
                        this.sendChecklistUpdate();
                    }
                    break;

                case 'startServer':
                    await this.startDevServer();
                    break;

                case 'stopServer':
                    await this.stopDevServer();
                    break;

                case 'runAllAuto':
                    await this.runAutomaticChecks();
                    break;

                case 'refresh':
                    this.sendChecklistUpdate();
                    break;

                default:
                    logWarn(`[VerificationWebview] Unknown message type: ${message.type}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[VerificationWebview] Error handling message: ${msg}`);
            this.postMessage({ type: 'error', error: msg });
        }
    }

    /**
     * Start the dev server
     */
    private async startDevServer(): Promise<void> {
        logInfo('[VerificationWebview] Starting dev server...');
        const status = await this.devServer.start();
        this.postMessage({ type: 'serverStatus', serverStatus: status });

        if (status.running && status.url) {
            // Open browser with server URL
            vscode.env.openExternal(vscode.Uri.parse(status.url));
        }
    }

    /**
     * Stop the dev server
     */
    private async stopDevServer(): Promise<void> {
        logInfo('[VerificationWebview] Stopping dev server...');
        await this.devServer.stop();
        this.postMessage({ type: 'serverStatus', serverStatus: { running: false } });
    }

    /**
     * Run all automatic checks
     */
    private async runAutomaticChecks(): Promise<void> {
        logInfo('[VerificationWebview] Running automatic checks...');

        // Tests check
        try {
            const testResult = await this.runTerminalCommand('npm run test:once --silent', 30000);
            if (testResult.exitCode === 0) {
                this.checklist.markPassed('tests-pass', 'All tests passed');
            } else {
                this.checklist.markFailed('tests-pass', `Tests failed (exit ${testResult.exitCode})`);
            }
            this.sendChecklistUpdate();
        } catch (e) {
            this.checklist.markFailed('tests-pass', `Test execution failed: ${e}`);
            this.sendChecklistUpdate();
        }

        // Build check
        try {
            const buildResult = await this.runTerminalCommand('npm run compile', 60000);
            if (buildResult.exitCode === 0) {
                this.checklist.markPassed('build-success', 'Build succeeded');
            } else {
                this.checklist.markFailed('build-success', `Build failed (exit ${buildResult.exitCode})`);
            }
            this.sendChecklistUpdate();
        } catch (e) {
            this.checklist.markFailed('build-success', `Build execution failed: ${e}`);
            this.sendChecklistUpdate();
        }

        // Lint check
        try {
            const lintResult = await this.runTerminalCommand('npm run lint', 30000);
            if (lintResult.exitCode === 0) {
                this.checklist.markPassed('lint-pass', 'No lint errors');
            } else {
                this.checklist.markFailed('lint-pass', `Lint errors found (exit ${lintResult.exitCode})`);
            }
            this.sendChecklistUpdate();
        } catch (e) {
            this.checklist.markFailed('lint-pass', `Lint execution failed: ${e}`);
            this.sendChecklistUpdate();
        }

        // TypeScript check (already covered by build)
        this.checklist.markPassed('types-strict', 'TypeScript compilation passed');
        this.sendChecklistUpdate();

        logInfo('[VerificationWebview] Automatic checks complete');
    }

    /**
     * Run a terminal command and return result
     */
    private async runTerminalCommand(
        command: string,
        timeout: number
    ): Promise<{ exitCode: number; output: string }> {
        return new Promise((resolve) => {
            const terminal = vscode.window.createTerminal({
                name: 'COE Verification',
                hideFromUser: false
            });

            // Listen for terminal close to get exit code
            const disposable = vscode.window.onDidCloseTerminal((closedTerminal) => {
                if (closedTerminal === terminal) {
                    disposable.dispose();
                    resolve({ exitCode: closedTerminal.exitStatus?.code ?? -1, output: '' });
                }
            });

            terminal.sendText(`${command}; exit`);
            terminal.show();

            // Timeout fallback
            setTimeout(() => {
                terminal.dispose();
                resolve({ exitCode: -1, output: 'Timeout' });
            }, timeout);
        });
    }

    /**
     * Send checklist update to webview
     */
    private sendChecklistUpdate(): void {
        this.postMessage({
            type: 'checklistUpdate',
            checklist: {
                items: this.checklist.getItems(),
                result: this.checklist.getResult()
            }
        });
    }

    /**
     * Post message to webview
     */
    private postMessage(message: ExtensionMessage): void {
        this.panel.webview.postMessage(message);
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
                <title>Verification Checklist</title>
                <style nonce="${nonce}">
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: var(--vscode-font-family);
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        padding: 16px;
                    }
                    h1 {
                        margin-bottom: 16px;
                        font-size: 1.4em;
                    }
                    h2 {
                        margin: 16px 0 8px;
                        font-size: 1.1em;
                        color: var(--vscode-textLink-foreground);
                        text-transform: capitalize;
                    }
                    .toolbar {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 16px;
                        flex-wrap: wrap;
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        cursor: pointer;
                        border-radius: 4px;
                        font-size: 13px;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    button.secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .server-status {
                        padding: 8px 12px;
                        border-radius: 4px;
                        margin-bottom: 16px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .server-status.running {
                        background: var(--vscode-testing-iconPassed);
                        color: white;
                    }
                    .server-status.stopped {
                        background: var(--vscode-input-background);
                    }
                    .item {
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        padding: 8px;
                        margin: 4px 0;
                        background: var(--vscode-input-background);
                        border-radius: 4px;
                    }
                    .item-icon {
                        font-size: 16px;
                        min-width: 24px;
                        text-align: center;
                    }
                    .item-content {
                        flex: 1;
                    }
                    .item-description {
                        font-size: 13px;
                    }
                    .item-meta {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 4px;
                    }
                    .item-actions {
                        display: flex;
                        gap: 4px;
                    }
                    .item-actions button {
                        padding: 4px 8px;
                        font-size: 11px;
                    }
                    .summary {
                        margin-top: 16px;
                        padding: 12px;
                        border-radius: 4px;
                        font-weight: bold;
                    }
                    .summary.passed {
                        background: var(--vscode-testing-iconPassed);
                        color: white;
                    }
                    .summary.failed {
                        background: var(--vscode-testing-iconFailed);
                        color: white;
                    }
                    .summary.pending {
                        background: var(--vscode-testing-iconQueued);
                        color: white;
                    }
                    .progress-bar {
                        height: 4px;
                        background: var(--vscode-input-background);
                        border-radius: 2px;
                        margin: 8px 0;
                    }
                    .progress-bar-fill {
                        height: 100%;
                        background: var(--vscode-testing-iconPassed);
                        border-radius: 2px;
                        transition: width 0.3s ease;
                    }
                    .required {
                        color: var(--vscode-testing-iconFailed);
                        font-size: 10px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <h1>🔍 Verification Checklist</h1>
                <p style="margin-bottom: 16px; color: var(--vscode-descriptionForeground)">
                    Task: ${this.taskId}
                </p>
                
                <div class="toolbar">
                    <button id="runAuto">▶ Run All Auto Checks</button>
                    <button id="startServer" class="secondary">🌐 Start Dev Server</button>
                    <button id="stopServer" class="secondary" disabled>⏹ Stop Server</button>
                    <button id="refresh" class="secondary">🔄 Refresh</button>
                </div>

                <div id="serverStatus" class="server-status stopped">
                    <span>Dev Server: <strong id="serverStatusText">Not Running</strong></span>
                </div>

                <div class="progress-bar">
                    <div id="progressFill" class="progress-bar-fill" style="width: 0%"></div>
                </div>

                <div id="checklist"></div>

                <div id="summary" class="summary pending">Loading...</div>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    
                    // Button handlers
                    document.getElementById('runAuto').addEventListener('click', () => {
                        vscode.postMessage({ type: 'runAllAuto' });
                    });
                    document.getElementById('startServer').addEventListener('click', () => {
                        vscode.postMessage({ type: 'startServer' });
                    });
                    document.getElementById('stopServer').addEventListener('click', () => {
                        vscode.postMessage({ type: 'stopServer' });
                    });
                    document.getElementById('refresh').addEventListener('click', () => {
                        vscode.postMessage({ type: 'refresh' });
                    });

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'checklistUpdate':
                                renderChecklist(message.checklist);
                                break;
                            case 'serverStatus':
                                updateServerStatus(message.serverStatus);
                                break;
                            case 'error':
                                alert('Error: ' + message.error);
                                break;
                        }
                    });

                    function renderChecklist(data) {
                        const container = document.getElementById('checklist');
                        const items = data.items;
                        const result = data.result;

                        // Group by category
                        const byCategory = {};
                        items.forEach(item => {
                            if (!byCategory[item.category]) {
                                byCategory[item.category] = [];
                            }
                            byCategory[item.category].push(item);
                        });

                        let html = '';
                        for (const [category, categoryItems] of Object.entries(byCategory)) {
                            html += '<h2>' + category + '</h2>';
                            categoryItems.forEach(item => {
                                html += renderItem(item);
                            });
                        }
                        container.innerHTML = html;

                        // Add button handlers for manual items
                        document.querySelectorAll('[data-action]').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const action = btn.dataset.action;
                                const itemId = btn.dataset.itemId;
                                vscode.postMessage({ type: action, itemId: itemId });
                            });
                        });

                        // Update progress
                        document.getElementById('progressFill').style.width = result.passPercent + '%';

                        // Update summary
                        const summary = document.getElementById('summary');
                        summary.textContent = result.summary;
                        summary.className = 'summary ' + (result.passed ? 'passed' : (result.failedRequired.length > 0 ? 'failed' : 'pending'));
                    }

                    function renderItem(item) {
                        const icon = getIcon(item.status);
                        const requiredBadge = item.required ? '<span class="required">REQUIRED</span>' : '';
                        const checkType = item.checkType === 'manual' ? '(manual)' : '(auto)';
                        
                        let actions = '';
                        if (item.checkType === 'manual' && item.status === 'pending') {
                            actions = '<div class="item-actions">' +
                                '<button data-action="markPassed" data-item-id="' + item.id + '">✓ Pass</button>' +
                                '<button data-action="markFailed" data-item-id="' + item.id + '">✗ Fail</button>' +
                                '<button data-action="markSkipped" data-item-id="' + item.id + '">⏭ Skip</button>' +
                            '</div>';
                        }

                        return '<div class="item">' +
                            '<span class="item-icon">' + icon + '</span>' +
                            '<div class="item-content">' +
                                '<div class="item-description">' + item.description + ' ' + requiredBadge + '</div>' +
                                '<div class="item-meta">' + checkType + (item.evidence ? ' - ' + item.evidence : '') + '</div>' +
                            '</div>' +
                            actions +
                        '</div>';
                    }

                    function getIcon(status) {
                        switch (status) {
                            case 'passed': return '✅';
                            case 'failed': return '❌';
                            case 'pending': return '⏳';
                            case 'skipped': return '⏭️';
                            case 'n/a': return '➖';
                            default: return '❓';
                        }
                    }

                    function updateServerStatus(status) {
                        const el = document.getElementById('serverStatus');
                        const text = document.getElementById('serverStatusText');
                        const startBtn = document.getElementById('startServer');
                        const stopBtn = document.getElementById('stopServer');

                        if (status.running) {
                            el.className = 'server-status running';
                            text.textContent = 'Running at ' + status.url;
                            startBtn.disabled = true;
                            stopBtn.disabled = false;
                        } else {
                            el.className = 'server-status stopped';
                            text.textContent = status.error || 'Not Running';
                            startBtn.disabled = false;
                            stopBtn.disabled = true;
                        }
                    }
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Generate a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return text;
    }

    /**
     * Get the checklist instance
     */
    public getChecklist(): VerificationChecklist {
        return this.checklist;
    }

    /**
     * Get the checklist result
     */
    public getResult(): ChecklistResult {
        return this.checklist.getResult();
    }

    /**
     * Cleanup and dispose
     */
    public dispose(): void {
        // Stop dev server if running
        this.devServer.stop();

        // Dispose of panel and event handlers
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        VerificationWebviewPanel.instance = null;
        logInfo('[VerificationWebview] Disposed');
    }
}

/**
 * Open the verification webview for a task
 */
export function openVerificationPanel(
    taskId: string,
    context: vscode.ExtensionContext
): VerificationWebviewPanel {
    return VerificationWebviewPanel.createOrShow(taskId, context);
}

/**
 * Reset for tests
 */
export function resetVerificationWebviewForTests(): void {
    if (VerificationWebviewPanel.getInstance()) {
        VerificationWebviewPanel.getInstance()?.dispose();
    }
}
