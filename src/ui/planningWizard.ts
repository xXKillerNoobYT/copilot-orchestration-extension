/**
 * Planning Wizard Webview Panel
 * Simple explanation: Manages the 7-page wizard dialog for creating project plans
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ExtensionContext, WebviewPanel, ViewColumn } from 'vscode';
import { CompletePlan, WizardState, WizardPage } from '../planning/types';
import { validatePartialPlan, validatePlan } from '../planning/schema';
import { getPlanningServiceInstance } from '../services/planningService';
import { generateWizardHTML } from './wizardHtml';
import { logInfo, logError, logWarn } from '../logger';

export class PlanningWizardPanel {
    public static currentPanel: PlanningWizardPanel | undefined;
    public readonly panel: WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private wizardState: WizardState;
    private context: ExtensionContext;

    public static createOrShow(context: ExtensionContext): void {
        if (PlanningWizardPanel.currentPanel) {
            PlanningWizardPanel.currentPanel.panel.reveal(ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'planningWizard',
            'Planning Wizard',
            ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        PlanningWizardPanel.currentPanel = new PlanningWizardPanel(panel, context);
    }

    private constructor(panel: WebviewPanel, context: ExtensionContext) {
        this.panel = panel;
        this.context = context;

        const now = new Date();
        this.wizardState = {
            currentPage: 'overview',
            plan: {
                metadata: {
                    id: crypto.randomUUID(),
                    name: 'New Plan',
                    createdAt: now,
                    updatedAt: now,
                    version: 1,
                },
                overview: { name: '', description: '', goals: [] },
                featureBlocks: [],
                blockLinks: [],
                conditionalLogic: [],
                userStories: [],
                developerStories: [],
                successCriteria: [],
            },
            isDirty: false,
        };

        this.update();
        this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg).catch(e => this.handleError(e)), undefined, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    private update(): void {
        try {
            const nonce = this.getNonce();
            const html = generateWizardHTML(this.wizardState, nonce);
            this.panel.webview.html = html;
        } catch (err) {
            logError('Wizard update failed: ' + String(err));
            this.panel.webview.html = '<p>Error loading wizard</p>';
        }
    }

    private getNonce(): string {
        let text = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += chars[Math.floor(Math.random() * chars.length)];
        }
        return text;
    }

    private async handleMessage(message: any): Promise<void> {
        const { command, pageIndex, planData } = message;
        switch (command) {
            case 'pageChanged': {
                const pages: WizardPage[] = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];
                this.wizardState.currentPage = pages[Math.max(0, Math.min(pageIndex, 6))];
                this.update();
                break;
            }
            case 'saveDraft':
                await this.saveDraft(planData);
                break;
            case 'finishPlan':
                await this.finishPlan(planData);
                break;
            case 'refreshPage':
                this.update();
                break;
        }
    }

    private async saveDraft(planData: Partial<CompletePlan>): Promise<void> {
        try {
            this.wizardState.plan = this.mergeDeep(this.wizardState.plan, planData);
            (this.wizardState.plan as any).metadata.updatedAt = new Date();

            const validation = validatePartialPlan(this.wizardState.plan);
            if (!validation.isValid) {
                this.sendMessage({ command: 'error', message: validation.errors.join('; ') });
                return;
            }
            this.sendMessage({ command: 'draftSaved' });
            logInfo('Draft saved');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.sendMessage({ command: 'error', message: 'Failed: ' + msg });
            logError('Draft save failed: ' + msg);
        }
    }

    private async finishPlan(planData: Partial<CompletePlan>): Promise<void> {
        try {
            const finalPlan = this.mergeDeep(this.wizardState.plan, planData);
            const validation = validatePlan(finalPlan);
            if (!validation.isValid) {
                this.sendMessage({ command: 'error', message: validation.errors.join('; ') });
                return;
            }

            const service = getPlanningServiceInstance();
            const created = await service.createPlan(finalPlan as CompletePlan);

            this.sendMessage({ command: 'planCompleted', planId: created.metadata.id });
            vscode.window.showInformationMessage(' Plan created!');
            logInfo('Plan created: ' + created.metadata.id);

            setTimeout(() => this.dispose(), 1500);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.sendMessage({ command: 'error', message: 'Failed: ' + msg });
            logError('Plan creation failed: ' + msg);
        }
    }

    private mergeDeep(target: any, source: any): any {
        const result = { ...target };
        for (const key in source) {
            if (source[key] === null || source[key] === undefined) continue;
            if (typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof result[key] === 'object' && !Array.isArray(result[key])) {
                result[key] = this.mergeDeep(result[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    private sendMessage(message: any): void {
        this.panel.webview.postMessage(message);
    }

    private handleError(err: unknown): void {
        const msg = err instanceof Error ? err.message : String(err);
        logError('Wizard error: ' + msg);
        this.sendMessage({ command: 'error', message: msg });
    }

    public dispose(): void {
        PlanningWizardPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}